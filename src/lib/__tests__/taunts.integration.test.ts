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

maybe('taunt system', () => {
  it('seeded templates exist for both languages with full banks', async () => {
    const u = await userWithProfile('seed-t', 'Seed Tester');
    const { data: templates } = await u.client.from('taunt_templates').select('*');
    const en = templates!.find((t) => t.language === 'en')!;
    const uk = templates!.find((t) => t.language === 'uk')!;
    expect(en.slot_count).toBe(4);
    expect(uk.slot_count).toBe(4);
    const { data: enBanks } = await u.client.from('taunt_banks').select('*').eq('template_id', en.id);
    const slots = (rows: any[], i: number) => rows.filter((r) => r.slot_index === i).length;
    expect(slots(enBanks!, 0)).toBe(5);
    expect(slots(enBanks!, 1)).toBe(11);
    expect(slots(enBanks!, 2)).toBe(10);
    expect(slots(enBanks!, 3)).toBe(13);
    const { data: ukBanks } = await u.client.from('taunt_banks').select('word').eq('template_id', uk.id).eq('slot_index', 0).eq('word_index', 0);
    expect(ukBanks![0].word).toBe('Твоє');
  });

  it('member sends a taunt; second same-day taunt rejected as taunt_spent', async () => {
    const a = await userWithProfile('taunt-a', 'Taunt Anna');
    const b = await userWithProfile('taunt-b', 'Taunt Bo');
    const feudId = await makeFeud(a, b);
    const { data: tpl } = await a.client.from('taunt_templates').select('id').eq('language', 'en').single();

    const { data: sent, error } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 1, 2, 3],
    });
    expect(error).toBeNull();
    expect(sent.picks).toEqual([0, 1, 2, 3]);

    const { error: again } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [1, 1, 1, 1],
    });
    expect(again).not.toBeNull();
    expect(again!.message).toContain('taunt_spent');

    const { data: visible } = await b.client.from('taunts').select('*').eq('feud_id', feudId);
    expect(visible).toHaveLength(1);
  });

  it('rejects out-of-range picks and non-members', async () => {
    const a = await userWithProfile('bad-a', 'Bad Anna');
    const b = await userWithProfile('bad-b', 'Bad Bo');
    const s = await userWithProfile('bad-s', 'Bad Stranger');
    const feudId = await makeFeud(a, b);
    const { data: tpl } = await a.client.from('taunt_templates').select('id').eq('language', 'en').single();

    const { error: range } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 99, 0, 0],
    });
    expect(range!.message).toContain('bad_picks');

    const { error: wrongLen } = await a.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 0],
    });
    expect(wrongLen!.message).toContain('bad_picks');

    const { error: stranger } = await s.client.rpc('send_taunt', {
      p_feud_id: feudId, p_template_id: tpl!.id, p_picks: [0, 0, 0, 0],
    });
    expect(stranger!.message).toContain('not_member');
  });
});
