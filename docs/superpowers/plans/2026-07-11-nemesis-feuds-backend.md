# Nemesis Feuds Backend Implementation Plan (Plan 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete feud backend: invite lifecycle (create/read/accept/revoke as Postgres RPCs), showdown goal-completion trigger, and the proofs storage bucket — all proven by integration tests against the live local stack, before any UI exists.

**Architecture:** One migration adds four RPCs + one trigger + the storage bucket/policies. RPCs follow the established forge_ordeal pattern (security definer, explicit revoke/grant, exception message keys). Push notifications deliberately absent — Plan 4 adds them without changing these signatures.

**Tech Stack:** existing (Supabase local stack, jest integration project with *.integration.test.ts glob, supabase-js in node env).

**Spec sources:** spec/data-contract.md — §1 schema + ALL amendments at the bottom (the 2026-07-11 Plan-3a amendment is normative for this plan); spec/design-spec.md §5 (friend feud terms — glove throw).

**Out of scope:** all UI (Plan 3b), push (Plan 4), deck/declare (Plan 5), taunt RPCs (Plan 4).

**Conventions:** integration tests self-skip without env keys; keys via `supabase status -o env`. Every RPC: `revoke execute … from public; grant execute … to authenticated;`. Error signaling: `raise exception '<message_key>'` — clients map keys to i18n.

---

### Task 1: Migration — invite RPCs

**Files:**
- Create: `supabase/migrations/00000000000004_invites.sql`
- Test: `src/lib/__tests__/invites.integration.test.ts`

- [ ] **Step 1: Write failing integration test** `src/lib/__tests__/invites.integration.test.ts`

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
  const { data, error } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
  expect(error).toBeNull();
  await a.from('profiles').insert({ id: data.user!.id, nemesis_name: name });
  const client = createClient(url, anon);
  await client.auth.signInWithPassword({ email, password: 'pass1234!' });
  return { client, id: data.user!.id };
}

async function anyOrdealId(): Promise<string> {
  const { data } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
  return data!.id;
}

