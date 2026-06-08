CREATE OR REPLACE FUNCTION public.event_totals(event_ids uuid[] DEFAULT NULL)
RETURNS TABLE (event_id uuid, collected numeric, contributor_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.event_id,
    COALESCE(SUM(c.amount), 0)::numeric AS collected,
    COUNT(DISTINCT c.contributor_id)::integer AS contributor_count
  FROM public.contributions c
  WHERE c.status = 'confirmed'
    AND (event_ids IS NULL OR c.event_id = ANY(event_ids))
  GROUP BY c.event_id;
$$;

REVOKE ALL ON FUNCTION public.event_totals(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_totals(uuid[]) TO authenticated;