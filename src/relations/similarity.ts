import type { ElementData, LayerBuilder, NumericProp, RelationEdge, RelationEdges } from '../types';
import { DATASET_SOURCE, formatRanges, symbolFor } from './structural';

export interface SimilarityFeature {
  readonly field: NumericProp;
  readonly label: string;
  /** Use log₁₀ of the value, for properties that span orders of magnitude. */
  readonly log?: boolean;
}

/** Chosen for chemical meaning and coverage: bonding, ionization, size, packing, cohesion. */
export const SIMILARITY_FEATURES: readonly SimilarityFeature[] = [
  { field: 'en', label: 'Pauling electronegativity' },
  { field: 'ie1', label: 'first ionization energy' },
  { field: 'covalentRadius', label: 'covalent radius' },
  { field: 'density', label: 'log₁₀ density', log: true },
  { field: 'mp', label: 'log₁₀ melting point', log: true },
];

/** Neighbour ranks drawn as separate items: nn1, nn2, nn3. */
export const NEIGHBOUR_RANKS = 3;

export interface Neighbour {
  z: number;
  /** Euclidean distance in z-score units. */
  distance: number;
}

export interface NeighbourTable {
  /** Elements with every feature measured, ascending Z. */
  included: number[];
  /** Elements missing at least one feature, ascending Z. */
  excluded: number[];
  /** Each included element's k nearest included neighbours, nearest first; ties go to the lower Z. */
  neighbours: ReadonlyMap<number, Neighbour[]>;
}

/** A feature's value, or null when it is missing, flagged as predicted, or has no logarithm. */
export function featureValue(e: ElementData, f: SimilarityFeature): number | null {
  if (e.predicted.includes(f.field)) return null;
  const v = e[f.field];
  if (v === null || !Number.isFinite(v)) return null;
  if (!f.log) return v;
  return v > 0 ? Math.log10(v) : null;
}

function standardiser(values: (number | null)[]): (v: number) => number {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return () => 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
  return sd > 0 ? (v) => (v - mean) / sd : () => 0;
}

function distance(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s);
}

/**
 * k-nearest neighbours in standardised property space. Each feature is z-scored (population SD)
 * over every element that has a value; only elements with all features take part.
 */
export function nearestNeighbours(
  elements: readonly ElementData[],
  k = NEIGHBOUR_RANKS,
  features: readonly SimilarityFeature[] = SIMILARITY_FEATURES,
): NeighbourTable {
  const sorted = [...elements].sort((a, b) => a.z - b.z);
  const raw = sorted.map((e) => features.map((f) => featureValue(e, f)));
  const scales = features.map((_, j) => standardiser(raw.map((row) => row[j]!)));
  const included: number[] = [];
  const excluded: number[] = [];
  const vectors = new Map<number, number[]>();
  sorted.forEach((e, i) => {
    const row = raw[i]!;
    if (row.some((v) => v === null)) {
      excluded.push(e.z);
      return;
    }
    vectors.set(e.z, row.map((v, j) => scales[j]!(v!)));
    included.push(e.z);
  });
  const neighbours = new Map<number, Neighbour[]>();
  for (const a of included) {
    const va = vectors.get(a)!;
    const ranked = included
      .filter((b) => b !== a)
      .map((b) => ({ z: b, distance: distance(va, vectors.get(b)!) }))
      .sort((x, y) => x.distance - y.distance || x.z - y.z);
    neighbours.set(a, ranked.slice(0, k));
  }
  return { included, excluded, neighbours };
}

const ORDINAL: Readonly<Record<number, string>> = { 1: 'nearest', 2: 'second-nearest', 3: 'third-nearest' };
const RANK_COLORS: Readonly<Record<number, string>> = { 1: '#b3bac8', 2: '#959dae', 3: '#777f90' };

function ordinal(rank: number): string {
  return ORDINAL[rank] ?? `rank-${rank}`;
}

