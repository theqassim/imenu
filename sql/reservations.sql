-- Timed table reservations (DRAFT, not yet run anywhere). Review before running in the Supabase SQL editor.
-- Private tables: row level security on, no policies, so only the service-role key can use them.
create extension if not exists btree_gist;

create table if not exists public.reservations (
  id            text primary key,
  restaurant_id text not null,
  code          text not null unique,          -- public lookup code shown to the customer
  request_key   text not null,                 -- client-generated, makes double-submits idempotent
  customer_name text not null,
  customer_phone text not null,
  party_size    integer not null check (party_size between 1 and 100),
  starts_at     timestamptz not null,          -- the booked time
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','cancelled','arrived','no_show','expired','completed')),
  table_label   text,                          -- set by the owner on approval
  window_start  timestamptz,                   -- hold window, set on approval
  window_end    timestamptz,
  preorder      jsonb,                         -- menu items snapshot, never a live order until "arrived"
  note          text,
  version       integer not null default 1,    -- compare-and-set counter for every status change
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, request_key),
  -- Two approved reservations can never hold the same table label in overlapping windows.
  exclude using gist (
    restaurant_id with =, table_label with =, tstzrange(window_start, window_end) with &&
  ) where (status in ('approved','arrived') and table_label is not null and window_start is not null)
);
create index if not exists reservations_rest_time_idx on public.reservations (restaurant_id, starts_at);

create table if not exists public.reservation_events (
  id             bigint generated always as identity primary key,
  restaurant_id  text not null,
  reservation_id text not null references public.reservations(id) on delete cascade,
  kind           text not null,               -- created | approved | rejected | cancelled | arrived | no_show | expired
  acked          boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists reservation_events_pending_idx on public.reservation_events (restaurant_id, acked, id);

alter table public.reservations enable row level security;
alter table public.reservation_events enable row level security;
