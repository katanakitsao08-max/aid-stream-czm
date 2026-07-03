
-- Extend welfare_events (welfare cases)
ALTER TABLE public.welfare_events
  ADD COLUMN IF NOT EXISTS contribution_per_member numeric,
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS beneficiary_name text;

-- Backfill status open -> active
UPDATE public.welfare_events SET status = 'active' WHERE status = 'open';

-- Extend contributions
ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS member_comment text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Backfill confirmed -> approved
UPDATE public.contributions SET status = 'approved' WHERE status = 'confirmed';

-- Unique: prevent duplicate active contributions per member per case
CREATE UNIQUE INDEX IF NOT EXISTS contributions_active_unique
  ON public.contributions (event_id, contributor_id)
  WHERE status IN ('pending','approved','verification_requested');

-- Update event_totals to sum approved
CREATE OR REPLACE FUNCTION public.event_totals(event_ids uuid[] DEFAULT NULL)
RETURNS TABLE(event_id uuid, collected numeric, contributor_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.event_id,
         COALESCE(SUM(c.amount),0)::numeric,
         COUNT(DISTINCT c.contributor_id)::integer
  FROM public.contributions c
  WHERE c.status = 'approved'
    AND (event_ids IS NULL OR c.event_id = ANY(event_ids))
  GROUP BY c.event_id;
$$;

-- welfare_payouts
CREATE TABLE IF NOT EXISTS public.welfare_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.welfare_events(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_to text NOT NULL,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  reference text,
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welfare_payouts TO authenticated;
GRANT ALL ON public.welfare_payouts TO service_role;
ALTER TABLE public.welfare_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_read_all_authenticated" ON public.welfare_payouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "payouts_admin_write" ON public.welfare_payouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  case_id uuid REFERENCES public.welfare_events(id) ON DELETE CASCADE,
  contribution_id uuid REFERENCES public.contributions(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON public.notifications(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_own_select" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Case visibility: allow all authenticated to view non-draft cases
DROP POLICY IF EXISTS "events_read_all" ON public.welfare_events;
DROP POLICY IF EXISTS "events_admin_write" ON public.welfare_events;
CREATE POLICY "cases_read_visible" ON public.welfare_events FOR SELECT TO authenticated
  USING (status <> 'draft' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "cases_admin_write" ON public.welfare_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Contributions: refresh policies for treasurer/admin visibility
DROP POLICY IF EXISTS "contrib_self_read" ON public.contributions;
DROP POLICY IF EXISTS "contrib_admin_all" ON public.contributions;
DROP POLICY IF EXISTS "contrib_self_insert" ON public.contributions;
CREATE POLICY "contrib_own_select" ON public.contributions FOR SELECT TO authenticated
  USING (contributor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'treasurer'));
CREATE POLICY "contrib_own_insert" ON public.contributions FOR INSERT TO authenticated
  WITH CHECK (contributor_id = auth.uid());
CREATE POLICY "contrib_reviewer_update" ON public.contributions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'treasurer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'treasurer'));
CREATE POLICY "contrib_admin_delete" ON public.contributions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Public case roster RPC: name + status per member, no amounts
CREATE OR REPLACE FUNCTION public.case_roster(_case_id uuid)
RETURNS TABLE(user_id uuid, full_name text, membership_number text, status text, payment_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id,
         p.full_name,
         p.membership_number,
         COALESCE(
           (SELECT c.status::text FROM public.contributions c
             WHERE c.event_id = _case_id AND c.contributor_id = p.user_id
             ORDER BY CASE c.status WHEN 'approved' THEN 1 WHEN 'pending' THEN 2 WHEN 'verification_requested' THEN 3 WHEN 'rejected' THEN 4 ELSE 5 END
             LIMIT 1),
           'not_paid'
         ) AS status,
         (SELECT c.payment_date FROM public.contributions c
            WHERE c.event_id = _case_id AND c.contributor_id = p.user_id
              AND c.status IN ('approved','pending','verification_requested')
            ORDER BY c.created_at DESC LIMIT 1) AS payment_date
  FROM public.profiles p
  ORDER BY p.full_name;
$$;

-- Dashboard stats RPC
CREATE OR REPLACE FUNCTION public.dashboard_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_members', (SELECT count(*) FROM public.profiles),
    'active_cases', (SELECT count(*) FROM public.welfare_events WHERE status='active'),
    'open_cases', (SELECT count(*) FROM public.welfare_events WHERE status IN ('active','open')),
    'closed_cases', (SELECT count(*) FROM public.welfare_events WHERE status IN ('closed','completed')),
    'pending_approvals', (SELECT count(*) FROM public.contributions WHERE status='pending'),
    'total_approved', (SELECT COALESCE(SUM(amount),0) FROM public.contributions WHERE status='approved'),
    'total_payouts', (SELECT COALESCE(SUM(amount),0) FROM public.welfare_payouts),
    'available_balance', (
      (SELECT COALESCE(SUM(amount),0) FROM public.contributions WHERE status='approved')
      - (SELECT COALESCE(SUM(amount),0) FROM public.welfare_payouts)
    )
  );
$$;
