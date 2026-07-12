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

  it('rejects blocked pairs as invite_dead — stealth, indistinguishable from expiry', async () => {
    const a = await userWithProfile('blk-a', 'Block Anna');
    const b = await userWithProfile('blk-b', 'Block Bo');
    await admin().from('blocks').insert({ blocker: b.id, blocked: a.id });
    const { data: invite } = await a.client.rpc('create_invite', {
      p_ordeal_id: await anyOrdealId(), p_mode: 'endless', p_goal: null,
    });
    const { error: getErr } = await b.client.rpc('get_invite', { p_code: invite.code });
    expect(getErr).not.toBeNull();
    expect(getErr!.message).toContain('invite_dead');
    const { error } = await b.client.rpc('accept_invite', { p_code: invite.code });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('invite_dead');
    // the invite itself stays pending for the blocker's own view
    const { data: still } = await admin().from('invites').select('status').eq('id', invite.id).single();
    expect(still!.status).toBe('pending');
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
