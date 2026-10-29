-- EzCoverLetter phase 2. Run this in the Supabase SQL editor.
-- Service role bypasses RLS and is the only role allowed to change credits.
-- Authenticated users can read and delete only their own saved generations.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null check (plan in ('creator', 'pro')),
  status text not null,
  product_id text not null,
  creem_subscription_id text unique,
  creem_customer_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_balances (
  account_id text not null,
  period_start date not null,
  allowance integer not null,
  used integer not null default 0,
  primary key (account_id, period_start)
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  period_start date not null,
  action text not null,
  cost integer not null,
  status text not null check (status in ('reserved', 'committed', 'refunded')),
  idempotency_key text,
  output jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists credit_reservations_idempotency
  on public.credit_reservations (account_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tool text not null,
  title text not null,
  input jsonb not null,
  output jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.one_time_purchases (
  checkout_id text primary key,
  status text not null check (status in ('paid', 'refunded'))
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.generations enable row level security;
alter table public.webhook_events enable row level security;
alter table public.one_time_purchases enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy generations_select_own on public.generations
  for select to authenticated using (user_id = auth.uid());

create policy generations_delete_own on public.generations
  for delete to authenticated using (user_id = auth.uid());

create policy purchases_select_none on public.one_time_purchases
  for select to authenticated using (false);

revoke all on public.credit_balances from anon, authenticated;
revoke all on public.credit_reservations from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;
revoke insert, update on public.generations from anon, authenticated;
revoke insert, update, delete on public.subscriptions from anon, authenticated;

create or replace function public.consume_credits(
  p_account_id text,
  p_period_start date,
  p_cost integer,
  p_allowance integer,
  p_action text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  existing_status text;
  existing_output jsonb;
  updated_used integer;
  reservation_id uuid := gen_random_uuid();
begin
  if p_cost < 1 or p_allowance < 0 then
    return jsonb_build_object('ok', false, 'code', 'quota', 'remaining', 0);
  end if;

  if p_idempotency_key is not null and p_idempotency_key <> '' then
    select id, status, output into existing_id, existing_status, existing_output
    from public.credit_reservations
    where account_id = p_account_id and idempotency_key = p_idempotency_key;
    if existing_id is not null then
      if existing_status = 'committed' then
        return jsonb_build_object('ok', true, 'replay', true, 'reservationId', existing_id, 'output', existing_output, 'remaining', 0);
      elsif existing_status = 'reserved' then
        return jsonb_build_object('ok', false, 'code', 'in_progress', 'remaining', 0);
      else
        return jsonb_build_object('ok', false, 'code', 'replay_failed', 'remaining', 0);
      end if;
    end if;
  end if;

  insert into public.credit_balances (account_id, period_start, allowance, used)
  values (p_account_id, p_period_start, p_allowance, 0)
  on conflict (account_id, period_start)
  do update set allowance = excluded.allowance;

  update public.credit_balances
  set used = used + p_cost
  where account_id = p_account_id
    and period_start = p_period_start
    and used + p_cost <= allowance
  returning used into updated_used;

  if updated_used is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'quota',
      'remaining', coalesce((
        select greatest(allowance - used, 0) from public.credit_balances
        where account_id = p_account_id and period_start = p_period_start
      ), 0)
    );
  end if;

  insert into public.credit_reservations (id, account_id, period_start, action, cost, status, idempotency_key)
  values (
    reservation_id,
    p_account_id,
    p_period_start,
    p_action,
    p_cost,
    'reserved',
    nullif(p_idempotency_key, '')
  );

  return jsonb_build_object(
    'ok', true,
    'reservationId', reservation_id,
    'remaining', greatest(p_allowance - updated_used, 0)
  );
end;
$$;

create or replace function public.refund_credits(p_reservation_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.credit_reservations%rowtype;
begin
  update public.credit_reservations
  set status = 'refunded'
  where id = p_reservation_id and status = 'reserved'
  returning * into target;
  if target.id is null then
    return;
  end if;
  update public.credit_balances
  set used = greatest(used - target.cost, 0)
  where account_id = target.account_id and period_start = target.period_start;
end;
$$;

create or replace function public.commit_credits(
  p_reservation_id uuid,
  p_output jsonb,
  p_user_id uuid,
  p_tool text,
  p_title text,
  p_input jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.credit_reservations
  set status = 'committed', output = p_output
  where id = p_reservation_id and status = 'reserved';
  if not found then
    return;
  end if;
  if p_user_id is not null then
    insert into public.generations (user_id, tool, title, input, output)
    values (p_user_id, coalesce(p_tool, 'tool'), left(coalesce(p_title, 'Saved result'), 120), coalesce(p_input, 'null'::jsonb), coalesce(p_output, 'null'::jsonb));
  end if;
end;
$$;

revoke all on function public.consume_credits(text, date, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid) from public, anon, authenticated;
revoke all on function public.commit_credits(uuid, jsonb, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.consume_credits(text, date, integer, integer, text, text) to service_role;
grant execute on function public.refund_credits(uuid) to service_role;
grant execute on function public.commit_credits(uuid, jsonb, uuid, text, text, jsonb) to service_role;
