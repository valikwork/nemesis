# Nemesis Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootable Expo app with design tokens, EN/UA i18n, and a deployed-locally Supabase schema matching the Data Contract — the base every feature plan builds on.

**Architecture:** Expo (expo-router, TypeScript) client; Supabase (Postgres + RLS) backend managed via supabase CLI migrations committed to the repo. Specs synced from Obsidian into `/spec` as the in-repo source of truth. All UI reads colors/spacing from a tokens module; all strings go through i18next.

**Tech Stack:** Expo SDK (latest), expo-router, TypeScript, jest-expo, i18next + expo-localization, supabase CLI (requires Docker for local stack), @supabase/supabase-js.

**Specs:** Obsidian vault `NEMESIS/` — Design Spec, Data Contract, Design System Spec, Copy Deck. Task 1 syncs them into `/spec`.

**Out of scope (future plans):** onboarding/auth screens, invites, feud screens, towers, taunts, deck, declare, settings, push, fonts (licenses unverified — tokens reference font slots but only system fonts load for now).

---

### Task 1: Repo init + spec sync

**Files:**
- Create: `.gitignore`, `README.md`, `spec/README.md`
- Create: `spec/design-spec.md`, `spec/data-contract.md`, `spec/design-system.md`, `spec/copy-deck.md`

- [ ] **Step 1: Init repo**

```bash
cd /Users/valentyn/Documents/github/nemesis
git init -b main
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
.expo/
dist/
*.log
.env
.env.*
!.env.example
supabase/.temp/
coverage/
```

- [ ] **Step 3: Write `README.md`**

```markdown
# NEMESIS

Know thy enemy. Half-joke, fully functional rivalry app: summon friends (or nearby
strangers) into Feuds, race score towers in any Ordeal, exchange forged taunts.

Spec-driven: `/spec` holds the four canonical artifacts (synced from the owner's
Obsidian vault, folder `NEMESIS/`). Code must not contradict them; change the spec
first, then the code.

- Client: Expo (React Native, expo-router, TypeScript)
- Backend: Supabase (Postgres, RLS, Edge Functions) — migrations in `/supabase`
- Localization: EN + UA from day one
```

- [ ] **Step 4: Sync the four specs from Obsidian into `/spec`**

Using the Obsidian MCP tool `obsidian_get_file_contents`, fetch each of:
`NEMESIS/Nemesis App — Design Spec.md`, `NEMESIS/Nemesis App — Data Contract.md`,
`NEMESIS/Nemesis App — Design System Spec.md`, `NEMESIS/Nemesis App — Copy Deck.md`
and write the contents verbatim to `spec/design-spec.md`, `spec/data-contract.md`,
`spec/design-system.md`, `spec/copy-deck.md`.

Then write `spec/README.md`:

```markdown
# Spec artifacts

Canonical source: owner's Obsidian vault, folder `NEMESIS/`. These copies are
synced snapshots — when they drift, Obsidian wins for product intent, the SQL in
`/supabase/migrations` wins for what is actually deployed.

1. `design-spec.md` — product spec (what and why)
2. `data-contract.md` — schema, RLS, Edge Functions, realtime (amendments in §8 supersede earlier sections)
3. `design-system.md` — tokens, typography tiers, screens, components
4. `copy-deck.md` — all EN/UA strings, taunt banks, ordeal catalog
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: init repo with spec artifacts"
```

### Task 2: Expo scaffold

**Files:**
- Create: Expo app in repo root (create-expo-app writes `app/`, `package.json`, `tsconfig.json`, `app.json`, `assets/`)

- [ ] **Step 1: Scaffold**

```bash
cd /Users/valentyn/Documents/github/nemesis
npx create-expo-app@latest . --template default --yes
```

Note: directory is non-empty (git + docs + spec); create-expo-app tolerates this. If it refuses, scaffold into `/tmp` and move contents in, preserving our files.

- [ ] **Step 2: Verify TypeScript + expo-router present**

Run: `npx tsc --noEmit` — Expected: exit 0.
Check `package.json` has `expo-router`. Default template ships it; if missing: `npx expo install expo-router`.

- [ ] **Step 3: Strip template demo screens**

