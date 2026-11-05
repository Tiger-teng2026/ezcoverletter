-- Restore the minimum table privileges required by the server-side Supabase clients.
-- RLS remains enabled. User-facing access is still limited by the existing own-row policies.
-- The service role receives only the table privileges used by the current server code.

-- Signed-in users may read and delete only their own saved generations.
grant select, delete on table public.generations to authenticated;

-- These two own-row policies already exist; grant the matching read permission.
grant select on table public.profiles to authenticated;
grant select on table public.subscriptions to authenticated;

-- Server-side account and billing reads/writes.
grant select, insert, update on table public.subscriptions to service_role;
grant select on table public.credit_balances to service_role;
grant insert on table public.webhook_events to service_role;
grant select, insert, update on table public.one_time_purchases to service_role;
grant select on table public.export_documents to service_role;
