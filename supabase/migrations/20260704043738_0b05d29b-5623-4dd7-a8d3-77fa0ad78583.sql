
WITH missing AS (
  SELECT u.id AS user_id,
         COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'Member') AS full_name,
         NULLIF(u.raw_user_meta_data->>'phone','') AS phone
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE p.user_id IS NULL
),
deduped AS (
  SELECT user_id, full_name,
         CASE
           WHEN phone IS NULL THEN NULL
           WHEN EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.phone = missing.phone) THEN NULL
           WHEN row_number() OVER (PARTITION BY phone ORDER BY user_id) > 1 THEN NULL
           ELSE phone
         END AS phone
  FROM missing
)
INSERT INTO public.profiles (user_id, full_name, phone)
SELECT user_id, full_name, phone FROM deduped
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.case_roster(_case_id uuid)
RETURNS TABLE(user_id uuid, full_name text, membership_number text, status text, payment_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH people AS (
    SELECT p.user_id, p.full_name, p.membership_number FROM public.profiles p
    UNION
    SELECT c.contributor_id,
           COALESCE(
             (SELECT pr.full_name FROM public.profiles pr WHERE pr.user_id = c.contributor_id),
             (SELECT COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1), 'Member')
                FROM auth.users u WHERE u.id = c.contributor_id)
           ),
           (SELECT pr.membership_number FROM public.profiles pr WHERE pr.user_id = c.contributor_id)
    FROM public.contributions c
    WHERE c.event_id = _case_id
  )
  SELECT people.user_id, people.full_name, people.membership_number,
         COALESCE(
           (SELECT c.status::text FROM public.contributions c
             WHERE c.event_id = _case_id AND c.contributor_id = people.user_id
             ORDER BY CASE c.status
                        WHEN 'approved' THEN 1
                        WHEN 'pending' THEN 2
                        WHEN 'verification_requested' THEN 3
                        WHEN 'rejected' THEN 4
                        ELSE 5 END
             LIMIT 1),
           'not_paid'
         ),
         (SELECT c.payment_date FROM public.contributions c
            WHERE c.event_id = _case_id AND c.contributor_id = people.user_id
              AND c.status IN ('approved','pending','verification_requested')
            ORDER BY CASE WHEN c.status='approved' THEN 0 ELSE 1 END, c.created_at DESC
            LIMIT 1)
  FROM people
  ORDER BY full_name;
$$;
