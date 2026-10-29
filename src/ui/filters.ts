import './panels.css';
import { isLayerOn, withItem, withLayer } from '../state';
import type { AppState, ColorMode, Group3Convention, Model, RelationLayer, RelationSection, Source, UiContext } from '../types';
import { h, replaceChildren } from './dom';
import { NUMERIC_PROPS } from './palette';
import { ICONS, svgIcon } from './toolbar';

// The left panel: relation layers grouped by section, each with a disclosure for its
// description, caveat, per-item switches and sources; then the display settings.

// ---------------------------------------------------------------- pure helpers

export interface LayerSection {
  section: RelationSection;
  layers: RelationLayer[];
}

/** Layers grouped by section, sections in the order they first appear. */
export function groupLayers(layers: readonly RelationLayer[]): LayerSection[] {
  const bySection = new Map<RelationSection, RelationLayer[]>();
  for (const layer of layers) {
    const list = bySection.get(layer.section);
    if (list) list.push(layer);
    else bySection.set(layer.section, [layer]);
  }
  return [...bySection].map(([section, list]) => ({ section, layers: list }));
}

export function countLayersOn(s: AppState, layers: readonly RelationLayer[]): number {
  return layers.reduce((n, l) => n + (isLayerOn(s, l.id) ? 1 : 0), 0);
}

/** Every layer switched off; the same object when none is on, so the store stays quiet. */
export function allLayersOff(layers: AppState['layers']): AppState['layers'] {
  if (!Object.values(layers).some((t) => t.on)) return layers;
  return Object.fromEntries(Object.entries(layers).map(([id, t]) => [id, t.on ? { ...t, on: false } : t]));
}

/** Show or hide one item; showing an item of a switched-off layer switches the layer on. */
export function withItemShown(s: AppState, layerId: string, itemId: string, visible: boolean): AppState['layers'] {
  const layers = withItem(s, layerId, itemId, visible);
  const t = layers[layerId]!;
  return visible && !t.on ? { ...layers, [layerId]: { ...t, on: true } } : layers;
}

/** Show every item (switching the layer on) or hide them all. */
export function withAllItems(s: AppState, layer: RelationLayer, visible: boolean): AppState['layers'] {
  const cur = s.layers[layer.id] ?? { on: false, hiddenItems: [] };
  return { ...s.layers, [layer.id]: { on: cur.on || visible, hiddenItems: visible ? [] : layer.items.map((i) => i.id) } };
}

export interface ColorModeOption {
  id: ColorMode;
  label: string;
}

export const CLASS_COLOR_MODES: readonly ColorModeOption[] = [
  { id: 'category', label: 'Category' },
  { id: 'block', label: 'Block' },
  { id: 'phase', label: 'Phase at 25 °C' },
];

export const COLOR_MODE_OPTIONS: readonly ColorModeOption[] = [
  ...CLASS_COLOR_MODES,
  ...NUMERIC_PROPS.map((p) => ({ id: p.id, label: p.label })),
];

const CONVENTIONS: readonly { id: Group3Convention; label: string; note?: string }[] = [
  { id: 'Lu', label: 'Sc · Y · Lu · Lr', note: '(IUPAC 2021 provisional)' },
  { id: 'La', label: 'Sc · Y · La · Ac' },
];

export const WALL_OPACITY = { min: 0.15, max: 1, step: 0.05 } as const;

