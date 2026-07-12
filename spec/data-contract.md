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
**Implementation findings (2026-07-10, Task 7):**
1. **Grants required.** Migration must grant schema usage + table/sequence privileges to `anon`, `authenticated`, `service_role` (plus default privileges for future tables) — Postgres default ACLs give these roles no DML at all, and even Edge Functions (service_role) would fail without it. RLS remains the security boundary; grants only make it reachable. No blanket routine grants (PostGIS internals reject them) — future RPCs get per-function `EXECUTE`.
2. **Block-exclusion is RPC-level, deliberately.** Table policies do NOT weave `blocks` predicates. Rationale: block/unmatch mid-feud dissolves the feud (product spec), which already ends `profiles_feud_partner` visibility; deck exclusion happens in `get_deck`. The §2 prose suggesting per-policy `not exists(blocks)` is superseded.
3. **`scores_insert_own` policy is defense-in-depth, not the public API.** The blessed score path is the `log-score` Edge Function (goal completion + push). The RLS insert policy merely constrains any direct insert to active-feud members writing as themselves.
4. `pgcrypto` extension declared explicitly (invite codes use `gen_random_bytes`).

**Security hardening (2026-07-11, final review):**
5. **PostGIS installed in the `extensions` schema, not `public`** (`create extension postgis with schema extensions`). Its RLS-less `spatial_ref_sys` must stay out of PostgREST's exposed `public` schema — otherwise the anon key can DELETE SRID rows over REST. The `extensions` schema is on the search path, so `geography(point,4326)` and `st_dwithin` resolve unqualified. Future geo/extension work must not move PostGIS objects into `public`.
6. **Client roles get DML verbs only.** Public-schema grants are `select, insert, update, delete` (+ `usage, select` on sequences); a `revoke truncate, references, trigger ... from anon, authenticated` strips the extra verbs that Supabase's platform default ACL pre-grants. `service_role` (server-only, bypasses RLS) keeps full access. RLS remains the real boundary; these grants just bound the blast radius.

**Amendment 2026-07-11 (Plan 2): `forge-ordeal` demoted from Edge Function to Postgres RPC.** `forge_ordeal(p_name text, p_unit text, p_language text) returns ordeals` — security definer; validates length + profanity wordlist (new `banned_words(word text, language text)` table, service-only); inserts custom ordeal (`moderation_status 'approved'` on pass, raises exception with code `P0002` / message key `ordeal_rejected` on fail). Rationale: no push or external I/O — plain data validation doesn't justify Deno function infrastructure. Client calls `supabase.rpc('forge_ordeal', …)`. Auth for MVP: email + password (Apple/Google sign-in deferred to store-prep plan; magic-link deferred with them).

**Amendment 2026-07-11 (P2-10 e2e finding): `ordeals.created_by` references `auth.users`, not `profiles`.** Custom ordeals are forged mid-onboarding, before the persona (profiles row) exists — an FK to profiles can never hold at forge time. `on delete set null`: account deletion must not destroy ordeals other users' feuds reference. Test-design lesson recorded: integration fixtures must mirror the real client state (the original forge test pre-created a profile and masked this).

**Amendment 2026-07-11 (Plan 3a): invite operations are Postgres RPCs; goal completion is a trigger; `get_invite` added.**
- `create_invite(p_ordeal_id uuid, p_mode text, p_goal numeric) returns invites` — validates terms (mode/goal cross-check, ordeal approved), caps 10 pending per inviter, requires a profiles row.
- `get_invite(p_code text) returns jsonb` — security definer read for the invite landing: inviter persona (nemesis_name, mask_avatar_id), localized ordeal fields, mode, goal, status. Code is the capability; lazily marks expired invites.
- `accept_invite(p_code text) returns uuid` (feud id) — validates: invite pending + unexpired, caller has a profile, not self, no block either direction, no live feud for pair+ordeal; creates feud directly `active` with canonical pair order (`least/greatest`), marks invite accepted.
- `revoke_invite(p_invite_id uuid)` — inviter only, pending only.
- Push notifications for these events arrive in Plan 4 (Edge Functions/webhooks added there); the Edge-Function phrasing in §4 for invite ops is superseded — same rationale as forge_ordeal.
- **Showdown goal completion**: `after insert` trigger on `score_entries` — when a showdown feud's author total reaches `goal_value`, sets `status='ended'`, `winner`, `ended_at`. The `log-score` Edge Function's goal-check responsibility moves here; push side of log-score still lands in Plan 4.
- **`proofs` storage bucket** materialized via migration: private bucket, path convention `{feud_id}/{filename}`, object read/insert policies require feud membership derived from the first path segment.

