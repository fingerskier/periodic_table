import { z } from '../data/symbols';
import type { ElementSymbol } from '../data/symbols';
import type { BuildContext, ElementData, LayerBuilder, RelationEdge, Source } from '../types';

// Literature-derived pair relations. Compound facts (boiling points, structures, solubilities) are
// not in the dataset, so they are stated with their sources; element numbers come from ctx.

const GREENWOOD: Source = {
  label: 'N. N. Greenwood & A. Earnshaw, Chemistry of the Elements, 2nd edn, Butterworth-Heinemann (1997)',
  url: 'https://doi.org/10.1016/C2009-0-30414-6',
};
const SHANNON: Source = {
  label: 'R. D. Shannon, "Revised effective ionic radii and systematic studies of interatomic distances in halides and chalcogenides", Acta Cryst. A32 (1976) 751–767',
  url: 'https://doi.org/10.1107/S0567739476001551',
};
const CORDERO: Source = {
  label: 'B. Cordero et al., "Covalent radii revisited", Dalton Trans. (2008) 2832–2838 (covalent radii in the dataset)',
  url: 'https://doi.org/10.1039/b801115j',
};

function pair(a: ElementSymbol, b: ElementSymbol, note: string, label = `${a}–${b}`): RelationEdge {
  return { a: z(a), b: z(b), label, note };
}

function element(ctx: BuildContext, symbol: ElementSymbol): ElementData {
  const e = ctx.byZ.get(z(symbol));
  if (!e) throw new Error(`No data for ${symbol}`);
  return e;
}

// ---------------------------------------------------------------- diagonal relationship

export const diagonalLayer: LayerBuilder = () => ({
  id: 'diagonal',
  title: 'Diagonal relationship',
  section: 'Chemistry',
  summary: 'Li–Mg, Be–Al and B–Si: light elements that resemble their lower-right neighbour.',
  description:
    'Each of the first three period-2 elements resembles, in several ways, the element one period down and ' +
    'one group to the right more than its own heavier congener: lithium behaves like magnesium, beryllium ' +
    'like aluminium, boron like silicon. Periods 2 and 3 have no d-block, so aluminium is the ' +
    "right-hand neighbour of beryllium's column one row down. The usual explanation is similar charge density: " +
    'moving right raises it and moving down lowers it, so the two changes roughly cancel along the diagonal.',
  sources: [
    {
      label: 'T. P. Hanusa, "Reexamining the diagonal relationships", J. Chem. Educ. 64 (1987) 686',
      url: 'https://doi.org/10.1021/ed064p686',
    },
    {
      label: 'G. Rayner-Canham, "Isodiagonality in the periodic table", Found. Chem. 13 (2011) 121–129',
      url: 'https://doi.org/10.1007/s10698-011-9108-y',
    },
    GREENWOOD,
  ],
  color: '#eda100',
  items: [
    {
      kind: 'edges',
      id: 'diagonal-pairs',
      label: 'Diagonal pairs',
      directed: false,
      edges: [
        pair(
          'Li',
          'Mg',
          'Lithium is the only alkali metal that, like magnesium, combines directly with N₂ to form a nitride ' +
            '(Li₃N, Mg₃N₂); both burn in air to the normal oxide (Li₂O, MgO) rather than a peroxide or superoxide.',
        ),
        pair(
          'Be',
          'Al',
          'Both hydroxides are amphoteric, dissolving in excess alkali as beryllate and aluminate, whereas ' +
            'Mg(OH)₂ does not dissolve.',
        ),
        pair(
          'B',
          'Si',
          'Both form weakly acidic, glass-forming oxides (B₂O₃, SiO₂; borosilicate glass combines them), ' +
            'whereas aluminium oxide is amphoteric.',
        ),
      ],
    },
  ],
  style: { bow: 0.75 },
  caveat:
    'A tendency, not a law: it is clear only for these three period-2/period-3 pairs and weakens beyond ' +
    'period 3, and in most respects each element still follows its own group.',
});

// ---------------------------------------------------------------- group n and n + 10

/** Edge from the group-n element (a) to its group-(n + 10) partner (b). */
function linkage(n: ElementSymbol, n10: ElementSymbol, groups: string, note: string): RelationEdge {
  return pair(n, n10, note, `${n}–${n10} (groups ${groups})`);
}

