-- Live orders storage (online QR menu -> offline POS). Run once in the Supabase SQL editor.
-- Private tables: RLS on, no policies, no anon/authenticated access. The server uses the service-role key.
CREATE TABLE IF NOT EXISTS public.live_pos_keys (
  restaurant_id text PRIMARY KEY,
  key_hash text NOT NULL,
  key_hint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.live_orders_inbox (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_orders_inbox_rest_idx ON public.live_orders_inbox (restaurant_id, created_at);
ALTER TABLE public.live_pos_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_orders_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_pos_keys, public.live_orders_inbox FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';
