import './panels.css';
import type { UiContext } from '../types';
import { h, replaceChildren } from './dom';

// Top-bar buttons: the filter drawer (narrow screens only), reset view, auto-rotate and a help
// popover. Also home to the small icon and key helpers the other panels share.

// ---------------------------------------------------------------- shared helpers

const SVG_NS = 'http://www.w3.org/2000/svg';

type Shape = readonly [tag: 'path' | 'circle', attrs: Readonly<Record<string, string | number>>];
export type IconShape = readonly Shape[];

/** Stroke icons on a 20 × 20 grid, drawn in currentColor. */
export const ICONS = {
  search: [['circle', { cx: 8.75, cy: 8.75, r: 5.25 }], ['path', { d: 'M12.6 12.6 16.5 16.5' }]],
  chevron: [['path', { d: 'M5.5 8 10 12.5 14.5 8' }]],
  relations: [
    ['circle', { cx: 10, cy: 4.5, r: 2 }],
    ['circle', { cx: 4.5, cy: 14.5, r: 2 }],
    ['circle', { cx: 15.5, cy: 14.5, r: 2 }],
    ['path', { d: 'M8.84 6.6 5.66 12.4M11.16 6.6l3.18 5.8M6.9 14.5h6.2' }],
  ],
  resetView: [
    ['path', { d: 'M3 7.5v-3A1.5 1.5 0 0 1 4.5 3h3M12.5 3h3A1.5 1.5 0 0 1 17 4.5v3M17 12.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M7.5 17h-3A1.5 1.5 0 0 1 3 15.5v-3' }],
    ['circle', { cx: 10, cy: 10, r: 2.5 }],
  ],
  autoRotate: [
    ['path', { d: 'M15.87 7.86A6.25 6.25 0 1 1 6.42 4.88' }],
    ['path', { d: 'M8.22 3.62 4.6 3.34l2.64 3.77Z', fill: 'currentColor' }],
  ],
  help: [
    ['circle', { cx: 10, cy: 10, r: 7.25 }],
    ['path', { d: 'M7.75 7.75a2.25 2.25 0 1 1 3.4 1.95c-.7.4-1.15.85-1.15 1.55v.5M10 14.1v.01' }],
  ],
} as const satisfies Record<string, IconShape>;

