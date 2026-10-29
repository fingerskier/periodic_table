// Element symbols in atomic-number order (index 0 = Z 1). Lets relation modules name elements
// by symbol without loading the full dataset; tests assert it matches elements.json.
export const SYMBOLS = [
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
  'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
  'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
  'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
] as const;

export type ElementSymbol = (typeof SYMBOLS)[number];

const Z_BY_SYMBOL: ReadonlyMap<string, number> = new Map(SYMBOLS.map((s, i) => [s, i + 1]));

/** Atomic number for a symbol; throws on unknown symbols so typos fail loudly in tests. */
export function z(symbol: ElementSymbol | string): number {
  const n = Z_BY_SYMBOL.get(symbol);
  if (n === undefined) throw new Error(`Unknown element symbol: ${symbol}`);
  return n;
}

/** Map a list of symbols to atomic numbers. */
export function zs(...symbols: (ElementSymbol | string)[]): number[] {
  return symbols.map(z);
}

export function symbolOf(atomicNumber: number): string {
  const s = SYMBOLS[atomicNumber - 1];
  if (s === undefined) throw new Error(`No element with Z = ${atomicNumber}`);
  return s;
}

/** Atomic numbers of the noble gases, which close each period. */
export const PERIOD_ENDS = [2, 10, 18, 36, 54, 86, 118] as const;
