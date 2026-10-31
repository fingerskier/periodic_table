import type { Group3Convention, Source } from '../types';

// Static content for the eighteen IUPAC groups; columns.ts assembles ColumnInfo from it.
//
// Labels: the old American CAS system lettered main groups A and transition groups B; the old
// European IUPAC system lettered the left of the table A and the right B and called the noble gases
// group 0. Both put groups 8–10 under one heading: VIII (old IUPAC), VIIIB (CAS). Fluck (1988) gives
// both beside 1–18.
//
// Names: 'iupac' only for the collective names approved in the Red Book 2005, IR-3.5 (whose
// alkali metals exclude hydrogen). 'Triels' and 'tetrels', common in the noncovalent-bonding
// literature, are not among them, and 'icosagens' and 'crystallogens' are rarely used, so groups 13
// and 14 carry their usual informal names.
//
// Valence patterns: the configuration shared by every naturally occurring member when there is
// one (so group 11 is d¹⁰ s¹), otherwise the Madelung form; the note names the members that differ.

export interface GroupContent {
  group: number;
  /** Old CAS (American) label. */
  casLabel: string;
  /** Old IUPAC (European) label. */
  oldIupacLabel: string;
  name: string | null;
  nameStatus: 'iupac' | 'common' | null;
  valencePattern: string;
  /** Group 3's members depend on the group-3 convention, and so does its note. */
  note: string | Readonly<Record<Group3Convention, string>>;
  /** Where the note's claims can be checked (numbers also match the element dataset). */
  sources: readonly Source[];
}

const RED_BOOK: Source = {
  label: 'N. G. Connelly et al. (eds.), Nomenclature of Inorganic Chemistry: IUPAC Recommendations 2005, RSC (2005), IR-3.5',
  url: 'https://iupac.org/what-we-do/books/redbook/',
};
const FLUCK_1988: Source = {
  label: 'E. Fluck, "New notations in the periodic table", Pure Appl. Chem. 60 (1988) 431–436',
  url: 'https://doi.org/10.1351/pac198860030431',
};
const NIST_ASD: Source = {
  label: 'NIST Atomic Spectra Database: ground levels and ionization energies',
  url: 'https://www.nist.gov/pml/atomic-spectra-database',
};
const GREENWOOD: Source = {
  label: 'N. N. Greenwood, A. Earnshaw, Chemistry of the Elements, 2nd ed., Butterworth-Heinemann (1997)',
};
const PYYKKO_1988: Source = {
  label: 'P. Pyykkö, "Relativistic effects in structural chemistry", Chem. Rev. 88 (1988) 563–594',
  url: 'https://doi.org/10.1021/cr00085a006',
};
const DATASET: Source = {
  label:
    'Element dataset of this app, built from mendeleev 1.3.0 (L. M. Mentel): melting points from W. M. Haynes (ed.), CRC Handbook of ' +
    'Chemistry and Physics, 97th ed. (2016); electron affinities from its 95th ed. (2014); ionization energies from the NIST ASD',
  url: 'https://github.com/lmmentel/mendeleev',
};

/** Sources behind the labels and names of every group. */
export const GROUP_LABEL_SOURCES: readonly Source[] = [FLUCK_1988, RED_BOOK];

const GROUP3_BASE =
  "Sc, Y and the lanthanides are IUPAC's rare earth metals; Y³⁺ matches Ho³⁺ in size, so Y occurs with the heavy lanthanides.";