Delete example content so `app/` contains only `_layout.tsx` and `index.tsx` (rewritten in Task 6). Keep `assets/`.

- [ ] **Step 4: App identity in `app.json`**

Set `"name": "Nemesis"`, `"slug": "nemesis"`, `"scheme": "nemesis"` (deep links per Data Contract §8), `"userInterfaceStyle": "dark"`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold expo app (typescript, expo-router, dark-only)"
```

### Task 3: Test harness

**Files:**
- Modify: `package.json`
- Create: `src/lib/__tests__/smoke.test.ts`

- [ ] **Step 1: Install jest-expo**

```bash
npx expo install jest-expo jest @types/jest --dev
```

- [ ] **Step 2: Configure in `package.json`**

```json
{
  "scripts": { "test": "jest" },
  "jest": { "preset": "jest-expo" }
}
```

- [ ] **Step 3: Write smoke test `src/lib/__tests__/smoke.test.ts`**

```ts
describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run**

Run: `npm test` — Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test: add jest-expo harness"
```

### Task 4: Design tokens

Source: Design System Spec §1–2, §4. Fonts NOT bundled yet (licenses unverified) — tier config carries font-family names with `undefined` files, resolving to system font.

**Files:**
- Create: `src/theme/tokens.ts`, `src/theme/brutality.ts`
- Test: `src/theme/__tests__/tokens.test.ts`

- [ ] **Step 1: Write failing test `src/theme/__tests__/tokens.test.ts`**

```ts
import { colors, spacing, radii } from '../tokens';
import { brutalityTiers, tierFor } from '../brutality';

describe('tokens', () => {
  it('never uses pure white or black', () => {
    const all = Object.values(colors).join(',').toLowerCase();
    expect(all).not.toContain('#fff');
    expect(all).not.toContain('#ffffff');
    expect(all).not.toContain('#000');
  });
  it('has the normative palette', () => {
    expect(colors.bone).toBe('#e8e4da');
    expect(colors.ink).toBe('#0a0510');
    expect(colors.blood).toBe('#c9203a');
    expect(colors.venom).toBe('#8a3aa8');
  });
  it('spacing scale matches spec', () => {
    expect(spacing).toEqual([4, 8, 12, 16, 24, 32]);
  });
  it('radii match spec', () => {
    expect(radii).toEqual({ card: 14, button: 6, chip: 3 });
  });
});

