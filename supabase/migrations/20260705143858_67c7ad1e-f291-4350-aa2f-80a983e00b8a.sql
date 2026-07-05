
CREATE TABLE public.pesapal_ipns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL,
  url text NOT NULL,
  ipn_id text NOT NULL,
  notification_type text NOT NULL DEFAULT 'GET',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, url)
);
GRANT SELECT ON public.pesapal_ipns TO authenticated;
GRANT ALL ON public.pesapal_ipns TO service_role;
ALTER TABLE public.pesapal_ipns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviewers read ipns" ON public.pesapal_ipns FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'treasurer'));

CREATE TABLE public.pesapal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_reference text NOT NULL UNIQUE,
  order_tracking_id text UNIQUE,
  environment text NOT NULL,
  case_id uuid REFERENCES public.welfare_events(id) ON DELETE SET NULL,
  contributor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contribution_id uuid REFERENCES public.contributions(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'INITIATED',
  status_code int,
  payment_method text,
  confirmation_code text,
  redirect_url text,
  raw_status jsonb,
  raw_submit jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pesapal_transactions TO authenticated;
GRANT ALL ON public.pesapal_transactions TO service_role;
ALTER TABLE public.pesapal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member reads own pesapal tx" ON public.pesapal_transactions FOR SELECT TO authenticated
  USING (contributor_id = auth.uid()
     OR public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'treasurer'));

CREATE TRIGGER pesapal_tx_touch BEFORE UPDATE ON public.pesapal_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX pesapal_tx_case_idx ON public.pesapal_transactions(case_id);
CREATE INDEX pesapal_tx_contributor_idx ON public.pesapal_transactions(contributor_id);
