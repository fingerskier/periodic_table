import { escapeHtml } from './dom';
import { formatNumber } from './format';

// Trend sparklines as self-contained SVG markup.
//
// Escaping contract: sparklineSvg() builds the whole document itself and passes every piece of
// caller text (point labels, formatted values, units, the accessible title) through xml(), which
// drops characters XML 1.0 forbids (one stray control character would otherwise make the whole
// chart fail to parse) and escapes & < > " ' — enough for both XML text and quoted attribute
// values. Numbers are emitted by the module. The result is therefore safe to parse;
// sparklineElement() parses it as XML with DOMParser (an inert document: nothing in it runs) and
// imports the resulting node, so callers never assign markup through innerHTML.

export interface SparkPoint {
  label: string;
  value: number | null;
  /** A predicted or estimated value: drawn as a hollow marker and flagged in its tooltip. */
  predicted?: boolean;
}

export interface SparklineOptions {
  /** viewBox width; the SVG is emitted at this intrinsic size and scales with CSS. */
  width: number;
  height: number;
  /** Index of the point to ring (e.g. the inspected element). A null point gets a dashed guide. */
  highlight?: number;
  /** Plot log10(value); values ≤ 0 become gaps. */
  log?: boolean;
  /** Unit appended by the default value formatter. */
  unit?: string;
  /** Formats values for tooltips and min/max labels; default 3 significant figures + unit. */
  format?: (value: number) => string;
  /** Tooltip text for a null value (default 'no data'), e.g. 'known since antiquity'. */
  missing?: string;
  /** Accessible name. Without one the chart is aria-hidden and the caller must describe it. */
  title?: string;
}

export const SPARK_COLORS = {
  line: '#3987e5',
  text: '#c3c2b7',
  ring: '#f0efec',
  gap: '#898781',
  baseline: '#ffffff',
  /** The inspector's panel colour, filling hollow (predicted) markers so the line stops at them. */
  surface: '#0f1420',
} as const;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MARKER_R = 4;
const RING_R = 7;
const LABEL_SIZE = 11;
/** Approximate advance of an 11px system-ui digit, for keeping labels inside the box. */
const CHAR_W = 6.3;
const PAD_X = RING_R + 1;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;

export interface Extreme {
  index: number;
  value: number;
}

function plottable(value: number | null, log: boolean): value is number {
  return value !== null && Number.isFinite(value) && (!log || value > 0);
}

