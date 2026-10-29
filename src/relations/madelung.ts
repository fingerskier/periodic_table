import type { Block, Cell, ElementData } from '../types';

// The Madelung (n + ℓ) rule: subshells fill in order of increasing n + ℓ, and for equal n + ℓ
// in order of increasing n. Pure helpers, no DOM, no layout state.

export interface Subshell {
  /** Spectroscopic name, e.g. "4f". */
  readonly name: string;
  readonly n: number;
  /** Azimuthal quantum number ℓ: s 0, p 1, d 2, f 3. */
  readonly l: number;
  /** Orbital letter, which is also the block of the elements that fill this subshell. */
  readonly letter: Block;
  /** Electrons the subshell holds: 2(2ℓ + 1). */
  readonly capacity: number;
}

/** Electrons per subshell keyed by name ("3d" → 5). Only occupied subshells appear. */
export type SubshellCounts = Map<string, number>;

const LETTERS: readonly Block[] = ['s', 'p', 'd', 'f'];
const MAX_Z = 118;
const MAX_N = 7;
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

type Quantum = Pick<Subshell, 'n' | 'l'>;

const byMadelung = (a: Quantum, b: Quantum): number => a.n + a.l - (b.n + b.l) || a.n - b.n;
const byShell = (a: Quantum, b: Quantum): number => a.n - b.n || a.l - b.l;

function makeSubshell(n: number, l: number): Subshell {
  const letter = LETTERS[l]!;
  return { name: `${n}${letter}`, n, l, letter, capacity: 2 * (2 * l + 1) };
}

/** The 19 subshells occupied up to Z = 118, in Madelung order: 1s 2s 2p 3s 3p 4s 3d 4p … 5f 6d 7p. */
export const madelungOrder: readonly Subshell[] = (() => {
  const all: Subshell[] = [];
  for (let n = 1; n <= MAX_N; n++) {
    for (let l = 0; l < Math.min(n, LETTERS.length); l++) all.push(makeSubshell(n, l));
  }
  all.sort(byMadelung);
  const out: Subshell[] = [];
  for (let total = 0, i = 0; total < MAX_Z; i++) {
    const s = all[i]!;
    out.push(s);
    total += s.capacity;
  }
  return out;
})();

function quantumOf(name: string): Quantum {
  const m = /^(\d)([spdf])$/.exec(name);
  if (!m) throw new Error(`Not a subshell name: ${name}`);
  return { n: Number(m[1]), l: LETTERS.indexOf(m[2] as Block) };
}

function sortedCounts(counts: ReadonlyMap<string, number>, compare: (a: Quantum, b: Quantum) => number): SubshellCounts {
  const names = [...counts.keys()].sort((a, b) => compare(quantumOf(a), quantumOf(b)));
  return new Map(names.map((name) => [name, counts.get(name)!]));
}

const N_OFFSET: Readonly<Record<Block, number>> = { s: 0, p: 0, d: 1, f: 2 };

/** Subshell that position implies for the differentiating electron: ns and np in period n, (n−1)d, (n−2)f. */
export function subshellForCell(cell: Pick<Cell, 'period' | 'block'>): string {
  return `${cell.period - N_OFFSET[cell.block]}${cell.block}`;
}

/** Period across which a subshell fills (inverse of subshellForCell). */
export function periodOfSubshell(s: Pick<Subshell, 'n' | 'letter'>): number {
  return s.n + N_OFFSET[s.letter];
}

/** Configuration the Madelung rule predicts for atomic number z (1..118), in filling order. */
export function madelungConfiguration(z: number): SubshellCounts {
  if (!Number.isInteger(z) || z < 1 || z > MAX_Z) throw new RangeError(`No Madelung configuration for Z = ${z}`);
  const out: SubshellCounts = new Map();
  let left = z;
  for (const s of madelungOrder) {
    if (left === 0) break;
    const k = Math.min(left, s.capacity);
    out.set(s.name, k);
    left -= k;
  }
  return out;
}

