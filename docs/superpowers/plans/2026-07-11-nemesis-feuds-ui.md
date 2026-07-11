# Nemesis Feuds UI Implementation Plan (Plan 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The playable game loop: summon a friend into a feud via share link, accept through a Match Moment, race two towers on the feud screen with score logging (optional proof), live opponent updates, and victory/defeat for showdowns.

**Architecture:** Screens consume `src/lib/feuds.ts` (Plan 3a) — extended here with meta-joins. Tower geometry is a pure tested module; the component is thin. Deep links ride the existing `nemesis` scheme through expo-router file routing (`app/feud/[code].tsx`). Realtime: one channel per open feud screen, `postgres_changes` on `score_entries` → refetch.

**Tech Stack:** existing + `expo-image-picker` (proof photos), RN `Share` API (no new lib).

**Spec sources:** spec/design-system.md §5 (Home, Summon sheet, Invite landing, Match Moment, Feud screen, Log score sheet) + §6 (TowerRace, ChronicleEntry, SummonSheet) + amendments; spec/copy-deck.md §3, §4 (+§3b added by Task 2); spec/data-contract.md amendments (invite RPCs, proofs bucket).

**Out of scope:** push (Plan 4), taunts (Plan 4), deck/declare/settings/forfeit/inactivity (Plan 5), milestone runes on endless towers (art-dependent, later), Match Moment animation polish (static interstitial now, motion later).

**Conventions:** RTL v14 `await render(...)`. All strings via i18n from Task 2 onward — no raw-key interims. Integration tests in the `integration` jest project (glob). Feud routes: `app/feud/[code].tsx` = invite landing (code = capability), `app/feuds/[id].tsx` = feud screen (id = uuid; RLS guards access).

---

### Task 1: Client API extensions

**Files:**
- Modify: `src/lib/feuds.ts`
- Test: `src/lib/__tests__/feuds-meta.integration.test.ts`

- [ ] **Step 1: Write failing integration test** `src/lib/__tests__/feuds-meta.integration.test.ts`

```ts
/**
 * @jest-environment node
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createInvite, acceptInvite, listFeudsWithMeta, pendingInvites, myOrdeals } from '../feuds';

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

maybe('feud meta api', () => {
  it('listFeudsWithMeta returns opponent persona and ordeal per feud', async () => {
    const a = await userWithProfile('meta-a', 'Meta Anna');
    const b = await userWithProfile('meta-b', 'Meta Bo');
    const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    const invite = await createInvite(a.client as any, { ordealId: ordeal!.id, mode: 'endless', goal: null });
    const feudId = await acceptInvite(b.client as any, invite.code);

    const feuds = await listFeudsWithMeta(a.client as any, a.id);
    const f = feuds.find((x) => x.feud.id === feudId)!;
    expect(f.opponent.nemesis_name).toBe('Meta Bo');
    expect(f.opponent.mask_avatar_id).toBeTruthy();
    expect(f.ordeal.id).toBe(ordeal!.id);
    expect(f.myTotal).toBe(0);
    expect(f.theirTotal).toBe(0);
  });

  it('pendingInvites lists only my live pending invites with ordeal meta', async () => {
    const a = await userWithProfile('pend-a', 'Pend Anna');
    const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    const inv = await createInvite(a.client as any, { ordealId: ordeal!.id, mode: 'showdown', goal: 42 });
    const list = await pendingInvites(a.client as any);
    const found = list.find((i) => i.id === inv.id)!;
    expect(found.mode).toBe('showdown');
    expect(Number(found.goal_value)).toBe(42);
    expect(found.ordeal.id).toBe(ordeal!.id);
  });

  it('myOrdeals returns the ordeals from my profile_ordeals', async () => {
    const a = await userWithProfile('mo-a', 'Mo Anna');
    const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    await admin().from('profile_ordeals').insert({ profile_id: a.id, ordeal_id: ordeal!.id, skill_hint: '9000' });
    const mine = await myOrdeals(a.client as any, a.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(ordeal!.id);
  });
});
```

- [ ] **Step 2: Run with keys — fails** (functions missing).

- [ ] **Step 3: Extend `src/lib/feuds.ts`** — append:

