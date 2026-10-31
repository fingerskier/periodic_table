import { describe, expect, it } from 'vitest';
import {
  buildColumns,
  buildPeriods,
  configIsPredicted,
  describeDeparture,
  fColumnNote,
  fValencePattern,
  idealFCounts,
  parseConfig,
  PERIODS,
  prettyConfig,
  superscript,
} from '../src/data/columns';
import { BY_Z, ELEMENTS } from '../src/data/elements';
import { GROUP_LABEL_SOURCES, GROUPS, groupContent, groupNote } from '../src/data/groups';
import { symbolOf, z } from '../src/data/symbols';
import { buildLayout } from '../src/layout/table';
import type { CategoryId, ColumnInfo, ElementData, Group3Convention } from '../src/types';

const CONVENTIONS: Group3Convention[] = ['Lu', 'La'];
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const CAS = 'IA IIA IIIB IVB VB VIB VIIB VIIIB VIIIB VIIIB IB IIB IIIA IVA VA VIA VIIA VIIIA'.split(' ');
const OLD_IUPAC = 'IA IIA IIIA IVA VA VIA VIIA VIII VIII VIII IB IIB IIIB IVB VB VIB VIIB 0'.split(' ');
/** Red Book 2005 IR-3.5 collective names that coincide with a group. */
const IUPAC_NAMES: Readonly<Record<number, string>> = {
  1: 'Alkali metals',
  2: 'Alkaline earth metals',
  15: 'Pnictogens',
  16: 'Chalcogens',
  17: 'Halogens',
  18: 'Noble gases',
};
const GROUP_VALENCE = [
  'ns¹', 'ns²', '(n−1)d¹ ns²', '(n−1)d² ns²', '(n−1)d³ ns²', '(n−1)d⁴ ns²', '(n−1)d⁵ ns²', '(n−1)d⁶ ns²',
  '(n−1)d⁷ ns²', '(n−1)d⁸ ns²', '(n−1)d¹⁰ ns¹', '(n−1)d¹⁰ ns²', 'ns² np¹', 'ns² np²', 'ns² np³', 'ns² np⁴',
  'ns² np⁵', 'ns² np⁶ (He: 1s²)',
];
const PERIOD_SUBSHELLS = [
  ['1s'], ['2s', '2p'], ['3s', '3p'], ['4s', '3d', '4p'], ['5s', '4d', '5p'], ['6s', '4f', '5d', '6p'], ['7s', '5f', '6d', '7p'],
];
const CAPACITY: Readonly<Record<string, number>> = { s: 2, p: 6, d: 10, f: 14 };
const METALS: ReadonlySet<CategoryId> = new Set<CategoryId>([
  'alkali-metal', 'alkaline-earth-metal', 'transition-metal', 'post-transition-metal', 'lanthanide', 'actinide',
]);

function el(symbol: string): ElementData {
  const e = BY_Z.get(z(symbol));
  if (!e) throw new Error(`No dataset row for ${symbol}`);
  return e;
}

function columnsFor(convention: Group3Convention): ColumnInfo[] {
  return buildColumns(buildLayout(convention), BY_Z);
}

function groupInfo(columns: readonly ColumnInfo[], group: number): ColumnInfo {
  const info = columns.find((c) => c.group === group);
  if (!info) throw new Error(`No column for group ${group}`);
  return info;
}

const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const fromSuperscript = (s: string) => Number([...s].map((c) => SUPER.indexOf(c)).join(''));

/** All occupied subshells of an atom, with noble-gas cores expanded from the dataset itself. */
function fullConfig(atomicNumber: number): Map<string, number> {
  const parsed = parseConfig(BY_Z.get(atomicNumber)!.config);
  if (!parsed) throw new Error(`Unparseable configuration for Z = ${atomicNumber}`);
  const out = parsed.core === null ? new Map<string, number>() : fullConfig(z(parsed.core));
  for (const [name, n] of parsed.subshells) out.set(name, n);
  return out;
}

const MADELUNG = '1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p'.split(' ');

function madelung(atomicNumber: number): Map<string, number> {
  const out = new Map<string, number>();
  let left = atomicNumber;
  for (const name of MADELUNG) {
    if (left === 0) break;
    const n = Math.min(left, CAPACITY[name[1]!]!);
    out.set(name, n);
    left -= n;
  }
  return out;
}

