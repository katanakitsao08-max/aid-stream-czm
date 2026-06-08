DROP POLICY IF EXISTS staged_self_claim ON public.staged_teachers;

CREATE POLICY staged_self_claim ON public.staged_teachers
FOR UPDATE TO authenticated
USING (
  claimed_by IS NULL AND (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR phone IN (
      SELECT p.phone FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.phone IS NOT NULL
    )
    OR regexp_replace(coalesce(phone,''), '\D', '', 'g') IN (
      SELECT regexp_replace(p.phone, '\D', '', 'g') FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.phone IS NOT NULL
    )
  )
)
WITH CHECK (
  claimed_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);