/** First lowest and first highest plottable points, or null when nothing can be plotted. */
export function extremes(points: readonly SparkPoint[], log = false): { min: Extreme; max: Extreme } | null {
  let min: Extreme | null = null;
  let max: Extreme | null = null;
  for (let index = 0; index < points.length; index++) {
    const value = points[index]!.value;
    if (!plottable(value, log)) continue;
    if (!min || value < min.value) min = { index, value };
    if (!max || value > max.value) max = { index, value };
  }
  return min && max ? { min, max } : null;
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

// Everything outside XML 1.0's Char production: C0 controls other than tab/LF/CR, lone
// surrogates, U+FFFE and U+FFFF.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Caller text made safe for XML text and quoted attribute values. */
function xml(text: string): string {
  return escapeHtml(text.replace(NOT_XML, ''));
}

function attrs(record: Record<string, string | number>): string {
  return Object.entries(record)
    .map(([k, v]) => `${k}="${typeof v === 'number' ? num(v) : xml(v)}"`)
    .join(' ');
}

/** A text label kept inside [0, width]: centred on x unless that would clip an edge. */
function label(text: string, x: number, y: number, width: number): string {
  const w = text.length * CHAR_W;
  let anchor = 'middle';
  let tx = x;
  if (x - w / 2 < 0) { anchor = 'start'; tx = Math.max(0, x - MARKER_R); }
  else if (x + w / 2 > width) { anchor = 'end'; tx = Math.min(width, x + MARKER_R); }
  return `<text ${attrs({ x: tx, y, 'text-anchor': anchor, fill: SPARK_COLORS.text })}>${xml(text)}</text>`;
}

/**
 * A sparkline as an SVG string: 2px round-capped line with gaps at missing values (one path
 * per contiguous run), 8px markers (hollow when predicted) with a per-point tooltip
 * ('Fe: 7.90 eV'), an optional ring on the highlighted point, min and max value labels and a
 * recessive baseline. On a log axis, values ≤ 0 are gaps whose tooltip still gives the value.
 */
export function sparklineSvg(points: readonly SparkPoint[], opts: SparklineOptions): string {
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 300;
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 72;
  const log = !!opts.log;
  const fmt = opts.format ?? ((v: number) => formatNumber(v, { digits: 3, trim: false, unit: opts.unit }));
  const tip = (p: SparkPoint): string => {
    if (p.value === null || !Number.isFinite(p.value)) return `${p.label}: ${opts.missing ?? 'no data'}`;
    const flags = [p.predicted ? 'predicted' : '', log && p.value <= 0 ? 'not on log scale' : ''].filter(Boolean);
    return `${p.label}: ${fmt(p.value)}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  };

  const n = points.length;
  const top = PAD_TOP;
  const bottom = Math.max(top + 1, height - PAD_BOTTOM);
  const step = n > 1 ? (width - 2 * PAD_X) / (n - 1) : 0;
  const xOf = (i: number): number => (n === 1 ? width / 2 : PAD_X + i * step);
  const scaled = points.map((p) => (plottable(p.value, log) ? (log ? Math.log10(p.value) : p.value) : null));
  const ext = extremes(points, log);
  const lo = ext ? (log ? Math.log10(ext.min.value) : ext.min.value) : 0;
  const hi = ext ? (log ? Math.log10(ext.max.value) : ext.max.value) : 0;
  const yOf = (v: number): number => (hi === lo ? (top + bottom) / 2 : bottom - ((v - lo) / (hi - lo)) * (bottom - top));
  const hitR = Math.min(10, Math.max(MARKER_R, step / 2 || 10));
  const highlight = opts.highlight !== undefined && opts.highlight >= 0 && opts.highlight < n ? opts.highlight : -1;

  const svgAttrs: Record<string, string | number> = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${num(width)} ${num(height)}`,
    width,
    height,
    'font-family': FONT,
    'font-size': LABEL_SIZE,
    style: 'font-variant-numeric: tabular-nums',
  };
  if (opts.title) Object.assign(svgAttrs, { role: 'img', 'aria-label': opts.title });
  else svgAttrs['aria-hidden'] = 'true';
  const out: string[] = [`<svg ${attrs(svgAttrs)}>`];

  out.push(`<line ${attrs({ x1: 0, y1: height - 0.5, x2: width, y2: height - 0.5, stroke: SPARK_COLORS.baseline, 'stroke-opacity': '0.14', 'stroke-width': 1 })}/>`);

  if (highlight >= 0 && scaled[highlight] === null) {
    const x = xOf(highlight);
    out.push(`<line ${attrs({ x1: x, y1: top - RING_R, x2: x, y2: bottom + RING_R, stroke: SPARK_COLORS.ring, 'stroke-opacity': '0.5', 'stroke-width': 1, 'stroke-dasharray': '2 3' })}/>`);
  }

  // One path per run of consecutive values; a lone value between gaps is just its marker.
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 1) {
      out.push(`<path ${attrs({ d: `M${run.join('L')}`, fill: 'none', stroke: SPARK_COLORS.line, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })}/>`);
    }
    run = [];
  };
  scaled.forEach((v, i) => {
    if (v === null) flush();
    else run.push(`${num(xOf(i))} ${num(yOf(v))}`);
  });
  flush();

  points.forEach((p, i) => {
    const v = scaled[i];
    const x = xOf(i);
    if (v === null || v === undefined) {
      out.push(`<g><title>${xml(tip(p))}</title>`
        + `<rect ${attrs({ x: x - hitR, y: top, width: hitR * 2, height: height - top, fill: 'transparent' })}/>`
        + `<line ${attrs({ x1: x, y1: height - 5, x2: x, y2: height - 1, stroke: SPARK_COLORS.gap, 'stroke-width': 1 })}/></g>`);
      return;
    }
    const y = yOf(v);
    const marker: Record<string, string | number> = p.predicted
      ? { cx: x, cy: y, r: MARKER_R - 0.75, fill: SPARK_COLORS.surface, stroke: SPARK_COLORS.line, 'stroke-width': 1.5 }
      : { cx: x, cy: y, r: MARKER_R, fill: SPARK_COLORS.line };
    out.push(`<g><title>${xml(tip(p))}</title>`
      + `<circle ${attrs({ cx: x, cy: y, r: hitR, fill: 'transparent' })}/>`
      + `<circle ${attrs(marker)}/></g>`);
  });

  if (highlight >= 0) {
    const v = scaled[highlight];
    if (v !== null && v !== undefined) {
      out.push(`<circle ${attrs({ cx: xOf(highlight), cy: yOf(v), r: RING_R, fill: 'none', stroke: SPARK_COLORS.ring, 'stroke-width': 1.5, 'pointer-events': 'none' })}/>`);
    }
  }

  if (ext) {
    const { min, max } = ext;
    out.push(label(fmt(max.value), xOf(max.index), yOf(hi) - RING_R - 2, width));
    if (min.index !== max.index && hi !== lo) out.push(label(fmt(min.value), xOf(min.index), yOf(lo) + RING_R + 10, width));
  } else {
    out.push(`<text ${attrs({ x: width / 2, y: (top + bottom) / 2 + 4, 'text-anchor': 'middle', fill: SPARK_COLORS.text })}>No data</text>`);
  }

  out.push('</svg>');
  return out.join('');
}

/** Parse sparklineSvg() output into a live SVG element (see the escaping contract above). */
export function sparklineElement(points: readonly SparkPoint[], opts: SparklineOptions): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(sparklineSvg(points, opts), 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.getElementsByTagName('parsererror').length || svg.localName !== 'svg') return null;
  return document.importNode(svg, true) as unknown as SVGSVGElement;
}
