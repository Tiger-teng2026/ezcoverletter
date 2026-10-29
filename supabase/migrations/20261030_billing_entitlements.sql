-- Additive billing entitlements. Do not edit 20261029_accounts_billing.sql.
-- Existing subscription, purchase, balance, and generation rows are left in place.

alter table public.webhook_events
  add column if not exists status text not null default 'applied',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists locked_until timestamptz,
  add column if not exists last_error text;

alter table public.webhook_events drop constraint if exists webhook_events_status_check;
alter table public.webhook_events
  add constraint webhook_events_status_check check (status in ('processing', 'applied', 'failed'));

alter table public.subscriptions
  add column if not exists scheduled_plan text,
  add column if not exists cycle_id text,
  add column if not exists period_start timestamptz,
  add column if not exists opened_by_transaction text;

alter table public.subscriptions drop constraint if exists subscriptions_scheduled_plan_check;
alter table public.subscriptions
  add constraint subscriptions_scheduled_plan_check
  check (scheduled_plan is null or scheduled_plan in ('creator', 'pro'));

alter table public.one_time_purchases
  add column if not exists user_id uuid,
  add column if not exists document_id uuid,
  add column if not exists attempt_id uuid,
  add column if not exists refunded_at timestamptz;

alter table public.one_time_purchases drop constraint if exists one_time_purchases_owner_pair;
alter table public.one_time_purchases
  add constraint one_time_purchases_owner_pair
  check (
    (user_id is null and document_id is null)
    or (user_id is not null and document_id is not null)
  );

create table if not exists public.export_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_generation_id uuid references public.generations (id) on delete set null,
  title text not null,
  letter text not null,
  contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.export_checkout_attempts (
  id uuid primary key,
  document_id uuid not null references public.export_documents (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('creating', 'open', 'paid', 'failed', 'expired', 'refunded')),
  checkout_id text,
  checkout_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists export_checkout_attempts_checkout_id
  on public.export_checkout_attempts (checkout_id)
  where checkout_id is not null;

create unique index if not exists export_checkout_one_live
  on public.export_checkout_attempts (document_id)
  where status in ('creating', 'open', 'paid');

create table if not exists public.subscription_checkout_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('creator', 'pro')),
  status text not null check (status in ('creating', 'open', 'consumed')),
  checkout_id text,
  checkout_url text,
  created_at timestamptz not null default now()
);

create unique index if not exists subscription_checkout_one_live
  on public.subscription_checkout_attempts (user_id)
  where status in ('creating', 'open');

alter table public.one_time_purchases drop constraint if exists one_time_purchases_document_fk;
alter table public.one_time_purchases
  add constraint one_time_purchases_document_fk
  foreign key (document_id) references public.export_documents (id) on delete restrict;

alter table public.export_documents enable row level security;
alter table public.export_checkout_attempts enable row level security;
alter table public.subscription_checkout_attempts enable row level security;

drop policy if exists export_documents_select_own on public.export_documents;
create policy export_documents_select_own on public.export_documents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists export_attempts_select_own on public.export_checkout_attempts;
create policy export_attempts_select_own on public.export_checkout_attempts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists subscription_attempts_select_own on public.subscription_checkout_attempts;
create policy subscription_attempts_select_own on public.subscription_checkout_attempts
  for select to authenticated using (user_id = auth.uid());

revoke all on public.export_documents from anon, authenticated;
grant select on public.export_documents to authenticated;
revoke all on public.export_checkout_attempts from anon, authenticated;
grant select on public.export_checkout_attempts to authenticated;
revoke all on public.subscription_checkout_attempts from anon, authenticated;
grant select on public.subscription_checkout_attempts to authenticated;

create or replace function public.protect_export_document()
returns trigger
language plpgsql
as $$
begin
  if new.letter is distinct from old.letter
    or new.user_id is distinct from old.user_id
    or new.id is distinct from old.id
    or new.title is distinct from old.title
    or new.created_at is distinct from old.created_at then
    raise exception 'purchased export text is locked';
  end if;
  return new;
end;
$$;

