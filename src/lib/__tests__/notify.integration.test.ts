/**
 * @jest-environment node
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const fnUrl = process.env.FUNCTIONS_URL ?? ''; // e.g. http://127.0.0.1:54321/functions/v1
const maybe = anon && service && fnUrl ? describe : describe.skip;

const admin = () => createClient(url, service);

maybe('notify edge function', () => {
  it('member without opponent token → skipped; non-member → 403; anon → 401', async () => {
    const a = admin();
    const mk = async (n: string) => {
      const email = `nf-${n}-${Date.now()}@test.local`;
      const { data } = await a.auth.admin.createUser({ email, password: 'pass1234!', email_confirm: true });
      await a.from('profiles').insert({ id: data.user!.id, nemesis_name: `Notify ${n}` });
      const c = createClient(url, anon);
      await c.auth.signInWithPassword({ email, password: 'pass1234!' });
      const { data: s } = await c.auth.getSession();
      return { id: data.user!.id, jwt: s.session!.access_token };
    };
    const ua = await mk('a');
    const ub = await mk('b');
    const us = await mk('s');
    const { data: ordeal } = await a.from('ordeals').select('id').eq('is_custom', false).limit(1).single();
    const [pa, pb] = [ua.id, ub.id].sort();
    const { data: feud } = await a.from('feuds').insert({
      profile_a: pa, profile_b: pb, ordeal_id: ordeal!.id, mode: 'endless', status: 'active',
    }).select('id').single();

    const call = (jwt: string | null) =>
      fetch(`${fnUrl}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt != null ? { Authorization: `Bearer ${jwt}` } : { Authorization: `Bearer ${anon}` }),
        },
        body: JSON.stringify({ kind: 'taunt', feud_id: feud!.id }),
      });

    const okResp = await call(ua.jwt);
    expect(okResp.status).toBe(200);
    expect(await okResp.json()).toEqual({ skipped: true });

    const strangerResp = await call(us.jwt);
    expect(strangerResp.status).toBe(403);

    const anonResp = await call(null);
    expect(anonResp.status).toBe(401);
  });
});
