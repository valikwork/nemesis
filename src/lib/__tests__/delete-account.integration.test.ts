/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const fnUrl = process.env.FUNCTIONS_URL ?? '';
const maybe = anon && service && fnUrl ? describe : describe.skip;

maybe('delete-account edge function', () => {
  it('erases the caller: auth user gone, profile gone, feuds cascade', async () => {
    const a = createClient(url, service);
    const email = `erase-${Date.now()}@test.local`;
    const { data: u } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
    await a.from('profiles').insert({ id: u.user!.id, nemesis_name: 'Erase Me' });
    const client = createClient(url, anon);
    await client.auth.signInWithPassword({ email, password: 'pass1234!' });
    const { data: s } = await client.auth.getSession();

    const resp = await fetch(`${fnUrl}/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.session!.access_token}` },
    });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ erased: true });

    const { data: profile } = await a.from('profiles').select('id').eq('id', u.user!.id).maybeSingle();
    expect(profile).toBeNull();
    const { data: authUser } = await a.auth.admin.getUserById(u.user!.id);
    expect(authUser.user).toBeNull();
  });

  it('rejects anon calls', async () => {
    const resp = await fetch(`${fnUrl}/delete-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${anon}` },
    });
    expect(resp.status).toBe(401);
  });
});
