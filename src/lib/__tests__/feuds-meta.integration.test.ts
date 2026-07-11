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