function sameCounts(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].every((k) => (a.get(k) ?? 0) === (b.get(k) ?? 0));
}

const madelungExceptions = (zs: readonly number[]) => zs.filter((n) => !sameCounts(fullConfig(n), madelung(n))).map(symbolOf);

describe.each(CONVENTIONS)('buildColumns (%s convention)', (conv) => {
  const layout = buildLayout(conv);
  const columns = buildColumns(layout, BY_Z);
  const groups = columns.filter((c) => c.kind === 'group');
  const fColumns = columns.filter((c) => c.kind === 'f');

  it('returns 32 columns in column order', () => {
    expect(columns.map((c) => c.column)).toEqual(range(1, 32));
  });

  it('holds each group 1–18 exactly once, at its layout column, with the old CAS and IUPAC labels', () => {
    expect(groups.map((c) => c.group).sort((a, b) => a! - b!)).toEqual(range(1, 18));
    for (const c of groups) {
      const g = c.group!;
      expect(c.column).toBe(layout.columnOfGroup(g));
      expect(c.label).toBe(String(g));
      expect(c.fIndex).toBeNull();
      expect(c.casLabel).toBe(CAS[g - 1]);
      expect(c.oldIupacLabel).toBe(OLD_IUPAC[g - 1]);
      expect(c.valencePattern).toBe(GROUP_VALENCE[g - 1]);
    }
  });

  it('labels the f-block columns f1–f14 and leaves their group fields null', () => {
    expect(fColumns.map((c) => c.fIndex)).toEqual(range(1, 14));
    for (const c of fColumns) {
      expect(c.label).toBe(`f${c.fIndex}`);
      expect(layout.columnKind(c.column)).toEqual({ kind: 'f', fIndex: c.fIndex });
      expect([c.group, c.casLabel, c.oldIupacLabel, c.name, c.nameStatus]).toEqual([null, null, null, null, null]);
      expect(c.valencePattern).toBe(fValencePattern(c.fIndex!, conv));
    }
  });

  it('takes members from layout.membersOfColumn', () => {
    for (const c of columns) expect(c.members).toEqual(layout.membersOfColumn(c.column));
  });

  it('keeps the static group notes within 240 characters', () => {
    for (const c of groups) expect(c.note.length, c.label).toBeLessThanOrEqual(240);
  });

  it('gives every column, generated f-column notes included, a non-empty note of at most 240 characters', () => {
    for (const c of columns) {
      expect(c.note.trim().length, c.label).toBeGreaterThan(20);
      expect(c.note.length, c.label).toBeLessThanOrEqual(240);
      expect(c.note, c.label).toMatch(/[.)]$/);
    }
  });

  it('marks only the Red Book collective names as IUPAC names', () => {
    for (const c of columns) {
      expect([null, 'iupac', 'common']).toContain(c.nameStatus);
      expect(c.name === null, c.label).toBe(c.nameStatus === null);
      if (c.nameStatus === 'iupac') expect(c.name).toBe(IUPAC_NAMES[c.group!]);
    }
    for (const [g, name] of Object.entries(IUPAC_NAMES)) {
      const info = groupInfo(columns, Number(g));
      expect([info.name, info.nameStatus]).toEqual([name, 'iupac']);
    }
    expect(groupInfo(columns, 11).name).toBe('Coinage metals');
    expect(groupInfo(columns, 11).nameStatus).toBe('common');
  });

  it('names in each group note every member whose configuration departs from the valence pattern', () => {
    for (const c of groups) {
      const g = c.group!;
      for (const atomicNumber of c.members) {
        const period = layout.cells.get(atomicNumber)!.period;
        const counts = fullConfig(atomicNumber);
        const get = (name: string) => counts.get(name) ?? 0;
        const symbol = symbolOf(atomicNumber);
        let fits: boolean;
        if (g === 18 && period === 1) fits = get('1s') === 2;
        else if (g <= 2) fits = get(`${period}s`) === g && get(`${period}p`) === 0;
        else if (g >= 13) fits = get(`${period}s`) === 2 && get(`${period}p`) === g - 12;
        else {
          const m = /^\(n−1\)d([⁰-⁹¹²³]+) ns([¹²])$/.exec(c.valencePattern)!;
          fits = get(`${period - 1}d`) === fromSuperscript(m[1]!) && get(`${period}s`) === fromSuperscript(m[2]!) && get(`${period}p`) === 0;
        }
        if (!fits) expect(c.note, `group ${g}`).toMatch(new RegExp(`\\b${symbol}\\b`));
      }
    }
  });
});

