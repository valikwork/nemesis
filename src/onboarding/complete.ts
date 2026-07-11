import type { SupabaseClient } from '@supabase/supabase-js';
import type { OnboardingDraft } from './draft';
import { validateNemesisName } from '../lib/validation';

// Writes the persona at the end of onboarding. Takes the client as a
// parameter so node-based integration tests can pass a plain supabase-js
// client (the app passes src/lib/supabase's RN client).
export async function completeOnboarding(client: SupabaseClient, draft: OnboardingDraft): Promise<void> {
  if (draft.maskAvatarId == null || validateNemesisName(draft.nemesisName) != null) {
    throw new Error('draft_incomplete');
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || userData.user == null) throw new Error('auth_required');
  const uid = userData.user.id;

  const { error: pe } = await client.from('profiles').insert({
    id: uid,
    nemesis_name: draft.nemesisName.trim(),
    catchphrase: draft.catchphrase.trim() || null,
    bio: draft.bio.trim() || null,
    mask_avatar_id: draft.maskAvatarId,
  });
  if (pe) throw pe;

  if (draft.ordeals.length > 0) {
    const { error: oe } = await client.from('profile_ordeals').insert(
      draft.ordeals.map((o) => ({
        profile_id: uid,
        ordeal_id: o.ordealId,
        skill_hint: o.skillHint.trim() || null,
      })),
    );
    if (oe) throw oe;
  }
}