export const nPlus10Layer: LayerBuilder = () => ({
  id: 'n-plus-10',
  title: 'Group n and n+10',
  section: 'Chemistry',
  summary: 'Main-group elements paired with the transition metal ten groups away, in matching oxidation states.',
  description:
    'Eight-column tables, before the 18-column form, put groups n and n + 10 together: manganese beside ' +
    'chlorine in group VII, chromium beside sulfur in group VI. Rayner-Canham (2013) surveyed the resemblance ' +
    'systematically. It shows in matching compounds and ions in the same oxidation state (here always the old ' +
    'group number, from +2 for Mg and Zn to +8 for Os and Xe), species he calls pseudo-isoelectronic. Each arc ' +
    'joins a transition metal to its main-group partner and names one documented match.',
  sources: [
    {
      label: 'G. Rayner-Canham, "Periodic patterns: the Group (n) and Group (n + 10) linkage", Found. Chem. 15 (2013) 229–237',
      url: 'https://doi.org/10.1007/s10698-012-9169-6',
    },
    {
      label: 'G. Rayner-Canham, "Isoelectronic series: a fundamental periodic property", Found. Chem. 11 (2009) 123–129',
      url: 'https://doi.org/10.1007/s10698-008-9055-4',
    },
    SHANNON,
    {
      label: 'W. O. Milligan & J. L. McAtee, "Crystal structure of γ-AlOOH and γ-ScOOH", J. Phys. Chem. 60 (1956) 273–277',
      url: 'https://doi.org/10.1021/j150537a005',
    },
    GREENWOOD,
  ],
  color: '#e87ba4',
  items: [
    {
      kind: 'edges',
      id: 'n-plus-10-pairs',
      label: 'Group n and n + 10 pairs',
      directed: false,
      edges: [
        linkage(
          'Mg',
          'Zn',
          '2, 12',
          'Mg²⁺ and Zn²⁺ are almost the same size (72 and 74 pm, Shannon, CN 6), so their salts are often ' +
            'isomorphous: epsomite MgSO₄·7H₂O and goslarite ZnSO₄·7H₂O share one structure.',
        ),
        linkage(
          'Sc',
          'Al',
          '3, 13',
          'Both form only noble-gas-core M³⁺ ions; both hydroxides are amphoteric, dissolving in excess strong ' +
            'alkali, and γ-ScOOH has the boehmite (γ-AlOOH) structure.',
        ),
        linkage(
          'Ti',
          'Si',
          '4, 14',
          'TiCl₄ and SiCl₄ are both colourless molecular liquids (bp 136 and 58 °C) that fume in moist air, ' +
            'hydrolysing to the dioxide and HCl.',
        ),
        linkage(
          'V',
          'P',
          '5, 15',
          'Vanadate mimics phosphate: vanadinite Pb₅(VO₄)₃Cl and pyromorphite Pb₅(PO₄)₃Cl are isostructural ' +
            'apatite-group minerals, and VOCl₃ and POCl₃ are both distillable liquids.',
        ),
        linkage(
          'Cr',
          'S',
          '6, 16',
          'Chromate and sulfate are tetrahedral MO₄²⁻ ions with isomorphous salts (K₂CrO₄, K₂SO₄); chromyl ' +
            'and sulfuryl chloride, CrO₂Cl₂ and SO₂Cl₂, are both volatile liquids that hydrolyse.',
        ),
        linkage(
          'Mn',
          'Cl',
          '7, 17',
          'Permanganate and perchlorate salts are isomorphous (KMnO₄, KClO₄), and Mn₂O₇ and Cl₂O₇ are both ' +
            'explosive covalent oils, the anhydrides of the strong acids HMnO₄ and HClO₄.',
        ),
        linkage('Os', 'Xe', '8, 18', 'Both reach the +8 state in volatile, tetrahedral tetroxides, OsO₄ and XeO₄.'),
      ],
    },
  ],
  style: { bow: 0.55 },
  caveat:
    'Only compounds match, not the elements (chlorine gas and manganese metal have little in common). One ' +
    'illustrative pair is shown per group pair: the period-3 element with its period-4 partner, plus Xe–Os.',
});

// ---------------------------------------------------------------- knight's move

/** Edge from an element (a) to the one a period down and two groups right (b). */
function knight(a: ElementSymbol, b: ElementSymbol, state: string, note: string): RelationEdge {
  return pair(a, b, `Shared ${state} state: ${note}`, `${a}–${b} (${state})`);
}

