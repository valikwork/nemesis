# Nemesis Identity & Onboarding Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new user can sign up (email+password), forge a persona (mask, nemesis name, catchphrase, bio), pick or forge ordeals with skill hints, and land on a home screen that greets their persona — with the profile durably in Supabase and every constraint enforced both client- and DB-side.

**Architecture:** expo-router route groups — `(auth)` for sign-in/up, `(onboarding)` for the wizard, root `index` as home. A session provider wraps the app; a pure `routeFor()` function decides redirects (testable without navigation). Onboarding answers accumulate in an AsyncStorage-persisted draft (resume-safe); profile + profile_ordeals rows are written only at the final step. Custom ordeals go through a `forge_ordeal` Postgres RPC (contract amendment 2026-07-11) with a `banned_words` wordlist table.

**Tech Stack:** existing foundation (Expo SDK 57, expo-router, jest projects app/integration, i18next, tokens/brutality, @supabase/supabase-js, local supabase stack).

**Spec sources:** spec/design-spec.md §3 (core loop step 1), spec/design-system.md §5 (Onboarding, Home), spec/copy-deck.md §2 (strings — already in i18n catalogs), spec/data-contract.md §1 + amendments.

**Out of scope (later plans):** invites/feuds (Plan 3), taunts + push notifications incl. the notifications-permission onboarding step (Plan 4 — spec's onboarding lists it; deferred to land WITH push infrastructure so the permission prompt isn't a dead toggle), deck/location, arch declare, settings screen, real mask artwork (placeholder sigil tiles now), Apple/Google auth.

**Conventions:** all RTL `render()` calls are `await`ed (RTL v14). Integration tests live in the `integration` jest project (node env, self-skip without env keys). UA/EN strings only via i18n keys — the catalogs already hold all onboarding copy.

---

### Task 1: Migration — banned_words + forge_ordeal RPC + profiles insert policy check

**Files:**
- Create: `supabase/migrations/00000000000002_forge_ordeal.sql`
- Test: `src/lib/__tests__/forge-ordeal.integration.test.ts`

- [ ] **Step 1: Write failing integration test** `src/lib/__tests__/forge-ordeal.integration.test.ts`

```ts
/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const maybe = anon && service ? describe : describe.skip;

async function freshUser(prefix: string) {
  const admin = createClient(url, service);
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
  expect(error).toBeNull();
  await admin.from('profiles').insert({ id: data.user!.id, nemesis_name: 'Forge Tester' });
  const client = createClient(url, anon);
  const { error: se } = await client.auth.signInWithPassword({ email, password: 'pass1234!' });
  expect(se).toBeNull();
  return client;
}

maybe('forge_ordeal RPC', () => {
  it('creates an approved custom ordeal for a clean name', async () => {
    const client = await freshUser('forge-ok');
    const { data, error } = await client.rpc('forge_ordeal', {
      p_name: `Yodeling ${Date.now()}`,
      p_unit: 'yodels',
      p_language: 'en',
    });
    expect(error).toBeNull();
    expect(data.is_custom).toBe(true);
    expect(data.moderation_status).toBe('approved');
    expect(data.name_custom).toContain('Yodeling');
  });

  it('rejects a name containing a banned word', async () => {
    const client = await freshUser('forge-bad');
    const { error } = await client.rpc('forge_ordeal', {
      p_name: 'testbanned contest',
      p_unit: 'x',
      p_language: 'en',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('ordeal_rejected');
  });

  it('rejects unauthenticated calls', async () => {
    const client = createClient(url, anon);
    const { error } = await client.rpc('forge_ordeal', { p_name: 'Sneaky', p_unit: 'x', p_language: 'en' });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
ANON=$(supabase status -o env | grep ANON_KEY | cut -d= -f2 | tr -d '"'); SERVICE=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d= -f2 | tr -d '"'); EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON SUPABASE_SERVICE_ROLE_KEY=$SERVICE npm test -- forge-ordeal
```

Expected: FAIL — function forge_ordeal does not exist.

- [ ] **Step 3: Write migration** `supabase/migrations/00000000000002_forge_ordeal.sql`

```sql
-- Contract amendment 2026-07-11: forge-ordeal as Postgres RPC (not Edge Function).

create table banned_words (
  word text not null,
  language text not null check (language in ('en','uk')),
  primary key (word, language)
);

alter table banned_words enable row level security;
-- no policies: service/definer access only; clients never read the list
revoke all on table banned_words from anon, authenticated;

-- Seed a starter wordlist. Deliberately small; grows via later migrations.
-- 'testbanned' exists solely for integration tests.
insert into banned_words (word, language) values
  ('testbanned', 'en'),
  ('nigger', 'en'), ('faggot', 'en'), ('cunt', 'en'),
  ('хуй', 'uk'), ('пізда', 'uk'), ('підар', 'uk'), ('блядь', 'uk');

create or replace function forge_ordeal(p_name text, p_unit text, p_language text)
returns ordeals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordeal ordeals;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_language not in ('en','uk') then
    raise exception 'bad_language';
  end if;
  if char_length(trim(p_name)) not between 2 and 40 then
    raise exception 'ordeal_rejected';
  end if;
  if char_length(trim(p_unit)) not between 1 and 20 then
    raise exception 'ordeal_rejected';
  end if;
  if exists (
    select 1 from banned_words b
    where lower(p_name) like '%' || b.word || '%'
       or lower(p_unit) like '%' || b.word || '%'
  ) then
    raise exception 'ordeal_rejected' using errcode = 'P0002';
  end if;

  insert into ordeals (name_custom, unit_custom, is_custom, created_by, language, moderation_status)
  values (trim(p_name), trim(p_unit), true, auth.uid(), p_language, 'approved')
  returning * into v_ordeal;
  return v_ordeal;
end;
$$;

-- definer function: explicit, minimal execute grants (see contract: no blanket routine grants)
revoke execute on function forge_ordeal(text, text, text) from public;
grant execute on function forge_ordeal(text, text, text) to authenticated;
```