// Noble-gas cores as written in configuration strings; each equals the gas's own ground state.
const CORES: ReadonlyMap<string, string> = new Map([
  ['He', '1s2'],
  ['Ne', '[He] 2s2 2p6'],
  ['Ar', '[Ne] 3s2 3p6'],
  ['Kr', '[Ar] 3d10 4s2 4p6'],
  ['Xe', '[Kr] 4d10 5s2 5p6'],
  ['Rn', '[Xe] 4f14 5d10 6s2 6p6'],
]);

const coreCache = new Map<string, SubshellCounts>();

function coreCounts(symbol: string, source: string): SubshellCounts {
  const hit = coreCache.get(symbol);
  if (hit) return hit;
  const def = CORES.get(symbol);
  if (def === undefined) throw new Error(`Unknown noble-gas core [${symbol}] in "${source}"`);
  const counts = parseConfiguration(def);
  coreCache.set(symbol, counts);
  return counts;
}

// A count is plain or superscript digits, never both. Superscripts are read as written, so
// "3d⁵4s¹" needs no space; plain digits do ("3d54s1" reads as 3d⁵⁴ and is rejected).
const TOKEN = /\s*(?:\[([A-Z][a-z]?)\]|(\d)([spdf])(\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s*/y;

function readCount(digits: string | undefined): number {
  if (digits === undefined) return 1;
  return Number(digits.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUPERSCRIPT_DIGITS.indexOf(c))));
}

/**
 * Expand a configuration such as "[Ar] 3d5 4s1" into subshell counts (Madelung order). Cores
 * [He] [Ne] [Ar] [Kr] [Xe] [Rn] are expanded, a bare subshell means one electron ("4s" = 4s¹),
 * and superscript counts are accepted ("[Ar] 3d⁵ 4s¹", "[Ar]3d⁵4s¹"). Nothing is implied: without
 * a core, inner subshells such as 1s count only if written. Malformed input throws.
 */
export function parseConfiguration(config: string): SubshellCounts {
  const text = config.trim();
  const counts: SubshellCounts = new Map();
  const seen = new Set<string>();
  const add = (name: string, count: number) => {
    if (seen.has(name)) throw new Error(`Subshell ${name} appears twice in "${config}"`);
    seen.add(name);
    if (count > 0) counts.set(name, count);
  };
  // TOKEN is shared and core expansion recurses, so the position lives here, not in lastIndex.
  let pos = 0;
  while (pos < text.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) throw new Error(`Cannot read configuration "${config}" at "${text.slice(pos)}"`);
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) {
      for (const [name, count] of coreCounts(m[1], config)) add(name, count);
      continue;
    }
    const s = makeSubshell(Number(m[2]), LETTERS.indexOf(m[3] as Block));
    if (s.l >= s.n) throw new Error(`No ${s.name} subshell (in "${config}")`);
    const count = readCount(m[4]);
    if (count > s.capacity) throw new Error(`${s.name} holds at most ${s.capacity} electrons (in "${config}")`);
    add(s.name, count);
  }
  return sortedCounts(counts, byMadelung);
}

export function electronCount(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const k of counts.values()) total += k;
  return total;
}

/** Names of subshells whose counts differ (absent = 0), in (n, ℓ) order. */
export function differingSubshells(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): string[] {
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names]
    .filter((name) => (a.get(name) ?? 0) !== (b.get(name) ?? 0))
    .sort((x, y) => byShell(quantumOf(x), quantumOf(y)));
}

/** Superscript notation in (n, ℓ) order, e.g. "3d⁵ 4s¹"; subshells holding no electrons are left out. */
export function formatConfiguration(counts: ReadonlyMap<string, number>): string {
  return [...sortedCounts(counts, byShell)]
    .filter(([, k]) => k > 0)
    .map(([name, k]) => `${name}${String(k).replace(/\d/g, (d) => SUPERSCRIPT_DIGITS[Number(d)]!)}`)
    .join(' ');
}

/** Atomic numbers (ascending) whose recorded configuration differs from the Madelung prediction. */
export function madelungExceptions(elements: readonly Pick<ElementData, 'z' | 'config'>[]): number[] {
  return elements
    .filter((e) => e.config.trim() !== '')
    .filter((e) => differingSubshells(parseConfiguration(e.config), madelungConfiguration(e.z)).length > 0)
    .map((e) => e.z)
    .sort((a, b) => a - b);
}