describe('brutality', () => {
  it('has 5 tiers with mutation data', () => {
    expect(brutalityTiers).toHaveLength(5);
    expect(brutalityTiers[3].numerals).toBe('roman');
    expect(brutalityTiers[4].accent).toBe('party');
  });
  it('tierFor clamps out-of-range values', () => {
    expect(tierFor(0).level).toBe(1);
    expect(tierFor(99).level).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: FAIL, cannot find module '../tokens'.

- [ ] **Step 3: Write `src/theme/tokens.ts`**

```ts
// Design System Spec §1–2. Never pure #fff/#000 — bone and void are the extremes.
export const colors = {
  void: '#060507',
  ink: '#0a0510',
  crypt: '#100a1a',
  cryptRaised: '#140d21',
  bone: '#e8e4da',
  ash: '#a8a29a',
  smoke: '#5c5450',
  venom: '#8a3aa8',
  venomDim: '#3a2454',
  venomDeep: '#6d5a86',
  blood: '#c9203a',
  bloodDeep: '#6e1111',
  bloodMist: '#4a0d18',
} as const;

export const semantic = {
  bg: colors.ink,
  surface: colors.crypt,
  border: colors.venomDim,
  text: colors.bone,
  text2: colors.ash,
  text3: colors.smoke,
  accent: colors.blood,
  accent2: colors.venom,
} as const;

export const spacing = [4, 8, 12, 16, 24, 32] as const;
export const radii = { card: 14, button: 6, chip: 3 } as const;
```

- [ ] **Step 4: Write `src/theme/brutality.ts`**

```ts
// Design System Spec §3–4. Fonts resolve to system until licensed files land.
export type FontSlot = 'logo' | 'display' | 'label' | 'body' | 'numeral';

export interface BrutalityTier {
  level: 1 | 2 | 3 | 4 | 5;
  nameKey: string; // i18n key, e.g. 'brutality.1'
  fonts: Record<FontSlot, string | undefined>; // family name; undefined → system
  dividers: 'straight' | 'jagged' | 'jagged-doubled' | 'streamers';
  radiiScale: number; // multiplier on radii
  buttonTiltDeg: number; // max random rotation
  numerals: 'arabic' | 'roman';
  accent: 'blood-venom' | 'blood' | 'party';
}

export const brutalityTiers: BrutalityTier[] = [
  { level: 1, nameKey: 'brutality.1', fonts: { logo: 'Maskdown', display: 'Pickyside', label: 'Pickyside', body: undefined, numeral: undefined }, dividers: 'straight', radiiScale: 1, buttonTiltDeg: 0, numerals: 'arabic', accent: 'blood-venom' },
  { level: 2, nameKey: 'brutality.2', fonts: { logo: 'Maskdown', display: 'SoulsideBetrayed', label: 'SoulsideBetrayed', body: undefined, numeral: undefined }, dividers: 'jagged', radiiScale: 1, buttonTiltDeg: 0, numerals: 'arabic', accent: 'blood-venom' },
  { level: 3, nameKey: 'brutality.3', fonts: { logo: 'Maskdown', display: 'Arathos', label: 'Arathos', body: 'Pickyside', numeral: undefined }, dividers: 'jagged', radiiScale: 0.75, buttonTiltDeg: 1, numerals: 'arabic', accent: 'blood-venom' },
  { level: 4, nameKey: 'brutality.4', fonts: { logo: 'Maskdown', display: 'Maskdown', label: 'Maskdown', body: 'SoulsideBetrayed', numeral: undefined }, dividers: 'jagged-doubled', radiiScale: 0, buttonTiltDeg: 3, numerals: 'roman', accent: 'blood' },
  { level: 5, nameKey: 'brutality.5', fonts: { logo: 'BagelFatOne', display: 'BagelFatOne', label: 'BagelFatOne', body: 'BagelFatOne', numeral: 'BagelFatOne' }, dividers: 'streamers', radiiScale: 1.2, buttonTiltDeg: 5, numerals: 'arabic', accent: 'party' },
];

export function tierFor(level: number): BrutalityTier {
  const clamped = Math.min(5, Math.max(1, Math.round(level)));
  return brutalityTiers[clamped - 1];
}
```

- [ ] **Step 5: Run tests**

Run: `npm test` — Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: design tokens and brutality tier config"
```

### Task 5: i18n (EN + UA)

Source: Copy Deck. Seed with glossary/onboarding/feud/forge/brutality strings; feature plans extend the same files.

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/en.json`, `src/i18n/uk.json`
- Test: `src/i18n/__tests__/i18n.test.ts`

- [ ] **Step 1: Install**

```bash
npx expo install i18next react-i18next expo-localization
```

- [ ] **Step 2: Write failing test `src/i18n/__tests__/i18n.test.ts`**

```ts
import en from '../en.json';
import uk from '../uk.json';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n catalogs', () => {
  it('en and uk have identical key sets', () => {
    expect(keysOf(uk).sort()).toEqual(keysOf(en).sort());
  });
  it('no empty strings', () => {
    const all = [...keysOf(en), ...keysOf(uk)];
    expect(all.length).toBeGreaterThan(20);
    const flat = JSON.stringify([en, uk]);
    expect(flat).not.toContain('""');
  });
  it('core glossary present', () => {
    expect(en.glossary.feud).toBe('Feud');
    expect(uk.glossary.feud).toBe('Ворожнеча');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test` — Expected: FAIL, cannot find '../en.json'.

- [ ] **Step 4: Write `src/i18n/en.json`** (from Copy Deck; verbatim strings)

```json
{
  "glossary": { "ordeal": "Ordeal", "feud": "Feud", "showdown": "Showdown", "chronicled": "Chronicled", "rumor": "Rumor", "arch": "Arch-Nemesis", "summon": "Summon" },
  "tagline": "Iron hardens Iron",
  "onboarding": {
    "welcomeTitle": "Iron makes steel stronger.",
    "welcomeBody": "Complacency will be the death of you. Find a nemesis.",
    "maskTitle": "Choose thy mask",
    "nameTitle": "Name thyself",
    "namePlaceholder": "Doomrider Kevin",
    "catchphraseTitle": "Thy catchphrase",
    "catchphrasePlaceholder": "Ahha, we meet again.",
    "bioTitle": "Why would you make a worthy nemesis?",
    "ordealsTitle": "Choose thy ordeals",
    "forgeCta": "Forge your own ordeal",
    "notificationsAsk": "Allow thy nemesis to disturb thy peace?"
  },
  "feud": {
    "modeEndless": "Endless feud",
    "modeShowdown": "Showdown — first to {{goal}}",
    "logDeed": "Log thy deed",
    "proofHint": "Without proof, this is but a rumor. Rumors count all the same.",
    "goneSoft": "Thy rival has gone soft.",
    "victory": "VICTORY",
    "defeat": "DEFEAT",
    "buried": "Buried feuds"
  },
  "forge": { "title": "Taunt Forge", "subtitle": "Compose thy insult", "send": "Send message", "spent": "Thy venom is spent. Return at dawn." },
  "summon": { "cta": "Summon a friend", "pending": "The summons is sent. Awaiting thy foe.", "dead": "This summons has faded into legend." },
  "brutality": { "1": "Soft", "2": "Hard", "3": "Hardcore", "4": "I don't care", "5": "I REALLY don't care" }
}
```

- [ ] **Step 5: Write `src/i18n/uk.json`** (verbatim from Copy Deck UA column)

```json
{
  "glossary": { "ordeal": "Випробування", "feud": "Ворожнеча", "showdown": "Протистояння", "chronicled": "Закарбовано", "rumor": "Чутки", "arch": "Архіворог", "summon": "Поклик" },
  "tagline": "Залізо гартує залізо",
  "onboarding": {
    "welcomeTitle": "Залізо гартує сталь.",
    "welcomeBody": "Самовдоволення тебе погубить. Знайди собі ворога.",
    "maskTitle": "Обери свою маску",
    "nameTitle": "Назви себе",
    "namePlaceholder": "Вісник Погибелі Толік",
    "catchphraseTitle": "Твоє гасло",
    "catchphrasePlaceholder": "Ось ми і зустрілися знову.",
    "bioTitle": "Чому з тебе вийде гідний ворог?",
    "ordealsTitle": "Обери своє випробування",
    "forgeCta": "Викуй власне випробування",
    "notificationsAsk": "Дозволити ворогові порушувати твій спокій?"
  },
  "feud": {
    "modeEndless": "Вічна ворожнеча",
    "modeShowdown": "Протистояння — хто перший до {{goal}}",
    "logDeed": "Закарбуй свій чин",
    "proofHint": "Без доказу це лише чутки. Та чутки теж рахуються.",
    "goneSoft": "Твій суперник розм'як.",
    "victory": "ПЕРЕМОГА",
    "defeat": "ПОРАЗКА",
    "buried": "Поховані ворожнечі"
  },
  "forge": { "title": "Кузня образ", "subtitle": "Склади свою образу", "send": "Надіслати образу", "spent": "Твої образи закінчилися. Повертайся на світанку." },
  "summon": { "cta": "Поклич друга", "pending": "Поклик надіслано. Чекаємо на твого ворога.", "dead": "Цей поклик розчинився в легендах." },
  "brutality": { "1": "М'яко", "2": "Жорстко", "3": "Хардкор", "4": "Мені начхати", "5": "Мені СПРАВДІ начхати" }
}
```

- [ ] **Step 6: Write `src/i18n/index.ts`**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './en.json';
import uk from './uk.json';

const deviceLang = getLocales()[0]?.languageCode ?? 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, uk: { translation: uk } },
  lng: deviceLang === 'uk' ? 'uk' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
```

- [ ] **Step 7: Run tests**

Run: `npm test` — Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: i18n with EN/UA catalogs from copy deck"
```

### Task 6: App shell

**Files:**
- Create: `app/_layout.tsx`, `app/index.tsx`

- [ ] **Step 1: Write `app/_layout.tsx`**

```tsx
import { Stack } from 'expo-router';
import { semantic } from '../src/theme/tokens';
import '../src/i18n';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: semantic.bg },
        headerTintColor: semantic.text,
        contentStyle: { backgroundColor: semantic.bg },
        headerShown: false,
      }}
    />
  );
}
```

- [ ] **Step 2: Write `app/index.tsx`** (placeholder home = future feud list)

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, semantic, spacing } from '../src/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.tagline}>{t('tagline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  logo: { color: semantic.text, fontSize: 44, letterSpacing: 6 },
  tagline: { color: colors.venomDeep, fontSize: 14, letterSpacing: 2 },
});
```

- [ ] **Step 3: Verify boot**

Run: `npx expo start` and open in iOS simulator or Expo Go.
Expected: near-black screen (`#0a0510`), bone "NEMESIS", purple tagline "Iron hardens Iron" (or «Залізо гартує залізо» on a UA-locale device).