Note: the banned-word check deliberately scans both languages' words regardless of p_language — slurs are slurs in any field.

- [ ] **Step 4: Apply and re-run test**

```bash
supabase db reset
```

Then re-run the Step 2 command. Expected: 3 tests pass. Also bare `npm test` still green (integration skipped without keys).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: banned_words table and forge_ordeal rpc"
```

### Task 2: Validation module (mirrors DB constraints)

**Files:**
- Create: `src/lib/validation.ts`
- Test: `src/lib/__tests__/validation.test.ts`

- [ ] **Step 1: Write failing test** `src/lib/__tests__/validation.test.ts`

```ts
import { validateNemesisName, validateCatchphrase, validateBio, validateSkillHint, validateOrdealName, validateOrdealUnit } from '../validation';

describe('validation (mirrors data-contract checks)', () => {
  it('nemesis name: 2-40 chars, trimmed', () => {
    expect(validateNemesisName('Doomrider Kevin')).toBeNull();
    expect(validateNemesisName(' x ')).toBe('tooShort');
    expect(validateNemesisName('')).toBe('tooShort');
    expect(validateNemesisName('a'.repeat(41))).toBe('tooLong');
    expect(validateNemesisName('ab')).toBeNull();
  });
  it('catchphrase: optional, max 80', () => {
    expect(validateCatchphrase('')).toBeNull();
    expect(validateCatchphrase('a'.repeat(80))).toBeNull();
    expect(validateCatchphrase('a'.repeat(81))).toBe('tooLong');
  });
  it('bio: optional, max 500', () => {
    expect(validateBio('')).toBeNull();
    expect(validateBio('a'.repeat(501))).toBe('tooLong');
  });
  it('skill hint: optional, max 30', () => {
    expect(validateSkillHint('1450 elo')).toBeNull();
    expect(validateSkillHint('a'.repeat(31))).toBe('tooLong');
  });
  it('custom ordeal name 2-40 / unit 1-20', () => {
    expect(validateOrdealName('Yodeling')).toBeNull();
    expect(validateOrdealName('y')).toBe('tooShort');
    expect(validateOrdealUnit('yodels')).toBeNull();
    expect(validateOrdealUnit('')).toBe('tooShort');
    expect(validateOrdealUnit('a'.repeat(21))).toBe('tooLong');
  });
});
```

- [ ] **Step 2: Run — fails** (module missing).

- [ ] **Step 3: Implement** `src/lib/validation.ts`

```ts
// Client-side mirrors of data-contract length checks. DB constraints remain
// the source of truth; these exist for instant form feedback.
export type ValidationError = 'tooShort' | 'tooLong' | null;

function lengthBetween(value: string, min: number, max: number): ValidationError {
  const len = value.trim().length;
  if (len < min) return 'tooShort';
  if (len > max) return 'tooLong';
  return null;
}

export const validateNemesisName = (v: string) => lengthBetween(v, 2, 40);
export const validateCatchphrase = (v: string) => (v.trim() === '' ? null : lengthBetween(v, 0, 80));
export const validateBio = (v: string) => (v.trim() === '' ? null : lengthBetween(v, 0, 500));
export const validateSkillHint = (v: string) => (v.trim() === '' ? null : lengthBetween(v, 0, 30));
export const validateOrdealName = (v: string) => lengthBetween(v, 2, 40);
export const validateOrdealUnit = (v: string) => lengthBetween(v, 1, 20);
```

- [ ] **Step 4: Run — passes.** `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: form validation mirroring db constraints"`

### Task 3: Onboarding draft store

**Files:**
- Create: `src/onboarding/draft.ts`
- Test: `src/onboarding/__tests__/draft.test.ts`

- [ ] **Step 1: Write failing test** `src/onboarding/__tests__/draft.test.ts`

```ts
import { emptyDraft, saveDraft, loadDraft, clearDraft, type OnboardingDraft } from '../draft';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('onboarding draft', () => {
  beforeEach(async () => { await clearDraft(); });

  it('loads empty draft when nothing saved', async () => {
    expect(await loadDraft()).toEqual(emptyDraft);
  });

  it('round-trips a partial draft', async () => {
    const draft: OnboardingDraft = {
      ...emptyDraft,
      maskAvatarId: 'skull_03',
      nemesisName: 'Doomrider Kevin',
      ordeals: [{ ordealId: 'uuid-1', skillHint: '1450 elo' }],
    };
    await saveDraft(draft);
    expect(await loadDraft()).toEqual(draft);
  });

  it('clear resets to empty', async () => {
    await saveDraft({ ...emptyDraft, nemesisName: 'X Y' });
    await clearDraft();
    expect(await loadDraft()).toEqual(emptyDraft);
  });

  it('survives corrupt stored json', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('nemesis.onboarding.draft', '{not json');
    expect(await loadDraft()).toEqual(emptyDraft);
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/onboarding/draft.ts`

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DraftOrdeal {
  ordealId: string;
  skillHint: string;
}