```ts
export interface ProfilePersona {
  id: string;
  nemesis_name: string;
  mask_avatar_id: string;
  catchphrase: string | null;
}

export interface FeudWithMeta {
  feud: FeudRow;
  opponent: ProfilePersona;
  ordeal: OrdealRow;
  myTotal: number;
  theirTotal: number;
}

export interface PendingInvite extends InviteRow {
  ordeal: OrdealRow;
  expires_at: string;
}

export async function listFeudsWithMeta(client: SupabaseClient, myId: string): Promise<FeudWithMeta[]> {
  const feuds = await listFeuds(client, myId);
  if (feuds.length === 0) return [];

  const opponentIds = [...new Set(feuds.map((f) => (f.profile_a === myId ? f.profile_b : f.profile_a)))];
  const ordealIds = [...new Set(feuds.map((f) => f.ordeal_id))];

  const [{ data: profiles }, { data: ordeals }] = await Promise.all([
    client.from('profiles').select('id, nemesis_name, mask_avatar_id, catchphrase').in('id', opponentIds),
    client.from('ordeals').select('*').in('id', ordealIds),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as ProfilePersona]));
  const ordealById = new Map((ordeals ?? []).map((o) => [o.id, o as OrdealRow]));

  const result: FeudWithMeta[] = [];
  for (const feud of feuds) {
    const opponentId = feud.profile_a === myId ? feud.profile_b : feud.profile_a;
    const opponent = profileById.get(opponentId);
    const ordeal = ordealById.get(feud.ordeal_id);
    if (opponent == null || ordeal == null) continue; // opponent deleted etc.
    const totals = await feudTotals(client, feud.id);
    result.push({
      feud,
      opponent,
      ordeal,
      myTotal: totals[myId] ?? 0,
      theirTotal: totals[opponentId] ?? 0,
    });
  }
  return result;
}

export async function pendingInvites(client: SupabaseClient): Promise<PendingInvite[]> {
  const { data, error } = await client
    .from('invites')
    .select('*, ordeal:ordeals(*)')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PendingInvite[];
}

export async function myOrdeals(client: SupabaseClient, myId: string): Promise<OrdealRow[]> {
  const { data, error } = await client
    .from('profile_ordeals')
    .select('ordeal:ordeals(*)')
    .eq('profile_id', myId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.ordeal as OrdealRow);
}
```

Note: `listFeudsWithMeta` runs one `feudTotals` query per feud (N+1). Acceptable at MVP feud counts (<20); optimize with a grouped query when it matters — do NOT pre-optimize now.

- [ ] **Step 4: Run — passes.** Bare suite green, tsc 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: feud meta api (list with personas, pending invites, my ordeals)"`

### Task 2: Strings — copy deck §3c + catalogs

**Files:**
- Modify: `spec/copy-deck.md`, `src/i18n/en.json`, `src/i18n/uk.json`
- Test: extend `src/i18n/__tests__/i18n.test.ts`

- [ ] **Step 1: Extend i18n test first** (red):

```ts
  it('plan-3b keys present', () => {
    for (const key of [
      'home.title', 'home.empty', 'home.buried', 'home.summonCta', 'home.pendingTitle',
      'summon.sheetTitle', 'summon.modeLabel', 'summon.goalLabel', 'summon.create',
      'landing.accept', 'landing.decline', 'landing.expired',
      'match.title', 'match.begin',
      'feud.logTitle', 'feud.valueLabel', 'feud.noteLabel', 'feud.attachProof', 'feud.proofAttached',
      'feud.chronicle', 'feud.you', 'feud.won', 'feud.lost',
    ]) {
      const resolveIn = (cat: object) => key.split('.').reduce((o: any, k) => o?.[k], cat);
      expect(typeof resolveIn(en)).toBe('string');
      expect(typeof resolveIn(uk)).toBe('string');
    }
  });
```

- [ ] **Step 2: Append to `spec/copy-deck.md`:**

```markdown
### 3c. Plan-3b additions (home, summon, landing, feud screen)

| Key | EN | UA (draft) |
| --- | --- | --- |
| home_title | Thy feuds | Твої ворожнечі |
| home_empty | No feuds yet. Summon a friend and begin. | Ворожнеч поки немає. Поклич друга і почни. |
| home_buried | Buried | Поховані |
| home_summon_cta | Summon a friend | Поклич друга |
| home_pending_title | Pending summons | Надіслані поклики |
| summon_sheet_title | Throw the glove | Кинь рукавицю |
| summon_mode_label | Mode | Режим |
| summon_goal_label | First to | Хто перший до |
| summon_create | Forge the summons | Викуй поклик |
| landing_accept | Answer the challenge | Прийняти виклик |
| landing_decline | Not today | Не сьогодні |
| landing_expired | This summons has faded into legend. | Цей поклик розчинився в історії. |
| match_title | AHHA, WE MEET AGAIN. | АГА, ОСЬ МИ І ЗУСТРІЛИСЯ. |
| match_begin | To the towers | До веж |
| feud_log_title | Log thy deed | Закарбуй свій чин |
| feud_value_label | How much | Скільки |
| feud_note_label | Note (optional) | Нотатка (необов'язково) |
| feud_attach_proof | Attach proof | Додати доказ |
| feud_proof_attached | Proof attached — this will be chronicled | Доказ додано — буде закарбовано |
| feud_chronicle | Chronicle | Літопис |
| feud_you | You | Ти |
| feud_won | VICTORY | ПЕРЕМОГА |
| feud_lost | DEFEAT | ПОРАЗКА |
```

(Some duplicate concepts exist in §3/§4 tables with slightly different keys — these §3c keys are the ones the app uses; §3/§4 remain the copy reference. UA drafts — owner reviews.)

- [ ] **Step 3: Add keys to both catalogs** under `home`, `summon`, `landing`, `match`, `feud` namespaces — UA character-for-character from the table.

- [ ] **Step 4: Run — green.** Commit: `git add -A && git commit -m "feat: plan-3b strings"`. Flag in report: controller syncs §3c to Obsidian.

### Task 3: Tower geometry + TowerRace component

**Files:**
- Create: `src/feud/tower-math.ts`, `src/components/TowerRace.tsx`
- Test: `src/feud/__tests__/tower-math.test.ts`