/** An inline SVG icon, hidden from assistive technology (the control carries the name). */
export function svgIcon(shapes: IconShape, size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    viewBox: '0 0 20 20', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor',
    'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    focusable: 'false', class: 'pn-icon',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [tag, shapeAttrs] of shapes) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(shapeAttrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

/** True for a field that edits text, where Escape may belong to the field itself. */
export function isTextField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/** True when keystrokes on `target` type text or pick by typing (single-key shortcuts stand aside). */
export function isTextEntry(target: EventTarget | null): boolean {
  return isTextField(target) || (typeof HTMLSelectElement !== 'undefined' && target instanceof HTMLSelectElement);
}

const KEY_NAMES: Readonly<Record<string, string>> = {
  '←': 'Left arrow', '→': 'Right arrow', '↑': 'Up arrow', '↓': 'Down arrow',
  '+': 'Plus', '−': 'Minus', '/': 'Slash', '0': 'Zero', Esc: 'Escape',
};

/** A key cap whose glyph is read out by name ('←' → 'Left arrow'). */
export function keyCap(key: string): HTMLElement {
  const name = KEY_NAMES[key];
  return name
    ? h('kbd', { class: 'pn-kbd' }, h('span', { 'aria-hidden': 'true' }, key), h('span', { class: 'pn-sr' }, name))
    : h('kbd', { class: 'pn-kbd' }, key);
}

// ---------------------------------------------------------------- help content

export interface HelpRow {
  action: string;
  pointer?: string;
  keys?: readonly string[];
  /** Short text after the keys, e.g. 'one column'. */
  keysNote?: string;
}

export const HELP_ROWS: readonly HelpRow[] = [
  { action: 'Rotate', pointer: 'Drag (or swipe) beside the cylinder', keys: ['←', '→'], keysNote: 'one column' },
  { action: 'Tilt', pointer: 'Drag up or down', keys: ['↑', '↓'] },
  { action: 'Zoom', pointer: 'Wheel or pinch', keys: ['+', '−'] },
  { action: 'Details', pointer: 'Hover an element, a column number or a period label; on touch, tap it' },
  { action: 'Pin', pointer: 'Click or tap', keys: ['Esc'], keysNote: 'releases' },
  { action: 'Table by keyboard', keys: ['Tab'], keysNote: 'reaches the table; arrows move between elements (↑ from the top reaches the column numbers); Enter pins' },
  { action: 'Reset view', keys: ['0'] },
  { action: 'Search', keys: ['/'], keysNote: 'focuses the search box' },
];

function helpRow(row: HelpRow): HTMLElement[] {
  const how: (Node | string)[] = [];
  if (row.pointer) how.push(row.pointer);
  if (row.keys?.length) {
    if (how.length) how.push(h('span', { class: 'tb-sep', 'aria-hidden': 'true' }, '·'));
    how.push(h('span', { class: 'tb-keyset' }, row.keys.map(keyCap)));
    if (row.keysNote) how.push(` ${row.keysNote}`);
  }
  return [h('dt', null, row.action), h('dd', null, how)];
}

// ---------------------------------------------------------------- toolbar

/** Same breakpoint as the drawer layout in src/style.css. */
const NARROW_QUERY = '(max-width: 960px)';

let mounts = 0;

function toolButton(label: string, icon: IconShape, extraClass = ''): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: `tb-btn${extraClass ? ` ${extraClass}` : ''}`, 'aria-label': label },
    svgIcon(icon),
    h('span', { class: 'tb-label' }, label),
  );
}