- [ ] **Step 4: Run full test suite**

Run: `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: app shell with themed home placeholder"
```

### Task 7: Supabase schema migration

Source: Data Contract §1 with §8 amendments applied — no `disputed`, no `direction`, nullable location, invites carry full terms.

**Files:**
- Create: `supabase/migrations/00000000000001_foundation.sql`
- Create: `.env.example`

Prerequisite: Docker running; `supabase` CLI installed (`brew install supabase/tap/supabase`).

- [ ] **Step 1: Init supabase project files**

```bash
cd /Users/valentyn/Documents/github/nemesis
supabase init
```

- [ ] **Step 2: Write migration `supabase/migrations/00000000000001_foundation.sql`**

```sql
create extension if not exists postgis;

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
  -- created_day is a plain defaulted column, not an expression index:
  -- timestamptz::date is not immutable, so it cannot be used in an index expression.
  created_day date not null default (now() at time zone 'utc')::date
);

create unique index taunts_daily on taunts (feud_id, author, created_day);

create table invites (
  id uuid primary key default gen_random_uuid(),
  -- hex, not base64: postgres encode() has no base64url and base64 emits +/ which break deep links
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
```

Note: taunt inserts, invite create/accept, and declare mutations go through Edge Functions (service role) in later plans — no client insert policies for them on purpose.

