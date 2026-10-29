import { COLUMN_COUNT } from '../layout/table';
import type { BuildContext, Cell, LayerBuilder, RelationEdge, RelationSet, RelationSetChain } from '../types';
import {
  differingSubshells,
  formatConfiguration,
  madelungConfiguration,
  madelungExceptions,
  madelungOrder,
  parseConfiguration,
  subshellForCell,
  type SubshellCounts,
} from './madelung';
import { DATASET_SOURCE, formatRanges, symbolFor } from './structural';

/** Ground-state configurations beyond lawrencium come from calculation, not measurement. */
const LAST_MEASURED_Z = 103;

function sortedCells(ctx: BuildContext): Cell[] {
  return [...ctx.layout.cells.values()].sort((a, b) => a.z - b.z);
}

function stepNote(a: Cell, b: Cell, sym: (z: number) => string): string | undefined {
  if (b.period !== a.period) {
    return `${sym(a.z)} closes period ${a.period}; across the seam, ${sym(b.z)} opens period ${b.period}.`;
  }
  const gap = Math.abs(b.column - a.column);
  if (gap === COLUMN_COUNT - 1) return `${sym(a.z)} and ${sym(b.z)} sit either side of the seam.`;
  if (gap > 1) return `Leaps ${gap - 1} empty columns of period ${a.period}.`;
  return undefined;
}

export const atomicNumberLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const cells = sortedCells(ctx);
  const edges: RelationEdge[] = [];
  for (let i = 0; i + 1 < cells.length; i++) {
    const a = cells[i]!;
    const b = cells[i + 1]!;
    if (b.z !== a.z + 1) continue;
    const note = stepNote(a, b, sym);
    edges.push({ a: a.z, b: b.z, label: `${sym(a.z)} → ${sym(b.z)}`, ...(note ? { note } : {}) });
  }
  const first = cells[0];
  const last = cells[cells.length - 1];
  const span = first && last ? `${sym(first.z)} → ${sym(last.z)}` : 'Z order';
  return {
    id: 'atomic-number',
    title: 'Atomic-number path',
    section: 'Sequences',
    summary: 'Z → Z + 1 from H to Og: a helix round the cylinder.',
    description:
      "Atomic number Z, the nuclear charge that Moseley's X-ray spectra of 1913 tied to place in the table, " +
      'orders the elements; it settles the pairs where atomic mass would swap neighbours (Ar/K, Co/Ni, Te/I). The path steps ' +
      'from each element to the next. Within a period the columns advance with Z, leaping the empty f- and ' +
      "d-columns of the shorter periods; on the cylinder each period's last element, a noble gas, hops " +
      "across the seam to the next period's first, so from period 2 on the path winds round as a helix, " +
      'one turn per period.',
    sources: [
      {
        label: 'H. G. J. Moseley, "The high-frequency spectra of the elements", Phil. Mag. 26 (1913) 1024–1034',
        url: 'https://doi.org/10.1080/14786441308635052',
      },
      { label: 'IUPAC Periodic Table of the Elements', url: 'https://iupac.org/what-we-do/periodic-table-of-elements/' },
    ],
    color: '#cde2fb',
    items: [{ kind: 'edges', id: 'z-path', label: `Atomic number, ${span}`, edges, directed: true, note: `${edges.length} steps of one unit of Z.` }],
    style: { bow: 0.12, flow: true },
  };
};

function pick(counts: SubshellCounts, names: readonly string[]): SubshellCounts {
  return new Map(names.filter((n) => counts.has(n)).map((n) => [n, counts.get(n)!]));
}

/** Caption for an exception: the subshells that differ, recorded vs predicted, e.g. "3d⁵ 4s¹, not 3d⁴ 4s²". */
function deviationLabel(z: number, config: string): string {
  const actual = parseConfiguration(config);
  const predicted = madelungConfiguration(z);
  const diff = differingSubshells(actual, predicted);
  return `${formatConfiguration(pick(actual, diff))}, not ${formatConfiguration(pick(predicted, diff))}`;
}