- [ ] **Step 1: Write failing test** `src/feud/__tests__/tower-math.test.ts`

```ts
import { towerGeometry } from '../tower-math';

const entry = (author: string, value: number, proof: boolean) => ({
  author, value, chronicled: proof,
});

describe('towerGeometry', () => {
  it('endless: normalizes to the leader', () => {
    const g = towerGeometry({
      mode: 'endless', goal: null, myId: 'me',
      entries: [entry('me', 30, true), entry('them', 60, false)],
      them: 'them',
    });
    expect(g.myHeight).toBeCloseTo(0.5);
    expect(g.theirHeight).toBeCloseTo(1);
    expect(g.goalLine).toBeNull();
  });

  it('showdown: normalizes to goal, capped at 1', () => {
    const g = towerGeometry({
      mode: 'showdown', goal: 100, myId: 'me',
      entries: [entry('me', 120, true), entry('them', 40, true)],
      them: 'them',
    });
    expect(g.myHeight).toBe(1);
    expect(g.theirHeight).toBeCloseTo(0.4);
    expect(g.goalLine).toBe(1);
  });

  it('builds per-entry segments with chronicled flag, in order', () => {
    const g = towerGeometry({
      mode: 'endless', goal: null, myId: 'me',
      entries: [entry('me', 10, true), entry('me', 30, false)],
      them: 'them',
    });
    expect(g.mySegments).toEqual([
      { fraction: 0.25, chronicled: true },
      { fraction: 0.75, chronicled: false },
    ]);
    expect(g.theirSegments).toEqual([]);
  });

  it('zero scores: both towers zero height, no NaN', () => {
    const g = towerGeometry({ mode: 'endless', goal: null, myId: 'me', entries: [], them: 'them' });
    expect(g.myHeight).toBe(0);
    expect(g.theirHeight).toBe(0);
    expect(Number.isNaN(g.myHeight)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/feud/tower-math.ts`

```ts
export interface TowerEntry {
  author: string;
  value: number;
  chronicled: boolean; // proof attached → stone; rumor → mist
}

export interface TowerSegment {
  fraction: number; // of the OWNER's own total (segments stack to 1)
  chronicled: boolean;
}

export interface TowerGeometry {
  myTotal: number;
  theirTotal: number;
  myHeight: number; // 0..1 of drawable height
  theirHeight: number;
  goalLine: number | null; // 0..1 position, showdown only
  mySegments: TowerSegment[];
  theirSegments: TowerSegment[];
}

interface Args {
  mode: 'endless' | 'showdown';
  goal: number | null;
  myId: string;
  them: string;
  entries: TowerEntry[];
}

export function towerGeometry({ mode, goal, myId, them, entries }: Args): TowerGeometry {
  const mine = entries.filter((e) => e.author === myId);
  const theirs = entries.filter((e) => e.author === them);
  const sum = (xs: TowerEntry[]) => xs.reduce((acc, e) => acc + Number(e.value), 0);
  const myTotal = sum(mine);
  const theirTotal = sum(theirs);

  const reference = mode === 'showdown' && goal != null ? goal : Math.max(myTotal, theirTotal);
  const norm = (v: number) => (reference <= 0 ? 0 : Math.min(1, v / reference));

  const segments = (xs: TowerEntry[], total: number): TowerSegment[] =>
    total <= 0 ? [] : xs.map((e) => ({ fraction: Number(e.value) / total, chronicled: e.chronicled }));

  return {
    myTotal,
    theirTotal,
    myHeight: norm(myTotal),
    theirHeight: norm(theirTotal),
    goalLine: mode === 'showdown' ? 1 : null,
    mySegments: segments(mine, myTotal),
    theirSegments: segments(theirs, theirTotal),
  };
}
```

- [ ] **Step 4: Implement** `src/components/TowerRace.tsx`

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { towerGeometry, type TowerEntry } from '../feud/tower-math';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  mode: 'endless' | 'showdown';
  goal: number | null;
  myId: string;
  them: string;
  entries: TowerEntry[];
  myName: string;
  theirName: string;
  unit: string;
}

const TOWER_HEIGHT = 220;

