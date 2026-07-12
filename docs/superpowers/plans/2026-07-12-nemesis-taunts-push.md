# Nemesis Taunts & Push Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nemeses exchange forged taunts (1/day, closed vocabulary, EN/UA banks) rendered as missives in the feud screen, arriving live; push notifications inform the opponent of matches, taunts, and scores.

**Architecture:** Taunt data lives in the existing `taunt_templates`/`taunt_banks`/`taunts` tables; sending goes through a `send_taunt` RPC mirroring the forge_ordeal pattern. Push is a single `notify` Edge Function invoked fire-and-forget by the acting client (contract amendment 2026-07-12 documents the trade-off). Client gains `src/lib/push.ts` (token acquisition, always-optional) and `src/lib/taunts.ts` (fetch/assemble/send).

**Spec sources:** spec/copy-deck.md §5 (strings + template/bank contents — normative), §8 (push strings); spec/data-contract.md amendments (2026-07-12 is normative); spec/design-system.md §5 Taunt Forge + §6 TauntForge/MissiveCard.

**Out of scope:** taunt template #2+, birch-bark missive art, physical-device push verification (needs EAS project — parked with store prep), deck/arch/settings (Plan 5), inactivity/forfeit (Plan 5).

**Conventions:** as previous plans. UA text NEVER retyped — extracted programmatically from spec/copy-deck.md. Integration tests self-skip without keys.

---

### Task 1: Migration — taunt seed + send_taunt RPC + realtime

**Files:**
- Create: `supabase/migrations/00000000000009_taunts.sql`
- Create: `scripts/gen-taunt-seed.py` (generator, committed for reproducibility)
- Test: `src/lib/__tests__/taunts.integration.test.ts`

- [ ] **Step 1: Write failing integration test** `src/lib/__tests__/taunts.integration.test.ts`

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

maybe('taunt system', () => {
  it('seeded templates exist for both languages with full banks', async () => {
    const u = await userWithProfile('seed-t', 'Seed Tester');
    const { data: templates } = await u.client.from('taunt_templates').select('*');
    const en = templates!.find((t) => t.language === 'en')!;
    const uk = templates!.find((t) => t.language === 'uk')!;
    expect(en.slot_count).toBe(4);
    expect(uk.slot_count).toBe(4);
    const { data: enBanks } = await u.client.from('taunt_banks').select('*').eq('template_id', en.id);
    const slots = (rows: any[], i: number) => rows.filter((r) => r.slot_index === i).length;
    expect(slots(enBanks!, 0)).toBe(5);
    expect(slots(enBanks!, 1)).toBe(11);
    expect(slots(enBanks!, 2)).toBe(10);
    expect(slots(enBanks!, 3)).toBe(13);
    const { data: ukBanks } = await u.client.from('taunt_banks').select('word').eq('template_id', uk.id).eq('slot_index', 0).eq('word_index', 0);
    expect(ukBanks![0].word).toBe('Твоє');
  });

  it('member sends a taunt; second same-day taunt rejected as taunt_spent', async () => {
    const a = await userWithProfile('taunt-a', 'Taunt Anna');
    const b = await userWithProfile('taunt-b', 'Taunt Bo');
    const feudId = await makeFeud(a, b);
    const { data: tpl } = await a.client.from('taunt_templates').select('id').eq('language', 'en').single();

    const { data: sent, error } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 1, 2, 3],
    });
    expect(error).toBeNull();
    expect(sent.picks).toEqual([0, 1, 2, 3]);

    const { error: again } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [1, 1, 1, 1],
    });
    expect(again).not.toBeNull();
    expect(again!.message).toContain('taunt_spent');

    const { data: visible } = await b.client.from('taunts').select('*').eq('feud_id', feudId);
    expect(visible).toHaveLength(1);
  });

  it('rejects out-of-range picks and non-members', async () => {
    const a = await userWithProfile('bad-a', 'Bad Anna');
    const b = await userWithProfile('bad-b', 'Bad Bo');
    const s = await userWithProfile('bad-s', 'Bad Stranger');
    const feudId = await makeFeud(a, b);
    const { data: tpl } = await a.client.from('taunt_templates').select('id').eq('language', 'en').single();

    const { error: range } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 99, 0, 0],
    });
    expect(range!.message).toContain('bad_picks');

    const { error: wrongLen } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 0],
    });
    expect(wrongLen!.message).toContain('bad_picks');

    const { error: stranger } = await s.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 0, 0, 0],
    });
    expect(stranger!.message).toContain('not_member');
  });
});
```

- [ ] **Step 2: Run with keys — fails** (no templates, no RPC).

- [ ] **Step 3: Write the seed generator** `scripts/gen-taunt-seed.py` — parses spec/copy-deck.md §5 slot lists and emits SQL. NEVER hand-type the words.

```python
#!/usr/bin/env python3
"""Generate taunt template/bank seed SQL from spec/copy-deck.md section 5.
Words are extracted programmatically -- never retyped -- to preserve UA text."""
import re, pathlib

