# Nemesis Settings & Safety Implementation Plan (Plan 5a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Settings screen (sign out, persona editing, language, brutality tier, account deletion) and the safety surface (block with feud dissolution, report) — plus dead-session self-healing so wiped accounts never strand a client again.

**Architecture:** `block_user` RPC (definer, atomic block+dissolve), `delete-account` Edge Function (second EF, service-role user deletion), SessionProvider gains server-side `getUser()` verification with forced sign-out. Settings is one screen at `app/settings.tsx` (gear from home); block/report live in a menu on the feud screen (the only rival surface until the 5b deck).

**Spec sources:** spec/design-system.md §5 Settings + Report/Block; spec/copy-deck.md §7 (+§7b added here); spec/data-contract.md 2026-07-12 Plan-5a amendment (normative).

**Out of scope:** deck/arch (5b), measured ordeals + forfeit (5c), brutality FONT swapping (Plan 6 — the picker persists the tier and shows descriptions now; tier fonts render system until Plan 6), radius setting (needs deck, 5b).

**Conventions:** as previous plans. UA verbatim from copy deck. Integration tests self-skip without keys; EF test self-skips without FUNCTIONS_URL.

---

### Task 1: Migration — block_user RPC

**Files:**
- Create: `supabase/migrations/00000000000011_block_user.sql`
- Test: `src/lib/__tests__/block.integration.test.ts`

- [ ] **Step 1: Write failing integration test** `src/lib/__tests__/block.integration.test.ts`

```ts
/**
 * @jest-environment node
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const maybe = anon && service ? describe : describe.skip;

const admin = () => createClient(url, service);

async function userWithProfile(prefix: string, name: string): Promise<{ client: SupabaseClient; id: string }> {
  const a = admin();
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const { data } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
  await a.from('profiles').insert({ id: data.user!.id, nemesis_name: name });
  const client = createClient(url, anon);
  await client.auth.signInWithPassword({ email, password: 'pass1234!' });
  return { client, id: data.user!.id };
}

async function makeFeud(a: { id: string }, b: { id: string }) {
  const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
  const [pa, pb] = [a.id, b.id].sort();
  const { data } = await admin().from('feuds').insert({
    profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id, mode: 'endless', status: 'active',
  }).select('id').single();
  return data!.id as string;
}

maybe('block_user RPC', () => {
  it('blocks and dissolves all live feuds between the pair', async () => {
    const a = await userWithProfile('blk2-a', 'Blk Anna');
    const b = await userWithProfile('blk2-b', 'Blk Bo');
    const feudId = await makeFeud(a, b);

    const { error } = await a.client.rpc('block_user', { p_target: b.id });
    expect(error).toBeNull();

    const { data: feud } = await admin().from('feuds').select('status, ended_at').eq('id', feudId).single();
    expect(feud!.status).toBe('dissolved');
    expect(feud!.ended_at).not.toBeNull();

    const { data: blocks } = await admin().from('blocks').select('*').eq('blocker', a.id).eq('blocked', b.id);
    expect(blocks).toHaveLength(1);

    // blocked pair cannot accept new invites (existing accept_invite check)
    const { data: invite } = await b.client.rpc('create_invite', {
      p_ordeal_id: (await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single()).data!.id,
      p_mode: 'endless', p_goal: null,
    });
    const { error: acceptErr } = await a.client.rpc('accept_invite', { p_code: invite.code });
    expect(acceptErr).not.toBeNull();
    expect(acceptErr!.message).toContain('blocked');
  });

  it('is idempotent and rejects self-block', async () => {
    const a = await userWithProfile('blk3-a', 'Blk3 Anna');
    const b = await userWithProfile('blk3-b', 'Blk3 Bo');
    await a.client.rpc('block_user', { p_target: b.id });
    const { error: again } = await a.client.rpc('block_user', { p_target: b.id });
    expect(again).toBeNull(); // idempotent
    const { error: self } = await a.client.rpc('block_user', { p_target: a.id });
    expect(self).not.toBeNull();
    expect(self!.message).toContain('self_block');
  });
});
```

