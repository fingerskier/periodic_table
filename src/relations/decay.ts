import { symbolOf, z } from '../data/symbols';
import type { ElementSymbol } from '../data/symbols';
import type { LayerBuilder, RelationEdge, RelationEdges, Source } from '../types';

// Nuclide-level steps of the four decay series. Half-lives and branch intensities follow NUBASE2020,
// the evaluation behind mendeleev's isotope tables; half-lives are rounded to three significant
// figures. scripts/verify_decay.py re-checks every step against those tables (the isomer Pa-234m,
// which they lack, against its NUBASE2020 row copied into the script). It finds the steps by parsing
// the step(...) lines with a regular expression, so keep one call per line, in exactly this form,
// inside each `export const <NAME>_SERIES` array.

export type DecayMode = 'alpha' | 'beta-';

export interface Nuclide {
  z: number;
  /** Mass number. */
  a: number;
  /** Metastable isomer, e.g. ²³⁴ᵐPa. */
  isomer?: true;
}

export interface DecayStep {
  parent: Nuclide;
  mode: DecayMode;
  /** Share of the parent's decays that take this branch, %. */
  branchPercent: number;
  /** Half-life of the parent, human-readable. */
  halfLife: string;
  daughter: Nuclide;
}

/** 'Th-232', or 'Pa-234m' for an isomer. */
export type NuclideName = `${ElementSymbol}-${number}` | `${ElementSymbol}-${number}m`;

export function nuclide(name: NuclideName): Nuclide {
  const match = /^([A-Z][a-z]?)-(\d+)(m?)$/.exec(name);
  if (!match) throw new Error(`Not a nuclide name: ${name}`);
  const [, symbol = '', mass = '', isomer = ''] = match;
  const n: Nuclide = { z: z(symbol), a: Number(mass) };
  return isomer ? { ...n, isomer: true } : n;
}

function step(parent: NuclideName, mode: DecayMode, branchPercent: number, halfLife: string, daughter: NuclideName): DecayStep {
  return { parent: nuclide(parent), mode, branchPercent, halfLife, daughter: nuclide(daughter) };
}

export const THORIUM_SERIES: readonly DecayStep[] = [
  step('Th-232', 'alpha', 100, '14.0 Gyr', 'Ra-228'),
  step('Ra-228', 'beta-', 100, '5.75 yr', 'Ac-228'),
  step('Ac-228', 'beta-', 100, '6.15 h', 'Th-228'),
  step('Th-228', 'alpha', 100, '1.91 yr', 'Ra-224'),
  step('Ra-224', 'alpha', 100, '3.63 d', 'Rn-220'),
  step('Rn-220', 'alpha', 100, '55.6 s', 'Po-216'),
  step('Po-216', 'alpha', 100, '144 ms', 'Pb-212'),
  step('Pb-212', 'beta-', 100, '10.6 h', 'Bi-212'),
  step('Bi-212', 'beta-', 64.06, '60.6 min', 'Po-212'),
  step('Bi-212', 'alpha', 35.94, '60.6 min', 'Tl-208'),
  step('Po-212', 'alpha', 100, '294 ns', 'Pb-208'),
  step('Tl-208', 'beta-', 100, '3.05 min', 'Pb-208'),
];

export const NEPTUNIUM_SERIES: readonly DecayStep[] = [
  step('Np-237', 'alpha', 100, '2.14 Myr', 'Pa-233'),
  step('Pa-233', 'beta-', 100, '27.0 d', 'U-233'),
  step('U-233', 'alpha', 100, '159 kyr', 'Th-229'),
  step('Th-229', 'alpha', 100, '7.92 kyr', 'Ra-225'),
  step('Ra-225', 'beta-', 100, '14.8 d', 'Ac-225'),
  step('Ac-225', 'alpha', 100, '9.92 d', 'Fr-221'),
  step('Fr-221', 'alpha', 99.995, '4.80 min', 'At-217'),
  step('At-217', 'alpha', 99.992, '32.6 ms', 'Bi-213'),
  step('Bi-213', 'beta-', 97.91, '45.6 min', 'Po-213'),
  step('Bi-213', 'alpha', 2.09, '45.6 min', 'Tl-209'),
  step('Po-213', 'alpha', 100, '3.71 µs', 'Pb-209'),
  step('Tl-209', 'beta-', 100, '2.16 min', 'Pb-209'),
  step('Pb-209', 'beta-', 100, '3.24 h', 'Bi-209'),
  step('Bi-209', 'alpha', 100, '2.01 × 10¹⁹ yr', 'Tl-205'),
];

