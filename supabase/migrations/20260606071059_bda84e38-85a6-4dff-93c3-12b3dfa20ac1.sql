
-- De-dup existing phones (keep oldest profile per phone, null the rest)
WITH dups AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.profiles
  WHERE phone IS NOT NULL AND length(btrim(phone)) > 0
)
UPDATE public.profiles p SET phone = NULL
FROM dups WHERE p.id = dups.id AND dups.rn > 1;

WITH dups AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC, id ASC) AS rn
  FROM public.staged_teachers
  WHERE phone IS NOT NULL AND length(btrim(phone)) > 0
)
UPDATE public.staged_teachers s SET phone = NULL
FROM dups WHERE s.id = dups.id AND dups.rn > 1;

-- Sequence + generator for membership numbers
CREATE SEQUENCE IF NOT EXISTS public.membership_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_membership_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'CZMT-' || lpad(nextval('public.membership_number_seq')::text, 4, '0')
$$;

-- Extend staged_teachers
ALTER TABLE public.staged_teachers
  ADD COLUMN IF NOT EXISTS membership_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS spouse_name text,
  ADD COLUMN IF NOT EXISTS children text,
  ADD COLUMN IF NOT EXISTS parents text,
  ADD COLUMN IF NOT EXISTS next_of_kin text,
  ADD COLUMN IF NOT EXISTS next_of_kin_contact text,
  ADD COLUMN IF NOT EXISTS home_county text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS form_timestamp timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS staged_teachers_phone_unique
  ON public.staged_teachers (phone)
  WHERE phone IS NOT NULL AND length(btrim(phone)) > 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_number text UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND length(btrim(phone)) > 0;

CREATE OR REPLACE FUNCTION public.assign_membership_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.membership_number IS NULL OR length(btrim(NEW.membership_number)) = 0 THEN
    NEW.membership_number := public.next_membership_number();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS staged_teachers_assign_membership ON public.staged_teachers;
CREATE TRIGGER staged_teachers_assign_membership BEFORE INSERT ON public.staged_teachers
  FOR EACH ROW EXECUTE FUNCTION public.assign_membership_number();

DROP TRIGGER IF EXISTS profiles_assign_membership ON public.profiles;
CREATE TRIGGER profiles_assign_membership BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_membership_number();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE staged_membership text;
BEGIN
  SELECT membership_number INTO staged_membership
  FROM public.staged_teachers
  WHERE lower(email) = lower(NEW.email) LIMIT 1;

  INSERT INTO public.profiles (user_id, full_name, phone, staff_number, school, membership_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'staff_number',
    NEW.raw_user_meta_data->>'school',
    staged_membership
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

UPDATE public.staged_teachers SET membership_number = public.next_membership_number()
  WHERE membership_number IS NULL;
UPDATE public.profiles SET membership_number = public.next_membership_number()
  WHERE membership_number IS NULL;