export const knightsMoveLayer: LayerBuilder = () => ({
  id: 'knights-move',
  title: "Knight's move",
  section: 'Chemistry',
  summary: 'Lower-right metals that resemble the element one period down and two groups right.',
  description:
    'Laing (1999) named the pattern after the chess knight: among the metals in the lower right of the table, ' +
    'an element often resembles the one a period down and two groups to the right. Rayner-Canham and Oldford ' +
    '(2007) found that the systematic evidence lies in matching compounds in a shared oxidation state. In every ' +
    "pair shown, that state is the lower element's inert-pair state, two below its group valence.",
  sources: [
    { label: 'M. Laing, "The knight\'s move in the periodic table", Educ. Chem. 36 (1999) 160–161' },
    {
      label: "G. Rayner-Canham & M. Oldford, \"The chemical 'Knight's Move' relationship: what is its significance?\", Found. Chem. 9 (2007) 119–125",
      url: 'https://doi.org/10.1007/s10698-007-9034-1',
    },
    {
      label: 'K. W. Bagnall, R. W. M. D\'Eye & J. H. Freeman, "The polonium halides. Part I. Polonium chlorides", J. Chem. Soc. (1955) 2320',
      url: 'https://doi.org/10.1039/jr9550002320',
    },
    GREENWOOD,
  ],
  color: '#9085e9',
  items: [
    {
      kind: 'edges',
      id: 'knights-move-pairs',
      label: "Knight's-move pairs",
      directed: false,
      edges: [
        knight('Cu', 'In', '+1', 'Cu⁺ and In⁺ both disproportionate in water (2Cu⁺ → Cu + Cu²⁺; 3In⁺ → 2In + In³⁺).'),
        knight(
          'Ag',
          'Tl',
          '+1',
          'as with silver, thallium(I) fluoride is very soluble in water, while TlCl, TlBr and TlI are sparingly soluble.',
        ),
        knight(
          'Zn',
          'Sn',
          '+2',
          'Zn(OH)₂ and Sn(OH)₂ are both amphoteric, dissolving in excess alkali as [Zn(OH)₄]²⁻ and [Sn(OH)₃]⁻.',
        ),
        knight('Cd', 'Pb', '+2', 'lead(II) iodide crystallises in the layered cadmium iodide (CdI₂) structure type.'),
        knight(
          'In',
          'Bi',
          '+3',
          "the most stable state of both, indium's group valence and bismuth's inert-pair state (In(I) and Bi(V) " +
            'are the less stable alternatives).',
        ),
        knight(
          'Sn',
          'Po',
          '+4',
          "tin's group valence and polonium's commonest state; both form hexachloro salts, (NH₄)₂SnCl₆ and (NH₄)₂PoCl₆.",
        ),
      ],
    },
  ],
  style: { bow: 0.55 },
  caveat:
    'An empirical pattern with no accepted explanation; physical properties such as melting points show no ' +
    'consistent match (Rayner-Canham & Oldford 2007).',
});

// ---------------------------------------------------------------- lanthanide-contraction twins

interface Twin {
  /** Same-group 3d, 4d and 5d metals. */
  d3: ElementSymbol;
  d4: ElementSymbol;
  d5: ElementSymbol;
  /** Group-valence ions of the 4d and 5d metals with their Shannon (1976) radii, CN 6, pm. */
  ions: readonly [string, number, string, number];
  consequence: (ctx: BuildContext) => string;
}

const inYear = (e: ElementData): string => (e.discoveryYear === null ? '' : ` in ${e.discoveryYear}`);

const TWINS: readonly Twin[] = [
  {
    d3: 'Ti',
    d4: 'Zr',
    d5: 'Hf',
    ions: ['Zr⁴⁺', 72, 'Hf⁴⁺', 71],
    consequence: (ctx) =>
      `Hafnium hid in zirconium minerals until Coster and Hevesy found it by X-ray spectroscopy${inYear(element(ctx, 'Hf'))}.`,
  },
  {
    d3: 'V',
    d4: 'Nb',
    d5: 'Ta',
    ions: ['Nb⁵⁺', 64, 'Ta⁵⁺', 64],
    consequence: () =>
      'Wollaston (1809) judged them one element; Marignac (1866) separated them by crystallising K₂TaF₇ from ' +
      'more soluble K₂NbOF₅·H₂O.',
  },
  {
    d3: 'Cr',
    d4: 'Mo',
    d5: 'W',
    ions: ['Mo⁶⁺', 59, 'W⁶⁺', 60],
    consequence: () => 'Scheelite CaWO₄ and powellite CaMoO₄ are isostructural and form a solid-solution series.',
  },
];

