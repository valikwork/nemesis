import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { SupabaseClient } from '@supabase/supabase-js';

// Best-effort: simulators have no push; dev builds without an EAS projectId
// cannot mint Expo push tokens. Every failure path is silent by design --
// push is a nicety, never load-bearing (contract amendment 2026-07-12).
export async function registerPushToken(client: SupabaseClient, userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (projectId == null) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await client.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  } catch {
    // silent: push is optional
  }
}

export async function notifyOpponent(
  client: SupabaseClient,
  kind: 'match' | 'taunt' | 'score',
  feudId: string,
): Promise<void> {
  try {
    await client.functions.invoke('notify', { body: { kind, feud_id: feudId } });
  } catch {
    // fire-and-forget
  }
}

// Profile-scoped kinds (no feud yet): the EF verifies the relationship —
// mutual liked swipes for deck_match, a pending declare for declare.
export async function notifyProfile(
  client: SupabaseClient,
  kind: 'deck_match' | 'declare',
  targetProfileId: string,
): Promise<void> {
  try {
    await client.functions.invoke('notify', { body: { kind, target_profile_id: targetProfileId } });
  } catch {
    // fire-and-forget
  }
}
