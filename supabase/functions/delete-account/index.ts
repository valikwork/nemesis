import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData, error: ue } = await caller.auth.getUser();
    if (ue || userData.user == null) return Response.json({ error: 'auth_required' }, { status: 401 });

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // FK cascades wipe profiles/feuds/scores/taunts/etc; custom ordeals
    // survive with created_by = null (contract amendment 2026-07-11).
    const { error: de } = await service.auth.admin.deleteUser(userData.user.id);
    if (de) return Response.json({ error: String(de.message) }, { status: 500 });
    return Response.json({ erased: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
