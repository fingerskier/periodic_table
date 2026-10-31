import './panels.css';
import type { Block, ColorMode, ElementData, LegendFocus, NumericProp, Phase, UiContext } from '../types';
import { h, replaceChildren } from './dom';
import { formatCompact, formatNumber, formatYear, withUnit } from './format';
import { BLOCK_COLORS, CATEGORIES, NO_DATA_COLOR, NUMERIC_PROP_BY_ID, PHASE_COLORS, rampColor, SEQUENTIAL_RAMP } from './palette';
import { ICONS, svgIcon } from './toolbar';

// Colour legend over the stage. Pointing at (or focusing) a key sets state.legendFocus, and the
// scene dims every tile that does not match it.

// ---------------------------------------------------------------- pure helpers (exported for tests)

export type CategoricalMode = 'category' | 'block' | 'phase';

export function isCategorical(mode: ColorMode): mode is CategoricalMode {
  return mode === 'category' || mode === 'block' || mode === 'phase';
}

export interface NumericDomain {
  /** Smallest and largest usable value, in the property's own units (also on a log scale). */
  min: number;
  max: number;
  log: boolean;
  /** Elements with a usable value. */
  count: number;
  /** Elements drawn as "no data": null or non-finite, or ≤ 0 on a log scale. */
  missing: number;
}

/** Value range of a property over `elements`; null when no element has a usable value. */
export function numericDomain(elements: readonly ElementData[], prop: NumericProp, log = false): NumericDomain | null {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const e of elements) {
    const v = e[prop];
    if (typeof v !== 'number' || !Number.isFinite(v) || (log && v <= 0)) continue;
    count++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return count ? { min, max, log, count, missing: elements.length - count } : null;
}

export interface RampBin {
  index: number;
  /** Values in [lo, hi] get `color`; neighbouring bins share their edge value. */
  lo: number;
  hi: number;
  color: string;
  /** Fraction of the ramp's length (the two end bins are half as long as the rest). */
  share: number;
}

/**
 * The value range behind each ramp step. Tiles take the step nearest to their position t in
 * [0, 1] (palette.rampColor), so step i covers t in [(i − ½)/(n − 1), (i + ½)/(n − 1)], clipped
 * to [0, 1]; on a log scale t is linear in log10(value). A domain of one value gets one bin in
 * the middle colour, as tiles do.
 */
export function rampBins(domain: NumericDomain, steps = SEQUENTIAL_RAMP.length): RampBin[] {
  const n = Math.floor(steps);
  if (!(n >= 1)) return [];
  const { min, max, log } = domain;
  if (n === 1 || !(max > min)) return [{ index: 0, lo: min, hi: max, color: rampColor(0.5), share: 1 }];
  const a = log ? Math.log10(min) : min;
  const b = log ? Math.log10(max) : max;
  // Exact ends, so the extremes always fall inside the first and last bins.
  const valueAt = (t: number) => (t <= 0 ? min : t >= 1 ? max : log ? 10 ** (a + t * (b - a)) : a + t * (b - a));
  const edge = (k: number) => (k <= 0 ? 0 : k >= n ? 1 : (k - 0.5) / (n - 1));
  return Array.from({ length: n }, (_, i) => {
    const t0 = edge(i);
    const t1 = edge(i + 1);
    return { index: i, lo: valueAt(t0), hi: valueAt(t1), color: rampColor(i / (n - 1)), share: t1 - t0 };
  });
}

export function sameLegendFocus(a: LegendFocus | null, b: LegendFocus | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'range') {
    const o = b as typeof a;
    return a.prop === o.prop && a.lo === o.lo && a.hi === o.hi;
  }
  if (a.kind === 'missing') return a.prop === (b as typeof a).prop;
  return a.id === (b as typeof a).id;
}

/** Whether a legend focus belongs to the legend drawn for `mode` (stale ones get cleared). */
export function focusFitsMode(focus: LegendFocus, mode: ColorMode): boolean {
  return focus.kind === 'range' || focus.kind === 'missing' ? focus.prop === mode : focus.kind === mode;
}

export interface LegendKey {
  focus: LegendFocus;
  label: string;
  color: string;
}

const BLOCK_ORDER: readonly Block[] = ['s', 'p', 'd', 'f'];
const PHASE_ORDER: readonly (Phase | 'unknown')[] = ['solid', 'liquid', 'gas', 'unknown'];
const PHASE_LABELS: Readonly<Record<Phase | 'unknown', string>> = { solid: 'Solid', liquid: 'Liquid', gas: 'Gas', unknown: 'Unknown' };

export function legendKeys(mode: CategoricalMode): LegendKey[] {
  switch (mode) {
    case 'category':
      return CATEGORIES.map((c) => ({ focus: { kind: 'category', id: c.id }, label: c.label, color: c.color }));
    case 'block':
      return BLOCK_ORDER.map((b) => ({ focus: { kind: 'block', id: b }, label: `${b}-block`, color: BLOCK_COLORS[b] }));
    case 'phase':
      return PHASE_ORDER.map((p) => ({ focus: { kind: 'phase', id: p }, label: PHASE_LABELS[p], color: PHASE_COLORS[p] }));
  }
}

