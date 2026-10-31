import { z } from '../data/symbols';
import type { ElementSymbol } from '../data/symbols';
import type { LayerBuilder, RelationSet } from '../types';

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Ion notation with Unicode superscripts: ionLabel('N', -3) → 'N³⁻', ionLabel('Na', 1) → 'Na⁺'. */
export function ionLabel(symbol: string, charge: number): string {
  if (charge === 0) return symbol;
  const size = Math.abs(charge);
  const digits = size === 1 ? '' : [...String(size)].map((d) => SUPERSCRIPT_DIGITS[Number(d)]).join('');
  return `${symbol}${digits}${charge > 0 ? '⁺' : '⁻'}`;
}

interface Series {
  gas: ElementSymbol;
  /** Common monatomic ions with the noble gas's electron count, as [symbol, charge]. */
  ions: readonly (readonly [ElementSymbol, number])[];
  /** Radii are Shannon (1976) effective ionic radii in pm, six-coordinate unless stated. */
  note: string;
}

const SERIES: readonly Series[] = [
  {
    gas: 'He',
    ions: [['H', -1], ['Li', 1], ['Be', 2]],
    note:
      'H⁻ is the anion of salt-like hydrides such as LiH and NaH. Li⁺ 76 pm and Be²⁺ 45 pm (Shannon, CN 6) ' +
      'show the shrinkage as nuclear charge rises.',
  },
  {
    gas: 'Ne',
    ions: [['N', -3], ['O', -2], ['F', -1], ['Na', 1], ['Mg', 2], ['Al', 3]],
    note:
      'Shannon radii (CN 6) fall as nuclear charge rises: O²⁻ 140, F⁻ 133, Na⁺ 102, Mg²⁺ 72, Al³⁺ 53.5 pm. ' +
      'N³⁻, the nitride ion of Li₃N, is listed only for CN 4 (146 pm).',
  },
  {
    gas: 'Ar',
    ions: [['P', -3], ['S', -2], ['Cl', -1], ['K', 1], ['Ca', 2], ['Sc', 3]],
    note:
      'Shannon radii (CN 6): S²⁻ 184, Cl⁻ 181, K⁺ 138, Ca²⁺ 100, Sc³⁺ 74.5 pm. P³⁻ occurs in salt-like ' +
      'phosphides such as Ca₃P₂, which water hydrolyses to phosphine.',
  },
  {
    gas: 'Kr',
    ions: [['Se', -2], ['Br', -1], ['Rb', 1], ['Sr', 2], ['Y', 3]],
    note:
      'Shannon radii (CN 6): Se²⁻ 198, Br⁻ 196, Rb⁺ 152, Sr²⁺ 118, Y³⁺ 90 pm. Zr⁴⁺ is left out: in water ' +
      'zirconium(IV) forms hydroxo-bridged ions such as [Zr₄(OH)₈(H₂O)₁₆]⁸⁺, not a simple aqua ion.',
  },
  {
    gas: 'Xe',
    ions: [['Te', -2], ['I', -1], ['Cs', 1], ['Ba', 2], ['La', 3]],
    note:
      'Shannon radii (CN 6): Te²⁻ 221, I⁻ 220, Cs⁺ 167, Ba²⁺ 135, La³⁺ 103.2 pm. Ce⁴⁺ is left out: in water ' +
      'cerium(IV) is strongly hydrolysed and forms oxo-bridged polynuclear species.',
  },
  {
    gas: 'Rn',
    ions: [['Fr', 1], ['Ra', 2], ['Ac', 3], ['Th', 4]],
    note:
      'Shannon radii: Fr⁺ 180, Ac³⁺ 112, Th⁴⁺ 94 pm (CN 6); Ra²⁺ 148 pm (CN 8). Francium is known only at ' +
      'tracer scale, where Fr⁺ co-precipitates with caesium salts.',
  },
];

function seriesSet(s: Series): RelationSet {
  const gasZ = z(s.gas);
  const labelled: [number, string][] = [[gasZ, s.gas], ...s.ions.map(([sym, q]): [number, string] => [z(sym), ionLabel(sym, q)])];
  labelled.sort((a, b) => a[0] - b[0]);
  return {
    kind: 'set',
    id: `iso-${s.gas.toLowerCase()}`,
    label: `${s.gas}-like ions (${gasZ} electrons)`,
    members: labelled.map(([n]) => n),
    anchor: gasZ,
    memberLabels: Object.fromEntries(labelled),
    note: `${gasZ} electrons. ${s.note}`,
  };
}

export const isoelectronicLayer: LayerBuilder = () => ({
  id: 'isoelectronic',
  title: 'Isoelectronic ions',
  section: 'Chemistry',
  summary: 'Each noble gas with the common ions that share its electron count.',
  description:
    'Each set joins a noble gas to the common monatomic ions with its electron count; size falls steadily as ' +
    "nuclear charge rises through a set. 'Common' means the element's ordinary ion in simple salts or in water: " +
    'hydride, nitride, phosphide, chalcogenide (O–Te) and halide anions of salt-like compounds, and cations that ' +
    'exist as simple aqua ions. Left out: B³⁺ and C⁴⁻ (formal only); Ti⁴⁺, Zr⁴⁺ and Ce⁴⁺ (water hydrolyses ' +
    "them to oxo- or hydroxo-bridged species); Po²⁻ (polonium's usual states are positive); At⁻ (its aqueous " +
    'speciation is unsettled). On the cylinder each set straddles the seam: anions other than H⁻ sit just ' +
    'before it, s-block cations just after.',
  sources: [
    {
      label: 'R. D. Shannon, "Revised effective ionic radii and systematic studies of interatomic distances in halides and chalcogenides", Acta Cryst. A32 (1976) 751–767',
      url: 'https://doi.org/10.1107/S0567739476001551',
    },
    {
      label: 'G. Rayner-Canham, "Isoelectronic series: a fundamental periodic property", Found. Chem. 11 (2009) 123–129',
      url: 'https://doi.org/10.1007/s10698-008-9055-4',
    },
    {
      label: 'N. N. Greenwood & A. Earnshaw, Chemistry of the Elements, 2nd edn, Butterworth-Heinemann (1997)',
      url: 'https://doi.org/10.1016/C2009-0-30414-6',
    },
    {
      label: 'P. L. Brown & C. Ekberg, Hydrolysis of Metal Ions, Wiley-VCH (2016) (aqua ions and their hydrolysis)',
      url: 'https://doi.org/10.1002/9783527656189',
    },
  ],
  color: '#e66767',
  items: SERIES.map(seriesSet),
  style: { hubDepth: 0.25 },
  caveat:
    "'Common' is a judgement call: hydride, nitride, phosphide and oxide ions do not survive in water, which " +
    'protonates them, and Fr⁺ is known only from tracer-scale chemistry.',
});