- [ ] **Step 3: Start local stack and apply**

```bash
supabase start
supabase db reset
```

Expected: reset completes, migration applies with no errors.

- [ ] **Step 4: Verify schema**

```bash
supabase db diff
```

Expected: "No schema changes found". Also spot-check:

```bash
psql "$(supabase status --output json | python3 -c 'import json,sys; print(json.load(sys.stdin)["DB_URL"])')" -c '\dt public.*'
```

Expected: 14 tables listed.

- [ ] **Step 5: Write `.env.example`**

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=get-from-supabase-status
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: supabase foundation schema with RLS"
```

### Task 8: Supabase client + RLS smoke test

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `src/lib/__tests__/rls.integration.test.ts`
- Modify: `package.json` (script)

- [ ] **Step 1: Install client**

```bash
npx expo install @supabase/supabase-js react-native-url-polyfill @react-native-async-storage/async-storage
```

- [ ] **Step 2: Write `src/lib/supabase.ts`**

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
});
```

- [ ] **Step 3: Write failing integration test `src/lib/__tests__/rls.integration.test.ts`**

Runs against local stack (node environment, plain supabase-js, no RN deps). The critical assertion: a stranger cannot read another user's `unmasked_identities` row.

```ts
/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const maybe = anon && service ? describe : describe.skip;

maybe('RLS: unmasking is hidden pre-pact', () => {
  it('stranger cannot read unmasked identity', async () => {
    const admin = createClient(url, service);
    const email = (n: string) => `${n}-${Date.now()}@test.local`;
    const { data: a } = await admin.auth.admin.createUser({ email: email('a'), password: 'pass1234!', email_confirm: true });
    const { data: b } = await admin.auth.admin.createUser({ email: email('b'), password: 'pass1234!', email_confirm: true });
    await admin.from('profiles').insert([
      { id: a.user!.id, nemesis_name: 'Doomrider Kevin' },
      { id: b.user!.id, nemesis_name: 'Gravemind Karol' },
    ]);
    await admin.from('unmasked_identities').insert({ profile_id: a.user!.id, real_name: 'Kevin Real' });

    const clientB = createClient(url, anon);
    await clientB.auth.signInWithPassword({ email: b.user!.email!, password: 'pass1234!' });
    const { data: leak } = await clientB.from('unmasked_identities').select('*').eq('profile_id', a.user!.id);
    expect(leak).toEqual([]); // RLS must hide it — no arch pact exists
  });
});
```