export const madelungLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const bySubshell = new Map<string, number[]>(madelungOrder.map((s) => [s.name, []]));
  for (const cell of sortedCells(ctx)) bySubshell.get(subshellForCell(cell))?.push(cell.z);

  const chain: RelationSetChain = {
    kind: 'setChain',
    id: 'madelung-order',
    label: `Filling order, ${madelungOrder[0]!.name} → ${madelungOrder[madelungOrder.length - 1]!.name}`,
    sets: madelungOrder.map((s) => {
      const members = bySubshell.get(s.name)!;
      return {
        id: `sub-${s.name}`,
        label: s.name,
        members,
        note: `n + ℓ = ${s.n + s.l} · holds ${s.capacity} · ${formatRanges(members, sym)}`,
      };
    }),
    note: 'Hubs in filling order; each gathers the elements whose period and block put their differentiating electron in that subshell.',
  };

  const exceptions = madelungExceptions(ctx.elements);
  const measured = exceptions.filter((z) => z <= LAST_MEASURED_Z);
  const predicted = exceptions.filter((z) => z > LAST_MEASURED_Z);
  const memberLabels: Record<number, string> = {};
  for (const z of exceptions) memberLabels[z] = deviationLabel(z, ctx.byZ.get(z)!.config);
  const beyond = predicted.length
    ? ` Beyond Lr (Z > ${LAST_MEASURED_Z}) configurations are theoretical predictions, not measurements; those listed here (${predicted.map(sym).join(', ')}) follow the dataset.`
    : ` Beyond Lr (Z > ${LAST_MEASURED_Z}) configurations are theoretical predictions, not measurements.`;
  const exceptionSet: RelationSet = {
    kind: 'set',
    id: 'madelung-exceptions',
    label: 'Exceptions to the rule',
    members: exceptions,
    color: '#9085e9',
    memberLabels,
    note: `${measured.length} elements up to Lr whose ground state differs from the rule's prediction: ${measured.map(sym).join(', ')}.${beyond}`,
  };

  return {
    id: 'madelung',
    title: 'Madelung filling order',
    section: 'Sequences',
    summary: 'Subshells in n + ℓ order, and the ground states that break it.',
    description:
      'The Madelung rule (also called the n + ℓ or Klechkowski rule) fills subshells in order of increasing ' +
      `n + ℓ, and for equal n + ℓ in order of increasing n: ${madelungOrder.map((s) => s.name).join(' ')}. ` +
      'The chain joins one hub per subshell in that order. Each hub gathers the elements whose period and ' +
      'block place their differentiating electron there (ns and np in period n, (n−1)d, (n−2)f; He counts as 1s), ' +
      `so the chain walks the table period by period. A separate hub gathers the ${exceptions.length} elements ` +
      'whose recorded ground state breaks the rule, each captioned with the subshells that differ.',
    sources: [
      { label: 'E. Madelung, Die mathematischen Hilfsmittel des Physikers, 3rd ed. (Springer, Berlin, 1936)' },
      {
        label: 'NIST Standard Reference Database 111: Ground levels and ionization energies for the neutral atoms',
        url: 'https://www.nist.gov/pml/ground-levels-and-ionization-energies-neutral-atoms',
      },
      {
        label: 'T. L. Meek, L. C. Allen, "Configuration irregularities: deviations from the Madelung rule and inversion of orbital energy levels", Chem. Phys. Lett. 362 (2002) 362–364',
        url: 'https://doi.org/10.1016/S0009-2614(02)00919-3',
      },
      {
        label: 'T. K. Sato et al., "Measurement of the first ionization potential of lawrencium, element 103", Nature 520 (2015) 209–211',
        url: 'https://doi.org/10.1038/nature14342',
      },
      DATASET_SOURCE,
    ],
    color: '#eb6834',
    items: [chain, exceptionSet],
    style: { flow: true, hubDepth: 0.55 },
    caveat:
      'The rule is an empirical summary of the order in which subshells are occupied along the table, not a ' +
      'ranking of orbital energies inside any one atom; ions often follow a different order (Fe²⁺ is [Ar] 3d⁶, ' +
      `not [Ar] 3d⁴ 4s²). Up to Lr, ${measured.length} ground states deviate, usually by one or two electrons ` +
      'moving between subshells close in energy. Configurations beyond Lr are calculated, not measured.',
  };
};

export const pettiforLayer: LayerBuilder = (ctx) => {
  const sym = (z: number) => symbolFor(ctx, z);
  const ranked = ctx.elements
    .filter((e) => e.pettifor !== null && ctx.layout.cells.has(e.z))
    .sort((a, b) => a.pettifor! - b.pettifor! || a.z - b.z);
  const edges: RelationEdge[] = [];
  for (let i = 0; i + 1 < ranked.length; i++) {
    const a = ranked[i]!;
    const b = ranked[i + 1]!;
    edges.push({ a: a.z, b: b.z, label: `${a.symbol} → ${b.symbol}`, note: `Scale positions ${a.pettifor} → ${b.pettifor}` });
  }
  const first = ranked[0];
  const last = ranked[ranked.length - 1];
  const span = first && last ? `${sym(first.z)} (${first.pettifor}) → ${sym(last.z)} (${last.pettifor})` : 'no data';
  const offScale = ctx.elements.filter((e) => e.pettifor === null).map((e) => e.z);
  return {
    id: 'pettifor',
    title: 'Pettifor chemical scale',
    section: 'Sequences',
    summary: "Pettifor's one-dimensional ordering of the elements.",
    description:
      'Pettifor (1984) placed the elements along a single chemical scale, ordered so that binary compounds ' +
      'with the same crystal structure fall into compact domains on a structure map whose two axes are the ' +
      `scale positions of the constituent elements. The path visits the ${ranked.length} elements on the scale ` +
      `in order, ${span}: down the noble gases, back up the alkali and alkaline-earth metals, through the rare ` +
      'earths and actinides, across the transition metals group by group and on through the p-block, with ' +
      'Be, Mg, B, C, N, O, F and H set apart from their groups.',
    sources: [
      {
        label: 'D. G. Pettifor, "A chemical scale for crystal-structure maps", Solid State Commun. 51 (1984) 31–34',
        url: 'https://doi.org/10.1016/0038-1098(84)90765-8',
      },
      {
        label: 'H. Glawe et al., "The optimal one dimensional periodic table: a modified Pettifor chemical scale from data mining", New J. Phys. 18 (2016) 093011',
        url: 'https://doi.org/10.1088/1367-2630/18/9/093011',
      },
      DATASET_SOURCE,
    ],
    color: '#d55181',
    items: [{ kind: 'edges', id: 'pettifor-path', label: `Scale order, ${span}`, edges, directed: true, note: `${edges.length} steps along the scale.` }],
    style: { bow: 0.35, flow: true },
    caveat:
      'An empirical ordering chosen to separate structure types on a map, not a measured property. ' +
      (offScale.length ? `${formatRanges(offScale, sym)} are not on the scale. ` : '') +
      'Data-mined revisions (Glawe et al. 2016) keep much of the order but move several elements, the nonmetals especially.',
  };
};
