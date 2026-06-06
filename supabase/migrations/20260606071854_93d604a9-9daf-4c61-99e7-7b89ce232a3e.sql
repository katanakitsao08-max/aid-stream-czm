-- Deduplicate any existing rows by email (keep oldest)
DELETE FROM public.staged_teachers a
USING public.staged_teachers b
WHERE a.ctid <> b.ctid
  AND lower(a.email) = lower(b.email)
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS staged_teachers_email_key
  ON public.staged_teachers (lower(email));

-- Also expose a plain unique constraint usable by ON CONFLICT (email)
ALTER TABLE public.staged_teachers
  DROP CONSTRAINT IF EXISTS staged_teachers_email_unique;
ALTER TABLE public.staged_teachers
  ADD CONSTRAINT staged_teachers_email_unique UNIQUE (email);
