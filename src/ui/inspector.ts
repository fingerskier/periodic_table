import './inspector.css';
import { activeTarget, isItemVisible, isLayerOn, sameTarget } from '../state';
import type {
  AppState,
  Cell,
  CategoryId,
  ColumnInfo,
  ElementData,
  Model,
  NumericProp,
  Phase,
  RelationItem,
  RelationLayer,
  RelationSetChain,
  Source,
  Target,
  UiContext,
} from '../types';
import { h, replaceChildren } from './dom';
import {
  capitalize,
  formatCompact,
  formatMass,
  formatNumber,
  formatOxidationStates,
  formatPropValue,
  formatTemperature,
  formatYear,
  NO_VALUE,
  superscriptConfig,
  withUnit,
  type NumberFormat,
} from './format';
import { CATEGORIES, CATEGORY_BY_ID, inkFor, NUMERIC_PROP_BY_ID, NUMERIC_PROPS, PHASE_COLORS } from './palette';
import { extremes, sparklineElement, type Extreme, type SparkPoint } from './sparkline';

// The details panel. It re-renders wholesale from (store, model) whenever the shown target or
// a setting it depends on changes, keeping scroll position and keyboard focus where it can.

type Kid = Node | string | number | null | undefined | false;
type Kids = Kid | Kid[];

// ---------------------------------------------------------------- pure helpers (exported for tests)

/** True when a store change alters what the panel shows. */
export function shouldRender(s: AppState, prev: AppState): boolean {
  return (
    !sameTarget(activeTarget(s), activeTarget(prev)) ||
    (s.pinned === null) !== (prev.pinned === null) ||
    s.trendProp !== prev.trendProp ||
    s.layers !== prev.layers ||
    s.convention !== prev.convention ||
    s.colorMode !== prev.colorMode
  );
}

export function propValue(e: ElementData, prop: NumericProp): number | null {
  const v = e[prop];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Sparkline points for a run of elements (symbols as labels, missing data as null). */
export function trendPoints(byZ: ReadonlyMap<number, ElementData>, members: readonly number[], prop: NumericProp): SparkPoint[] {
  return members.map((z) => {
    const e = byZ.get(z);
    return { label: e?.symbol ?? String(z), value: e ? propValue(e, prop) : null };
  });
}

export interface CategoryCount {
  id: CategoryId;
  label: string;
  color: string;
  count: number;
}

/** Members per metallicity class, in legend order, non-zero only. */
export function categoryCounts(byZ: ReadonlyMap<number, ElementData>, members: readonly number[]): CategoryCount[] {
  const counts = new Map<CategoryId, number>();
  for (const z of members) {
    const e = byZ.get(z);
    if (e) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  }
  return CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({ ...c, count: counts.get(c.id)! }));
}

export type PhaseKey = Phase | 'unknown';

