import { COLUMN_COUNT, columnLabel, PERIOD_COUNT } from '../layout/table';
import { GROUP_LABEL_SOURCES, groupContent, groupNote } from './groups';
import { PERIOD_ENDS, symbolOf } from './symbols';
import type { ColumnInfo, ElementData, Group3Convention, Layout, PeriodInfo, Source } from '../types';

// ---------------------------------------------------------------- configurations

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** 14 → "¹⁴". */
export function superscript(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`superscript ${n}`);
  return [...String(n)].map((d) => SUPERSCRIPT_DIGITS[Number(d)]!).join('');
}

export interface Configuration {
  /** Noble-gas core symbol, e.g. "Xe", or null when none is written. */
  core: string | null;
  /** Subshells written after the core, in the order given: "4f" → 7. */
  subshells: ReadonlyMap<string, number>;
}

const CORE_TOKEN = /^\[([A-Z][a-z]?)\]$/;
const SUBSHELL_TOKEN = /^(\d)([spdf])(\d*)$/;

/** Parse "[Xe] 4f7 5d1 6s2" (a bare "5d" means one electron); null if malformed. */
export function parseConfig(config: string): Configuration | null {
  const tokens = config.trim().split(/\s+/);
  let core: string | null = null;
  const subshells = new Map<string, number>();
  for (const [i, token] of tokens.entries()) {
    const coreMatch = CORE_TOKEN.exec(token);
    if (coreMatch && i === 0) {
      core = coreMatch[1]!;
      continue;
    }
    const m = SUBSHELL_TOKEN.exec(token);
    if (!m) return null;
    const name = `${m[1]}${m[2]}`;
    if (subshells.has(name)) return null;
    subshells.set(name, m[3] === '' ? 1 : Number(m[3]));
  }
  return core === null && subshells.size === 0 ? null : { core, subshells };
}

