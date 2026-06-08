-- profiles: self or admin
DROP POLICY IF EXISTS profiles_select_auth ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- contributions: own contributions (via profile) or admin
DROP POLICY IF EXISTS con_select_auth ON public.contributions;
CREATE POLICY con_select_own_or_admin ON public.contributions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR contributor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- dependants: owner (via profile) or admin
DROP POLICY IF EXISTS dep_select_auth ON public.dependants;
CREATE POLICY dep_select_own_or_admin ON public.dependants
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR member_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);