maybe('invite lifecycle RPCs', () => {
  it('create → get → accept creates an active feud with canonical pair order', async () => {
    const inviter = await userWithProfile('inv-a', 'Inviter Anna');
    const accepter = await userWithProfile('inv-b', 'Accepter Bo');
    const ordealId = await anyOrdealId();

    const { data: invite, error: ce } = await inviter.client.rpc('create_invite', {
      p_ordeal_id: ordealId, p_mode: 'showdown', p_goal: 100,
    });
    expect(ce).toBeNull();
    expect(invite.code).toBeTruthy();
    expect(invite.status).toBe('pending');

    const { data: landing, error: ge } = await accepter.client.rpc('get_invite', { p_code: invite.code });
    expect(ge).toBeNull();
    expect(landing.inviter_name).toBe('Inviter Anna');
    expect(landing.mode).toBe('showdown');
    expect(Number(landing.goal_value)).toBe(100);
    expect(landing.status).toBe('pending');

    const { data: feudId, error: ae } = await accepter.client.rpc('accept_invite', { p_code: invite.code });
    expect(ae).toBeNull();

    const { data: feud } = await accepter.client.from('feuds').select('*').eq('id', feudId).single();
    expect(feud.status).toBe('active');
    expect(feud.mode).toBe('showdown');
    expect([feud.profile_a, feud.profile_b].sort()).toEqual([inviter.id, accepter.id].sort());
    expect(feud.profile_a < feud.profile_b).toBe(true);

    const { data: after } = await inviter.client.from('invites').select('status, accepted_by').eq('id', invite.id).single();
    expect(after!.status).toBe('accepted');
    expect(after!.accepted_by).toBe(accepter.id);
  });

  it('rejects self-acceptance', async () => {
    const u = await userWithProfile('self', 'Self Sam');
    const { data: invite } = await u.client.rpc('create_invite', {
      p_ordeal_id: await anyOrdealId(), p_mode: 'endless', p_goal: null,
    });
    const { error } = await u.client.rpc('accept_invite', { p_code: invite.code });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('self_accept');
  });

  it('rejects acceptance when a live feud exists for the pair+ordeal', async () => {
    const a = await userWithProfile('dup-a', 'Dup Anna');
    const b = await userWithProfile('dup-b', 'Dup Bo');
    const ordealId = await anyOrdealId();
    const { data: i1 } = await a.client.rpc('create_invite', { p_ordeal_id: ordealId, p_mode: 'endless', p_goal: null });
    await b.client.rpc('accept_invite', { p_code: i1.code });
    const { data: i2 } = await a.client.rpc('create_invite', { p_ordeal_id: ordealId, p_mode: 'endless', p_goal: null });
    const { error } = await b.client.rpc('accept_invite', { p_code: i2.code });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('feud_exists');
  });

  it('rejects blocked pairs', async () => {
    const a = await userWithProfile('blk-a', 'Block Anna');
    const b = await userWithProfile('blk-b', 'Block Bo');
    await admin().from('blocks').insert({ blocker: b.id, blocked: a.id });
    const { data: invite } = await a.client.rpc('create_invite', {
      p_ordeal_id: await anyOrdealId(), p_mode: 'endless', p_goal: null,
    });
    const { error } = await b.client.rpc('accept_invite', { p_code: invite.code });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('blocked');
  });

  it('expired invite: get_invite reports expired, accept rejects', async () => {
    const a = await userWithProfile('exp-a', 'Exp Anna');
    const b = await userWithProfile('exp-b', 'Exp Bo');
    const { data: invite } = await a.client.rpc('create_invite', {
      p_ordeal_id: await anyOrdealId(), p_mode: 'endless', p_goal: null,
    });
    await admin().from('invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', invite.id);
    const { data: landing } = await b.client.rpc('get_invite', { p_code: invite.code });
    expect(landing.status).toBe('expired');
    const { error } = await b.client.rpc('accept_invite', { p_code: invite.code });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('invite_dead');
  });

  it('revoke works for inviter and kills acceptance', async () => {
    const a = await userWithProfile('rev-a', 'Rev Anna');
    const b = await userWithProfile('rev-b', 'Rev Bo');
    const { data: invite } = await a.client.rpc('create_invite', {
      p_ordeal_id: await anyOrdealId(), p_mode: 'endless', p_goal: null,
    });
    const { error: re } = await a.client.rpc('revoke_invite', { p_invite_id: invite.id });
    expect(re).toBeNull();
    const { error } = await b.client.rpc('accept_invite', { p_code: invite.code });
    expect(error!.message).toContain('invite_dead');
  });

  it('caps pending invites at 10', async () => {
    const a = await userWithProfile('cap-a', 'Cap Anna');
    const ordealId = await anyOrdealId();
    for (let i = 0; i < 10; i++) {
      const { error } = await a.client.rpc('create_invite', { p_ordeal_id: ordealId, p_mode: 'endless', p_goal: null });
      expect(error).toBeNull();
    }
    const { error } = await a.client.rpc('create_invite', { p_ordeal_id: ordealId, p_mode: 'endless', p_goal: null });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('too_many_invites');
  });

  it('rejects invite creation without a profile (mid-onboarding state)', async () => {
    const a = admin();
    const email = `noprof-${Date.now()}@test.local`;
    const { data } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
    expect(data.user).not.toBeNull();
    const client = createClient(url, anon);
    await client.auth.signInWithPassword({ email, password: 'pass1234!' });
    const { error } = await client.rpc('create_invite', {
      p_ordeal_id: await anyOrdealId(), p_mode: 'endless', p_goal: null,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('profile_required');
  });
});
```

- [ ] **Step 2: Run to verify failure** (with keys): `npm test -- invites.integration` → FAIL, create_invite not found.

- [ ] **Step 3: Write migration** `supabase/migrations/00000000000004_invites.sql`

```sql
-- Plan 3a (contract amendment 2026-07-11): invite lifecycle as RPCs.
-- Push notifications for these events arrive in Plan 4 without signature changes.

create or replace function create_invite(p_ordeal_id uuid, p_mode text, p_goal numeric)
returns invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;
  if p_mode not in ('endless','showdown') then
    raise exception 'bad_mode';
  end if;
  if (p_mode = 'showdown') <> (p_goal is not null) then
    raise exception 'bad_goal';
  end if;
  if p_goal is not null and p_goal <= 0 then
    raise exception 'bad_goal';
  end if;
  if not exists (select 1 from ordeals where id = p_ordeal_id and moderation_status = 'approved') then
    raise exception 'bad_ordeal';
  end if;
  if (select count(*) from invites
      where inviter = auth.uid() and status = 'pending' and expires_at > now()) >= 10 then
    raise exception 'too_many_invites';
  end if;

  insert into invites (inviter, ordeal_id, mode, goal_value)
  values (auth.uid(), p_ordeal_id, p_mode, p_goal)
  returning * into v_invite;
  return v_invite;
end;
$$;

create or replace function get_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  select * into v_invite from invites where code = p_code;
  if not found then
    raise exception 'invite_dead';
  end if;
  if v_invite.status = 'pending' and v_invite.expires_at <= now() then
    update invites set status = 'expired' where id = v_invite.id;
    v_invite.status := 'expired';
  end if;
  select jsonb_build_object(
    'id', v_invite.id,
    'status', v_invite.status,
    'mode', v_invite.mode,
    'goal_value', v_invite.goal_value,
    'inviter_name', p.nemesis_name,
    'inviter_sigil', p.mask_avatar_id,
    'ordeal', jsonb_build_object(
      'id', o.id, 'name_en', o.name_en, 'name_uk', o.name_uk,
      'unit_en', o.unit_en, 'unit_uk', o.unit_uk,
      'name_custom', o.name_custom, 'unit_custom', o.unit_custom,
      'is_custom', o.is_custom, 'language', o.language
    )
  ) into v_result
  from profiles p, ordeals o
  where p.id = v_invite.inviter and o.id = v_invite.ordeal_id;
  if v_result is null then
    -- inviter account deleted between create and open
    raise exception 'invite_dead';
  end if;
  return v_result;
end;
$$;

create or replace function accept_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invites;
  v_a uuid;
  v_b uuid;
  v_feud_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'profile_required';
  end if;

  select * into v_invite from invites where code = p_code for update;
  if not found then
    raise exception 'invite_dead';
  end if;
  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then
    if v_invite.status = 'pending' then
      update invites set status = 'expired' where id = v_invite.id;
    end if;
    raise exception 'invite_dead';
  end if;
  if v_invite.inviter = auth.uid() then
    raise exception 'self_accept';
  end if;
  if not exists (select 1 from profiles where id = v_invite.inviter) then
    raise exception 'invite_dead';
  end if;
  if exists (select 1 from blocks
             where (blocker = auth.uid() and blocked = v_invite.inviter)
                or (blocker = v_invite.inviter and blocked = auth.uid())) then
    raise exception 'blocked';
  end if;

  v_a := least(v_invite.inviter, auth.uid());
  v_b := greatest(v_invite.inviter, auth.uid());

  if exists (select 1 from feuds
             where profile_a = v_a and profile_b = v_b and ordeal_id = v_invite.ordeal_id
               and status in ('proposed','active')) then
    raise exception 'feud_exists';
  end if;

  insert into feuds (profile_a, profile_b, ordeal_id, mode, goal_value, status)
  values (v_a, v_b, v_invite.ordeal_id, v_invite.mode, v_invite.goal_value, 'active')
  returning id into v_feud_id;

  update invites set status = 'accepted', accepted_by = auth.uid() where id = v_invite.id;
  return v_feud_id;
end;
$$;

create or replace function revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  update invites set status = 'revoked'
  where id = p_invite_id and inviter = auth.uid() and status = 'pending';
  if not found then
    raise exception 'invite_dead';
  end if;
end;
$$;

revoke execute on function create_invite(uuid, text, numeric) from public;
revoke execute on function get_invite(text) from public;
revoke execute on function accept_invite(text) from public;
revoke execute on function revoke_invite(uuid) from public;
grant execute on function create_invite(uuid, text, numeric) to authenticated;
grant execute on function get_invite(text) to authenticated;
grant execute on function accept_invite(text) to authenticated;
grant execute on function revoke_invite(uuid) to authenticated;
```

- [ ] **Step 4: Apply + re-run** — `supabase db reset`, then the Step 2 command: 8 tests pass. Bare `npm test` still green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: invite lifecycle rpcs (create, get, accept, revoke)"`

### Task 2: Showdown goal-completion trigger

**Files:**
- Create: `supabase/migrations/00000000000005_goal_trigger.sql`
- Test: `src/lib/__tests__/goal-trigger.integration.test.ts`

- [ ] **Step 1: Write failing test** `src/lib/__tests__/goal-trigger.integration.test.ts`

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

async function makeFeud(a: { id: string }, b: { id: string }, mode: 'endless' | 'showdown', goal: number | null) {
  const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
  const [pa, pb] = [a.id, b.id].sort();
  const { data, error } = await admin().from('feuds').insert({
    profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id, mode, goal_value: goal, status: 'active',
  }).select('id').single();
  expect(error).toBeNull();
  return data!.id as string;
}

maybe('showdown goal trigger', () => {
  it('ends the feud and sets winner when author total reaches goal', async () => {
    const a = await userWithProfile('goal-a', 'Goal Anna');
    const b = await userWithProfile('goal-b', 'Goal Bo');
    const feudId = await makeFeud(a, b, 'showdown', 10);

    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 6 });
    let { data: mid } = await a.client.from('feuds').select('status').eq('id', feudId).single();
    expect(mid!.status).toBe('active');

    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 4 });
    const { data: done } = await a.client.from('feuds').select('status, winner, ended_at').eq('id', feudId).single();
    expect(done!.status).toBe('ended');
    expect(done!.winner).toBe(a.id);
    expect(done!.ended_at).not.toBeNull();
  });

  it('opponent totals do not end it for the author', async () => {
    const a = await userWithProfile('mix-a', 'Mix Anna');
    const b = await userWithProfile('mix-b', 'Mix Bo');
    const feudId = await makeFeud(a, b, 'showdown', 10);
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 6 });
    await b.client.from('score_entries').insert({ feud_id: feudId, author: b.id, value: 6 });
    const { data } = await admin().from('feuds').select('status').eq('id', feudId).single();
    expect(data!.status).toBe('active'); // 6+6 across both sides, neither reached 10 alone
  });

  it('endless feuds never end from scores', async () => {
    const a = await userWithProfile('end-a', 'End Anna');
    const b = await userWithProfile('end-b', 'End Bo');
    const feudId = await makeFeud(a, b, 'endless', null);
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 99999 });
    const { data } = await admin().from('feuds').select('status').eq('id', feudId).single();
    expect(data!.status).toBe('active');
  });

  it('no inserts into ended feuds (RLS)', async () => {
    const a = await userWithProfile('dead-a', 'Dead Anna');
    const b = await userWithProfile('dead-b', 'Dead Bo');
    const feudId = await makeFeud(a, b, 'showdown', 5);
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 5 });
    const { error } = await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 1 });
    expect(error).not.toBeNull(); // scores_insert_own requires feud status='active'
  });
});
```

- [ ] **Step 2: Run — fails** (feud stays active past goal).

- [ ] **Step 3: Write migration** `supabase/migrations/00000000000005_goal_trigger.sql`

```sql
-- Plan 3a: showdown goal completion (contract amendment 2026-07-11).
-- Runs as trigger owner; keep it cheap -- one aggregate per score insert.

