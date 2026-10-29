import { columnLabel } from '../layout/table';
import type { ColumnInfo, ElementData, Layout, PeriodInfo } from '../types';

// STUB — replaced by the content owner with verified per-group and per-period content.

export function buildColumns(layout: Layout, _byZ: ReadonlyMap<number, ElementData>): ColumnInfo[] {
  const out: ColumnInfo[] = [];
  for (let column = 1; column <= 32; column++) {
    const kind = layout.columnKind(column);
    out.push({
      column,
      kind: kind.kind,
      group: kind.kind === 'group' ? kind.group : null,
      fIndex: kind.kind === 'f' ? kind.fIndex : null,
      label: columnLabel(kind),
      casLabel: null,
      oldIupacLabel: null,
      name: null,
      nameStatus: null,
      valencePattern: '',
      note: '',
      members: layout.membersOfColumn(column),
    });
  }
  return out;
}

export function buildPeriods(layout: Layout, _byZ: ReadonlyMap<number, ElementData>): PeriodInfo[] {
  return Array.from({ length: 7 }, (_, i) => ({
    period: i + 1,
    members: layout.membersOfPeriod(i + 1),
    subshells: [],
    note: '',
  }));
}