export interface NeighbourPair {
  /** Lower Z of the pair. */
  a: number;
  b: number;
  distance: number;
  /** Element whose rank-th neighbour the other is (the lower Z when mutual). */
  from: number;
  /** Each is the other's rank-th neighbour. */
  mutual: boolean;
}

/** Each element paired with its rank-th neighbour, a pair found from both ends merged; sorted by (a, b). */
export function neighbourPairs(table: NeighbourTable, rank: number): NeighbourPair[] {
  const pairs = new Map<string, NeighbourPair>();
  for (const [z, list] of table.neighbours) {
    const n = list[rank - 1];
    if (!n) continue;
    const a = Math.min(z, n.z);
    const b = Math.max(z, n.z);
    const key = `${a}-${b}`;
    const hit = pairs.get(key);
    if (hit) {
      hit.mutual = true;
      hit.from = a;
    } else {
      pairs.set(key, { a, b, distance: n.distance, from: z, mutual: false });
    }
  }
  return [...pairs.values()].sort((x, y) => x.a - y.a || x.b - y.b);
}

function pairEdge(p: NeighbourPair, rank: number, sym: (z: number) => string): RelationEdge {
  const to = p.from === p.a ? p.b : p.a;
  const note = p.mutual
    ? `Each is the other's ${ordinal(rank)} neighbour.`
    : `${sym(to)} is the ${ordinal(rank)} neighbour of ${sym(p.from)}.`;
  return { a: p.a, b: p.b, label: `${sym(p.a)}–${sym(p.b)} · d = ${p.distance.toFixed(2)}`, note };
}

export const similarityLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const table = nearestNeighbours(ctx.elements.filter((e) => ctx.layout.cells.has(e.z)));
  const n = table.included.length;
  const f = SIMILARITY_FEATURES.length;
  const items: RelationEdges[] = [];
  for (let rank = 1; rank <= NEIGHBOUR_RANKS; rank++) {
    const pairs = neighbourPairs(table, rank);
    const mutual = pairs.filter((p) => p.mutual).length;
    const name = ordinal(rank);
    items.push({
      kind: 'edges',
      id: `nn${rank}`,
      label: `${name[0]!.toUpperCase()}${name.slice(1)} neighbour`,
      edges: pairs.map((p) => pairEdge(p, rank, sym)),
      directed: false,
      color: RANK_COLORS[rank] ?? '#b3bac8',
      note: `Each of the ${n} elements joined to its ${name} neighbour: ${pairs.length} pairs, ${mutual} of them mutual.`,
    });
  }
  const features = SIMILARITY_FEATURES.map((x) => x.label);
  const featureList = `${features.slice(0, -1).join(', ')} and ${features[features.length - 1]}`;
  return {
    id: 'similarity',
    title: 'Property neighbours',
    section: 'Data',
    summary: `Nearest neighbours in a ${f}-property space.`,
    description:
      `Joins each element to its nearest neighbours in a ${f}-dimensional property space: ${featureList}. ` +
      'Density and melting point enter as logarithms because they span orders of magnitude. Each property ' +
      'is converted to a z-score over every element with a measured value (values flagged as predicted ' +
      `count as missing), and only the ${n} elements with all ${f} take part. Distance is Euclidean in ` +
      'z-score units, and ties go to the lower Z. Nearest, second-nearest and third-nearest neighbours are ' +
      'separate items; a pair found from both ends is drawn once.',
    sources: [
      {
        label: 'B. Cordero et al., "Covalent radii revisited", Dalton Trans. (2008) 2832–2838',
        url: 'https://doi.org/10.1039/B801115J',
      },
      DATASET_SOURCE,
    ],
    color: '#b3bac8',
    items,
    style: { bow: 0.5 },
    caveat:
      `Property-space neighbours are not chemical analogies: ${f} correlated properties are weighted equally, ` +
      'and nothing here encodes valence, oxidation states or bonding, so close neighbours can behave quite ' +
      'differently. A different choice of properties gives a different graph.' +
      (table.excluded.length ? ` Left out for missing data (${table.excluded.length}): ${formatRanges(table.excluded, sym)}.` : ''),
  };
};
