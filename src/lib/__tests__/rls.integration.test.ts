/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const maybe = anon && service ? describe : describe.skip;

maybe('RLS: unmasking is hidden pre-pact', () => {
  it('stranger cannot read unmasked identity', async () => {
    const admin = createClient(url, service);
    const email = (n: string) => `${n}-${Date.now()}@test.local`;
    const { data: a, error: ea } = await admin.auth.admin.createUser({ email: email('a'), password: 'pass1234!', email_confirm: true });
    const { data: b, error: eb } = await admin.auth.admin.createUser({ email: email('b'), password: 'pass1234!', email_confirm: true });
    expect(ea).toBeNull();
    expect(eb).toBeNull();
    const { error: ep } = await admin.from('profiles').insert([
      { id: a.user!.id, nemesis_name: 'Doomrider Kevin' },
      { id: b.user!.id, nemesis_name: 'Gravemind Karol' },
    ]);
    expect(ep).toBeNull();
    const { error: eu } = await admin.from('unmasked_identities').insert({ profile_id: a.user!.id, real_name: 'Kevin Real' });
    expect(eu).toBeNull();

    const clientB = createClient(url, anon);
    const { error: signInErr } = await clientB.auth.signInWithPassword({ email: b.user!.email!, password: 'pass1234!' });
    expect(signInErr).toBeNull();
    const { data: leak, error } = await clientB.from('unmasked_identities').select('*').eq('profile_id', a.user!.id);
    expect(error).toBeNull();
    expect(leak).toEqual([]); // RLS must hide it — no arch pact exists
  });

  it('user CAN read their own unmasked identity', async () => {
    const admin = createClient(url, service);
    const em = `self-${Date.now()}@test.local`;
    const { data: u } = await admin.auth.admin.createUser({ email: em, password: 'pass1234!', email_confirm: true });
    await admin.from('profiles').insert({ id: u.user!.id, nemesis_name: 'Selfreader Sam' });
    await admin.from('unmasked_identities').insert({ profile_id: u.user!.id, real_name: 'Sam Real' });
    const client = createClient(url, anon);
    await client.auth.signInWithPassword({ email: em, password: 'pass1234!' });
    const { data } = await client.from('unmasked_identities').select('real_name').eq('profile_id', u.user!.id);
    expect(data).toEqual([{ real_name: 'Sam Real' }]);
  });
});
