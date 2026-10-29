import { describe, expect, it } from 'vitest';
import { SYMBOLS, z } from '../src/data/symbols';
import { buildLayout, columnKind, columnOfGroup, COLUMN_COUNT } from '../src/layout/table';
import type { Group3Convention } from '../src/types';

const CONVENTIONS: Group3Convention[] = ['Lu', 'La'];

describe.each(CONVENTIONS)('layout (%s convention)', (conv) => {
  const L = buildLayout(conv);

  it('places all 118 elements in distinct cells', () => {
    expect(L.cells.size).toBe(118);
    const seen = new Set<string>();
    for (const c of L.cells.values()) {
      const key = `${c.period}:${c.column}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(L.grid[c.period - 1]![c.column - 1]).toBe(c.z);
    }
    const filled = L.grid.flat().filter((v) => v !== null).length;
    expect(filled).toBe(118);
  });

  it('has period lengths 2, 8, 8, 18, 18, 32, 32', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((p) => L.membersOfPeriod(p).length)).toEqual([2, 8, 8, 18, 18, 32, 32]);
  });

  it('increases Z left to right within every period', () => {
    for (let p = 1; p <= 7; p++) {
      const m = L.membersOfPeriod(p);
      expect([...m].sort((a, b) => a - b)).toEqual(m);
    }
  });

  it('puts each period-ending noble gas in group 18, column 32, beside the next alkali metal across the seam', () => {
    for (const s of ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og']) {
      const c = L.cells.get(z(s))!;
      expect(c.group).toBe(18);
      expect(c.column).toBe(COLUMN_COUNT);
    }
    for (const s of ['H', 'Li', 'Na', 'K', 'Rb', 'Cs', 'Fr']) expect(L.cells.get(z(s))!.column).toBe(1);
  });

  it('assigns textbook groups to landmark elements', () => {
    const g = (s: string) => L.cells.get(z(s))!.group;
    expect(g('H')).toBe(1);
    expect(g('Be')).toBe(2);
    expect(g('B')).toBe(13);
    expect(g('Sc')).toBe(3);
    expect(g('Y')).toBe(3);
    expect(g('Zn')).toBe(12);
    expect(g('Hf')).toBe(4);
    expect(g('Hg')).toBe(12);
    expect(g('Tl')).toBe(13);
    expect(g('Rf')).toBe(4);
    expect(g('Cn')).toBe(12);
    expect(g('Ts')).toBe(17);
  });

  it('has exactly 14 f-block members per f-period and four group-3 members', () => {
    const f6 = L.membersOfPeriod(6).filter((n) => L.cells.get(n)!.fIndex !== null);
    const f7 = L.membersOfPeriod(7).filter((n) => L.cells.get(n)!.fIndex !== null);
    expect(f6).toHaveLength(14);
    expect(f7).toHaveLength(14);
    expect(L.membersOfColumn(columnOfGroup(3, conv))).toHaveLength(4);
  });

  it('derives blocks from position (He is s-block)', () => {
    const b = (s: string) => L.cells.get(z(s))!.block;
    expect(b('He')).toBe('s');
    expect(b('H')).toBe('s');
    expect(b('Ne')).toBe('p');
    expect(b('Fe')).toBe('d');
    expect(b('U')).toBe('f');
    const counts = { s: 0, p: 0, d: 0, f: 0 };
    for (const c of L.cells.values()) counts[c.block]++;
    expect(counts).toEqual({ s: 14, p: 36, d: 40, f: 28 });
  });

  it('keeps column kinds consistent with cells', () => {
    for (const c of L.cells.values()) {
      const k = columnKind(c.column, conv);
      if (c.fIndex !== null) expect(k).toEqual({ kind: 'f', fIndex: c.fIndex });
      else expect(k).toEqual({ kind: 'group', group: c.group });
    }
  });
});

describe('group-3 conventions', () => {
  it("'Lu' puts Lu/Lr under Sc/Y and starts the f-block at La/Ac", () => {
    const L = buildLayout('Lu');
    expect(L.membersOfColumn(columnOfGroup(3, 'Lu'))).toEqual([z('Sc'), z('Y'), z('Lu'), z('Lr')]);
    expect(L.cells.get(z('La'))!.fIndex).toBe(1);
    expect(L.cells.get(z('Yb'))!.fIndex).toBe(14);
    expect(L.cells.get(z('No'))!.fIndex).toBe(14);
    expect(L.cells.get(z('Lu'))!.block).toBe('d');
  });

  it("'La' puts La/Ac under Sc/Y and ends the f-block at Lu/Lr", () => {
    const L = buildLayout('La');
    expect(L.membersOfColumn(columnOfGroup(3, 'La'))).toEqual([z('Sc'), z('Y'), z('La'), z('Ac')]);
    expect(L.cells.get(z('Ce'))!.fIndex).toBe(1);
    expect(L.cells.get(z('Lu'))!.fIndex).toBe(14);
    expect(L.cells.get(z('Lr'))!.fIndex).toBe(14);
    expect(L.cells.get(z('La'))!.block).toBe('d');
  });

  it('symbol table has 118 unique entries', () => {
    expect(SYMBOLS).toHaveLength(118);
    expect(new Set(SYMBOLS).size).toBe(118);
  });
});