export const URANIUM_SERIES: readonly DecayStep[] = [
  step('U-238', 'alpha', 100, '4.46 Gyr', 'Th-234'),
  step('Th-234', 'beta-', 100, '24.1 d', 'Pa-234m'),
  step('Pa-234m', 'beta-', 99.84, '1.16 min', 'U-234'),
  step('U-234', 'alpha', 100, '246 kyr', 'Th-230'),
  step('Th-230', 'alpha', 100, '75.4 kyr', 'Ra-226'),
  step('Ra-226', 'alpha', 100, '1600 yr', 'Rn-222'),
  step('Rn-222', 'alpha', 100, '3.82 d', 'Po-218'),
  step('Po-218', 'alpha', 99.98, '3.10 min', 'Pb-214'),
  step('Pb-214', 'beta-', 100, '27.1 min', 'Bi-214'),
  step('Bi-214', 'beta-', 99.979, '19.9 min', 'Po-214'),
  step('Po-214', 'alpha', 100, '163 µs', 'Pb-210'),
  step('Pb-210', 'beta-', 100, '22.2 yr', 'Bi-210'),
  step('Bi-210', 'beta-', 100, '5.01 d', 'Po-210'),
  step('Po-210', 'alpha', 100, '138 d', 'Pb-206'),
];

export const ACTINIUM_SERIES: readonly DecayStep[] = [
  step('U-235', 'alpha', 100, '704 Myr', 'Th-231'),
  step('Th-231', 'beta-', 100, '25.5 h', 'Pa-231'),
  step('Pa-231', 'alpha', 100, '32.7 kyr', 'Ac-227'),
  step('Ac-227', 'beta-', 98.62, '21.8 yr', 'Th-227'),
  step('Ac-227', 'alpha', 1.38, '21.8 yr', 'Fr-223'),
  step('Th-227', 'alpha', 100, '18.7 d', 'Ra-223'),
  step('Fr-223', 'beta-', 99.994, '22.0 min', 'Ra-223'),
  step('Ra-223', 'alpha', 100, '11.4 d', 'Rn-219'),
  step('Rn-219', 'alpha', 100, '3.96 s', 'Po-215'),
  step('Po-215', 'alpha', 100, '1.78 ms', 'Pb-211'),
  step('Pb-211', 'beta-', 100, '36.2 min', 'Bi-211'),
  step('Bi-211', 'alpha', 99.724, '2.14 min', 'Tl-207'),
  step('Tl-207', 'beta-', 100, '4.77 min', 'Pb-207'),
];

export type SeriesId = 'thorium' | 'neptunium' | 'uranium' | 'actinium';

export interface DecaySeries {
  id: SeriesId;
  name: string;
  /** Every member's mass number A has A mod 4 = residue. */
  residue: 0 | 1 | 2 | 3;
  start: Nuclide;
  /** The stable nuclide at the end of every path. */
  end: Nuclide;
  color: string;
  steps: readonly DecayStep[];
  /** Appended to the computed item note. */
  remark?: string;
}

