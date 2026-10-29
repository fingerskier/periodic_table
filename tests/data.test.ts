import { describe, expect, it } from 'vitest';
import raw from '../src/data/elements.json';
import { SYMBOLS } from '../src/data/symbols';
import type { CategoryId, ElementData, GoldschmidtClass, Phase } from '../src/types';

const ELEMENTS = raw as unknown as ElementData[];
const ROWS = raw as unknown as Record<string, unknown>[];
const bySymbol = (s: string): ElementData => {
  const e = ELEMENTS.find((x) => x.symbol === s);
  if (!e) throw new Error(`no ${s}`);
  return e;
};
const symbols = (pred: (e: ElementData) => boolean): string[] => ELEMENTS.filter(pred).map((e) => e.symbol);

const CATEGORY_IDS: readonly CategoryId[] = [
  'alkali-metal',
  'alkaline-earth-metal',
  'transition-metal',
  'post-transition-metal',
  'metalloid',
  'reactive-nonmetal',
  'noble-gas',
  'lanthanide',
  'actinide',
];

type Kind = 'int' | 'number' | 'string' | 'boolean' | 'int[]' | 'string[]';
// Keyed by every ElementData field, so adding a field to the contract fails type-checking here.
const SCHEMA: Record<keyof ElementData, { kind: Kind; nullable?: boolean; values?: readonly string[] }> = {
  z: { kind: 'int' },
  symbol: { kind: 'string' },
  name: { kind: 'string' },
  mass: { kind: 'number' },
  massIsMassNumber: { kind: 'boolean' },
  category: { kind: 'string', values: CATEGORY_IDS },
  config: { kind: 'string' },
  en: { kind: 'number', nullable: true },
  ie1: { kind: 'number', nullable: true },
  ea: { kind: 'number', nullable: true },
  atomicRadius: { kind: 'number', nullable: true },
  covalentRadius: { kind: 'number', nullable: true },
  vdwRadius: { kind: 'number', nullable: true },
  mp: { kind: 'number', nullable: true },
  bp: { kind: 'number', nullable: true },
  density: { kind: 'number', nullable: true },
  phase: { kind: 'string', nullable: true, values: ['solid', 'liquid', 'gas'] satisfies Phase[] },
  oxidationStates: { kind: 'int[]' },
  discoveryYear: { kind: 'int', nullable: true },
  discoverers: { kind: 'string', nullable: true },
  radioactive: { kind: 'boolean' },
  goldschmidt: {
    kind: 'string',
    nullable: true,
    values: ['lithophile', 'siderophile', 'chalcophile', 'atmophile', 'synthetic'] satisfies GoldschmidtClass[],
  },
  pettifor: { kind: 'int', nullable: true },
  abundanceCrust: { kind: 'number', nullable: true },
  predicted: { kind: 'string[]' },
  notes: { kind: 'string[]' },
};
const FIELDS = Object.keys(SCHEMA);

function matches(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case 'int':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string' && value.length > 0;
    case 'boolean':
      return typeof value === 'boolean';
    case 'int[]':
      return Array.isArray(value) && value.every((v) => Number.isInteger(v));
    case 'string[]':
      return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0);
  }
}

const CORE_ELECTRONS: Record<string, number> = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
const CAPACITY: Record<string, number> = { s: 2, p: 6, d: 10, f: 14 };

/** Electrons in a configuration such as "[Xe] 4f14 5d10 6s2", checking each token's form. */
function electronCount(config: string): number {
  const [first, ...rest] = config.split(' ');
  let total = 0;
  const tokens = first?.startsWith('[') ? rest : config.split(' ');
  if (first?.startsWith('[')) {
    const core = /^\[([A-Z][a-z]?)\]$/.exec(first)?.[1];
    if (core === undefined || CORE_ELECTRONS[core] === undefined) throw new Error(`bad core in "${config}"`);
    total += CORE_ELECTRONS[core]!;
  }
  for (const t of tokens) {
    const m = /^([1-7])([spdf])([1-9]\d?)$/.exec(t);
    if (!m) throw new Error(`bad subshell "${t}" in "${config}"`);
    const count = Number(m[3]);
    if (count > CAPACITY[m[2]!]!) throw new Error(`overfull ${t} in "${config}"`);
    total += count;
  }
  return total;
}

