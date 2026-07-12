import { createClient } from 'jsr:@supabase/supabase-js@2';

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    match: 'A nemesis has answered thy challenge.',
    taunt: '{name} sends taunt.',
    score: "{name}'s tower grows.",
  },
  uk: {
    match: 'Ворог відповів на твій виклик.',
    taunt: '{name} шле образ.',
    score: 'Вежа {name} росте.',
  },
};

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { kind, feud_id } = await req.json();
    if (!['match', 'taunt', 'score'].includes(kind) || typeof feud_id !== 'string') {
      return Response.json({ error: 'bad_request' }, { status: 400 });
    }

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: ue } = await caller.auth.getUser();
    if (ue || userData.user == null) return Response.json({ error: 'auth_required' }, { status: 401 });
    const uid = userData.user.id;

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: feud } = await service.from('feuds').select('profile_a, profile_b').eq('id', feud_id).maybeSingle();
    if (feud == null || (feud.profile_a !== uid && feud.profile_b !== uid)) {
      return Response.json({ error: 'not_member' }, { status: 403 });
    }
    const opponentId = feud.profile_a === uid ? feud.profile_b : feud.profile_a;
    const [{ data: opponent }, { data: me }] = await Promise.all([
      service.from('profiles').select('expo_push_token, language').eq('id', opponentId).maybeSingle(),
      service.from('profiles').select('nemesis_name').eq('id', uid).maybeSingle(),
    ]);
    if (opponent?.expo_push_token == null) return Response.json({ skipped: true });

    const lang = opponent.language === 'uk' ? 'uk' : 'en';
    const body = MESSAGES[lang][kind].replace('{name}', me?.nemesis_name ?? '???');

    const pushResp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: opponent.expo_push_token, title: 'NEMESIS', body, sound: 'default' }),
    });
    return Response.json({ sent: pushResp.ok });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