create or replace function check_showdown_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feud feuds;
  v_total numeric;
begin
  select * into v_feud from feuds where id = new.feud_id for update;
  if v_feud.mode <> 'showdown' or v_feud.status <> 'active' then
    return new;
  end if;
  select coalesce(sum(value), 0) into v_total
  from score_entries
  where feud_id = new.feud_id and author = new.author;
  if v_total >= v_feud.goal_value then
    update feuds
    set status = 'ended', winner = new.author, ended_at = now()
    where id = new.feud_id;
  end if;
  return new;
end;
$$;

create trigger score_entries_goal_check
after insert on score_entries
for each row execute function check_showdown_goal();
```

- [ ] **Step 4: Apply + re-run** — `supabase db reset`, 4 tests pass. Bare suite green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: showdown goal-completion trigger"`

### Task 3: Proofs storage bucket + policies

**Files:**
- Create: `supabase/migrations/00000000000006_proofs_bucket.sql`
- Test: `src/lib/__tests__/proofs.integration.test.ts`

- [ ] **Step 1: Write failing test** `src/lib/__tests__/proofs.integration.test.ts`

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

maybe('proofs bucket', () => {
  it('feud member can upload and read; stranger cannot read', async () => {
    const a = await userWithProfile('pf-a', 'Proof Anna');
    const b = await userWithProfile('pf-b', 'Proof Bo');
    const stranger = await userWithProfile('pf-s', 'Proof Stranger');
    const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    const [pa, pb] = [a.id, b.id].sort();
    const { data: feud } = await admin().from('feuds').insert({
      profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id, mode: 'endless', status: 'active',
    }).select('id').single();

    const path = `${feud!.id}/entry-1.jpg`;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);

    const { error: upErr } = await a.client.storage.from('proofs').upload(path, bytes, { contentType: 'image/jpeg' });
    expect(upErr).toBeNull();

    const { data: got, error: dlErr } = await b.client.storage.from('proofs').download(path);
    expect(dlErr).toBeNull();
    expect(got).not.toBeNull();

    const { data: leak, error: leakErr } = await stranger.client.storage.from('proofs').download(path);
    expect(leak).toBeNull();
    expect(leakErr).not.toBeNull();

    const { error: strangerUp } = await stranger.client.storage.from('proofs').upload(`${feud!.id}/sneak.jpg`, bytes, { contentType: 'image/jpeg' });
    expect(strangerUp).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails** (bucket missing).

- [ ] **Step 3: Write migration** `supabase/migrations/00000000000006_proofs_bucket.sql`

```sql
-- Plan 3a: private proofs bucket. Path convention: {feud_id}/{filename}.
-- Membership is derived from the first path segment.

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy proofs_member_read on storage.objects for select
  using (
    bucket_id = 'proofs'
    and exists (
      select 1 from public.feuds f
      where f.id::text = (storage.foldername(name))[1]
        and auth.uid() in (f.profile_a, f.profile_b)
    )
  );

create policy proofs_member_insert on storage.objects for insert
  with check (
    bucket_id = 'proofs'
    and exists (
      select 1 from public.feuds f
      where f.id::text = (storage.foldername(name))[1]
        and f.status = 'active'
        and auth.uid() in (f.profile_a, f.profile_b)
    )
  );
```

Note: storage.objects already has RLS enabled by Supabase; we only add policies. No update/delete policies — proofs are immutable once logged (chronicle integrity).

- [ ] **Step 4: Apply + re-run** — `supabase db reset`, test passes. Bare suite green. `npx tsc --noEmit` → 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: proofs storage bucket with feud-member policies"`

### Task 4: Feud client API module

The thin typed client layer 3b's screens consume — testable against the live stack now.

**Files:**
- Create: `src/lib/feuds.ts`
- Test: `src/lib/__tests__/feuds-api.integration.test.ts`

- [ ] **Step 1: Write failing test** `src/lib/__tests__/feuds-api.integration.test.ts`

```ts
/**
 * @jest-environment node
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createInvite, getInvite, acceptInvite, listFeuds, logScore, feudTotals } from '../feuds';

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

maybe('feuds client api', () => {
  it('full loop: invite → accept → log → totals → list', async () => {
    const a = await userWithProfile('api-a', 'Api Anna');
    const b = await userWithProfile('api-b', 'Api Bo');
    const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();

    const invite = await createInvite(a.client as any, { ordealId: ordeal!.id, mode: 'showdown', goal: 50 });
    expect(invite.code).toBeTruthy();

    const landing = await getInvite(b.client as any, invite.code);
    expect(landing.inviter_name).toBe('Api Anna');

    const feudId = await acceptInvite(b.client as any, invite.code);

    await logScore(a.client as any, { feudId, value: 12, note: 'dawn run' });
    await logScore(b.client as any, { feudId, value: 7 });

    const totals = await feudTotals(a.client as any, feudId);
    expect(totals[a.id]).toBe(12);
    expect(totals[b.id]).toBe(7);

    const feuds = await listFeuds(a.client as any, a.id);
    expect(feuds.some((f) => f.id === feudId)).toBe(true);
    expect(feuds.find((f) => f.id === feudId)!.status).toBe('active');
  });
});
```

- [ ] **Step 2: Run — fails.**

- [ ] **Step 3: Implement** `src/lib/feuds.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrdealRow } from '../onboarding/ordeal-labels';

export interface InviteRow {
  id: string;
  code: string;
  status: string;
  mode: 'endless' | 'showdown';
  goal_value: number | null;
}

export interface InviteLanding {
  id: string;
  status: string;
  mode: 'endless' | 'showdown';
  goal_value: number | null;
  inviter_name: string;
  inviter_sigil: string;
  ordeal: OrdealRow;
}

export interface FeudRow {
  id: string;
  profile_a: string;
  profile_b: string;
  ordeal_id: string;
  mode: 'endless' | 'showdown';
  goal_value: number | null;
  status: 'proposed' | 'active' | 'ended' | 'dissolved';
  is_arch: boolean;
  winner: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface ScoreEntry {
  id: string;
  feud_id: string;
  author: string;
  value: number;
  note: string | null;
  proof_url: string | null;
  created_at: string;
}

export async function createInvite(
  client: SupabaseClient,
  args: { ordealId: string; mode: 'endless' | 'showdown'; goal: number | null },
): Promise<InviteRow> {
  const { data, error } = await client.rpc('create_invite', {
    p_ordeal_id: args.ordealId, p_mode: args.mode, p_goal: args.goal,
  });
  if (error) throw error;
  return data as InviteRow;
}

export async function getInvite(client: SupabaseClient, code: string): Promise<InviteLanding> {
  const { data, error } = await client.rpc('get_invite', { p_code: code });
  if (error) throw error;
  return data as InviteLanding;
}

export async function acceptInvite(client: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await client.rpc('accept_invite', { p_code: code });
  if (error) throw error;
  return data as string;
}

export async function revokeInvite(client: SupabaseClient, inviteId: string): Promise<void> {
  const { error } = await client.rpc('revoke_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

export async function listFeuds(client: SupabaseClient, myId: string): Promise<FeudRow[]> {
  const { data, error } = await client
    .from('feuds')
    .select('*')
    .or(`profile_a.eq.${myId},profile_b.eq.${myId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeudRow[];
}

export async function logScore(
  client: SupabaseClient,
  args: { feudId: string; value: number; note?: string; proofUrl?: string },
): Promise<void> {
  const { data: userData, error: ue } = await client.auth.getUser();
  if (ue || userData.user == null) throw new Error('auth_required');
  const { error } = await client.from('score_entries').insert({
    feud_id: args.feudId,
    author: userData.user.id,
    value: args.value,
    note: args.note?.trim() || null,
    proof_url: args.proofUrl ?? null,
  });
  if (error) throw error;
}

export async function listScores(client: SupabaseClient, feudId: string): Promise<ScoreEntry[]> {
  const { data, error } = await client
    .from('score_entries')
    .select('*')
    .eq('feud_id', feudId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScoreEntry[];
}

export async function feudTotals(client: SupabaseClient, feudId: string): Promise<Record<string, number>> {
  const entries = await listScores(client, feudId);
  const totals: Record<string, number> = {};
  for (const e of entries) {
    totals[e.author] = (totals[e.author] ?? 0) + Number(e.value);
  }
  return totals;
}
```

- [ ] **Step 4: Run — passes** (with keys). Bare suite green, tsc 0.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: feud client api module"`

### Task 5: Full-stack verification sweep

**Files:** none

- [ ] **Step 1:** `supabase db reset` then full with-keys run: `npm test` — every suite green (app + all 5 integration suites).
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npx expo export --platform ios` → bundles (client module must not break RN graph).
- [ ] **Step 3:** `supabase db diff` → "No schema changes found".
- [ ] **Step 4:** Push: `git push`.
