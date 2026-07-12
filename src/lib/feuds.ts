import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrdealRow } from '../onboarding/ordeal-labels';

export interface InviteRow {
  id: string;
  code: string;
  status: string;
  mode: 'endless' | 'showdown';
  goal_value: number | null;
}

export interface InviteLanding {
  id: string;
  status: string;
  mode: 'endless' | 'showdown';
  goal_value: number | null;
  inviter_name: string;
  inviter_sigil: string;
  ordeal: OrdealRow;
}

export interface FeudRow {
  id: string;
  profile_a: string;
  profile_b: string;
  ordeal_id: string;
  mode: 'endless' | 'showdown';
  goal_value: number | null;
  status: 'proposed' | 'active' | 'ended' | 'dissolved';
  is_arch: boolean;
  winner: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface ScoreEntry {
  id: string;
  feud_id: string;
  author: string;
  value: number;
  note: string | null;
  proof_url: string | null;
  created_at: string;
}

export async function createInvite(
  client: SupabaseClient,
  args: { ordealId: string; mode: 'endless' | 'showdown'; goal: number | null },
): Promise<InviteRow> {
  const { data, error } = await client.rpc('create_invite', {
    p_ordeal_id: args.ordealId, p_mode: args.mode, p_goal: args.goal,
  });
  if (error) throw error;
  return data as InviteRow;
}

export async function getInvite(client: SupabaseClient, code: string): Promise<InviteLanding> {
  const { data, error } = await client.rpc('get_invite', { p_code: code });
  if (error) throw error;
  return data as InviteLanding;
}

export async function acceptInvite(client: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await client.rpc('accept_invite', { p_code: code });
  if (error) throw error;
  return data as string;
}

export async function revokeInvite(client: SupabaseClient, inviteId: string): Promise<void> {
  const { error } = await client.rpc('revoke_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

export async function listFeuds(client: SupabaseClient, myId: string): Promise<FeudRow[]> {
  const { data, error } = await client
    .from('feuds')
    .select('*')
    .or(`profile_a.eq.${myId},profile_b.eq.${myId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as FeudRow[];
}

export async function logScore(
  client: SupabaseClient,
  args: { feudId: string; value: number; note?: string; proofUrl?: string },
): Promise<void> {
  const { data: userData, error: ue } = await client.auth.getUser();
  if (ue || userData.user == null) throw new Error('auth_required');
  const { error } = await client.from('score_entries').insert({
    feud_id: args.feudId,
    author: userData.user.id,
    value: args.value,
    note: args.note?.trim() || null,
    proof_url: args.proofUrl ?? null,
  });
  if (error) throw error;
}

export async function listScores(client: SupabaseClient, feudId: string): Promise<ScoreEntry[]> {
  const { data, error } = await client
    .from('score_entries')
    .select('*')
    .eq('feud_id', feudId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScoreEntry[];
}

export async function feudTotals(client: SupabaseClient, feudId: string): Promise<Record<string, number>> {
  const entries = await listScores(client, feudId);
  const totals: Record<string, number> = {};
  for (const e of entries) {
    totals[e.author] = (totals[e.author] ?? 0) + Number(e.value);
  }
  return totals;
}

export interface ProfilePersona {
  id: string;
  nemesis_name: string;
  mask_avatar_id: string;
  catchphrase: string | null;
}

export interface FeudWithMeta {
  feud: FeudRow;
  opponent: ProfilePersona;
  ordeal: OrdealRow;
  myTotal: number;
  theirTotal: number;
}

export interface PendingInvite extends InviteRow {
  ordeal: OrdealRow;
  expires_at: string;
}

export async function listFeudsWithMeta(client: SupabaseClient, myId: string): Promise<FeudWithMeta[]> {
  const feuds = await listFeuds(client, myId);
  if (feuds.length === 0) return [];

  const opponentIds = [...new Set(feuds.map((f) => (f.profile_a === myId ? f.profile_b : f.profile_a)))];
  const ordealIds = [...new Set(feuds.map((f) => f.ordeal_id))];

  const [{ data: profiles }, { data: ordeals }] = await Promise.all([
    client.from('profiles').select('id, nemesis_name, mask_avatar_id, catchphrase').in('id', opponentIds),
    client.from('ordeals').select('*').in('id', ordealIds),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as ProfilePersona]));
  const ordealById = new Map((ordeals ?? []).map((o) => [o.id, o as OrdealRow]));

  const result: FeudWithMeta[] = [];
  for (const feud of feuds) {
    const opponentId = feud.profile_a === myId ? feud.profile_b : feud.profile_a;
    const opponent = profileById.get(opponentId);
    const ordeal = ordealById.get(feud.ordeal_id);
    if (opponent == null || ordeal == null) continue; // opponent deleted etc.
    const totals = await feudTotals(client, feud.id);
    result.push({
      feud,
      opponent,
      ordeal,
      myTotal: totals[myId] ?? 0,
      theirTotal: totals[opponentId] ?? 0,
    });
  }
  return result;
}

export async function pendingInvites(client: SupabaseClient): Promise<PendingInvite[]> {
  const { data, error } = await client
    .from('invites')
    .select('*, ordeal:ordeals(*)')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PendingInvite[];
}

export async function myOrdeals(client: SupabaseClient, myId: string): Promise<OrdealRow[]> {
  const { data, error } = await client
    .from('profile_ordeals')
    .select('ordeal:ordeals(*)')
    .eq('profile_id', myId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.ordeal as OrdealRow);
}

export async function blockUser(client: SupabaseClient, targetId: string): Promise<void> {
  const { error } = await client.rpc('block_user', { p_target: targetId });
  if (error) throw error;
}

export async function reportUser(
  client: SupabaseClient,
  args: { targetId: string; feudId?: string; reason: string },
): Promise<void> {
  const { data: userData, error: ue } = await client.auth.getUser();
  if (ue || userData.user == null) throw new Error('auth_required');
  const { error } = await client.from('reports').insert({
    reporter: userData.user.id,
    target: args.targetId,
    feud_id: args.feudId ?? null,
    reason: args.reason.trim(),
  });
  if (error) throw error;
}