/** "[Xe] 4f⁷ 5d¹ 6s²". */
export function prettyConfig(config: Configuration): string {
  const parts = config.core === null ? [] : [`[${config.core}]`];
  for (const [name, count] of config.subshells) parts.push(`${name}${superscript(count)}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------- f-block columns

/** Valence subshells of an f-block atom in period n: (n−2)f, (n−1)d, ns, np. */
export type Slot = 'f' | 'd' | 's' | 'p';
export type SlotCounts = Readonly<Record<Slot, number>>;

const SLOTS: readonly Slot[] = ['f', 'd', 's', 'p'];
const SLOT_DEPTH: Readonly<Record<Slot, number>> = { f: 2, d: 1, s: 0, p: 0 };
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];

function subshellOf(slot: Slot, period: number): string {
  return `${period - SLOT_DEPTH[slot]}${slot}`;
}

/**
 * Idealised valence counts for f-block column k: k f electrons over ns², plus the (n−1)d¹ of
 * La/Ac when they sit in group 3 ('La'), since each column then adds one f electron to La's 5d¹ 6s².
 */
export function idealFCounts(fIndex: number, convention: Group3Convention): SlotCounts {
  return { f: fIndex, d: convention === 'La' ? 1 : 0, s: 2, p: 0 };
}

/** Generic form of idealFCounts: "(n−2)f³ ns²" or "(n−2)f³ (n−1)d¹ ns²". */
export function fValencePattern(fIndex: number, convention: Group3Convention): string {
  return `(n−2)f${superscript(fIndex)}${convention === 'La' ? ' (n−1)d¹' : ''} ns²`;
}

/**
 * Valence counts over the previous period's noble-gas core; null unless the configuration is
 * written on that core and its slots hold every remaining electron.
 */
function valenceCounts(config: Configuration, atomicNumber: number, period: number): SlotCounts | null {
  const coreZ = PERIOD_ENDS[period - 2];
  if (coreZ === undefined || config.core !== symbolOf(coreZ)) return null;
  const counts = { f: 0, d: 0, s: 0, p: 0 };
  for (const slot of SLOTS) counts[slot] = config.subshells.get(subshellOf(slot, period)) ?? 0;
  const inSlots = SLOTS.reduce((sum, slot) => sum + counts[slot], 0);
  const written = [...config.subshells.values()].reduce((sum, n) => sum + n, 0);
  return inSlots === written && coreZ + written === atomicNumber ? counts : null;
}

/** How an actual configuration departs from the idealised one, e.g. "one electron in 5d instead of 4f"; null if it matches. */
export function describeDeparture(actual: SlotCounts, ideal: SlotCounts, period: number): string | null {
  const deltas = SLOTS.map((slot) => ({ slot, delta: actual[slot] - ideal[slot] })).filter((d) => d.delta !== 0);
  if (deltas.length === 0) return null;
  const gains = deltas.filter((d) => d.delta > 0);
  const losses = deltas.filter((d) => d.delta < 0);
  const gain = gains[0];
  const loss = losses[0];
  let text = 'valence electrons arranged differently';
  if (gains.length === 1 && losses.length === 1 && gain && loss && gain.delta === -loss.delta) {
    const n = gain.delta;
    text = `${NUMBER_WORDS[n] ?? String(n)} electron${n === 1 ? '' : 's'} in ${subshellOf(gain.slot, period)} instead of ${subshellOf(loss.slot, period)}`;
  }
  const f = subshellOf('f', period);
  if (actual.f !== ideal.f && actual.f === 7) text += `, with ${f} half-filled`;
  if (actual.f !== ideal.f && actual.f === 14) text += `, with ${f} filled`;
  return text;
}

export function configIsPredicted(element: ElementData): boolean {
  return element.predicted.includes('config');
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface MemberState {
  symbol: string;
  config: string;
  /** The dataset marks the configuration as predicted rather than measured. */
  predicted: boolean;
  departure: string | null;
}

function departed(m: MemberState): string {
  return `${m.symbol} is ${m.config} (${m.predicted ? 'predicted; ' : ''}${m.departure})`;
}

function withFlag(m: MemberState): string {
  return `${m.config}${m.predicted ? ' (predicted)' : ''}`;
}

/** Note for f-block column k: which members have the idealised configuration and how the rest differ. */
export function fColumnNote(layout: Layout, fIndex: number, members: readonly number[], byZ: ReadonlyMap<number, ElementData>): string {
  const ideal = idealFCounts(fIndex, layout.convention);
  const known: MemberState[] = [];
  const unknown: string[] = [];
  for (const atomicNumber of members) {
    const element = byZ.get(atomicNumber);
    const symbol = element?.symbol ?? symbolOf(atomicNumber);
    const period = layout.cells.get(atomicNumber)?.period;
    const config = element ? parseConfig(element.config) : null;
    const actual = config && period !== undefined ? valenceCounts(config, atomicNumber, period) : null;
    if (!config || !actual || period === undefined) {
      unknown.push(symbol);
      continue;
    }
    known.push({
      symbol,
      config: prettyConfig(config),
      predicted: element !== undefined && configIsPredicted(element),
      departure: describeDeparture(actual, ideal, period),
    });
  }
  if (known.length === 0) return `Ground-state configurations are unavailable for ${joinList(unknown)}.`;
  const missing = unknown.length ? ` No usable ground-state configuration for ${joinList(unknown)}.` : '';
  const matching = known.filter((m) => m.departure === null).length;
  if (known.length > 1 && matching === known.length) {
    const who = known.length === 2 ? 'Both members have' : `All ${known.length} members have`;
    return `${who} the idealised configuration: ${joinList(known.map((m) => `${m.symbol} ${withFlag(m)}`))}.${missing}`;
  }
  if (known.length > 1 && matching === 0) {
    const who = known.length === 2 ? 'Neither member has' : 'No member has';
    return `${who} the idealised configuration: ${joinList(known.map(departed))}.${missing}`;
  }
  const clauses = known.map((m) => (m.departure === null ? `${m.symbol} has the idealised ${withFlag(m)}` : departed(m)));
  return `${clauses.join('; ')}.${missing}`;
}

// ---------------------------------------------------------------- columns

function uniqueSources(sources: readonly Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((src) => !seen.has(src.label) && seen.add(src.label));
}

export function buildColumns(layout: Layout, byZ: ReadonlyMap<number, ElementData>): ColumnInfo[] {
  const out: ColumnInfo[] = [];
  for (let column = 1; column <= COLUMN_COUNT; column++) {
    const kind = layout.columnKind(column);
    const members = layout.membersOfColumn(column);
    const base = { column, label: columnLabel(kind), members };
    if (kind.kind === 'group') {
      const g = groupContent(kind.group);
      out.push({
        ...base,
        kind: 'group',
        group: kind.group,
        fIndex: null,
        casLabel: g.casLabel,
        oldIupacLabel: g.oldIupacLabel,
        name: g.name,
        nameStatus: g.nameStatus,
        valencePattern: g.valencePattern,
        note: groupNote(g, layout.convention),
        sources: uniqueSources([...g.sources, ...GROUP_LABEL_SOURCES]),
      });
    } else {
      out.push({
        ...base,
        kind: 'f',
        group: null,
        fIndex: kind.fIndex,
        casLabel: null,
        oldIupacLabel: null,
        name: null,
        nameStatus: null,
        valencePattern: fValencePattern(kind.fIndex, layout.convention),
        note: fColumnNote(layout, kind.fIndex, members, byZ),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- periods

export interface PeriodContent {
  /** Subshells filled across the period, in Madelung order. */
  subshells: readonly string[];
  note: string;
  sources: readonly Source[];
}

const NIST_ASD: Source = {
  label: 'NIST Atomic Spectra Database: ground levels and ionization energies',
  url: 'https://www.nist.gov/pml/atomic-spectra-database',
};

export const PERIODS: readonly PeriodContent[] = [
  {
    subshells: ['1s'],
    note:
      'Just two elements, because the first shell has only the 1s subshell. Hydrogen and helium make up about ' +
      "three-quarters and a quarter of the universe's ordinary matter by mass.",
    sources: [
      {
        label: 'Planck Collaboration, "Planck 2018 results. VI. Cosmological parameters", Astron. Astrophys. 641 (2020) A6 (primordial helium mass fraction ≈ 0.25)',
        url: 'https://doi.org/10.1051/0004-6361/201833910',
      },
      {
        label: 'M. Asplund, N. Grevesse, A. J. Sauval, P. Scott, "The chemical composition of the Sun", Annu. Rev. Astron. Astrophys. 47 (2009) 481–522',
        url: 'https://doi.org/10.1146/annurev.astro.46.060407.145222',
      },
    ],
  },
  {
    subshells: ['2s', '2p'],
    note:
      'With no inner p shell to be orthogonal to, the 2p orbitals have no radial node and are compact, so C, N and O ' +
      'form strong multiple bonds and period 2 stands apart from the periods below (Kaupp 2007).',
    sources: [
      {
        label: 'M. Kaupp, "The role of radial nodes of atomic orbitals for chemical bonding and the periodic table", J. Comput. Chem. 28 (2007) 320–325',
        url: 'https://doi.org/10.1002/jcc.20522',
      },
    ],
  },
  {
    subshells: ['3s', '3p'],
    note:
      "Unlike their period-2 congeners, P, S and Cl form 'hypervalent' species such as PCl₅, SF₆ and ClF₃; their " +
      'bonding is now ascribed mainly to polar, partly ionic bonds, with little role for 3d orbitals (Reed & Schleyer 1990).',
    sources: [
      {
        label: 'A. E. Reed, P. v. R. Schleyer, "Chemical bonding in hypervalent molecules. The dominance of ionic bonding and negative hyperconjugation over d-orbital participation", J. Am. Chem. Soc. 112 (1990) 1434–1445',
        url: 'https://doi.org/10.1021/ja00160a022',
      },
    ],
  },
  {
    subshells: ['4s', '3d', '4p'],
    note:
      'The first period with a d-block. 4s fills before 3d, yet transition-metal cations lose their 4s electrons ' +
      'first: iron is [Ar] 3d⁶ 4s², but Fe²⁺ is [Ar] 3d⁶.',
    sources: [NIST_ASD],
  },
  {
    subshells: ['5s', '4d', '5p'],
    note:
      'Six of its ten d-block elements (Nb, Mo, Ru, Rh, Pd, Ag) have ground states that depart from the Madelung ' +
      'filling order, against two in period 4 (Cr, Cu).',
    sources: [NIST_ASD],
  },
  {
    subshells: ['6s', '4f', '5d', '6p'],
    note:
      'The first period with an f-block. Filling 4f shrinks the atoms that follow (the lanthanide contraction), so Hf ' +
      'is almost exactly the size of Zr; relativistic effects, strong from here on, make gold yellow and mercury liquid.',
    sources: [
      {
        label: 'P. Pyykkö, "Relativistic effects in structural chemistry", Chem. Rev. 88 (1988) 563–594',
        url: 'https://doi.org/10.1021/cr00085a006',
      },
    ],
  },
  {
    subshells: ['7s', '5f', '6d', '7p'],
    note:
      'Every member is radioactive. No element beyond einsteinium (Z = 99) has been isolated in visible amounts, and ' +
      'from rutherfordium on, chemistry is done one atom at a time, so most superheavy chemistry is predicted, not measured.',
    sources: [
      {
        label: 'A. Türler, V. Pershina, "Advances in the production and chemistry of the heaviest elements", Chem. Rev. 113 (2013) 1237–1312',
        url: 'https://doi.org/10.1021/cr3002438',
      },
      {
        label: 'R. G. Haire, "Einsteinium", in The Chemistry of the Actinide and Transactinide Elements, 3rd ed., Springer (2006)',
      },
    ],
  },
];

export function buildPeriods(layout: Layout, _byZ: ReadonlyMap<number, ElementData>): PeriodInfo[] {
  return Array.from({ length: PERIOD_COUNT }, (_, i) => {
    const content = PERIODS[i]!;
    return {
      period: i + 1,
      members: layout.membersOfPeriod(i + 1),
      subshells: [...content.subshells],
      note: content.note,
      sources: [...content.sources],
    };
  });
}
