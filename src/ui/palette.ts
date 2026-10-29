import type { Block, CategoryId, NumericProp, Phase } from '../types';

// Hues come from a documented, validated categorical set (dark-surface steps). The category
// assignment was searched to maximise separation between categories that actually touch on the
// cylinder (both group-3 conventions, seam included): worst neighbouring pair ΔE(OKLab×100)
// 15.2 under normal vision and 9.4 under simulated protan/deutan. Non-neighbouring pairs can be
// closer, so identity never rests on colour alone: every tile carries its symbol, the legend
// names each class, and hovering a legend entry highlights its members.

export const SCENE_BG = '#0b0f18';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  color: string;
}

export const CATEGORIES: readonly CategoryMeta[] = [
  { id: 'alkali-metal', label: 'Alkali metal', color: '#c98500' },
  { id: 'alkaline-earth-metal', label: 'Alkaline earth metal', color: '#9085e9' },
  { id: 'lanthanide', label: 'Lanthanide', color: '#199e70' },
  { id: 'actinide', label: 'Actinide', color: '#d95926' },
  { id: 'transition-metal', label: 'Transition metal', color: '#6250d6' },
  { id: 'post-transition-metal', label: 'Post-transition metal', color: '#008300' },
  { id: 'metalloid', label: 'Metalloid', color: '#2a78d6' },
  { id: 'reactive-nonmetal', label: 'Reactive nonmetal', color: '#d55181' },
  { id: 'noble-gas', label: 'Noble gas', color: '#b3bac8' },
];

export const CATEGORY_BY_ID: ReadonlyMap<CategoryId, CategoryMeta> = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Blocks wrap the cylinder as s | f | d | p (seam back to s); each neighbouring pair passes. */
export const BLOCK_COLORS: Readonly<Record<Block, string>> = {
  s: '#3987e5',
  f: '#d95926',
  d: '#199e70',
  p: '#c98500',
};

export const PHASE_COLORS: Readonly<Record<Phase | 'unknown', string>> = {
  solid: '#8a93a6',
  liquid: '#3987e5',
  gas: '#d95926',
  unknown: '#3a4152',
};

/** Single-hue sequential ramp (blue 700 → 100): dark = low, light = high on the dark scene. */
export const SEQUENTIAL_RAMP: readonly string[] = [
  '#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5',
  '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb',
];

/** Fill for tiles with no value under a numeric colour mode. */
export const NO_DATA_COLOR = '#262b36';

export const TEXT = {
  primary: '#f0efec',
  secondary: '#c3c2b7',
  muted: '#898781',
  onLight: '#0b0b0b',
} as const;

export interface NumericPropMeta {
  id: NumericProp;
  label: string;
  unit: string;
  /** Log scale for heavily skewed properties. */
  log?: boolean;
}

export const NUMERIC_PROPS: readonly NumericPropMeta[] = [
  { id: 'en', label: 'Electronegativity (Pauling)', unit: '' },
  { id: 'ie1', label: 'First ionization energy', unit: 'eV' },
  { id: 'ea', label: 'Electron affinity', unit: 'eV' },
  { id: 'atomicRadius', label: 'Atomic radius', unit: 'pm' },
  { id: 'covalentRadius', label: 'Covalent radius', unit: 'pm' },
  { id: 'vdwRadius', label: 'Van der Waals radius', unit: 'pm' },
  { id: 'mp', label: 'Melting point', unit: 'K' },
  { id: 'bp', label: 'Boiling point', unit: 'K' },
  { id: 'density', label: 'Density', unit: 'g/cm³', log: true },
  { id: 'mass', label: 'Atomic mass', unit: 'Da' },
  { id: 'discoveryYear', label: 'Discovery year', unit: '' },
  { id: 'abundanceCrust', label: 'Crustal abundance', unit: 'mg/kg', log: true },
];

export const NUMERIC_PROP_BY_ID: ReadonlyMap<NumericProp, NumericPropMeta> = new Map(
  NUMERIC_PROPS.map((p) => [p.id, p]),
);

/** Index of the ramp step nearest to t in [0, 1]. */
export function rampIndex(t: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return Math.round(clamped * (SEQUENTIAL_RAMP.length - 1));
}

/** Map t in [0, 1] to the sequential ramp (nearest step; the ramp is the documented set). */
export function rampColor(t: number): string {
  return SEQUENTIAL_RAMP[rampIndex(t)]!;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Text colour (light or dark ink) with the higher WCAG contrast on `bg`. */
export function inkFor(bg: string): string {
  const l = luminance(bg);
  const onDark = (luminance(TEXT.primary) + 0.05) / (l + 0.05);
  const onLight = (l + 0.05) / (luminance(TEXT.onLight) + 0.05);
  return onDark >= onLight ? TEXT.primary : TEXT.onLight;
}

/** Linear mix of two #rrggbb colours; t = 0 → a, 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
