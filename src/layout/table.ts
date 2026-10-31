import { PERIOD_ENDS } from '../data/symbols';
import type { Block, Cell, ColumnKind, Group3Convention, Layout } from '../types';

export const COLUMN_COUNT = 32;
export const PERIOD_COUNT = 7;

// The 32-column long form, f-block inline. Columns run 1..32 around the cylinder:
//   'Lu': G1 G2 | f1..f14 | G3 G4..G12 | G13..G18   (f-block = La–Yb, Ac–No)
//   'La': G1 G2 | G3 | f1..f14 | G4..G12 | G13..G18  (f-block = Ce–Lu, Th–Lr)
// Either way Z increases left to right within a period, and the seam (32 → 1) joins each
// noble gas to the next period's alkali metal.

function periodStart(period: number): number {
  return period === 1 ? 1 : PERIOD_ENDS[period - 2]! + 1;
}

/** IUPAC group (or f-block index) for the i-th element (0-based) of a period. */
function placeInPeriod(period: number, i: number, convention: Group3Convention): { group: number | null; fIndex: number | null } {
  const length = PERIOD_ENDS[period - 1]! - periodStart(period) + 1;
  if (length === 2) return { group: i === 0 ? 1 : 18, fIndex: null };
  if (length === 8) return { group: i < 2 ? i + 1 : i + 11, fIndex: null };
  if (length === 18) return { group: i + 1, fIndex: null };
  // length 32: two s, fifteen (f + group 3), nine d (G4..G12), six p
  if (i < 2) return { group: i + 1, fIndex: null };
  if (i <= 16) {
    if (convention === 'Lu') return i === 16 ? { group: 3, fIndex: null } : { group: null, fIndex: i - 1 };
    return i === 2 ? { group: 3, fIndex: null } : { group: null, fIndex: i - 2 };
  }
  return { group: i - 13, fIndex: null };
}

export function columnOfGroup(group: number, convention: Group3Convention): number {
  if (!Number.isInteger(group) || group < 1 || group > 18) throw new RangeError(`group ${group}`);
  if (group <= 2) return group;
  if (group === 3) return convention === 'Lu' ? 17 : 3;
  return group + 14;
}

export function columnOfF(fIndex: number, convention: Group3Convention): number {
  if (!Number.isInteger(fIndex) || fIndex < 1 || fIndex > 14) throw new RangeError(`fIndex ${fIndex}`);
  return convention === 'Lu' ? 2 + fIndex : 3 + fIndex;
}

export function columnKind(column: number, convention: Group3Convention): ColumnKind {
  if (!Number.isInteger(column) || column < 1 || column > COLUMN_COUNT) throw new RangeError(`column ${column}`);
  if (column <= 2) return { kind: 'group', group: column };
  if (column >= 18) return { kind: 'group', group: column - 14 };
  if (convention === 'Lu') return column === 17 ? { kind: 'group', group: 3 } : { kind: 'f', fIndex: column - 2 };
  return column === 3 ? { kind: 'group', group: 3 } : { kind: 'f', fIndex: column - 3 };
}

function blockOf(z: number, group: number | null): Block {
  if (group === null) return 'f';
  if (z === 2) return 's'; // helium: 1s², sits over the noble gases
  if (group <= 2) return 's';
  if (group <= 12) return 'd';
  return 'p';
}

export function buildLayout(convention: Group3Convention): Layout {
  const cells = new Map<number, Cell>();
  const grid: (number | null)[][] = Array.from({ length: PERIOD_COUNT }, () => Array<number | null>(COLUMN_COUNT).fill(null));
  for (let period = 1; period <= PERIOD_COUNT; period++) {
    const start = periodStart(period);
    const end = PERIOD_ENDS[period - 1]!;
    for (let z = start; z <= end; z++) {
      const { group, fIndex } = placeInPeriod(period, z - start, convention);
      const column = fIndex !== null ? columnOfF(fIndex, convention) : columnOfGroup(group!, convention);
      cells.set(z, { z, period, column, group, fIndex, block: blockOf(z, group) });
      grid[period - 1]![column - 1] = z;
    }
  }
  const byColumn = new Map<number, number[]>();
  const byPeriod = new Map<number, number[]>();
  for (const cell of [...cells.values()].sort((a, b) => a.period - b.period || a.column - b.column)) {
    (byColumn.get(cell.column) ?? byColumn.set(cell.column, []).get(cell.column)!).push(cell.z);
    (byPeriod.get(cell.period) ?? byPeriod.set(cell.period, []).get(cell.period)!).push(cell.z);
  }
  return {
    convention,
    cells,
    grid,
    columnKind: (column) => columnKind(column, convention),
    columnOfGroup: (group) => columnOfGroup(group, convention),
    membersOfColumn: (column) => [...(byColumn.get(column) ?? [])],
    membersOfPeriod: (period) => [...(byPeriod.get(period) ?? [])],
  };
}

/** Header label for a column: "1".."18" or "f1".."f14". */
export function columnLabel(kind: ColumnKind): string {
  return kind.kind === 'group' ? String(kind.group) : `f${kind.fIndex}`;
}
