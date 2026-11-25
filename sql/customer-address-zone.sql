-- Delivery zone saved with a customer address. Additive. Run once in the Supabase SQL editor.
ALTER TABLE public.imenu_customer_addresses ADD COLUMN IF NOT EXISTS zone_name text;
NOTIFY pgrst, 'reload schema';
