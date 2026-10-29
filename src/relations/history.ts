import { z } from '../data/symbols';
import type { ElementSymbol } from '../data/symbols';
import type { BuildContext, ElementData, LayerBuilder, RelationEdge, RelationSet } from '../types';

function element(ctx: BuildContext, symbol: ElementSymbol): ElementData {
  const e = ctx.byZ.get(z(symbol));
  if (!e) throw new Error(`No data for ${symbol}`);
  return e;
}

const fixed2 = (n: number): string => n.toFixed(2);

// ---------------------------------------------------------------- Döbereiner's triads

type Triad = readonly [ElementSymbol, ElementSymbol, ElementSymbol];

const TRIADS: readonly { triad: Triad; family: string }[] = [
  { triad: ['Li', 'Na', 'K'], family: 'alkali metals' },
  { triad: ['Ca', 'Sr', 'Ba'], family: 'alkaline earths' },
  { triad: ['Cl', 'Br', 'I'], family: 'halogens' },
  { triad: ['S', 'Se', 'Te'], family: 'chalcogens' },
];

function triadNote(ctx: BuildContext, [lo, mid, hi]: Triad): string {
  const [a, b, c] = [element(ctx, lo), element(ctx, mid), element(ctx, hi)];
  const mean = (a.mass + c.mass) / 2;
  const diff = ((b.mass - mean) / mean) * 100;
  const side = diff < 0 ? 'below' : 'above';
  const steps = [z(mid) - z(lo), z(hi) - z(mid)];
  const zPart =
    steps[0] === steps[1]
      ? `Atomic numbers average exactly: Z rises by ${steps[0]} and ${steps[1]}.`
      : `Z rises by ${steps[0]} and ${steps[1]}.`;
  return (
    `Mean of ${lo} (${fixed2(a.mass)}) and ${hi} (${fixed2(c.mass)}): ${fixed2(mean)}; ` +
    `${mid} is ${fixed2(b.mass)}, ${Math.abs(diff).toFixed(1)}% ${side} it. ${zPart}`
  );
}

function triadSet(ctx: BuildContext, triad: Triad, family: string): RelationSet {
  return {
    kind: 'set',
    id: `triad-${triad.join('-').toLowerCase()}`,
    label: `${triad.join(' · ')} (${family})`,
    members: triad.map((s) => z(s)),
    note: triadNote(ctx, triad),
  };
}

export const dobereinerLayer: LayerBuilder = (ctx) => ({
  id: 'dobereiner',
  title: "Döbereiner's triads",
  section: 'History',
  summary: 'Triads of analogous elements whose middle member has about the mean atomic weight of the other two.',
  description:
    'In 1817 Döbereiner noticed that the combining weight of strontia (SrO) was the mean of those of lime ' +
    '(CaO) and baryta (BaO), as Wurzer reported that year. In 1829 he published further triads of analogous ' +
    "elements in which the middle member's atomic weight is close to the mean of the outer two: an early hint " +
    'of periodicity. The notes redo his test with modern standard atomic weights.',
  sources: [
    {
      label: 'J. W. Döbereiner, "Versuch zu einer Gruppirung der elementaren Stoffe nach ihrer Analogie", Ann. Phys. Chem. 91 (1829) 301–307',
      url: 'https://doi.org/10.1002/andp.18290910217',
    },
    {
      label: 'F. Wurzer, "Auszug eines Briefes vom Hofrath Wurzer, Prof. der Chemie zu Marburg", Ann. Phys. 56 (1817) 331–334',
      url: 'https://doi.org/10.1002/andp.18170560709',
    },
    {
      label: 'E. Scerri, The Periodic Table: Its Story and Its Significance, 2nd edn, Oxford University Press (2019)',
      url: 'https://doi.org/10.1093/oso/9780190914363.001.0001',
    },
  ],
  color: '#c98500',
  items: TRIADS.map(({ triad, family }) => triadSet(ctx, triad, family)),
  caveat:
    'Most elements fit no triad. The near-means reflect equal steps in atomic number down a group, which ' +
    'Döbereiner could not know; his own atomic weights also differed from modern values.',
});

// ---------------------------------------------------------------- Mendeleev's predictions

/** Year Mendeleev's detailed predictions were published. */
const PREDICTION_YEAR = 1871;

interface Prediction {
  analogue: ElementSymbol;
  predicted: ElementSymbol;
  name: string;
  /** One predicted-vs-measured comparison, with measured values from ctx. */
  compare: (e: ElementData) => string;
  /** Discovery story; `year` is from ctx (may be empty). */
  story: (year: string) => string;
}

