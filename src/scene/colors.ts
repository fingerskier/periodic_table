import type { Cell, ColorMode, ElementData, LegendFocus, Model, NumericProp } from '../types';
import {
  BLOCK_COLORS, CATEGORY_BY_ID, mix, NO_DATA_COLOR, NUMERIC_PROP_BY_ID, PHASE_COLORS, rampColor, rampIndex, SCENE_BG,
} from '../ui/palette';
import type { TileColors } from './tiles';

/** How far a hue is mixed toward the scene background for tile fills (keeps white text AA). */
const TINT = 0.5;

function tinted(accent: string): TileColors {
  return { accent, fill: mix(accent, SCENE_BG, TINT) };
}

export function numericValue(e: ElementData, prop: NumericProp): number | null {
  const v = e[prop];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** [min, max] of a property (log10 space when the property is log-scaled; non-positive values skipped). */
export function domainOf(elements: readonly ElementData[], prop: NumericProp): [number, number] | null {
  const log = !!NUMERIC_PROP_BY_ID.get(prop)?.log;
  let lo = Infinity, hi = -Infinity;
  for (const e of elements) {
    const v = numericValue(e, prop);
    if (v === null || (log && v <= 0)) continue;
    const x = log ? Math.log10(v) : v;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return lo <= hi ? [lo, hi] : null;
}

/** Position in [0, 1] of a value within the domain (log10 space for log-scaled properties). */
function rampT(v: number, prop: NumericProp, dom: [number, number]): number {
  const x = NUMERIC_PROP_BY_ID.get(prop)?.log ? Math.log10(v) : v;
  return dom[1] > dom[0] ? (x - dom[0]) / (dom[1] - dom[0]) : 0.5;
}

function hasValue(v: number | null, prop: NumericProp): v is number {
  return v !== null && !(NUMERIC_PROP_BY_ID.get(prop)?.log && v <= 0);
}

export function tileColors(model: Model, mode: ColorMode): Map<number, TileColors> {
  const out = new Map<number, TileColors>();
  if (mode === 'category' || mode === 'block' || mode === 'phase') {
    for (const e of model.elements) {
      const cell = model.layout.cells.get(e.z)!;
      const accent = mode === 'category'
        ? CATEGORY_BY_ID.get(e.category)?.color ?? '#8a93a6'
        : mode === 'block' ? BLOCK_COLORS[cell.block] : PHASE_COLORS[e.phase ?? 'unknown'];
      out.set(e.z, tinted(accent));
    }
    return out;
  }
  const dom = domainOf(model.elements, mode);
  for (const e of model.elements) {
    const v = numericValue(e, mode);
    if (!dom || !hasValue(v, mode)) {
      out.set(e.z, { accent: '#3a4152', fill: NO_DATA_COLOR, muted: true });
      continue;
    }
    const fill = rampColor(rampT(v, mode, dom));
    out.set(e.z, { accent: mix(fill, '#ffffff', 0.25), fill });
  }
  return out;
}

/**
 * Does an element match the legend entry under the pointer? Ramp bins match by the step a tile is
 * actually painted with (same rounding as tileColors), so an edge value never lights up in two
 * neighbouring bins. `elements` supplies the colour domain for ramp bins.
 */
export function matchesLegend(e: ElementData, cell: Cell, focus: LegendFocus, elements: readonly ElementData[] = []): boolean {
  switch (focus.kind) {
    case 'category': return e.category === focus.id;
    case 'block': return cell.block === focus.id;
    case 'phase': return (e.phase ?? 'unknown') === focus.id;
    case 'range': {
      const v = numericValue(e, focus.prop);
      if (!hasValue(v, focus.prop)) return false;
      const dom = domainOf(elements, focus.prop);
      if (!dom) return v >= focus.lo && v <= focus.hi;
      const mid = NUMERIC_PROP_BY_ID.get(focus.prop)?.log && focus.lo > 0 && focus.hi > 0
        ? Math.sqrt(focus.lo * focus.hi)
        : (focus.lo + focus.hi) / 2;
      return rampIndex(rampT(v, focus.prop, dom)) === rampIndex(rampT(mid, focus.prop, dom));
    }
    case 'missing':
      return !hasValue(numericValue(e, focus.prop), focus.prop);
  }
}
