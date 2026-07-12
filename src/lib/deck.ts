import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrdealRow } from '../onboarding/ordeal-labels';

export interface DeckOrdeal extends OrdealRow {
  skill_hint: string | null;
}

export interface DeckCard {
  id: string;
  nemesis_name: string;
  catchphrase: string | null;
  bio: string | null;
  mask_avatar_id: string;
  distance_km: number;
  shared_ordeals: DeckOrdeal[];
}

export interface DeclareRow {
  id: string;
  declarer: string;
  target: string;
  status: 'pending' | 'accepted' | 'declined' | 'dissolved';
  created_at: string;
  resolved_at: string | null;
  token_available_at: string | null;
}

export async function getDeck(client: SupabaseClient, maxCards = 20): Promise<DeckCard[]> {
  const { data, error } = await client.rpc('get_deck', { max_cards: maxCards });
  if (error) throw error;
  return (data ?? []) as DeckCard[];
}

export async function swipeRival(
  client: SupabaseClient,
  targetId: string,
  liked: boolean,
): Promise<{ matched: boolean }> {
  const { data, error } = await client.rpc('swipe_rival', { p_target: targetId, p_liked: liked });
  if (error) throw error;
  return data as { matched: boolean };
}

export async function proposeFeud(
  client: SupabaseClient,
  args: { targetId: string; ordealId: string; mode: 'endless' | 'showdown'; goal: number | null },
): Promise<string> {
  const { data, error } = await client.rpc('propose_feud', {
    p_target: args.targetId, p_ordeal_id: args.ordealId, p_mode: args.mode, p_goal: args.goal,
  });
  if (error) throw error;
  return data as string;
}

export async function respondFeud(client: SupabaseClient, feudId: string, accept: boolean): Promise<void> {
  const { error } = await client.rpc('respond_feud', { p_feud_id: feudId, p_accept: accept });
  if (error) throw error;
}

export async function declareArch(client: SupabaseClient, targetId: string): Promise<string> {
  const { data, error } = await client.rpc('declare_arch', { p_target: targetId });
  if (error) throw error;
  return data as string;
}

/** Returns the pact feud id on accept, null on decline. */
export async function resolveDeclare(
  client: SupabaseClient,
  declareId: string,
  accept: boolean,
): Promise<string | null> {
  const { data, error } = await client.rpc('resolve_declare', { p_declare_id: declareId, p_accept: accept });
  if (error) throw error;
  return (data ?? null) as string | null;
}

export async function dissolveArch(client: SupabaseClient, feudId: string): Promise<void> {
  const { error } = await client.rpc('dissolve_arch', { p_feud_id: feudId });
  if (error) throw error;
}

/** Declares involving me, newest first — RLS scopes to declarer/target. */
export async function myDeclares(client: SupabaseClient): Promise<DeclareRow[]> {
  const { data, error } = await client
    .from('declares')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeclareRow[];
}
