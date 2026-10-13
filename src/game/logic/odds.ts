/** Pure success-odds math for command-center dispatch (no DOM, no three.js). */
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface Techs {
  cctv?: boolean;
  heli?: boolean;
  lab?: boolean;
}

/** Chance shown on the decision card before units are assigned. */
export function previewOdds(o: { successBonus: number; equipment: number; techs: Techs; swatBonus: number }): number {
  let base = 0.48 + o.successBonus + o.equipment / 5000;
  if (o.techs.cctv) base += 0.08;
  if (o.techs.heli) base += 0.05;
  if (o.techs.lab) base += 0.04;
  base += o.swatBonus * 0.5;
  return clamp(base, 0.15, 0.92);
}

export interface ResolveInput {
  preferredHits: number;
  powerSum: number;
  equipment: number;
  successBonus: number;
  techs: Techs;
  swatBonus: number;
  breachOrSwat: boolean;
  labWithInvestigations: boolean;
  /** quick resolve (action beat) uses a slightly different curve */
  quick?: boolean;
  unitCount?: number;
}

/** Final chance used when the incident resolves. */
export function resolveOdds(i: ResolveInput): number {
  const tech = (i.techs.cctv ? 0.08 : 0) + (i.techs.heli ? 0.05 : 0);
  const core = i.preferredHits * 0.16 + i.powerSum * 0.07 + i.equipment / 4500 + i.successBonus + tech;
  if (i.quick) {
    let c = clamp(0.42 + core + ((i.unitCount ?? 0) ? 0.08 : -0.12), 0.18, 0.94);
    if (i.breachOrSwat) c = clamp(c + i.swatBonus, 0.18, 0.96);
    return c;
  }
  let c = clamp(0.4 + core, 0.15, 0.96);
  if (i.breachOrSwat) c = clamp(c + i.swatBonus, 0.15, 0.97);
  if (i.labWithInvestigations) c = clamp(c + 0.1, 0.15, 0.97);
  return c;
}
