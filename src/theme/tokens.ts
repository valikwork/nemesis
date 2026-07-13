// Design System Spec §1–2. Never pure #fff/#000 — bone and void are the extremes.
// Note: `void` is a reserved word, so it can't be destructured
// (`const { void } = colors` is a syntax error) — access it as colors.void.
export const colors = {
  void: "#060507",
  ink: "#0c0b0d",
  crypt: "#100a1a",
  cryptRaised: "#140d21",
  bone: "#e8e4da",
  ash: "#a8a29a",
  smoke: "#5c5450",
  venom: "#8a3aa8",
  venomDim: "#3a2454",
  venomDeep: "#6d5a86",
  blood: "#c9203a",
  bloodDeep: "#6e1111",
  bloodMist: "#4a0d18",
} as const;

export const semantic = {
  bg: colors.ink,
  surface: colors.crypt,
  border: colors.venomDim,
  text: colors.bone,
  text2: colors.ash,
  text3: colors.smoke,
  accent: colors.blood,
  accent2: colors.venom,
} as const;

export const spacing = [4, 8, 12, 16, 24, 32] as const;
export const radii = { card: 14, button: 6, chip: 3 } as const;