export function mountToolbar(root: HTMLElement, ctx: UiContext): void {
  const n = ++mounts;
  const app = document.getElementById('app');
  const drawer = document.getElementById('filters');
  /** What the open drawer lies over: a press there only dismisses it, as on a scrim. */
  const covered = ['stage', 'inspector'].map((id) => document.getElementById(id)).filter((el) => el !== null);
  const narrow = window.matchMedia(NARROW_QUERY);

  const relations = toolButton('Relations', ICONS.relations, 'tb-relations');
  relations.setAttribute('aria-expanded', 'false');
  if (drawer?.id) relations.setAttribute('aria-controls', drawer.id);
  const reset = toolButton('Reset view', ICONS.resetView);
  const rotate = toolButton('Auto-rotate', ICONS.autoRotate, 'tb-rotate');
  const help = toolButton('Help', ICONS.help);
  const popId = `tb-help-${n}`;
  help.setAttribute('aria-expanded', 'false');
  help.setAttribute('aria-controls', popId);
  const pop = h(
    'div',
    { id: popId, class: 'tb-pop', hidden: true },
    h('h2', { class: 'tb-pop-title' }, 'Controls'),
    h('dl', { class: 'tb-keys' }, HELP_ROWS.flatMap(helpRow)),
  );
  const helpWrap = h('div', { class: 'tb-help' }, help, pop);
  replaceChildren(root, h('div', { class: 'tb', role: 'group', 'aria-label': 'View controls' }, relations, reset, rotate, helpWrap));
  const buttons = [relations, reset, rotate, help];

  /** Tooltips only where the buttons show icons alone (the labels are hidden under 960px). */
  function syncTooltips(): void {
    for (const b of buttons) {
      if (narrow.matches) b.title = b.getAttribute('aria-label') ?? '';
      else b.removeAttribute('title');
    }
  }

  // -- filter drawer (the class lives on #app; style.css slides #filters in under 960px)
  const drawerOpen = (): boolean => !!app?.classList.contains('filters-open');
  function setDrawer(open: boolean): void {
    const isNarrow = narrow.matches;
    const next = open && isNarrow;
    app?.classList.toggle('filters-open', next);
    relations.setAttribute('aria-expanded', String(next));
    if (drawer) {
      // Off-screen drawer content must leave the tab order (and must not keep focus).
      if (isNarrow && !next && document.activeElement instanceof Node && drawer.contains(document.activeElement)) relations.focus();
      drawer.inert = isNarrow && !next;
    }
    if (next) setHelp(false);
  }

  // -- help popover
  let helpOpen = false;
  function setHelp(open: boolean): void {
    if (open === helpOpen) return;
    helpOpen = open;
    pop.hidden = !open;
    help.setAttribute('aria-expanded', String(open));
    if (open) setDrawer(false);
  }

  relations.addEventListener('click', () => setDrawer(!drawerOpen()));
  reset.addEventListener('click', () => ctx.resetView());
  rotate.addEventListener('click', () => ctx.store.set((s) => ({ autoRotate: !s.autoRotate })));
  help.addEventListener('click', () => setHelp(!helpOpen));
  helpWrap.addEventListener('focusout', (ev) => {
    const next = ev.relatedTarget;
    if (next instanceof Node && !helpWrap.contains(next)) setHelp(false);
  });
  // Tabbing out of the drawer closes it, so focus never lands on content hidden beneath it.
  // (A null relatedTarget means a click on nothing focusable or a removed element: stay open.)
  drawer?.addEventListener('focusout', (ev) => {
    const next = ev.relatedTarget;
    if (drawerOpen() && next instanceof Node && !drawer.contains(next) && !relations.contains(next)) setDrawer(false);
  });
  narrow.addEventListener('change', () => {
    setDrawer(drawerOpen());
    syncTooltips();
  });

  // Capture phase, so these run before the scene's own document handlers (and before panels
  // that stop propagation, such as the legend).
  /** Pointer whose press only dismissed the drawer: the rest of its gesture is swallowed too. */
  let eaten: number | null = null;
  let eatClick = false;
  document.addEventListener('pointerdown', (ev) => {
    eaten = null;
    eatClick = false;
    const t = ev.target;
    if (!(t instanceof Node)) return;
    if (helpOpen && !helpWrap.contains(t)) setHelp(false);
    if (drawerOpen() && !drawer?.contains(t) && !relations.contains(t)) {
      setDrawer(false);
      if (covered.some((el) => el.contains(t))) {
        // Keep the dismissing press from also hovering, pinning, unpinning or turning the cylinder.
        ev.stopPropagation();
        eaten = ev.pointerId;
        eatClick = true;
      }
    }
  }, true);
  const eatGesture = (ev: PointerEvent): void => {
    if (ev.pointerId !== eaten) return;
    // Nothing pressed: the release went missing (outside the window, say), so the gesture is over.
    if (ev.type === 'pointermove' && ev.buttons === 0) {
      eaten = null;
      return;
    }
    ev.stopPropagation();
    if (ev.type !== 'pointermove') eaten = null;
  };
  for (const type of ['pointermove', 'pointerup', 'pointercancel'] as const) document.addEventListener(type, eatGesture, true);
  document.addEventListener('click', (ev) => {
    // detail 0 is a keyboard click, which no pointer press preceded.
    if (!eatClick || ev.detail === 0) return;
    eatClick = false;
    ev.stopPropagation();
    ev.preventDefault();
  }, true);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || isTextField(ev.target)) return;
    if (helpOpen) setHelp(false);
    else if (drawerOpen()) setDrawer(false);
    else return;
    // Handled: keep the scene from also releasing the pinned selection.
    ev.preventDefault();
  }, true);

  const syncRotate = (on: boolean) => rotate.setAttribute('aria-pressed', String(on));
  syncRotate(ctx.store.get().autoRotate);
  ctx.store.subscribe((s, prev) => {
    if (s.autoRotate !== prev.autoRotate) syncRotate(s.autoRotate);
  });
  setDrawer(drawerOpen());
  syncTooltips();
}
