import { describe, expect, it } from 'vitest';
import { BY_Z, ELEMENTS } from '../src/data/elements';
import { symbolOf, z, zs } from '../src/data/symbols';
import { buildLayout } from '../src/layout/table';
import {
  differingSubshells,
  electronCount,
  formatConfiguration,
  madelungConfiguration,
  madelungExceptions,
  madelungOrder,
  parseConfiguration,
  periodOfSubshell,
  subshellForCell,
} from '../src/relations/madelung';
import { atomicNumberLayer, madelungLayer, pettiforLayer } from '../src/relations/sequences';
import {
  nearestNeighbours,
  neighbourPairs,
  SIMILARITY_FEATURES,
  similarityLayer,
  type SimilarityFeature,
} from '../src/relations/similarity';
import { blocksLayer, categoriesLayer, formatRanges, groupsLayer, periodsLayer } from '../src/relations/structural';
import { BLOCK_COLORS, CATEGORIES } from '../src/ui/palette';
import type {
  BuildContext,
  ElementData,
  Group3Convention,
  LayerBuilder,
  RelationEdges,
  RelationLayer,
  RelationSet,
  RelationSetChain,
} from '../src/types';

const CONVENTIONS: Group3Convention[] = ['Lu', 'La'];
const ALL_Z = Array.from({ length: 118 }, (_, i) => i + 1);
const MADELUNG_NAMES = '1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p'.split(' ');
const CAPACITY = { s: 2, p: 6, d: 10, f: 14 } as const;
/** Usual NIST ground states that break the Madelung rule, Z ≤ 103. */
const EXPECTED_EXCEPTIONS = zs(
  'Cr', 'Cu', 'Nb', 'Mo', 'Ru', 'Rh', 'Pd', 'Ag', 'La', 'Ce',
  'Gd', 'Pt', 'Au', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Cm', 'Lr',
);

const BUILDERS: Record<string, LayerBuilder> = {
  periods: periodsLayer,
  groups: groupsLayer,
  blocks: blocksLayer,
  categories: categoriesLayer,
  'atomic-number': atomicNumberLayer,
  madelung: madelungLayer,
  pettifor: pettiforLayer,
  similarity: similarityLayer,
};

function ctxFor(convention: Group3Convention): BuildContext {
  return { elements: ELEMENTS, byZ: BY_Z, layout: buildLayout(convention) };
}

function setsOf(layer: RelationLayer): RelationSet[] {
  return layer.items.filter((i): i is RelationSet => i.kind === 'set');
}

function edgesOf(layer: RelationLayer, id: string): RelationEdges {
  const item = layer.items.find((i) => i.id === id);
  if (item?.kind !== 'edges') throw new Error(`${layer.id} has no edges item ${id}`);
  return item;
}

function chainOf(layer: RelationLayer, id: string): RelationSetChain {
  const item = layer.items.find((i) => i.id === id);
  if (item?.kind !== 'setChain') throw new Error(`${layer.id} has no setChain item ${id}`);
  return item;
}

function concatSorted(lists: number[][]): number[] {
  return lists.flat().sort((a, b) => a - b);
}

// ---------------------------------------------------------------- Madelung helpers

