// Client-side mirrors of data-contract length checks. DB constraints remain
// the source of truth; these exist for instant form feedback.
export type ValidationError = 'tooShort' | 'tooLong' | null;

function lengthBetween(value: string, min: number, max: number): ValidationError {
  const len = value.trim().length;
  if (len < min) return 'tooShort';
  if (len > max) return 'tooLong';
  return null;
}

export const validateNemesisName = (v: string) => lengthBetween(v, 2, 40);
export const validateCatchphrase = (v: string) => (v.trim() === '' ? null : lengthBetween(v, 0, 80));
export const validateBio = (v: string) => (v.trim() === '' ? null : lengthBetween(v, 0, 500));
export const validateSkillHint = (v: string) => (v.trim() === '' ? null : lengthBetween(v, 0, 30));
export const validateOrdealName = (v: string) => lengthBetween(v, 2, 40);
export const validateOrdealUnit = (v: string) => lengthBetween(v, 1, 20);
