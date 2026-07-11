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

maybe('goal trigger concurrency (deadlock regression)', () => {
  it('both members logging simultaneously both succeed, repeatedly', async () => {
    const a = await userWithProfile('conc-a', 'Conc Anna');
    const b = await userWithProfile('conc-b', 'Conc Bo');
    const feudId = await makeFeud(a, b, 'endless', null);
    for (let round = 0; round < 5; round++) {
      const [ra, rb] = await Promise.all([
        a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 1 }),
        b.client.from('score_entries').insert({ feud_id: feudId, author: b.id, value: 1 }),
      ]);
      expect(ra.error).toBeNull();
      expect(rb.error).toBeNull();
    }
  });

  it('simultaneous goal crossers produce exactly one winner', async () => {
    const a = await userWithProfile('race-a', 'Race Anna');
    const b = await userWithProfile('race-b', 'Race Bo');
    const feudId = await makeFeud(a, b, 'showdown', 5);
    await Promise.all([
      a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 5 }),
      b.client.from('score_entries').insert({ feud_id: feudId, author: b.id, value: 5 }),
    ]);
    const { data } = await admin().from('feuds').select('status, winner').eq('id', feudId).single();
    expect(data!.status).toBe('ended');
    expect([a.id, b.id]).toContain(data!.winner);
  });
});
