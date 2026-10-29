import { describe, expect, it } from 'vitest';
import { BY_Z, ELEMENTS } from '../src/data/elements';
import { z } from '../src/data/symbols';
import { buildLayout } from '../src/layout/table';
import { diagonalLayer, knightsMoveLayer, lanthanideTwinsLayer, nPlus10Layer } from '../src/relations/chemistry';
import { dobereinerLayer, mendeleevPredictionsLayer } from '../src/relations/history';
import { ionLabel, isoelectronicLayer } from '../src/relations/isoelectronic';
import type {
  BuildContext,
  Cell,
  ElementData,
  Group3Convention,
  Layout,
  LayerBuilder,
  RelationEdge,
  RelationLayer,
  RelationSet,
} from '../src/types';

const BUILDERS: Readonly<Record<string, LayerBuilder>> = {
  diagonal: diagonalLayer,
  'n-plus-10': nPlus10Layer,
  'knights-move': knightsMoveLayer,
  'lanthanide-twins': lanthanideTwinsLayer,
  isoelectronic: isoelectronicLayer,
  dobereiner: dobereinerLayer,
  mendeleev: mendeleevPredictionsLayer,
};

const COLORS: Readonly<Record<string, string>> = {
  diagonal: '#eda100',
  'n-plus-10': '#e87ba4',
  'knights-move': '#9085e9',
  'lanthanide-twins': '#6da7ec',
  isoelectronic: '#e66767',
  dobereiner: '#c98500',
  mendeleev: '#86b6ef',
};

const NOTE_LIMIT = 240;

function contextFor(convention: Group3Convention): BuildContext {
  return { elements: ELEMENTS, byZ: BY_Z, layout: buildLayout(convention) };
}

/** A context whose element `atomicNumber` has some fields replaced, to prove notes read ctx. */
function patchedContext(atomicNumber: number, patch: Partial<ElementData>): BuildContext {
  const byZ = new Map(BY_Z);
  byZ.set(atomicNumber, { ...BY_Z.get(atomicNumber)!, ...patch });
  return { elements: ELEMENTS.map((e) => byZ.get(e.z)!), byZ, layout: buildLayout('Lu') };
}

function edgesOf(layer: RelationLayer): RelationEdge[] {
  return layer.items.flatMap((item) => (item.kind === 'edges' ? item.edges : []));
}

function setsOf(layer: RelationLayer): RelationSet[] {
  return layer.items.filter((item): item is RelationSet => item.kind === 'set');
}

function referencedZs(layer: RelationLayer): number[] {
  return layer.items.flatMap((item) => {
    if (item.kind === 'edges') return item.edges.flatMap((e) => [e.a, e.b]);
    if (item.kind === 'setChain') return item.sets.flatMap((s) => s.members);
    const labelled = Object.keys(item.memberLabels ?? {}).map(Number);
    return [...item.members, ...labelled, ...(item.anchor === undefined ? [] : [item.anchor])];
  });
}

function notesOf(layer: RelationLayer): string[] {
  const notes: (string | undefined)[] = [];
  for (const item of layer.items) {
    notes.push(item.note);
    if (item.kind === 'edges') notes.push(...item.edges.map((e) => e.note));
    if (item.kind === 'setChain') notes.push(...item.sets.map((s) => s.note));
  }
  return notes.filter((n): n is string => n !== undefined);
}

function cellOf(layout: Layout, atomicNumber: number): Cell {
  const c = layout.cells.get(atomicNumber);
  if (!c) throw new Error(`No cell for Z = ${atomicNumber}`);
  return c;
}

function groupOf(layout: Layout, atomicNumber: number): number {
  const g = cellOf(layout, atomicNumber).group;
  if (g === null) throw new Error(`Z = ${atomicNumber} is in an f-block column`);
  return g;
}

function groupsInPeriod(layout: Layout, period: number): number[] {
  const groups = layout.membersOfPeriod(period).map((n) => cellOf(layout, n).group);
  return [...new Set(groups.filter((g): g is number => g !== null))].sort((a, b) => a - b);
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/** Parse ion notation such as 'N³⁻', 'Na⁺' or 'Ne' independently of the module under test. */
function parseIon(label: string): { symbol: string; charge: number } {
  const m = /^([A-Z][a-z]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻]?)$/u.exec(label);
  if (!m) throw new Error(`Not ion notation: ${label}`);
  const symbol = m[1] ?? '';
  const digits = m[2] ?? '';
  const sign = m[3] ?? '';
  if (sign === '') {
    if (digits !== '') throw new Error(`Charge digits without a sign: ${label}`);
    return { symbol, charge: 0 };
  }
  const size = digits === '' ? 1 : Number([...digits].map((d) => SUPERSCRIPT[d]).join(''));
  return { symbol, charge: sign === '⁺' ? size : -size };
}

