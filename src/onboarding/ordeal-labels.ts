export interface OrdealRow {
  id: string;
  name_en: string | null;
  name_uk: string | null;
  unit_en: string | null;
  unit_uk: string | null;
  name_custom: string | null;
  unit_custom: string | null;
  is_custom: boolean;
  language: string | null;
}

export function ordealLabel(row: OrdealRow, lang: string): string {
  if (row.is_custom) return row.name_custom ?? '';
  return (lang === 'uk' ? row.name_uk : row.name_en) ?? row.name_en ?? '';
}

export function ordealUnit(row: OrdealRow, lang: string): string {
  if (row.is_custom) return row.unit_custom ?? '';
  return (lang === 'uk' ? row.unit_uk : row.unit_en) ?? row.unit_en ?? '';
}