describe('madelung helpers', () => {
  it('orders the 19 subshells by n + ℓ, then n, with capacities 2(2ℓ + 1) summing to 118', () => {
    expect(madelungOrder.map((s) => s.name)).toEqual(MADELUNG_NAMES);
    for (const s of madelungOrder) expect(s.capacity).toBe(CAPACITY[s.letter]);
    expect(madelungOrder.reduce((sum, s) => sum + s.capacity, 0)).toBe(118);
    for (let i = 1; i < madelungOrder.length; i++) {
      const a = madelungOrder[i - 1]!;
      const b = madelungOrder[i]!;
      expect(a.n + a.l < b.n + b.l || (a.n + a.l === b.n + b.l && a.n < b.n)).toBe(true);
    }
  });

  it('maps cells to subshells (ns, np, (n−1)d, (n−2)f) and back to periods', () => {
    expect(subshellForCell({ period: 1, block: 's' })).toBe('1s');
    expect(subshellForCell({ period: 4, block: 'd' })).toBe('3d');
    expect(subshellForCell({ period: 6, block: 'f' })).toBe('4f');
    expect(subshellForCell({ period: 7, block: 'p' })).toBe('7p');
    const period = (name: string) => periodOfSubshell(madelungOrder.find((s) => s.name === name)!);
    expect([period('4s'), period('3d'), period('4p'), period('4f'), period('5f')]).toEqual([4, 4, 4, 6, 7]);
  });

  it('predicts aufbau configurations', () => {
    expect(madelungConfiguration(1)).toEqual(new Map([['1s', 1]]));
    expect(madelungConfiguration(z('Fe'))).toEqual(parseConfiguration('[Ar] 3d6 4s2'));
    expect(madelungConfiguration(z('Cr'))).toEqual(parseConfiguration('[Ar] 3d4 4s2'));
    expect(madelungConfiguration(z('La'))).toEqual(parseConfiguration('[Xe] 4f1 6s2'));
    expect(madelungConfiguration(118)).toEqual(parseConfiguration('[Rn] 5f14 6d10 7s2 7p6'));
    for (const n of ALL_Z) expect(electronCount(madelungConfiguration(n))).toBe(n);
    expect(() => madelungConfiguration(0)).toThrow(RangeError);
    expect(() => madelungConfiguration(119)).toThrow(RangeError);
    expect(() => madelungConfiguration(2.5)).toThrow(RangeError);
  });

  it('parses noble-gas-core notation, bare subshells and superscripts', () => {
    expect([...parseConfiguration('[Ar] 3d5 4s1')]).toEqual([
      ['1s', 2], ['2s', 2], ['2p', 6], ['3s', 2], ['3p', 6], ['4s', 1], ['3d', 5],
    ]);
    expect(parseConfiguration('1s')).toEqual(new Map([['1s', 1]]));
    expect(parseConfiguration('[He] 2s')).toEqual(new Map([['1s', 2], ['2s', 1]]));
    expect(parseConfiguration('[Ar] 3d⁵ 4s¹')).toEqual(parseConfiguration('[Ar] 3d5 4s1'));
    expect(parseConfiguration('[Xe]4f14 5d10 6s2')).toEqual(parseConfiguration('[Xe] 4f14 5d10 6s2'));
    expect(parseConfiguration('  ')).toEqual(new Map());
  });

  it('expands each noble-gas core to that gas’s Madelung configuration', () => {
    for (const gas of ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn']) {
      expect(parseConfiguration(`[${gas}]`)).toEqual(madelungConfiguration(z(gas)));
    }
  });

  it('rejects malformed configurations', () => {
    for (const bad of ['[Zz] 1s2', '[Og] 8s1', '[Ar] 3d11', '2d1', '[Ar] 4s2 4s1', '[Ne] 2p1', '3x2', 'banana', '[Ar] 3d5,4s1']) {
      expect(() => parseConfiguration(bad), bad).toThrow();
    }
  });

  it('round-trips electron totals: every configuration in the dataset holds Z electrons', () => {
    const withConfig = ELEMENTS.filter((e) => e.config.trim() !== '');
    expect(withConfig.length).toBeGreaterThan(100);
    for (const e of withConfig) expect(electronCount(parseConfiguration(e.config)), e.symbol).toBe(e.z);
  });

  it('formats configurations and finds the subshells that differ', () => {
    expect(formatConfiguration(parseConfiguration('[Ar] 3d5 4s1'))).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵ 4s¹');
    const cr = parseConfiguration(BY_Z.get(z('Cr'))!.config);
    expect(differingSubshells(cr, madelungConfiguration(z('Cr')))).toEqual(['3d', '4s']);
    expect(differingSubshells(madelungConfiguration(26), madelungConfiguration(26))).toEqual([]);
  });

  it('finds the usual NIST exceptions up to Lr in the dataset', () => {
    const exceptions = madelungExceptions(ELEMENTS);
    expect(exceptions.filter((n) => n <= 103).map(symbolOf)).toEqual(EXPECTED_EXCEPTIONS.map(symbolOf));
    expect([...exceptions].sort((a, b) => a - b)).toEqual(exceptions);
  });

  it('skips elements without a configuration', () => {
    expect(madelungExceptions([{ z: 24, config: '' }, { z: 26, config: '[Ar] 3d6 4s2' }, { z: 29, config: '[Ar] 3d10 4s1' }])).toEqual([29]);
  });
});

describe('formatRanges', () => {
  it('collapses runs of three or more consecutive Z', () => {
    expect(formatRanges(zs('La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg'), symbolOf)).toBe('La, Hf–Hg');
    expect(formatRanges([2, 1], symbolOf)).toBe('H, He');
    expect(formatRanges([], symbolOf)).toBe('');
  });
});

