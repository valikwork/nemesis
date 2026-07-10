-- PostGIS lives in the `extensions` schema (on the search path), NOT public.
-- This keeps its spatial_ref_sys/geography_columns tables out of PostgREST's
-- exposed `public` schema, so no client role can reach them and the blanket
-- public-schema grants below never touch PostGIS-owned objects.
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nemesis_name text not null check (char_length(nemesis_name) between 2 and 40),
  catchphrase text check (char_length(catchphrase) <= 80),
  bio text check (char_length(bio) <= 500),
  mask_avatar_id text not null default 'skull_01',
  location geography(point, 4326),
  radius_km int check (radius_km between 1 and 500),
  language text not null default 'en' check (language in ('en','uk')),
  brutality_tier int not null default 1 check (brutality_tier between 1 and 5),
  expo_push_token text,
  created_at timestamptz not null default now()
);

create table unmasked_identities (
  profile_id uuid primary key references profiles on delete cascade,
  real_name text,
  photo_url text
);

create table ordeals (
  id uuid primary key default gen_random_uuid(),
  name_en text, name_uk text,
  name_custom text,
  unit_en text, unit_uk text, unit_custom text,
  is_custom boolean not null default false,
  created_by uuid references profiles,
  language text check (language in ('en','uk')),
  moderation_status text not null default 'approved'
    check (moderation_status in ('approved','pending','rejected')),
  check (is_custom = (name_custom is not null))
);

create table profile_ordeals (
  profile_id uuid references profiles on delete cascade,
  ordeal_id uuid references ordeals on delete cascade,
  skill_hint text check (char_length(skill_hint) <= 30),
  primary key (profile_id, ordeal_id)
);

create table swipes (
  swiper uuid references profiles on delete cascade,
  target uuid references profiles on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (swiper, target),
  check (swiper <> target)
);

create table feuds (
  id uuid primary key default gen_random_uuid(),
  profile_a uuid not null references profiles on delete cascade,
  profile_b uuid not null references profiles on delete cascade,
  ordeal_id uuid not null references ordeals,
  mode text not null check (mode in ('endless','showdown')),
  goal_value numeric check ((mode = 'showdown') = (goal_value is not null)),
  status text not null default 'proposed'
    check (status in ('proposed','active','ended','dissolved')),
  is_arch boolean not null default false,
  unmasked_at timestamptz,
  winner uuid references profiles,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (profile_a < profile_b)
);

create unique index feuds_one_live_per_pair_ordeal
  on feuds (profile_a, profile_b, ordeal_id)
  where status in ('proposed','active');

create table score_entries (
  id uuid primary key default gen_random_uuid(),
  feud_id uuid not null references feuds on delete cascade,
  author uuid not null references profiles on delete cascade,
  value numeric not null check (value > 0),
  note text check (char_length(note) <= 140),
  proof_url text,
  created_at timestamptz not null default now()
);

create table taunt_templates (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('en','uk')),
  skeleton text not null,
  slot_count int not null check (slot_count between 2 and 5)
);

create table taunt_banks (
  template_id uuid references taunt_templates on delete cascade,
  slot_index int not null,
  word_index int not null,
  word text not null,
  primary key (template_id, slot_index, word_index)
);

create table taunts (
  id uuid primary key default gen_random_uuid(),
  feud_id uuid not null references feuds on delete cascade,
  author uuid not null references profiles on delete cascade,
  template_id uuid not null references taunt_templates,
  picks int[] not null,
  created_at timestamptz not null default now(),
  created_day date not null default (now() at time zone 'utc')::date
);

create unique index taunts_daily on taunts (feud_id, author, created_day);

create table invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default encode(gen_random_bytes(6), 'hex'),
  inviter uuid not null references profiles on delete cascade,
  ordeal_id uuid not null references ordeals,
  mode text not null check (mode in ('endless','showdown')),
  goal_value numeric check ((mode = 'showdown') = (goal_value is not null)),
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked')),
  accepted_by uuid references profiles,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