describe.each<Group3Convention>(['Lu', 'La'])('literature relation layers (%s convention)', (convention) => {
  const ctx = contextFor(convention);
  const L = ctx.layout;
  const layers = Object.fromEntries(Object.entries(BUILDERS).map(([id, build]) => [id, build(ctx)])) as Record<
    string,
    RelationLayer
  >;
  const layer = (id: string): RelationLayer => layers[id]!;

  it('keeps the contract ids, colours and sections', () => {
    for (const [id, built] of Object.entries(layers)) {
      expect(built.id).toBe(id);
      expect(built.color).toBe(COLORS[id]);
      expect(built.section).toBe(id === 'dobereiner' || id === 'mendeleev' ? 'History' : 'Chemistry');
      expect(built.items.length).toBeGreaterThan(0);
    }
  });

  it('references only atomic numbers that exist in the dataset and the layout', () => {
    for (const built of Object.values(layers)) {
      for (const n of referencedZs(built)) {
        expect(BY_Z.has(n), `${built.id}: Z = ${n}`).toBe(true);
        expect(L.cells.has(n), `${built.id}: Z = ${n}`).toBe(true);
      }
    }
  });

  it('gives every item a unique id and every edge two distinct ends', () => {
    for (const built of Object.values(layers)) {
      const ids = built.items.map((i) => i.id);
      expect(new Set(ids).size, built.id).toBe(ids.length);
      for (const e of edgesOf(built)) expect(e.a, built.id).not.toBe(e.b);
      const pairs = edgesOf(built).map((e) => [e.a, e.b].sort((a, b) => a - b).join('-'));
      expect(new Set(pairs).size, built.id).toBe(pairs.length);
    }
  });

  it('keeps notes short and cites sources for every layer', () => {
    for (const built of Object.values(layers)) {
      for (const note of notesOf(built)) expect(note.length, `${built.id}: ${note}`).toBeLessThanOrEqual(NOTE_LIMIT);
      expect(built.sources.length, built.id).toBeGreaterThan(0);
      for (const src of built.sources) {
        expect(src.label.trim(), built.id).not.toBe('');
        if (src.url !== undefined) expect(src.url, built.id).toMatch(/^https:\/\//);
      }
      expect(built.description.length, built.id).toBeGreaterThan(80);
      expect(built.summary.length, built.id).toBeGreaterThan(20);
    }
  });

  it('cites the primary literature for each relation', () => {
    const urls = (id: string) => layer(id).sources.map((s) => s.url ?? '');
    expect(urls('n-plus-10')).toContain('https://doi.org/10.1007/s10698-012-9169-6');
    expect(urls('knights-move')).toContain('https://doi.org/10.1007/s10698-007-9034-1');
    expect(urls('knights-move')).toContain('https://doi.org/10.48141/sbjchem.v1.n1.1993.38_1993.pdf');
    expect(urls('dobereiner')).toContain('https://doi.org/10.1002/andp.18290910217');
    expect(layer('mendeleev').sources.some((s) => s.label.includes('Supplementband 8 (1871)'))).toBe(true);
  });

  it('draws diagonal pairs one period down and one group right (periods 2-3 have no d-block)', () => {
    const edges = edgesOf(layer('diagonal'));
    expect(edges.map((e) => [e.a, e.b])).toEqual([
      [z('Li'), z('Mg')],
      [z('Be'), z('Al')],
      [z('B'), z('Si')],
    ]);
    for (const e of edges) {
      const [a, b] = [cellOf(L, e.a), cellOf(L, e.b)];
      expect(b.period).toBe(a.period + 1);
      const nextGroupRight = groupsInPeriod(L, b.period).find((g) => g > groupOf(L, e.a));
      expect(b.group).toBe(nextGroupRight);
    }
  });

  it("draws knight's-move pairs one period down and two groups right", () => {
    const edges = edgesOf(layer('knights-move'));
    expect(edges).toHaveLength(6);
    for (const e of edges) {
      expect(cellOf(L, e.b).period).toBe(cellOf(L, e.a).period + 1);
      expect(groupOf(L, e.b)).toBe(groupOf(L, e.a) + 2);
    }
  });

  it("gives each knight's-move pair the lower element's inert-pair state, two below its group valence", () => {
    for (const e of edgesOf(layer('knights-move'))) {
      const state = Number(/\(\+(\d)\)$/u.exec(e.label ?? '')?.[1]);
      // The lower element is in the p-block, where the group valence is group − 10.
      expect(state, e.label).toBe(groupOf(L, e.b) - 10 - 2);
      expect(e.note, e.label).toMatch(new RegExp(`^Shared \\+${state} state: `));
    }
  });

  it('pairs group n with group n + 10 and names the true groups', () => {
    const edges = edgesOf(layer('n-plus-10'));
    expect(edges.length).toBeGreaterThanOrEqual(6);
    for (const e of edges) {
      expect(groupOf(L, e.b) - groupOf(L, e.a)).toBe(10);
      expect(e.label).toContain(`(groups ${groupOf(L, e.a)}, ${groupOf(L, e.b)})`);
    }
  });

  it('backs the diagonal "about half" charge-to-radius claim with the radii it quotes', () => {
    const m = /\((\d+) and (\d+) pm\) Li⁺ has about half the charge-to-radius ratio of Mg²⁺/u.exec(
      layer('diagonal').description,
    );
    expect(m).not.toBeNull();
    const ratio = 1 / Number(m![1]) / (2 / Number(m![2]));
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('pairs each lanthanide-contraction twin as 4d over 5d in one group, quoting dataset radii', () => {
    const edges = edgesOf(layer('lanthanide-twins'));
    expect(edges.map((e) => [e.a, e.b])).toEqual([
      [z('Zr'), z('Hf')],
      [z('Nb'), z('Ta')],
      [z('Mo'), z('W')],
    ]);
    for (const e of edges) {
      const [a, b] = [cellOf(L, e.a), cellOf(L, e.b)];
      expect([a.period, b.period, a.block, b.block]).toEqual([5, 6, 'd', 'd']);
      expect(a.group).toBe(b.group);
      for (const n of [e.a, e.b]) {
        const el = BY_Z.get(n)!;
        expect(e.note).toContain(`${el.symbol} ${Math.round(el.covalentRadius!)}`);
      }
    }
  });

  it('builds one isoelectronic set per noble gas whose ion labels carry its electron count', () => {
    const sets = setsOf(layer('isoelectronic'));
    expect(sets.map((s) => s.anchor)).toEqual(['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn'].map((s) => z(s)));
    for (const set of sets) {
      const anchor = set.anchor!;
      expect(BY_Z.get(anchor)!.category).toBe('noble-gas');
      expect(set.members).toContain(anchor);
      expect(set.members.length).toBeGreaterThanOrEqual(4);
      expect(Object.keys(set.memberLabels ?? {}).map(Number).sort((a, b) => a - b)).toEqual(
        [...set.members].sort((a, b) => a - b),
      );
      let anions = 0;
      let cations = 0;
      for (const member of set.members) {
        const label = set.memberLabels![member]!;
        const { symbol, charge } = parseIon(label);
        expect(symbol).toBe(BY_Z.get(member)!.symbol);
        expect(member - charge, label).toBe(anchor);
        if (charge < 0) anions++;
        if (charge > 0) cations++;
      }
      expect(cations, set.id).toBeGreaterThan(0);
      if (anchor !== z('Rn')) expect(anions, set.id).toBeGreaterThan(0);
      expect(set.note).toMatch(new RegExp(`^${anchor} electrons\\.`));
    }
  });

  it('straddles the seam as the isoelectronic description says', () => {
    for (const set of setsOf(layer('isoelectronic'))) {
      const gas = cellOf(L, set.anchor!);
      expect(gas.column, set.id).toBe(32);
      for (const member of set.members) {
        const { charge } = parseIon(set.memberLabels![member]!);
        const c = cellOf(L, member);
        // Anions other than H⁻ close the noble gas's period; s-block cations open the next one.
        if (charge < 0 && member !== z('H')) expect([c.period, c.column >= 27 && c.column < 32]).toEqual([gas.period, true]);
        if (charge > 0 && c.block === 's') expect([c.period, c.column <= 2]).toEqual([gas.period + 1, true]);
      }
    }
  });

  it('quotes ionic radii that fall as nuclear charge rises within each isoelectronic set', () => {
    for (const set of setsOf(layer('isoelectronic'))) {
      const quoted = [...(set.note ?? '').matchAll(/([A-Z][a-z]?[⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻]) (\d+(?:\.\d+)?)/gu)].map((m) => ({
        z: z(parseIon(m[1]!).symbol),
        r: Number(m[2]),
      }));
      expect(quoted.length, set.id).toBeGreaterThanOrEqual(2);
      for (const q of quoted) expect(set.members, set.id).toContain(q.z);
      quoted.sort((a, b) => a.z - b.z);
      for (let i = 1; i < quoted.length; i++) expect(quoted[i]!.r, set.id).toBeLessThan(quoted[i - 1]!.r);
    }
  });

  it('leaves out every ion the isoelectronic description says it excludes', () => {
    const built = layer('isoelectronic');
    const labels = setsOf(built).flatMap((s) => Object.values(s.memberLabels ?? {}));
    for (const excluded of ['B³⁺', 'C⁴⁻', 'Ti⁴⁺', 'Zr⁴⁺', 'Ce⁴⁺', 'Po²⁻', 'At⁻']) {
      expect(built.description).toContain(excluded);
      expect(labels).not.toContain(excluded);
    }
  });

  it('keeps each Döbereiner middle mass within 2% of the mean of the outer two', () => {
    const sets = setsOf(layer('dobereiner'));
    expect(sets).toHaveLength(4);
    for (const set of sets) {
      expect(set.members).toHaveLength(3);
      const [lo, mid, hi] = set.members.map((n) => BY_Z.get(n)!);
      const mean = (lo!.mass + hi!.mass) / 2;
      expect(Math.abs(mid!.mass - mean) / mean, set.id).toBeLessThan(0.02);
      expect(set.note).toContain(mean.toFixed(2));
      expect(set.note).toContain(mid!.mass.toFixed(2));
      expect(mid!.z * 2).toBe(lo!.z + hi!.z);
    }
  });

  it("directs Mendeleev's predictions from a known analogue to an element found after 1871", () => {
    const item = layer('mendeleev').items[0]!;
    expect(item.kind === 'edges' && item.directed).toBe(true);
    const edges = edgesOf(layer('mendeleev'));
    expect(edges.map((e) => [e.a, e.b])).toEqual([
      [z('B'), z('Sc')],
      [z('Al'), z('Ga')],
      [z('Si'), z('Ge')],
    ]);
    for (const e of edges) {
      const [analogue, predicted] = [BY_Z.get(e.a)!, BY_Z.get(e.b)!];
      expect(predicted.discoveryYear, predicted.symbol).not.toBeNull();
      expect(predicted.discoveryYear!, predicted.symbol).toBeGreaterThan(1871);
      if (analogue.discoveryYear !== null) expect(analogue.discoveryYear).toBeLessThan(1871);
      expect(cellOf(L, e.b).period).toBeGreaterThan(cellOf(L, e.a).period);
      expect(e.note).toContain(String(predicted.discoveryYear));
      expect(e.note).toContain(predicted.mass.toFixed(2));
    }
    const years = edges.map((e) => BY_Z.get(e.b)!.discoveryYear!);
    expect(layer('mendeleev').description).toContain(`within ${Math.max(...years) - 1871} years`);
  });
});

describe('literature relation layers (convention independence and data provenance)', () => {
  it('do not depend on the group-3 convention', () => {
    for (const build of Object.values(BUILDERS)) {
      expect(build(contextFor('La'))).toEqual(build(contextFor('Lu')));
    }
  });

  it('compute Döbereiner notes from ctx masses', () => {
    const triad = setsOf(dobereinerLayer(patchedContext(z('Sr'), { mass: 80 }))).find((s) => s.members.includes(z('Sr')))!;
    expect(triad.note).toContain('Sr is 80.00');
    expect(triad.note).toContain('9.8% below');
  });

  it('compute lanthanide-twin radii and dates from ctx', () => {
    const edges = edgesOf(lanthanideTwinsLayer(patchedContext(z('Hf'), { covalentRadius: 190, discoveryYear: 1924 })));
    const zrHf = edges.find((e) => e.b === z('Hf'))!;
    expect(zrHf.note).toContain('Hf 190');
    expect(zrHf.note).toContain('1924');
  });

  it("compute Mendeleev's measured values and dates from ctx", () => {
    const edges = edgesOf(mendeleevPredictionsLayer(patchedContext(z('Ga'), { density: 6.5, discoveryYear: 1876 })));
    const ga = edges.find((e) => e.b === z('Ga'))!;
    expect(ga.note).toContain('6.50');
    expect(ga.note).toContain('1876');
  });

  it('formats ion charges with Unicode superscripts', () => {
    expect(['N³⁻', 'O²⁻', 'F⁻', 'Ne', 'Na⁺', 'Mg²⁺', 'Al³⁺']).toEqual([
      ionLabel('N', -3),
      ionLabel('O', -2),
      ionLabel('F', -1),
      ionLabel('Ne', 0),
      ionLabel('Na', 1),
      ionLabel('Mg', 2),
      ionLabel('Al', 3),
    ]);
    expect(parseIon(ionLabel('Th', 4))).toEqual({ symbol: 'Th', charge: 4 });
  });
});