- [ ] **Step 2: Run with keys — fails** (RPC missing).

- [ ] **Step 3: Write migration** `supabase/migrations/00000000000011_block_user.sql`

```sql
-- Plan 5a (contract amendment 2026-07-12): blocking dissolves all live feuds
-- between the pair atomically. The blessed block path.

create or replace function block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_target = auth.uid() then
    raise exception 'self_block';
  end if;

  insert into blocks (blocker, blocked)
  values (auth.uid(), p_target)
  on conflict (blocker, blocked) do nothing;

  update feuds
  set status = 'dissolved', ended_at = now()
  where status in ('proposed','active')
    and profile_a = least(auth.uid(), p_target)
    and profile_b = greatest(auth.uid(), p_target);
end;
$$;

revoke execute on function block_user(uuid) from public;
grant execute on function block_user(uuid) to authenticated;
```

- [ ] **Step 4: Apply + re-run** — `supabase db reset`, 2 tests pass. Bare suite green, tsc 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: block_user rpc with atomic feud dissolution"`

### Task 2: delete-account Edge Function

**Files:**
- Create: `supabase/functions/delete-account/index.ts`
- Test: `src/lib/__tests__/delete-account.integration.test.ts`

- [ ] **Step 1: Implement** `supabase/functions/delete-account/index.ts`

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: ue } = await caller.auth.getUser();
    if (ue || userData.user == null) return Response.json({ error: 'auth_required' }, { status: 401 });

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // FK cascades wipe profiles/feuds/scores/taunts/etc; custom ordeals
    // survive with created_by = null (contract amendment 2026-07-11).
    const { error: de } = await service.auth.admin.deleteUser(userData.user.id);
    if (de) return Response.json({ error: String(de.message) }, { status: 500 });
    return Response.json({ erased: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
```

- [ ] **Step 2: Write integration test** `src/lib/__tests__/delete-account.integration.test.ts`

```ts
/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const fnUrl = process.env.FUNCTIONS_URL ?? '';
const maybe = anon && service && fnUrl ? describe : describe.skip;

maybe('delete-account edge function', () => {
  it('erases the caller: auth user gone, profile gone, feuds cascade', async () => {
    const a = createClient(url, service);
    const email = `erase-${Date.now()}@test.local`;
    const { data: u } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
    await a.from('profiles').insert({ id: u.user!.id, nemesis_name: 'Erase Me' });
    const client = createClient(url, anon);
    await client.auth.signInWithPassword({ email, password: 'pass1234!' });
    const { data: s } = await client.auth.getSession();

    const resp = await fetch(`${fnUrl}/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.session!.access_token}` },
    });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ erased: true });

    const { data: profile } = await a.from('profiles').select('id').eq('id', u.user!.id).maybeSingle();
    expect(profile).toBeNull();
    const { data: authUser } = await a.auth.admin.getUserById(u.user!.id);
    expect(authUser.user).toBeNull();
  });

  it('rejects anon calls', async () => {
    const resp = await fetch(`${fnUrl}/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anon}` },
    });
    expect(resp.status).toBe(401);
  });
});
```

- [ ] **Step 3: Serve + run** — `supabase functions serve` (serves all functions), FUNCTIONS_URL + keys, run test → passes. Kill serve.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: delete-account edge function"`

### Task 3: Dead-session self-healing

**Files:**
- Modify: `src/auth/session.tsx`

- [ ] **Step 1:** In `SessionProvider`, harden `checkProfile` into a combined server-truth check. Replace the existing `checkProfile` + its uses with:

```tsx
  // Server-verified session check. A JWT can outlive its account (e.g. account
  // deleted, dev db reset): getUser() asks the server. Dead session -> signOut
  // so the guard lands on the auth gate instead of stranding the user
  // (contract amendment 2026-07-12, dead-session rule).
  async function verifySession(s: Session | null): Promise<boolean> {
    if (s == null) return false;
    const { data, error } = await supabase.auth.getUser();
    if (error != null || data.user == null) {
      await supabase.auth.signOut();
      return false;
    }
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
    return profile != null;
  }
```

