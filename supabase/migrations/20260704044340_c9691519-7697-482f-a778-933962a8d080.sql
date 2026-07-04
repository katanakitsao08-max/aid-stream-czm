CREATE OR REPLACE FUNCTION public.case_roster(_case_id uuid)
RETURNS TABLE(user_id uuid, full_name text, membership_number text, status text, payment_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH people AS (
    SELECT DISTINCT
      p.id AS profile_id,
      COALESCE(NULLIF(btrim(p.full_name), ''), '(unnamed member)') AS full_name,
      p.membership_number
    FROM public.profiles p

    UNION

    SELECT DISTINCT
      c.contributor_id AS profile_id,
      COALESCE(NULLIF(btrim(p.full_name), ''), '(unnamed member)') AS full_name,
      p.membership_number
    FROM public.contributions c
    LEFT JOIN public.profiles p ON p.id = c.contributor_id
    WHERE c.event_id = _case_id
  ),
  resolved AS (
    SELECT
      people.profile_id,
      people.full_name,
      people.membership_number,
      COALESCE(
        (
          SELECT c.status::text
          FROM public.contributions c
          WHERE c.event_id = _case_id
            AND c.contributor_id = people.profile_id
          ORDER BY CASE c.status
                     WHEN 'approved' THEN 1
                     WHEN 'confirmed' THEN 1
                     WHEN 'pending' THEN 2
                     WHEN 'verification_requested' THEN 3
                     WHEN 'rejected' THEN 4
                     ELSE 5
                   END,
                   c.created_at DESC
          LIMIT 1
        ),
        'not_paid'
      ) AS contribution_status,
      (
        SELECT COALESCE(c.payment_date, c.paid_at)
        FROM public.contributions c
        WHERE c.event_id = _case_id
          AND c.contributor_id = people.profile_id
          AND c.status IN ('approved', 'confirmed', 'pending', 'verification_requested')
        ORDER BY CASE WHEN c.status IN ('approved', 'confirmed') THEN 0 ELSE 1 END,
                 c.created_at DESC
        LIMIT 1
      ) AS contribution_payment_date
    FROM people
  )
  SELECT
    profile_id AS user_id,
    full_name,
    membership_number,
    contribution_status AS status,
    contribution_payment_date AS payment_date
  FROM resolved
  ORDER BY (contribution_status IN ('approved', 'confirmed')) DESC,
           full_name;
$function$;