export const DECAY_SERIES: readonly DecaySeries[] = [
  {
    id: 'thorium',
    name: 'Thorium',
    residue: 0,
    start: nuclide('Th-232'),
    end: nuclide('Pb-208'),
    color: '#e34948',
    steps: THORIUM_SERIES,
  },
  {
    id: 'neptunium',
    name: 'Neptunium',
    residue: 1,
    start: nuclide('Np-237'),
    end: nuclide('Tl-205'),
    color: '#9085e9',
    steps: NEPTUNIUM_SERIES,
    remark: 'Its long-assumed end, ²⁰⁹Bi, α-decays (2.01 × 10¹⁹ yr). Extinct in nature apart from traces in uranium ores.',
  },
  {
    id: 'uranium',
    name: 'Uranium',
    residue: 2,
    start: nuclide('U-238'),
    end: nuclide('Pb-206'),
    color: '#eda100',
    steps: URANIUM_SERIES,
    remark: 'Also called the radium series.',
  },
  {
    id: 'actinium',
    name: 'Actinium',
    residue: 3,
    start: nuclide('U-235'),
    end: nuclide('Pb-207'),
    color: '#1baf7a',
    steps: ACTINIUM_SERIES,
  },
];

// ---------------------------------------------------------------- labels

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const MODE_SYMBOL: Readonly<Record<DecayMode, string>> = { alpha: 'α', 'beta-': 'β⁻' };

/** Nuclide in superscript notation: '²³⁸U', '²³⁴ᵐPa'. */
export function nuclideLabel(n: Nuclide): string {
  const mass = [...String(n.a)].map((d) => SUPERSCRIPT_DIGITS[Number(d)]).join('');
  return `${mass}${n.isomer ? 'ᵐ' : ''}${symbolOf(n.z)}`;
}

/** One transition, e.g. '²¹²Bi →β⁻ ²¹²Po (60.6 min, 64.06%)'; the share is omitted at 100%. */
function stepLabel(s: DecayStep): string {
  const share = s.branchPercent < 100 ? `, ${s.branchPercent}%` : '';
  return `${nuclideLabel(s.parent)} →${MODE_SYMBOL[s.mode]} ${nuclideLabel(s.daughter)} (${s.halfLife}${share})`;
}

function massRule(residue: number): string {
  return residue === 0 ? '4n' : `4n + ${residue}`;
}

// ---------------------------------------------------------------- chain structure

const sameNuclide = (p: Nuclide, q: Nuclide): boolean => p.z === q.z && p.a === q.a && !p.isomer === !q.isomer;
const nameOf = (n: Nuclide): string => `${symbolOf(n.z)}-${n.a}${n.isomer ? 'm' : ''}`;

function branchesOf(steps: readonly DecayStep[], parent: Nuclide): DecayStep[] {
  return steps.filter((s) => sameNuclide(s.parent, parent));
}

/** Nuclides reachable from `from` (itself included), nearest first. */
function descendants(steps: readonly DecayStep[], from: Nuclide): Nuclide[] {
  const order: Nuclide[] = [];
  const queue = [from];
  while (queue.length > 0) {
    const n = queue.shift()!;
    if (order.some((m) => sameNuclide(m, n))) continue;
    order.push(n);
    queue.push(...branchesOf(steps, n).map((s) => s.daughter));
  }
  return order;
}

/** The first nuclide every branch of a branch point leads to. */
function rejoinPoint(steps: readonly DecayStep[], branches: readonly DecayStep[]): Nuclide | undefined {
  const [first, ...rest] = branches.map((b) => descendants(steps, b.daughter));
  return first?.find((n) => rest.every((path) => path.some((m) => sameNuclide(m, n))));
}

/** Facts the data cannot express, keyed by parent nuclide; they replace the remainder note. */
const PARENT_NOTES: Readonly<Record<string, string>> = {
  'U-238':
    'NUBASE2020 gives ²³⁸U 4.463(3) Gyr, down from 4.468 Gyr in NUBASE2016; U–Pb dating still uses 4.468 Gyr ' +
    '(Jaffey et al. 1971).',
  'Th-234': '²³⁴Th β⁻ decay feeds mainly the isomer ²³⁴ᵐPa (1.16 min) rather than the ²³⁴Pa ground state (6.70 h).',
  'Pa-234m': 'The other 0.16% of ²³⁴ᵐPa decays are isomeric transitions to ²³⁴Pa (6.70 h), which also β⁻-decays to ²³⁴U.',
  'Bi-209':
    '²⁰⁹Bi was long thought stable; its α decay, first observed by de Marcillac et al. (2003), has a half-life ' +
    'over a billion times the age of the universe.',
};