// Neighbours whose masses do not increase with Z. The first four are genuine inversions of standard
// atomic weights, set by isotopic composition; the rest compare mass numbers of longest-lived
// isotopes (or an atomic weight with a mass number), which need not follow Z.
const NON_INCREASING: readonly (readonly [string, string])[] = [
  ['Ar', 'K'], // 40Ar dominates argon, 39K potassium
  ['Co', 'Ni'], // monoisotopic 59Co; nickel is mostly 58Ni
  ['Te', 'I'], // tellurium is rich in 128Te and 130Te; iodine is monoisotopic 127I
  ['Th', 'Pa'], // 232Th against 231Pa
  ['U', 'Np'], // atomic weight of U (mostly 238U) against the mass number 237 of Np
  ['Pu', 'Am'], // [244] against [243]
  ['Cm', 'Bk'], // [247] = [247]
  ['Bh', 'Hs'], // [270] = [270]
  ['Ts', 'Og'], // [294] = [294]
];

// The 34 elements without a CIAAW standard atomic weight.
const NO_STANDARD_ATOMIC_WEIGHT = [
  'Tc', 'Pm', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac',
  ...SYMBOLS.slice(92), // Np onward
];

describe('elements.json shape', () => {
  it('has 118 rows, Z = index + 1, symbols in SYMBOLS order, unique names', () => {
    expect(ELEMENTS).toHaveLength(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
    expect(ELEMENTS.map((e) => e.symbol)).toEqual([...SYMBOLS]);
    expect(new Set(ELEMENTS.map((e) => e.name)).size).toBe(118);
  });

  it('has exactly the ElementData keys, in contract order, with the right types', () => {
    for (const row of ROWS) {
      expect(Object.keys(row)).toEqual(FIELDS);
      for (const [field, spec] of Object.entries(SCHEMA)) {
        const value = row[field];
        const ok = (spec.nullable === true && value === null) || matches(value, spec.kind);
        expect(ok, `${String(row.symbol)}.${field} = ${JSON.stringify(value)}`).toBe(true);
        if (spec.values?.length && value !== null) expect(spec.values).toContain(value);
      }
    }
  });

  it('puts every element in one of the 9 categories', () => {
    for (const e of ELEMENTS) expect(CATEGORY_IDS).toContain(e.category);
    expect(new Set(ELEMENTS.map((e) => e.category))).toEqual(new Set(CATEGORY_IDS));
  });

  it('names only real ElementData keys in predicted, each with a value, in contract order', () => {
    for (const e of ELEMENTS) {
      for (const f of e.predicted) {
        expect(FIELDS).toContain(f);
        expect(e[f as keyof ElementData], `${e.symbol}.${f} is predicted but null`).not.toBeNull();
      }
      expect(e.predicted).toEqual(FIELDS.filter((f) => e.predicted.includes(f)));
    }
  });

  it('keeps notes short and final', () => {
    for (const e of ELEMENTS) {
      for (const n of e.notes) {
        expect(n.length).toBeLessThanOrEqual(240);
        expect(n).not.toMatch(/temporary/i);
      }
    }
  });
});

describe('elements.json content', () => {
  it('counts lanthanides La–Lu and actinides Ac–Lr (IUPAC IR-3.5)', () => {
    const lan = symbols((e) => e.category === 'lanthanide');
    const act = symbols((e) => e.category === 'actinide');
    expect(lan).toEqual(SYMBOLS.slice(56, 71));
    expect(act).toEqual(SYMBOLS.slice(88, 103));
    expect(lan[0]).toBe('La');
    expect(lan[14]).toBe('Lu');
    expect(act[0]).toBe('Ac');
    expect(act[14]).toBe('Lr');
  });

  it('has exactly 11 gases and 2 liquids at 298.15 K', () => {
    expect(symbols((e) => e.phase === 'gas')).toEqual(['H', 'He', 'N', 'O', 'F', 'Ne', 'Cl', 'Ar', 'Kr', 'Xe', 'Rn']);
    expect(symbols((e) => e.phase === 'liquid')).toEqual(['Br', 'Hg']);
    expect(bySymbol('Cs').phase).toBe('solid');
    expect(bySymbol('Ga').phase).toBe('solid');
  });

  it('derives each phase from mp and bp', () => {
    for (const e of ELEMENTS) {
      if (e.phase === 'gas') expect(e.bp!).toBeLessThan(298.15);
      if (e.phase === 'liquid') {
        expect(e.mp!).toBeLessThan(298.15);
        expect(e.bp!).toBeGreaterThanOrEqual(298.15);
      }
      if (e.phase === 'solid') expect(e.mp ?? e.bp!).toBeGreaterThanOrEqual(298.15);
      if (e.mp !== null && e.bp !== null) expect(e.bp).toBeGreaterThan(e.mp);
    }
  });

  it('matches spot values', () => {
    expect(bySymbol('Fe').mass).toBe(55.845);
    expect(bySymbol('H').en).toBe(2.2);
    expect(bySymbol('He').ie1).toBeCloseTo(24.587, 3);
    expect(bySymbol('C').config).toBe('[He] 2s2 2p2');
    expect(bySymbol('Fe').config).toBe('[Ar] 3d6 4s2');
    expect(bySymbol('Fe').oxidationStates).toEqual([2, 3]);
    expect(bySymbol('O').oxidationStates).toEqual([-2]);
    expect(bySymbol('F').oxidationStates).toEqual([-1]);
    expect(bySymbol('Hg').mp).toBeCloseTo(234.321, 3);
    expect(bySymbol('At').ea).toBeCloseTo(2.41578, 5);
    expect(bySymbol('Os').ea).toBeCloseTo(1.0778, 4);
    expect(bySymbol('Po').category).toBe('post-transition-metal');
    expect(bySymbol('H').category).toBe('reactive-nonmetal');
    expect(bySymbol('I').category).toBe('reactive-nonmetal');
  });

  it('writes every configuration with explicit counts that add up to Z', () => {
    for (const e of ELEMENTS) expect(electronCount(e.config), e.symbol).toBe(e.z);
  });

  it('flags calculated configurations from Lr on and estimated electron affinities', () => {
    // Lr's 7p1 is calculated; its measured IE1 supports the configuration but does not measure it.
    expect(symbols((e) => e.predicted.includes('config'))).toEqual(SYMBOLS.slice(102));
    expect(bySymbol('Lr').notes.some((n) => /7p1 configuration is predicted/.test(n))).toBe(true);
    // Tc's 0.55(20) eV is an estimate; the others are calculations.
    expect(symbols((e) => e.predicted.includes('ea'))).toEqual(['Tc', 'Yb', 'Fr', 'Ra', 'Ac', 'Og']);
  });

  it("notes the covalent radii that are means of Cordero et al.'s separate values", () => {
    const averaged = symbols((e) => e.notes.some((n) => n.startsWith('Covalent radius is the mean')));
    expect(averaged).toEqual(['C', 'Mn', 'Fe', 'Co']);
    expect(bySymbol('C').covalentRadius).toBe(73); // mean of 76, 73 and 69 pm
    expect(bySymbol('Fe').covalentRadius).toBe(142); // mean of 132 and 152 pm
  });

  it('notes shared or disputed discovery credit (Ac; Lr, Rf, Db per IUPAC/IUPAP 1993)', () => {
    const shared = symbols((e) => e.notes.some((n) => /shared the discovery credit/.test(n)));
    expect(shared).toEqual(['Lr', 'Rf', 'Db']);
    expect(bySymbol('Ac').notes.some((n) => /disputed.*Giesel.*1902/.test(n))).toBe(true);
  });

  it('credits elements 115 and 117 to Dubna, Livermore and Oak Ridge (IUPAC/IUPAP, Karol et al. 2016)', () => {
    for (const s of ['Mc', 'Ts']) {
      const by = bySymbol(s).discoverers ?? '';
      for (const lab of ['Joint Institute for Nuclear Research', 'Livermore', 'Oak Ridge']) expect(by, s).toContain(lab);
    }
    // The year is the first atoms' (2003, Dubna and Livermore); the credited experiments began in 2010.
    expect(bySymbol('Mc').discoveryYear).toBe(2003);
    expect(
      bySymbol('Mc').notes.some((n) => /credited the discovery to Dubna, Livermore and Oak Ridge for experiments from 2010/.test(n)),
    ).toBe(true);
    for (const s of ['Fl', 'Lv', 'Og']) expect(bySymbol(s).discoverers, s).not.toMatch(/Oak Ridge/);
  });

  it('flags mass numbers exactly for elements without a standard atomic weight', () => {
    expect(symbols((e) => e.massIsMassNumber)).toEqual(NO_STANDARD_ATOMIC_WEIGHT);
    for (const s of NO_STANDARD_ATOMIC_WEIGHT) expect(Number.isInteger(bySymbol(s).mass), s).toBe(true);
    for (const s of ['Bi', 'Th', 'Pa', 'U']) expect(bySymbol(s).massIsMassNumber, s).toBe(false);
    expect(bySymbol('Th').mass).toBeCloseTo(232.0377, 4);
    expect(bySymbol('U').mass).toBeCloseTo(238.02891, 5);
  });

  it('increases mass with Z except at the listed, explained neighbours', () => {
    const exceptions: string[][] = [];
    for (let i = 1; i < ELEMENTS.length; i++) {
      const [a, b] = [ELEMENTS[i - 1]!, ELEMENTS[i]!];
      if (b.mass <= a.mass) exceptions.push([a.symbol, b.symbol]);
    }
    expect(exceptions).toEqual(NON_INCREASING.map((p) => [...p]));
  });

  it('lists oxidation states ascending without duplicates', () => {
    for (const e of ELEMENTS) {
      expect(e.oxidationStates).toEqual([...new Set(e.oxidationStates)].sort((a, b) => a - b));
      expect(e.oxidationStates.includes(0)).toBe(false);
    }
  });

  // Common states: the CRC Handbook periodic table's list with the departures in docs/DATA.md.
  it('lists the common oxidation states that the database main list missed', () => {
    const ox = (s: string): number[] => bySymbol(s).oxidationStates;
    expect(ox('Cu')).toEqual([1, 2]);
    expect(ox('Au')).toEqual([1, 3]);
    expect(ox('V')).toEqual([2, 3, 4, 5]);
    expect(ox('Cr')).toEqual([2, 3, 6]);
    expect(ox('Mn')).toEqual([2, 3, 4, 7]);
    expect(ox('Re')).toEqual([4, 6, 7]);
    expect(ox('Os')).toEqual([3, 4, 8]);
    expect(ox('N')).toEqual([-3, -2, -1, 1, 2, 3, 4, 5]);
    for (const s of ['U', 'Np', 'Pu', 'Am']) expect(ox(s), s).toEqual([3, 4, 5, 6]);
    expect(ox('No')).toEqual([2, 3]);
  });

  // periodic-table.org and PubChem reproduce the CRC lists differently for these six (docs/DATA.md).
  it('keeps the documented choice where the two reproductions of the reference list differ', () => {
    const ox = (s: string): number[] => bySymbol(s).oxidationStates;
    expect(ox('C')).toEqual([-4, 2, 4]);
    expect(ox('Si')).toEqual([-4, 4]);
    expect(ox('Br')).toEqual([-1, 1, 3, 5]);
    expect(ox('Tc')).toEqual([4, 7]);
    expect(ox('Pd')).toEqual([2, 4]);
    expect(ox('At')).toEqual([-1, 1]);
  });

  it('leaves out states found in only a few compounds (Ge and Sn −4; S, Se and Te +2)', () => {
    const ox = (s: string): number[] => bySymbol(s).oxidationStates;
    expect(ox('Ge')).toEqual([2, 4]);
    expect(ox('Sn')).toEqual([2, 4]);
    expect(ox('Pb')).toEqual([2, 4]);
    for (const s of ['S', 'Se', 'Te']) expect(ox(s), s).toEqual([-2, 4, 6]);
    expect(ox('O')).toEqual([-2]);
  });

  it('gives Rf–Hs the group state shown by single-atom chemistry, and no state from Mt on', () => {
    ['Rf', 'Db', 'Sg', 'Bh', 'Hs'].forEach((s, i) => expect(bySymbol(s).oxidationStates, s).toEqual([4 + i]));
    for (const s of ['Db', 'Sg', 'Bh', 'Hs']) {
      expect(bySymbol(s).notes.some((n) => /^Oxidation state \+\d is established with single atoms/.test(n)), s).toBe(true);
    }
    // Only the noble gases without characterised compounds and the superheavies from Mt on (no
    // established compound chemistry: unstudied, or adsorption experiments only) have none.
    expect(symbols((e) => e.oxidationStates.length === 0)).toEqual(['He', 'Ne', 'Ar', 'Rn', ...SYMBOLS.slice(108)]);
    expect(bySymbol('Kr').oxidationStates).toEqual([2]);
    expect(bySymbol('Xe').oxidationStates).toEqual([2, 4, 6]);
  });

  it('keeps discovery fields consistent and the radioactive flag sane', () => {
    for (const e of ELEMENTS) {
      if (e.discoveryYear === null) expect(e.discoverers, e.symbol).toBeNull();
      else expect(e.discoveryYear).toBeGreaterThan(1600);
    }
    expect(symbols((e) => e.radioactive)).toEqual(['Tc', 'Pm', ...SYMBOLS.slice(83)]);
  });

  it('keeps gas densities at ideal-gas magnitude and everything else above 0.5 g/cm³', () => {
    for (const e of ELEMENTS) {
      if (e.density === null) continue;
      if (e.phase === 'gas') expect(e.density).toBeLessThan(0.01);
      else expect(e.density).toBeGreaterThan(0.5);
    }
  });
});