describe('f-block columns follow the group-3 convention', () => {
  it("'Lu' runs La–Yb over Ac–No (f1 = La, Ac; f14 = Yb, No)", () => {
    const f = columnsFor('Lu').filter((c) => c.kind === 'f');
    f.forEach((c, i) => expect(c.members).toEqual([z('La') + i, z('Ac') + i]));
    expect(f[0]!.members.map(symbolOf)).toEqual(['La', 'Ac']);
    expect(f[13]!.members.map(symbolOf)).toEqual(['Yb', 'No']);
    expect(groupInfo(columnsFor('Lu'), 3).members.map(symbolOf)).toEqual(['Sc', 'Y', 'Lu', 'Lr']);
  });

  it("'La' runs Ce–Lu over Th–Lr (f1 = Ce, Th; f14 = Lu, Lr)", () => {
    const f = columnsFor('La').filter((c) => c.kind === 'f');
    f.forEach((c, i) => expect(c.members).toEqual([z('Ce') + i, z('Th') + i]));
    expect(f[0]!.members.map(symbolOf)).toEqual(['Ce', 'Th']);
    expect(f[13]!.members.map(symbolOf)).toEqual(['Lu', 'Lr']);
    expect(groupInfo(columnsFor('La'), 3).members.map(symbolOf)).toEqual(['Sc', 'Y', 'La', 'Ac']);
  });

  it('idealises column k as (n−2)fᵏ ns², plus (n−1)d¹ when La and Ac sit in group 3', () => {
    expect(fValencePattern(3, 'Lu')).toBe('(n−2)f³ ns²');
    expect(fValencePattern(14, 'La')).toBe('(n−2)f¹⁴ (n−1)d¹ ns²');
    expect(idealFCounts(8, 'Lu')).toEqual({ f: 8, d: 0, s: 2, p: 0 });
    expect(idealFCounts(8, 'La')).toEqual({ f: 8, d: 1, s: 2, p: 0 });
  });

  it('keeps the group-3 note in step with the convention', () => {
    expect(groupInfo(columnsFor('Lu'), 3).note).toMatch(/\bLr\b/);
    expect(groupInfo(columnsFor('La'), 3).note).toMatch(/\bLa\b.*\bAc\b/);
  });
});