spec = pathlib.Path(__file__).resolve().parent.parent / 'spec' / 'copy-deck.md'
text = spec.read_text(encoding='utf-8')

def slots_for(header_marker: str) -> list[list[str]]:
    block = text.split(header_marker, 1)[1]
    slots = []
    for line in block.splitlines():
        m = re.match(r'^- Slot \d+: (.+)$', line.strip())
        if m:
            slots.append([w.strip() for w in m.group(1).split('·')])
        elif slots and line.strip() == '':
            break
    return slots

en_slots = slots_for('**EN template 1**')
uk_slots = slots_for('**UA template 1**')
assert len(en_slots) == 4 and len(uk_slots) == 4, (len(en_slots), len(uk_slots))
assert en_slots[0][0] == 'Thy' and uk_slots[0][0] == 'Твоє'

def esc(w: str) -> str:
    return w.replace("'", "''")

out = ["-- GENERATED by scripts/gen-taunt-seed.py from spec/copy-deck.md section 5. Do not hand-edit words."]
for lang, slots in (('en', en_slots), ('uk', uk_slots)):
    var = f'tpl_{lang}'
    out.append(f"""
do $$
declare {var} uuid;
begin
  insert into taunt_templates (language, skeleton, slot_count)
  values ('{lang}', '{{0}} {{1}} {{2}} {{3}}.', 4)
  returning id into {var};""")
    for si, words in enumerate(slots):
        for wi, w in enumerate(words):
            out.append(f"  insert into taunt_banks (template_id, slot_index, word_index, word) values ({var}, {si}, {wi}, '{esc(w)}');")
    out.append("end $$;")

print('\n'.join(out))
```

- [ ] **Step 4: Write migration** `supabase/migrations/00000000000009_taunts.sql` — run `python3 scripts/gen-taunt-seed.py > /tmp/taunt-seed.sql`, then compose the migration as: (1) the generated seed content, followed by (2) this RPC + realtime block (verbatim):

```sql
create or replace function send_taunt(p_feud_id uuid, p_template_id uuid, p_picks int[])
returns taunts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud feuds;
  v_slot_count int;
  v_bank_size int;
  v_taunt taunts;
  i int;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_feud from feuds where id = p_feud_id;
  if not found or auth.uid() not in (v_feud.profile_a, v_feud.profile_b) then
    raise exception 'not_member';
  end if;
  if v_feud.status <> 'active' then
    raise exception 'feud_not_active';
  end if;
  select slot_count into v_slot_count from taunt_templates where id = p_template_id;
  if not found then
    raise exception 'bad_template';
  end if;
  if p_picks is null or array_length(p_picks, 1) <> v_slot_count then
    raise exception 'bad_picks';
  end if;
  for i in 0 .. v_slot_count - 1 loop
    select count(*) into v_bank_size from taunt_banks
    where template_id = p_template_id and slot_index = i;
    if p_picks[i + 1] < 0 or p_picks[i + 1] >= v_bank_size then
      raise exception 'bad_picks';
    end if;
  end loop;

  begin
    insert into taunts (feud_id, author, template_id, picks)
    values (p_feud_id, auth.uid(), p_template_id, p_picks)
    returning * into v_taunt;
  exception when unique_violation then
    raise exception 'taunt_spent';
  end;
  return v_taunt;