export interface OnboardingDraft {
  maskAvatarId: string | null;
  nemesisName: string;
  catchphrase: string;
  bio: string;
  ordeals: DraftOrdeal[];
}

export const emptyDraft: OnboardingDraft = {
  maskAvatarId: null,
  nemesisName: '',
  catchphrase: '',
  bio: '',
  ordeals: [],
};

const KEY = 'nemesis.onboarding.draft';

export async function loadDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyDraft;
    return { ...emptyDraft, ...JSON.parse(raw) };
  } catch {
    return emptyDraft;
  }
}

export async function saveDraft(draft: OnboardingDraft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(draft));
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Run — passes.** tsc 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: asyncstorage-backed onboarding draft"`

### Task 4: Session provider + routeFor guard

**Files:**
- Create: `src/auth/session.tsx`, `src/auth/route-for.ts`
- Test: `src/auth/__tests__/route-for.test.ts`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Write failing test** `src/auth/__tests__/route-for.test.ts`

```ts
import { routeFor } from '../route-for';

describe('routeFor', () => {
  it('unauthenticated → sign-in', () => {
    expect(routeFor({ session: false, hasProfile: false })).toBe('/(auth)/sign-in');
  });
  it('authenticated without profile → onboarding', () => {
    expect(routeFor({ session: true, hasProfile: false })).toBe('/(onboarding)/mask');
  });
  it('authenticated with profile → home', () => {
    expect(routeFor({ session: true, hasProfile: true })).toBe('/');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/auth/route-for.ts`

```ts
export interface RouteState {
  session: boolean;
  hasProfile: boolean;
}

export function routeFor({ session, hasProfile }: RouteState): string {
  if (!session) return '/(auth)/sign-in';
  if (!hasProfile) return '/(onboarding)/mask';
  return '/';
}
```