// ---------------------------------------------------------------- layers, both conventions

describe.each(CONVENTIONS)('computed layers (%s convention)', (convention) => {
  const ctx = ctxFor(convention);
  const { layout } = ctx;
  const cell = (n: number) => layout.cells.get(n)!;

  it('keeps layer ids, sections, colours and styles', () => {
    const expected: Record<string, [RelationLayer['section'], string, RelationLayer['style']]> = {
      periods: ['Structure', '#3987e5', { hubDepth: 0.45 }],
      groups: ['Structure', '#1baf7a', { hubDepth: 0.4 }],
      blocks: ['Structure', '#c98500', { hubDepth: 0.5 }],
      categories: ['Structure', '#9085e9', { hubDepth: 0.5 }],
      'atomic-number': ['Sequences', '#cde2fb', { bow: 0.12, flow: true }],
      madelung: ['Sequences', '#eb6834', { flow: true, hubDepth: 0.55 }],
      pettifor: ['Sequences', '#d55181', { bow: 0.35, flow: true }],
      similarity: ['Data', '#b3bac8', { bow: 0.5 }],
    };
    for (const [id, build] of Object.entries(BUILDERS)) {
      const layer = build(ctx);
      const [section, color, style] = expected[id]!;
      expect(layer.id).toBe(id);
      expect(layer.section).toBe(section);
      expect(layer.color).toBe(color);
      expect(layer.style).toEqual(style);
      expect(layer.summary.length).toBeGreaterThan(0);
      expect(layer.description.length).toBeGreaterThan(80);
      expect(layer.sources.length).toBeGreaterThan(0);
      expect(!!layer.defaultOn).toBe(id === 'periods');
      const ids = layer.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('periods: seven sets of 2, 8, 8, 18, 18, 32, 32', () => {
    const sets = setsOf(periodsLayer(ctx));
    expect(sets.map((s) => s.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(sets.map((s) => s.members.length)).toEqual([2, 8, 8, 18, 18, 32, 32]);
    sets.forEach((s, i) => expect(s.members).toEqual(layout.membersOfPeriod(i + 1)));
    expect(sets[3]!.note).toContain('4s, 3d, 4p');
  });

  it('groups: 18 sets; group 1 has 7 with H, group 3 has 4, group 18 has 7', () => {
    const sets = setsOf(groupsLayer(ctx));
    expect(sets.map((s) => s.id)).toEqual(Array.from({ length: 18 }, (_, i) => `g${i + 1}`));
    expect(sets.map((s) => s.label)).toEqual(Array.from({ length: 18 }, (_, i) => `Group ${i + 1}`));
    const g = (n: number) => sets[n - 1]!.members;
    expect(g(1)).toEqual(zs('H', 'Li', 'Na', 'K', 'Rb', 'Cs', 'Fr'));
    expect(g(3)).toEqual(convention === 'Lu' ? zs('Sc', 'Y', 'Lu', 'Lr') : zs('Sc', 'Y', 'La', 'Ac'));
    expect(g(18)).toEqual(zs('He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og'));
    expect(concatSorted(sets.map((s) => s.members))).toHaveLength(118 - 28);
  });

  it('blocks: s 14, p 36, d 40, f 28, coloured by block, following the convention', () => {
    const sets = setsOf(blocksLayer(ctx));
    expect(sets.map((s) => s.id)).toEqual(['block-s', 'block-p', 'block-d', 'block-f']);
    expect(sets.map((s) => s.members.length)).toEqual([14, 36, 40, 28]);
    expect(sets.map((s) => s.color)).toEqual([BLOCK_COLORS.s, BLOCK_COLORS.p, BLOCK_COLORS.d, BLOCK_COLORS.f]);
    expect(concatSorted(sets.map((s) => s.members))).toEqual(ALL_Z);
    const f = sets[3]!.members;
    const d = sets[2]!.members;
    const [inF, inD] = convention === 'Lu' ? [['La', 'Ac'], ['Lu', 'Lr']] : [['Lu', 'Lr'], ['La', 'Ac']];
    for (const s of inF) expect(f).toContain(z(s));
    for (const s of inD) expect(d).toContain(z(s));
    expect(sets[0]!.members).toContain(z('He'));
  });

  it('categories: one set per class present, in palette order, partitioning all 118', () => {
    const sets = setsOf(categoriesLayer(ctx));
    const present = CATEGORIES.filter((c) => ELEMENTS.some((e) => e.category === c.id));
    expect(sets.map((s) => s.id)).toEqual(present.map((c) => `cat-${c.id}`));
    expect(sets.map((s) => s.label)).toEqual(present.map((c) => c.label));
    expect(sets.map((s) => s.color)).toEqual(present.map((c) => c.color));
    expect(concatSorted(sets.map((s) => s.members))).toEqual(ALL_Z);
    sets.forEach((s, i) => {
      for (const m of s.members) expect(BY_Z.get(m)!.category).toBe(present[i]!.id);
    });
  });

  it('atomic number: one directed path of 117 steps, Z → Z + 1', () => {
    const layer = atomicNumberLayer(ctx);
    expect(layer.items).toHaveLength(1);
    const path = edgesOf(layer, 'z-path');
    expect(path.directed).toBe(true);
    expect(path.edges).toHaveLength(117);
    path.edges.forEach((e, i) => {
      expect(e.a).toBe(i + 1);
      expect(e.b).toBe(i + 2);
    });
    expect(path.edges[0]!.label).toBe('H → He');
    const seamHops = path.edges.filter((e) => cell(e.a).period !== cell(e.b).period);
    expect(seamHops.map((e) => symbolOf(e.a))).toEqual(['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn']);
    for (const e of seamHops) {
      expect(cell(e.a).column).toBe(32);
      expect(cell(e.b).column).toBe(1);
    }
  });

  it('madelung chain: 19 subshell sets covering all 118 once, within capacity', () => {
    const layer = madelungLayer(ctx);
    const chain = chainOf(layer, 'madelung-order');
    expect(chain.sets.map((s) => s.label)).toEqual(MADELUNG_NAMES);
    expect(chain.sets.map((s) => s.id)).toEqual(MADELUNG_NAMES.map((n) => `sub-${n}`));
    expect(concatSorted(chain.sets.map((s) => s.members))).toEqual(ALL_Z);
    for (const s of chain.sets) {
      const letter = s.label.slice(-1) as keyof typeof CAPACITY;
      expect(s.members.length).toBeGreaterThan(0);
      expect(s.members.length).toBeLessThanOrEqual(CAPACITY[letter]);
      for (const m of s.members) expect(subshellForCell(cell(m))).toBe(s.label);
    }
    const members = (name: string) => chain.sets.find((s) => s.label === name)!.members;
    expect(members('1s')).toEqual(zs('H', 'He'));
    if (convention === 'Lu') {
      expect(members('4f')[0]).toBe(z('La'));
      expect(members('5d')[0]).toBe(z('Lu'));
      expect(members('6d')[0]).toBe(z('Lr'));
    } else {
      expect(members('4f')[0]).toBe(z('Ce'));
      expect(members('5d')[0]).toBe(z('La'));
      expect(members('6d')[0]).toBe(z('Ac'));
    }
  });

  it('madelung exceptions: an anchor-free set from the dataset, noting predictions past Lr', () => {
    const set = setsOf(madelungLayer(ctx)).find((s) => s.id === 'madelung-exceptions')!;
    expect(set.anchor).toBeUndefined();
    expect(set.members).toEqual(madelungExceptions(ELEMENTS));
    expect(set.members.filter((n) => n <= 103)).toEqual(EXPECTED_EXCEPTIONS);
    expect(set.note).toMatch(/Z > 103/);
    expect(set.note).toMatch(/predictions/);
    for (const m of set.members) expect(set.memberLabels?.[m]).toMatch(/, not /);
    expect(set.memberLabels?.[z('Cr')]).toBe('3d⁵ 4s¹, not 3d⁴ 4s²');
    expect(set.memberLabels?.[z('Lr')]).toBe('7p¹, not 6d¹');
  });

  it('pettifor: one directed path visiting each element on the scale once, in order', () => {
    const path = edgesOf(pettiforLayer(ctx), 'pettifor-path');
    const onScale = ELEMENTS.filter((e) => e.pettifor !== null);
    expect(path.directed).toBe(true);
    expect(path.edges).toHaveLength(onScale.length - 1);
    const visited = [path.edges[0]!.a, ...path.edges.map((e) => e.b)];
    path.edges.slice(1).forEach((e, i) => expect(e.a).toBe(path.edges[i]!.b));
    expect(new Set(visited).size).toBe(visited.length);
    expect([...visited].sort((a, b) => a - b)).toEqual(onScale.map((e) => e.z));
    const numbers = visited.map((n) => BY_Z.get(n)!.pettifor!);
    for (let i = 1; i < numbers.length; i++) expect(numbers[i]!).toBeGreaterThan(numbers[i - 1]!);
  });

  it('similarity: undirected, merged, self-loop-free edges between included elements, deterministic', () => {
    const layer = similarityLayer(ctx);
    const table = nearestNeighbours(ELEMENTS);
    const included = new Set(table.included);
    expect(layer.items.map((i) => i.id)).toEqual(['nn1', 'nn2', 'nn3']);
    for (const item of layer.items) {
      if (item.kind !== 'edges') throw new Error('expected edges');
      expect(item.directed).toBe(false);
      const keys = new Set<string>();
      for (const e of item.edges) {
        expect(e.a).not.toBe(e.b);
        expect(e.a).toBeLessThan(e.b);
        expect(included.has(e.a) && included.has(e.b)).toBe(true);
        expect(e.label).toMatch(/d = \d+\.\d\d$/);
        keys.add(`${e.a}-${e.b}`);
      }
      expect(keys.size).toBe(item.edges.length);
    }
    const nn1 = edgesOf(layer, 'nn1').edges;
    const touched = new Set(nn1.flatMap((e) => [e.a, e.b]));
    expect([...included].every((n) => touched.has(n))).toBe(true);
    expect(similarityLayer(ctx)).toEqual(layer);
    for (const f of SIMILARITY_FEATURES) expect(layer.description).toContain(f.label);
    expect(layer.description).toContain(`only the ${table.included.length} elements`);
    expect(layer.caveat).toMatch(/not chemical analogies/);
  });
});

describe('item ids are stable across conventions', () => {
  it.each(Object.keys(BUILDERS))('%s', (id) => {
    const ids = (convention: Group3Convention) =>
      BUILDERS[id]!(ctxFor(convention)).items.map((i) => (i.kind === 'setChain' ? [i.id, ...i.sets.map((s) => s.id)].join(' ') : i.id));
    expect(ids('Lu')).toEqual(ids('La'));
  });
});

// ---------------------------------------------------------------- similarity internals

function fake(zz: number, values: Partial<ElementData>): ElementData {
  return { ...ELEMENTS[0]!, z: zz, symbol: `X${zz}`, predicted: [], ...values };
}

describe('nearestNeighbours', () => {
  const TWO: SimilarityFeature[] = [{ field: 'en', label: 'en' }, { field: 'ie1', label: 'ie1' }];

  it('z-scores each feature over every element that has it, not just complete cases', () => {
    const table = nearestNeighbours(
      [fake(1, { en: 0, ie1: 1 }), fake(2, { en: 2, ie1: 1 }), fake(3, { en: 4, ie1: null })],
      1,
      TWO,
    );
    expect(table.included).toEqual([1, 2]);
    expect(table.excluded).toEqual([3]);
    // en: mean 2, population SD √(8/3); ie1 has no spread and contributes nothing.
    expect(table.neighbours.get(1)![0]!.distance).toBeCloseTo(2 / Math.sqrt(8 / 3), 12);
  });

  it('treats predicted values as missing', () => {
    const table = nearestNeighbours([fake(1, { en: 1, ie1: 1 }), fake(2, { en: 2, ie1: 2, predicted: ['ie1'] }), fake(3, { en: 3, ie1: 3 })], 1, TWO);
    expect(table.excluded).toEqual([2]);
  });

  it('breaks distance ties toward the lower Z and merges mutual pairs', () => {
    const table = nearestNeighbours(
      [fake(9, { en: 1, ie1: 0 }), fake(5, { en: 0, ie1: 0 }), fake(3, { en: -1, ie1: 0 })],
      2,
      TWO,
    );
    expect(table.neighbours.get(5)!.map((n) => n.z)).toEqual([3, 9]);
    // 5 picks 3 on the tie and 3 picks 5 (mutual); 9's nearest is 5, but 5's is not 9.
    const pairs = neighbourPairs(table, 1);
    expect(pairs.map((p) => [p.a, p.b, p.mutual, p.from])).toEqual([[3, 5, true, 3], [5, 9, false, 9]]);
  });
});