export function legendTitle(mode: ColorMode): string {
  switch (mode) {
    case 'category': return 'Category';
    case 'block': return 'Block';
    case 'phase': return 'Phase at 25 °C';
    default: return NUMERIC_PROP_BY_ID.get(mode)?.label ?? mode;
  }
}

/** A ramp end or bin edge, without unit (the legend title carries it). */
export function formatLegendValue(prop: NumericProp, value: number): string {
  if (prop === 'discoveryYear') return formatYear(value);
  if (NUMERIC_PROP_BY_ID.get(prop)?.log) return formatCompact(value, 3);
  return formatNumber(value, { digits: 3 });
}

/** '3.89 – 5.41 eV' (or with `sep` ' to ' for screen readers). */
export function rangeLabel(prop: NumericProp, lo: number, hi: number, sep = ' – '): string {
  const text = `${formatLegendValue(prop, lo)}${sep}${formatLegendValue(prop, hi)}`;
  return withUnit(text, NUMERIC_PROP_BY_ID.get(prop)?.unit);
}

/** Label of the "no value" swatch: a null discovery year means known since antiquity. */
export function missingLabel(prop: NumericProp): string {
  return prop === 'discoveryYear' ? 'Known since antiquity' : 'No data';
}

// ---------------------------------------------------------------- overlay

interface Key {
  el: HTMLButtonElement;
  focus: LegendFocus;
  /** Range text shown under the ramp while this step is focused. */
  readout?: string;
}

let mounts = 0;

function swatch(color: string): HTMLElement {
  const el = h('span', { class: 'lg-sw', 'aria-hidden': 'true' });
  el.style.background = color;
  return el;
}