end;
$$;

revoke execute on function send_taunt(uuid, uuid, int[]) from public;
grant execute on function send_taunt(uuid, uuid, int[]) to authenticated;

alter publication supabase_realtime add table taunts;
```

- [ ] **Step 5: Apply + verify.** `supabase db reset`; re-run tests → 3 pass. Cyrillic spot-check straight from DB:

```bash
docker exec supabase_db_nemesis psql -U postgres -t -c "select word from taunt_banks b join taunt_templates t on t.id=b.template_id where t.language='uk' and b.slot_index=3 order by b.word_index limit 3;"
```

Expected first row: `розсипається переді мною`. Also `grep -c "враг" supabase/migrations/00000000000009_taunts.sql` → 0 matches (exit 1).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: taunt seed, send_taunt rpc, taunts realtime"`

### Task 2: Taunt client module (fetch, assemble, send)

**Files:**
- Create: `src/lib/taunts.ts`
- Test: `src/lib/__tests__/taunt-assemble.test.ts` (pure, app project) and extend nothing else

- [ ] **Step 1: Write failing unit test** `src/lib/__tests__/taunt-assemble.test.ts`

```ts
import { assembleTaunt, type TauntTemplate, type TauntBankWord } from '../taunts';

const template: TauntTemplate = { id: 't1', language: 'en', skeleton: '{0} {1} {2} {3}.', slot_count: 4 };
const banks: TauntBankWord[] = [
  { template_id: 't1', slot_index: 0, word_index: 0, word: 'Thy' },
  { template_id: 't1', slot_index: 0, word_index: 1, word: 'Even thy' },
  { template_id: 't1', slot_index: 1, word_index: 0, word: 'pitiful' },
  { template_id: 't1', slot_index: 2, word_index: 0, word: 'effort' },
  { template_id: 't1', slot_index: 3, word_index: 0, word: 'feeds the crows' },
];

describe('assembleTaunt', () => {
  it('substitutes picks into the skeleton', () => {
    expect(assembleTaunt(template, banks, [0, 0, 0, 0])).toBe('Thy pitiful effort feeds the crows.');
    expect(assembleTaunt(template, banks, [1, 0, 0, 0])).toBe('Even thy pitiful effort feeds the crows.');
  });
  it('missing word renders placeholder, never crashes', () => {
    expect(assembleTaunt(template, banks, [0, 9, 0, 0])).toBe('Thy … effort feeds the crows.');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/lib/taunts.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TauntTemplate {
  id: string;
  language: string;
  skeleton: string;
  slot_count: number;
}

export interface TauntBankWord {
  template_id: string;
  slot_index: number;
  word_index: number;
  word: string;
}

export interface TauntRow {
  id: string;
  feud_id: string;
  author: string;
  template_id: string;
  picks: number[];
  created_at: string;
}

export function assembleTaunt(template: TauntTemplate, banks: TauntBankWord[], picks: number[]): string {
  return template.skeleton.replace(/\{(\d+)\}/g, (_, slot) => {
    const s = Number(slot);
    const found = banks.find((b) => b.slot_index === s && b.word_index === (picks[s] ?? -1));
    return found?.word ?? '…';
  });
}

export async function fetchTauntKit(client: SupabaseClient, language: string): Promise<{
  template: TauntTemplate;
  banks: TauntBankWord[];
  bySlot: TauntBankWord[][];
}> {
  const lang = language === 'uk' ? 'uk' : 'en';
  const { data: template, error: te } = await client
    .from('taunt_templates').select('*').eq('language', lang).limit(1).single();
  if (te) throw te;
  const { data: banks, error: be } = await client
    .from('taunt_banks').select('*').eq('template_id', template.id)
    .order('slot_index').order('word_index');
  if (be) throw be;
  const bySlot: TauntBankWord[][] = [];
  for (const b of banks ?? []) {
    (bySlot[b.slot_index] ??= []).push(b);
  }
  return { template: template as TauntTemplate, banks: (banks ?? []) as TauntBankWord[], bySlot };
}

export async function sendTaunt(
  client: SupabaseClient,
  args: { feudId: string; templateId: string; picks: number[] },
): Promise<TauntRow> {
  const { data, error } = await client.rpc('send_taunt', {
    p_feud_id: args.feudId, p_template_id: args.templateId, p_picks: args.picks,
  });
  if (error) throw error;
  return data as TauntRow;
}

export async function listTaunts(client: SupabaseClient, feudId: string): Promise<TauntRow[]> {
  const { data, error } = await client
    .from('taunts').select('*').eq('feud_id', feudId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TauntRow[];
}

// Renders a received taunt: needs the AUTHOR's template+banks (taunts are
// composed in the author's language and stay in it).
export async function fetchTemplateWithBanks(client: SupabaseClient, templateId: string): Promise<{
  template: TauntTemplate;
  banks: TauntBankWord[];
}> {
  const [{ data: template, error: te }, { data: banks, error: be }] = await Promise.all([
    client.from('taunt_templates').select('*').eq('id', templateId).single(),
    client.from('taunt_banks').select('*').eq('template_id', templateId),
  ]);
  if (te) throw te;
  if (be) throw be;
  return { template: template as TauntTemplate, banks: (banks ?? []) as TauntBankWord[] };
}
```

