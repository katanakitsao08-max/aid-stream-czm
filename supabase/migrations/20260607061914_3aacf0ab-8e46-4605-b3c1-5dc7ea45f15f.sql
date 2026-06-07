
DROP POLICY IF EXISTS staged_self_claim ON public.staged_teachers;

CREATE POLICY staged_self_claim ON public.staged_teachers
FOR UPDATE TO authenticated
USING (
  claimed_by IS NULL
  AND (
    lower(email) = lower((SELECT users.email FROM auth.users WHERE users.id = auth.uid())::text)
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
  claimed_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
);

-- Also update handle_new_user trigger to match staged record by phone when email doesn't match
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  staged_membership text;
  v_phone text := NEW.raw_user_meta_data->>'phone';
  v_phone_digits text := regexp_replace(coalesce(v_phone,''), '\D', '', 'g');
BEGIN
  SELECT membership_number INTO staged_membership
  FROM public.staged_teachers
  WHERE lower(email) = lower(NEW.email)
     OR (v_phone_digits <> '' AND regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_phone_digits)
  LIMIT 1;

  INSERT INTO public.profiles (user_id, full_name, phone, staff_number, school, membership_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_phone,
    NEW.raw_user_meta_data->>'staff_number',
    NEW.raw_user_meta_data->>'school',
    staged_membership
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $function$;
