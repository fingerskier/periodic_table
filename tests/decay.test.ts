import { describe, expect, it } from 'vitest';
import { BY_Z, ELEMENTS } from '../src/data/elements';
import { z } from '../src/data/symbols';
import { buildLayout } from '../src/layout/table';
import {
  ACTINIUM_SERIES,
  DECAY_SERIES,
  NEPTUNIUM_SERIES,
  THORIUM_SERIES,
  URANIUM_SERIES,
  decaySeriesLayer,
  nuclide,
  nuclideLabel,
  type DecaySeries,
  type DecayStep,
  type Nuclide,
  type NuclideName,
} from '../src/relations/decay';
import type { BuildContext, Group3Convention, RelationEdges, RelationLayer } from '../src/types';

const NOTE_LIMIT = 240;
const key = (n: Nuclide): string => `${n.z}/${n.a}${n.isomer ? 'm' : ''}`;

function ctxFor(convention: Group3Convention): BuildContext {
  return { elements: ELEMENTS, byZ: BY_Z, layout: buildLayout(convention) };
}

/** Every path from `start`, following the steps, as lists of nuclides. */
function paths(steps: readonly DecayStep[], start: Nuclide): Nuclide[][] {
  const out = steps.filter((s) => key(s.parent) === key(start));
  if (out.length === 0) return [[start]];
  return out.flatMap((s) => paths(steps, s.daughter).map((rest) => [start, ...rest]));
}

function stepsAlong(steps: readonly DecayStep[], path: readonly Nuclide[]): DecayStep[] {
  return path.slice(1).map((n, i) => {
    const s = steps.find((x) => key(x.parent) === key(path[i]!) && key(x.daughter) === key(n));
    if (!s) throw new Error(`No step into ${key(n)}`);
    return s;
  });
}

function edgeItems(layer: RelationLayer): RelationEdges[] {
  return layer.items.filter((i): i is RelationEdges => i.kind === 'edges');
}

/** Independent expectations: parent, stable end, A mod 4, and α / β⁻ counts on each path. */
const EXPECTED = {
  thorium: { start: 'Th-232', end: 'Pb-208', residue: 0, alphas: 6, betas: 4, color: '#e34948', steps: THORIUM_SERIES },
  neptunium: { start: 'Np-237', end: 'Tl-205', residue: 1, alphas: 8, betas: 4, color: '#9085e9', steps: NEPTUNIUM_SERIES },
  uranium: { start: 'U-238', end: 'Pb-206', residue: 2, alphas: 8, betas: 6, color: '#eda100', steps: URANIUM_SERIES },
  actinium: { start: 'U-235', end: 'Pb-207', residue: 3, alphas: 7, betas: 4, color: '#1baf7a', steps: ACTINIUM_SERIES },
} as const;

describe('nuclide helpers', () => {
  it('parses names and writes superscript labels', () => {
    expect(nuclide('U-238')).toEqual({ z: 92, a: 238 });
    expect(nuclide('Pa-234m')).toEqual({ z: 91, a: 234, isomer: true });
    expect(nuclideLabel(nuclide('U-238'))).toBe('²³⁸U');
    expect(nuclideLabel(nuclide('Pa-234m'))).toBe('²³⁴ᵐPa');
  });
});

describe('the four series are listed once each, in 4n + k order', () => {
  it('has thorium, neptunium, uranium, actinium with residues 0..3', () => {
    expect(DECAY_SERIES.map((s) => s.id)).toEqual(['thorium', 'neptunium', 'uranium', 'actinium']);
    expect(DECAY_SERIES.map((s) => s.residue)).toEqual([0, 1, 2, 3]);
  });
});