const PREDICTIONS: readonly Prediction[] = [
  {
    analogue: 'B',
    predicted: 'Sc',
    name: 'eka-boron',
    compare: (e) => `predicted atomic weight 44; scandium's is ${fixed2(e.mass)}`,
    story: (year) => `Nilson isolated its oxide${year}, and Cleve identified it as eka-boron the same year.`,
  },
  {
    analogue: 'Al',
    predicted: 'Ga',
    name: 'eka-aluminium',
    compare: (e) =>
      e.density === null
        ? `predicted atomic weight 68; gallium's is ${fixed2(e.mass)}`
        : `predicted atomic weight 68 and density 5.9 g/cm³; gallium's are ${fixed2(e.mass)} and ${fixed2(e.density)}`,
    story: (year) =>
      `Lecoq de Boisbaudran found it by spectroscopy${year}; his first density, 4.7, was revised after Mendeleev disputed it.`,
  },
  {
    analogue: 'Si',
    predicted: 'Ge',
    name: 'eka-silicon',
    compare: (e) =>
      e.density === null
        ? `predicted atomic weight 72; germanium's is ${fixed2(e.mass)}`
        : `predicted atomic weight 72 and density 5.5 g/cm³; germanium's are ${fixed2(e.mass)} and ${fixed2(e.density)}`,
    story: (year) => `Winkler isolated it from the mineral argyrodite${year}.`,
  },
];

function predictionEdge(ctx: BuildContext, p: Prediction): RelationEdge {
  const e = element(ctx, p.predicted);
  const year = e.discoveryYear === null ? '' : ` in ${e.discoveryYear}`;
  const name = p.name[0]!.toUpperCase() + p.name.slice(1);
  return {
    a: z(p.analogue),
    b: z(p.predicted),
    label: `${p.analogue} → ${p.predicted} (${p.name})`,
    note: `${name}: ${p.compare(e)}. ${p.story(year)}`,
  };
}

/** "gallium (1875), scandium (1879) and germanium (1886)", in discovery order, from ctx. */
function discoveries(ctx: BuildContext): { list: string; span: number | null } {
  const found = PREDICTIONS.map((p) => element(ctx, p.predicted)).sort(
    (a, b) => (a.discoveryYear ?? Infinity) - (b.discoveryYear ?? Infinity),
  );
  const parts = found.map((e) => (e.discoveryYear === null ? e.name.toLowerCase() : `${e.name.toLowerCase()} (${e.discoveryYear})`));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
  const years = found.map((e) => e.discoveryYear).filter((y): y is number => y !== null);
  return { list, span: years.length === found.length ? Math.max(...years) - PREDICTION_YEAR : null };
}

export const mendeleevPredictionsLayer: LayerBuilder = (ctx) => {
  const { list, span } = discoveries(ctx);
  const within = span === null ? 'All were found later' : `All were found within ${span} years`;
  return {
    id: 'mendeleev',
    title: "Mendeleev's predictions",
    section: 'History',
    summary: 'Forecasts of 1871, drawn from each known analogue to the element later found.',
    description:
      `In ${PREDICTION_YEAR} Mendeleev used gaps in his table to forecast three unknown elements in detail, ` +
      "naming each with the Sanskrit 'eka' (one) after the known element one place above it: eka-boron, " +
      `eka-aluminium and eka-silicon. ${within}: ${list}. Arcs run from the analogue to the element ` +
      "predicted, and measured values are this dataset's. Scandium sat under boron in Mendeleev's group III " +
      'but belongs to group 3 of the 18-column table, so that arc crosses the d-block.',
    sources: [
      {
        label: 'D. Mendelejeff, "Die periodische Gesetzmässigkeit der chemischen Elemente", Ann. Chem. Pharm., Supplementband 8 (1871) 133–229',
      },
      {
        label: 'C. Winkler, "Germanium, Ge, ein neues, nichtmetallisches Element", Ber. Dtsch. Chem. Ges. 19 (1886) 210–211',
        url: 'https://doi.org/10.1002/cber.18860190156',
      },
      {
        label: 'E. Scerri, The Periodic Table: Its Story and Its Significance, 2nd edn, Oxford University Press (2019)',
        url: 'https://doi.org/10.1093/oso/9780190914363.001.0001',
      },
    ],
    color: '#86b6ef',
    items: [
      {
        kind: 'edges',
        id: 'mendeleev-predictions',
        label: 'Predicted elements',
        directed: true,
        edges: PREDICTIONS.map((p) => predictionEdge(ctx, p)),
      },
    ],
    style: { flow: true },
    caveat:
      'Not every forecast succeeded: some predicted elements were never found and several predicted values ' +
      'were off. These three are his celebrated successes.',
  };
};
