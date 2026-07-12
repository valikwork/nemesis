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
    // stealth block: blocked party sees a dead invite, not a block notice
    expect(acceptErr!.message).toContain('invite_dead');
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
