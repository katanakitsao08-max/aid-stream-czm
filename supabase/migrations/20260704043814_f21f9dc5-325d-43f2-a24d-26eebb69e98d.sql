
CREATE OR REPLACE FUNCTION public.case_roster(_case_id uuid)
RETURNS TABLE(user_id uuid, full_name text, membership_number text, status text, payment_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH people AS (
    SELECT p.user_id, p.full_name, p.membership_number FROM public.profiles p
    UNION
    SELECT c.contributor_id,
           COALESCE(
             (SELECT pr.full_name FROM public.profiles pr WHERE pr.user_id = c.contributor_id),
             (SELECT COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))
                FROM auth.users u WHERE u.id = c.contributor_id),
             '(unknown member)'
           ),
           (SELECT pr.membership_number FROM public.profiles pr WHERE pr.user_id = c.contributor_id)
    FROM public.contributions c
    WHERE c.event_id = _case_id
  ),
  resolved AS (
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
          LIMIT 1), 'not_paid') AS status,
      (SELECT c.payment_date FROM public.contributions c
         WHERE c.event_id = _case_id AND c.contributor_id = people.user_id
           AND c.status IN ('approved','pending','verification_requested')
         ORDER BY CASE WHEN c.status='approved' THEN 0 ELSE 1 END, c.created_at DESC
         LIMIT 1) AS payment_date
    FROM people
  )
  SELECT user_id, full_name, membership_number, status, payment_date FROM resolved
  ORDER BY (status='approved') DESC, full_name;
$$;
