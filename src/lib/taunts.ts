import type { SupabaseClient } from '@supabase/supabase-js';

export interface TauntTemplate {
  id: string;
  language: string;
  skeleton: string;
  slot_count: number;
}

export interface TauntBankWord {
  template_id: string;
  slot_index: number;
  word_index: number;
  word: string;
}

export interface TauntRow {
  id: string;
  feud_id: string;
  author: string;
  template_id: string;
  picks: number[];
  created_at: string;
}

export function assembleTaunt(template: TauntTemplate, banks: TauntBankWord[], picks: number[]): string {
  return template.skeleton.replace(/\{(\d+)\}/g, (_, slot) => {
    const s = Number(slot);
    const found = banks.find((b) => b.slot_index === s && b.word_index === (picks[s] ?? -1));
    return found?.word ?? '…';
  });
}

export async function fetchTauntKit(client: SupabaseClient, language: string): Promise<{
  template: TauntTemplate;
  banks: TauntBankWord[];
  bySlot: TauntBankWord[][];
}> {
  const lang = language === 'uk' ? 'uk' : 'en';
  const { data: template, error: te } = await client
    .from('taunt_templates').select('*').eq('language', lang).limit(1).single();
  if (te) throw te;
  const { data: banks, error: be } = await client
    .from('taunt_banks').select('*').eq('template_id', template.id)
    .order('slot_index').order('word_index');
  if (be) throw be;
  const bySlot: TauntBankWord[][] = [];
  for (const b of banks ?? []) {
    (bySlot[b.slot_index] ??= []).push(b);
  }
  return { template: template as TauntTemplate, banks: (banks ?? []) as TauntBankWord[], bySlot };
}

export async function sendTaunt(
  client: SupabaseClient,
  args: { feudId: string; templateId: string; picks: number[] },
): Promise<TauntRow> {
  const { data, error } = await client.rpc('send_taunt', {
    p_feud_id: args.feudId, p_template_id: args.templateId, p_picks: args.picks,
  });
  if (error) throw error;
  return data as TauntRow;
}

export async function listTaunts(client: SupabaseClient, feudId: string): Promise<TauntRow[]> {
  const { data, error } = await client
    .from('taunts').select('*').eq('feud_id', feudId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TauntRow[];
}

// Renders a received taunt: needs the AUTHOR's template+banks (taunts are
// composed in the author's language and stay in it).
export async function fetchTemplateWithBanks(client: SupabaseClient, templateId: string): Promise<{
  template: TauntTemplate;
  banks: TauntBankWord[];
}> {
  const [{ data: template, error: te }, { data: banks, error: be }] = await Promise.all([
    client.from('taunt_templates').select('*').eq('id', templateId).single(),
    client.from('taunt_banks').select('*').eq('template_id', templateId),
  ]);
  if (te) throw te;
  if (be) throw be;
  return { template: template as TauntTemplate, banks: (banks ?? []) as TauntBankWord[] };
}
