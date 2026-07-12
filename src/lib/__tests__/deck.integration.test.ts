/**
 * @jest-environment node
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const maybe = anon && service ? describe : describe.skip;

const admin = () => createClient(url, service);

// Kyiv-ish; ~0.014 lon ≈ 1 km at this latitude
const BASE = { lon: 30.52, lat: 50.45 };

async function locatedUser(
  prefix: string, name: string,
  opts: { lonOff?: number; radius?: number | null; located?: boolean } = {},
): Promise<{ client: SupabaseClient; id: string }> {
  const a = admin();
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const { data } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
  const located = opts.located ?? true;
  await a.from('profiles').insert({
    id: data.user!.id, nemesis_name: name,
    ...(located
      ? { location: `POINT(${BASE.lon + (opts.lonOff ?? 0)} ${BASE.lat})`, radius_km: opts.radius ?? 25 }
      : {}),
  });
  const client = createClient(url, anon);
  await client.auth.signInWithPassword({ email, password: 'pass1234!' });
  return { client, id: data.user!.id };
}

// fresh ordeals per run: deck results accumulate across test runs, so sharing
// a seed-catalog ordeal lets earlier runs' users crowd out this run's rival
async function catalogOrdeals(n: number): Promise<string[]> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const rows = Array.from({ length: n }, (_, i) => ({
    name_en: `Deck Test ${stamp}-${i}`, name_uk: `Тест колоди ${stamp}-${i}`,
    unit_en: 'reps', unit_uk: 'рази',
  }));
  const { data } = await admin().from('ordeals').insert(rows).select('id');
  return data!.map((o) => o.id as string);
}

async function assign(profileId: string, ordealId: string, hint?: string) {
  await admin().from('profile_ordeals').insert({ profile_id: profileId, ordeal_id: ordealId, skill_hint: hint ?? null });
}

maybe('get_deck + swipe_rival', () => {
  it('returns a nearby rival with distance and all ordeals shared-first, never location', async () => {
    const [o1, o2] = await catalogOrdeals(2);
    const me = await locatedUser('dk-a', 'Deck Anna');
    const rival = await locatedUser('dk-b', 'Deck Bo', { lonOff: 0.014 });
    await assign(me.id, o1);
    await assign(rival.id, o2); // not shared — listed after the shared ones
    await assign(rival.id, o1, '1450 elo');

    const { data, error } = await me.client.rpc('get_deck', {});
    expect(error).toBeNull();
    const card = (data as any[]).find((c) => c.id === rival.id);
    expect(card).toBeDefined();
    expect(card.nemesis_name).toBe('Deck Bo');
    expect(card.distance_km).toBeGreaterThan(0.5);
    expect(card.distance_km).toBeLessThan(1.5);
    expect(card.location).toBeUndefined();
    expect(card.ordeals).toHaveLength(2);
    expect(card.ordeals[0].id).toBe(o1); // shared first
    expect(card.ordeals[0].shared).toBe(true);
    expect(card.ordeals[0].skill_hint).toBe('1450 elo');
    expect(card.ordeals[1].id).toBe(o2);
    expect(card.ordeals[1].shared).toBe(false);
  });

  it('requires location', async () => {
    const me = await locatedUser('dk-nl', 'Deck Nowhere', { located: false });
    const { error } = await me.client.rpc('get_deck', {});
    expect(error).not.toBeNull();
    expect(error!.message).toContain('location_required');
  });

  it('excludes swiped, blocked, feuding, unshared, and out-of-radius profiles', async () => {
    const [o1] = await catalogOrdeals(1);
    const me = await locatedUser('dk-x', 'Deck Excl', { radius: 25 });
    await assign(me.id, o1);

    const swiped = await locatedUser('dk-sw', 'X Swiped', { lonOff: 0.01 });
    const blocked = await locatedUser('dk-bl', 'X Blocked', { lonOff: 0.01 });
    const feuding = await locatedUser('dk-fd', 'X Feuding', { lonOff: 0.01 });
    const unshared = await locatedUser('dk-un', 'X Unshared', { lonOff: 0.01 });
    const far = await locatedUser('dk-fr', 'X Far', { lonOff: 1.0 }); // ~71 km
    for (const u of [swiped, blocked, feuding, far]) await assign(u.id, o1);

    await admin().from('swipes').insert({ swiper: me.id, target: swiped.id, liked: false });
    await admin().from('blocks').insert({ blocker: blocked.id, blocked: me.id });
    const [pa, pb] = [me.id, feuding.id].sort();
    await admin().from('feuds').insert({ profile_a: pa, profile_b: pb, ordeal_id: o1, mode: 'endless', status: 'active' });

    const { data, error } = await me.client.rpc('get_deck', {});
    expect(error).toBeNull();
    const ids = (data as any[]).map((c) => c.id);
    for (const gone of [swiped.id, blocked.id, feuding.id, unshared.id, far.id, me.id]) {
      expect(ids).not.toContain(gone);
    }
  });

  it('detects a mutual like; rejects double swipes', async () => {
    const [o1] = await catalogOrdeals(1);
    const a = await locatedUser('sw-a', 'Swipe Anna');
    const b = await locatedUser('sw-b', 'Swipe Bo', { lonOff: 0.01 });
    await assign(a.id, o1);
    await assign(b.id, o1);

    const r1 = await a.client.rpc('swipe_rival', { p_target: b.id, p_liked: true });
    expect(r1.error).toBeNull();
    expect(r1.data.matched).toBe(false);

    const r2 = await b.client.rpc('swipe_rival', { p_target: a.id, p_liked: true });
    expect(r2.error).toBeNull();
    expect(r2.data.matched).toBe(true);

    const dup = await a.client.rpc('swipe_rival', { p_target: b.id, p_liked: false });
    expect(dup.error).not.toBeNull();
    expect(dup.error!.message).toContain('already_swiped');
  });

  it('my_matches surfaces the mutual like to BOTH parties until a feud exists', async () => {
    const [o1] = await catalogOrdeals(1);
    const a = await locatedUser('mm-a', 'Match Anna');
    const b = await locatedUser('mm-b', 'Match Bo', { lonOff: 0.01 });
    await assign(a.id, o1);
    await assign(b.id, o1);

    await a.client.rpc('swipe_rival', { p_target: b.id, p_liked: true });
    // one-sided: no match for anyone
    const half = await a.client.rpc('my_matches', {});
    expect((half.data as any[]).find((m) => m.id === b.id)).toBeUndefined();

    await b.client.rpc('swipe_rival', { p_target: a.id, p_liked: true });
    // both sides now see it — the first swiper too (walk finding)
    for (const [who, otherId, otherName] of [[a, b.id, 'Match Bo'], [b, a.id, 'Match Anna']] as const) {
      const { data, error } = await who.client.rpc('my_matches', {});
      expect(error).toBeNull();
      const m = (data as any[]).find((x) => x.id === otherId);
      expect(m).toBeDefined();
      expect(m.nemesis_name).toBe(otherName);
      expect(m.shared_ordeals).toHaveLength(1);
    }

    // a proposed feud removes the match from both lists…
    const { data: feudId } = await a.client.rpc('propose_feud', {
      p_target: b.id, p_ordeal_id: o1, p_mode: 'endless', p_goal: null,
    });
    const gone = await b.client.rpc('my_matches', {});
    expect((gone.data as any[]).find((m) => m.id === a.id)).toBeUndefined();

    // …and BOTH parties can read each other's persona on the proposed feud
    // (profiles_feud_partner now covers 'proposed' — walk finding: home was empty)
    const { data: prof } = await b.client.from('profiles').select('nemesis_name').eq('id', a.id).maybeSingle();
    expect(prof?.nemesis_name).toBe('Match Anna');
    await admin().from('feuds').delete().eq('id', feudId);
  });

  it('propose_feud needs a mutual like; respond_feud activates or dissolves', async () => {
    const [o1, o2] = await catalogOrdeals(2);
    const a = await locatedUser('pf-a', 'Prop Anna');
    const b = await locatedUser('pf-b', 'Prop Bo', { lonOff: 0.01 });
    for (const o of [o1, o2]) { await assign(a.id, o); await assign(b.id, o); }

    // no match yet
    const early = await a.client.rpc('propose_feud', { p_target: b.id, p_ordeal_id: o1, p_mode: 'endless', p_goal: null });
    expect(early.error!.message).toContain('no_match');

    await a.client.rpc('swipe_rival', { p_target: b.id, p_liked: true });
    await b.client.rpc('swipe_rival', { p_target: a.id, p_liked: true });

    const { data: feudId, error } = await a.client.rpc('propose_feud', {
      p_target: b.id, p_ordeal_id: o1, p_mode: 'showdown', p_goal: 50,
    });
    expect(error).toBeNull();
    const { data: feud } = await admin().from('feuds').select('status, proposed_by, goal_value').eq('id', feudId).single();
    expect(feud!.status).toBe('proposed');
    expect(feud!.proposed_by).toBe(a.id);

    // proposer cannot answer their own glove
    const self = await a.client.rpc('respond_feud', { p_feud_id: feudId, p_accept: true });
    expect(self.error!.message).toContain('not_thine_to_answer');

    const acc = await b.client.rpc('respond_feud', { p_feud_id: feudId, p_accept: true });
    expect(acc.error).toBeNull();
    const { data: active } = await admin().from('feuds').select('status').eq('id', feudId).single();
    expect(active!.status).toBe('active');

    // decline path on a second ordeal
    const { data: feud2 } = await b.client.rpc('propose_feud', {
      p_target: a.id, p_ordeal_id: o2, p_mode: 'endless', p_goal: null,
    });
    const dec = await a.client.rpc('respond_feud', { p_feud_id: feud2, p_accept: false });
    expect(dec.error).toBeNull();
    const { data: dead } = await admin().from('feuds').select('status, ended_at').eq('id', feud2).single();
    expect(dead!.status).toBe('dissolved');
    expect(dead!.ended_at).not.toBeNull();
  });
});