describe('f-column notes compare ground states with the idealised configuration', () => {
  const notes = (conv: Group3Convention) => columnsFor(conv).filter((c) => c.kind === 'f').map((c) => c.note);

  it("'Lu': La/Ac, Ce/Th and Gd/Cm depart; Pr, Nd and Pm match but Pa, U and Np do not", () => {
    const n = notes('Lu');
    expect(n[0]).toBe(
      'Neither member has the idealised configuration: La is [Xe] 5d¹ 6s² (one electron in 5d instead of 4f) ' +
        'and Ac is [Rn] 6d¹ 7s² (one electron in 6d instead of 5f).',
    );
    expect(n[1]).toContain('Th is [Rn] 6d² 7s² (two electrons in 6d instead of 5f)');
    expect(n[2]).toBe('Pr has the idealised [Xe] 4f³ 6s²; Pa is [Rn] 5f² 6d¹ 7s² (one electron in 6d instead of 5f).');
    expect(n[3]).toMatch(/^Nd has the idealised .*; U is \[Rn\] 5f³ 6d¹ 7s²/);
    expect(n[4]).toMatch(/^Pm has the idealised .*; Np is \[Rn\] 5f⁴ 6d¹ 7s²/);
    expect(n[7]).toContain('Gd is [Xe] 4f⁷ 5d¹ 6s² (one electron in 5d instead of 4f, with 4f half-filled)');
    for (const k of [6, 7, 9, 10, 11, 12, 13, 14]) expect(n[k - 1], `f${k}`).toMatch(/^Both members have the idealised configuration/);
  });

  it("'La': Gd/Cm match; most lanthanides and late actinides hold the d electron in f instead", () => {
    const n = notes('La');
    expect(n[0]).toBe('Ce has the idealised [Xe] 4f¹ 5d¹ 6s²; Th is [Rn] 6d² 7s² (one electron in 6d instead of 5f).');
    expect(n[1]).toBe('Pr is [Xe] 4f³ 6s² (one electron in 4f instead of 5d); Pa has the idealised [Rn] 5f² 6d¹ 7s².');
    expect(n[6]).toBe('Both members have the idealised configuration: Gd [Xe] 4f⁷ 5d¹ 6s² and Cm [Rn] 5f⁷ 6d¹ 7s².');
    expect(n[5]).toContain('Eu is [Xe] 4f⁷ 6s² (one electron in 4f instead of 5d, with 4f half-filled)');
    expect(n[12]).toContain('No is [Rn] 5f¹⁴ 7s² (one electron in 5f instead of 6d, with 5f filled)');
    expect(n[13]).toBe('Lu has the idealised [Xe] 4f¹⁴ 5d¹ 6s²; Lr is [Rn] 5f¹⁴ 7s² 7p¹ (predicted; one electron in 7p instead of 6d).');
    for (const k of [5, 6, 8, 9, 10, 11, 12, 13]) expect(n[k - 1], `f${k}`).toMatch(/^Neither member has the idealised configuration/);
  });

  it('copes with missing or unusable configurations', () => {
    const layout = buildLayout('Lu');
    const members = layout.membersOfColumn(3);
    const withoutLa = new Map(BY_Z);
    withoutLa.delete(z('La'));
    expect(fColumnNote(layout, 1, members, withoutLa)).toBe(
      'Ac is [Rn] 6d¹ 7s² (one electron in 6d instead of 5f). No usable ground-state configuration for La.',
    );
    const garbled = new Map(BY_Z);
    for (const n of members) garbled.set(n, { ...BY_Z.get(n)!, config: '[Xe] 4q2' });
    expect(fColumnNote(layout, 1, members, garbled)).toBe('Ground-state configurations are unavailable for La and Ac.');
    const predicted = new Map(BY_Z);
    predicted.set(z('Ac'), { ...BY_Z.get(z('Ac'))!, predicted: ['config'] });
    expect(fColumnNote(layout, 1, members, predicted)).toContain('Ac is [Rn] 6d¹ 7s² (predicted; one electron in 6d instead of 5f)');
  });

  it("flags configurations as predicted from the dataset's predicted list, and Lr's from its own note", () => {
    expect(configIsPredicted(el('Rf'))).toBe(true);
    expect(configIsPredicted(el('No'))).toBe(false);
    expect(configIsPredicted(el('Lr'))).toBe(true);
    // The override stands in for a missing 'config' entry; it is only valid while the dataset says so.
    expect(el('Lr').notes.some((s) => /7p1 configuration is predicted/.test(s))).toBe(true);
  });
});

describe('configuration helpers', () => {
  it('writes superscript digits', () => {
    expect(superscript(0)).toBe('⁰');
    expect(superscript(7)).toBe('⁷');
    expect(superscript(14)).toBe('¹⁴');
    expect(() => superscript(-1)).toThrow(RangeError);
  });

  it('parses configurations with or without explicit single counts', () => {
    const gd = parseConfig('[Xe] 4f7 5d 6s2')!;
    expect(gd.core).toBe('Xe');
    expect([...gd.subshells]).toEqual([['4f', 7], ['5d', 1], ['6s', 2]]);
    expect(prettyConfig(gd)).toBe('[Xe] 4f⁷ 5d¹ 6s²');
    expect(prettyConfig(parseConfig('1s2')!)).toBe('1s²');
    expect(parseConfig('')).toBeNull();
    expect(parseConfig('[Xe] 4q2')).toBeNull();
    expect(parseConfig('[Xe] 4f2 4f3')).toBeNull();
    expect(parseConfig('4f2 [Xe]')).toBeNull();
  });

  it('describes how a configuration departs from the idealised one', () => {
    const ideal = { f: 14, d: 1, s: 2, p: 0 };
    expect(describeDeparture(ideal, ideal, 7)).toBeNull();
    expect(describeDeparture({ f: 14, d: 0, s: 2, p: 1 }, ideal, 7)).toBe('one electron in 7p instead of 6d');
    expect(describeDeparture({ f: 0, d: 2, s: 2, p: 0 }, { f: 2, d: 0, s: 2, p: 0 }, 7)).toBe('two electrons in 6d instead of 5f');
    expect(describeDeparture({ f: 7, d: 0, s: 2, p: 0 }, { f: 6, d: 1, s: 2, p: 0 }, 6)).toBe(
      'one electron in 4f instead of 5d, with 4f half-filled',
    );
    expect(describeDeparture({ f: 1, d: 2, s: 1, p: 0 }, { f: 2, d: 0, s: 2, p: 0 }, 6)).toBe('valence electrons arranged differently');
  });
});

