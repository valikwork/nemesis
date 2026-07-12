import { createClient } from 'jsr:@supabase/supabase-js@2';

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    match: 'A nemesis has answered thy challenge.',
    taunt: '{name} sends taunt.',
    score: "{name}'s tower grows.",
    deck_match: 'A nemesis has answered thy challenge.',
    declare: 'Thou hast been named an arch-nemesis.',
  },
  uk: {
    match: 'Ворог відповів на твій виклик.',
    taunt: '{name} шле образ.',
    score: 'Вежа {name} росте.',
    deck_match: 'Ворог відповів на твій виклик.',
    declare: 'Тебе титулували архіворогом.',
  },
};

const FEUD_KINDS = ['match', 'taunt', 'score'];
const TARGET_KINDS = ['deck_match', 'declare'];

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const { kind, feud_id, target_profile_id } = await req.json();
    const feudScoped = FEUD_KINDS.includes(kind);
    if (
      (!feudScoped && !TARGET_KINDS.includes(kind)) ||
      (feudScoped && typeof feud_id !== 'string') ||
      (!feudScoped && typeof target_profile_id !== 'string')
    ) {
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
    let opponentId: string;
    if (feudScoped) {
      const { data: feud } = await service.from('feuds').select('profile_a, profile_b').eq('id', feud_id).maybeSingle();
      if (feud == null || (feud.profile_a !== uid && feud.profile_b !== uid)) {
        return Response.json({ error: 'not_member' }, { status: 403 });
      }
      opponentId = feud.profile_a === uid ? feud.profile_b : feud.profile_a;
    } else {
      // profile-scoped kinds: the claimed relationship must exist in the DB
      if (kind === 'deck_match') {
        const [mine, theirs] = await Promise.all([
          service.from('swipes').select('liked').eq('swiper', uid).eq('target', target_profile_id).maybeSingle(),
          service.from('swipes').select('liked').eq('swiper', target_profile_id).eq('target', uid).maybeSingle(),
        ]);
        if (mine.data?.liked !== true || theirs.data?.liked !== true) {
          return Response.json({ error: 'not_member' }, { status: 403 });
        }
      } else {
        const { data: declare } = await service.from('declares').select('id')
          .eq('declarer', uid).eq('target', target_profile_id).eq('status', 'pending').maybeSingle();
        if (declare == null) return Response.json({ error: 'not_member' }, { status: 403 });
      }
      opponentId = target_profile_id;
    }
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