create table declares (
  id uuid primary key default gen_random_uuid(),
  declarer uuid not null references profiles on delete cascade,
  target uuid not null references profiles on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','dissolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  token_available_at timestamptz
);

create unique index declares_one_live on declares (declarer)
  where status in ('pending','accepted');

create table blocks (
  blocker uuid references profiles on delete cascade,
  blocked uuid references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references profiles on delete cascade,
  target uuid not null references profiles,
  feud_id uuid references feuds,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- RLS
alter table profiles enable row level security;
alter table unmasked_identities enable row level security;
alter table ordeals enable row level security;
alter table profile_ordeals enable row level security;
alter table swipes enable row level security;
alter table feuds enable row level security;
alter table score_entries enable row level security;
alter table taunt_templates enable row level security;
alter table taunt_banks enable row level security;
alter table taunts enable row level security;
alter table invites enable row level security;
alter table declares enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;

create policy profiles_self on profiles for all using (id = auth.uid());
create policy profiles_feud_partner on profiles for select
  using (exists (select 1 from feuds f
    where f.status in ('active','ended')
      and ((f.profile_a = profiles.id and f.profile_b = auth.uid())
        or (f.profile_b = profiles.id and f.profile_a = auth.uid()))));

create policy unmask_self on unmasked_identities for all
  using (profile_id = auth.uid());
create policy unmask_pact on unmasked_identities for select
  using (exists (select 1 from feuds f
    where f.is_arch and f.unmasked_at is not null and f.status = 'active'
      and ((f.profile_a = unmasked_identities.profile_id and f.profile_b = auth.uid())
        or (f.profile_b = unmasked_identities.profile_id and f.profile_a = auth.uid()))));

create policy ordeals_read on ordeals for select
  using (moderation_status = 'approved' or created_by = auth.uid());
create policy profile_ordeals_self on profile_ordeals for all
  using (profile_id = auth.uid());
create policy swipes_insert_own on swipes for insert
  with check (swiper = auth.uid());
create policy feuds_members on feuds for select
  using (auth.uid() in (profile_a, profile_b));
create policy scores_members_read on score_entries for select
  using (exists (select 1 from feuds f where f.id = feud_id and auth.uid() in (f.profile_a, f.profile_b)));
create policy scores_insert_own on score_entries for insert
  with check (author = auth.uid()
    and exists (select 1 from feuds f where f.id = feud_id and f.status = 'active' and auth.uid() in (f.profile_a, f.profile_b)));
create policy taunt_templates_read on taunt_templates for select using (true);
create policy taunt_banks_read on taunt_banks for select using (true);
create policy taunts_members_read on taunts for select
  using (exists (select 1 from feuds f where f.id = feud_id and auth.uid() in (f.profile_a, f.profile_b)));
create policy invites_inviter on invites for select using (inviter = auth.uid());
create policy declares_parties on declares for select
  using (auth.uid() in (declarer, target));
create policy blocks_own on blocks for all using (blocker = auth.uid());
create policy reports_insert_own on reports for insert with check (reporter = auth.uid());

-- Table-level grants: RLS restricts rows, but Postgres also requires a base
-- privilege grant before PostgREST (anon/authenticated) or Edge Functions
-- (service_role) can touch a table at all. Objects created by migrations are
-- owned by `postgres`, whose default ACL only hands anon/authenticated/
-- service_role TRUNCATE/REFERENCES/TRIGGER -- no SELECT/INSERT/UPDATE/DELETE.
-- Without this block every request (even ones RLS would allow) fails with
-- "permission denied for table ..." instead of being filtered to zero rows.
-- (Routines are intentionally not blanket-granted here: this migration defines
-- no callable functions of its own, and `public` also hosts PostGIS's internal
-- support functions, which cannot receive ordinary EXECUTE grants. RPCs added
-- by later migrations should grant EXECUTE explicitly per function.)
-- DML verbs only -- never ALL (which would add TRUNCATE/REFERENCES/TRIGGER).
-- PostGIS lives in the `extensions` schema (see top of file), so its
-- RLS-less spatial_ref_sys is not in `public` and these grants never reach it.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