- [ ] **Step 4: Run — unit tests pass, tsc 0.**

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: taunt client module with assembly"`

### Task 3: notify Edge Function

**Files:**
- Create: `supabase/functions/notify/index.ts`
- Test: `src/lib/__tests__/notify.integration.test.ts` (self-skips unless FUNCTIONS running)

- [ ] **Step 1: Implement** `supabase/functions/notify/index.ts` (Deno)

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    match: 'A nemesis has answered thy challenge.',
    taunt: '{name} sends taunt.',
    score: "{name}'s tower grows.",
  },
  uk: {
    match: 'Ворог відповів на твій виклик.',
    taunt: '{name} шле образ.',
    score: 'Вежа {name} росте.',
  },
};

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { kind, feud_id } = await req.json();
    if (!['match', 'taunt', 'score'].includes(kind) || typeof feud_id !== 'string') {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: ue } = await caller.auth.getUser();
    if (ue || userData.user == null) return Response.json({ error: 'auth_required' }, { status: 401 });
    const uid = userData.user.id;

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: feud } = await service.from('feuds').select('profile_a, profile_b').eq('id', feud_id).maybeSingle();
    if (feud == null || (feud.profile_a !== uid && feud.profile_b !== uid)) {
      return Response.json({ error: 'not_member' }, { status: 403 });
    }
    const opponentId = feud.profile_a === uid ? feud.profile_b : feud.profile_a;
    const [{ data: opponent }, { data: me }] = await Promise.all([
      service.from('profiles').select('expo_push_token, language').eq('id', opponentId).maybeSingle(),
      service.from('profiles').select('nemesis_name').eq('id', uid).maybeSingle(),
    ]);
    if (opponent?.expo_push_token == null) return Response.json({ skipped: true });

    const lang = opponent.language === 'uk' ? 'uk' : 'en';
    const body = MESSAGES[lang][kind].replace('{name}', me?.nemesis_name ?? '???');

    const pushResp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: opponent.expo_push_token, title: 'NEMESIS', body, sound: 'default' }),
    });
    return Response.json({ sent: pushResp.ok });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
