import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../src/data/elements';
import type { ElementData, LegendFocus, NumericProp } from '../src/types';
import { UNIT_SPACE } from '../src/ui/format';
import {
  focusFitsMode,
  formatLegendValue,
  legendKeys,
  legendTitle,
  missingLabel,
  numericDomain,
  rampBins,
  rangeLabel,
  sameLegendFocus,
  type NumericDomain,
  type RampBin,
} from '../src/ui/legend';
import { BLOCK_COLORS, CATEGORIES, NUMERIC_PROPS, PHASE_COLORS, rampColor, SEQUENTIAL_RAMP } from '../src/ui/palette';

/** Rows carrying only one property, for domain tests independent of the dataset. */
const rows = (values: readonly (number | null)[], prop: NumericProp = 'density') =>
  values.map((v, i) => ({ z: i + 1, [prop]: v }) as unknown as ElementData);

const domain = (min: number, max: number, log = false): NumericDomain => ({ min, max, log, count: 2, missing: 0 });

/** Position on the colour scale as the scene computes it (linear in log10 for log scales). */
function tOf(v: number, d: NumericDomain): number {
  const [x, a, b] = d.log ? [Math.log10(v), Math.log10(d.min), Math.log10(d.max)] : [v, d.min, d.max];
  return (x - a) / (b - a);
}

function expectContiguous(bins: readonly RampBin[], d: NumericDomain): void {
  expect(bins[0]!.lo).toBe(d.min);
  expect(bins.at(-1)!.hi).toBe(d.max);
  bins.forEach((bin, i) => {
    expect(bin.index).toBe(i);
    expect(bin.hi).toBeGreaterThan(bin.lo);
    if (i > 0) expect(bin.lo).toBe(bins[i - 1]!.hi);
  });
}

describe('numericDomain', () => {
  it('ignores missing and non-finite values', () => {
    expect(numericDomain(rows([null, 3, 1, null, 7]), 'density')).toEqual({ min: 1, max: 7, log: false, count: 3, missing: 2 });
    expect(numericDomain(rows([Number.NaN, Infinity, 2, 5]), 'density')).toMatchObject({ min: 2, max: 5, count: 2, missing: 2 });
  });

  it('drops non-positive values on a log scale only', () => {
    const values = [0, -2, 0.01, 100, null];
    expect(numericDomain(rows(values), 'density', true)).toEqual({ min: 0.01, max: 100, log: true, count: 2, missing: 3 });
    expect(numericDomain(rows(values), 'density', false)).toMatchObject({ min: -2, max: 100, count: 4, missing: 1 });
  });

  it('is null when no element has a usable value', () => {
    expect(numericDomain(rows([null, null]), 'density')).toBeNull();
    expect(numericDomain(rows([0, -1]), 'density', true)).toBeNull();
    expect(numericDomain([], 'density')).toBeNull();
  });

  it('accounts for every element of the dataset', () => {
    for (const p of NUMERIC_PROPS) {
      const d = numericDomain(ELEMENTS, p.id, !!p.log);
      expect(d, p.id).not.toBeNull();
      expect(d!.count + d!.missing).toBe(ELEMENTS.length);
      expect(d!.max).toBeGreaterThanOrEqual(d!.min);
      if (p.log) expect(d!.min).toBeGreaterThan(0);
    }
  });
});

describe('rampBins', () => {
  it('has one contiguous bin per ramp step, in ramp colours', () => {
    const d = domain(3.9, 24.6);
    const bins = rampBins(d);
    expect(bins).toHaveLength(SEQUENTIAL_RAMP.length);
    expect(bins.map((b) => b.color)).toEqual([...SEQUENTIAL_RAMP]);
    expectContiguous(bins, d);
  });

  it('gives the end bins half the length of the others, summing to the whole ramp', () => {
    const bins = rampBins(domain(0, 12));
    const total = bins.reduce((s, b) => s + b.share, 0);
    expect(total).toBeCloseTo(1, 12);
    const inner = 1 / (bins.length - 1);
    expect(bins[0]!.share).toBeCloseTo(inner / 2, 12);
    expect(bins.at(-1)!.share).toBeCloseTo(inner / 2, 12);
    for (const b of bins.slice(1, -1)) expect(b.share).toBeCloseTo(inner, 12);
    // Linear scale over 0..12 with 13 steps: step i is centred on i.
    bins.slice(1, -1).forEach((b) => expect((b.lo + b.hi) / 2).toBeCloseTo(b.index, 9));
  });

  it('spaces edges evenly in log10 on a log scale', () => {
    const d = domain(0.01, 100, true);
    const bins = rampBins(d);
    expectContiguous(bins, d);
    const steps = bins.slice(1, -1).map((b) => Math.log10(b.hi) - Math.log10(b.lo));
    for (const s of steps) expect(s).toBeCloseTo(4 / (bins.length - 1), 9);
    // The middle step is centred on the geometric mean, 10^0.
    const mid = bins[(bins.length - 1) / 2]!;
    expect(Math.sqrt(mid.lo * mid.hi)).toBeCloseTo(1, 9);
  });

  it('agrees with the tile colouring: a value falls in the bin of its own colour', () => {
    for (const d of [domain(-19.7, 3.6), domain(8.2e-5, 40.7, true), domain(1669, 2015)]) {
      const bins = rampBins(d);
      for (let k = 0; k <= 97; k++) {
        const t = k / 97;
        const inner = d.log ? 10 ** (Math.log10(d.min) + t * (Math.log10(d.max) - Math.log10(d.min))) : d.min + t * (d.max - d.min);
        const v = k === 0 ? d.min : k === 97 ? d.max : inner;
        const bin = bins.find((b) => v >= b.lo && v <= b.hi);
        expect(bin, `value ${v}`).toBeDefined();
        expect(bin!.color).toBe(rampColor(tOf(v, d)));
      }
    }
  });

  it('keeps edges monotonic for every property of the dataset', () => {
    for (const p of NUMERIC_PROPS) {
      const d = numericDomain(ELEMENTS, p.id, !!p.log)!;
      if (d.max > d.min) expectContiguous(rampBins(d), d);
    }
  });

  it('honours a custom step count', () => {
    const d = domain(0, 1);
    const bins = rampBins(d, 5);
    expect(bins).toHaveLength(5);
    expectContiguous(bins, d);
    expect(bins.map((b) => b.color)).toEqual([0, 1, 2, 3, 4].map((i) => rampColor(i / 4)));
  });

  it('collapses a single-valued domain into one middle-colour bin', () => {
    expect(rampBins(domain(5, 5))).toEqual([{ index: 0, lo: 5, hi: 5, color: rampColor(0.5), share: 1 }]);
    expect(rampBins(domain(0, 1), 1)).toHaveLength(1);
    expect(rampBins(domain(0, 1), 0)).toEqual([]);
  });
});

