import type { ElementData, NumericProp } from '../types';
import { NUMERIC_PROP_BY_ID } from './palette';

// Pure display formatting. Everything here returns plain strings meant for textContent.

/** Narrow no-break space (U+202F): the thin, unbreakable gap between a number and its unit. */
export const UNIT_SPACE = ' ';
/** True minus sign (U+2212); a hyphen-minus is too short and too high beside digits. */
export const MINUS = '−';
/** Shown in place of a missing value. */
export const NO_VALUE = '—';

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', [MINUS]: '⁻',
};

/** Map digits and signs to their Unicode superscript forms; other characters pass through. */
export function toSuperscript(text: string): string {
  return Array.from(text, (c) => SUPERSCRIPTS[c] ?? c).join('');
}

// A subshell token such as "3d6": principal number, letter, optional occupancy. The lookarounds
// keep it from matching inside words, and the trailing one skips occupancies that are already
// superscript ("3d⁶"), so the function is idempotent.
const SUBSHELL = /(?<![0-9A-Za-z])([1-9])([spdfghi])([0-9]*)(?![0-9A-Za-z⁰¹²³⁴⁵⁶⁷⁸⁹])/g;

/**
 * '[Ar] 3d6 4s2' → '[Ar] 3d⁶ 4s²'. A bare subshell ('1s', '[He] 2s') holds one electron and is
 * written with an explicit ¹.
 */
export function superscriptConfig(config: string): string {
  return config.replace(SUBSHELL, (_, n: string, l: string, occ: string) => `${n}${l}${toSuperscript(occ || '1')}`);
}

/** Standard atomic weight as published ('55.845'), or the bracketed mass number ('[98]'). */
export function formatMass(e: Pick<ElementData, 'mass' | 'massIsMassNumber'>): string {
  if (e.massIsMassNumber) return `[${Math.round(e.mass)}]`;
  // 12 significant figures keeps every published digit (P: 30.973761998) and drops float noise.
  return String(Number(e.mass.toPrecision(12)));
}

function signed(text: string): string {
  return text.startsWith('-') ? MINUS + text.slice(1) : text;
}

/** Fixed decimals with trailing fractional zeros removed: 1811.00 → '1811', 234.30 → '234.3'. */
function trimmedFixed(value: number, decimals: number): string {
  return stripZeros(value.toFixed(decimals));
}

function stripZeros(text: string): string {
  const out = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
  return out === '-0' ? '0' : out;
}

/**
 * '1811.15 K (1538 °C)', '301.65 K (28.5 °C)': kelvin to at most 2 decimals, and Celsius
 * converted from that figure and rounded to the same number of decimals, so a value stored
 * as °C + 273.15 reads back exactly. Integer hundredths avoid float drift at the half-way
 * points (301.65 − 273.15 is 28.499999…), and halves round away from zero.
 */
export function formatTemperature(kelvin: number | null | undefined): string {
  if (kelvin === null || kelvin === undefined || !Number.isFinite(kelvin)) return NO_VALUE;
  const centi = Math.round(kelvin * 100);
  const k = stripZeros((centi / 100).toFixed(2));
  const decimals = k.split('.')[1]?.length ?? 0;
  const step = 10 ** (2 - decimals);
  const celsius = centi - 27315;
  const rounded = Math.sign(celsius) * Math.round(Math.abs(celsius) / step) * step;
  const c = stripZeros((rounded / 100).toFixed(decimals));
  return `${signed(k)}${UNIT_SPACE}K (${signed(c)}${UNIT_SPACE}°C)`;
}

export interface NumberFormat {
  /** Significant figures (default 4). Ignored when `decimals` is set. */
  digits?: number;
  /** Fixed decimal places instead of significant figures. */
  decimals?: number;
  unit?: string;
  /** Drop trailing fractional zeros (default true). */
  trim?: boolean;
}

/** Integer with SI digit grouping (narrow no-break spaces) from five digits up: 28 200, 1811. */
function groupedInteger(value: number): string {
  const digits = String(Math.abs(Math.round(value)));
  const grouped = digits.length > 4 ? digits.replace(/\B(?=(\d{3})+$)/g, UNIT_SPACE) : digits;
  return Math.round(value) < 0 ? MINUS + grouped : grouped;
}

