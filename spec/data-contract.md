# Nemesis — Data Contract

**Artifact 2 of 4** · 2026-07-10 · Consumed by every client (Expo RN now; native iOS/Android later). Any client is just a consumer of this contract against the same Supabase project.

## 1. Schema (Postgres + PostGIS)

```sql
-- Public persona. Real identity lives in unmasked_identities, never here.
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nemesis_name text not null check (char_length(nemesis_name) between 2 and 40),
  catchphrase text check (char_length(catchphrase) <= 80),
  bio text check (char_length(bio) <= 500),               -- "Why I'd make a worthy nemesis"
  mask_avatar_id text not null default 'skull_01',
  location geography(point, 4326) not null,
  radius_km int not null default 25 check (radius_km between 1 and 500),
  language text not null default 'en' check (language in ('en','uk')),
  brutality_tier int not null default 1 check (brutality_tier between 1 and 5),
  expo_push_token text,
  created_at timestamptz not null default now()
);

-- Real identity, revealed only via arch-nemesis unmasking pact.
create table unmasked_identities (
  profile_id uuid primary key references profiles on delete cascade,
  real_name text,
  photo_url text
);

create table ordeals (
  id uuid primary key default gen_random_uuid(),
  name_en text, name_uk text,                              -- catalog rows have both
  name_custom text,                                        -- custom rows: author's language only
  unit_en text, unit_uk text, unit_custom text,            -- "km", "liters", "countries"
  direction text not null default 'higher' check (direction in ('higher','lower')),
  is_custom boolean not null default false,
  created_by uuid references profiles,
  language text check (language in ('en','uk')),           -- custom only
  moderation_status text not null default 'approved'
    check (moderation_status in ('approved','pending','rejected')),
  check (is_custom = (name_custom is not null))
);

create table profile_ordeals (
  profile_id uuid references profiles on delete cascade,
  ordeal_id uuid references ordeals on delete cascade,
  skill_hint text check (char_length(skill_hint) <= 30),   -- "1450 elo", "23:40"
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
  check (profile_a < profile_b)                            -- canonical pair order, one row per pair+ordeal
);

create table score_entries (
  id uuid primary key default gen_random_uuid(),
  feud_id uuid not null references feuds on delete cascade,
  author uuid not null references profiles on delete cascade,
  value numeric not null check (value > 0),
  note text check (char_length(note) <= 140),
  proof_url text,                                          -- null → rumor; set → chronicled
  disputed boolean not null default false,
  created_at timestamptz not null default now()
);

create table taunt_templates (
  id uuid primary key default gen_random_uuid(),
  language text not null check (language in ('en','uk')),
  skeleton text not null,                                  -- "{0} {1} {2} {3}." slot placeholders
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
  created_at timestamptz not null default now()
);
-- 1 taunt per author per feud per day
create unique index taunts_daily on taunts (feud_id, author, (created_at::date));

create table declares (
  id uuid primary key default gen_random_uuid(),
  declarer uuid not null references profiles on delete cascade,
  target uuid not null references profiles on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','dissolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  token_available_at timestamptz                           -- set on decline/dissolve = resolved_at + 30 days
);
-- one live declare per user; token gating enforced in declare-arch function
create unique index declares_one_live on declares (declarer) where status in ('pending','accepted');

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
```


Additional constraint (self-review): one live feud per pair per ordeal —

```sql
create unique index feuds_one_live_per_pair_ordeal
  on feuds (profile_a, profile_b, ordeal_id)
  where status in ('proposed','active');
```

Note on the taunt daily limit: `created_at::date` is UTC — "return at dawn" means UTC midnight. Acceptable for MVP; revisit if users complain about timezone dawn.

## 2. Row-level security (policies as code)

RLS enabled on every table. The security boundary is the database, not client goodwill.

```sql
-- profiles: own row full access; others' persona readable only via get_deck RPC
-- and active feud membership (no direct table scans of strangers).
create policy profiles_self on profiles for all using (id = auth.uid());
create policy profiles_feud_partner on profiles for select
  using (exists (select 1 from feuds f
    where f.status in ('active','ended')
      and ((f.profile_a = id and f.profile_b = auth.uid())
        or (f.profile_b = id and f.profile_a = auth.uid()))));

-- unmasked_identities: THE critical policy. Readable only with an unmasked arch pact.
create policy unmask_self on unmasked_identities for all using (profile_id = auth.uid());
create policy unmask_pact on unmasked_identities for select
  using (exists (select 1 from feuds f
    where f.is_arch and f.unmasked_at is not null and f.status = 'active'
      and ((f.profile_a = profile_id and f.profile_b = auth.uid())
        or (f.profile_b = profile_id and f.profile_a = auth.uid()))));

-- feuds / score_entries / taunts: members only (select); inserts require membership
-- and feud status = 'active'. Blocks: either direction kills all visibility (checked
-- in get_deck and via not exists(select 1 from blocks ...) added to each policy).
-- swipes: insert own, no reads of others' swipes.
-- ordeals: catalog readable by all; custom readable when moderation_status='approved'
-- or created_by = auth.uid().
-- declares: visible to declarer and target only.
-- reports: insert own; no client reads.
```

Full policy list to be materialized 1:1 in the initial migration; the four above are normative.

## 3. RPC (SQL functions, security definer)