describe('group content', () => {
  it('lists the eighteen groups in order, each with sources', () => {
    expect(GROUPS.map((g) => g.group)).toEqual(range(1, 18));
    for (const g of GROUPS) {
      expect(g.sources.length, `group ${g.group}`).toBeGreaterThan(0);
      for (const s of g.sources) {
        expect(s.label.length).toBeGreaterThan(10);
        if (s.url !== undefined) expect(s.url).toMatch(/^https:\/\//);
      }
    }
    expect(GROUP_LABEL_SOURCES.length).toBeGreaterThan(0);
  });

  it('resolves group notes per convention and rejects unknown groups', () => {
    expect(groupNote(groupContent(3), 'Lu')).not.toBe(groupNote(groupContent(3), 'La'));
    expect(groupNote(groupContent(17), 'Lu')).toBe(groupNote(groupContent(17), 'La'));
    expect(() => groupContent(0)).toThrow(RangeError);
    expect(() => groupContent(19)).toThrow(RangeError);
    expect(() => groupContent(2.5)).toThrow(RangeError);
  });
});

describe.each(CONVENTIONS)('buildPeriods (%s convention)', (conv) => {
  const layout = buildLayout(conv);
  const periods = buildPeriods(layout, BY_Z);

  it('returns seven periods with members from the layout', () => {
    expect(periods.map((p) => p.period)).toEqual(range(1, 7));
    for (const p of periods) expect(p.members).toEqual(layout.membersOfPeriod(p.period));
  });

  it('lists the subshells each period fills, in Madelung order, adding up to its length', () => {
    expect(periods.map((p) => p.subshells)).toEqual(PERIOD_SUBSHELLS);
    for (const p of periods) {
      const capacity = p.subshells.reduce((sum, s) => sum + CAPACITY[s[1]!]!, 0);
      expect(capacity).toBe(p.members.length);
    }
  });

  it('gives every period a note of at most 240 characters, with sources', () => {
    for (const [i, p] of periods.entries()) {
      expect(p.note.length).toBeGreaterThan(20);
      expect(p.note.length).toBeLessThanOrEqual(240);
      expect(PERIODS[i]!.sources.length).toBeGreaterThan(0);
    }
  });
});

describe('claims in the notes agree with the element dataset', () => {
  const note = (group: number, conv: Group3Convention = 'Lu') => groupNote(groupContent(group), conv);
  const pretty = (symbol: string) => prettyConfig(parseConfig(el(symbol).config)!);

  it('group 1: hydrogen is a nonmetal; Fr ionizes less easily than Cs (4.07 vs 3.89 eV)', () => {
    expect(el('H').category).toBe('reactive-nonmetal');
    expect(el('Fr').ie1!.toFixed(2)).toBe('4.07');
    expect(el('Cs').ie1!.toFixed(2)).toBe('3.89');
    expect(note(1)).toContain('(4.07 eV)');
    expect(note(1)).toContain('(3.89 eV)');
  });

  it('group 3: Lu is 4f¹⁴ 5d¹ 6s², Lr ends 7s² 7p¹, and La and Ac are d¹ s² with no f electron', () => {
    expect(pretty('Lu')).toBe('[Xe] 4f¹⁴ 5d¹ 6s²');
    expect(pretty('Lr')).toMatch(/7s² 7p¹$/);
    expect(pretty('La')).toBe('[Xe] 5d¹ 6s²');
    expect(pretty('Ac')).toBe('[Rn] 6d¹ 7s²');
    expect(note(3, 'Lu')).toContain('Lu (4f¹⁴ 5d¹ 6s²)');
    expect(note(3, 'La')).toContain('La (5d¹ 6s²) and Ac (6d¹ 7s²)');
  });

  it('group 4 and period 6: Hf (found 1923) matches Zr in size', () => {
    expect(el('Hf').discoveryYear).toBe(1923);
    expect(Math.abs(el('Hf').atomicRadius! - el('Zr').atomicRadius!)).toBeLessThanOrEqual(5);
    expect(Math.abs(el('Hf').covalentRadius! - el('Zr').covalentRadius!)).toBeLessThanOrEqual(5);
  });

  it('groups 5–10: quoted configurations match the dataset', () => {
    expect(pretty('Nb')).toBe('[Kr] 4d⁴ 5s¹');
    expect(pretty('Cr')).toBe('[Ar] 3d⁵ 4s¹');
    expect(pretty('Mo')).toBe('[Kr] 4d⁵ 5s¹');
    expect(pretty('W')).toBe('[Xe] 4f¹⁴ 5d⁴ 6s²');
    expect(pretty('Ru')).toBe('[Kr] 4d⁷ 5s¹');
    expect(pretty('Rh')).toBe('[Kr] 4d⁸ 5s¹');
    expect(pretty('Ni')).toBe('[Ar] 3d⁸ 4s²');
    expect(pretty('Pd')).toBe('[Kr] 4d¹⁰');
    expect(pretty('Pt')).toBe('[Xe] 4f¹⁴ 5d⁹ 6s¹');
  });

  it('group 6: tungsten has the highest melting point of any metal', () => {
    const metals = ELEMENTS.filter((e) => METALS.has(e.category) && e.mp !== null);
    const top = metals.reduce((a, b) => (b.mp! > a.mp! ? b : a));
    expect(top.symbol).toBe('W');
  });

  it('group 7: technetium is the lightest radioactive element; rhenium was found in 1925', () => {
    expect(ELEMENTS.find((e) => e.radioactive)?.symbol).toBe('Tc');
    expect(el('Re').discoveryYear).toBe(1925);
    expect(el('Re').radioactive).toBe(false);
  });

  it('group 10: Pd is the only element with no outer s electron', () => {
    const layout = buildLayout('Lu');
    const noOuterS = ELEMENTS.filter((e) => {
      const period = layout.cells.get(e.z)!.period;
      return (parseConfig(e.config)!.subshells.get(`${period}s`) ?? 0) === 0;
    });
    expect(noOuterS.map((e) => e.symbol)).toEqual(['Pd']);
  });

  it('group 11: gold’s electron affinity is 2.31 eV and Rg is listed as 6d⁹ 7s²', () => {
    expect(el('Au').ea!.toFixed(2)).toBe('2.31');
    expect(pretty('Rg')).toMatch(/6d⁹ 7s²$/);
  });

  it('group 12: mercury is a liquid', () => {
    expect(el('Hg').phase).toBe('liquid');
  });

  it('group 13: boron is a metalloid and Al, Ga, In and Tl are metals (Nh, a predicted class, is not claimed)', () => {
    expect(el('B').category).toBe('metalloid');
    for (const symbol of ['Al', 'Ga', 'In', 'Tl']) expect(METALS.has(el(symbol).category), symbol).toBe(true);
    expect(note(13)).toContain('Boron is a metalloid; Al, Ga, In and Tl are metals.');
    expect(note(13)).not.toMatch(/\bNh\b/);
  });

  it('group 17: F is the most electronegative element and Cl has the highest electron affinity', () => {
    const byEn = ELEMENTS.filter((e) => e.en !== null).reduce((a, b) => (b.en! > a.en! ? b : a));
    const byEa = ELEMENTS.filter((e) => e.ea !== null).reduce((a, b) => (b.ea! > a.ea! ? b : a));
    expect(byEn.symbol).toBe('F');
    expect(byEa.symbol).toBe('Cl');
    expect(el('Cl').ea!.toFixed(2)).toBe('3.61');
    expect(el('F').ea!.toFixed(2)).toBe('3.40');
  });

  it('periods 4 and 5: Fe is 3d⁶ 4s²; the d-block Madelung exceptions are Cr, Cu and Nb, Mo, Ru, Rh, Pd, Ag', () => {
    expect(pretty('Fe')).toBe('[Ar] 3d⁶ 4s²');
    expect(madelungExceptions(range(z('Sc'), z('Zn')))).toEqual(['Cr', 'Cu']);
    expect(madelungExceptions(range(z('Y'), z('Cd')))).toEqual(['Nb', 'Mo', 'Ru', 'Rh', 'Pd', 'Ag']);
  });

  it('period 7: every member is radioactive', () => {
    for (const n of buildLayout('Lu').membersOfPeriod(7)) expect(BY_Z.get(n)!.radioactive, symbolOf(n)).toBe(true);
  });
});