- [ ] **Step 4: Implement** `src/auth/session.tsx`

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface SessionState {
  loading: boolean;
  session: Session | null;
  hasProfile: boolean;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  loading: true,
  session: null,
  hasProfile: false,
  refreshProfile: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  async function checkProfile(s: Session | null): Promise<boolean> {
    if (!s) return false;
    const { data } = await supabase.from('profiles').select('id').eq('id', s.user.id).maybeSingle();
    return data != null;
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getSession();
    setHasProfile(await checkProfile(data.session));
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setHasProfile(await checkProfile(data.session));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      setHasProfile(await checkProfile(s));
      setLoading(false);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <SessionContext.Provider value={{ loading, session, hasProfile, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
```

- [ ] **Step 5: Wire guard into `app/_layout.tsx`** (replace file)

```tsx
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { semantic } from '../src/theme/tokens';
import { SessionProvider, useSession } from '../src/auth/session';
import { routeFor } from '../src/auth/route-for';
import '../src/i18n';

function Guard() {
  const { loading, session, hasProfile } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const target = routeFor({ session: session != null, hasProfile });
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    if (target === '/(auth)/sign-in' && !inAuth) router.replace('/(auth)/sign-in');
    else if (target === '/(onboarding)/mask' && !inOnboarding) router.replace('/(onboarding)/mask');
    else if (target === '/' && (inAuth || inOnboarding)) router.replace('/');
  }, [loading, session, hasProfile, segments]);

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

export default function RootLayout() {
  return (
    <SessionProvider>
      <Guard />
    </SessionProvider>
  );
}
```

Guard note: `target === '/(onboarding)/mask'` only forces entry into the group — it must NOT yank the user back to `mask` while they navigate between onboarding steps (hence the `inOnboarding` check).

- [ ] **Step 6: Run** — `npm test` green (route-for tests + existing; the Home render test should be unaffected since it renders Home directly). `npx tsc --noEmit` → 0. `npx expo export --platform ios` → bundles.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: session provider and auth routing guard"`

### Task 5: Auth screen (sign in / sign up)

**Files:**
- Create: `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`, `src/components/GrimButton.tsx`, `src/components/GrimInput.tsx`
- Test: `src/components/__tests__/grim.test.tsx`

- [ ] **Step 1: Write failing component test** `src/components/__tests__/grim.test.tsx`

```tsx
import { render, fireEvent } from '@testing-library/react-native';
import { GrimButton } from '../GrimButton';
import { GrimInput } from '../GrimInput';

describe('GrimButton', () => {
  it('renders label and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<GrimButton label="Challenge" onPress={onPress} />);
    fireEvent.press(getByText('Challenge'));
    expect(onPress).toHaveBeenCalled();
  });
  it('disabled: no fire', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<GrimButton label="Dead" onPress={onPress} disabled />);
    fireEvent.press(getByText('Dead'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('GrimInput', () => {
  it('renders error text when given', async () => {
    const { getByText } = await render(
      <GrimInput value="" onChangeText={() => {}} placeholder="x" error="Too short" />,
    );
    getByText('Too short');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/components/GrimButton.tsx`

```tsx
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

export function GrimButton({ label, onPress, disabled, variant = 'primary' }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, variant === 'ghost' && styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: spacing[2], paddingHorizontal: spacing[4], borderRadius: radii.button, alignItems: 'center', borderWidth: 1 },
  primary: { backgroundColor: colors.bloodMist, borderColor: colors.blood },
  ghost: { backgroundColor: 'transparent', borderColor: colors.venomDim },
  pressed: { backgroundColor: colors.bloodDeep },
  disabled: { opacity: 0.4 },
  label: { color: colors.bone, fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase' },
  ghostLabel: { color: colors.ash },
});
```

- [ ] **Step 4: Implement** `src/components/GrimInput.tsx`

```tsx
import { View, TextInput, Text, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radii, spacing } from '../theme/tokens';

interface Props extends TextInputProps {
  error?: string | null;
}

export function GrimInput({ error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <TextInput
        placeholderTextColor={colors.smoke}
        style={[styles.input, error != null && styles.inputError, style]}
        {...rest}
      />
      {error != null && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[0] },
  input: {
    backgroundColor: colors.crypt,
    borderWidth: 1,
    borderColor: colors.venomDim,
    borderRadius: radii.button,
    color: colors.bone,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    fontSize: 15,
  },
  inputError: { borderColor: colors.blood },
  error: { color: colors.blood, fontSize: 12 },
});
```

- [ ] **Step 5: Implement screens.** `app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`app/(auth)/sign-in.tsx`:

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const fn = mode === 'signIn'
      ? supabase.auth.signInWithPassword({ email: email.trim(), password })
      : supabase.auth.signUp({ email: email.trim(), password });
    const { error: e } = await fn;
    if (e) setError(e.message);
    setBusy(false);
    // success: session change fires the root guard; no manual navigation
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.welcome}>{t('onboarding.welcomeTitle')}</Text>
      <Text style={styles.body}>{t('onboarding.welcomeBody')}</Text>
      <View style={styles.form}>
        <GrimInput value={email} onChangeText={setEmail} placeholder="email@example.com"
          autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <GrimInput value={password} onChangeText={setPassword} placeholder="••••••••"
          secureTextEntry autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} />
        {error != null && <Text style={styles.error}>{error}</Text>}
        <GrimButton
          label={mode === 'signIn' ? 'Enter' : 'Rise'}
          onPress={submit}
          disabled={busy || email.trim() === '' || password.length < 8}
        />
        <GrimButton
          label={mode === 'signIn' ? 'No account? Rise anew' : 'Return to the gate'}
          variant="ghost"
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[1] },
  logo: { color: semantic.text, fontSize: 40, letterSpacing: 6, textAlign: 'center' },
  welcome: { color: colors.ash, fontSize: 16, textAlign: 'center', marginTop: spacing[2] },
  body: { color: colors.smoke, fontSize: 13, textAlign: 'center', marginBottom: spacing[4] },
  error: { color: colors.blood, fontSize: 13 },
  form: { gap: spacing[2] },
});
```

Copy note: "Enter"/"Rise"/"Return to the gate" are new strings not yet in the copy deck. Add them to BOTH catalogs and the copy deck spec in Task 9 (string sweep) — until then plain literals are acceptable placeholders, but Task 9 MUST replace them.

- [ ] **Step 6: Run** — component tests pass, tsc 0, `npx expo export --platform ios` bundles.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: auth screen with grim form components"`

### Task 6: Onboarding wizard — mask, name, bio steps

**Files:**
- Create: `app/(onboarding)/_layout.tsx`, `app/(onboarding)/mask.tsx`, `app/(onboarding)/name.tsx`, `app/(onboarding)/bio.tsx`
- Create: `src/components/MaskTile.tsx`, `src/onboarding/masks.ts`
- Test: `src/onboarding/__tests__/masks.test.ts`

- [ ] **Step 1: Write failing test** `src/onboarding/__tests__/masks.test.ts`

```ts
import { MASKS } from '../masks';

describe('mask presets', () => {
  it('has at least 12 unique ids', () => {
    expect(MASKS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(MASKS.map((m) => m.id)).size).toBe(MASKS.length);
  });
  it('default skull_01 exists (profiles.mask_avatar_id default)', () => {
    expect(MASKS.some((m) => m.id === 'skull_01')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/onboarding/masks.ts`

```ts
// Placeholder mask set. Real ink illustrations replace `glyph` art later
// (design-system §8, product spec §17) — ids are stable, art is swappable.
export interface Mask {
  id: string;
  glyph: string; // unicode placeholder rendered on a MaskTile until art lands
}

export const MASKS: Mask[] = [
  { id: 'skull_01', glyph: '☠' },
  { id: 'raven_01', glyph: '🜏' },
  { id: 'spear_01', glyph: '🜂' },
  { id: 'shield_01', glyph: '🛡' },
  { id: 'rune_01', glyph: 'ᚱ' },
  { id: 'rune_02', glyph: 'ᛟ' },
  { id: 'rune_03', glyph: 'ᚦ' },
  { id: 'moon_01', glyph: '☾' },
  { id: 'cross_01', glyph: '✠' },
  { id: 'serpent_01', glyph: '§' },
  { id: 'axe_01', glyph: '🜄' },
  { id: 'crown_01', glyph: '♆' },
];
```

- [ ] **Step 4: Implement** `src/components/MaskTile.tsx`

```tsx
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../theme/tokens';

interface Props {
  glyph: string;
  selected: boolean;
  onPress: () => void;
}

export function MaskTile({ glyph, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tile, selected && styles.selected]}
    >
      <Text style={[styles.glyph, selected && styles.glyphSelected]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 72, height: 72, borderRadius: radii.card,
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    alignItems: 'center', justifyContent: 'center',
  },
  selected: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  glyph: { fontSize: 34, color: colors.venomDeep },
  glyphSelected: { color: colors.bone },
});
```

- [ ] **Step 5: Implement wizard screens.** `app/(onboarding)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`app/(onboarding)/mask.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MASKS } from '../../src/onboarding/masks';
import { MaskTile } from '../../src/components/MaskTile';
import { GrimButton } from '../../src/components/GrimButton';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function MaskStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadDraft().then((d) => setSelected(d.maskAvatarId));
  }, []);

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, maskAvatarId: selected });
    router.push('/(onboarding)/name');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.maskTitle')}</Text>
      <FlatList
        data={MASKS}
        numColumns={4}
        keyExtractor={(m) => m.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <MaskTile glyph={item.glyph} selected={selected === item.id} onPress={() => setSelected(item.id)} />
        )}
      />
      <GrimButton label={t('common.next')} onPress={next} disabled={selected == null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[3] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
  grid: { gap: spacing[2] },
  row: { gap: spacing[2], justifyContent: 'center' },
});
```

`app/(onboarding)/name.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { validateNemesisName, validateCatchphrase } from '../../src/lib/validation';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function NameStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [catchphrase, setCatchphrase] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    loadDraft().then((d) => { setName(d.nemesisName); setCatchphrase(d.catchphrase); });
  }, []);

  const nameError = touched ? validateNemesisName(name) : null;
  const phraseError = validateCatchphrase(catchphrase);

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, nemesisName: name.trim(), catchphrase: catchphrase.trim() });
    router.push('/(onboarding)/bio');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.nameTitle')}</Text>
      <GrimInput value={name} onChangeText={(v) => { setName(v); setTouched(true); }}
        placeholder={t('onboarding.namePlaceholder')}
        error={nameError ? t(`validation.${nameError}`) : null} />
      <Text style={styles.title2}>{t('onboarding.catchphraseTitle')}</Text>
      <GrimInput value={catchphrase} onChangeText={setCatchphrase}
        placeholder={t('onboarding.catchphrasePlaceholder')}
        error={phraseError ? t(`validation.${phraseError}`) : null} />
      <GrimButton label={t('common.next')} onPress={next}
        disabled={validateNemesisName(name) != null || phraseError != null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
  title2: { color: colors.bone, fontSize: 18, textAlign: 'center', letterSpacing: 2, marginTop: spacing[3] },
});
```

`app/(onboarding)/bio.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { validateBio } from '../../src/lib/validation';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function BioStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const [bio, setBio] = useState('');

  useEffect(() => { loadDraft().then((d) => setBio(d.bio)); }, []);

  const bioError = validateBio(bio);

  async function next() {
    const draft = await loadDraft();
    await saveDraft({ ...draft, bio: bio.trim() });
    router.push('/(onboarding)/ordeals');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.bioTitle')}</Text>
      <GrimInput value={bio} onChangeText={setBio} multiline numberOfLines={5}
        style={styles.bioInput} placeholder="…"
        error={bioError ? t(`validation.${bioError}`) : null} />
      <GrimButton label={t('common.next')} onPress={next} disabled={bioError != null} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  bioInput: { minHeight: 120, textAlignVertical: 'top' },
});
```

New i18n keys used: `common.next`, `validation.tooShort`, `validation.tooLong` — added in Task 9's string sweep alongside the auth strings. Until Task 9 runs, `t()` renders the raw key; acceptable interim.

- [ ] **Step 6: Run** — mask test passes, all green, tsc 0, expo export bundles.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: onboarding mask, name, bio steps"`

