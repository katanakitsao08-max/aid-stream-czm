-- 1. Promote first admin by email (no-op if user not yet signed up)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'katanakitsao08@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Contributions: add mpesa_code + status
DO $$ BEGIN
  CREATE TYPE public.contribution_status AS ENUM ('pending', 'confirmed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contributions
  ADD COLUMN IF NOT EXISTS mpesa_code text,
  ADD COLUMN IF NOT EXISTS status public.contribution_status NOT NULL DEFAULT 'confirmed';

-- Allow members to submit their OWN pending contributions; admin policy already covers all ops
CREATE POLICY con_member_insert_pending ON public.contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND contributor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 3. Staged teachers roster (admin-uploaded)
CREATE TABLE public.staged_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  staff_number text,
  school text,
  phone text,
  email text NOT NULL,
  claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX staged_teachers_email_idx ON public.staged_teachers (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staged_teachers TO authenticated;
GRANT ALL ON public.staged_teachers TO service_role;

ALTER TABLE public.staged_teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY staged_select_auth ON public.staged_teachers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY staged_admin_write ON public.staged_teachers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow a teacher to mark their own match as claimed (update only claimed_by/claimed_at)
CREATE POLICY staged_self_claim ON public.staged_teachers
  FOR UPDATE TO authenticated
  USING (
    claimed_by IS NULL
    AND lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
  WITH CHECK (
    claimed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );
