import { COLUMN_COUNT, PERIOD_COUNT } from '../layout/table';
import { BLOCK_COLORS, CATEGORIES } from '../ui/palette';
import type { Block, BuildContext, CategoryId, LayerBuilder, RelationSet, Source } from '../types';
import { madelungOrder, periodOfSubshell } from './madelung';

const IUPAC_TABLE: Source = {
  label: 'IUPAC Periodic Table of the Elements',
  url: 'https://iupac.org/what-we-do/periodic-table-of-elements/',
};
const RED_BOOK: Source = {
  label: 'Connelly et al. (eds.), Nomenclature of Inorganic Chemistry: IUPAC Recommendations 2005, IR-3.5',
  url: 'https://iupac.org/what-we-do/books/redbook/',
};
/** Where the element data comes from (the dataset is generated from it). */
export const DATASET_SOURCE: Source = {
  label: 'L. M. Mentel, mendeleev: a Python resource for properties of chemical elements (source of the dataset)',
  url: 'https://github.com/lmmentel/mendeleev',
};
const GROUP3_REPORT: Source = {
  label: 'E. Scerri, "Provisional report on discussions on group 3 of the periodic table", Chem. Int. 43(1) (2021) 31–34',
  url: 'https://doi.org/10.1515/ci-2021-0115',
};

export function symbolFor(ctx: BuildContext, z: number): string {
  return ctx.byZ.get(z)?.symbol ?? `Z${z}`;
}

/**
 * Compact list of atomic numbers by symbol: runs of three or more consecutive Z become ranges,
 * e.g. [57, 72, 73, …, 80] → "La, Hf–Hg".
 */
export function formatRanges(zs: readonly number[], symbol: (z: number) => string): string {
  const sorted = [...new Set(zs)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    const run = sorted.slice(i, j + 1);
    if (run.length >= 3) parts.push(`${symbol(run[0]!)}–${symbol(run[run.length - 1]!)}`);
    else parts.push(...run.map(symbol));
    i = j + 1;
  }
  return parts.join(', ');
}

function periodSubshells(period: number): string[] {
  return madelungOrder.filter((s) => periodOfSubshell(s) === period).map((s) => s.name);
}

export const periodsLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const items: RelationSet[] = [];
  const fullRings: number[] = [];
  for (let p = 1; p <= PERIOD_COUNT; p++) {
    const members = ctx.layout.membersOfPeriod(p);
    if (members.length === COLUMN_COUNT) fullRings.push(p);
    items.push({
      kind: 'set',
      id: `p${p}`,
      label: `Period ${p}`,
      members,
      note: `${formatRanges(members, sym)} · ${members.length} elements · fills ${periodSubshells(p).join(', ')}`,
    });
  }
  const rings = fullRings.length === 1 ? `Period ${fullRings[0]} runs` : `Periods ${fullRings.join(' and ')} run`;
  return {
    id: 'periods',
    title: 'Periods',
    section: 'Structure',
    summary: 'One hub per row; the full rings stack as wheels.',
    description:
      `Each period is a hub with a spoke to every member. ${rings} all the way round the cylinder, ` +
      'and a full ring puts its hub on the axis, so the layer reads as stacked wheels; the shorter periods ' +
      'fan out from off-axis hubs on the side they occupy. Every period ends at a noble gas, which the seam ' +
      "joins to the next period's alkali metal. A period's length is set by the subshells filling across it.",
    sources: [IUPAC_TABLE, RED_BOOK],
    color: '#3987e5',
    items,
    style: { hubDepth: 0.45 },
    defaultOn: true,
  };
};

function groupNote(ctx: BuildContext, group: number, members: number[]): string | undefined {
  const sym = (z: number) => symbolFor(ctx, z);
  if (group === 1) return 'Hydrogen heads the column by convention; it is a nonmetal, not an alkali metal.';
  if (group === 18) return 'Helium sits here for its closed shell and inertness, although its 1s² configuration is s-block.';
  if (group !== 3) return undefined;
  const list = members.map(sym).join(', ');
  return ctx.layout.convention === 'Lu'
    ? `${list}: the arrangement favoured by IUPAC's 2021 provisional report; the alternative puts La and Ac here.`
    : `${list}: the older arrangement; IUPAC's 2021 provisional report favours Lu and Lr here instead.`;
}

export const groupsLayer: LayerBuilder = (ctx) => {
  const items: RelationSet[] = [];
  for (let g = 1; g <= 18; g++) {
    const members = ctx.layout.membersOfColumn(ctx.layout.columnOfGroup(g));
    const note = groupNote(ctx, g, members);
    items.push({ kind: 'set', id: `g${g}`, label: `Group ${g}`, members, ...(note ? { note } : {}) });
  }
  const group3 = items[2]!.members.map((z) => symbolFor(ctx, z)).join(', ');
  return {
    id: 'groups',
    title: 'Groups',
    section: 'Structure',
    summary: 'One hub per IUPAC group, 1–18.',
    description:
      'The eighteen IUPAC groups, each a hub with spokes to its column, top to bottom. Elements in a group ' +
      'typically share their outer-electron pattern and much of their chemistry. The f-block columns belong to no ' +
      `group. Group 3 here holds ${group3}, following the group-3 convention selected.`,
    sources: [
      {
        label: 'E. Fluck, "New notations in the periodic table", Pure Appl. Chem. 60 (1988) 431–436',
        url: 'https://doi.org/10.1351/pac198860030431',
      },
      RED_BOOK,
      GROUP3_REPORT,
    ],
    color: '#1baf7a',
    items,
    style: { hubDepth: 0.4 },
  };
};

const BLOCK_ORDER: readonly Block[] = ['s', 'p', 'd', 'f'];

function blockNote(ctx: BuildContext, block: Block, members: number[]): string {
  const sym = (z: number) => symbolFor(ctx, z);
  const n = members.length;
  switch (block) {
    case 's': return `Groups 1–2 plus He (1s²) · ${n} elements`;
    case 'p': return `Groups 13–18 except He · ${n} elements`;
    case 'd': {
      const g3 = ctx.layout.membersOfColumn(ctx.layout.columnOfGroup(3)).map(sym).join(', ');
      return `Groups 3–12, with ${g3} in group 3 · ${n} elements`;
    }
    case 'f': return `${formatRanges(members, sym)} · ${n} elements`;
  }
}

export const blocksLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const byBlock = new Map<Block, number[]>(BLOCK_ORDER.map((b) => [b, []]));
  for (const cell of [...ctx.layout.cells.values()].sort((a, b) => a.z - b.z)) byBlock.get(cell.block)!.push(cell.z);
  const items: RelationSet[] = BLOCK_ORDER.filter((b) => byBlock.get(b)!.length > 0).map((b) => {
    const members = byBlock.get(b)!;
    return { kind: 'set', id: `block-${b}`, label: `${b}-block`, members, color: BLOCK_COLORS[b], note: blockNote(ctx, b, members) };
  });
  const fBlock = formatRanges(byBlock.get('f')!, sym);
  const current = ctx.layout.convention === 'Lu'
    ? `With Sc-Y-Lu-Lr in group 3 (shown), La and Ac open the f-block and Lu and Lr are d-block, so the f-block is ${fBlock}; the alternative, Sc-Y-La-Ac, swaps those four.`
    : `With Sc-Y-La-Ac in group 3 (shown), La and Ac are d-block and the f-block is ${fBlock}; the alternative, Sc-Y-Lu-Lr, swaps those four.`;
  return {
    id: 'blocks',
    title: 'Blocks',
    section: 'Structure',
    summary: 's, p, d and f blocks by position.',
    description:
      "Each block is named for the subshell that, by position, receives an element's differentiating " +
      'electron: s (groups 1–2 and He), p (groups 13–18), d (groups 3–12) and f (the fourteen inner columns). ' +
      `Membership depends on the group-3 convention. ${current}`,
    sources: [
      {
        label: 'W. B. Jensen, "The positions of lanthanum (actinium) and lutetium (lawrencium) in the periodic table", J. Chem. Educ. 59 (1982) 634–636',
        url: 'https://doi.org/10.1021/ed059p634',
      },
      GROUP3_REPORT,
    ],
    color: '#c98500',
    items,
    style: { hubDepth: 0.5 },
    caveat:
      'Blocks here are positional. Ground states do not always agree: La is [Xe] 5d¹ 6s² and Th is ' +
      "[Rn] 6d² 7s², with no f electron, and lawrencium's outermost electron is 7p rather than 6d; " +
      'He is s-block yet sits over the p-block noble gases.',
  };
};

const CORE_METALLOIDS = ['B', 'Si', 'Ge', 'As', 'Sb', 'Te'];
const COUNT_WORDS: Readonly<Record<number, string>> = { 7: 'Seven', 8: 'Eight', 9: 'Nine' };

function categoryNote(ctx: BuildContext, id: CategoryId, members: number[]): string | undefined {
  const sym = (z: number) => symbolFor(ctx, z);
  const symbols = members.map(sym);
  switch (id) {
    case 'metalloid': {
      const extra = symbols.filter((s) => !CORE_METALLOIDS.includes(s));
      const here = extra.length ? ` This dataset also counts ${extra.join(', ')}.` : '';
      return `The six most often listed are ${CORE_METALLOIDS.join(', ')}; C, Al, Se, Po and At appear on some lists but not others.${here}`;
    }
    case 'transition-metal':
      return symbols.includes('Zn')
        ? "Includes group 12 (Zn, Cd, Hg), as many tables do, although IUPAC's definition (an atom or cation with an incomplete d subshell) leaves them out."
        : "Group 12 is left out, following IUPAC's definition: an atom or cation with an incomplete d subshell.";
    case 'post-transition-metal':
      return 'An informal class with no IUPAC definition; sources draw its border with the metalloids differently.';
    case 'reactive-nonmetal': {
      const halogens = ctx.layout.membersOfColumn(ctx.layout.columnOfGroup(17)).filter((z) => members.includes(z)).map(sym);
      return `An informal grouping that includes hydrogen and the halogens ${halogens.join(', ')}, which are a group rather than a class.`;
    }
    case 'lanthanide':
    case 'actinide': {
      const [first, last] = id === 'lanthanide' ? ['La', 'Lu'] : ['Ac', 'Lr'];
      const inGroup3 = ctx.layout.membersOfColumn(ctx.layout.columnOfGroup(3)).map(sym).filter((s) => s === first || s === last);
      const here = inGroup3.length ? ` (here ${inGroup3.join(', ')})` : '';
      return `${first}–${last} per IUPAC: ${members.length} elements for 14 f-block columns, so one of ${first} and ${last} sits in group 3${here}.`;
    }
    default:
      return undefined;
  }
}

export const categoriesLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const elements = [...ctx.elements].sort((a, b) => a.z - b.z);
  const items: RelationSet[] = [];
  for (const cat of CATEGORIES) {
    const members = elements.filter((e) => e.category === cat.id).map((e) => e.z);
    if (members.length === 0) continue;
    const note = categoryNote(ctx, cat.id, members);
    items.push({ kind: 'set', id: `cat-${cat.id}`, label: cat.label, members, color: cat.color, ...(note ? { note } : {}) });
  }
  const superheavy = elements.filter((e) => e.z >= 104).map((e) => e.z);
  const extrapolated = superheavy.length ? ` Classes for ${formatRanges(superheavy, sym)} are extrapolated from position, not observed.` : '';
  const count = COUNT_WORDS[items.length] ?? String(items.length);
  return {
    id: 'categories',
    title: 'Categories',
    section: 'Structure',
    summary: `${count} metallicity classes, coloured as in the category legend.`,
    description:
      `${count} classes from alkali metals to noble gases, one hub per class. Halogens are a group (column 17) ` +
      'rather than a class, so they appear among the reactive nonmetals; lanthanides and actinides follow ' +
      'IUPAC (La–Lu, Ac–Lr) whichever group-3 convention is shown.',
    sources: [
      RED_BOOK,
      { label: 'IUPAC Gold Book: transition element', url: 'https://goldbook.iupac.org/terms/view/T06456' },
      {
        label: 'R. E. Vernon, "Which elements are metalloids?", J. Chem. Educ. 90 (2013) 1703–1707',
        url: 'https://doi.org/10.1021/ed3008457',
      },
    ],
    color: '#9085e9',
    items,
    style: { hubDepth: 0.5 },
    caveat:
      'The boundaries are conventions, not natural kinds: metalloid lists differ between sources, group 12 ' +
      'is counted among the transition metals by some tables and not others, and La–Lu and Ac–Lr give ' +
      `fifteen lanthanides and fifteen actinides for fourteen f-block columns.${extrapolated}`,
  };
};
