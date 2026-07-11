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