drop trigger if exists export_documents_lock on public.export_documents;
create trigger export_documents_lock
  before update on public.export_documents
  for each row execute function public.protect_export_document();

create or replace function public.protect_paid_purchase()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'refunded' and new.status is distinct from 'refunded' then
    raise exception 'refunded purchase cannot be restored';
  end if;
  if old.document_id is not null and new.document_id is distinct from old.document_id then
    raise exception 'purchase document cannot change';
  end if;
  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'purchase owner cannot change';
  end if;
  return new;
end;
$$;

drop trigger if exists one_time_purchases_lock on public.one_time_purchases;
create trigger one_time_purchases_lock
  before update on public.one_time_purchases
  for each row execute function public.protect_paid_purchase();

create or replace function public.protect_checkout_attempt()
returns trigger
language plpgsql
as $$
begin
  if new.document_id is distinct from old.document_id
    or new.user_id is distinct from old.user_id
    or new.id is distinct from old.id then
    raise exception 'checkout attempt binding cannot change';
  end if;
  if old.checkout_id is not null and new.checkout_id is distinct from old.checkout_id then
    raise exception 'checkout id cannot change';
  end if;
  if old.status = 'refunded' and new.status is distinct from 'refunded' then
    raise exception 'refunded checkout cannot be restored';
  end if;
  if old.status = 'paid' and new.status not in ('paid', 'refunded') then
    raise exception 'paid checkout cannot be reopened';
  end if;
  return new;
end;
$$;

drop trigger if exists export_checkout_attempts_lock on public.export_checkout_attempts;
create trigger export_checkout_attempts_lock
  before update on public.export_checkout_attempts
  for each row execute function public.protect_checkout_attempt();

create or replace function public.update_export_contact(p_document_id uuid, p_contact jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  update public.export_documents
  set contact = coalesce(p_contact, '{}'::jsonb)
  where id = p_document_id and user_id = auth.uid();
  if not found then
    raise exception 'export document was not found';
  end if;
end;
$$;

revoke all on function public.update_export_contact(uuid, jsonb) from public, anon;
grant execute on function public.update_export_contact(uuid, jsonb) to authenticated;

-- Allowance may rise inside a cycle. It never drops and never resets used.
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
  stored_allowance integer;
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
  do update set allowance = greatest(public.credit_balances.allowance, excluded.allowance);

  update public.credit_balances
  set used = used + p_cost
  where account_id = p_account_id
    and period_start = p_period_start
    and used + p_cost <= allowance
  returning used, allowance into updated_used, stored_allowance;

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
    'remaining', greatest(stored_allowance - updated_used, 0)
  );
end;
$$;