/** Only plain web links become anchors. */
export function safeUrl(url: string | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** DOM-id keys for layers, unique within one build and stable across rebuilds. */
function keyMaker(prefix: string): (layerId: string) => string {
  const used = new Map<string, number>();
  return (layerId) => {
    const base = `${prefix}-L-${layerId.replace(/[^A-Za-z0-9_-]+/g, '_')}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

// ---------------------------------------------------------------- pieces

function sourceList(sources: readonly Source[]): HTMLElement {
  return h(
    'div',
    { class: 'fp-sources' },
    h('p', { class: 'fp-k' }, sources.length === 1 ? 'Source' : 'Sources'),
    h('ul', null, sources.map((s) => {
      const url = safeUrl(s.url);
      return h('li', null, url
        ? h('a', { href: url, target: '_blank', rel: 'noopener' }, s.label, h('span', { class: 'pn-sr' }, ' (opens in a new tab)'))
        : s.label);
    })),
  );
}

function swatch(className: string, color: string): HTMLElement {
  const el = h('span', { class: className, 'aria-hidden': 'true' });
  el.style.setProperty('--sw', color);
  return el;
}

interface ItemSwitch {
  id: string;
  input: HTMLInputElement;
}

interface LayerRow {
  layer: RelationLayer;
  li: HTMLLIElement;
  check: HTMLInputElement;
  items: ItemSwitch[];
  more: HTMLDetailsElement | null;
}

interface DisplayControls {
  el: HTMLElement;
  sync(s: AppState, prev: AppState | null): void;
}

function displaySection(prefix: string, ctx: UiContext): DisplayControls {
  const option = (o: ColorModeOption) => h('option', { value: o.id }, o.label);
  const colorId = `${prefix}-color`;
  const color = h(
    'select',
    { id: colorId, class: 'fp-select' },
    h('optgroup', { label: 'Classification' }, CLASS_COLOR_MODES.map(option)),
    h('optgroup', { label: 'Property' }, COLOR_MODE_OPTIONS.slice(CLASS_COLOR_MODES.length).map(option)),
  );
  color.addEventListener('change', () => {
    const mode = COLOR_MODE_OPTIONS.find((o) => o.id === color.value)?.id;
    if (mode) ctx.store.set({ colorMode: mode });
  });

  const wallId = `${prefix}-wall`;
  const wall = h('input', { type: 'range', id: wallId, class: 'fp-range', ...WALL_OPACITY });
  // The slider speaks its own value (aria-valuetext); an <output> is a live region and would repeat it.
  const wallOut = h('span', { class: 'fp-out', 'aria-hidden': 'true' });
  wall.addEventListener('input', () => ctx.store.set({ wallOpacity: Number(wall.value) }));

  const radios = CONVENTIONS.map((c) => {
    const input = h('input', { type: 'radio', name: `${prefix}-g3`, value: c.id, class: 'fp-radio' });
    input.addEventListener('change', () => {
      if (input.checked) ctx.store.set({ convention: c.id });
    });
    return { c, input };
  });

  const rotate = h('input', { type: 'checkbox', class: 'fp-check' });
  rotate.addEventListener('change', () => ctx.store.set({ autoRotate: rotate.checked }));

  const headingId = `${prefix}-display`;
  const el = h(
    'div',
    { class: 'fp-sec fp-display', role: 'group', 'aria-labelledby': headingId },
    h('h3', { class: 'fp-sec-title', id: headingId }, 'Display'),
    h('div', { class: 'fp-field' }, h('label', { class: 'fp-field-label', for: colorId }, 'Colour by'), color),
    h(
      'div',
      { class: 'fp-field' },
      h('div', { class: 'fp-field-row' }, h('label', { class: 'fp-field-label', for: wallId }, 'Wall opacity'), wallOut),
      wall,
    ),
    h(
      'fieldset',
      { class: 'fp-field fp-radios' },
      h('legend', { class: 'fp-field-label' }, 'Group 3'),
      radios.map(({ c, input }) =>
        h('label', { class: 'fp-radio-row' }, input, h('span', null, c.label, c.note ? h('span', { class: 'fp-note' }, ` ${c.note}`) : null))),
    ),
    h('label', { class: 'fp-toggle' }, rotate, h('span', null, 'Auto-rotate')),
  );

  return {
    el,
    sync(s, prev) {
      if (!prev || s.colorMode !== prev.colorMode) color.value = s.colorMode;
      if (!prev || s.wallOpacity !== prev.wallOpacity) {
        // A value from elsewhere (initial 0.62) may sit between steps; the thumb snaps, the text does not.
        if (Number(wall.value) !== s.wallOpacity) wall.value = String(s.wallOpacity);
        const pct = `${Math.round(s.wallOpacity * 100)}%`;
        wallOut.textContent = pct;
        wall.setAttribute('aria-valuetext', pct);
      }
      if (!prev || s.convention !== prev.convention) for (const { c, input } of radios) input.checked = s.convention === c.id;
      if (!prev || s.autoRotate !== prev.autoRotate) rotate.checked = s.autoRotate;
    },
  };
}

// ---------------------------------------------------------------- panel

let mounts = 0;

export function mountFilters(root: HTMLElement, ctx: UiContext): void {
  const prefix = `fp${++mounts}`;
  /** Layer ids whose disclosure is open; survives rebuilds. */
  const openLayers = new Set<string>();
  let rows: LayerRow[] = [];
  let model: Model | null = null;

  const count = h('span', { class: 'fp-count' });
  const clear = h('button', { type: 'button', class: 'fp-clear' }, 'Clear all');
  clear.addEventListener('click', () => ctx.store.set((s) => ({ layers: allLayersOff(s.layers) })));
  const layersBox = h('div', { class: 'fp-layers' });
  const display = displaySection(prefix, ctx);
  replaceChildren(
    root,
    h('div', { class: 'fp' }, h('div', { class: 'fp-head' }, h('h2', { class: 'fp-title' }, 'Relations'), count, clear), layersBox, display.el),
  );

  function itemSwitches(layer: RelationLayer, key: string): { el: HTMLElement; inputs: ItemSwitch[] } {
    const inputs = layer.items.map((item, i) => {
      const input = h('input', { type: 'checkbox', id: `${key}-i${i}`, class: 'fp-check' });
      input.addEventListener('change', () => ctx.store.set((s) => ({ layers: withItemShown(s, layer.id, item.id, input.checked) })));
      const row = h('li', null, h('label', { class: 'fp-item' }, input, item.color ? swatch('fp-item-sw', item.color) : null, h('span', null, item.label)));
      return { id: item.id, input, row };
    });
    const bulk = (text: string, label: string, visible: boolean) => {
      const b = h('button', { type: 'button', id: `${key}-${visible ? 'all' : 'none'}`, class: 'fp-mini', 'aria-label': label }, text);
      b.addEventListener('click', () => ctx.store.set((s) => ({ layers: withAllItems(s, layer, visible) })));
      return b;
    };
    const compact = layer.items.every((it) => it.label.length <= 14);
    const el = h(
      'fieldset',
      { class: 'fp-items' },
      // Items keep their own switches while the layer is off; say so, or the ticks read as drawn.
      h('legend', { class: 'fp-k' }, 'Items', h('span', { class: 'fp-items-off' }, ' (layer off)')),
      layer.items.length > 3 ? h('span', { class: 'fp-items-tools' }, bulk('All', 'Show all', true), bulk('None', 'Show none', false)) : null,
      h('ul', { class: `fp-items-list${compact ? ' is-compact' : ''}` }, inputs.map((x) => x.row)),
    );
    return { el, inputs };
  }

  function disclosure(layer: RelationLayer, key: string, items: HTMLElement | null): HTMLDetailsElement | null {
    const parts = [
      layer.description ? h('p', { class: 'fp-desc' }, layer.description) : null,
      layer.caveat ? h('p', { class: 'fp-caveat' }, h('strong', null, 'Caveat: '), layer.caveat) : null,
      items,
      layer.sources.length ? sourceList(layer.sources) : null,
    ].filter((p): p is HTMLElement => p !== null);
    if (!parts.length) return null;
    const label = `About ${layer.title}`;
    const details = h(
      'details',
      { class: 'fp-more' },
      h('summary', { id: `${key}-more`, class: 'fp-more-btn', 'aria-label': label, title: label }, svgIcon(ICONS.chevron, 16)),
      h('div', { class: 'fp-more-body' }, parts),
    );
    details.open = openLayers.has(layer.id);
    return details;
  }

  function layerRow(layer: RelationLayer, key: string): LayerRow {
    const empty = layer.items.length === 0;
    const check = h('input', {
      type: 'checkbox',
      id: `${key}-on`,
      class: 'fp-check',
      'aria-labelledby': `${key}-name`,
      'aria-describedby': `${key}-sum`,
      disabled: empty,
    });
    check.addEventListener('change', () => ctx.store.set((s) => ({ layers: withLayer(s, layer.id, check.checked) })));
    const label = h(
      'label',
      { class: 'fp-label', for: check.id },
      swatch('fp-swatch', layer.color),
      h('span', { class: 'fp-name', id: `${key}-name` }, layer.title),
      h('span', { class: 'fp-sum', id: `${key}-sum` }, layer.summary),
    );
    const items = layer.items.length > 1 ? itemSwitches(layer, key) : null;
    const more = disclosure(layer, key, items?.el ?? null);
    const li = h('li', { class: `fp-layer${empty ? ' is-empty' : ''}` }, h('div', { class: 'fp-row' }, check, label), more);
    return { layer, li, check, items: items?.inputs ?? [], more };
  }

  function sectionEl(group: LayerSection, keyOf: (layerId: string) => string, index: number): HTMLElement {
    const headingId = `${prefix}-sec${index}`;
    const list = h('ul', { class: 'fp-list', 'aria-labelledby': headingId }, group.layers.map((layer) => {
      const row = layerRow(layer, keyOf(layer.id));
      rows.push(row);
      return row.li;
    }));
    return h('div', { class: 'fp-sec' }, h('h3', { class: 'fp-sec-title', id: headingId }, group.section), list);
  }

  function syncRows(s: AppState): void {
    for (const row of rows) {
      const t = s.layers[row.layer.id];
      row.check.checked = !!t?.on;
      row.li.classList.toggle('is-on', !!t?.on);
      for (const item of row.items) item.input.checked = !t?.hiddenItems.includes(item.id);
    }
    const on = countLayersOn(s, rows.map((r) => r.layer));
    count.textContent = `${on} of ${rows.length} on`;
    clear.setAttribute('aria-disabled', String(on === 0));
  }

  /** Rebuild the layer list when the model changes, keeping scroll, open disclosures and focus. */
  function rebuild(): void {
    const next = ctx.model();
    if (next === model) return;
    model = next;
    const scrollTop = root.scrollTop;
    const focused = document.activeElement;
    const focusId = focused instanceof HTMLElement && layersBox.contains(focused) ? focused.id : '';
    // Read open disclosures off the DOM: 'toggle' events arrive a task late, after a rebuild.
    for (const { layer, more } of rows) {
      if (!more) continue;
      if (more.open) openLayers.add(layer.id);
      else openLayers.delete(layer.id);
    }
    rows = [];
    const keyOf = keyMaker(prefix);
    const groups = groupLayers(model.layers);
    replaceChildren(
      layersBox,
      groups.length ? groups.map((g, i) => sectionEl(g, keyOf, i)) : h('p', { class: 'fp-empty' }, 'No relations are available.'),
    );
    syncRows(ctx.store.get());
    root.scrollTop = scrollTop;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  rebuild();
  display.sync(ctx.store.get(), null);
  ctx.store.subscribe((s, prev) => {
    rebuild();
    // The model may be swapped by a listener that runs after this one.
    if (s.convention !== prev.convention) queueMicrotask(rebuild);
    if (s.layers !== prev.layers) syncRows(s);
    display.sync(s, prev);
  });
}