export function mountLegend(root: HTMLElement, ctx: UiContext): void {
  const hintId = `lg-hint-${++mounts}`;
  const title = h('span', { class: 'lg-title' });
  const sub = h('span', { class: 'lg-sub' });
  const body = h('div', { class: 'lg-body' });
  const hint = h('p', { id: hintId, class: 'pn-sr' }, 'Point at or focus a key to highlight its elements; arrow keys move between keys.');
  // Small screens start with the legend folded to its title, leaving the stage to the cylinder.
  const small = window.matchMedia?.('(max-width: 520px), (max-height: 520px)').matches ?? false;
  const head = h('summary', { class: 'lg-head' }, h('span', { class: 'lg-eyebrow' }, 'Colour'), title, sub, svgIcon(ICONS.chevron, 14));
  replaceChildren(root, h('details', { class: 'lg', open: !small }, head, body));

  let keys: Key[] = [];
  let scale: { root: HTMLElement; range: HTMLElement } | null = null;
  /** What the keys were built from; nothing else changes them (the group-3 convention does not). */
  let shownMode: ColorMode | null = null;
  let shownElements: readonly ElementData[] | null = null;
  let rendering = false;
  let pointerType = '';

  const current = () => ctx.store.get().legendFocus;
  const setFocus = (f: LegendFocus | null) => {
    if (!sameLegendFocus(current(), f)) ctx.store.set({ legendFocus: f });
  };
  const release = (f: LegendFocus) => {
    if (sameLegendFocus(current(), f)) ctx.store.set({ legendFocus: null });
  };
  const isKey = (t: EventTarget | null) => keys.some((k) => k.el === t);

  function addKey(el: HTMLButtonElement, focus: LegendFocus, readout?: string): void {
    keys.push({ el, focus, readout });
    // Mouse and pen: highlight while pointing. Touch has no hover, so a tap toggles instead.
    el.addEventListener('pointerenter', (ev) => {
      if (ev.pointerType !== 'touch') setFocus(focus);
    });
    el.addEventListener('pointerleave', (ev) => {
      if (ev.pointerType !== 'touch') release(focus);
    });
    el.addEventListener('focus', () => {
      for (const k of keys) k.el.tabIndex = k.el === el ? 0 : -1;
      if (el.matches(':focus-visible')) setFocus(focus);
    });
    el.addEventListener('blur', (ev) => {
      // Chrome also blurs a focused key that render() removes; render() moves focus on itself.
      if (!rendering && !isKey(ev.relatedTarget)) release(focus);
    });
    el.addEventListener('click', (ev) => {
      const toggles = ev.detail === 0 || pointerType === 'touch';
      setFocus(toggles && sameLegendFocus(current(), focus) ? null : focus);
    });
  }

  function renderKeys(mode: CategoricalMode): void {
    title.textContent = legendTitle(mode);
    sub.textContent = '';
    const buttons = legendKeys(mode).map((key) => {
      const el = h('button', { type: 'button', class: 'lg-key', 'aria-pressed': 'false' }, swatch(key.color), h('span', null, key.label));
      addKey(el, key.focus);
      return el;
    });
    replaceChildren(
      body,
      h('div', { class: `lg-keys lg-keys--${mode}`, role: 'group', 'aria-label': `${legendTitle(mode)} key`, 'aria-describedby': hintId }, buttons),
      hint,
    );
  }

  function renderRamp(prop: NumericProp, elements: readonly ElementData[]): void {
    const meta = NUMERIC_PROP_BY_ID.get(prop);
    const log = !!meta?.log;
    title.textContent = legendTitle(prop);
    sub.textContent = [meta?.unit, log ? 'log scale' : ''].filter(Boolean).join(' · ');
    const domain = numericDomain(elements, prop, log);
    if (!domain) {
      replaceChildren(body, h('p', { class: 'lg-empty' }, 'No element has a value for this property.'));
      return;
    }
    const segments = rampBins(domain).map((bin) => {
      const el = h('button', { type: 'button', class: 'lg-seg', 'aria-pressed': 'false', 'aria-label': rangeLabel(prop, bin.lo, bin.hi, ' to ') });
      el.style.background = bin.color;
      el.style.flexGrow = String(bin.share);
      addKey(el, { kind: 'range', prop, lo: bin.lo, hi: bin.hi }, rangeLabel(prop, bin.lo, bin.hi));
      return el;
    });
    const range = h('span', { class: 'lg-range' });
    const scaleEl = h(
      'div',
      { class: 'lg-scale', 'aria-hidden': 'true' },
      h('span', { class: 'lg-end' }, formatLegendValue(prop, domain.min)),
      range,
      h('span', { class: 'lg-end' }, formatLegendValue(prop, domain.max)),
    );
    scale = { root: scaleEl, range };
    let missing: HTMLButtonElement | null = null;
    if (domain.missing > 0) {
      missing = h(
        'button',
        { type: 'button', class: 'lg-missing lg-key', 'aria-pressed': 'false' },
        swatch(NO_DATA_COLOR),
        h('span', null, missingLabel(prop)),
        h('span', { class: 'lg-count' }, domain.missing, h('span', { class: 'pn-sr' }, domain.missing === 1 ? ' element' : ' elements')),
      );
      addKey(missing, { kind: 'missing', prop });
    }
    replaceChildren(
      body,
      h(
        'div',
        { class: 'lg-ramp' },
        h(
          'div',
          { class: 'lg-ramp-main' },
          h('div', { class: 'lg-bar', role: 'group', 'aria-label': `${legendTitle(prop)}, low to high`, 'aria-describedby': hintId }, segments),
          scaleEl,
        ),
        missing,
      ),
      hint,
    );
  }

  function sync(focus: LegendFocus | null): void {
    let reading = '';
    for (const k of keys) {
      const on = sameLegendFocus(k.focus, focus);
      k.el.setAttribute('aria-pressed', String(on));
      if (on && k.readout) reading = k.readout;
    }
    if (scale) {
      scale.range.textContent = reading;
      scale.root.classList.toggle('is-reading', reading !== '');
    }
  }

  function render(): void {
    const mode = ctx.store.get().colorMode;
    const focused = keys.findIndex((k) => k.el === document.activeElement);
    shownMode = mode;
    shownElements = ctx.model().elements;
    keys = [];
    scale = null;
    rendering = true;
    try {
      if (isCategorical(mode)) renderKeys(mode);
      else renderRamp(mode, shownElements);
    } finally {
      rendering = false;
    }
    keys.forEach((k, i) => (k.el.tabIndex = i === 0 ? 0 : -1));
    // A keyboard user whose key was rebuilt stays at the same place in the legend.
    if (focused >= 0) (keys[Math.min(focused, keys.length - 1)]?.el ?? head).focus({ preventScroll: true });
    // Read the store again: focusing above, or a blur in another panel, may have changed it.
    sync(ctx.store.get().legendFocus);
  }

  // Roving focus: one tab stop for the whole key set; arrows move within it (and so do not
  // reach the scene's rotate/tilt shortcuts).
  body.addEventListener('keydown', (ev) => {
    const i = keys.findIndex((k) => k.el === ev.target);
    if (i < 0) return;
    const last = keys.length - 1;
    const next = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? Math.min(last, i + 1)
      : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? Math.max(0, i - 1)
        : ev.key === 'Home' ? 0
          : ev.key === 'End' ? last
            : -1;
    if (next < 0) return;
    ev.preventDefault();
    keys[next]!.el.focus();
  });
  // Presses on the legend are not drags or clicks on the cylinder (the stage listens for both).
  root.addEventListener('pointerdown', (ev) => {
    pointerType = ev.pointerType;
    ev.stopPropagation();
  });

  ctx.store.subscribe((s, prev) => {
    if (s.colorMode !== shownMode || ctx.model().elements !== shownElements) render();
    else if (s.legendFocus !== prev.legendFocus) sync(s.legendFocus);
    if (s.legendFocus && !focusFitsMode(s.legendFocus, s.colorMode)) {
      // Deferred: setting state inside a listener would notify the others re-entrantly.
      queueMicrotask(() => {
        const cur = ctx.store.get();
        if (cur.legendFocus && !focusFitsMode(cur.legendFocus, cur.colorMode)) ctx.store.set({ legendFocus: null });
      });
    }
  });
  render();
}
