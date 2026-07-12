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

async function anOrdeal(): Promise<string> {
  const { data } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
  return data!.id as string;
}

async function makeFeud(a: { id: string }, b: { id: string }, ordealId: string) {
  const [pa, pb] = [a.id, b.id].sort();
  const { data } = await admin().from('feuds').insert({
    profile_a: pa, profile_b: pb, ordeal_id: ordealId, mode: 'endless', status: 'active',
  }).select('id').single();
  return data!.id as string;
}

maybe('arch-nemesis RPCs', () => {
  it('full pact on an existing feud: declare → accept → unmask visibility → dissolve kills it', async () => {
    const a = await userWithProfile('ar-a', 'Arch Anna');
    const b = await userWithProfile('ar-b', 'Arch Bo');
    const o = await anOrdeal();
    const feudId = await makeFeud(a, b, o);
    await admin().from('unmasked_identities').insert({ profile_id: a.id, real_name: 'Anna Real' });
    await admin().from('unmasked_identities').insert({ profile_id: b.id, real_name: 'Bo Real' });

    // pre-pact: b cannot read a's real identity — THE policy under test
    const pre = await b.client.from('unmasked_identities').select('*').eq('profile_id', a.id);
    expect(pre.data).toHaveLength(0);

    const { data: declareId, error: de } = await a.client.rpc('declare_arch', { p_target: b.id });
    expect(de).toBeNull();

    // second declare while pending
    const dup = await a.client.rpc('declare_arch', { p_target: b.id });
    expect(dup.error!.message).toContain('declare_pending');

    // only the target may resolve
    const wrong = await a.client.rpc('resolve_declare', { p_declare_id: declareId, p_accept: true });
    expect(wrong.error!.message).toContain('declare_dead');

    const { data: pactFeud, error: re } = await b.client.rpc('resolve_declare', { p_declare_id: declareId, p_accept: true });
    expect(re).toBeNull();
    expect(pactFeud).toBe(feudId); // existing feud became the pact
    const { data: feud } = await admin().from('feuds').select('is_arch, unmasked_at').eq('id', feudId).single();
    expect(feud!.is_arch).toBe(true);
    expect(feud!.unmasked_at).not.toBeNull();

    // post-pact: both directions readable
    const post = await b.client.from('unmasked_identities').select('real_name').eq('profile_id', a.id);
    expect(post.data).toHaveLength(1);
    expect(post.data![0].real_name).toBe('Anna Real');

    // a second arch anywhere is impossible
    const c = await userWithProfile('ar-c', 'Arch Third');
    const blockedDeclare = await a.client.rpc('declare_arch', { p_target: c.id });
    expect(blockedDeclare.error!.message).toContain('arch_exists');

    // dissolve: feud dies, visibility dies, declarer token cools
    const { error: xe } = await b.client.rpc('dissolve_arch', { p_feud_id: feudId });
    expect(xe).toBeNull();
    const { data: gone } = await b.client.from('unmasked_identities').select('*').eq('profile_id', a.id);
    expect(gone).toHaveLength(0);
    const { data: dec } = await admin().from('declares').select('status, token_available_at').eq('id', declareId).single();
    expect(dec!.status).toBe('dissolved');
    expect(new Date(dec!.token_available_at).getTime()).toBeGreaterThan(Date.now());

    const cooling = await a.client.rpc('declare_arch', { p_target: c.id });
    expect(cooling.error!.message).toContain('token_cooling');
  });

  it('decline cools the token 30 days; a lapsed cooldown frees it', async () => {
    const a = await userWithProfile('ar2-a', 'Tok Anna');
    const b = await userWithProfile('ar2-b', 'Tok Bo');
    const o = await anOrdeal();
    await makeFeud(a, b, o);

    const { data: declareId } = await a.client.rpc('declare_arch', { p_target: b.id });
    const { data: none, error } = await b.client.rpc('resolve_declare', { p_declare_id: declareId, p_accept: false });
    expect(error).toBeNull();
    expect(none).toBeNull();

    const again = await a.client.rpc('declare_arch', { p_target: b.id });
    expect(again.error!.message).toContain('token_cooling');

    // lapse the cooldown
    await admin().from('declares').update({ token_available_at: new Date(Date.now() - 1000).toISOString() }).eq('id', declareId);
    const freed = await a.client.rpc('declare_arch', { p_target: b.id });
    expect(freed.error).toBeNull();
  });

  it('accept with no existing feud ignites an arch feud on a shared ordeal', async () => {
    const a = await userWithProfile('ar3-a', 'New Anna');
    const b = await userWithProfile('ar3-b', 'New Bo');
    const o = await anOrdeal();
    await admin().from('profile_ordeals').insert([
      { profile_id: a.id, ordeal_id: o },
      { profile_id: b.id, ordeal_id: o },
    ]);

    const { data: declareId } = await a.client.rpc('declare_arch', { p_target: b.id });
    const { data: feudId, error } = await b.client.rpc('resolve_declare', { p_declare_id: declareId, p_accept: true });
    expect(error).toBeNull();
    const { data: feud } = await admin().from('feuds')
      .select('is_arch, unmasked_at, status, mode, ordeal_id').eq('id', feudId).single();
    expect(feud!.is_arch).toBe(true);
    expect(feud!.status).toBe('active');
    expect(feud!.mode).toBe('endless');
    expect(feud!.ordeal_id).toBe(o);
  });

  it('accept with no shared ordeal fails; blocked target looks vanished', async () => {
    const a = await userWithProfile('ar4-a', 'Bare Anna');
    const b = await userWithProfile('ar4-b', 'Bare Bo');
    const { data: declareId } = await a.client.rpc('declare_arch', { p_target: b.id });
    const { error } = await b.client.rpc('resolve_declare', { p_declare_id: declareId, p_accept: true });
    expect(error!.message).toContain('no_shared_ordeal');

    const blocker = await userWithProfile('ar4-c', 'Blocker Carl');
    await admin().from('blocks').insert({ blocker: blocker.id, blocked: b.id });
    const stealth = await b.client.rpc('declare_arch', { p_target: blocker.id });
    expect(stealth.error!.message).toContain('target_dead');
    expect(stealth.error!.message).not.toContain('block');
  });
});