**Amendment 2026-07-12 (Plan 4): taunts as RPC; push via caller-invoked `notify` Edge Function.**
- `send_taunt(p_feud_id uuid, p_template_id uuid, p_picks int[]) returns taunts` — security definer; validates membership + feud active, template exists, `array_length(p_picks,1) = slot_count`,each pick within its slot's bank range; unique-violation on the daily index maps to `taunt_spent`. §4's send-taunt EF row superseded.
- **`notify` Edge Function** (first EF): input `{kind: 'match'|'taunt'|'score', feud_id}`, caller JWT verified; confirms caller is a feud member, resolves opponent's `expo_push_token` + `language`, sends localized push via Expo Push API (`push_match`/`push_taunt`/`push_score` strings). No token → `{skipped:true}`. Invoked fire-and-forget by the ACTING client after accept_invite / send_taunt / log score. Trade-off accepted: sender-invoked push is not tamper-proof — push is best-effort UX; data integrity stays in RLS/RPC. Server-side webhooks can replace invocation later without client changes.
- `taunts` table added to `supabase_realtime` publication (missives appear live).
- `profiles.expo_push_token` written by client on permission grant; token acquisition may fail in dev/simulator — always optional.

**Amendment 2026-07-12 (owner decision, P4-6 walk): taunt daily limit REMOVED.** Taunts are unlimited per feud. Migration drops the `taunts_daily` unique index and the `created_day` column; `send_taunt`'s `taunt_spent` path becomes unreachable (kept as dead guard, harmless). The `forge_spent` copy stays in the deck as reserve. Product spec §7's "1 per day" rule is superseded.

**Amendment 2026-07-12 (Plan 5a): `block_user` RPC; `delete-account` EF confirmed; dead-session handling.**
- `block_user(p_target uuid) returns void` — security definer: inserts the block row AND dissolves all live feuds between the pair atomically (`status='dissolved'`, `ended_at=now()`), both directions checked. Plain client inserts into `blocks` remain possible (blocks_own policy) but the RPC is the blessed path — a block without feud dissolution violates the product spec.
- `delete-account` Edge Function (second EF): verifies caller JWT, service-role `auth.admin.deleteUser(uid)` — FK cascades wipe profiles/feuds/scores/taunts (per §1 `on delete cascade`); custom ordeals survive with `created_by = null` (2026-07-11 amendment).
- **Dead-session rule:** clients must detect a valid-JWT-but-deleted-user state (server `getUser()` failure / user_not_found) and force `signOut()` — sessions outlive accounts by design of JWTs.
- Font license verification consciously deferred by owner (2026-07-12) — tracked for store prep, not a Plan 5/6 blocker.

**Amendment 2026-07-12 (owner decisions, P5a-7 walk): stealth block; blocks permanent; erase FK unblock.**
- **Stealth block (migration 0013):** `get_invite` and `accept_invite` raise `invite_dead` — not `blocked` — when a block exists in either direction between caller and inviter. The blocked party must never learn a block exists; a blocked pair's summons is indistinguishable from an expired/revoked one ("faded into legend"). The invite row stays `pending` so the blocker's own pending list is unaffected. §4's `accept-invite` blocked-→-403 row and the older `blocked` exception text are superseded.
- **Blocks are permanent by design.** No unblock RPC, no UI, no plan to add one. Banish copy already warns ("They will not find thee again"). A block is an irreversible safety action, not a mute.
- **Erase FK unblock (migration 0012):** `invites.accepted_by`, `reports.target` (NOT NULL dropped), and `feuds.winner` are now `on delete set null` — previously they had no ON DELETE action, so `delete-account` failed for any user who had ever accepted an invite (found live in the walk). Reports survive erasure as anonymized moderation records; the inviter keeps their invite history.