describe.each(DECAY_SERIES.map((s) => [s.id, s] as const))('%s series', (id, series: DecaySeries) => {
  const want = EXPECTED[id];
  const steps = series.steps;

  it('exports its step array and the expected start, end and colour', () => {
    expect(steps).toBe(want.steps);
    expect(series.start).toEqual(nuclide(want.start));
    expect(series.end).toEqual(nuclide(want.end));
    expect(series.residue).toBe(want.residue);
    expect(series.color).toBe(want.color);
  });

  it('alpha gives (Z − 2, A − 4) and beta− gives (Z + 1, A)', () => {
    for (const s of steps) {
      const expected = s.mode === 'alpha' ? { z: s.parent.z - 2, a: s.parent.a - 4 } : { z: s.parent.z + 1, a: s.parent.a };
      expect({ z: s.daughter.z, a: s.daughter.a }, `${key(s.parent)} ${s.mode}`).toEqual(expected);
    }
  });

  it('keeps every mass number at A mod 4 = the series residue', () => {
    for (const s of steps) {
      expect(s.parent.a % 4, key(s.parent)).toBe(want.residue);
      expect(s.daughter.a % 4, key(s.daughter)).toBe(want.residue);
    }
  });

  it('starts at its parent, which no step feeds', () => {
    expect(key(steps[0]!.parent)).toBe(key(series.start));
    expect(steps.some((s) => key(s.daughter) === key(series.start))).toBe(false);
  });

  it('ends every path at the stable end nuclide, with the same α and β⁻ counts', () => {
    const all = paths(steps, series.start);
    expect(all.length).toBeGreaterThan(0);
    for (const path of all) {
      expect(key(path[path.length - 1]!)).toBe(key(series.end));
      const along = stepsAlong(steps, path);
      expect(along.filter((s) => s.mode === 'alpha')).toHaveLength(want.alphas);
      expect(along.filter((s) => s.mode === 'beta-')).toHaveLength(want.betas);
    }
    expect(steps.some((s) => key(s.parent) === key(series.end))).toBe(false);
  });

  it('reaches every listed step from the start, with no duplicates', () => {
    const used = new Set(paths(steps, series.start).flatMap((p) => stepsAlong(steps, p)));
    expect(used.size).toBe(steps.length);
    const ids = steps.map((s) => `${key(s.parent)} ${s.mode}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists only branches of at least 1%, summing to ~100% per parent', () => {
    const byParent = new Map<string, number>();
    for (const s of steps) {
      expect(s.branchPercent, key(s.parent)).toBeGreaterThanOrEqual(1);
      expect(s.branchPercent, key(s.parent)).toBeLessThanOrEqual(100);
      byParent.set(key(s.parent), (byParent.get(key(s.parent)) ?? 0) + s.branchPercent);
    }
    for (const [parent, sum] of byParent) {
      // Omitted branches are each under 1%; here they never total more than 1% either.
      expect(sum, parent).toBeGreaterThan(99);
      expect(sum, parent).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('gives each parent one well-formed half-life string', () => {
    const halfLife = /^\d+(\.\d+)?( × 10[⁰¹²³⁴⁵⁶⁷⁸⁹]+)? (Gyr|Myr|kyr|yr|d|h|min|s|ms|µs|ns)$/u;
    const byParent = new Map<string, Set<string>>();
    for (const s of steps) {
      expect(s.halfLife, key(s.parent)).toMatch(halfLife);
      byParent.set(key(s.parent), (byParent.get(key(s.parent)) ?? new Set()).add(s.halfLife));
    }
    for (const [parent, values] of byParent) expect(values.size, parent).toBe(1);
  });
});

describe('literature values (NUBASE2020)', () => {
  const find = (steps: readonly DecayStep[], parent: NuclideName, mode: DecayStep['mode']) =>
    steps.find((s) => key(s.parent) === key(nuclide(parent)) && s.mode === mode);

  it('carries the main branch points', () => {
    expect(find(THORIUM_SERIES, 'Bi-212', 'beta-')?.branchPercent).toBe(64.06);
    expect(find(THORIUM_SERIES, 'Bi-212', 'alpha')?.branchPercent).toBe(35.94);
    expect(find(NEPTUNIUM_SERIES, 'Bi-213', 'beta-')?.branchPercent).toBe(97.91);
    expect(find(NEPTUNIUM_SERIES, 'Bi-213', 'alpha')?.branchPercent).toBe(2.09);
    expect(find(ACTINIUM_SERIES, 'Ac-227', 'beta-')?.branchPercent).toBe(98.62);
    expect(find(ACTINIUM_SERIES, 'Ac-227', 'alpha')?.branchPercent).toBe(1.38);
  });

  it('skips sub-1% branches such as ²¹¹Bi β⁻ and ²¹⁴Bi α', () => {
    expect(find(ACTINIUM_SERIES, 'Bi-211', 'alpha')?.branchPercent).toBe(99.724);
    expect(find(ACTINIUM_SERIES, 'Bi-211', 'beta-')).toBeUndefined();
    expect(find(URANIUM_SERIES, 'Bi-214', 'alpha')).toBeUndefined();
  });

  it('routes ²³⁴Th through the isomer ²³⁴ᵐPa', () => {
    expect(find(URANIUM_SERIES, 'Th-234', 'beta-')?.daughter).toEqual(nuclide('Pa-234m'));
    expect(find(URANIUM_SERIES, 'Pa-234m', 'beta-')?.branchPercent).toBe(99.84);
  });

  it("ends the neptunium series with ²⁰⁹Bi's slow α decay to ²⁰⁵Tl", () => {
    const bi = find(NEPTUNIUM_SERIES, 'Bi-209', 'alpha');
    expect(bi?.daughter).toEqual(nuclide('Tl-205'));
    expect(bi?.halfLife).toBe('2.01 × 10¹⁹ yr');
  });
});

describe.each<Group3Convention>(['Lu', 'La'])('decay layer (%s convention)', (convention) => {
  const layer = decaySeriesLayer(ctxFor(convention));
  const items = edgeItems(layer);

  it('has the agreed id, section, colour and style', () => {
    expect(layer.id).toBe('decay');
    expect(layer.section).toBe('Sequences');
    expect(layer.color).toBe('#eda100');
    expect(layer.style).toEqual({ flow: true, bow: 0.5, bowSpread: 0.1 });
    expect(layer.description).toMatch(/1%/);
    expect(layer.description).toMatch(/skipped/);
  });

  it('has one directed edges item per series, in its colour', () => {
    expect(layer.items).toHaveLength(4);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.id)).toEqual(['thorium-series', 'neptunium-series', 'uranium-series', 'actinium-series']);
    expect(items.map((i) => i.color)).toEqual(['#e34948', '#9085e9', '#eda100', '#1baf7a']);
    for (const item of items) expect(item.directed).toBe(true);
  });

  it('references only valid, distinct elements on every edge', () => {
    for (const item of items) {
      for (const e of item.edges) {
        for (const n of [e.a, e.b]) {
          expect(Number.isInteger(n) && n >= 1 && n <= 118, `${item.id} ${n}`).toBe(true);
          expect(BY_Z.has(n), `${item.id} ${n}`).toBe(true);
        }
        expect(e.a).not.toBe(e.b);
      }
    }
  });

  it('merges steps into one edge per (parent element, daughter element) pair', () => {
    for (const [i, series] of DECAY_SERIES.entries()) {
      const item = items[i]!;
      const pairs = [...new Set(series.steps.map((s) => `${s.parent.z}>${s.daughter.z}`))];
      expect(item.edges.map((e) => `${e.a}>${e.b}`)).toEqual(pairs);
      for (const s of series.steps) {
        const edge = item.edges.find((e) => e.a === s.parent.z && e.b === s.daughter.z);
        expect(edge?.label, `${item.id} ${key(s.parent)}`).toContain(`${nuclideLabel(s.parent)} →`);
        expect(edge?.label).toContain(`${nuclideLabel(s.daughter)} (${s.halfLife}`);
      }
    }
  });

  it('labels transitions with superscript mass numbers, mode and half-life', () => {
    const uranium = items[2]!;
    const uToTh = uranium.edges.find((e) => e.a === z('U') && e.b === z('Th'));
    expect(uToTh?.label).toBe('²³⁸U →α ²³⁴Th (4.46 Gyr); ²³⁴U →α ²³⁰Th (246 kyr)');
    const thorium = items[0]!;
    const biToPo = thorium.edges.find((e) => e.a === z('Bi') && e.b === z('Po'));
    expect(biToPo?.label).toBe('²¹²Bi →β⁻ ²¹²Po (60.6 min, 64.06%)');
    expect(biToPo?.note).toContain('rejoin at ²⁰⁸Pb');
    const neptunium = items[1]!;
    const biToTl = neptunium.edges.find((e) => e.a === z('Bi') && e.b === z('Tl'));
    expect(biToTl?.label).toBe('²¹³Bi →α ²⁰⁹Tl (45.6 min, 2.09%); ²⁰⁹Bi →α ²⁰⁵Tl (2.01 × 10¹⁹ yr)');
    expect(biToTl?.note).toContain('de Marcillac');
    const paToU = uranium.edges.find((e) => e.a === z('Pa') && e.b === z('U'));
    expect(paToU?.label).toBe('²³⁴ᵐPa →β⁻ ²³⁴U (1.16 min, 99.84%)');
  });

  it('explains why ²³⁸U shows 4.46 Gyr rather than the older 4.468 Gyr, with both sources cited', () => {
    const uToTh = items[2]!.edges.find((e) => e.a === z('U') && e.b === z('Th'));
    expect(uToTh?.note).toContain('NUBASE2020 gives ²³⁸U 4.463(3) Gyr');
    expect(uToTh?.note).toContain('4.468 Gyr (Jaffey et al. 1971)');
    for (const doi of ['10.1088/1674-1137/41/3/030001', '10.1103/PhysRevC.4.1889']) {
      expect(layer.sources.some((s) => s.url === `https://doi.org/${doi}`), doi).toBe(true);
    }
  });

  it('notes start, end and the 4n + k rule for each series, within the length limit', () => {
    for (const [i, series] of DECAY_SERIES.entries()) {
      const note = items[i]!.note ?? '';
      const want = EXPECTED[series.id];
      expect(note).toContain(nuclideLabel(series.start));
      expect(note).toContain(`stable ${nuclideLabel(series.end)}`);
      expect(note).toContain(`${want.alphas} α and ${want.betas} β⁻`);
      expect(note).toContain(want.residue === 0 ? 'is 4n.' : `is 4n + ${want.residue}.`);
    }
    expect(items[1]!.note).toMatch(/extinct in nature apart from traces/i);
    const notes = items.flatMap((i) => [i.note, ...i.edges.map((e) => e.note)]).filter((n): n is string => !!n);
    for (const n of notes) expect(n.length, n).toBeLessThanOrEqual(NOTE_LIMIT);
  });

  it('cites its sources', () => {
    expect(layer.sources.length).toBeGreaterThanOrEqual(4);
    for (const s of layer.sources) {
      expect(s.label.length).toBeGreaterThan(10);
      if (s.url) expect(s.url).toMatch(/^https:\/\//);
    }
    expect(layer.sources.some((s) => s.url === 'https://doi.org/10.1088/1674-1137/abddae')).toBe(true);
    const urls = layer.sources.flatMap((s) => (s.url ? [s.url] : []));
    expect(new Set(urls).size).toBe(urls.length);
  });
});
