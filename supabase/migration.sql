-- Run this once in the Supabase project's SQL editor (Project → SQL Editor → New query).
-- Sets up entitlement + branding storage for the premium tier. See README.md
-- "Premium tier setup" section for the full manual setup steps this fits into.

create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free', -- 'free' | 'premium_subscription' | 'premium_lifetime'
  status text,                        -- Stripe subscription status (active/past_due/canceled); null for lifetime/free
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;

-- Users can read their own entitlement row (used by the frontend's useEntitlement hook).
create policy "read own entitlement" on entitlements
  for select using (auth.uid() = user_id);

-- Deliberately no insert/update policy for anon/authenticated roles: entitlement
-- rows are only ever written by the Stripe webhook serverless function using the
-- Supabase service-role key, which bypasses RLS entirely. This prevents a user
-- from ever granting themselves premium by writing to their own row directly.

create table if not exists branding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text,
  logo_url text,
  accent_hex text,
  updated_at timestamptz not null default now()
);

alter table branding enable row level security;

create policy "read own branding" on branding
  for select using (auth.uid() = user_id);
create policy "insert own branding" on branding
  for insert with check (auth.uid() = user_id);
create policy "update own branding" on branding
  for update using (auth.uid() = user_id);

-- Storage bucket for uploaded company logos (public read so the logo can be
-- embedded in an exported PDF without an authenticated fetch; write restricted
-- to the owning user's own folder, enforced by the storage policy below).
insert into storage.buckets (id, name, public)
values ('branding-logos', 'branding-logos', true)
on conflict (id) do nothing;

create policy "read branding logos" on storage.objects
  for select using (bucket_id = 'branding-logos');
create policy "upload own branding logo" on storage.objects
  for insert with check (bucket_id = 'branding-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update own branding logo" on storage.objects
  for update using (bucket_id = 'branding-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Per-user saved calculator inputs (the "Save calculation" button on every
-- calculator page, listed back on the Account page and the on-page Saved
-- calculations panel). Each row belongs to one user and stores the calculator
-- slug, a user-chosen label, and the full input state as JSON. RLS scopes every
-- operation to the owning user, so the client only ever needs to pass user_id on
-- insert (auth.uid() must match). Without this table + policies the save button
-- silently fails.
create table if not exists saved_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calculator text not null,     -- calculator slug, e.g. 'busbar', 'mohrs-circle'
  label text not null,          -- user-chosen name for this save
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table saved_calculations enable row level security;

create index if not exists saved_calculations_user_calc_idx
  on saved_calculations (user_id, calculator, updated_at desc);

create policy "read own saved calculations" on saved_calculations
  for select using (auth.uid() = user_id);
create policy "insert own saved calculations" on saved_calculations
  for insert with check (auth.uid() = user_id);
create policy "update own saved calculations" on saved_calculations
  for update using (auth.uid() = user_id);
create policy "delete own saved calculations" on saved_calculations
  for delete using (auth.uid() = user_id);