### Task 7: Ordeal picker + forge sheet

**Files:**
- Create: `app/(onboarding)/ordeals.tsx`, `src/onboarding/ordeal-labels.ts`
- Test: `src/onboarding/__tests__/ordeal-labels.test.ts`

- [ ] **Step 1: Write failing test** `src/onboarding/__tests__/ordeal-labels.test.ts`

```ts
import { ordealLabel, ordealUnit, type OrdealRow } from '../ordeal-labels';

const catalog: OrdealRow = {
  id: '1', name_en: 'Running', name_uk: 'Біг', unit_en: 'km', unit_uk: 'км',
  name_custom: null, unit_custom: null, is_custom: false, language: null,
};
const custom: OrdealRow = {
  id: '2', name_en: null, name_uk: null, unit_en: null, unit_uk: null,
  name_custom: 'Yodeling', unit_custom: 'yodels', is_custom: true, language: 'en',
};

describe('ordeal labels', () => {
  it('catalog row localizes by language', () => {
    expect(ordealLabel(catalog, 'en')).toBe('Running');
    expect(ordealLabel(catalog, 'uk')).toBe('Біг');
    expect(ordealUnit(catalog, 'uk')).toBe('км');
  });
  it('custom row uses custom fields regardless of viewer language', () => {
    expect(ordealLabel(custom, 'uk')).toBe('Yodeling');
    expect(ordealUnit(custom, 'en')).toBe('yodels');
  });
  it('falls back to en when uk missing', () => {
    const partial = { ...catalog, name_uk: null, unit_uk: null };
    expect(ordealLabel(partial, 'uk')).toBe('Running');
    expect(ordealUnit(partial, 'uk')).toBe('km');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/onboarding/ordeal-labels.ts`