```

- [ ] **Step 2: Write integration test** `src/lib/__tests__/notify.integration.test.ts` — requires `supabase functions serve notify` running; self-skips otherwise via env flag:

```ts
/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const fnUrl = process.env.FUNCTIONS_URL ?? ''; // e.g. http://127.0.0.1:54321/functions/v1
const maybe = anon && service && fnUrl ? describe : describe.skip;

const admin = () => createClient(url, service);

maybe('notify edge function', () => {
  it('member without opponent token → skipped; non-member → 403; anon → 401', async () => {
    const a = admin();
    const mk = async (n: string) => {
      const email = `nf-${n}-${Date.now()}@test.local`;
      const { data } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
      await a.from('profiles').insert({ id: data.user!.id, nemesis_name: `Notify ${n}` });
      const c = createClient(url, anon);
      await c.auth.signInWithPassword({ email, password: 'pass1234!' });
      const { data: s } = await c.auth.getSession();
      return { id: data.user!.id, jwt: s.session!.access_token };
    };
    const ua = await mk('a');
    const ub = await mk('b');
    const us = await mk('s');
    const { data: ordeal } = await a.from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    const [pa, pb] = [ua.id, ub.id].sort();
    const { data: feud } = await a.from('feuds').insert({
      profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id, mode: 'endless', status: 'active',
    }).select('id').single();

    const call = (jwt: string | null) =>
      fetch(`${fnUrl}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt != null ? { Authorization: `Bearer ${jwt}` } : { Authorization: `Bearer ${anon}` }),
        },
        body: JSON.stringify({ kind: 'taunt', feud_id: feud!.id }),
      });

    const okResp = await call(ua.jwt);
    expect(okResp.status).toBe(200);
    expect(await okResp.json()).toEqual({ skipped: true });

    const strangerResp = await call(us.jwt);
    expect(strangerResp.status).toBe(403);

    const anonResp = await call(null);
    expect(anonResp.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run it live.** In one terminal: `supabase functions serve notify` (or `--no-verify-jwt` off — default verification ON is what we want). Then:

```bash
FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1 EXPO_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm test -- notify.integration
```

Expected: 1 test (3 assertions paths) passes. Note: `supabase functions serve` may route via the main API URL on recent CLI versions — adapt FUNCTIONS_URL to what serve prints, report what worked. Stop the serve process after.

- [ ] **Step 4: Bare suite still green; tsc 0** (the Deno file is outside tsconfig — confirm `npx tsc --noEmit` ignores supabase/functions; if it complains, add `"exclude": ["supabase/functions"]` to tsconfig and report).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: notify edge function (expo push fan-out)"`

### Task 4: Client push module + notification permission

**Files:**
- Create: `src/lib/push.ts`
- Modify: `app/_layout.tsx` (register on session), `app/(onboarding)/finish.tsx` (ask permission at seal — the deferred onboarding step)

- [ ] **Step 1: Install** — `npx expo install expo-notifications expo-device expo-constants` (expo-device/constants already present from template).

- [ ] **Step 2: Implement** `src/lib/push.ts`

```ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// Best-effort: simulators have no push; dev builds without an EAS projectId
// cannot mint Expo push tokens. Every failure path is silent by design --
// push is a nicety, never load-bearing (contract amendment 2026-07-12).
export async function registerPushToken(client: SupabaseClient, userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (projectId == null) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await client.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch {
    // silent: push is optional
  }
}

export async function notifyOpponent(
  client: SupabaseClient,
  kind: 'match' | 'taunt' | 'score',
  feudId: string,
): Promise<void> {
  try {
    await client.functions.invoke('notify', { body: { kind, feud_id: feudId } });
  } catch {
    // fire-and-forget
  }
}
```

- [ ] **Step 3: Call sites.**
  - `app/(onboarding)/finish.tsx`: in `seal()`, after `refreshProfile()` succeeds, `await registerPushToken(supabase, (await supabase.auth.getUser()).data.user!.id)` — wrapped so failures don't block; simplest: fire-and-forget `registerPushToken(...)` without await after refreshProfile.
  - `app/_layout.tsx` Guard: when session exists and hasProfile, call `registerPushToken(supabase, session.user.id)` once (useEffect on session?.user.id) — re-registers returning users.
  - `app/feud/[code].tsx`: after successful `acceptInvite`, `notifyOpponent(supabase, 'match', feudId)` fire-and-forget.
  - `app/feuds/[id].tsx`: after successful `logScore` submit → `notifyOpponent(supabase, 'score', feud.id)`; Task 5 adds the taunt call.

- [ ] **Step 4: Verify** — tsc 0, tests green, expo export bundles.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: push registration and fire-and-forget notify calls"`

### Task 5: Taunt UI — forge modal + missives feed

**Files:**
- Create: `src/components/TauntForgeSheet.tsx`
- Modify: `app/feuds/[id].tsx`
- Modify (strings): `spec/copy-deck.md` §5b, `src/i18n/en.json`, `uk.json`, extend i18n test

- [ ] **Step 1: Strings first (TDD).** Extend i18n test with:

```ts
  it('plan-4 keys present', () => {
    for (const key of ['forge.cta', 'forge.missives', 'forge.preview']) {
      const resolveIn = (cat: object) => key.split('.').reduce((o: any, k) => o?.[k], cat);
      expect(typeof resolveIn(en)).toBe('string');
      expect(typeof resolveIn(uk)).toBe('string');
    }
  });
```

Red → append to `spec/copy-deck.md` after §5:

```markdown
### 5b. Plan-4 additions (taunt UI)

| Key | EN | UA (draft) |
| --- | --- | --- |
| forge_cta | Send a taunt | Надіслати образу |
| forge_missives | Missives | Послання |
| forge_preview | Thy missive | Твоє послання |
```

Add to both catalogs under `forge` (UA character-for-character) → green. Existing keys reused: forge.title/subtitle/send/spent, feud.you.

- [ ] **Step 2: Implement** `src/components/TauntForgeSheet.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { fetchTauntKit, assembleTaunt, sendTaunt, type TauntTemplate, type TauntBankWord } from '../lib/taunts';
import { GrimButton } from './GrimButton';
import { colors, radii, spacing } from '../theme/tokens';

interface Props {
  feudId: string;
  visible: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function TauntForgeSheet({ feudId, visible, onClose, onSent }: Props) {
  const { t, i18n } = useTranslation();
  const [template, setTemplate] = useState<TauntTemplate | null>(null);
  const [bySlot, setBySlot] = useState<TauntBankWord[][]>([]);
  const [banks, setBanks] = useState<TauntBankWord[]>([]);
  const [picks, setPicks] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchTauntKit(supabase, i18n.language).then(({ template, banks, bySlot }) => {
      setTemplate(template);
      setBanks(banks);
      setBySlot(bySlot);
      setPicks(new Array(template.slot_count).fill(0));
      setError(null);
    });
  }, [visible, i18n.language]);

  async function send() {
    if (template == null) return;
    setBusy(true);
    setError(null);
    try {
      await sendTaunt(supabase, { feudId, templateId: template.id, picks });
      onSent();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('taunt_spent') ? t('forge.spent') : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('forge.title')}</Text>
          <Text style={styles.subtitle}>{t('forge.subtitle')}</Text>
          <View style={styles.columns}>
            {bySlot.map((words, slot) => (
              <ScrollView key={slot} style={styles.column} contentContainerStyle={styles.columnInner}>
                {words.map((w) => {
                  const on = picks[slot] === w.word_index;
                  return (
                    <Pressable
                      key={w.word_index}
                      onPress={() => {
                        const next = [...picks];
                        next[slot] = w.word_index;
                        setPicks(next);
                      }}
                      style={[styles.word, on && styles.wordOn]}
                    >
                      <Text style={[styles.wordText, on && styles.wordTextOn]}>{w.word}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ))}
          </View>
          {template != null && (
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>{t('forge.preview')}</Text>
              <Text style={styles.previewText}>{assembleTaunt(template, banks, picks)}</Text>
            </View>
          )}
          {error != null && <Text style={styles.error}>{error}</Text>}
          <GrimButton label={t('forge.send')} onPress={send} disabled={busy || template == null} />
          <GrimButton label={t('common.cancel')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,5,7,0.9)', justifyContent: 'center', padding: spacing[2] },
  sheet: { backgroundColor: colors.cryptRaised, borderRadius: radii.card, borderWidth: 1, borderColor: colors.venomDim, padding: spacing[3], gap: spacing[2], maxHeight: '88%' },
  title: { color: colors.bone, fontSize: 20, textAlign: 'center', letterSpacing: 1 },
  subtitle: { color: colors.smoke, fontSize: 12, textAlign: 'center' },
  columns: { flexDirection: 'row', gap: spacing[0], height: 240 },
  column: { flex: 1 },
  columnInner: { gap: spacing[0] },
  word: { backgroundColor: colors.crypt, borderWidth: 1, borderColor: colors.venomDim, borderRadius: radii.chip, paddingVertical: spacing[0], paddingHorizontal: spacing[0] },
  wordOn: { borderColor: colors.blood, backgroundColor: colors.bloodMist },
  wordText: { color: colors.ash, fontSize: 11, textAlign: 'center' },
  wordTextOn: { color: colors.bone },
  preview: { backgroundColor: colors.crypt, borderRadius: radii.button, padding: spacing[2] },
  previewLabel: { color: colors.smoke, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  previewText: { color: colors.bone, fontSize: 14, fontStyle: 'italic', marginTop: 4 },
  error: { color: colors.blood, fontSize: 13, textAlign: 'center' },
});
```

- [ ] **Step 3: Wire into `app/feuds/[id].tsx`:**
  - State: `const [forgeOpen, setForgeOpen] = useState(false);` + `const [taunts, setTaunts] = useState<TauntRow[]>([]);` + a template/banks cache for rendering received missives: load taunts in `load()` via `listTaunts`, and for each distinct `template_id` fetch template+banks once (`fetchTemplateWithBanks`), memoized in a `Map` state.
  - Missives section between TowerRace and chronicle: title `t('forge.missives')`, list of last 5 taunts rendered with `assembleTaunt` (author style: mine blood / theirs venomDeep, italic serif feel).
  - Button row: when feud active, second GrimButton ghost `t('forge.cta')` → `setForgeOpen(true)`.
  - `<TauntForgeSheet feudId={feud.id} visible={forgeOpen} onClose={() => setForgeOpen(false)} onSent={() => { notifyOpponent(supabase, 'taunt', feud.id); load(); }} />`
  - Realtime: add `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'taunts', filter: `feud_id=eq.${id}` }, () => load())` to the existing channel.

- [ ] **Step 4: Verify** — tests green, tsc 0, expo export bundles.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: taunt forge sheet and missives feed"`

### Task 6: Two-simulator e2e walk (owner-driven)

- [ ] Stack + both sims up (recipe in Plan 3b Task 8 / memory). `supabase db reset` acceptable (wipes walk accounts — re-onboard).
- [ ] Anna + Bo in a feud. Anna: Send a taunt → columns picker → preview updates per tap → send → appears in Anna's missives.
- [ ] Bo's device: missive appears live (realtime) — in ANNA's language (taunts stay in author's tongue).
- [ ] Anna sends second taunt same day → "Thy venom is spent. Return at dawn."
- [ ] Bo replies with his own (his daily allowance is separate).
- [ ] UA check: switch a sim to Ukrainian → forge shows UA word banks; received EN missives still render in EN.
- [ ] Push: on simulators expect silent no-op (no token) — confirm no errors surface in UI. Physical-device push = parked with EAS/store prep.
- [ ] Findings → fix-commits.
