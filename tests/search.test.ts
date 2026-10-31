import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '../src/data/elements';
import type { ElementData } from '../src/types';
import { normalizeQuery, RANK, searchElements, searchHits, splitMatch } from '../src/ui/search';

const symbols = (query: string, limit?: number) => searchElements(query, ELEMENTS, limit).map((e) => e.symbol);

/** Minimal rows for ranking tests that must not depend on the dataset. */
const fake = (z: number, symbol: string, name: string) => ({ z, symbol, name }) as ElementData;

describe('normalizeQuery', () => {
  it('trims, lower-cases and strips diacritics', () => {
    expect(normalizeQuery('  Fé ')).toBe('fe');
    expect(normalizeQuery('NÉON')).toBe('neon');
    expect(normalizeQuery('\tIron\n')).toBe('iron');
    expect(normalizeQuery('   ')).toBe('');
  });
});

describe('searchElements', () => {
  it('returns nothing for an empty query, a zero limit or no match', () => {
    expect(symbols('')).toEqual([]);
    expect(symbols('   ')).toEqual([]);
    expect(symbols('fe', 0)).toEqual([]);
    expect(symbols('xyz')).toEqual([]);
  });

  it('puts an exact symbol first, in any case and with stray whitespace', () => {
    for (const q of ['fe', 'FE', 'Fe', ' fe  ']) expect(symbols(q)[0]).toBe('Fe');
    expect(symbols('w')[0]).toBe('W');
    expect(symbols('og')[0]).toBe('Og');
  });

  it('matches an exact atomic number, and only that', () => {
    expect(symbols('26')).toEqual(['Fe']);
    expect(symbols('026')).toEqual(['Fe']);
    expect(symbols('118')).toEqual(['Og']);
    expect(symbols('0')).toEqual([]);
    expect(symbols('119')).toEqual([]);
  });

  it('finds elements by name prefix', () => {
    expect(symbols('tung')).toEqual(['W']);
    expect(symbols('iron')[0]).toBe('Fe');
    expect(symbols('Hydro')[0]).toBe('H');
  });

  it("ranks 'c' as carbon, then the other C names in atomic-number order", () => {
    expect(symbols('c')).toEqual(['C', 'Cl', 'Ca', 'Cr', 'Co', 'Cu', 'Cd', 'Cs']);
  });

  it('ranks name prefixes above symbol prefixes above name substrings', () => {
    // A-names (Al, Ar, As, Sb, At, Ac, Am), then A-symbols whose names do not start with A.
    expect(symbols('a', 9)).toEqual(['Al', 'Ar', 'As', 'Sb', 'At', 'Ac', 'Am', 'Ag', 'Au']);
    const hits = searchHits('ne', ELEMENTS, 20);
    expect(hits.slice(0, 3).map((x) => x.element.symbol)).toEqual(['Ne', 'Nd', 'Np']);
    const rest = hits.slice(3);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((x) => x.rank === RANK.nameSubstring)).toBe(true);
    expect(rest.map((x) => x.element.symbol)).toContain('Mn');
  });

  it('orders the five tiers ahead of atomic number', () => {
    const rows = [fake(1, 'Zz', 'Kabob'), fake(2, 'Cd', 'Abacus'), fake(3, 'Abx', 'Qwerty'), fake(4, 'Yy', 'Nothing'), fake(10, 'Ab', 'Qqq')];
    const hits = searchHits('ab', rows);
    expect(hits.map((x) => x.element.symbol)).toEqual(['Ab', 'Cd', 'Abx', 'Zz']);
    expect(hits.map((x) => x.rank)).toEqual([RANK.symbol, RANK.namePrefix, RANK.symbolPrefix, RANK.nameSubstring]);
    const numbered = [fake(1, 'Aa', '5 alpha'), fake(5, 'Bb', 'Beta')];
    expect(searchElements('5', numbered).map((e) => e.symbol)).toEqual(['Bb', 'Aa']);
  });

  it('keeps atomic-number order within a tier and never repeats an element', () => {
    for (const q of ['b', 'c', 'n', 'ium', 'on', 'e']) {
      const hits = searchHits(q, ELEMENTS, 118);
      expect(new Set(hits.map((x) => x.element.z)).size).toBe(hits.length);
      for (let i = 1; i < hits.length; i++) {
        const [a, b] = [hits[i - 1]!, hits[i]!];
        expect(a.rank < b.rank || (a.rank === b.rank && a.element.z < b.element.z)).toBe(true);
      }
    }
  });

  it('respects the limit (8 by default)', () => {
    expect(symbols('i')).toHaveLength(8);
    expect(symbols('a', 3)).toEqual(['Al', 'Ar', 'As']);
  });

  it('ignores diacritics in the query', () => {
    expect(symbols('nëon')[0]).toBe('Ne');
    expect(symbols('Ïron')[0]).toBe('Fe');
  });

  it('reads full-width letters and digits as plain ones (East Asian input methods)', () => {
    expect(normalizeQuery('ＦＥ')).toBe('fe');
    expect(symbols('Ｆｅ')[0]).toBe('Fe');
    expect(symbols('２６')).toEqual(['Fe']);
    expect(symbols('ｉｒｏｎ')[0]).toBe('Fe');
  });

  it('accepts other spellings and reports the alias that matched', () => {
    for (const q of ['aluminum', 'aluminium']) expect(symbols(q)[0]).toBe('Al');
    for (const q of ['cesium', 'caesium']) expect(symbols(q)[0]).toBe('Cs');
    expect(symbols('sulphur')[0]).toBe('S');
    expect(symbols('wolfram')).toEqual(['W']);
    const [hit] = searchHits('wolf', ELEMENTS);
    expect(hit?.element.symbol).toBe('W');
    expect(hit?.alias).toBe('wolfram');
    expect(searchHits('tung', ELEMENTS)[0]?.alias).toBeUndefined();
  });
});

describe('splitMatch', () => {
  it('splits a name around the first match, keeping its case', () => {
    expect(splitMatch('Iron', 'ro')).toEqual(['I', 'ro', 'n']);
    expect(splitMatch('Neon', 'ne')).toEqual(['', 'Ne', 'on']);
    expect(splitMatch('Manganese', 'ne')).toEqual(['Manga', 'ne', 'se']);
  });

  it('returns null without a match or a query', () => {
    expect(splitMatch('Iron', 'x')).toBeNull();
    expect(splitMatch('Iron', '')).toBeNull();
  });
});