function Tower({ height, segments, mist }: { height: number; segments: { fraction: number; chronicled: boolean }[]; mist?: boolean }) {
  return (
    <View style={styles.towerWell}>
      <View style={[styles.tower, { height: Math.max(4, height * TOWER_HEIGHT) }]}>
        {segments.map((s, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { flex: s.fraction },
              s.chronicled ? styles.stone : styles.mistSeg,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function TowerRace({ mode, goal, myId, them, entries, myName, theirName, unit }: Props) {
  const g = towerGeometry({ mode, goal, myId, them, entries });
  return (
    <View style={styles.root}>
      {g.goalLine != null && (
        <View style={[styles.goalLine, { bottom: g.goalLine * TOWER_HEIGHT + LABELS_H }]}>
          <Text style={styles.goalText}>{goal} {unit}</Text>
        </View>
      )}
      <View style={styles.towers}>
        <View style={styles.column}>
          <Tower height={g.myHeight} segments={g.mySegments} />
          <Text style={styles.total}>{g.myTotal} {unit}</Text>
          <Text style={styles.name}>{myName}</Text>
        </View>
        <View style={styles.column}>
          <Tower height={g.theirHeight} segments={g.theirSegments} />
          <Text style={styles.total}>{g.theirTotal} {unit}</Text>
          <Text style={[styles.name, styles.theirName]}>{theirName}</Text>
        </View>
      </View>
    </View>
  );
}

const LABELS_H = 44;

const styles = StyleSheet.create({
  root: { position: 'relative', paddingVertical: spacing[2] },
  towers: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-end' },
  column: { alignItems: 'center', gap: spacing[0] },
  towerWell: { height: TOWER_HEIGHT, justifyContent: 'flex-end' },
  tower: {
    width: 56, borderTopLeftRadius: radii.chip, borderTopRightRadius: radii.chip,
    overflow: 'hidden', flexDirection: 'column-reverse',
  },
  segment: { width: '100%' },
  stone: { backgroundColor: colors.bloodMist, borderTopWidth: 1, borderTopColor: colors.blood },
  mistSeg: { backgroundColor: colors.venomDim, opacity: 0.55, borderTopWidth: 1, borderTopColor: colors.venomDeep },
  total: { color: colors.bone, fontSize: 16, marginTop: spacing[0] },
  name: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  theirName: { color: colors.venomDeep },
  goalLine: {
    position: 'absolute', left: spacing[3], right: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.blood, borderStyle: 'dashed',
    alignItems: 'flex-end', zIndex: 1,
  },
  goalText: { color: colors.blood, fontSize: 10, letterSpacing: 1, marginTop: 2 },
});
```

- [ ] **Step 5: Run — math tests pass, tsc 0.** Commit: `feat: tower geometry and towerrace component`.

### Task 4: Home — feud list

**Files:**
- Rewrite: `app/index.tsx`
- Create: `src/components/FeudRowCard.tsx`

- [ ] **Step 1: Implement** `src/components/FeudRowCard.tsx`

```tsx
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FeudWithMeta } from '../lib/feuds';
import { ordealLabel, ordealUnit } from '../onboarding/ordeal-labels';
import { SIGILS } from '../onboarding/sigils';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  item: FeudWithMeta;
  onPress: () => void;
}

export function FeudRowCard({ item, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const glyph = SIGILS.find((s) => s.id === item.opponent.mask_avatar_id)?.glyph ?? '✠';
  const ended = item.feud.status !== 'active';
  return (
    <Pressable onPress={onPress} style={[styles.card, ended && styles.ended]}>
      <Text style={styles.sigil}>{glyph}</Text>
      <View style={styles.mid}>
        <Text style={styles.opponent}>{item.opponent.nemesis_name}</Text>
        <Text style={styles.ordeal}>
          {ordealLabel(item.ordeal, i18n.language)}
          {item.feud.mode === 'showdown' && item.feud.goal_value != null
            ? ` · ${t('feud.modeShowdown', { goal: item.feud.goal_value })}`
            : ''}
        </Text>
      </View>
      <View style={styles.scores}>
        <Text style={styles.score}>{item.myTotal} : {item.theirTotal}</Text>
        <Text style={styles.unit}>{ordealUnit(item.ordeal, i18n.language)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.card, padding: spacing[3],
  },
  ended: { opacity: 0.55 },
  sigil: { fontSize: 28, color: colors.venom },
  mid: { flex: 1 },
  opponent: { color: colors.bone, fontSize: 16 },
  ordeal: { color: colors.smoke, fontSize: 12, marginTop: 2 },
  scores: { alignItems: 'flex-end' },
  score: { color: colors.bone, fontSize: 16 },
  unit: { color: colors.smoke, fontSize: 10 },
});
```

- [ ] **Step 2: Rewrite `app/index.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { listFeudsWithMeta, type FeudWithMeta } from '../src/lib/feuds';
import { FeudRowCard } from '../src/components/FeudRowCard';
import { GrimButton } from '../src/components/GrimButton';
import { colors, semantic, spacing } from '../src/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  const { session } = useSession();
  const router = useRouter();
  const [feuds, setFeuds] = useState<FeudWithMeta[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (session == null) return;
    setRefreshing(true);
    try {
      setFeuds(await listFeudsWithMeta(supabase, session.user.id));
    } finally {
      setRefreshing(false);
    }
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = feuds.filter((f) => f.feud.status === 'active');
  const buried = feuds.filter((f) => f.feud.status === 'ended' || f.feud.status === 'dissolved');

  return (
    <View style={styles.root}>
      <Text style={styles.logo}>NEMESIS</Text>
      <Text style={styles.title}>{t('home.title')}</Text>
      <FlatList
        data={active}
        keyExtractor={(f) => f.feud.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.blood} />}
        renderItem={({ item }) => (
          <FeudRowCard item={item} onPress={() => router.push(`/feuds/${item.feud.id}`)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('home.empty')}</Text>}
        ListFooterComponent={
          buried.length > 0 ? (
            <View style={styles.buriedWrap}>
              <Text style={styles.buriedTitle}>{t('home.buried')}</Text>
              {buried.map((item) => (
                <FeudRowCard key={item.feud.id} item={item} onPress={() => router.push(`/feuds/${item.feud.id}`)} />
              ))}
            </View>
          ) : null
        }
      />
      <GrimButton label={t('home.summonCta')} onPress={() => router.push('/summon')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  logo: { color: semantic.text, fontSize: 30, letterSpacing: 5, textAlign: 'center' },
  title: { color: colors.venomDeep, fontSize: 13, letterSpacing: 2, textAlign: 'center', marginBottom: spacing[2] },
  list: { gap: spacing[2], flexGrow: 1 },
  empty: { color: colors.smoke, fontSize: 14, textAlign: 'center', marginTop: spacing[5] },
  buriedWrap: { marginTop: spacing[4], gap: spacing[2] },
  buriedTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
});
```

- [ ] **Step 3: Update home render test** `app/__tests__/index.test.tsx` — the screen now calls `listFeudsWithMeta`; mock the feuds module too:

```tsx
import { render } from '@testing-library/react-native';
import '../../src/i18n';

jest.mock('../../src/auth/session', () => ({
  useSession: () => ({ loading: false, session: null, hasProfile: false, refreshProfile: async () => {} }),
}));
jest.mock('../../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../../src/lib/feuds', () => ({ listFeudsWithMeta: jest.fn(async () => []) }));

import Home from '../index';

describe('Home', () => {
  it('renders logo and empty state', async () => {
    const { getByText } = await render(<Home />);
    getByText('NEMESIS');
    getByText('No feuds yet. Summon a friend and begin.');
  });
});
```

- [ ] **Step 4: Run** — green, tsc 0, expo export bundles. Commit: `feat: home feud list with buried section`.

### Task 5: Summon sheet

**Files:**
- Create: `app/summon.tsx`

- [ ] **Step 1: Implement** `app/summon.tsx`

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Share, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../src/lib/supabase';
import { useSession } from '../src/auth/session';
import { createInvite, pendingInvites, revokeInvite, myOrdeals, type PendingInvite } from '../src/lib/feuds';
import { ordealLabel, type OrdealRow } from '../src/onboarding/ordeal-labels';
import { GrimButton } from '../src/components/GrimButton';
import { GrimInput } from '../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../src/theme/tokens';

export default function Summon() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [ordeals, setOrdeals] = useState<OrdealRow[]>([]);
  const [ordealId, setOrdealId] = useState<string | null>(null);
  const [showdown, setShowdown] = useState(false);
  const [goal, setGoal] = useState('');
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (session == null) return;
    const [mine, pend] = await Promise.all([myOrdeals(supabase, session.user.id), pendingInvites(supabase)]);
    setOrdeals(mine);
    setPending(pend);
    if (mine.length > 0 && ordealId == null) setOrdealId(mine[0].id);
  }

  useEffect(() => { reload(); }, [session?.user.id]);

  const goalNum = Number(goal);
  const goalValid = !showdown || (Number.isFinite(goalNum) && goalNum > 0);

  async function create() {
    if (ordealId == null || !goalValid) return;
    setBusy(true);
    setError(null);
    try {
      const invite = await createInvite(supabase, {
        ordealId, mode: showdown ? 'showdown' : 'endless', goal: showdown ? goalNum : null,
      });
      await Share.share({ message: `${t('summon.shareText')}\nnemesis://feud/${invite.code}` });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('summon.sheetTitle')}</Text>
      <FlatList
        data={ordeals}
        keyExtractor={(o) => o.id}
        style={styles.ordealList}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setOrdealId(item.id)}
            style={[styles.row, ordealId === item.id && styles.rowOn]}
          >
            <Text style={[styles.rowLabel, ordealId === item.id && styles.rowLabelOn]}>
              {ordealLabel(item, i18n.language)}
            </Text>
          </Pressable>
        )}
      />
      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>
          {showdown ? t('feud.modeShowdown', { goal: goal || '…' }) : t('feud.modeEndless')}
        </Text>
        <Switch value={showdown} onValueChange={setShowdown}
          trackColor={{ false: colors.venomDim, true: colors.bloodDeep }} thumbColor={colors.bone} />
      </View>
      {showdown && (
        <GrimInput value={goal} onChangeText={setGoal} placeholder="100" keyboardType="numeric" />
      )}
      {error != null && <Text style={styles.error}>{error}</Text>}
      <GrimButton label={t('summon.create')} onPress={create}
        disabled={busy || ordealId == null || !goalValid} />
      {pending.length > 0 && (
        <View style={styles.pendingWrap}>
          <Text style={styles.pendingTitle}>{t('home.pendingTitle')}</Text>
          {pending.map((inv) => (
            <View key={inv.id} style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                {ordealLabel(inv.ordeal, i18n.language)}
                {inv.mode === 'showdown' ? ` · ${inv.goal_value}` : ''}
              </Text>
              <Pressable onPress={async () => { await revokeInvite(supabase, inv.id); reload(); }}>
                <Text style={styles.revoke}>{t('summon.revoke')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[2] },
  title: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  ordealList: { maxHeight: 260 },
  list: { gap: spacing[1] },
  row: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.button, paddingVertical: spacing[2], paddingHorizontal: spacing[3],
  },
  rowOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  rowLabel: { color: colors.ash, fontSize: 15 },
  rowLabelOn: { color: colors.bone },
  modeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeLabel: { color: colors.ash, fontSize: 14 },
  error: { color: colors.blood, fontSize: 13 },
  pendingWrap: { marginTop: spacing[2], gap: spacing[1] },
  pendingTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  pendingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingText: { color: colors.ash, fontSize: 13 },
  revoke: { color: colors.blood, fontSize: 13 },
});
```

Note: `summon.shareText` key = existing `summon_share_text` from copy deck §3 — verify it exists in catalogs as `summon.shareText`; if the catalogs have it under a different name from Plan 2's sweep, add the alias in Task 2 (check BEFORE Task 2 commit).

- [ ] **Step 2: Run** — tsc 0, export bundles, tests green. Commit: `feat: summon sheet with share and pending invites`.

### Task 6: Invite landing + Match Moment

**Files:**
- Create: `app/feud/[code].tsx`, `src/components/MatchMoment.tsx`

- [ ] **Step 1: Implement** `src/components/MatchMoment.tsx`

```tsx
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SIGILS } from '../onboarding/sigils';
import { colors, spacing } from '../theme/tokens';

interface Props {
  mySigilId: string | null;
  theirSigilId: string;
  onDone: () => void;
}

export function MatchMoment({ mySigilId, theirSigilId, onDone }: Props) {
  const { t } = useTranslation();
  const glyph = (id: string | null) => SIGILS.find((s) => s.id === id)?.glyph ?? '✠';
  return (
    <Pressable style={styles.root} onPress={onDone}>
      <View style={styles.sigils}>
        <Text style={styles.sigil}>{glyph(mySigilId)}</Text>
        <Text style={styles.vs}>⚔︎</Text>
        <Text style={styles.sigil}>{glyph(theirSigilId)}</Text>
      </View>
      <Text style={styles.title}>{t('match.title')}</Text>
      <Text style={styles.begin}>{t('match.begin')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void, alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  sigils: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  sigil: { fontSize: 64, color: colors.venom },
  vs: { fontSize: 30, color: colors.blood },
  title: { color: colors.bone, fontSize: 22, letterSpacing: 3, textAlign: 'center' },
  begin: { color: colors.blood, fontSize: 14, letterSpacing: 2 },
});
```

- [ ] **Step 2: Implement** `app/feud/[code].tsx`

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { getInvite, acceptInvite, type InviteLanding } from '../../src/lib/feuds';
import { ordealLabel } from '../../src/onboarding/ordeal-labels';
import { SIGILS } from '../../src/onboarding/sigils';
import { GrimButton } from '../../src/components/GrimButton';
import { MatchMoment } from '../../src/components/MatchMoment';
import { colors, semantic, spacing } from '../../src/theme/tokens';

export default function InviteLandingScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [landing, setLanding] = useState<InviteLanding | null>(null);
  const [dead, setDead] = useState(false);
  const [matched, setMatched] = useState<string | null>(null); // feud id after accept
  const [mySigil, setMySigil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code == null || session == null) return;
    getInvite(supabase, code)
      .then((l) => (l.status === 'pending' ? setLanding(l) : setDead(true)))
      .catch(() => setDead(true));
    supabase.from('profiles').select('mask_avatar_id').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setMySigil(data?.mask_avatar_id ?? null));
  }, [code, session?.user.id]);

  async function accept() {
    if (code == null) return;
    setBusy(true);
    try {
      const feudId = await acceptInvite(supabase, code);
      setMatched(feudId);
    } catch {
      setDead(true);
    } finally {
      setBusy(false);
    }
  }

  if (matched != null && landing != null) {
    return (
      <MatchMoment
        mySigilId={mySigil}
        theirSigilId={landing.inviter_sigil}
        onDone={() => router.replace(`/feuds/${matched}`)}
      />
    );
  }

  if (dead) {
    return (
      <View style={styles.root}>
        <Text style={styles.deadText}>{t('landing.expired')}</Text>
        <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.replace('/')} />
      </View>
    );
  }

  if (landing == null) return <View style={styles.root} />;

  const glyph = SIGILS.find((s) => s.id === landing.inviter_sigil)?.glyph ?? '✠';
  return (
    <View style={styles.root}>
      <Text style={styles.sigil}>{glyph}</Text>
      <Text style={styles.title}>
        {t('summon.landingTitle', { name: landing.inviter_name })}
      </Text>
      <Text style={styles.terms}>
        {ordealLabel(landing.ordeal, i18n.language)}
        {landing.mode === 'showdown'
          ? ` — ${t('feud.modeShowdown', { goal: landing.goal_value })}`
          : ` — ${t('feud.modeEndless')}`}
      </Text>
      <GrimButton label={t('landing.accept')} onPress={accept} disabled={busy} />
      <GrimButton label={t('landing.decline')} variant="ghost" onPress={() => router.replace('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, justifyContent: 'center', padding: spacing[4], gap: spacing[3] },
  sigil: { fontSize: 56, color: colors.venom, textAlign: 'center' },
  title: { color: colors.bone, fontSize: 20, textAlign: 'center', letterSpacing: 1 },
  terms: { color: colors.ash, fontSize: 15, textAlign: 'center' },
  deadText: { color: colors.smoke, fontSize: 16, textAlign: 'center' },
});
```

Key check: `summon.landingTitle` — Plan 2's sweep stored §3 keys? If `invite_landing_title` isn't in catalogs yet, Task 2 must add it as `summon.landingTitle` with the copy-deck value. Verify during Task 2.

- [ ] **Step 3: Run** — tsc 0, export bundles. Commit: `feat: invite landing with match moment`.

### Task 7: Feud screen

**Files:**
- Create: `app/feuds/[id].tsx`

- [ ] **Step 1: Install picker** — `npx expo install expo-image-picker` (+ its app.json plugin if the install adds one; accept).

- [ ] **Step 2: Implement** `app/feuds/[id].tsx`

```tsx
import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../src/lib/supabase';
import { useSession } from '../../src/auth/session';
import { listScores, logScore, type FeudRow, type ScoreEntry } from '../../src/lib/feuds';
import { ordealLabel, ordealUnit, type OrdealRow } from '../../src/onboarding/ordeal-labels';
import { TowerRace } from '../../src/components/TowerRace';
import { GrimButton } from '../../src/components/GrimButton';
import { GrimInput } from '../../src/components/GrimInput';
import { colors, radii, semantic, spacing } from '../../src/theme/tokens';

export default function FeudScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id ?? '';

  const [feud, setFeud] = useState<FeudRow | null>(null);
  const [ordeal, setOrdeal] = useState<OrdealRow | null>(null);
  const [opponentName, setOpponentName] = useState('');
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (id == null || myId === '') return;
    const { data: f } = await supabase.from('feuds').select('*').eq('id', id).maybeSingle();
    if (f == null) { router.replace('/'); return; }
    setFeud(f as FeudRow);
    const opponentId = f.profile_a === myId ? f.profile_b : f.profile_a;
    const [{ data: o }, { data: p }, scores] = await Promise.all([
      supabase.from('ordeals').select('*').eq('id', f.ordeal_id).single(),
      supabase.from('profiles').select('nemesis_name').eq('id', opponentId).maybeSingle(),
      listScores(supabase, id),
    ]);
    setOrdeal(o as OrdealRow);
    setOpponentName(p?.nemesis_name ?? '???');
    setEntries(scores);
  }, [id, myId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (id == null) return;
    const channel = supabase
      .channel(`feud:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'score_entries', filter: `feud_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'feuds', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  async function pickProof() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets[0] != null) setProofUri(res.assets[0].uri);
  }

  async function submit() {
    if (feud == null) return;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) { setError(t('validation.tooShort')); return; }
    setBusy(true);
    setError(null);
    try {
      let proofUrl: string | undefined;
      if (proofUri != null) {
        const path = `${feud.id}/${Date.now()}.jpg`;
        const resp = await fetch(proofUri);
        const blob = await resp.arrayBuffer();
        const { error: upErr } = await supabase.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg' });
        if (upErr) throw upErr;
        proofUrl = path;
      }
      await logScore(supabase, { feudId: feud.id, value: num, note, proofUrl });
      setLogOpen(false);
      setValue(''); setNote(''); setProofUri(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (feud == null || ordeal == null) return <View style={styles.root} />;

  const unit = ordealUnit(ordeal, i18n.language);
  const opponentId = feud.profile_a === myId ? feud.profile_b : feud.profile_a;
  const ended = feud.status === 'ended';
  const iWon = ended && feud.winner === myId;
  const myEntries = entries.filter((e) => e.author === myId);
  const rumorCount = myEntries.filter((e) => e.proof_url == null).length;
  const rumorPct = myEntries.length > 0 ? Math.round((rumorCount / myEntries.length) * 100) : 0;

  return (
    <View style={styles.root}>
      <Text style={styles.header}>{opponentName}</Text>
      <Text style={styles.subheader}>{ordealLabel(ordeal, i18n.language)}</Text>
      {ended && (
        <View style={styles.verdict}>
          <Text style={[styles.verdictText, iWon ? styles.won : styles.lost]}>
            {iWon ? t('feud.won') : t('feud.lost')}
          </Text>
          {iWon && rumorPct > 0 && (
            <Text style={styles.rumorRatio}>{t('feud.victoryRumorRatio', { pct: rumorPct })}</Text>
          )}
        </View>
      )}
      <TowerRace
        mode={feud.mode}
        goal={feud.goal_value}
        myId={myId}
        them={opponentId}
        entries={entries.map((e) => ({ author: e.author, value: Number(e.value), chronicled: e.proof_url != null }))}
        myName={t('feud.you')}
        theirName={opponentName}
        unit={unit}
      />
      {!ended && <GrimButton label={t('feud.logDeed')} onPress={() => setLogOpen(true)} />}
      <Text style={styles.chronicleTitle}>{t('feud.chronicle')}</Text>
      <FlatList
        data={[...entries].reverse()}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.chronicle}
        renderItem={({ item }) => {
          const mine = item.author === myId;
          const rumor = item.proof_url == null;
          return (
            <View style={[styles.entry, rumor && styles.entryRumor]}>
              <Text style={[styles.entryWho, mine ? styles.entryMine : styles.entryTheirs]}>
                {mine ? t('feud.you') : opponentName}
              </Text>
              <Text style={styles.entryValue}>
                +{Number(item.value)} {unit}{rumor ? ` · ${t('feud.entryRumor')}` : ''}
              </Text>
              {item.note != null && <Text style={styles.entryNote}>{item.note}</Text>}
            </View>
          );
        }}
      />
      <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />

      <Modal visible={logOpen} transparent animationType="fade" onRequestClose={() => setLogOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modal}>
            <Text style={styles.header}>{t('feud.logTitle')}</Text>
            <Text style={styles.fieldLabel}>{t('feud.valueLabel')} ({unit})</Text>
            <GrimInput value={value} onChangeText={setValue} placeholder="5" keyboardType="numeric" />
            <Text style={styles.fieldLabel}>{t('feud.noteLabel')}</Text>
            <GrimInput value={note} onChangeText={setNote} placeholder="…" />
            <Pressable onPress={pickProof}>
              <Text style={styles.proofCta}>
                {proofUri != null ? t('feud.proofAttached') : t('feud.attachProof')}
              </Text>
            </Pressable>
            <Text style={styles.proofHint}>{t('feud.proofHint')}</Text>
            {error != null && <Text style={styles.error}>{error}</Text>}
            <GrimButton label={t('common.confirm')} onPress={submit} disabled={busy} />
            <GrimButton label={t('common.cancel')} variant="ghost" onPress={() => setLogOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.bg, padding: spacing[4], paddingTop: spacing[5] * 2, gap: spacing[1] },
  header: { color: colors.bone, fontSize: 22, textAlign: 'center', letterSpacing: 1 },
  subheader: { color: colors.smoke, fontSize: 13, textAlign: 'center' },
  verdict: { alignItems: 'center', marginVertical: spacing[1] },
  verdictText: { fontSize: 28, letterSpacing: 4 },
  won: { color: colors.blood },
  lost: { color: colors.smoke },
  rumorRatio: { color: colors.venomDeep, fontSize: 12, marginTop: 2 },
  chronicleTitle: { color: colors.smoke, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing[2] },
  chronicle: { gap: spacing[1] },
  entry: {
    backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim,
    borderRadius: radii.chip, padding: spacing[2],
  },
  entryRumor: { opacity: 0.7, borderStyle: 'dashed' },
  entryWho: { fontSize: 11, letterSpacing: 1 },
  entryMine: { color: colors.blood },
  entryTheirs: { color: colors.venomDeep },
  entryValue: { color: colors.bone, fontSize: 14 },
  entryNote: { color: colors.ash, fontSize: 12, fontStyle: 'italic' },
  fieldLabel: { color: colors.ash, fontSize: 12, letterSpacing: 1 },
  proofCta: { color: colors.venom, fontSize: 13 },
  proofHint: { color: colors.smoke, fontSize: 11 },
  error: { color: colors.blood, fontSize: 13 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.85)', justifyContent: 'center', padding: spacing[4] },
  modal: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[4], gap: spacing[2] },
});
```

Key checks: `feud.entryRumor`, `feud.proofHint`, `feud.modeEndless/modeShowdown`, `feud.victoryRumorRatio` exist from Plan 2's catalogs; Task 2 covers the rest. Realtime requires `supabase_realtime` publication on the tables — local stack enables it via config; if the subscription silently does nothing, check `alter publication supabase_realtime add table score_entries, feuds;` is needed as a migration and report it (add the migration if so — it's contract-consistent, §5 Realtime).

- [ ] **Step 3: Run** — tsc 0, export bundles, all tests green. Commit: `feat: feud screen with towers, chronicle, score logging, realtime`.

### Task 8: Two-simulator e2e walk (manual, owner-driven)

**Files:** none

- [ ] **Step 1:** Stack up + `.env` at 127.0.0.1. `npx expo run:ios` (sim A). Boot second sim: `xcrun simctl boot "<other iPhone>"`, `open -a Simulator`, install same build: `xcrun simctl install <name> ~/Library/Developer/Xcode/DerivedData/Nemesis-*/Build/Products/Debug-iphonesimulator/Nemesis.app`, launch it.
- [ ] **Step 2:** Sign up Anna (sim A) + Bo (sim B), both through onboarding.
- [ ] **Step 3:** Anna: Summon → pick ordeal → showdown, goal small (e.g. 10) → create → share sheet shows link; copy the code. Pending list shows it; test revoke on a second invite.
- [ ] **Step 4:** Inject link into sim B: `xcrun simctl openurl <name> "nemesis://feud/<code>"` → landing shows Anna's terms → accept → Match Moment → feud screen.
- [ ] **Step 5:** Both log scores; verify towers update live on the OTHER simulator without manual refresh (realtime). Attach a proof photo on one entry (simulator photo library has stock images) — verify stone vs mist rendering + rumor tag in chronicle.
- [ ] **Step 6:** Log past the goal → verify VICTORY/DEFEAT verdicts on respective devices + rumor ratio line + feud moves to Buried on home + log button gone.
- [ ] **Step 7:** Report findings — anything broken becomes fix-commits.
