import { assembleTaunt, type TauntTemplate, type TauntBankWord } from '../taunts';

const template: TauntTemplate = { id: 't1', language: 'en', skeleton: '{0} {1} {2} {3}.', slot_count: 4 };
const banks: TauntBankWord[] = [
  { template_id: 't1', slot_index: 0, word_index: 0, word: 'Thy' },
  { template_id: 't1', slot_index: 0, word_index: 1, word: 'Even thy' },
  { template_id: 't1', slot_index: 1, word_index: 0, word: 'pitiful' },
  { template_id: 't1', slot_index: 2, word_index: 0, word: 'effort' },
  { template_id: 't1', slot_index: 3, word_index: 0, word: 'feeds the crows' },
];

describe('assembleTaunt', () => {
  it('substitutes picks into the skeleton', () => {
    expect(assembleTaunt(template, banks, [0, 0, 0, 0])).toBe('Thy pitiful effort feeds the crows.');
    expect(assembleTaunt(template, banks, [1, 0, 0, 0])).toBe('Even thy pitiful effort feeds the crows.');
  });
  it('missing word renders placeholder, never crashes', () => {
    expect(assembleTaunt(template, banks, [0, 9, 0, 0])).toBe('Thy … effort feeds the crows.');
  });
});