describe('legend focus', () => {
  const cat: LegendFocus = { kind: 'category', id: 'noble-gas' };
  const range: LegendFocus = { kind: 'range', prop: 'en', lo: 1, hi: 2 };

  it('compares foci by value', () => {
    expect(sameLegendFocus(null, null)).toBe(true);
    expect(sameLegendFocus(cat, null)).toBe(false);
    expect(sameLegendFocus(cat, { kind: 'category', id: 'noble-gas' })).toBe(true);
    expect(sameLegendFocus(cat, { kind: 'category', id: 'metalloid' })).toBe(false);
    expect(sameLegendFocus({ kind: 'block', id: 's' }, { kind: 'phase', id: 'solid' })).toBe(false);
    expect(sameLegendFocus(range, { kind: 'range', prop: 'en', lo: 1, hi: 2 })).toBe(true);
    expect(sameLegendFocus(range, { kind: 'range', prop: 'en', lo: 1, hi: 2.5 })).toBe(false);
    expect(sameLegendFocus(range, { kind: 'range', prop: 'ie1', lo: 1, hi: 2 })).toBe(false);
  });

  it('knows which colour mode a focus belongs to', () => {
    expect(focusFitsMode(cat, 'category')).toBe(true);
    expect(focusFitsMode(cat, 'block')).toBe(false);
    expect(focusFitsMode({ kind: 'phase', id: 'unknown' }, 'phase')).toBe(true);
    expect(focusFitsMode(range, 'en')).toBe(true);
    expect(focusFitsMode(range, 'density')).toBe(false);
    expect(focusFitsMode(range, 'category')).toBe(false);
  });
});

describe('legend keys and labels', () => {
  it('lists the nine categories in palette order', () => {
    const keys = legendKeys('category');
    expect(keys.map((k) => k.label)).toEqual(CATEGORIES.map((c) => c.label));
    expect(keys.map((k) => k.color)).toEqual(CATEGORIES.map((c) => c.color));
    expect(keys.map((k) => k.focus)).toEqual(CATEGORIES.map((c) => ({ kind: 'category', id: c.id })));
  });

  it('lists blocks s, p, d, f and phases solid, liquid, gas, unknown', () => {
    expect(legendKeys('block').map((k) => [k.label, k.color])).toEqual([
      ['s-block', BLOCK_COLORS.s], ['p-block', BLOCK_COLORS.p], ['d-block', BLOCK_COLORS.d], ['f-block', BLOCK_COLORS.f],
    ]);
    expect(legendKeys('phase').map((k) => k.focus)).toEqual(
      (['solid', 'liquid', 'gas', 'unknown'] as const).map((id) => ({ kind: 'phase', id })),
    );
    expect(legendKeys('phase').map((k) => k.color)).toEqual([PHASE_COLORS.solid, PHASE_COLORS.liquid, PHASE_COLORS.gas, PHASE_COLORS.unknown]);
  });

  it('titles each mode', () => {
    expect(legendTitle('category')).toBe('Category');
    expect(legendTitle('phase')).toBe('Phase at 25 °C');
    expect(legendTitle('density')).toBe('Density');
  });

  it('formats ramp values compactly, with the unit only on ranges', () => {
    expect(formatLegendValue('discoveryYear', 1669.4)).toBe('1669');
    expect(formatLegendValue('density', 8.2e-5)).toMatch(/^8\.2\D+10⁻⁵$/);
    expect(formatLegendValue('ea', -1.5)).toBe('−1.5');
    expect(rangeLabel('ie1', 3.9, 5.41)).toBe(`3.9 – 5.41${UNIT_SPACE}eV`);
    expect(rangeLabel('discoveryYear', 1700, 1750, ' to ')).toBe('1700 to 1750');
  });

  it('names the no-value swatch', () => {
    expect(missingLabel('discoveryYear')).toBe('Known since antiquity');
    expect(missingLabel('mp')).toBe('No data');
  });
});