/** Members per phase at 25 °C (solid, liquid, gas, unknown), non-zero only. */
export function phaseCounts(byZ: ReadonlyMap<number, ElementData>, members: readonly number[]): { phase: PhaseKey; count: number }[] {
  const order: PhaseKey[] = ['solid', 'liquid', 'gas', 'unknown'];
  const counts = new Map<PhaseKey, number>();
  for (const z of members) {
    const key: PhaseKey = byZ.get(z)?.phase ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.filter((p) => counts.has(p)).map((phase) => ({ phase, count: counts.get(phase)! }));
}

/** 'Group 17' or 'f-block column 3'. */
export function columnTitle(info: Pick<ColumnInfo, 'kind' | 'group' | 'fIndex' | 'column'>): string {
  if (info.kind === 'group' && info.group !== null) return `Group ${info.group}`;
  if (info.kind === 'f' && info.fIndex !== null) return `f-block column ${info.fIndex}`;
  return `Column ${info.column}`;
}

// Which element fields a free-text note is about, so the facts grid can point at it.
const NOTE_FIELDS: readonly (readonly [RegExp, keyof ElementData])[] = [
  [/\bbp\b|boil|sublim/i, 'bp'],
  [/\bmp\b|melt/i, 'mp'],
  [/densit/i, 'density'],
  [/configuration|\bconfig\b/i, 'config'],
  [/\bphase\b/i, 'phase'],
  [/electronegativ|\bEN\b/, 'en'],
  [/ioni[sz]ation|\bIE1?\b/, 'ie1'],
  [/electron affinity|\bEA\b/, 'ea'],
  [/atomic radius/i, 'atomicRadius'],
  [/covalent/i, 'covalentRadius'],
  [/van der waals|\bvdw\b/i, 'vdwRadius'],
  [/oxidation/i, 'oxidationStates'],
  [/discover/i, 'discoveryYear'],
  [/abundance/i, 'abundanceCrust'],
  [/atomic weight|\bmass\b/i, 'mass'],
  [/goldschmidt/i, 'goldschmidt'],
  [/pettifor/i, 'pettifor'],
];

export function noteFields(note: string): (keyof ElementData)[] {
  return NOTE_FIELDS.filter(([re]) => re.test(note)).map(([, field]) => field);
}

export interface SetEntry {
  kind: 'set';
  layerId: string;
  itemId: string;
  setId?: string;
  label: string;
  /** The chain a set belongs to. */
  context?: string;
  /** This element's caption within the set, e.g. its ion notation. */
  caption?: string;
  members: readonly number[];
  memberLabels?: Record<number, string>;
  color?: string;
}

export interface EdgeEntry {
  kind: 'edge';
  layerId: string;
  itemId: string;
  edgeIndex: number;
  partner: number;
  /** 'out' = this element → partner, 'in' = partner → this element. */
  direction: 'out' | 'in' | 'none';
  label?: string;
  note?: string;
  /** The item label, when the layer has several items. */
  context?: string;
  color?: string;
}

export type RelationEntry = SetEntry | EdgeEntry;

export interface RelationGroup {
  layer: RelationLayer;
  entries: RelationEntry[];
}

/** Sets and edges involving `z` in every visible item of every layer that is switched on. */
export function elementRelations(layers: readonly RelationLayer[], s: AppState, z: number): { anyOn: boolean; groups: RelationGroup[] } {
  let anyOn = false;
  const groups: RelationGroup[] = [];
  for (const layer of layers) {
    if (!isLayerOn(s, layer.id)) continue;
    anyOn = true;
    const entries: RelationEntry[] = [];
    for (const item of layer.items) {
      if (isItemVisible(s, layer.id, item.id)) entries.push(...itemEntries(layer, item, z));
    }
    if (entries.length) groups.push({ layer, entries });
  }
  return { anyOn, groups };
}

function itemEntries(layer: RelationLayer, item: RelationItem, z: number): RelationEntry[] {
  const base = { layerId: layer.id, itemId: item.id, color: item.color };
  switch (item.kind) {
    case 'set':
      return item.members.includes(z)
        ? [{ ...base, kind: 'set', label: item.label, caption: item.memberLabels?.[z], members: item.members, memberLabels: item.memberLabels }]
        : [];
    case 'setChain':
      return item.sets
        .filter((set) => set.members.includes(z))
        .map((set) => ({ ...base, kind: 'set', setId: set.id, label: set.label, context: item.label, members: set.members }));
    case 'edges': {
      const context = layer.items.length > 1 ? item.label : undefined;
      const out: RelationEntry[] = [];
      item.edges.forEach((edge, edgeIndex) => {
        if (edge.a !== z && edge.b !== z) return;
        const outgoing = edge.a === z;
        out.push({
          ...base,
          kind: 'edge',
          edgeIndex,
          partner: outgoing ? edge.b : edge.a,
          direction: item.directed ? (outgoing ? 'out' : 'in') : 'none',
          label: edge.label,
          note: edge.note,
          context,
        });
      });
      return out;
    }
  }
}

function findItem(model: Model, layerId: string, itemId: string): { layer: RelationLayer; item: RelationItem } | null {
  const layer = model.layers.find((l) => l.id === layerId);
  const item = layer?.items.find((i) => i.id === itemId);
  return layer && item ? { layer, item } : null;
}

function symbolOf(model: Model, z: number): string {
  return model.byZ.get(z)?.symbol ?? String(z);
}

/** Short name of a target: 'Iron', 'Group 17', 'Period 4', a relation label, 'Fe → Co'. */
export function targetLabel(model: Model, t: Target): string {
  switch (t.kind) {
    case 'element':
      return model.byZ.get(t.z)?.name ?? `Element ${t.z}`;
    case 'column': {
      const info = model.columns[t.column - 1];
      return info ? columnTitle(info) : `Column ${t.column}`;
    }
    case 'period':
      return `Period ${t.period}`;
    case 'hub': {
      const found = findItem(model, t.layerId, t.itemId);
      if (!found) return 'Relation';
      const set = found.item.kind === 'setChain' ? found.item.sets.find((x) => x.id === t.setId) : undefined;
      return set ? `${found.item.label} · ${set.label}` : found.item.label;
    }
    case 'edge': {
      const found = findItem(model, t.layerId, t.itemId);
      const edge = found?.item.kind === 'edges' ? found.item.edges[t.edgeIndex] : undefined;
      if (!found || found.item.kind !== 'edges' || !edge) return 'Link';
      return `${symbolOf(model, edge.a)} ${found.item.directed ? '→' : '—'} ${symbolOf(model, edge.b)}`;
    }
  }
}

function announcement(model: Model, s: AppState, t: Target): string {
  let text = targetLabel(model, t);
  if (t.kind === 'element') {
    const e = model.byZ.get(t.z);
    if (e) text = `${e.name}, ${e.symbol}, atomic number ${e.z}`;
  }
  return s.pinned ? `Pinned: ${text}` : text;
}

// ---------------------------------------------------------------- mounting

interface View {
  ctx: UiContext;
  s: AppState;
  model: Model;
  /** Intrinsic sparkline width, matched to the panel so labels render at their nominal size. */
  chartWidth: number;
}

export function mountInspector(root: HTMLElement, ctx: UiContext): void {
  const content = h('div', { class: 'insp' });
  const live = h('p', { class: 'insp-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  // Each change rebuilds the whole panel; a live root would read all of it aloud every time.
  // Keep the root quiet and announce a one-line summary instead.
  if (root.hasAttribute('aria-live')) root.setAttribute('aria-live', 'off');
  // First child: its static position stays at the top, so it can never extend the page.
  replaceChildren(root, live, content);

  let shown: Target | null | undefined;
  let shownPinned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const render = (): void => {
    const s = ctx.store.get();
    const model = ctx.model();
    const target = activeTarget(s);
    const first = shown === undefined;
    const sameView = !first && sameTarget(target, shown ?? null);
    const focused = document.activeElement;
    const hadFocus = focused instanceof HTMLElement && content.contains(focused);
    const focusKey = hadFocus ? focused.dataset.focusKey : undefined;
    const scroll = root.scrollTop;

    content.dataset.view = target?.kind ?? 'intro';
    replaceChildren(content, ...buildView({ ctx, s, model, chartWidth: chartWidth(content) }, target));
    root.scrollTop = sameView ? scroll : 0;
    if (hadFocus) restoreFocus(content, focusKey, sameView);

    const pinned = s.pinned !== null;
    if (!first && (!sameView || pinned !== shownPinned)) {
      // Pointer leaving a tile is not news; releasing a pin is.
      const text = target ? announcement(model, s, target) : shownPinned ? 'Selection released.' : '';
      clearTimeout(timer);
      if (text) timer = setTimeout(() => { live.textContent = text; }, 300);
    }
    shown = target;
    shownPinned = pinned;
  };

  render();
  ctx.store.subscribe((s, prev) => {
    if (shouldRender(s, prev)) render();
  });
}

function chartWidth(content: HTMLElement): number {
  const w = content.clientWidth - 32;
  return w > 0 ? Math.round(Math.min(340, Math.max(220, w))) : 316;
}

/** Put focus back on the control with the same key, else on the view heading. */
function restoreFocus(content: HTMLElement, key: string | undefined, sameView: boolean): void {
  const byKey = key ? [...content.querySelectorAll<HTMLElement>('[data-focus-key]')].find((el) => el.dataset.focusKey === key) : undefined;
  const next = byKey ?? content.querySelector<HTMLElement>('[data-heading]');
  next?.focus({ preventScroll: sameView });
}

function buildView(v: View, target: Target | null): Kid[] {
  const body = viewFor(v, target);
  return v.s.pinned ? [pinnedBar(v, v.s.pinned), ...body] : body;
}

function viewFor(v: View, t: Target | null): Kid[] {
  if (!t) return introView(v);
  switch (t.kind) {
    case 'element': return elementView(v, t.z);
    case 'column': return columnView(v, t.column);
    case 'period': return periodView(v, t.period);
    case 'hub': return hubView(v, t);
    case 'edge': return edgeView(v, t);
  }
}

// ---------------------------------------------------------------- shared pieces

function pin(v: View, target: Target): void {
  v.ctx.store.set({ pinned: target });
}

function openColumn(v: View, column: number): void {
  v.ctx.focusColumn(column);
  pin(v, { kind: 'column', column });
}

function sr(text: string): HTMLElement {
  return h('span', { class: 'insp-sr' }, text);
}

/** The view title; programmatic focus lands here when the focused control disappears. */
function heading(...children: Kids[]): HTMLElement {
  return headingWithClass('', ...children);
}

function headingWithClass(cls: string, ...children: Kids[]): HTMLElement {
  return h('h2', { class: cls ? `insp-title ${cls}` : 'insp-title', tabindex: -1, 'data-heading': true }, ...children);
}

function section(title: Kids, ...body: Kids[]): HTMLElement {
  return h('section', { class: 'insp-section' }, h('h3', { class: 'insp-h3' }, title), ...body);
}

function para(text: string, cls = 'insp-text'): HTMLElement {
  return h('p', { class: cls }, text);
}

function swatch(color: string): HTMLElement {
  return h('span', { class: 'insp-swatch', style: `--c:${color}`, 'aria-hidden': 'true' });
}

function linkButton(text: Kids, key: string, onclick: () => void, label?: string): HTMLElement {
  return h('button', { type: 'button', class: 'insp-link', 'data-focus-key': key, 'aria-label': label, onclick }, text);
}

function notFound(text: string): Kid[] {
  return [heading('Not available'), para(text, 'insp-empty')];
}

function categoryColor(e: ElementData | undefined): string {
  return (e && CATEGORY_BY_ID.get(e.category)?.color) ?? PHASE_COLORS.unknown;
}

/** An element as a button that turns the cylinder to it and pins it. */
function elementChip(v: View, z: number, key: string, opts: { caption?: string; size?: 'sm' | 'md' | 'lg' } = {}): HTMLElement {
  const e = v.model.byZ.get(z);
  const symbol = e?.symbol ?? String(z);
  const size = opts.size ?? 'md';
  const caption = opts.caption && opts.caption !== symbol ? opts.caption : undefined;
  const text: Kid[] = size === 'md'
    ? [h('span', { class: 'insp-el-sym' }, symbol), caption ? h('span', { class: 'insp-el-cap' }, caption) : null]
    : [h('span', { class: 'insp-el-sym' }, opts.caption ?? symbol)];
  return h(
    'button',
    {
      type: 'button',
      class: `insp-el insp-el-${size}`,
      style: `--c:${categoryColor(e)}`,
      title: e?.name,
      'data-focus-key': key,
      onclick: () => v.ctx.focusElement(z),
    },
    ...text,
    e ? sr(` ${e.name}`) : null,
  );
}

function memberChips(v: View, members: readonly number[], keyPrefix: string, captions?: Record<number, string>): HTMLElement {
  return h(
    'ul',
    { class: 'insp-chips', role: 'list' },
    members.map((z) => h('li', null, elementChip(v, z, `${keyPrefix}:${z}`, { caption: captions?.[z] }))),
  );
}

function countChips(items: { color: string; label: string; count: number }[]): HTMLElement {
  return h(
    'ul',
    { class: 'insp-counts', role: 'list' },
    items.map((c) => h('li', { class: 'insp-count' }, swatch(c.color), c.label, h('b', null, c.count))),
  );
}

function sourcesList(sources: readonly Source[]): HTMLElement | null {
  if (!sources.length) return null;
  return section(
    'Sources',
    h(
      'ul',
      { class: 'insp-sources', role: 'list' },
      sources.map((src) =>
        h(
          'li',
          null,
          src.url && /^https?:\/\//i.test(src.url)
            ? h('a', { href: src.url, target: '_blank', rel: 'noopener' }, src.label, h('span', { class: 'insp-ext', 'aria-hidden': 'true' }, '↗'), sr(' (opens in a new tab)'))
            : src.label,
        ),
      ),
    ),
  );
}

/** Description, sources and caveat of a relation layer. */
function layerAbout(layer: RelationLayer): Kid[] {
  return [
    layer.description ? section('About this relation', para(layer.description)) : null,
    sourcesList(layer.sources),
    layer.caveat ? h('p', { class: 'insp-caveat' }, h('strong', null, 'Caveat'), ' ', layer.caveat) : null,
  ];
}

function layerEyebrow(layer: RelationLayer, color?: string): HTMLElement {
  return h('p', { class: 'insp-eyebrow' }, swatch(color ?? layer.color), layer.title, h('span', { class: 'insp-eyebrow-sec' }, ` · ${layer.section}`));
}

function pinnedBar(v: View, pinned: Target): HTMLElement {
  return h(
    'div',
    { class: 'insp-pinbar' },
    h('span', { class: 'insp-pin-tag' }, 'Pinned'),
    h('span', { class: 'insp-pin-what' }, targetLabel(v.model, pinned)),
    h(
      'button',
      { type: 'button', class: 'insp-btn', 'data-focus-key': 'unpin', onclick: () => v.ctx.store.set({ pinned: null }) },
      'Release',
      h('kbd', { 'aria-hidden': 'true' }, 'Esc'),
    ),
  );
}

// ---------------------------------------------------------------- trends

function trendSelect(v: View, id: string): HTMLElement {
  const select = h(
    'select',
    {
      id: `insp-trend-${id}`,
      class: 'insp-select',
      'data-focus-key': 'trend',
      onchange: (ev: Event) => {
        const value = (ev.currentTarget as HTMLSelectElement).value as NumericProp;
        if (NUMERIC_PROP_BY_ID.has(value)) v.ctx.store.set({ trendProp: value });
      },
    },
    NUMERIC_PROPS.map((p) => h('option', { value: p.id, selected: p.id === v.s.trendProp }, p.unit ? `${p.label} (${p.unit})` : p.label)),
  );
  return h('label', { class: 'insp-trend-ctl' }, h('span', { class: 'insp-k' }, 'Property'), select);
}

function extremeText(v: View, points: readonly SparkPoint[], x: Extreme): string {
  return `${points[x.index]?.label ?? ''} ${formatPropValue(v.s.trendProp, x.value)}`;
}

function trendChart(v: View, members: readonly number[], caption: string, highlightZ?: number): HTMLElement {
  const prop = v.s.trendProp;
  const meta = NUMERIC_PROP_BY_ID.get(prop);
  const log = !!meta?.log;
  const points = trendPoints(v.model.byZ, members, prop);
  const ext = extremes(points, log);
  const missing = points.filter((p) => p.value === null || (log && p.value <= 0)).length;
  const highlight = highlightZ === undefined ? -1 : members.indexOf(highlightZ);
  const what = `${meta?.label ?? prop}, ${caption.toLowerCase()}`;
  const title = ext
    ? `${what}: lowest ${extremeText(v, points, ext.min)}, highest ${extremeText(v, points, ext.max)}`
    : `${what}: no data`;
  const svg = sparklineElement(points, {
    width: v.chartWidth,
    height: 76,
    highlight: highlight >= 0 ? highlight : undefined,
    log,
    unit: meta?.unit,
    format: (value) => formatPropValue(prop, value),
    title,
  });
  return h(
    'figure',
    { class: 'insp-trend' },
    h('figcaption', { class: 'insp-trend-cap' }, caption, log ? h('span', { class: 'insp-muted' }, ' · log scale') : null),
    svg,
    ext
      ? h(
          'p',
          { class: 'insp-extremes' },
          h('span', null, h('span', { class: 'insp-k' }, 'Low'), extremeText(v, points, ext.min)),
          h('span', null, h('span', { class: 'insp-k' }, 'High'), extremeText(v, points, ext.max)),
          missing ? h('span', { class: 'insp-muted' }, `${missing} without data`) : null,
        )
      : null,
  );
}

// ---------------------------------------------------------------- element view

interface FactSpec {
  key: string;
  label: Kids;
  value: Kids | null;
  predicted?: boolean;
  notes?: number[];
  colour?: boolean;
  /** Spoken in place of the dash when the value is missing. */
  empty?: string;
}

function footnoteRefs(notes: number[] = []): Kid[] {
  return notes.flatMap((n) => [h('sup', { class: 'insp-fnref', 'aria-hidden': 'true' }, n), sr(` (note ${n})`)]);
}

function predictedMark(): Kid[] {
  return [h('span', { class: 'insp-pred', 'aria-hidden': 'true', title: 'Predicted or estimated, not measured' }, '≈'), sr('predicted: ')];
}

function missingValue(spoken = 'no data'): Kid[] {
  return [h('span', { class: 'insp-none', 'aria-hidden': 'true' }, NO_VALUE), sr(spoken)];
}

function factRow(f: FactSpec): HTMLElement {
  const empty = f.value === null || f.value === '';
  return h(
    'div',
    { class: f.colour ? 'insp-fact is-colour' : 'insp-fact', 'data-fact': f.key },
    h('dt', null, f.label, f.colour ? sr(' (tile colour)') : null),
    h('dd', null, ...(f.predicted && !empty ? predictedMark() : []), ...(empty ? missingValue(f.empty) : [f.value]), ...footnoteRefs(f.notes)),
  );
}

function facts(title: string, rows: HTMLElement[]): HTMLElement {
  return section(title, h('dl', { class: 'insp-facts' }, rows));
}

function numberOrNull(value: number | null, opts: NumberFormat): string | null {
  return value === null ? null : formatNumber(value, opts);
}

function discovered(e: ElementData): Kid[] {
  const ancient = e.discoveryYear === null && !!e.discoverers && /ancient|antiquity|prehistor/i.test(e.discoverers);
  return [
    h('span', null, formatYear(e.discoveryYear)),
    e.discoverers && !ancient ? h('span', { class: 'insp-subvalue' }, e.discoverers) : null,
  ];
}

function positionStrip(v: View, cell: Cell | undefined): HTMLElement | null {
  if (!cell) return null;
  const cellOf = (label: string, value: Kids, colour = false): HTMLElement =>
    h('div', { class: colour ? 'is-colour' : null }, h('dt', null, label, colour ? sr(' (tile colour)') : null), h('dd', null, value));
  const column = cell.group !== null
    ? cellOf('Group', linkButton(String(cell.group), 'pos-column', () => openColumn(v, cell.column), `Group ${cell.group}`))
    : cellOf('Column', linkButton(`f${cell.fIndex}`, 'pos-column', () => openColumn(v, cell.column), `Column f${cell.fIndex}, f-block`));
  return h(
    'dl',
    { class: 'insp-pos' },
    column,
    cellOf('Period', linkButton(String(cell.period), 'pos-period', () => pin(v, { kind: 'period', period: cell.period }), `Period ${cell.period}`)),
    cellOf('Block', `${cell.block}-block`, v.s.colorMode === 'block'),
  );
}

function elementHeader(v: View, e: ElementData, refs: (field: string) => number[]): HTMLElement {
  const cat = CATEGORY_BY_ID.get(e.category);
  const color = categoryColor(e);
  const mode = v.s.colorMode;
  const massTitle = e.massIsMassNumber ? 'Mass number of the longest-lived isotope' : 'Standard atomic weight';
  return h(
    'header',
    { class: 'insp-head' },
    h('div', { class: 'insp-tile', style: `--tile:${color};--ink:${inkFor(color)}`, 'aria-hidden': 'true' }, e.symbol),
    h(
      'div',
      { class: 'insp-head-text' },
      heading(e.name, sr(`, ${e.symbol}`)),
      h(
        'p',
        { class: 'insp-meta' },
        h('span', null, h('span', { class: 'insp-k', 'aria-hidden': 'true' }, 'Z'), sr('Atomic number'), ` ${e.z}`),
        h(
          'span',
          { class: mode === 'mass' ? 'is-colour' : null, title: massTitle },
          h('span', { class: 'insp-k', 'aria-hidden': 'true' }, e.massIsMassNumber ? 'Mass no.' : 'Mass'),
          sr(massTitle),
          ' ',
          ...(e.predicted.includes('mass') ? predictedMark() : []),
          formatMass(e),
          ...footnoteRefs(refs('mass')),
        ),
      ),
      h(
        'p',
        { class: mode === 'category' ? 'insp-cat is-colour' : 'insp-cat' },
        swatch(color),
        cat?.label ?? e.category,
        mode === 'category' ? sr(' (tile colour)') : null,
      ),
    ),
  );
}

function elementView(v: View, z: number): Kid[] {
  const e = v.model.byZ.get(z);
  if (!e) return notFound(`There is no element with atomic number ${z}.`);
  const cell = v.model.layout.cells.get(z);
  const notes = e.notes.map((text, i) => ({ text, n: i + 1, fields: noteFields(text) as string[] }));
  const refs = (field: string): number[] => notes.filter((nt) => nt.fields.includes(field)).map((nt) => nt.n);
  const fact = (key: keyof ElementData & string, label: Kids, value: Kids | null, empty?: string): HTMLElement =>
    factRow({ key, label, value, predicted: e.predicted.includes(key), notes: refs(key), colour: v.s.colorMode === key, empty });
  const anyPredicted = e.predicted.length > 0;

  return [
    h('div', { class: 'insp-top' }, elementHeader(v, e, refs), positionStrip(v, cell)),
    h(
      'div',
      { class: 'insp-grid' },
      facts('Atom', [
        fact('config', 'Configuration', e.config ? h('span', { class: 'insp-config' }, superscriptConfig(e.config)) : null),
        fact('en', ['Electronegativity ', h('span', { class: 'insp-dt-note' }, '(Pauling)')], numberOrNull(e.en, { decimals: 2, trim: false })),
        fact('ie1', 'First ionization energy', numberOrNull(e.ie1, { decimals: 3, unit: 'eV' })),
        fact('ea', 'Electron affinity', numberOrNull(e.ea, { decimals: 3, unit: 'eV' })),
        fact('atomicRadius', 'Atomic radius', numberOrNull(e.atomicRadius, { decimals: 0, unit: 'pm' })),
        fact('covalentRadius', 'Covalent radius', numberOrNull(e.covalentRadius, { decimals: 0, unit: 'pm' })),
        fact('vdwRadius', 'Van der Waals radius', numberOrNull(e.vdwRadius, { decimals: 0, unit: 'pm' })),
      ]),
      facts('Bulk', [
        fact('mp', 'Melting point', e.mp === null ? null : formatTemperature(e.mp)),
        fact('bp', 'Boiling point', e.bp === null ? null : formatTemperature(e.bp)),
        fact('density', 'Density', numberOrNull(e.density, { digits: 4, unit: 'g/cm³' })),
        fact('phase', 'Phase at 25 °C', e.phase ? capitalize(e.phase) : null, 'unknown'),
      ]),
      facts('Chemistry & occurrence', [
        fact('oxidationStates', 'Oxidation states', e.oxidationStates.length ? formatOxidationStates(e.oxidationStates) : null, 'none listed'),
        fact('discoveryYear', 'Discovered', discovered(e)),
        fact('radioactive', 'Radioactive', e.radioactive ? 'Yes' : 'No'),
        fact('goldschmidt', 'Goldschmidt class', e.goldschmidt ? capitalize(e.goldschmidt) : null),
        fact('abundanceCrust', 'Crustal abundance', e.abundanceCrust === null ? null : withUnit(formatCompact(e.abundanceCrust), 'mg/kg')),
        fact('pettifor', 'Pettifor number', numberOrNull(e.pettifor, { digits: 4 })),
      ]),
    ),
    notes.length || anyPredicted
      ? h(
          'div',
          { class: 'insp-notes' },
          notes.length ? h('ol', null, notes.map((nt) => h('li', null, nt.text))) : null,
          anyPredicted ? h('p', null, h('span', { class: 'insp-pred', 'aria-hidden': 'true' }, '≈'), ' marks a predicted or estimated value.') : null,
        )
      : null,
    relationsSection(v, e),
    elementTrends(v, e, cell),
  ];
}

function relationsSection(v: View, e: ElementData): HTMLElement {
  const { anyOn, groups } = elementRelations(v.model.layers, v.s, e.z);
  let body: Kid;
  if (!anyOn) body = para("Turn on relations in the left panel to see this element's links.", 'insp-empty');
  else if (!groups.length) body = para(`None of the relations switched on involve ${e.name}.`, 'insp-empty');
  else body = h('ul', { class: 'insp-rel', role: 'list' }, groups.map((g) => relationGroup(v, e, g)));
  return section('Relations', body);
}

function entryTarget(en: RelationEntry): Target {
  if (en.kind === 'edge') return { kind: 'edge', layerId: en.layerId, itemId: en.itemId, edgeIndex: en.edgeIndex };
  return en.setId
    ? { kind: 'hub', layerId: en.layerId, itemId: en.itemId, setId: en.setId }
    : { kind: 'hub', layerId: en.layerId, itemId: en.itemId };
}

function relationGroup(v: View, e: ElementData, g: RelationGroup): HTMLElement {
  const first = g.entries[0];
  // Opens the first link's view, which carries the layer's description, sources and caveat.
  const about = first
    ? linkButton('About', `about:${g.layer.id}`, () => pin(v, entryTarget(first)), `About ${g.layer.title}`)
    : null;
  return h(
    'li',
    { class: 'insp-rel-layer' },
    h('p', { class: 'insp-rel-title' }, swatch(g.layer.color), h('span', null, g.layer.title), about),
    h(
      'ul',
      { class: 'insp-rel-items', role: 'list' },
      g.entries.map((en) => (en.kind === 'set' ? setEntryRow(v, e, g.layer, en) : edgeEntryRow(v, g.layer, en))),
    ),
  );
}

/** Sets this small list their other members inline; larger ones just say how many. */
const INLINE_MEMBERS = 8;

function entrySwatch(layer: RelationLayer, color: string | undefined): Kid {
  return color && color.toLowerCase() !== layer.color.toLowerCase() ? swatch(color) : null;
}

function setEntryRow(v: View, e: ElementData, layer: RelationLayer, en: SetEntry): HTMLElement {
  const key = `rel:${layer.id}:${en.itemId}:${en.setId ?? ''}`;
  const target = entryTarget(en);
  const others = en.members.filter((m) => m !== e.z);
  const inline = en.members.length <= INLINE_MEMBERS && others.length > 0;
  return h(
    'li',
    { class: 'insp-rel-item' },
    h(
      'div',
      { class: 'insp-rel-line' },
      entrySwatch(layer, en.color),
      linkButton(en.label, key, () => pin(v, target)),
      en.caption ? h('span', { class: 'insp-badge' }, en.caption) : null,
      en.context ? h('span', { class: 'insp-muted' }, en.context) : null,
      inline ? null : h('span', { class: 'insp-muted insp-num' }, `${en.members.length} members`),
    ),
    inline
      ? h(
          'ul',
          { class: 'insp-chips insp-chips-sm', role: 'list', 'aria-label': `Other members of ${en.label}` },
          others.map((m) => h('li', null, elementChip(v, m, `${key}:${m}`, { size: 'sm', caption: en.memberLabels?.[m] }))),
        )
      : null,
  );
}

function edgeEntryRow(v: View, layer: RelationLayer, en: EdgeEntry): HTMLElement {
  const key = `rel:${layer.id}:${en.itemId}:${en.edgeIndex}`;
  const glyph = en.direction === 'out' ? '→' : en.direction === 'in' ? '←' : '—';
  const word = en.direction === 'out' ? 'to ' : en.direction === 'in' ? 'from ' : 'with ';
  return h(
    'li',
    { class: 'insp-rel-item' },
    h(
      'div',
      { class: 'insp-rel-line' },
      entrySwatch(layer, en.color),
      h('span', { class: 'insp-dir', 'aria-hidden': 'true' }, glyph),
      sr(word),
      elementChip(v, en.partner, `${key}:el`, { size: 'sm' }),
      en.label ? linkButton(en.label, `${key}:edge`, () => pin(v, entryTarget(en))) : null,
      en.context ? h('span', { class: 'insp-muted' }, en.context) : null,
    ),
    en.note ? para(en.note, 'insp-rel-note') : null,
  );
}

function elementTrends(v: View, e: ElementData, cell: Cell | undefined): HTMLElement | null {
  if (!cell) return null;
  const down = v.model.columns[cell.column - 1]?.members ?? v.model.layout.membersOfColumn(cell.column);
  const across = v.model.periods[cell.period - 1]?.members ?? v.model.layout.membersOfPeriod(cell.period);
  const columnName = cell.group !== null ? `group ${cell.group}` : `f-block column ${cell.fIndex}`;
  return section(
    'Trends',
    trendSelect(v, 'element'),
    h('div', { class: 'insp-grid' }, trendChart(v, down, `Down ${columnName}`, e.z), trendChart(v, across, `Across period ${cell.period}`, e.z)),
  );
}

// ---------------------------------------------------------------- column & period views

function columnView(v: View, column: number): Kid[] {
  const info = v.model.columns[column - 1];
  if (!info) return notFound(`Column ${column} is not part of the table.`);
  const rows: HTMLElement[] = [];
  if (info.valencePattern) rows.push(factRow({ key: 'valence', label: 'Valence shell', value: h('span', { class: 'insp-config' }, info.valencePattern) }));
  if (info.casLabel) rows.push(factRow({ key: 'cas', label: 'CAS label', value: info.casLabel }));
  if (info.oldIupacLabel) rows.push(factRow({ key: 'old-iupac', label: 'Old IUPAC label', value: info.oldIupacLabel }));
  const status = info.nameStatus === 'iupac' ? 'IUPAC name' : info.nameStatus === 'common' ? 'common name' : null;
  return [
    h(
      'header',
      { class: 'insp-head-plain' },
      h('p', { class: 'insp-eyebrow' }, 'Column of the table'),
      heading(columnTitle(info)),
      info.name
        ? h('p', { class: 'insp-name' }, info.name, status ? h('span', { class: `insp-badge insp-badge-${info.nameStatus}` }, status) : null)
        : null,
    ),
    rows.length ? h('dl', { class: 'insp-facts' }, rows) : null,
    info.note ? para(info.note) : null,
    section(['Members', h('span', { class: 'insp-h3-count' }, info.members.length)], memberChips(v, info.members, 'member')),
    section('Trend', trendSelect(v, 'column'), trendChart(v, info.members, 'Down the column')),
  ];
}

function periodView(v: View, period: number): Kid[] {
  const info = v.model.periods[period - 1];
  if (!info) return notFound(`Period ${period} is not part of the table.`);
  const members = info.members;
  const first = members[0];
  const last = members[members.length - 1];
  const phases = phaseCounts(v.model.byZ, members).map((p) => ({ color: PHASE_COLORS[p.phase], label: capitalize(p.phase), count: p.count }));
  return [
    h(
      'header',
      { class: 'insp-head-plain' },
      h('p', { class: 'insp-eyebrow' }, 'Row of the table'),
      heading(`Period ${period}`),
      first !== undefined && last !== undefined
        ? h('p', { class: 'insp-meta' }, h('span', null, h('span', { class: 'insp-k' }, 'Z'), ` ${first}–${last}`), h('span', null, `${members.length} elements`))
        : null,
    ),
    info.subshells.length
      ? h('dl', { class: 'insp-facts' }, factRow({ key: 'subshells', label: 'Subshells filled', value: h('span', { class: 'insp-config' }, info.subshells.join(' → ')) }))
      : null,
    info.note ? para(info.note) : null,
    section('Composition', countChips(categoryCounts(v.model.byZ, members))),
    section('Phase at 25 °C', countChips(phases)),
    section(['Members', h('span', { class: 'insp-h3-count' }, members.length)], memberChips(v, members, 'member')),
    section('Trend', trendSelect(v, 'period'), trendChart(v, members, 'Across the period')),
  ];
}

// ---------------------------------------------------------------- hub & edge views

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

function chainNav(v: View, layer: RelationLayer, item: RelationSetChain, index: number): HTMLElement {
  const prev = item.sets[index - 1];
  const next = item.sets[index + 1];
  const go = (setId: string) => () => pin(v, { kind: 'hub', layerId: layer.id, itemId: item.id, setId });
  return h(
    'nav',
    { class: 'insp-chain', 'aria-label': `Position in ${item.label}` },
    prev
      ? h('button', { type: 'button', class: 'insp-btn', 'data-focus-key': 'chain-prev', 'aria-label': `Previous: ${prev.label}`, onclick: go(prev.id) }, h('span', { 'aria-hidden': 'true' }, '‹ '), prev.label)
      : h('span', { class: 'insp-chain-end' }),
    h('span', { class: 'insp-muted insp-num' }, `${index + 1} of ${item.sets.length}`),
    next
      ? h('button', { type: 'button', class: 'insp-btn', 'data-focus-key': 'chain-next', 'aria-label': `Next: ${next.label}`, onclick: go(next.id) }, next.label, h('span', { 'aria-hidden': 'true' }, ' ›'))
      : h('span', { class: 'insp-chain-end' }),
  );
}

function hubView(v: View, t: Extract<Target, { kind: 'hub' }>): Kid[] {
  const found = findItem(v.model, t.layerId, t.itemId);
  if (!found) return notFound('This relation is not part of the current model.');
  const { layer, item } = found;
  let title = item.label;
  let subtitle: Kid = null;
  let members: readonly number[];
  let captions: Record<number, string> | undefined;
  let setNote: string | undefined;
  if (item.kind === 'set') {
    members = item.members;
    captions = item.memberLabels;
  } else if (item.kind === 'setChain') {
    const index = item.sets.findIndex((s) => s.id === t.setId);
    const set = item.sets[index];
    if (set) {
      title = set.label;
      subtitle = h('div', { class: 'insp-subtitle' }, h('span', null, item.label), chainNav(v, layer, item, index));
      members = set.members;
      setNote = set.note;
    } else {
      members = unique(item.sets.flatMap((s) => s.members));
    }
  } else {
    members = unique(item.edges.flatMap((edge) => [edge.a, edge.b]));
  }
  return [
    h('header', { class: 'insp-head-plain' }, layerEyebrow(layer, item.color), heading(title), subtitle),
    setNote ? para(setNote) : null,
    item.note ? para(item.note) : null,
    section(['Members', h('span', { class: 'insp-h3-count' }, members.length)], memberChips(v, members, 'member', captions)),
    ...layerAbout(layer),
  ];
}

function edgeView(v: View, t: Extract<Target, { kind: 'edge' }>): Kid[] {
  const found = findItem(v.model, t.layerId, t.itemId);
  const item = found?.item;
  const edge = item?.kind === 'edges' ? item.edges[t.edgeIndex] : undefined;
  if (!found || !item || item.kind !== 'edges' || !edge) return notFound('This link is not part of the current model.');
  const { layer } = found;
  const glyph = item.directed ? '→' : '—';
  const a = v.model.byZ.get(edge.a);
  const b = v.model.byZ.get(edge.b);
  return [
    h(
      'header',
      { class: 'insp-head-plain' },
      layerEyebrow(layer, item.color),
      headingWithClass(
        'insp-edge-title',
        elementChip(v, edge.a, 'edge-a', { size: 'lg' }),
        h('span', { class: 'insp-edge-glyph', 'aria-hidden': 'true' }, glyph),
        sr(item.directed ? ' to ' : ' and '),
        elementChip(v, edge.b, 'edge-b', { size: 'lg' }),
      ),
      a && b ? h('p', { class: 'insp-meta' }, `${a.name} ${glyph} ${b.name}`) : null,
    ),
    edge.label ? para(edge.label, 'insp-edge-label') : null,
    edge.note ? para(edge.note) : null,
    layer.items.length > 1
      ? h('p', { class: 'insp-text' }, h('span', { class: 'insp-k' }, 'Part of'), h('strong', null, item.label), item.note ? ` — ${item.note}` : null)
      : item.note ? para(item.note) : null,
    ...layerAbout(layer),
  ];
}

// ---------------------------------------------------------------- intro

function introView(v: View): Kid[] {
  const step = (verb: string, rest: string): HTMLElement => h('li', null, h('strong', null, verb), ` ${rest}`);
  const convention = v.s.convention === 'Lu'
    ? 'Group 3 is shown as Sc, Y, Lu, Lr, following the IUPAC 2021 provisional recommendation, so the f-block runs La–Yb and Ac–No.'
    : 'Group 3 is shown as Sc, Y, La, Ac, the form found in many older tables, so the f-block runs Ce–Lu and Th–Lr.';
  return [
    h('header', { class: 'insp-head-plain' }, h('p', { class: 'insp-eyebrow' }, 'Periodic Cylinder'), heading('Explore the table')),
    h(
      'ul',
      { class: 'insp-howto', role: 'list' },
      step('Hover', 'an element, a column number on the top ring or a period label at the left edge to read about it here.'),
      step('Drag', 'beside the cylinder to rotate it, drag vertically to tilt, and scroll or pinch to zoom.'),
      step('Click', 'to pin a selection so it stays put; Esc or Release lets it go.'),
      step('Relations', 'switched on in the left panel are drawn inside the cylinder; hover a hub or an arc for its story.'),
    ),
    section(
      'Why a cylinder?',
      para(
        'Rolling the 32-column table into a cylinder joins its two edges: helium sits beside hydrogen, and reading on past each noble gas crosses the seam straight to the next alkali metal. Nothing is cut out — the f-block stays inline, so atomic number climbs without a break all the way round.',
      ),
      para(convention),
    ),
  ];
}