create or replace function public.consume_ai_credit(
  p_user_id uuid,
  p_cost integer,
  p_action text,
  p_idempotency_key text,
  p_now timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_allowance integer := 10;
  v_sub public.subscriptions%rowtype;
  v_paid boolean := false;
  v_allowance integer;
  v_account text;
  v_period date;
  v_cycle text;
begin
  select * into v_sub from public.subscriptions where user_id = p_user_id;
  if found
    and v_sub.status in ('active', 'trialing', 'canceled', 'scheduled_cancel')
    and v_sub.current_period_end is not null
    and v_sub.current_period_end > p_now then
    v_paid := true;
  end if;

  if v_paid then
    if v_sub.cycle_id is null then
      update public.subscriptions
      set cycle_id = 'legacy:' || v_sub.creem_subscription_id || ':' ||
        to_char(v_sub.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      where user_id = p_user_id and cycle_id is null
      returning cycle_id into v_cycle;
      if v_cycle is null then
        select cycle_id into v_cycle from public.subscriptions where user_id = p_user_id;
      end if;
    else
      v_cycle := v_sub.cycle_id;
    end if;
    v_allowance := case when v_sub.plan = 'pro' then 300 else 100 end;
    v_account := 'paid:' || p_user_id::text || ':' || v_sub.creem_subscription_id || ':' || v_cycle;
    v_period := date '2000-01-01';
  else
    v_allowance := v_free_allowance;
    v_account := 'user:' || p_user_id::text;
    v_period := (date_trunc('month', p_now at time zone 'UTC'))::date;
  end if;

  return public.consume_credits(v_account, v_period, p_cost, v_allowance, p_action, coalesce(p_idempotency_key, ''));
end;
$$;

create or replace function public.save_export_document(
  p_user_id uuid,
  p_letter text,
  p_title text,
  p_contact jsonb,
  p_generation_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_generation uuid := p_generation_id;
begin
  if p_user_id is null or length(trim(coalesce(p_letter, ''))) = 0 or length(p_letter) > 40000 then
    raise exception 'export document is invalid';
  end if;
  if v_generation is not null and not exists (
    select 1 from public.generations where id = v_generation and user_id = p_user_id
  ) then
    raise exception 'generation does not belong to this user';
  end if;
  insert into public.export_documents (id, user_id, source_generation_id, title, letter, contact)
  values (
    v_id,
    p_user_id,
    v_generation,
    left(coalesce(nullif(trim(p_title), ''), 'Cover letter'), 120),
    p_letter,
    coalesce(p_contact, '{}'::jsonb)
  );
  return v_id;
end;
$$;

create or replace function public.begin_export_checkout(p_user_id uuid, p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_existing public.export_checkout_attempts%rowtype;
  v_id uuid := gen_random_uuid();
begin
  select user_id into v_owner from public.export_documents where id = p_document_id;
  if v_owner is null or v_owner is distinct from p_user_id then
    return jsonb_build_object('state', 'forbidden');
  end if;

  select * into v_existing
  from public.export_checkout_attempts
  where document_id = p_document_id and status in ('creating', 'open', 'paid')
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'state', v_existing.status,
      'requestId', v_existing.id,
      'documentId', v_existing.document_id,
      'checkoutId', v_existing.checkout_id,
      'checkoutUrl', v_existing.checkout_url
    );
  end if;

  begin
    insert into public.export_checkout_attempts (id, document_id, user_id, status)
    values (v_id, p_document_id, p_user_id, 'creating');
    return jsonb_build_object('state', 'created', 'requestId', v_id, 'documentId', p_document_id);
  exception when unique_violation then
    select * into v_existing
    from public.export_checkout_attempts
    where document_id = p_document_id and status in ('creating', 'open', 'paid')
    limit 1;
    return jsonb_build_object(
      'state', coalesce(v_existing.status, 'creating'),
      'requestId', v_existing.id,
      'documentId', p_document_id,
      'checkoutId', v_existing.checkout_id,
      'checkoutUrl', v_existing.checkout_url
    );
  end;
end;
$$;

create or replace function public.attach_export_checkout(
  p_request_id uuid,
  p_checkout_id text,
  p_checkout_url text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.export_checkout_attempts%rowtype;
begin
  update public.export_checkout_attempts
  set checkout_id = p_checkout_id,
      checkout_url = p_checkout_url,
      status = 'open'
  where id = p_request_id and status = 'creating' and checkout_id is null
  returning * into v_row;
  if not found then
    select * into v_row from public.export_checkout_attempts where id = p_request_id;
  end if;
  return jsonb_build_object(
    'state', v_row.status,
    'requestId', v_row.id,
    'checkoutId', v_row.checkout_id,
    'checkoutUrl', v_row.checkout_url
  );
end;
$$;

create or replace function public.record_webhook_failure(p_event_id text, p_event_type text, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.webhook_events (id, event_type, status, attempt_count, last_error)
  values (p_event_id, coalesce(nullif(p_event_type, ''), 'failed'), 'failed', 1, left(coalesce(p_error, 'failed'), 300))
  on conflict (id) do update
  set status = 'failed',
      last_error = excluded.last_error,
      attempt_count = public.webhook_events.attempt_count + 1
  where public.webhook_events.status is distinct from 'applied';
end;
$$;

-- Claim, entitlement changes, credit bucket, and applied status commit together.
create or replace function public.apply_billing_webhook(
  p_event jsonb,
  p_one_time_product text,
  p_creator_product text,
  p_pro_product text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_allowance integer := 10;
  v_id text := p_event->>'id';
  v_type text := p_event->>'eventType';
  v_object jsonb := p_event->'object';
  v_inserted text;
  v_status text;
  v_locked timestamptz;
  v_product text;
  v_kind text;
  v_checkout text;
  v_request uuid;
  v_attempt public.export_checkout_attempts%rowtype;
  v_purchase_status text;
  v_sub_id text;
  v_user uuid;
  v_existing public.subscriptions%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_tx text;
  v_plan text;
  v_sub_status text;
  v_open_new boolean := false;
  v_cycle text;
  v_allowance integer;
  v_account text;
begin
  if v_id is null or v_type is null or v_object is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into public.webhook_events (id, event_type, status, attempt_count, locked_until)
  values (v_id, v_type, 'processing', 1, clock_timestamp() + interval '2 minutes')
  on conflict (id) do nothing
  returning id into v_inserted;

  select status, locked_until into v_status, v_locked
  from public.webhook_events where id = v_id for update;

  if v_inserted is null then
    if v_status = 'applied' then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
    if v_status = 'processing' and v_locked is not null and v_locked > clock_timestamp() then
      return jsonb_build_object('ok', false, 'busy', true);
    end if;
    update public.webhook_events
    set status = 'processing',
        attempt_count = attempt_count + 1,
        locked_until = clock_timestamp() + interval '2 minutes',
        event_type = v_type
    where id = v_id and status is distinct from 'applied';
  end if;

  v_product := coalesce(v_object->'product'->>'id', v_object->>'product', '');
  if v_product = p_one_time_product and p_one_time_product <> '' then
    v_kind := 'export';
  elsif v_product = p_creator_product and p_creator_product <> '' then
    v_kind := 'creator';
  elsif v_product = p_pro_product and p_pro_product <> '' then
    v_kind := 'pro';
  else
    v_kind := null;
  end if;

  if v_type = 'checkout.completed' and v_kind = 'export' then
    if coalesce(v_object->>'status', '') is distinct from 'completed'
      or coalesce(v_object->'order'->>'status', '') is distinct from 'paid' then
      if coalesce(v_object->'order'->>'status', '') not in ('refunded', 'failed', 'canceled') then
        raise exception 'checkout payment is not verified';
      end if;
    else
      v_checkout := v_object->>'id';
      begin
        v_request := nullif(v_object->>'request_id', '')::uuid;
      exception when others then
        v_request := null;
      end;
      if v_checkout is null then
        raise exception 'checkout payment is not verified';
      end if;
      select status into v_purchase_status from public.one_time_purchases where checkout_id = v_checkout;
      if v_request is not null then
        select * into v_attempt from public.export_checkout_attempts where id = v_request;
      end if;
      if v_attempt.id is null then
        select * into v_attempt from public.export_checkout_attempts where checkout_id = v_checkout;
      end if;
      if nullif(v_object->>'request_id', '') is not null and v_attempt.id is null then
        raise exception 'export checkout is not linked';
      end if;
      if v_purchase_status = 'refunded' or v_attempt.status = 'refunded' then
        if v_attempt.id is not null then
          update public.export_checkout_attempts
          set status = 'refunded', checkout_id = coalesce(checkout_id, v_checkout)
          where id = v_attempt.id;
        end if;
      elsif v_attempt.id is not null then
        update public.export_checkout_attempts
        set status = 'paid', checkout_id = coalesce(checkout_id, v_checkout)
        where id = v_attempt.id and status is distinct from 'refunded';
        insert into public.one_time_purchases (checkout_id, status, user_id, document_id, attempt_id)
        values (v_checkout, 'paid', v_attempt.user_id, v_attempt.document_id, v_attempt.id)
        on conflict (checkout_id) do update
        set status = 'paid',
            user_id = coalesce(public.one_time_purchases.user_id, excluded.user_id),
            document_id = coalesce(public.one_time_purchases.document_id, excluded.document_id),
            attempt_id = coalesce(public.one_time_purchases.attempt_id, excluded.attempt_id)
        where public.one_time_purchases.status is distinct from 'refunded';
      else
        insert into public.one_time_purchases (checkout_id, status)
        values (v_checkout, 'paid')
        on conflict (checkout_id) do update set status = 'paid'
        where public.one_time_purchases.status is distinct from 'refunded';
      end if;
    end if;
  elsif v_type = 'refund.created' and coalesce(v_object->>'status', '') = 'succeeded' then
    v_checkout := v_object->'checkout'->>'id';
    v_product := coalesce(v_object->'checkout'->'product'->>'id', v_object->'checkout'->>'product', '');
    if v_product = p_one_time_product and p_one_time_product <> '' and v_checkout is not null then
      insert into public.one_time_purchases (checkout_id, status, refunded_at)
      values (v_checkout, 'refunded', clock_timestamp())
      on conflict (checkout_id) do update
      set status = 'refunded', refunded_at = coalesce(public.one_time_purchases.refunded_at, excluded.refunded_at);
      update public.export_checkout_attempts
      set status = 'refunded'
      where checkout_id = v_checkout
         or id in (
           select attempt_id from public.one_time_purchases
           where checkout_id = v_checkout and attempt_id is not null
         );
    end if;
    v_sub_id := v_object->'subscription'->>'id';
    v_product := coalesce(v_object->'subscription'->'product'->>'id', v_object->'subscription'->>'product', '');
    if v_sub_id is not null and (v_product = p_creator_product or v_product = p_pro_product) then
      update public.subscriptions
      set status = 'refunded', current_period_end = clock_timestamp(), updated_at = clock_timestamp()
      where creem_subscription_id = v_sub_id
      returning user_id into v_user;
      update public.subscription_checkout_attempts
      set status = 'consumed'
      where user_id = v_user and status in ('creating', 'open');
    end if;
  elsif v_type like 'subscription.%' then
    v_sub_id := v_object->>'id';
    v_plan := v_kind;
    if v_sub_id is null or v_plan is null or v_plan not in ('creator', 'pro') then
      raise exception 'subscription could not be linked';
    end if;
    if v_sub_id is not null and v_plan in ('creator', 'pro') then
      begin
        v_user := nullif(coalesce(v_object->'metadata'->>'userId', ''), '')::uuid;
      exception when others then
        v_user := null;
      end;
      select * into v_existing from public.subscriptions where creem_subscription_id = v_sub_id for update;
      if v_user is null then
        v_user := v_existing.user_id;
      end if;
      if v_user is null then
        raise exception 'subscription user is not linked';
      end if;
      v_sub_status := case v_type
        when 'subscription.canceled' then 'canceled'
        when 'subscription.scheduled_cancel' then 'scheduled_cancel'
        when 'subscription.past_due' then 'past_due'
        when 'subscription.unpaid' then 'unpaid'
        when 'subscription.expired' then 'expired'
        when 'subscription.paused' then 'paused'
        else null
      end;
      if v_sub_status is null then
        if coalesce(v_object->>'status', '') in ('active', 'trialing', 'canceled', 'scheduled_cancel', 'past_due', 'unpaid', 'expired', 'paused', 'refunded') then
          v_sub_status := v_object->>'status';
        elsif v_type in ('subscription.paid', 'subscription.active') then
          v_sub_status := 'active';
        elsif v_type = 'subscription.trialing' then
          v_sub_status := 'trialing';
        else
          raise exception 'subscription status is not recognized';
        end if;
      end if;
      if v_user is not null then
        begin
          v_start := nullif(v_object->>'current_period_start_date', '')::timestamptz;
        exception when others then
          v_start := null;
        end;
        begin
          v_end := nullif(v_object->>'current_period_end_date', '')::timestamptz;
        exception when others then
          v_end := null;
        end;
        v_tx := nullif(v_object->>'last_transaction_id', '');
        v_open_new := v_type = 'subscription.paid'
          and v_tx is not null
          and v_start is not null
          and v_end is not null
          and v_tx is distinct from v_existing.opened_by_transaction
          and (v_existing.period_start is null or v_start > v_existing.period_start)
          and (v_existing.current_period_end is null or v_end > v_existing.current_period_end);
        if v_open_new then
          v_cycle := v_sub_id || ':' || to_char(v_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
          insert into public.subscriptions (
            user_id, plan, status, product_id, creem_subscription_id, current_period_end,
            period_start, cycle_id, opened_by_transaction, scheduled_plan, updated_at
          ) values (
            v_user, v_plan, v_sub_status, v_product, v_sub_id, v_end,
            v_start, v_cycle, v_tx, null, clock_timestamp()
          )
          on conflict (user_id) do update set
            plan = excluded.plan,
            status = excluded.status,
            product_id = excluded.product_id,
            creem_subscription_id = excluded.creem_subscription_id,
            current_period_end = excluded.current_period_end,
            period_start = excluded.period_start,
            cycle_id = excluded.cycle_id,
            opened_by_transaction = excluded.opened_by_transaction,
            scheduled_plan = null,
            updated_at = clock_timestamp();
          v_allowance := case when v_plan = 'pro' then 300 else 100 end;
          v_account := 'paid:' || v_user::text || ':' || v_sub_id || ':' || v_cycle;
          insert into public.credit_balances (account_id, period_start, allowance, used)
          values (v_account, date '2000-01-01', v_allowance, 0)
          on conflict (account_id, period_start) do update
          set allowance = greatest(public.credit_balances.allowance, excluded.allowance);
        else
          if v_existing.plan = 'pro' and v_plan = 'creator' then
            update public.subscriptions
            set scheduled_plan = null,
                status = v_sub_status,
                current_period_end = coalesce(v_end, current_period_end),
                updated_at = clock_timestamp()
            where user_id = v_user;
          elsif v_plan = 'pro' and coalesce(v_existing.plan, 'creator') = 'creator' and v_existing.cycle_id is not null then
            update public.subscriptions
            set plan = 'pro',
                scheduled_plan = null,
                product_id = v_product,
                status = v_sub_status,
                current_period_end = coalesce(v_end, current_period_end),
                updated_at = clock_timestamp()
            where user_id = v_user;
            v_account := 'paid:' || v_user::text || ':' || v_sub_id || ':' || v_existing.cycle_id;
            insert into public.credit_balances (account_id, period_start, allowance, used)
            values (v_account, date '2000-01-01', 300, 0)
            on conflict (account_id, period_start) do update
            set allowance = greatest(public.credit_balances.allowance, excluded.allowance);
          else
            insert into public.subscriptions (
              user_id, plan, status, product_id, creem_subscription_id, current_period_end, updated_at
            ) values (
              v_user,
              case when v_plan = 'pro' or v_existing.plan = 'pro' then 'pro' else coalesce(v_existing.plan, v_plan) end,
              v_sub_status,
              v_product,
              v_sub_id,
              coalesce(v_end, v_existing.current_period_end),
              clock_timestamp()
            )
            on conflict (user_id) do update set
              plan = case when excluded.plan = 'pro' then 'pro' else public.subscriptions.plan end,
              scheduled_plan = null,
              status = v_sub_status,
              product_id = excluded.product_id,
              creem_subscription_id = excluded.creem_subscription_id,
              current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
              updated_at = clock_timestamp();
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_user is not null then
    update public.subscription_checkout_attempts
    set status = 'consumed'
    where user_id = v_user and status in ('creating', 'open');
  end if;

  update public.webhook_events
  set status = 'applied', locked_until = null, last_error = null
  where id = v_id;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

create or replace function public.confirm_export_payment(p_checkout_id text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_attempt public.export_checkout_attempts%rowtype;
begin
  if p_checkout_id is null or p_checkout_id = '' then
    return jsonb_build_object('granted', false);
  end if;
  select status into v_status from public.one_time_purchases where checkout_id = p_checkout_id;
  if v_status = 'refunded' then
    return jsonb_build_object('granted', false, 'reason', 'refunded');
  end if;
  if p_request_id is not null then
    select * into v_attempt from public.export_checkout_attempts where id = p_request_id;
  end if;
  if v_attempt.id is null then
    select * into v_attempt from public.export_checkout_attempts where checkout_id = p_checkout_id;
  end if;
  if v_attempt.id is null or v_attempt.status = 'refunded' then
    return jsonb_build_object('granted', false, 'reason', 'unbound');
  end if;
  update public.export_checkout_attempts
  set status = 'paid', checkout_id = coalesce(checkout_id, p_checkout_id)
  where id = v_attempt.id and status is distinct from 'refunded';
  insert into public.one_time_purchases (checkout_id, status, user_id, document_id, attempt_id)
  values (p_checkout_id, 'paid', v_attempt.user_id, v_attempt.document_id, v_attempt.id)
  on conflict (checkout_id) do update
  set status = 'paid',
      user_id = coalesce(public.one_time_purchases.user_id, excluded.user_id),
      document_id = coalesce(public.one_time_purchases.document_id, excluded.document_id),
      attempt_id = coalesce(public.one_time_purchases.attempt_id, excluded.attempt_id)
  where public.one_time_purchases.status is distinct from 'refunded';
  return jsonb_build_object('granted', true, 'documentId', v_attempt.document_id, 'scope', 'document');
end;
$$;

create or replace function public.begin_subscription_checkout(p_user_id uuid, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_existing public.subscription_checkout_attempts%rowtype;
  v_id uuid := gen_random_uuid();
begin
  if p_plan not in ('creator', 'pro') then
    return jsonb_build_object('state', 'forbidden');
  end if;
  select * into v_sub from public.subscriptions where user_id = p_user_id;
  if found and (
    v_sub.status in ('past_due', 'unpaid', 'paused')
    or (
      v_sub.status in ('active', 'trialing', 'canceled', 'scheduled_cancel')
      and v_sub.current_period_end is not null
      and v_sub.current_period_end > clock_timestamp()
    )
  ) then
    return jsonb_build_object('state', 'blocked');
  end if;

  select * into v_existing
  from public.subscription_checkout_attempts
  where user_id = p_user_id and status in ('creating', 'open')
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'state', v_existing.status,
      'requestId', v_existing.id,
      'plan', v_existing.plan,
      'checkoutId', v_existing.checkout_id,
      'checkoutUrl', v_existing.checkout_url
    );
  end if;

  begin
    insert into public.subscription_checkout_attempts (id, user_id, plan, status)
    values (v_id, p_user_id, p_plan, 'creating');
    return jsonb_build_object('state', 'created', 'requestId', v_id, 'plan', p_plan);
  exception when unique_violation then
    select * into v_existing
    from public.subscription_checkout_attempts
    where user_id = p_user_id and status in ('creating', 'open')
    limit 1;
    return jsonb_build_object(
      'state', coalesce(v_existing.status, 'creating'),
      'requestId', v_existing.id,
      'plan', coalesce(v_existing.plan, p_plan),
      'checkoutId', v_existing.checkout_id,
      'checkoutUrl', v_existing.checkout_url
    );
  end;
end;
$$;

create or replace function public.attach_subscription_checkout(
  p_request_id uuid,
  p_checkout_id text,
  p_checkout_url text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.subscription_checkout_attempts
  set checkout_id = p_checkout_id,
      checkout_url = p_checkout_url,
      status = 'open'
  where id = p_request_id and status = 'creating' and checkout_id is null;
end;
$$;

revoke all on function public.consume_ai_credit(uuid, integer, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.save_export_document(uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.begin_export_checkout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.attach_export_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_webhook_failure(text, text, text) from public, anon, authenticated;
revoke all on function public.apply_billing_webhook(jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_export_payment(text, uuid) from public, anon, authenticated;
revoke all on function public.begin_subscription_checkout(uuid, text) from public, anon, authenticated;
revoke all on function public.attach_subscription_checkout(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_ai_credit(uuid, integer, text, text, timestamptz) to service_role;
grant execute on function public.save_export_document(uuid, text, text, jsonb, uuid) to service_role;
grant execute on function public.begin_export_checkout(uuid, uuid) to service_role;
grant execute on function public.attach_export_checkout(uuid, text, text) to service_role;
grant execute on function public.record_webhook_failure(text, text, text) to service_role;
grant execute on function public.apply_billing_webhook(jsonb, text, text, text) to service_role;
grant execute on function public.confirm_export_payment(text, uuid) to service_role;
grant execute on function public.begin_subscription_checkout(uuid, text) to service_role;
grant execute on function public.attach_subscription_checkout(uuid, text, text) to service_role;
