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

async function makeFeud(
  a: { id: string }, b: { id: string },
  opts: { aggregation?: 'sum' | 'latest'; mode?: 'endless' | 'showdown'; goal?: number } = {},
) {
  const { data: ordeal } = await admin().from('ordeals').insert({
    name_en: `MF ${Date.now()}-${Math.random()}`, name_uk: 'МФ',
    unit_en: 'pts', unit_uk: 'очки', aggregation: opts.aggregation ?? 'sum',
  }).select('id').single();
  const [pa, pb] = [a.id, b.id].sort();
  const { data } = await admin().from('feuds').insert({
    profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id,
    mode: opts.mode ?? 'endless', goal_value: opts.goal ?? null, status: 'active',
  }).select('id').single();
  return data!.id as string;
}

maybe('measured ordeals (latest aggregation)', () => {
  it('latest-mode showdown ends only when a single entry REACHES the goal', async () => {
    const a = await userWithProfile('mf-a', 'Meas Anna');
    const b = await userWithProfile('mf-b', 'Meas Bo');
    const feudId = await makeFeud(a, b, { aggregation: 'latest', mode: 'showdown', goal: 100 });

    // 60 + 60 = 120 would end a sum showdown; latest stays below goal
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 60 });
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 60 });
    let { data: feud } = await admin().from('feuds').select('status').eq('id', feudId).single();
    expect(feud!.status).toBe('active');

    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 100 });
    const { data: endedFeud } = await admin().from('feuds').select('status, winner').eq('id', feudId).single();
    expect(endedFeud!.status).toBe('ended');
    expect(endedFeud!.winner).toBe(a.id);
  });

  it('sum showdown still sums (regression)', async () => {
    const a = await userWithProfile('mf2-a', 'Sum Anna');
    const b = await userWithProfile('mf2-b', 'Sum Bo');
    const feudId = await makeFeud(a, b, { aggregation: 'sum', mode: 'showdown', goal: 100 });
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 60 });
    await a.client.from('score_entries').insert({ feud_id: feudId, author: a.id, value: 60 });
    const { data: feud } = await admin().from('feuds').select('status').eq('id', feudId).single();
    expect(feud!.status).toBe('ended');
  });

  it('forge_ordeal accepts aggregation and rejects junk', async () => {
    const a = await userWithProfile('mf3-a', 'Forge Anna');
    const { data, error } = await a.client.rpc('forge_ordeal', {
      p_name: 'Chess rating', p_unit: 'elo', p_language: 'en', p_aggregation: 'latest',
    });
    expect(error).toBeNull();
    expect(data.aggregation).toBe('latest');

    const bad = await a.client.rpc('forge_ordeal', {
      p_name: 'Bad agg', p_unit: 'x', p_language: 'en', p_aggregation: 'median',
    });
    expect(bad.error!.message).toContain('bad_aggregation');

    // 3-arg call still works, defaults to sum
    const legacy = await a.client.rpc('forge_ordeal', {
      p_name: 'Legacy tally', p_unit: 'reps', p_language: 'en',
    });
    expect(legacy.error).toBeNull();
    expect(legacy.data.aggregation).toBe('sum');
  });
});

maybe('forfeit_feud', () => {
  it('claims a feud whose opponent went soft; rejects while they are active', async () => {
    const a = await userWithProfile('ff-a', 'Forf Anna');
    const b = await userWithProfile('ff-b', 'Forf Bo');
    const feudId = await makeFeud(a, b);

    // fresh feud: opponent's silence measured from feud start (recent) → rejected
    const early = await a.client.rpc('forfeit_feud', { p_feud_id: feudId });
    expect(early.error!.message).toContain('not_gone_soft');

    // backdate the feud start; opponent logs recently → still rejected
    await admin().from('feuds').update({ created_at: new Date(Date.now() - 20 * 864e5).toISOString() }).eq('id', feudId);
    await b.client.from('score_entries').insert({ feud_id: feudId, author: b.id, value: 5 });
    const active = await a.client.rpc('forfeit_feud', { p_feud_id: feudId });
    expect(active.error!.message).toContain('not_gone_soft');

    // backdate the opponent's entry beyond 14 days → claimable
    await admin().from('score_entries')
      .update({ created_at: new Date(Date.now() - 15 * 864e5).toISOString() })
      .eq('feud_id', feudId).eq('author', b.id);
    const { error } = await a.client.rpc('forfeit_feud', { p_feud_id: feudId });
    expect(error).toBeNull();
    const { data: feud } = await admin().from('feuds').select('status, winner, ended_at').eq('id', feudId).single();
    expect(feud!.status).toBe('ended');
    expect(feud!.winner).toBe(a.id);
    expect(feud!.ended_at).not.toBeNull();

    // dead feud → feud_dead
    const dead = await a.client.rpc('forfeit_feud', { p_feud_id: feudId });
    expect(dead.error!.message).toContain('feud_dead');
  });

  it('a stranger cannot forfeit someone else’s feud', async () => {
    const a = await userWithProfile('ff2-a', 'Forf2 Anna');
    const b = await userWithProfile('ff2-b', 'Forf2 Bo');
    const s = await userWithProfile('ff2-s', 'Forf2 Stranger');
    const feudId = await makeFeud(a, b);
    await admin().from('feuds').update({ created_at: new Date(Date.now() - 20 * 864e5).toISOString() }).eq('id', feudId);
    const { error } = await s.client.rpc('forfeit_feud', { p_feud_id: feudId });
    expect(error!.message).toContain('feud_dead');
  });
});
