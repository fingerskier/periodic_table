import { describe, expect, it } from 'vitest';
import { UNIT_SPACE as U } from '../src/ui/format';
import { extremes, SPARK_COLORS, sparklineSvg, type SparkPoint } from '../src/ui/sparkline';

const OPTS = { width: 300, height: 76 };

type Attrs = Record<string, string>;

function tags(svg: string, name: string): Attrs[] {
  const out: Attrs[] = [];
  for (const m of svg.matchAll(new RegExp(`<${name}\\s([^>]*?)/?>`, 'g'))) {
    const attrs: Attrs = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

const markers = (svg: string): Attrs[] => tags(svg, 'circle').filter((c) => c.r === '4');
const rings = (svg: string): Attrs[] => tags(svg, 'circle').filter((c) => c.r === '7');
const titles = (svg: string): string[] => [...svg.matchAll(/<title>(.*?)<\/title>/g)].map((m) => m[1]!);
const texts = (svg: string): string[] => [...svg.matchAll(/<text [^>]*>(.*?)<\/text>/g)].map((m) => m[1]!);

function points(...values: (number | null)[]): SparkPoint[] {
  return values.map((value, i) => ({ label: `E${i}`, value }));
}

/** Cheap well-formedness check: every opened element is closed in order. */
function balanced(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  return stack.length === 0;
}

describe('sparklineSvg', () => {
  it('emits a self-contained, scalable SVG', () => {
    const svg = sparklineSvg(points(1, 2, 3), OPTS);
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    const [root] = tags(svg, 'svg');
    expect(root).toMatchObject({ xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 300 76', width: '300', height: '76' });
    expect(balanced(svg)).toBe(true);
  });

  it('draws one 2px round-capped line through contiguous values, with a marker per point', () => {
    const svg = sparklineSvg(points(1, 2, 3, 4), OPTS);
    const paths = tags(svg, 'path');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ stroke: SPARK_COLORS.line, 'stroke-width': '2', 'stroke-linecap': 'round', fill: 'none' });
    expect(paths[0]!.d!.match(/[ML]/g)).toHaveLength(4);
    expect(markers(svg)).toHaveLength(4);
    expect(markers(svg).every((m) => m.fill === SPARK_COLORS.line)).toBe(true);
  });

  it('breaks the line at nulls into separate path segments', () => {
    const svg = sparklineSvg(points(1, 2, null, 3, 4), OPTS);
    expect(tags(svg, 'path')).toHaveLength(2);
    expect(markers(svg)).toHaveLength(4);
    expect(titles(svg)).toContain('E2: no data');
  });

  it('draws a lone value between gaps as a marker without a line', () => {
    const svg = sparklineSvg(points(null, 5, null, 6, 7), OPTS);
    expect(tags(svg, 'path')).toHaveLength(1);
    expect(markers(svg)).toHaveLength(3);
  });

  it('treats non-finite values as gaps', () => {
    const svg = sparklineSvg(points(1, Number.NaN, 3), OPTS);
    expect(tags(svg, 'path')).toHaveLength(0);
    expect(markers(svg)).toHaveLength(2);
  });

  it('places points left to right and maps high values upward', () => {
    const svg = sparklineSvg(points(1, 3, 2), OPTS);
    const [a, b, c] = markers(svg).map((m) => ({ x: Number(m.cx), y: Number(m.cy) }));
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
    expect(b!.y).toBeLessThan(c!.y);
    expect(c!.y).toBeLessThan(a!.y);
    for (const p of [a!, b!, c!]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(300);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(76);
    }
  });

  it('gives each point a tooltip with its formatted value and unit', () => {
    const svg = sparklineSvg([{ label: 'Fe', value: 7.9024681 }, { label: 'Co', value: 7.88101 }], { ...OPTS, unit: 'eV' });
    expect(titles(svg)).toEqual([`Fe: 7.90${U}eV`, `Co: 7.88${U}eV`]);
  });

  it('uses a custom formatter when given one', () => {
    const svg = sparklineSvg(points(1, 2), { ...OPTS, format: (v) => `${v} units` });
    expect(titles(svg)).toEqual(['E0: 1 units', 'E1: 2 units']);
  });

  it('labels the minimum and maximum in the text colour at 11px', () => {
    const svg = sparklineSvg(points(3, 1, 2), OPTS);
    expect(texts(svg).sort()).toEqual(['1.00', '3.00']);
    expect(tags(svg, 'text').every((t) => t.fill === SPARK_COLORS.text)).toBe(true);
    expect(tags(svg, 'svg')[0]!['font-size']).toBe('11');
  });

  it('keeps edge labels inside the box', () => {
    const svg = sparklineSvg(points(100000, 1, 2, 3, 5), { ...OPTS, format: (v) => `${v} long unit text` });
    const anchors = tags(svg, 'text').map((t) => t['text-anchor']);
    expect(anchors).toContain('start');
  });

  it('draws a recessive baseline', () => {
    const svg = sparklineSvg(points(1, 2), OPTS);
    const base = tags(svg, 'line')[0]!;
    expect(Number(base['stroke-opacity'])).toBeLessThan(0.3);
    expect(Number(base.y1)).toBeGreaterThan(70);
  });

  it('centres a single point and labels it once', () => {
    const svg = sparklineSvg([{ label: 'H', value: 13.6 }], OPTS);
    expect(tags(svg, 'path')).toHaveLength(0);
    const [m] = markers(svg);
    expect(Number(m!.cx)).toBe(150);
    expect(texts(svg)).toEqual(['13.6']);
  });

  it('labels a flat series once and keeps it inside the plot', () => {
    const svg = sparklineSvg(points(2, 2, 2), OPTS);
    expect(texts(svg)).toHaveLength(1);
    const ys = markers(svg).map((m) => Number(m.cy));
    expect(new Set(ys).size).toBe(1);
    expect(Number.isFinite(ys[0])).toBe(true);
  });

  it('says "No data" when every value is missing', () => {
    const svg = sparklineSvg(points(null, null, null), OPTS);
    expect(tags(svg, 'path')).toHaveLength(0);
    expect(markers(svg)).toHaveLength(0);
    expect(texts(svg)).toEqual(['No data']);
    expect(titles(svg)).toEqual(['E0: no data', 'E1: no data', 'E2: no data']);
    expect(balanced(svg)).toBe(true);
  });

  it('copes with no points at all', () => {
    const svg = sparklineSvg([], OPTS);
    expect(texts(svg)).toEqual(['No data']);
    expect(balanced(svg)).toBe(true);
  });

  it('rings the highlighted point', () => {
    const svg = sparklineSvg(points(1, 2, 3), { ...OPTS, highlight: 1 });
    const ring = rings(svg);
    expect(ring).toHaveLength(1);
    expect(ring[0]).toMatchObject({ fill: 'none', stroke: SPARK_COLORS.ring });
    expect(ring[0]!.cx).toBe(markers(svg)[1]!.cx);
    expect(ring[0]!.cy).toBe(markers(svg)[1]!.cy);
  });

  it('marks a highlighted gap with a dashed guide instead of a ring', () => {
    const svg = sparklineSvg(points(1, null, 3), { ...OPTS, highlight: 1 });
    expect(rings(svg)).toHaveLength(0);
    expect(tags(svg, 'line').filter((l) => l['stroke-dasharray'])).toHaveLength(1);
  });

  it('ignores an out-of-range highlight', () => {
    for (const highlight of [-1, 3, 99]) {
      const svg = sparklineSvg(points(1, 2, 3), { ...OPTS, highlight });
      expect(rings(svg)).toHaveLength(0);
      expect(tags(svg, 'line').filter((l) => l['stroke-dasharray'])).toHaveLength(0);
    }
  });

  it('plots log10 values when asked and leaves non-positive ones off the axis', () => {
    const svg = sparklineSvg(points(1, 10, 100), { ...OPTS, log: true });
    const ys = markers(svg).map((m) => Number(m.cy));
    expect(ys[1]).toBeCloseTo((ys[0]! + ys[2]!) / 2, 1);
    const withZero = sparklineSvg(points(0, 10, -5, 100, null), { ...OPTS, log: true, format: String });
    expect(markers(withZero)).toHaveLength(2);
    expect(tags(withZero, 'path')).toHaveLength(0);
    // The value exists, so the tooltip gives it rather than claiming there is no data.
    expect(titles(withZero)).toEqual(['E0: 0 (not on log scale)', 'E1: 10', 'E2: -5 (not on log scale)', 'E3: 100', 'E4: no data']);
    expect(texts(withZero).sort()).toEqual(['10', '100']);
  });

  it('draws predicted values as hollow markers and says so in the tooltip', () => {
    const svg = sparklineSvg([{ label: 'Rf', value: 6.0, predicted: true }, { label: 'Hf', value: 6.83 }], { ...OPTS, format: String });
    const hollow = tags(svg, 'circle').filter((c) => c.stroke === SPARK_COLORS.line && c.fill === SPARK_COLORS.surface);
    expect(hollow).toHaveLength(1);
    expect(markers(svg)).toHaveLength(1);
    expect(titles(svg)).toEqual(['Rf: 6 (predicted)', 'Hf: 6.83']);
  });

  it('uses the caller wording for missing values', () => {
    const svg = sparklineSvg(points(null, 1766), { ...OPTS, missing: 'known since antiquity' });
    expect(titles(svg)[0]).toBe('E0: known since antiquity');
  });

  it('drops characters that XML cannot carry, so the chart still parses', () => {
    const svg = sparklineSvg([{ label: 'A\u0001\u001f\uFFFE\uD800', value: 1 }, { label: 'B', value: 2 }], { ...OPTS, title: 'T\u0000' });
    expect(svg).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/);
    expect(titles(svg)[0]).toBe('A: 1.00');
    expect(tags(svg, 'svg')[0]!['aria-label']).toBe('T');
    expect(balanced(svg)).toBe(true);
  });

  it('escapes every piece of caller text', () => {
    const nasty = `<script>alert("x")</script> & 'q'`;
    const svg = sparklineSvg([{ label: nasty, value: 1 }, { label: nasty, value: null }], {
      ...OPTS,
      unit: '<u>',
      title: `"><img src=x onerror=alert(1)>`,
    });
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<u>');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;');
    expect(tags(svg, 'svg')[0]!['aria-label']).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(balanced(svg)).toBe(true);
  });

  it('is an accessible image when titled and hidden otherwise', () => {
    const titled = tags(sparklineSvg(points(1, 2), { ...OPTS, title: 'Ionization energy' }), 'svg')[0]!;
    expect(titled).toMatchObject({ role: 'img', 'aria-label': 'Ionization energy' });
    expect(titled['aria-hidden']).toBeUndefined();
    const plain = tags(sparklineSvg(points(1, 2), OPTS), 'svg')[0]!;
    expect(plain['aria-hidden']).toBe('true');
    expect(plain.role).toBeUndefined();
  });

  it('falls back to a default box for invalid sizes', () => {
    const svg = sparklineSvg(points(1, 2), { width: Number.NaN, height: -4 });
    expect(tags(svg, 'svg')[0]!.viewBox).toBe('0 0 300 72');
  });
});

describe('extremes', () => {
  it('finds the first minimum and maximum, skipping gaps', () => {
    expect(extremes(points(3, null, 1, 5, 1, 5))).toEqual({ min: { index: 2, value: 1 }, max: { index: 3, value: 5 } });
  });

  it('respects the log filter', () => {
    expect(extremes(points(-2, 0, 4, 8), true)).toEqual({ min: { index: 2, value: 4 }, max: { index: 3, value: 8 } });
  });

  it('returns null when nothing is plottable', () => {
    expect(extremes([])).toBeNull();
    expect(extremes(points(null, null))).toBeNull();
    expect(extremes(points(0, -1), true)).toBeNull();
  });
});