const percent = (x: number): string => String(Number(x.toFixed(4)));

function parentNote(steps: readonly DecayStep[], parent: Nuclide): string | undefined {
  const branches = branchesOf(steps, parent);
  const parts: string[] = [];
  if (branches.length > 1) {
    const split = branches.map((b) => `${b.branchPercent}% ${MODE_SYMBOL[b.mode]} to ${nuclideLabel(b.daughter)}`).join(', ');
    const meet = rejoinPoint(steps, branches);
    parts.push(`${nuclideLabel(parent)} branches: ${split}${meet ? `; the routes rejoin at ${nuclideLabel(meet)}` : ''}.`);
  }
  const fixed = PARENT_NOTES[nameOf(parent)];
  const rest = 100 - branches.reduce((sum, b) => sum + b.branchPercent, 0);
  if (fixed) parts.push(fixed);
  else if (rest > 1e-9) parts.push(`The remaining ${percent(rest)}% of ${nuclideLabel(parent)} decays take branches under 1%, not drawn.`);
  return parts.length ? parts.join(' ') : undefined;
}

/** Element-level arcs: steps sharing (parent element, daughter element) merge into one arc. */
function seriesEdges(steps: readonly DecayStep[]): RelationEdge[] {
  const groups = new Map<string, DecayStep[]>();
  for (const s of steps) {
    const k = `${s.parent.z}>${s.daughter.z}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const parents = group.map((s) => s.parent).filter((p, i, all) => all.findIndex((q) => sameNuclide(p, q)) === i);
    const notes = parents.map((p) => parentNote(steps, p)).filter((n): n is string => n !== undefined);
    const edge: RelationEdge = { a: first.parent.z, b: first.daughter.z, label: group.map(stepLabel).join('; ') };
    return notes.length ? { ...edge, note: notes.join(' ') } : edge;
  });
}

function seriesNote(series: DecaySeries): string {
  const { start, end, steps } = series;
  const alphas = (start.a - end.a) / 4;
  const betas = end.z - (start.z - 2 * alphas);
  const startHalfLife = branchesOf(steps, start)[0]?.halfLife ?? '?';
  const branched = steps.some((s) => branchesOf(steps, s.parent).length > 1);
  const core =
    `From ${nuclideLabel(start)} (T½ ${startHalfLife}) to stable ${nuclideLabel(end)}: ${alphas} α and ${betas} β⁻ decays` +
    `${branched ? ' on every route' : ''}. Every mass number is ${massRule(series.residue)}.`;
  return series.remark ? `${core} ${series.remark}` : core;
}

function seriesItem(series: DecaySeries): RelationEdges {
  return {
    kind: 'edges',
    id: `${series.id}-series`,
    label: `${series.name} (${massRule(series.residue)})`,
    edges: seriesEdges(series.steps),
    directed: true,
    color: series.color,
    note: seriesNote(series),
  };
}

// ---------------------------------------------------------------- layer

const SOURCES: readonly Source[] = [
  {
    label:
      'F. G. Kondev, M. Wang, W. J. Huang, S. Naimi, G. Audi, "The NUBASE2020 evaluation of nuclear physics properties", ' +
      'Chin. Phys. C 45 (2021) 030001 (half-lives and branch intensities)',
    url: 'https://doi.org/10.1088/1674-1137/abddae',
  },
  {
    label:
      'ICRP Publication 107, "Nuclear decay data for dosimetric calculations" (K. F. Eckerman, A. Endo), Ann. ICRP 38(3) (2008); ' +
      'link: Annex A, "Radionuclides of the ICRP-07 collection" (independent check of the chains and branch points; ICRP-107 ' +
      'treats ²⁰⁹Bi as stable)',
    url: 'https://doi.org/10.1016/j.icrp.2008.10.002',
  },
  {
    label:
      'A. Malins, T. Lemoine, "radioactivedecay: A Python package for radioactive decay calculations", J. Open Source Softw. 7 ' +
      '(2022) 3318 (reads the ICRP-107 data for that check)',
    url: 'https://doi.org/10.21105/joss.03318',
  },
  {
    label:
      'G. Audi, F. G. Kondev, M. Wang, W. J. Huang, S. Naimi, "The NUBASE2016 evaluation of nuclear properties", Chin. Phys. C 41 ' +
      '(2017) 030001 (the earlier ²³⁸U half-life, 4.468(6) Gyr)',
    url: 'https://doi.org/10.1088/1674-1137/41/3/030001',
  },
  {
    label:
      'A. H. Jaffey, K. F. Flynn, L. E. Glendenin, W. C. Bentley, A. M. Essling, "Precision measurement of half-lives and specific ' +
      'activities of ²³⁵U and ²³⁸U", Phys. Rev. C 4 (1971) 1889–1906 (the ²³⁸U half-life used in U–Pb dating)',
    url: 'https://doi.org/10.1103/PhysRevC.4.1889',
  },
  {
    label:
      'P. de Marcillac, N. Coron, G. Dambier, J. Leblanc, J.-P. Moalic, "Experimental detection of α-particles from the ' +
      'radioactive decay of natural bismuth", Nature 422 (2003) 876–878',
    url: 'https://doi.org/10.1038/nature01541',
  },
  {
    label: 'D. F. Peppard, G. W. Mason, P. R. Gray, J. F. Mech, "Occurrence of the (4n + 1) series in nature", J. Am. Chem. Soc. 74 (1952) 6081–6084',
    url: 'https://doi.org/10.1021/ja01143a074',
  },
  { label: 'Encyclopaedia Britannica, "Radioactive series"', url: 'https://www.britannica.com/science/radioactive-series' },
  {
    label: 'L. M. Mentel, mendeleev 1.3.0 isotope and decay-mode tables (NUBASE2020), the cross-check run by scripts/verify_decay.py',
    url: 'https://github.com/lmmentel/mendeleev',
  },
];

export const decaySeriesLayer: LayerBuilder = () => ({
  id: 'decay',
  title: 'Natural decay series',
  section: 'Sequences',
  summary: 'The thorium, neptunium, uranium and actinium chains: α and β⁻ steps from ²³²Th, ²³⁷Np, ²³⁸U and ²³⁵U down to lead and thallium.',
  description:
    'α decay lowers the atomic number Z by 2 and the mass number A by 4; β⁻ decay raises Z by 1 and leaves A unchanged. ' +
    'A mod 4 is therefore fixed along a chain, and the heavy radionuclides fall into four series: thorium (4n, from ²³²Th), ' +
    'neptunium (4n + 1, from ²³⁷Np), uranium or radium (4n + 2, from ²³⁸U) and actinium (4n + 3, from ²³⁵U). ' +
    "Each arc joins a parent element to its daughter and lists the nuclide steps it carries, with the parent's half-life " +
    '(NUBASE2020, to three significant figures) and any branch share. Branches of 1% or more are drawn; smaller ones, such ' +
    'as ²¹¹Bi β⁻ (0.276%) and ²¹⁴Bi α (0.021%), are skipped, as are spontaneous fission and cluster decay. ²³²Th, ²³⁸U and ' +
    '²³⁵U are primordial, so their series still run in nature; ²³⁷Np is not, and its series is extinct apart from traces.',
  sources: [...SOURCES],
  color: '#eda100',
  items: DECAY_SERIES.map(seriesItem),
  // Each series bows a little deeper than the last, so the four Po → Pb arcs fan apart.
  style: { flow: true, bow: 0.5, bowSpread: 0.1 },
  caveat:
    'Arcs join elements, so one arc can stand for several nuclide steps (Po → Pb carries three in the uranium series). ' +
    'Branches under 1% are not drawn.',
});
