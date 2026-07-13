import * as Location from 'expo-location';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_RADIUS_KM = 25;

/**
 * Ask for foreground permission, take one coarse fix, save it to the profile.
 * Returns false when the user refused — the deck stays gated, nothing stored.
 * Low accuracy (~1 km) is plenty: get_deck never reveals position, only
 * rounded distance.
 */
export async function optIntoLocation(client: SupabaseClient, userId: string): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return false;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  const { error } = await client
    .from('profiles')
    .update({
      location: `POINT(${pos.coords.longitude} ${pos.coords.latitude})`,
      radius_km: DEFAULT_RADIUS_KM,
    })
    .eq('id', userId);
  if (error) throw error;
  return true;
}

export async function hasLocation(client: SupabaseClient, userId: string): Promise<boolean> {
  return (await getRadius(client, userId)) != null;
}

export async function getRadius(client: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await client
    .from('profiles')
    .select('radius_km')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data.radius_km;
}

// contract bounds: 1..500
export const RADIUS_STEPS = [5, 10, 25, 50, 100, 250, 500] as const;

export async function setRadius(client: SupabaseClient, userId: string, km: number): Promise<void> {
  const { error } = await client.from('profiles').update({ radius_km: km }).eq('id', userId);
  if (error) throw error;
}