- [ ] **Step 4: Run with local keys**

Get keys: `supabase status` (anon + service_role).

```bash
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon> SUPABASE_SERVICE_ROLE_KEY=<service> npm test -- rls.integration
```

Expected: PASS (empty result for the stranger). Without keys the suite self-skips, so `npm test` stays green in isolation.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: supabase client and RLS unmasking smoke test"
```

### Task 9: Ordeal catalog seed

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Write `supabase/seed.sql`** (full 34-row catalog from Copy Deck §9; excerpt pattern below, include every row)

```sql
insert into ordeals (name_en, name_uk, unit_en, unit_uk) values
  ('Running', 'Біг', 'km', 'км'),
  ('Cycling', 'Велосипед', 'km', 'км'),
  ('Swimming', 'Плавання', 'km', 'км'),
  ('Hiking', 'Похід', 'km', 'км'),
  ('Steps walked', 'Пройдені кроки', 'steps', 'кроки'),
  ('Push-ups', 'Віджимання', 'reps', 'рази'),
  ('Pull-ups', 'Підтягування', 'reps', 'рази'),
  ('Gym sessions', 'Походи в зал', 'sessions', 'тренування'),
  ('Climbing routes', 'Скелелазні траси', 'routes', 'траси'),
  ('Cold showers', 'Крижані душі', 'showers', 'душі'),
  ('Chess victories', 'Шахові звитяги', 'wins', 'перемоги'),
  ('Board game victories', 'Звитяги в настолках', 'wins', 'перемоги'),
  ('Poker nights won', 'Виграні покерні вечори', 'wins', 'перемоги'),
  ('Darts victories', 'Звитяги в дартс', 'wins', 'перемоги'),
  ('Bowling victories', 'Звитяги в боулінг', 'wins', 'перемоги'),
  ('Billiards victories', 'Звитяги в більярд', 'wins', 'перемоги'),
  ('Table tennis victories', 'Звитяги в настільний теніс', 'wins', 'перемоги'),
  ('Mario Kart victories', 'Перемоги в Mario Kart', 'wins', 'перемоги'),
  ('FIFA victories', 'Перемоги у FIFA', 'wins', 'перемоги'),
  ('Pages read', 'Прочитані сторінки', 'pages', 'сторінки'),
  ('Books finished', 'Дочитані книги', 'books', 'книги'),
  ('Words written', 'Написані слова', 'words', 'слова'),
  ('Fish caught', 'Спіймана риба', 'fish', 'рибини'),
  ('Sunrises witnessed', 'Зустрінуті світанки', 'sunrises', 'світанки'),
  ('Saunas endured', 'Пережиті сауни', 'saunas', 'сауни'),
  ('Concerts survived', 'Пережиті концерти', 'concerts', 'концерти'),
  ('Countries visited', 'Відвідані країни', 'countries', 'країни'),
  ('Cities conquered', 'Підкорені міста', 'cities', 'міста'),
  ('Beer drunk', 'Випите пиво', 'liters', 'літри'),
  ('Coffee drunk', 'Випита кава', 'cups', 'чашки'),
  ('Pizzas devoured', 'Поглинуті піци', 'pizzas', 'піци'),
  ('Varenyky devoured', 'Поглинуті вареники', 'pieces', 'штуки'),
  ('Days without sugar', 'Дні без цукру', 'days', 'дні'),
  ('Days without alcohol', 'Дні без алкоголю', 'days', 'дні');
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
psql "$(supabase status --output json | python3 -c 'import json,sys; print(json.load(sys.stdin)["DB_URL"])')" -c 'select count(*) from ordeals;'
```

Expected: `34`.

- [ ] **Step 3: Run full test suite one last time**

Run: `npm test` — Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: seed ordeal catalog (34 ordeals, EN/UA)"
```
