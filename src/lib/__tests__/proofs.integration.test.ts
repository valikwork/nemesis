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

maybe('proofs bucket', () => {
  it('feud member can upload and read; stranger cannot read', async () => {
    const a = await userWithProfile('pf-a', 'Proof Anna');
    const b = await userWithProfile('pf-b', 'Proof Bo');
    const stranger = await userWithProfile('pf-s', 'Proof Stranger');
    const { data: ordeal } = await admin().from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    const [pa, pb] = [a.id, b.id].sort();
    const { data: feud } = await admin().from('feuds').insert({
      profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id, mode: 'endless', status: 'active',
    }).select('id').single();

    const path = `${feud!.id}/entry-1.jpg`;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);

    const { error: upErr } = await a.client.storage.from('proofs').upload(path, bytes, { contentType: 'image/jpeg' });
    expect(upErr).toBeNull();

    const { data: got, error: dlErr } = await b.client.storage.from('proofs').download(path);
    expect(dlErr).toBeNull();
    expect(got).not.toBeNull();

    const { data: leak, error: leakErr } = await stranger.client.storage.from('proofs').download(path);
    expect(leak).toBeNull();
    expect(leakErr).not.toBeNull();

    const { error: strangerUp } = await stranger.client.storage.from('proofs').upload(`${feud!.id}/sneak.jpg`, bytes, { contentType: 'image/jpeg' });
    expect(strangerUp).not.toBeNull();
  });
});