export const GROUPS: readonly GroupContent[] = [
  {
    group: 1,
    casLabel: 'IA',
    oldIupacLabel: 'IA',
    name: 'Alkali metals',
    nameStatus: 'iupac',
    valencePattern: 'ns¹',
    note:
      "IUPAC's alkali metals are Li–Fr; hydrogen shares their ns¹ configuration but is a nonmetal. " +
      "Francium's first ionization energy (4.07 eV) exceeds caesium's (3.89 eV) because relativity stabilises its 7s electron.",
    sources: [
      RED_BOOK,
      NIST_ASD,
      {
        label: 'S. V. Andreev, V. S. Letokhov, V. I. Mishin, "Laser resonance photoionization spectroscopy of Rydberg levels in Fr", Phys. Rev. Lett. 59 (1987) 1274–1276',
        url: 'https://doi.org/10.1103/PhysRevLett.59.1274',
      },
      PYYKKO_1988,
    ],
  },
  {
    group: 2,
    casLabel: 'IIA',
    oldIupacLabel: 'IIA',
    name: 'Alkaline earth metals',
    nameStatus: 'iupac',
    valencePattern: 'ns²',
    note:
      "IUPAC's alkaline earth metals include Be and Mg. Beryllium is the outlier: its oxide and hydroxide are " +
      "amphoteric and its compounds largely covalent, closer to aluminium's than to magnesium's.",
    sources: [RED_BOOK, GREENWOOD],
  },
  {
    group: 3,
    casLabel: 'IIIB',
    oldIupacLabel: 'IIIA',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d¹ ns²',
    note: {
      Lu: `${GROUP3_BASE} Lu (4f¹⁴ 5d¹ 6s²) repeats the d¹ s² of Sc and Y over a full 4f shell; relativity is predicted to make Lr 7s² 7p¹.`,
      La: `${GROUP3_BASE} La (5d¹ 6s²) and Ac (6d¹ 7s²) share the d¹ s² of Sc and Y and have no f electron.`,
    },
    sources: [
      RED_BOOK,
      {
        label: 'R. D. Shannon, "Revised effective ionic radii and systematic studies of interatomic distances in halides and chalcogenides", Acta Cryst. A32 (1976) 751–767',
        url: 'https://doi.org/10.1107/S0567739476001551',
      },
      {
        label: 'W. B. Jensen, "The positions of lanthanum (actinium) and lutetium (lawrencium) in the periodic table", J. Chem. Educ. 59 (1982) 634–636',
        url: 'https://doi.org/10.1021/ed059p634',
      },
      {
        label: 'T. K. Sato et al., "Measurement of the first ionization potential of lawrencium, element 103", Nature 520 (2015) 209–211',
        url: 'https://doi.org/10.1038/nature14342',
      },
      {
        label: 'E. Scerri, "Provisional report on discussions on group 3 of the periodic table", Chem. Int. 43(1) (2021) 31–34',
        url: 'https://doi.org/10.1515/ci-2021-0115',
      },
      NIST_ASD,
    ],
  },
  {
    group: 4,
    casLabel: 'IVB',
    oldIupacLabel: 'IVA',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d² ns²',
    note:
      'The lanthanide contraction makes hafnium almost exactly the size of zirconium, so the two always occur together ' +
      'and Hf was found only in 1923; reactor-grade Zr must be freed of Hf, a strong neutron absorber.',
    sources: [
      {
        label: 'D. Coster, G. von Hevesy, "On the missing element of atomic number 72", Nature 111 (1923) 79',
        url: 'https://doi.org/10.1038/111079a0',
      },
      {
        label: 'V. F. Sears, "Neutron scattering lengths and cross sections", Neutron News 3 (1992) 26–37 (NIST table)',
        url: 'https://www.ncnr.nist.gov/resources/n-lengths/',
      },
      GREENWOOD,
    ],
  },
  {
    group: 5,
    casLabel: 'VB',
    oldIupacLabel: 'VA',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d³ ns²',
    note:
      'Niobium (4d⁴ 5s¹) breaks the (n−1)d³ ns² pattern. The lanthanide contraction makes Nb and Ta so alike that ' +
      'Wollaston judged them a single element in 1809.',
    sources: [
      NIST_ASD,
      {
        label: 'W. H. Wollaston, "On the identity of columbium and tantalum", Phil. Trans. R. Soc. Lond. 99 (1809) 246–252',
        url: 'https://www.jstor.org/stable/107264',
      },
      GREENWOOD,
    ],
  },
  {
    group: 6,
    casLabel: 'VIB',
    oldIupacLabel: 'VIA',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d⁴ ns²',
    note:
      'Cr and Mo take the half-filled (n−1)d⁵ ns¹ configuration, while W has the regular 5d⁴ 6s². ' +
      'Tungsten has the highest melting point of any metal.',
    sources: [NIST_ASD, DATASET],
  },
  {
    group: 7,
    casLabel: 'VIIB',
    oldIupacLabel: 'VIIA',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d⁵ ns²',
    note:
      'Technetium (Z = 43) is the lightest element with no stable isotope, and rhenium, found in 1925, ' +
      'was the last element with a stable isotope to be discovered.',
    sources: [
      {
        label: 'C. Perrier, E. Segrè, "Some chemical properties of element 43", J. Chem. Phys. 5 (1937) 712–716',
        url: 'https://doi.org/10.1063/1.1750105',
      },
      {
        label: 'W. Noddack, I. Tacke, O. Berg, "Die Ekamangane", Naturwissenschaften 13 (1925) 567–574',
        url: 'https://doi.org/10.1007/BF01558746',
      },
    ],
  },
  {
    group: 8,
    casLabel: 'VIIIB',
    oldIupacLabel: 'VIII',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d⁶ ns²',
    note:
      'Ru (4d⁷ 5s¹) breaks the (n−1)d⁶ ns² pattern. Ru and Os reach +8 in the volatile tetroxides RuO₄ and OsO₄; ' +
      "hassium's volatile tetroxide (Düllmann et al. 2002) confirmed its place here.",
    sources: [
      NIST_ASD,
      GREENWOOD,
      {
        label: 'Ch. E. Düllmann et al., "Chemical investigation of hassium (element 108)", Nature 418 (2002) 859–862',
        url: 'https://doi.org/10.1038/nature00980',
      },
    ],
  },
  {
    group: 9,
    casLabel: 'VIIIB',
    oldIupacLabel: 'VIII',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d⁷ ns²',
    note:
      'Rh (4d⁸ 5s¹) breaks the (n−1)d⁷ ns² pattern. Iridium reaches +9 in the gas-phase cation IrO₄⁺ ' +
      '(Wang et al. 2014), the highest oxidation state observed for any element.',
    sources: [
      NIST_ASD,
      {
        label: 'G. Wang et al., "Identification of an iridium-containing compound with a formal oxidation state of IX", Nature 514 (2014) 475–477',
        url: 'https://doi.org/10.1038/nature13795',
      },
    ],
  },
  {
    group: 10,
    casLabel: 'VIIIB',
    oldIupacLabel: 'VIII',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d⁸ ns²',
    note:
      'Its three natural members have three different ground states: Ni 3d⁸ 4s², Pd 4d¹⁰ ' +
      '(the only element with no outer s electron) and Pt 5d⁹ 6s¹.',
    sources: [NIST_ASD],
  },
  {
    group: 11,
    casLabel: 'IB',
    oldIupacLabel: 'IB',
    name: 'Coinage metals',
    nameStatus: 'common',
    valencePattern: '(n−1)d¹⁰ ns¹',
    note:
      "Relativity narrows gold's 5d→6s gap, moving an absorption that is ultraviolet in silver into the visible (so gold " +
      "looks yellow), and lifts gold's electron affinity to 2.31 eV, enough to form Au⁻ in CsAu. Rg is predicted to be 6d⁹ 7s².",
    sources: [
      {
        label: 'P. Pyykkö, J.-P. Desclaux, "Relativity and the periodic system of elements", Acc. Chem. Res. 12 (1979) 276–281',
        url: 'https://doi.org/10.1021/ar50140a002',
      },
      PYYKKO_1988,
      DATASET,
    ],
  },
  {
    group: 12,
    casLabel: 'IIB',
    oldIupacLabel: 'IIB',
    name: null,
    nameStatus: null,
    valencePattern: '(n−1)d¹⁰ ns²',
    note:
      "Their d¹⁰ subshell stays full in the usual +2 ions, so IUPAC's definition of a transition element (an incomplete " +
      "d subshell) leaves them out. Relativity lowers mercury's melting point by about 105 K (Calvo et al. 2013), so it is liquid.",
    sources: [
      { label: 'IUPAC Gold Book: transition element', url: 'https://goldbook.iupac.org/terms/view/T06456' },
      {
        label: 'F. Calvo, E. Pahl, M. Wormit, P. Schwerdtfeger, "Evidence for low-temperature melting of mercury owing to relativity", Angew. Chem. Int. Ed. 52 (2013) 7583–7585',
        url: 'https://doi.org/10.1002/anie.201302742',
      },
    ],
  },
  {
    group: 13,
    casLabel: 'IIIA',
    oldIupacLabel: 'IIIB',
    name: 'Boron group',
    nameStatus: 'common',
    valencePattern: 'ns² np¹',
    note:
      'Boron is a metalloid; Al, Ga, In and Tl are metals. The +1 state gains stability down the group (the inert-pair ' +
      'effect): thallium is usually Tl⁺, which is toxic in part because it mimics K⁺.',
    sources: [
      GREENWOOD,
      {
        label: 'R. Osorio-Rico, A. Santamaría, S. Galván-Arzate, "Thallium toxicity: general issues, neurological symptoms, and neurotoxic mechanisms", Adv. Neurobiol. 18 (2017) 345–353',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28889276/',
      },
    ],
  },
  {
    group: 14,
    casLabel: 'IVA',
    oldIupacLabel: 'IVB',
    name: 'Carbon group',
    nameStatus: 'common',
    valencePattern: 'ns² np²',
    note:
      'The inert-pair effect makes +2 the stable state of lead, so PbO₂ is a strong oxidant, the positive plate of a ' +
      'lead–acid cell. Tin, with the magic proton number 50, has ten stable isotopes, more than any other element.',
    sources: [
      GREENWOOD,
      {
        label: 'J. Meija et al., "Isotopic compositions of the elements 2013 (IUPAC Technical Report)", Pure Appl. Chem. 88 (2016) 293–306',
        url: 'https://doi.org/10.1515/pac-2015-0503',
      },
    ],
  },
  {
    group: 15,
    casLabel: 'VA',
    oldIupacLabel: 'VB',
    name: 'Pnictogens',
    nameStatus: 'iupac',
    valencePattern: 'ns² np³',
    note:
      'Bismuth-209, long taken as the heaviest stable nuclide, α-decays with a half-life of about 2 × 10¹⁹ years ' +
      '(de Marcillac et al. 2003). The inert-pair effect makes Bi(V), as in NaBiO₃, a strong oxidant.',
    sources: [
      RED_BOOK,
      {
        label: 'P. de Marcillac et al., "Experimental detection of α-particles from the radioactive decay of natural bismuth", Nature 422 (2003) 876–878',
        url: 'https://doi.org/10.1038/nature01541',
      },
      GREENWOOD,
    ],
  },
  {
    group: 16,
    casLabel: 'VIA',
    oldIupacLabel: 'VIB',
    name: 'Chalcogens',
    nameStatus: 'iupac',
    valencePattern: 'ns² np⁴',
    note:
      'S, Se and Te bond to themselves in rings and chains (S₈ rings; helical chains in grey Se and in Te), whereas ' +
      'oxygen forms O₂ molecules. Polonium is the only element that crystallises in a simple cubic lattice at ambient pressure.',
    sources: [
      RED_BOOK,
      GREENWOOD,
      {
        label: 'D. Legut, M. Friák, M. Šob, "Why is polonium simple cubic and so highly anisotropic?", Phys. Rev. Lett. 99 (2007) 016402',
        url: 'https://doi.org/10.1103/PhysRevLett.99.016402',
      },
    ],
  },
  {
    group: 17,
    casLabel: 'VIIA',
    oldIupacLabel: 'VIIB',
    name: 'Halogens',
    nameStatus: 'iupac',
    valencePattern: 'ns² np⁵',
    note:
      'Fluorine is the most electronegative element, yet chlorine has the highest electron affinity (3.61 eV against ' +
      "3.40 eV for F): an added electron is more strongly repelled in fluorine's small 2p shell.",
    sources: [RED_BOOK, DATASET],
  },
  {
    group: 18,
    casLabel: 'VIIIA',
    oldIupacLabel: '0',
    name: 'Noble gases',
    nameStatus: 'iupac',
    valencePattern: 'ns² np⁶ (He: 1s²)',
    note:
      'Helium (1s²) is an s-block atom, placed here for its closed shell and chemical inertness. ' +
      'Noble-gas chemistry began in 1962, when Bartlett oxidised xenon with PtF₆.',
    sources: [
      RED_BOOK,
      {
        label: 'N. Bartlett, "Xenon hexafluoroplatinate(V) Xe⁺[PtF₆]⁻", Proc. Chem. Soc. (1962) 218',
        url: 'https://doi.org/10.1039/PS9620000197',
      },
      GREENWOOD,
    ],
  },
];

/** Content for IUPAC group 1..18. */
export function groupContent(group: number): GroupContent {
  const content = GROUPS[group - 1];
  if (!Number.isInteger(group) || content === undefined) throw new RangeError(`group ${group}`);
  return content;
}

/** The note for a group under a group-3 convention. */
export function groupNote(content: GroupContent, convention: Group3Convention): string {
  return typeof content.note === 'string' ? content.note : content.note[convention];
}
