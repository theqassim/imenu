-- Customer accounts for the per-restaurant customer app. Run once in the Supabase SQL editor.
-- Private tables: RLS on, no policies; the server uses the service-role key.
CREATE TABLE IF NOT EXISTS public.imenu_customers (
  _id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  password text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.imenu_customer_addresses (
  _id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer uuid NOT NULL REFERENCES public.imenu_customers(_id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'المنزل',
  address text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS "customerId" uuid;
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders ("customerId");
ALTER TABLE public.imenu_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imenu_customer_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.imenu_customers, public.imenu_customer_addresses FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