```ts
export interface OrdealRow {
  id: string;
  name_en: string | null;
  name_uk: string | null;
  unit_en: string | null;
  unit_uk: string | null;
  name_custom: string | null;
  unit_custom: string | null;
  is_custom: boolean;
  language: string | null;
}

export function ordealLabel(row: OrdealRow, lang: string): string {
  if (row.is_custom) return row.name_custom ?? '';
  return (lang === 'uk' ? row.name_uk : row.name_en) ?? row.name_en ?? '';
}

export function ordealUnit(row: OrdealRow, lang: string): string {
  if (row.is_custom) return row.unit_custom ?? '';
  return (lang === 'uk' ? row.unit_uk : row.unit_en) ?? row.unit_en ?? '';
}
```

- [ ] **Step 4: Implement screen** `app/(onboarding)/ordeals.tsx`

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { loadDraft, saveDraft } from '../../src/onboarding/draft';
import { ordealLabel, ordealUnit, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { validateOrdealName, validateOrdealUnit, validateSkillHint } from '../../src/lib/validation';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';

export default function OrdealsStep() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language;
  const [rows, setRows] = useState<OrdealRow[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({}); // ordealId -> skillHint
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeName, setForgeName] = useState('');
  const [forgeUnit, setForgeUnit] = useState('');
  const [forgeError, setForgeError] = useState<string | null>(null);
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [hintText, setHintText] = useState('');

  useEffect(() => {
    supabase.from('ordeals').select('*').order('name_en').then(({ data }) => setRows((data as OrdealRow[]) ?? []));
    loadDraft().then((d) => setSelected(Object.fromEntries(d.ordeals.map((o) => [o.ordealId, o.skillHint]))));
  }, []);

  function toggle(id: string) {
    if (selected[id] !== undefined) {
      const next = { ...selected };
      delete next[id];
      setSelected(next);
    } else {
      setHintFor(id);
      setHintText('');
    }
  }

  function confirmHint() {
    if (hintFor == null || validateSkillHint(hintText) != null) return;
    setSelected({ ...selected, [hintFor]: hintText.trim() });
    setHintFor(null);
  }

  async function forge() {
    setForgeError(null);
    const { data, error } = await supabase.rpc('forge_ordeal', {
      p_name: forgeName.trim(), p_unit: forgeUnit.trim(), p_language: lang === 'uk' ? 'uk' : 'en',
    });
    if (error) {
      setForgeError(error.message.includes('ordeal_rejected') ? t('settings.ordealRejected') : error.message);
      return;
    }
    const row = data as OrdealRow;
    setRows([row, ...rows]);
    setSelected({ ...selected, [row.id]: '' });
    setForgeOpen(false);
    setForgeName('');
    setForgeUnit('');
  }

  async function next() {
    const draft = await loadDraft();
    await saveDraft({
      ...draft,
      ordeals: Object.entries(selected).map(([ordealId, skillHint]) => ({ ordealId, skillHint })),
    });
    router.push('/(onboarding)/finish');
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.ordealsTitle')}</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const on = selected[item.id] !== undefined;
          return (
            <Pressable onPress={() => toggle(item.id)} style={[styles.row, on && styles.rowOn]}>
              <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{ordealLabel(item, lang)}</Text>
              <Text style={styles.rowUnit}>
                {ordealUnit(item, lang)}{on && selected[item.id] ? ` · ${selected[item.id]}` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
      <GrimButton label={t('onboarding.forgeCta')} variant="ghost" onPress={() => setForgeOpen(true)} />
      <GrimButton label={t('common.next')} onPress={next} disabled={Object.keys(selected).length === 0} />

      <Modal visible={forgeOpen} transparent animationType="fade" onRequestClose={() => setForgeOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t('onboarding.forgeCta')}</Text>
            <GrimInput value={forgeName} onChangeText={setForgeName} placeholder="Yodeling"
              error={forgeName !== '' && validateOrdealName(forgeName) ? t(`validation.${validateOrdealName(forgeName)}`) : null} />
            <GrimInput value={forgeUnit} onChangeText={setForgeUnit} placeholder="yodels"
              error={forgeUnit !== '' && validateOrdealUnit(forgeUnit) ? t(`validation.${validateOrdealUnit(forgeUnit)}`) : null} />
            {forgeError != null && <Text style={styles.error}>{forgeError}</Text>}
            <GrimButton label={t('common.confirm')} onPress={forge}
              disabled={validateOrdealName(forgeName) != null || validateOrdealUnit(forgeUnit) != null} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setForgeOpen(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={hintFor != null} transparent animationType="fade" onRequestClose={() => setHintFor(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t('onboarding.skillHintTitle')}</Text>
            <GrimInput value={hintText} onChangeText={setHintText} placeholder="1450 elo"
              error={validateSkillHint(hintText) ? t(`validation.${validateSkillHint(hintText)}`) : null} />
            <GrimButton label={t('common.confirm')} onPress={confirmHint} disabled={validateSkillHint(hintText) != null} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  list: { gap: spacing[1] },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  rowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  rowLabel: { color: colors.ash, fontSize: 15 },
  rowLabelOn: { color: colors.bone },
  rowUnit: { color: colors.smoke, fontSize: 12 },
  error: { color: colors.blood, fontSize: 13 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
```

New keys: `onboarding.skillHintTitle`, `common.confirm`, `common.cancel` — Task 9 sweep.

- [ ] **Step 5: Run** — label tests pass, tsc 0, export bundles.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: ordeal picker with skill hints and forge sheet"`

### Task 8: Finish step — profile write + home greets persona

**Files:**
- Create: `app/(onboarding)/finish.tsx`, `src/onboarding/complete.ts`
- Modify: `app/index.tsx`
- Test: `src/onboarding/__tests__/complete.integration.test.ts`

- [ ] **Step 1: Write failing integration test** `src/onboarding/__tests__/complete.integration.test.ts`

```ts
/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';
import { completeOnboarding } from '../complete';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const maybe = anon && service ? describe : describe.skip;

maybe('completeOnboarding', () => {
  it('writes profile + profile_ordeals under RLS as the signed-in user', async () => {
    const admin = createClient(url, service);
    const email = `complete-${Date.now()}@test.local`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
    const client = createClient(url, anon);
    await client.auth.signInWithPassword({ email, password: 'pass1234!' });

    const { data: ordeal } = await client.from('ordeals').select('id').limit(1).single();

    await completeOnboarding(client as any, {
      maskAvatarId: 'raven_01',
      nemesisName: 'Integration Ivan',
      catchphrase: 'We meet again.',
      bio: '',
      ordeals: [{ ordealId: ordeal!.id, skillHint: '1450 elo' }],
    });

    const { data: profile } = await client.from('profiles').select('nemesis_name, mask_avatar_id').eq('id', u.user!.id).single();
    expect(profile).toEqual({ nemesis_name: 'Integration Ivan', mask_avatar_id: 'raven_01' });
    const { data: po } = await client.from('profile_ordeals').select('ordeal_id, skill_hint').eq('profile_id', u.user!.id);
    expect(po).toEqual([{ ordeal_id: ordeal!.id, skill_hint: '1450 elo' }]);
  });

  it('rejects a draft with no mask or short name before touching the network', async () => {
    const client = createClient(url, anon);
    await expect(
      completeOnboarding(client as any, { maskAvatarId: null, nemesisName: 'ok name', catchphrase: '', bio: '', ordeals: [] }),
    ).rejects.toThrow('draft_incomplete');
    await expect(
      completeOnboarding(client as any, { maskAvatarId: 'skull_01', nemesisName: 'x', catchphrase: '', bio: '', ordeals: [] }),
    ).rejects.toThrow('draft_incomplete');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/onboarding/complete.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnboardingDraft } from './draft';
import { validateNemesisName } from '../lib/validation';

// Writes the persona at the end of onboarding. Takes the client as a
// parameter so node-based integration tests can pass a plain supabase-js
// client (the app passes src/lib/supabase's RN client).
export async function completeOnboarding(client: SupabaseClient, draft: OnboardingDraft): Promise<void> {
  if (draft.maskAvatarId == null || validateNemesisName(draft.nemesisName) != null) {
    throw new Error('draft_incomplete');
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || userData.user == null) throw new Error('auth_required');
  const uid = userData.user.id;

  const { error: pe } = await client.from('profiles').insert({
    id: uid,
    nemesis_name: draft.nemesisName.trim(),
    catchphrase: draft.catchphrase.trim() || null,
    bio: draft.bio.trim() || null,
    mask_avatar_id: draft.maskAvatarId,
  });
  if (pe) throw pe;

  if (draft.ordeals.length > 0) {
    const { error: oe } = await client.from('profile_ordeals').insert(
      draft.ordeals.map((o) => ({
        profile_id: uid,
        ordeal_id: o.ordealId,
        skill_hint: o.skillHint.trim() || null,
      })),
    );
    if (oe) throw oe;
  }
}
```

- [ ] **Step 4: Implement** `app/(onboarding)/finish.tsx`

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { GrimButton } from '../../src/components/GrimButton';
import { loadDraft, clearDraft } from '../../src/onboarding/draft';
import { completeOnboarding } from '../../src/onboarding/complete';
import { useSession } from '../../src/auth/session';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function FinishStep() {
  const { t } = useTranslation();
  const { refreshProfile } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function seal() {
    setBusy(true);
    setError(null);
    try {
      const draft = await loadDraft();
      await completeOnboarding(supabase, draft);
      await clearDraft();
      await refreshProfile(); // root guard sees hasProfile → routes home
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('onboarding.sealTitle')}</Text>
      <Text style={styles.body}>{t('tagline')}</Text>
      {error != null && <Text style={styles.error}>{error}</Text>}
      <GrimButton label={t('onboarding.sealCta')} onPress={seal} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[2] },
  title: { color: colors.bone, fontSize: 24, textAlign: 'center', letterSpacing: 2 },
  body: { color: colors.venomDeep, fontSize: 14, textAlign: 'center' },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
```

- [ ] **Step 5: Update home** `app/index.tsx` — greet the persona:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { colors, semantic, spacing } from '../src/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  const { session } = useSession();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (session == null) return;
    supabase.from('profiles').select('nemesis_name').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setName(data?.nemesis_name ?? null));
  }, [session?.user.id]);

  return (
    <View style={styles.root}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.tagline}>{t('tagline')}</Text>
      {name != null && <Text style={styles.persona}>{name}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, alignItems: 'center', justifyContent: 'center', gap: spacing[1] },
  logo: { color: semantic.text, fontSize: 44, letterSpacing: 6 },
  tagline: { color: colors.venomDeep, fontSize: 14, letterSpacing: 2 },
  persona: { color: colors.blood, fontSize: 18, letterSpacing: 1, marginTop: spacing[3] },
});
```

The existing `app/__tests__/index.test.tsx` render test now needs the session context: wrap render in a provider or mock `useSession`. Update the test:

```tsx
import { render } from '@testing-library/react-native';
import '../../src/i18n';

jest.mock('../../src/auth/session', () => ({
  useSession: () => ({ loading: false, session: null, hasProfile: false, refreshProfile: async () => {} }),
}));

import Home from '../index';

describe('Home', () => {
  it('renders logo and tagline', async () => {
    const { getByText } = await render(<Home />);
    getByText('NEMESIS');
    getByText('Iron hardens Iron');
  });
});
```

- [ ] **Step 6: Run everything**

```bash
npm test                              # app project green
# with keys (stack running):
ANON=...; SERVICE=...; EXPO_PUBLIC_SUPABASE_ANON_KEY=$ANON SUPABASE_SERVICE_ROLE_KEY=$SERVICE npm test
npx tsc --noEmit
npx expo export --platform ios
```

All green, tsc 0, bundles.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: onboarding completion writes persona; home greets it"`

### Task 9: String sweep — new keys into copy deck + catalogs

**Files:**
- Modify: `spec/copy-deck.md` (new §2b rows), `src/i18n/en.json`, `src/i18n/uk.json`
- Modify: `app/(auth)/sign-in.tsx` (replace the literal placeholders)
- Test: extend `src/i18n/__tests__/i18n.test.ts`

- [ ] **Step 1: Extend the i18n test first** — add to `src/i18n/__tests__/i18n.test.ts` inside the existing describe:

```ts
  it('plan-2 keys present', () => {
    for (const key of [
      'common.next', 'common.confirm', 'common.cancel',
      'validation.tooShort', 'validation.tooLong',
      'auth.enter', 'auth.rise', 'auth.toSignUp', 'auth.toSignIn',
      'onboarding.skillHintTitle', 'onboarding.sealTitle', 'onboarding.sealCta',
    ]) {
      const resolveIn = (cat: object) => key.split('.').reduce((o: any, k) => o?.[k], cat);
      expect(typeof resolveIn(en)).toBe('string');
      expect(typeof resolveIn(uk)).toBe('string');
    }
  });
```

Run — fails (keys missing).

- [ ] **Step 2: Add rows to `spec/copy-deck.md`** — append a new subsection after §2:

```markdown
### 2b. Plan-2 additions (auth + wizard chrome)

| Key | EN | UA (draft) |
| --- | --- | --- |
| common_next | Onward | Далі |
| common_confirm | So be it | Хай буде так |
| common_cancel | Retreat | Відступити |
| validation_too_short | Too short for legend. | Закоротко для легенди. |
| validation_too_long | Even sagas have limits. | Навіть саги мають межі. |
| auth_enter | Enter | Увійти |
| auth_rise | Rise | Повстати |
| auth_to_sign_up | No account? Rise anew | Немає облікового запису? Повстань |
| auth_to_sign_in | Return to the gate | Повернутися до брами |
| onboarding_skill_hint_title | Name thy prowess | Назви свою майстерність |
| onboarding_seal_title | Seal thy persona | Скріпи свою подобу |
| onboarding_seal_cta | Seal it in blood | Скріпити кров'ю |
```

(These UA strings are drafts like all others — owner reviews. Note `Скріпити кров'ю` contains an apostrophe — JSON-safe, SQL not involved.)

Also sync the same rows into the Obsidian copy deck (controller does this — subagents have no vault access; implementer should flag it in the report).

- [ ] **Step 3: Add the keys to `src/i18n/en.json` and `uk.json`** under `common`, `validation`, `auth`, `onboarding` — values verbatim from the table above.

- [ ] **Step 4: Replace literals in `app/(auth)/sign-in.tsx`:** `'Enter'` → `t('auth.enter')`, `'Rise'` → `t('auth.rise')`, ghost-button labels → `t('auth.toSignUp')` / `t('auth.toSignIn')`.

- [ ] **Step 5: Run** — i18n tests green (key parity test also enforces uk), full suite green, tsc 0.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: plan-2 strings in copy deck and catalogs"`

### Task 10: End-to-end verification on simulator

**Files:** none (verification task)

- [ ] **Step 1:** Ensure local stack running (`supabase status`), `.env` present with local url + anon key (create from `.env.example` + `supabase status` — `.env` is gitignored).
- [ ] **Step 2:** `npx expo start` → iOS simulator. Walk the whole flow: sign up (email+password — local stack auto-confirms per config.toml `enable_confirmations = false`; verify), mask → name (try 1-char name, expect inline error) → bio → ordeals (pick 2, add skill hint; forge a custom ordeal; try forging one with a banned word — expect themed rejection) → seal → home greets persona. Kill app mid-wizard, relaunch: draft resumes. Sign out isn't built (Plan 5) — use `supabase db reset` + app reinstall to re-test from scratch.
- [ ] **Step 3:** Record findings; anything broken becomes fix-commits on this plan.
- [ ] **Step 4:** Final commit if fixes were needed.
