-- Add committee role to existing enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'committee';

-- Allow admins to manage user_roles (insert/update/delete). Existing SELECT policy stays.
CREATE POLICY roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to grant/revoke their own roles too (covered by above; nothing extra needed).
