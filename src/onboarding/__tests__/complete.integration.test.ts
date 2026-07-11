/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';
import { completeOnboarding } from '../complete';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const maybe = anon && service ? describe : describe.skip;

maybe('completeOnboarding', () => {
  it('writes profile + profile_ordeals under RLS as the signed-in user', async () => {
    const admin = createClient(url, service);
    const email = `complete-${Date.now()}@test.local`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
    const client = createClient(url, anon);
    await client.auth.signInWithPassword({ email, password: 'pass1234!' });

    const { data: ordeal } = await client.from('ordeals').select('id').limit(1).single();

    await completeOnboarding(client as any, {
      maskAvatarId: 'raven_01',
      nemesisName: 'Integration Ivan',
      catchphrase: 'We meet again.',
      bio: '',
      ordeals: [{ ordealId: ordeal!.id, skillHint: '1450 elo' }],
    });

    const { data: profile } = await client.from('profiles').select('nemesis_name, mask_avatar_id').eq('id', u.user!.id).single();
    expect(profile).toEqual({ nemesis_name: 'Integration Ivan', mask_avatar_id: 'raven_01' });
    const { data: po } = await client.from('profile_ordeals').select('ordeal_id, skill_hint').eq('profile_id', u.user!.id);
    expect(po).toEqual([{ ordeal_id: ordeal!.id, skill_hint: '1450 elo' }]);
  });

  it('rejects a draft with no mask or short name before touching the network', async () => {
    const client = createClient(url, anon);
    await expect(
      completeOnboarding(client as any, { maskAvatarId: null, nemesisName: 'ok name', catchphrase: '', bio: '', ordeals: [] }),
    ).rejects.toThrow('draft_incomplete');
    await expect(
      completeOnboarding(client as any, { maskAvatarId: 'skull_01', nemesisName: 'x', catchphrase: '', bio: '', ordeals: [] }),
    ).rejects.toThrow('draft_incomplete');
  });
});
