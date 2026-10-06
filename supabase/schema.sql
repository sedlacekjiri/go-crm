-- Go CRM – database schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.

-- ─────────────────────────────────────────────────────────────
-- Users & roles
--   admin  = can edit everything (you)
--   viewer = read-only (owners)
-- The very first user that signs up / is created becomes admin,
-- everybody after that is a viewer. Change roles in Table Editor → app_users.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (user_id, email, role)
  values (
    new.id,
    new.email,
    case when exists (select 1 from public.app_users where role = 'admin') then 'viewer' else 'admin' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and role = 'admin');
$$;

-- ─────────────────────────────────────────────────────────────
-- Partners (hotels, guesthouses, OTAs, cafés, …)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           text not null default 'hotel'
                   check (type in ('hotel', 'guesthouse', 'ota', 'cafe', 'other')),
  area           text,
  address        text,
  website        text,
  phone          text,
  email          text,
  rooms          integer check (rooms is null or rooms >= 0),
  stars          smallint check (stars is null or stars between 1 and 5),
  stage          text not null default 'new'
                   check (stage in ('new', 'contacted', 'in_talks', 'accepted', 'declined')),
  interest       smallint check (interest is null or interest between 1 and 3),
  affiliate_code text,
  affiliate_url  text,
  next_follow_up date,
  accepted_at    date,
  declined_reason text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists partners_affiliate_code_key
  on public.partners (lower(affiliate_code)) where affiliate_code is not null and affiliate_code <> '';
create index if not exists partners_stage_idx on public.partners (stage);
create index if not exists partners_follow_up_idx on public.partners (next_follow_up);

create or replace function public.partners_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.stage = 'accepted' and new.accepted_at is null then
    new.accepted_at := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists partners_before_write on public.partners;
create trigger partners_before_write
  before insert or update on public.partners
  for each row execute function public.partners_before_write();

-- ─────────────────────────────────────────────────────────────
-- Contact people (several per partner)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  name       text not null,
  role       text,
  email      text,
  phone      text,
  is_primary boolean not null default false,
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists contacts_partner_idx on public.contacts (partner_id);

-- ─────────────────────────────────────────────────────────────
-- Activity log (visits, calls, e-mails, …)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners (id) on delete cascade,
  contact_id  uuid references public.contacts (id) on delete set null,
  type        text not null default 'visit'
                check (type in ('visit', 'call', 'email', 'meeting', 'note')),
  happened_at timestamptz not null default now(),
  summary     text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists activities_partner_idx on public.activities (partner_id, happened_at desc);
create index if not exists activities_happened_idx on public.activities (happened_at desc);

-- ─────────────────────────────────────────────────────────────
-- Sales (imported from Caren)
--   amount/currency = what the export says
--   amount_eur / amount_isk = converted with the ECB rate of booking_date
--   affiliate_code links a booking to partners.affiliate_code
-- ─────────────────────────────────────────────────────────────
create table if not exists public.sales (
  id               uuid primary key default gen_random_uuid(),
  booking_ref      text not null unique,
  booking_date     date not null,
  pickup_date      date,
  return_date      date,
  brand            text check (brand is null or brand in ('car', 'camper')),
  vehicle          text,
  rental_days      integer,
  amount           numeric(14, 2) not null default 0,
  currency         text not null default 'EUR',
  amount_eur       numeric(14, 2) not null default 0,
  amount_isk       numeric(16, 0) not null default 0,
  fx_eur_isk       numeric(10, 4),
  affiliate_code   text,
  status           text,
  is_cancelled     boolean not null default false,
  customer_country text,
  raw              jsonb,
  imported_at      timestamptz not null default now()
);

create index if not exists sales_booking_date_idx on public.sales (booking_date);
create index if not exists sales_affiliate_idx on public.sales (lower(affiliate_code));

-- ─────────────────────────────────────────────────────────────
-- Monthly goals
-- ─────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id     uuid primary key default gen_random_uuid(),
  month  text not null check (month ~ '^\d{4}-\d{2}$'),
  metric text not null check (metric in ('visits', 'new_partners', 'bookings', 'revenue_eur')),
  target numeric(14, 2) not null check (target >= 0),
  unique (month, metric)
);

-- ─────────────────────────────────────────────────────────────
-- Row level security: members read, admins write
-- ─────────────────────────────────────────────────────────────
alter table public.app_users  enable row level security;
alter table public.partners   enable row level security;
alter table public.contacts   enable row level security;
alter table public.activities enable row level security;
alter table public.sales      enable row level security;
alter table public.goals      enable row level security;

drop policy if exists "read own role" on public.app_users;
create policy "read own role" on public.app_users
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

do $$
declare
  t text;
begin
  foreach t in array array['partners', 'contacts', 'activities', 'sales', 'goals'] loop
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('drop policy if exists "admins write" on public.%I', t);
    execute format(
      'create policy "members read" on public.%I for select to authenticated using (public.is_member())', t);
    execute format(
      'create policy "admins write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;
