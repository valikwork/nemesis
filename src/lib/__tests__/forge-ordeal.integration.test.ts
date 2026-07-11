/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const maybe = anon && service ? describe : describe.skip;

async function freshUser(prefix: string) {
  const admin = createClient(url, service);
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
  expect(error).toBeNull();
  await admin.from('profiles').insert({ id: data.user!.id, nemesis_name: 'Forge Tester' });
  const client = createClient(url, anon);
  const { error: se } = await client.auth.signInWithPassword({ email, password: 'pass1234!' });
  expect(se).toBeNull();
  return client;
}

maybe('forge_ordeal RPC', () => {
  it('creates an approved custom ordeal for a clean name', async () => {
    const client = await freshUser('forge-ok');
    const { data, error } = await client.rpc('forge_ordeal', {
      p_name: `Yodeling ${Date.now()}`,
      p_unit: 'yodels',
      p_language: 'en',
    });
    expect(error).toBeNull();
    expect(data.is_custom).toBe(true);
    expect(data.moderation_status).toBe('approved');
    expect(data.name_custom).toContain('Yodeling');
  });

  it('rejects a name containing a banned word', async () => {
    const client = await freshUser('forge-bad');
    const { error } = await client.rpc('forge_ordeal', {
      p_name: 'testbanned contest',
      p_unit: 'x',
      p_language: 'en',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('ordeal_rejected');
  });

  it('rejects unauthenticated calls', async () => {
    const client = createClient(url, anon);
    const { error } = await client.rpc('forge_ordeal', { p_name: 'Sneaky', p_unit: 'x', p_language: 'en' });
    expect(error).not.toBeNull();
  });
});