/**
 * Mantissa × 10ⁿ with `digits` significant figures: 1.23 × 10⁶, 8.2 × 10⁻⁵. toExponential does
 * the rounding (including the carry in 9.999e6 → 1.00e7) without dividing by 10ⁿ, which
 * overflows for subnormal values.
 */
function scientific(value: number, digits: number, trim: boolean): string {
  const [m = '', e = '0'] = value.toExponential(digits - 1).split('e');
  return `${signed(trim ? stripZeros(m) : m)}${UNIT_SPACE}×${UNIT_SPACE}10${toSuperscript(String(Number(e)))}`;
}

/** toPrecision/toFixed throw outside these ranges. */
function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
}

function significant(value: number, digits: number, trim: boolean): string {
  if (Math.abs(value) >= 10 ** digits) return groupedInteger(value);
  const text = value.toPrecision(digits);
  // Rounding can carry into exponent form (999.7 → '1.00e+3'); fall back to the integer.
  if (text.includes('e')) return groupedInteger(value);
  return signed(trim ? stripZeros(text) : text);
}

/**
 * General number display: `digits` significant figures (or fixed `decimals`), a true minus,
 * scientific notation below 0.001 and from a million up, and a narrow no-break space before
 * the unit. null and non-finite values give '—'.
 */
export function formatNumber(value: number | null | undefined, opts: NumberFormat = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  const { unit, trim = true } = opts;
  const digits = clampInt(opts.digits ?? 4, 1, 21);
  const decimals = opts.decimals === undefined ? undefined : clampInt(opts.decimals, 0, 20);
  const abs = Math.abs(value);
  let body: string;
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) body = scientific(value, digits, trim);
  else if (decimals !== undefined) body = signed(trim ? trimmedFixed(value, decimals) : stripNegativeZero(value.toFixed(decimals)));
  else body = significant(value, digits, trim);
  return withUnit(body, unit);
}

function stripNegativeZero(text: string): string {
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

/** Append a unit after a narrow no-break space (no-op for an empty unit). */
export function withUnit(text: string, unit: string | undefined): string {
  return unit ? `${text}${UNIT_SPACE}${unit}` : text;
}

/** '+3', '−2', '0'. */
export function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${MINUS}${-n}`;
  return '0';
}

/** [-3, 3, 5] → '−3, +3, +5' (order kept as given); [] → ''. */
export function formatOxidationStates(states: readonly number[]): string {
  return states.map(formatSigned).join(', ');
}

/** ('O', -2) → 'O²⁻', ('Na', 1) → 'Na⁺', ('Ar', 0) → 'Ar'. */
export function ionLabel(symbol: string, charge: number): string {
  if (!charge) return symbol;
  const magnitude = Math.abs(charge) === 1 ? '' : String(Math.abs(charge));
  return `${symbol}${toSuperscript(magnitude)}${charge > 0 ? '⁺' : '⁻'}`;
}

/**
 * Compact display for values spanning many orders of magnitude (crustal abundance):
 * plain from 0.01 up to 10 000 ('1400', '2.8', '0.015'), otherwise '1.23 × 10⁶'.
 */
export function formatCompact(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  const d = clampInt(digits, 1, 21);
  if (abs >= 1e4 || abs < 1e-2) return scientific(value, d, true);
  return significant(value, d, true);
}

/** Discovery year; null means known since antiquity. Negative years are BCE. */
export function formatYear(year: number | null | undefined): string {
  if (year === null || year === undefined || !Number.isFinite(year)) return 'Antiquity';
  return year < 0 ? `${Math.round(-year)} BCE` : String(Math.round(year));
}

/**
 * One value of a numeric property, as used in trend tooltips and min/max labels: three
 * significant figures with trailing zeros kept ('7.90 eV'), years as years, abundances compact.
 */
export function formatPropValue(prop: NumericProp, value: number | null | undefined, opts: { digits?: number; trim?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NO_VALUE;
  const unit = NUMERIC_PROP_BY_ID.get(prop)?.unit ?? '';
  const digits = opts.digits ?? 3;
  if (prop === 'discoveryYear') return formatYear(value);
  if (prop === 'abundanceCrust') return withUnit(formatCompact(value, digits), unit);
  return formatNumber(value, { digits, unit, trim: opts.trim ?? false });
}

/** 'siderophile' → 'Siderophile'. */
export function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}