Wire it where `checkProfile` was called (initial load, onAuthStateChange, refreshProfile). Note: `signOut()` triggers `onAuthStateChange` → state settles to signed-out naturally; guard redirects.

- [ ] **Step 2: Verify** — `npm test` green (route-for/home tests unaffected — session provider isn't unit-tested), tsc 0, expo export bundles. Manual check happens in the walk (Task 7).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: dead-session self-healing (forced sign-out on deleted user)"`

### Task 4: Strings — §7b

**Files:**
- Modify: `spec/copy-deck.md`, `src/i18n/en.json`, `uk.json`, extend i18n test

- [ ] **Step 1: TDD** — extend i18n test:

```ts
  it('plan-5a keys present', () => {
    for (const key of [
      'settings.title', 'settings.signOut', 'settings.language', 'settings.persona',
      'settings.save', 'settings.saved', 'settings.dangerZone', 'settings.eraseBody',
      'safety.blockConfirmTitle', 'safety.blockConfirmBody', 'safety.reportTitle',
      'safety.reportPlaceholder', 'safety.reportSent', 'safety.menu',
    ]) {
      const resolveIn = (cat: object) => key.split('.').reduce((o: any, k) => o?.[k], cat);
      expect(typeof resolveIn(en)).toBe('string');
      expect(typeof resolveIn(uk)).toBe('string');
    }
  });
```

Red → append to `spec/copy-deck.md` after §7:

```markdown
### 7b. Plan-5a additions (settings screen + safety sheets)

| Key | EN | UA (draft) |
| --- | --- | --- |
| settings_title | The inner sanctum | Внутрішнє святилище |
| settings_sign_out | Leave the gate | Полишити браму |
| settings_language | Tongue | Мова |
| settings_persona | Thy persona | Твоя подоба |
| settings_save | Carve it | Закарбувати |
| settings_saved | Carved. | Закарбовано. |
| settings_danger_zone | Point of no return | Точка неповернення |
| settings_erase_body | Thy chronicle, feuds, and name shall be wiped from all records. Forever. | Твій літопис, ворожнечі та ім'я буде стерто з усіх записів. Назавжди. |
| safety_menu | ⋯ | ⋯ |
| safety_block_confirm_title | Banish {name}? | Вигнати {name}? |
| safety_block_confirm_body | All feuds with them dissolve. They will not find thee again. | Усі ворожнечі з ним розчиняться. Він більше тебе не знайде. |
| safety_report_title | Report to the elders | Поскаржитися старійшинам |
| safety_report_placeholder | What have they done? | Що він накоїв? |
| safety_report_sent | The elders have been informed. | Старійшин повідомлено. |
```

(`settings_erase_body` reuses §7 `delete_confirm` text verbatim — keyed for the new screen. Existing §7 keys reused: brutality_*, delete_account, report_cta, block_cta.)

- [ ] **Step 2:** Add to both catalogs (namespaces `settings`, `safety`; UA verbatim) → green. Existing keys `settings.deleteAccount`/`report`/`block`/`ordealRejected` + `brutality.*` already present from Plan 1.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: plan-5a strings"`. Flag: controller syncs §7b to Obsidian.

### Task 5: Settings screen

**Files:**
- Create: `app/settings.tsx`
- Modify: `app/index.tsx` (gear entry), `src/i18n/index.ts` (export a `setAppLanguage` helper)

- [ ] **Step 1:** Add to `src/i18n/index.ts` (after init):

```ts
export async function setAppLanguage(lang: 'en' | 'uk'): Promise<void> {
  await i18n.changeLanguage(lang);
}
```

- [ ] **Step 2: Implement** `app/settings.tsx`

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { setAppLanguage } from '../src/i18n';
import { brutalityTiers } from '../src/theme/brutality';
import { validateCatchphrase, validateBio } from '../src/lib/validation';
import { errMessage } from '../src/lib/err';
import { GrimButton } from '../src/components/GrimButton';
import { GrimInput } from '../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../src/theme/tokens';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const uid = session?.user.id;

  const [catchphrase, setCatchphrase] = useState('');
  const [bio, setBio] = useState('');
  const [tier, setTier] = useState(1);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (uid == null) return;
    supabase.from('profiles').select('catchphrase, bio, brutality_tier, language').eq('id', uid).maybeSingle()
      .then(({ data }) => {
        if (data == null) return;
        setCatchphrase(data.catchphrase ?? '');
        setBio(data.bio ?? '');
        setTier(data.brutality_tier ?? 1);
      });
  }, [uid]);

  async function save() {
    if (uid == null) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const { error: e } = await supabase.from('profiles').update({
        catchphrase: catchphrase.trim() || null,
        bio: bio.trim() || null,
        brutality_tier: tier,
      }).eq('id', uid);
      if (e) throw e;
      setSaved(true);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function switchLanguage(lang: 'en' | 'uk') {
    await setAppLanguage(lang);
    if (uid != null) await supabase.from('profiles').update({ language: lang }).eq('id', uid);
  }

  async function signOut() {
    await supabase.auth.signOut(); // guard routes to the gate
  }

  async function erase() {
    setBusy(true);
    try {
      await supabase.functions.invoke('delete-account');
    } catch {
      // even on failure fall through to sign-out; dead-session healing covers stragglers
    }
    await supabase.auth.signOut();
  }

  const lang = i18n.language === 'uk' ? 'uk' : 'en';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.root}>
      <Text style={styles.title}>{t('settings.title')}</Text>

      <Text style={styles.section}>{t('settings.persona')}</Text>
      <Text style={styles.fieldLabel}>{t('onboarding.catchphraseTitle')}</Text>
      <GrimInput value={catchphrase} onChangeText={setCatchphrase}
        placeholder={t('onboarding.catchphrasePlaceholder')}
        error={validateCatchphrase(catchphrase) ? t(`validation.${validateCatchphrase(catchphrase)}`) : null} />
      <Text style={styles.fieldLabel}>{t('onboarding.bioTitle')}</Text>
      <GrimInput value={bio} onChangeText={setBio} multiline numberOfLines={4} style={styles.bioInput}
        placeholder="…"
        error={validateBio(bio) ? t(`validation.${validateBio(bio)}`) : null} />

      <Text style={styles.section}>{t('settings.language')}</Text>
      <View style={styles.langRow}>
        {(['en', 'uk'] as const).map((l) => (
          <Pressable key={l} onPress={() => switchLanguage(l)}
            style={[styles.langChip, lang === l && styles.langChipOn]}>
            <Text style={[styles.langText, lang === l && styles.langTextOn]}>
              {l === 'en' ? 'English' : 'Українська'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>{t('brutality.title')}</Text>
      {brutalityTiers.map((bt) => (
        <Pressable key={bt.level} onPress={() => setTier(bt.level)}
          style={[styles.tierRow, tier === bt.level && styles.tierRowOn]}>
          <Text style={[styles.tierName, tier === bt.level && styles.tierNameOn]}>{t(bt.nameKey)}</Text>
          <Text style={styles.tierDesc}>{t(bt.descKey)}</Text>
        </Pressable>
      ))}

      {error != null && <Text style={styles.error}>{error}</Text>}
      {saved && <Text style={styles.savedText}>{t('settings.saved')}</Text>}
      <GrimButton label={t('settings.save')} onPress={save}
        disabled={busy || validateCatchphrase(catchphrase) != null || validateBio(bio) != null} />
      <GrimButton label={t('settings.signOut')} variant="ghost" onPress={signOut} />

      <Text style={[styles.section, styles.danger]}>{t('settings.dangerZone')}</Text>
      <GrimButton label={t('settings.deleteAccount')} variant="ghost" onPress={() => setEraseOpen(true)} />
      <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />

      <Modal visible={eraseOpen} transparent animationType="fade" onRequestClose={() => setEraseOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t('settings.deleteAccount')}</Text>
            <Text style={styles.eraseBody}>{t('settings.eraseBody')}</Text>
            <GrimButton label={t('settings.deleteAccount')} onPress={erase} disabled={busy} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setEraseOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: semantic.bg },
  root: { padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  section: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing[3] },
  fieldLabel: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  bioInput: { minHeight: 90, textAlignVertical: 'top' },
  langRow: { flexDirection: 'row', gap: spacing[2] },
  langChip: { flex: 1, alignItems: 'center', paddingVertical: spacing[2], borderRadius: radii.button, borderWidth: 1, borderColor: colors.venomDim, backgroundColor: colors.crypt },
  langChipOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  langText: { color: colors.ash, fontSize: 14 },
  langTextOn: { color: colors.bone },
  tierRow: { backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim, borderRadius: radii.button, padding: spacing[2] },
  tierRowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  tierName: { color: colors.ash, fontSize: 15 },
  tierNameOn: { color: colors.bone },
  tierDesc: { color: colors.smoke, fontSize: 11, marginTop: 2 },
  error: { color: colors.blood, fontSize: 13 },
  savedText: { color: colors.venom, fontSize: 13, textAlign: 'center' },
  danger: { color: colors.blood },
  eraseBody: { color: colors.ash, fontSize: 14, textAlign: 'center' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.9)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
```

- [ ] **Step 3: Gear entry on home** — in `app/index.tsx`, next to the logo add a small settings Pressable (top-right absolute: `<Pressable style={styles.gear} onPress={() => router.push('/settings')}><Text style={styles.gearText}>⚙︎</Text></Pressable>`, gear style: position absolute, top spacing[5]*1.5, right spacing[4], gearText color smoke fontSize 22). Use text glyph `⚙︎` (U+2699 + FE0E, text presentation).

- [ ] **Step 4:** Language on boot: in `src/auth/session.tsx` after a verified session with profile, read `profiles.language` once and call `setAppLanguage` if it differs from current — one-line addition inside `verifySession`'s profile fetch (select `id, language`).

- [ ] **Step 5: Verify** — tests green, tsc 0, export bundles.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: settings screen — persona, language, brutality, sign out, erase"`

### Task 6: Block/report from the feud screen

**Files:**
- Create: `src/components/SafetySheet.tsx`
- Modify: `app/feuds/[id].tsx` (menu trigger in header)
- Modify: `src/lib/feuds.ts` (blockUser + reportUser helpers)

- [ ] **Step 1: Helpers** — append to `src/lib/feuds.ts`:

```ts
export async function blockUser(client: SupabaseClient, targetId: string): Promise<void> {
  const { error } = await client.rpc('block_user', { p_target: targetId });
  if (error) throw error;
}

export async function reportUser(
  client: SupabaseClient,
  args: { targetId: string; feudId?: string; reason: string },
): Promise<void> {
  const { data: userData, error: ue } = await client.auth.getUser();
  if (ue || userData.user == null) throw new Error('auth_required');
  const { error } = await client.from('reports').insert({
    reporter: userData.user.id,
    target: args.targetId,
    feud_id: args.feudId ?? null,
    reason: args.reason.trim(),
  });
  if (error) throw error;
}
```

- [ ] **Step 2: Implement** `src/components/SafetySheet.tsx`

```tsx
import { useState } from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { blockUser, reportUser } from '../lib/feuds';
import { errMessage } from '../lib/err';
import { GrimButton } from './GrimButton';
import { GrimInput } from './GrimInput';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  visible: boolean;
  targetId: string;
  targetName: string;
  feudId?: string;
  onClose: () => void;
  onBlocked: () => void;
}

export function SafetySheet({ visible, targetId, targetName, feudId, onClose, onBlocked }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'menu' | 'block' | 'report'>('menu');
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode('menu');
    setReason('');
    setSent(false);
    setError(null);
  }

  async function doBlock() {
    setBusy(true);
    setError(null);
    try {
      await blockUser(supabase, targetId);
      reset();
      onBlocked();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReport() {
    if (reason.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await reportUser(supabase, { targetId, feudId, reason });
      setSent(true);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          {mode === 'menu' && (
            <>
              <GrimButton label={t('settings.report')} variant="ghost" onPress={() => setMode('report')} />
              <GrimButton label={t('settings.block')} variant="ghost" onPress={() => setMode('block')} />
            </>
          )}
          {mode === 'block' && (
            <>
              <Text style={styles.title}>{t('safety.blockConfirmTitle', { name: targetName })}</Text>
              <Text style={styles.body}>{t('safety.blockConfirmBody')}</Text>
              <GrimButton label={t('settings.block')} onPress={doBlock} disabled={busy} />
            </>
          )}
          {mode === 'report' && (
            <>
              <Text style={styles.title}>{t('safety.reportTitle')}</Text>
              {sent ? (
                <Text style={styles.body}>{t('safety.reportSent')}</Text>
              ) : (
                <>
                  <GrimInput value={reason} onChangeText={setReason} multiline numberOfLines={3}
                    style={styles.reasonInput} placeholder={t('safety.reportPlaceholder')} />
                  <GrimButton label={t('settings.report')} onPress={doReport}
                    disabled={busy || reason.trim().length === 0} />
                </>
              )}
            </>
          )}
          {error != null && <Text style={styles.error}>{error}</Text>}
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => { reset(); onClose(); }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.9)', justifyContent: 'center', padding: spacing[4] },
  sheet: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
  title: { color: colors.bone, fontSize: 18, textAlign: 'center', letterSpacing: 1 },
  body: { color: colors.ash, fontSize: 14, textAlign: 'center' },
  reasonInput: { minHeight: 70, textAlignVertical: 'top' },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
```

- [ ] **Step 3: Feud screen wiring** — `app/feuds/[id].tsx`: add `safetyOpen` state; a `⋯` Pressable top-right of the header (absolute, like home's gear; text `t('safety.menu')` or literal ⋯, color smoke); `<SafetySheet visible={safetyOpen} targetId={opponentId} targetName={opponentName} feudId={feud.id} onClose={() => setSafetyOpen(false)} onBlocked={() => router.replace('/')} />`. Note `opponentId` is computed after the null-guard — place the sheet accordingly.

- [ ] **Step 4: Verify** — tests green, tsc 0, export bundles.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: safety sheet — block with dissolution, report"`

### Task 7: Two-simulator e2e walk (owner-driven)

- [ ] Rebuild NOT needed (no new native modules) — Metro reload suffices; but the migration needs `supabase db reset` → accounts wiped → clean reinstall both sims (known recipe).
- [ ] Anna + Bo re-setup, feud + a few scores/taunts.
- [ ] Settings: gear on home → edit catchphrase → Carve it → "Carved."; switch to Українська → whole app flips live; pick brutality tier (persists — visual font change is Plan 6); Leave the gate → back at auth gate → Login again.
- [ ] Safety: in feud, ⋯ → Report → reason → "The elders have been informed." Then ⋯ → Banish → confirm → land home, feud in Buried (dissolved); Bo's home also shows it dissolved after refresh; Anna creates invite → Bo's accept fails with blocked.
- [ ] Dead session: `supabase db reset` (with apps signed in!) → reopen either app → should self-heal to sign-in screen instead of auth_required errors. THE regression test for the whole walk-pain saga.
- [ ] Erase: sign up a throwaway, Settings → Point of no return → Erase my legend → confirm → back at gate; DB has no profile (`select count(*) from profiles` drops).
- [ ] Findings → fix-commits.