**`get_deck(max_cards int default 20) → setof rival_card`**
Nearby (`st_dwithin` of both parties' radius), shares ≥1 approved ordeal with caller, not swiped by caller, no block either direction, not already in feud with caller. Returns persona fields + distance_km (rounded to 0.1) + shared ordeals with skill hints. Never returns location.

**`get_feud_summary(feud_id uuid) → jsonb`**
Both towers: cumulative totals, per-entry list with chronicled/rumor/disputed flags, normalization target (leader total for endless, goal for showdown), milestone markers.

## 4. Edge Functions (HTTP, authenticated)

| Function | Input | Behavior | Errors |
|---|---|---|---|
| `send-taunt` | `{feud_id, template_id, picks: int[]}` | validate membership + active + picks in bank range; insert; push to opponent | 403 not member · 409 feud not active · 429 daily taunt spent · 400 bad picks |
| `log-score` | `{feud_id, value, note?, proof_path?}` | validate; insert; check showdown goal reached → end feud, set winner; push opponent | 403 · 409 not active · 400 |
| `forge-ordeal` | `{name, unit, direction, language}` | profanity wordlist check → insert approved or rejected | 400 filtered ("This ordeal displeases the elders") |
| `declare-arch` | `{target}` | token available? no live declare? not blocked? → pending declare + push | 409 token spent/cooling · 403 |
| `resolve-declare` | `{declare_id, accept: bool}` | accept → arch feud + unmasked_at + push; decline → token_available_at = now()+30d | 403 not target · 409 resolved |
| `dissolve-arch` | `{feud_id}` | unmatch arch: dissolve feud, freeze chronicle, mutual invisibility, declarer token_available_at = now()+30d | 403 |
| `delete-account` | `{}` | cascade wipe + auth user deletion | — |

Push fan-out for match events (mutual swipe) via database webhook on `swipes` insert → `notify-match` function.

## 5. Realtime

Channel `feud:{id}` (members only, RLS-scoped): postgres_changes on `score_entries` and `taunts` for that feud — opponent's tower grows live, missives arrive live. Match notifications via push, not realtime.

## 6. Storage

Bucket `proofs`: authenticated upload to `proofs/{feud_id}/{entry_id}.jpg`, readable by feud members only (storage policy mirrors feud membership). Bucket `unmask-photos`: readable via same predicate as `unmasked_identities`.

## 7. Contract change rules

Schema changes only via migrations committed to `/spec/migrations`. Clients pin to contract version noted in this doc's header. Breaking changes require a version bump and a note here — native clients built later must be able to trust this file verbatim.

## 8. Amendments — 2026-07-10 (friends-first + disputes removed)

Normative changes; supersede conflicting text above.

**Disputes removed.** Drop `score_entries.disputed`. No dispute flow, no flag, no edge function. Rumors (null `proof_url`) count identically to chronicled entries everywhere; rendering differs only. `get_feud_summary` returns per-entry `chronicled: bool` and nothing else about verification.

**Location optional.** `profiles.location` and `radius_km` become nullable; set only when user opts into the deck. `get_deck` returns error `412 location_required` if caller has no location.

**Invites (primary flow):**

```sql
create table invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default encode(gen_random_bytes(6), 'base64url'),
  inviter uuid not null references profiles on delete cascade,
  ordeal_id uuid references ordeals,            -- optional pre-selected ordeal
  status text not null default 'pending'
    check (status in ('pending','accepted','expired','revoked')),
  accepted_by uuid references profiles,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
```

New Edge Functions:

| Function | Input | Behavior | Errors |
|---|---|---|---|
| `create-invite` | `{ordeal_id?}` | mint code; return deep link `nemesis://feud/{code}` + universal link | 429 max 10 pending invites |
| `accept-invite` | `{code}` | validate live + not self + not blocked → feud (status `proposed`) between inviter and caller; push inviter | 404 dead code · 410 expired · 409 already feuding |
| `revoke-invite` | `{invite_id}` | inviter cancels pending invite | 403 |

RLS: invites visible to inviter; `accept-invite` is security definer (code is the capability).

Deep linking: `nemesis://feud/{code}` + universal/app links on both platforms; store redirect carries code through install (deferred deep link) — implementation detail for the plan, contract fixes only the link shape.
**Direction removed.** Drop `ordeals.direction`. Scoring is always cumulative and "more is better" — inherent to the tower model. Lower-is-better metrics are represented as skill hints or as victory-count ordeals instead.
**Invite = complete challenge (glove throw).** `invites` gains full terms — `ordeal_id` becomes **required**, add `mode text not null check (mode in ('endless','showdown'))` and `goal_value numeric check ((mode = 'showdown') = (goal_value is not null))`. `create-invite` input becomes `{ordeal_id, mode, goal_value?}`. `accept-invite` creates the feud directly as **`active`** with the invite's terms — no negotiation, no `proposed` state for friend feuds (deck feuds keep `proposed` for their setup step). Recipient's only actions: accept or decline. Post-MVP option (not in contract yet): single counter-offer round, code-duello style.
**Implementation corrections (2026-07-10, from plan review):** (1) invite `code` uses `encode(gen_random_bytes(6), 'hex')` — Postgres has no base64url encoding and plain base64 emits `+`/`/` which break deep links. (2) The 1-taunt-per-day limit uses a defaulted `created_day date` column (`(now() at time zone 'utc')::date`) with a plain unique index — `timestamptz::date` is not immutable so it cannot live in an expression index.