function covalent(ctx: BuildContext, symbol: ElementSymbol): number | null {
  const r = element(ctx, symbol).covalentRadius;
  return r === null ? null : Math.round(r);
}

function twinNote(ctx: BuildContext, t: Twin): string {
  const radii = [t.d3, t.d4, t.d5].map((s) => [s, covalent(ctx, s)] as const);
  const known = radii.every(([, r]) => r !== null);
  const [ion4, r4, ion5, r5] = t.ions;
  const ionic = r4 === r5 ? `${ion4} and ${ion5} both ${r4} pm` : `${ion4} ${r4}, ${ion5} ${r5} pm`;
  const covalentPart = known ? `Covalent radius (Cordero 2008): ${radii.map(([s, r]) => `${s} ${r}`).join(', ')} pm; ` : '';
  return `${covalentPart}${ionic} (Shannon 1976, CN 6). ${t.consequence(ctx)}`;
}

/** "a–b" (or just "a") of rounded covalent-radius steps between two rows, for the description. */
function stepRange(ctx: BuildContext, from: (t: Twin) => ElementSymbol, to: (t: Twin) => ElementSymbol): string | null {
  const steps: number[] = [];
  for (const t of TWINS) {
    const a = covalent(ctx, from(t));
    const b = covalent(ctx, to(t));
    if (a === null || b === null) return null;
    steps.push(b - a);
  }
  const lo = Math.min(...steps);
  const hi = Math.max(...steps);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

export const lanthanideTwinsLayer: LayerBuilder = (ctx) => {
  const up = stepRange(ctx, (t) => t.d3, (t) => t.d4);
  const down = stepRange(ctx, (t) => t.d4, (t) => t.d5);
  const steps =
    up && down
      ? ` In these groups the step from 3d to 4d adds ${up} pm of covalent radius, the step from 4d to 5d only ${down} pm.`
      : '';
  return {
    id: 'lanthanide-twins',
    title: 'Lanthanide-contraction twins',
    section: 'Chemistry',
    summary: '4d and 5d metals made almost the same size by the lanthanide contraction.',
    description:
      'Between lanthanum and hafnium the 4f subshell fills. 4f electrons screen the growing nuclear charge ' +
      'poorly, so the 5d metals that follow are hardly larger than the 4d metals above them.' +
      steps +
      " The result is chemical near-twins, closest for zirconium and hafnium. Notes give the dataset's " +
      "single-bond covalent radii (Cordero et al. 2008) and Shannon's six-coordinate ionic radii in the group " +
      'oxidation state.',
    sources: [
      CORDERO,
      SHANNON,
      {
        label: 'D. Coster & G. Hevesy, "On the missing element of atomic number 72", Nature 111 (1923) 79',
        url: 'https://doi.org/10.1038/111079a0',
      },
      {
        label: 'W. H. Wollaston, "On the identity of columbium and tantalum", Phil. Trans. R. Soc. Lond. 99 (1809) 246–252',
        url: 'https://doi.org/10.1098/rstl.1809.0017',
      },
      {
        label: 'Á. Fernández-González, Á. Andara & M. Prieto, "Mixing properties and crystallization behaviour of the scheelite–powellite solid solution", Cryst. Growth Des. 7 (2007) 545–552',
        url: 'https://doi.org/10.1021/cg0606646',
      },
      GREENWOOD,
    ],
    color: '#6da7ec',
    items: [
      {
        kind: 'edges',
        id: 'lanthanide-twin-pairs',
        label: '4d/5d twins',
        directed: false,
        edges: TWINS.map((t) => pair(t.d4, t.d5, twinNote(ctx, t))),
      },
    ],
    style: { bow: 0.6 },
    caveat:
      'Twins in size, not in everything: higher oxidation states still grow more stable down a group (W(VI) is ' +
      'harder to reduce than Mo(VI)), and the likeness fades from group 4 to group 6.',
  };
};
