import * as THREE from 'three';
import { azimuthToFace } from '../layout/cylinder';
import { buildModel } from '../model';
import { activeTarget, sameTarget, type Store } from '../state';
import type { AppState, Layout, Model, Target } from '../types';
import { h } from '../ui/dom';
import { isTextEntry } from '../ui/toolbar';
import { matchesLegend, tileColors } from './colors';
import { Controls } from './controls';
import { Framework } from './framework';
import { RowLabels } from './rowLabels';
import { DEFAULT_VIEW, Stage } from './stage';
import { Tiles } from './tiles';
import { Wall } from './wall';
import './scene.css';

/** How long a pointer hover outlives the pointer leaving its target (lets it travel to the inspector). */
const HOVER_GRACE_MS = 320;
/** Two presses on the same target this close together are one intent (a double-click), not pin + unpin. */
const DOUBLE_PRESS_MS = 450;

/** Members highlighted for a hub target (a set, or one set of a setChain). */
function hubMembers(model: Model, t: Extract<Target, { kind: 'hub' }>): number[] {
  const item = model.layers.find((l) => l.id === t.layerId)?.items.find((i) => i.id === t.itemId);
  if (!item) return [];
  if (item.kind === 'set') return item.members;
  if (item.kind === 'setChain') return item.sets.find((s) => s.id === t.setId)?.members ?? [];
  return [];
}

function hubLabel(model: Model, t: Extract<Target, { kind: 'hub' }>): string {
  const layer = model.layers.find((l) => l.id === t.layerId);
  const item = layer?.items.find((i) => i.id === t.itemId);
  if (!layer || !item) return '';
  const label = item.kind === 'setChain' ? item.sets.find((s) => s.id === t.setId)?.label ?? item.label : item.label;
  return `${label} · ${layer.title}`;
}

function edgeEnds(model: Model, t: Extract<Target, { kind: 'edge' }>): number[] {
  const item = model.layers.find((l) => l.id === t.layerId)?.items.find((i) => i.id === t.itemId);
  if (item?.kind !== 'edges') return [];
  const e = item.edges[t.edgeIndex];
  return e ? [e.a, e.b] : [];
}

/** The same column (group, or f-block index) in another layout. */
function remapColumn(column: number, from: Layout, to: Layout): number {
  const kind = from.columnKind(column);
  if (kind.kind === 'group') return to.columnOfGroup(kind.group);
  for (let c = 1; c <= 32; c++) {
    const k = to.columnKind(c);
    if (k.kind === 'f' && k.fIndex === kind.fIndex) return c;
  }
  return column;
}

function targetOf(el: HTMLElement): Target | null {
  if (el.dataset.z) return { kind: 'element', z: Number(el.dataset.z) };
  if (el.dataset.col) return { kind: 'column', column: Number(el.dataset.col) };
  if (el.dataset.period) return { kind: 'period', period: Number(el.dataset.period) };
  return null;
}

const TARGET_SELECTOR = '[data-z], [data-col], [data-period]';

/** Owns the 3D stage and keeps it in sync with the store. */
export class SceneApp {
  readonly stage: Stage;
  readonly controls: Controls;
  private tiles: Tiles;
  private wall: Wall;
  private rows: RowLabels;
  private framework: Framework;
  private model: Model;
  private raycaster = new THREE.Raycaster();
  private hubTag: HTMLElement;
  private lastViewKey = '';
  /** What the user last drove the scene with; a resting mouse must not override keyboard focus. */
  private input: 'pointer' | 'keyboard' = 'pointer';
  /** Whether the current hover came from keyboard focus (cleared when focus leaves the stage). */
  private hoverFromFocus = false;
  private graceTimer = 0;
  private lastPress: { target: Target | null; time: number } = { target: null, time: 0 };

  constructor(host: HTMLElement, private store: Store<AppState>) {
    const state = store.get();
    this.model = buildModel(state.convention);
    this.stage = new Stage(host);
    this.wall = new Wall(this.stage, this.model.layout);
    this.framework = new Framework(this.stage);
    this.tiles = new Tiles(this.stage, this.model.elements, this.model.layout, this.model.columns);
    this.rows = new RowLabels(this.stage);
    // Keep the fitted cylinder clear of the period labels on its left.
    const reserveLabels = () => this.stage.setInsets({ left: this.rows.reserve });
    this.stage.onResize(reserveLabels);
    reserveLabels();
    this.hubTag = h('div', { class: 'hub-tag', 'aria-hidden': 'true' });
    host.appendChild(this.hubTag);
    this.controls = new Controls(this.stage, {
      onClick: (x, y, ev) => this.onClick(x, y, ev),
      onPointer: (x, y) => {
        this.input = 'pointer';
        this.hoverAt(x, y);
      },
      onPointerLeave: () => this.onPointerLeave(),
      onDragStart: () => this.setHover(null, true),
      onDragEnd: () => {},
      onUserMotion: () => this.stopAutoRotate(),
    });
    this.controls.autoRotate = state.autoRotate;
    this.raycaster.camera = this.stage.camera;

    this.applyColors(state);
    this.framework.rebuild(this.model, state);
    this.applyHighlight(state);
    this.applyPinned(state);
    store.subscribe((s, prev) => this.onState(s, prev));

    this.stage.onFrame(() => {
      const v = this.stage.view;
      const key = `${v.azimuth}|${v.pitch}|${v.zoom}|${this.stage.width}x${this.stage.height}`;
      if (key !== this.lastViewKey) {
        this.lastViewKey = key;
        // Re-pick under a resting mouse while the cylinder turns beneath it (not after keyboard use).
        const p = this.controls.pointer;
        if (p && this.input === 'pointer' && !this.controls.isDragging) this.hoverAt(p.x, p.y);
        this.placeHubTag();
      }
      return false;
    });

    host.addEventListener('focusin', (ev) => this.onFocusIn(ev));
    host.addEventListener('focusout', (ev) => this.onFocusOut(ev));
    host.addEventListener('click', (ev) => this.onNativeClick(ev));
    document.addEventListener('keydown', (ev) => this.onKey(ev));
    this.stage.start();
  }

  getModel(): Model {
    return this.model;
  }

  /** Number of relation layers currently drawn (for tests). */
  drawnLayerCount(): number {
    return this.framework.visibleLayerCount;
  }

  /** Move keyboard focus into the table (skip-link target): the pinned element, else the roving tile. */
  focusTable(): void {
    const pinned = this.store.get().pinned;
    const roving = [...this.tiles.tiles.values()].find((t) => t.el.tabIndex === 0)?.z ?? 1;
    this.tiles.focusTile(pinned?.kind === 'element' ? pinned.z : roving);
  }

  // ------------------------------------------------------------- state → visuals

  private onState(s: AppState, prev: AppState): void {
    if (s.convention !== prev.convention) {
      const before = this.model.layout;
      this.model = buildModel(s.convention);
      this.tiles.setColumns(this.model.columns);
      this.wall.setLayout(this.model.layout);
      this.framework.rebuild(this.model, { ...s, layers: {} });
      this.tiles.setLayout(this.model.layout, () => {
        this.framework.rebuild(this.model, this.store.get());
        this.applyHighlight(this.store.get());
      });
      // A pinned column means a group (or f-column), not a slot on the cylinder: follow it.
      const remap = (t: Target | null) =>
        t?.kind === 'column' ? { kind: 'column' as const, column: remapColumn(t.column, before, this.model.layout) } : t;
      const pinned = remap(s.pinned), hover = remap(s.hover);
      if (!sameTarget(pinned, s.pinned) || !sameTarget(hover, s.hover)) {
        this.store.set({ pinned, hover });
        return;
      }
      if (pinned?.kind === 'element') this.faceElement(pinned.z);
      else if (pinned?.kind === 'column') this.faceColumn(pinned.column);
    }
    if (s.colorMode !== prev.colorMode || s.wallOpacity !== prev.wallOpacity || s.convention !== prev.convention) this.applyColors(s);
    // Mid-tween the layout is in flight; the tween's completion rebuilds with the latest state.
    if (s.layers !== prev.layers && !this.tiles.isTweening) this.framework.rebuild(this.model, s);
    if (s.autoRotate !== prev.autoRotate) this.controls.autoRotate = s.autoRotate;
    if (
      !sameTarget(activeTarget(s), activeTarget(prev)) || s.legendFocus !== prev.legendFocus || s.layers !== prev.layers
      || s.convention !== prev.convention || s.wallOpacity !== prev.wallOpacity || s.colorMode !== prev.colorMode
    ) this.applyHighlight(s);
    if (!sameTarget(s.pinned, prev.pinned) || s.convention !== prev.convention) this.applyPinned(s);
    this.updatePaused();
  }

  /** Auto-rotation waits while someone is actually looking at a hovered thing. */
  private updatePaused(): void {
    const focusInside = this.stage.host.contains(document.activeElement);
    this.controls.paused = !!this.store.get().hover && (this.controls.pointer !== null || focusInside);
  }

  private applyColors(s: AppState): void {
    const colors = tileColors(this.model, s.colorMode);
    this.tiles.applyColors(colors, s.wallOpacity);
    this.wall.applyColors(colors, s.wallOpacity);
    this.stage.invalidateCss();
  }

  private applyPinned(s: AppState): void {
    const p = s.pinned;
    this.tiles.applyPinned(p?.kind === 'element' ? p.z : null, p?.kind === 'column' ? p.column : null);
    this.rows.applyPinned(p?.kind === 'period' ? p.period : null);
  }

  private applyHighlight(s: AppState): void {
    const target = activeTarget(s);
    const related = this.framework.highlight(target);
    let active: number | null = null;
    let hl = new Set<number>();
    let dim = false;
    let headActive: number | null = null, headHl: number | null = null;
    let rowActive: number | null = null, rowHl: number | null = null;
    const L = this.model.layout;
    if (target) {
      switch (target.kind) {
        case 'element': {
          active = target.z;
          const c = L.cells.get(target.z);
          headHl = c?.column ?? null;
          rowHl = c?.period ?? null;
          dim = related.size > 0;
          break;
        }
        case 'column':
          hl = new Set(L.membersOfColumn(target.column));
          headActive = target.column;
          dim = true;
          break;
        case 'period':
          hl = new Set(L.membersOfPeriod(target.period));
          rowActive = target.period;
          dim = true;
          break;
        case 'hub':
          hl = new Set(hubMembers(this.model, target));
          dim = true;
          break;
        case 'edge':
          hl = new Set(edgeEnds(this.model, target));
          dim = true;
          break;
      }
    }
    const focus = s.legendFocus;
    if (focus) {
      const els = this.model.elements;
      hl = new Set(els.filter((e) => matchesLegend(e, L.cells.get(e.z)!, focus, els)).map((e) => e.z));
      dim = true;
    }
    this.tiles.applyStates(active, hl, focus ? new Set() : related, dim);
    this.tiles.applyHeadStates(headActive, headHl);
    this.rows.applyStates(rowActive, rowHl);
    const keep = new Set<number>([...hl, ...related]);
    if (active !== null) keep.add(active);
    this.wall.applyDim(dim ? new Set(this.model.elements.map((e) => e.z).filter((z) => !keep.has(z))) : null, s.wallOpacity);
    this.hubTag.textContent = target?.kind === 'hub' ? hubLabel(this.model, target) : '';
    this.placeHubTag();
    this.stage.invalidateCss();
  }

  /** A single label beside the active hub, drawn above the wall so it stays legible. */
  private placeHubTag(): void {
    const t = activeTarget(this.store.get());
    const at = t ? this.framework.hubPosition(t) : null;
    if (!at || !this.hubTag.textContent) {
      this.hubTag.classList.remove('is-on');
      return;
    }
    const p = this.stage.project(at[0], at[1], at[2]);
    this.hubTag.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    this.hubTag.classList.toggle('is-on', !p.behind);
  }

  // ------------------------------------------------------------- picking

  /**
   * Period labels and overlays first; then a framework hub right under the pointer (hubs sit
   * inside the cylinder, behind tiles, so they get a few pixels of priority); then tiles and the
   * header ring; then framework edges.
   */
  pick(clientX: number, clientY: number): Target | null {
    const el = document.elementFromPoint(clientX, clientY);
    const hit = el instanceof Element ? el.closest<HTMLElement>(TARGET_SELECTOR) : null;
    const inStage = !!hit && this.stage.host.contains(hit);
    if (inStage && hit!.dataset.period) return targetOf(hit!);
    if (el && !el.closest('.css-layer, .gl-layer')) return null; // over an overlay (legend, hint)
    const framework = !!this.stage.gl && this.framework.visibleLayerCount > 0;
    const r = this.stage.host.getBoundingClientRect();
    if (framework) {
      const hub = this.framework.pickHub(clientX - r.left, clientY - r.top);
      if (hub) return hub;
    }
    if (inStage) return targetOf(hit!);
    if (!framework) return null;
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    return this.framework.pick(this.raycaster);
  }

  private hoverAt(x: number, y: number): void {
    this.setHover(this.pick(x, y));
  }

  /**
   * Pointer hovers linger briefly after the pointer leaves a target, so it can travel to the
   * inspector; `now` clears at once (drags, keyboard).
   */
  private setHover(t: Target | null, now = false): void {
    window.clearTimeout(this.graceTimer);
    const cur = this.store.get().hover;
    if (t === null && cur !== null && !now) {
      this.graceTimer = window.setTimeout(() => this.setHover(null, true), HOVER_GRACE_MS);
      return;
    }
    if (t !== null || now) this.hoverFromFocus = false;
    if (!sameTarget(cur, t)) this.store.set({ hover: t });
    else this.updatePaused();
  }

  /** Leaving the stage keeps the last hover (the inspector keeps showing it) but stops re-picking. */
  private onPointerLeave(): void {
    window.clearTimeout(this.graceTimer);
    this.updatePaused();
  }

  private onClick(x: number, y: number, ev: PointerEvent): void {
    const t = this.pick(x, y);
    const now = performance.now();
    const repeat = sameTarget(t, this.lastPress.target) && now - this.lastPress.time < DOUBLE_PRESS_MS;
    this.lastPress = { target: t, time: now };
    if (repeat) return;
    const pinned = this.store.get().pinned;
    const pin = t && !sameTarget(pinned, t) ? t : null;
    if (pin) this.stopAutoRotate();
    // A touch has no hover: the pin carries the selection, and releasing it clears everything.
    const hover = ev.pointerType === 'touch' ? null : t;
    window.clearTimeout(this.graceTimer);
    this.store.set({ pinned: pin, hover });
  }

  /** Keyboard activation of a focused tile/header/label (pointer presses go through onClick). */
  private onNativeClick(ev: MouseEvent): void {
    if (ev.detail !== 0) return;
    const el = (ev.target as Element | null)?.closest<HTMLElement>(TARGET_SELECTOR);
    const t = el ? targetOf(el) : null;
    if (!t) return;
    const pinned = this.store.get().pinned;
    const pin = sameTarget(pinned, t) ? null : t;
    if (pin) this.stopAutoRotate();
    this.store.set({ pinned: pin });
  }

  private onFocusIn(ev: FocusEvent): void {
    const el = (ev.target as Element | null)?.closest<HTMLElement>(TARGET_SELECTOR);
    if (!el) return;
    if (el.dataset.z) this.tiles.setRovingTile(Number(el.dataset.z));
    if (el.dataset.col) this.tiles.setRovingHead(Number(el.dataset.col));
    if (el.dataset.period) this.rows.setRoving(Number(el.dataset.period));
    if (!el.matches(':focus-visible')) return;
    this.input = 'keyboard';
    const t = targetOf(el);
    if (t?.kind === 'element') this.faceElement(t.z);
    if (t?.kind === 'column') this.faceColumn(t.column);
    window.clearTimeout(this.graceTimer);
    if (!sameTarget(this.store.get().hover, t)) this.store.set({ hover: t });
    this.hoverFromFocus = true;
    this.updatePaused();
  }

  private onFocusOut(ev: FocusEvent): void {
    const next = ev.relatedTarget as Node | null;
    if (next && this.stage.host.contains(next)) return;
    if (this.hoverFromFocus) {
      this.hoverFromFocus = false;
      this.store.set({ hover: null });
    }
    this.updatePaused();
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'Escape') {
      if (isTextEntry(ev.target)) return;
      this.store.set({ pinned: null, hover: null, legendFocus: null });
      return;
    }
    // Camera keys belong to the stage: from a panel they would hijack scrolling and form controls.
    const active = document.activeElement;
    const inStage = !!active && this.stage.host.contains(active);
    if (!inStage && active && active !== document.body && active !== document.documentElement) return;
    this.input = 'keyboard';
    const focused = inStage ? (active as HTMLElement).closest<HTMLElement>(TARGET_SELECTOR) : null;
    const t = focused ? targetOf(focused) : null;
    switch (ev.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = ev.key === 'ArrowLeft' ? -1 : 1;
        if (t?.kind === 'element') this.focusNeighbour(t.z, dir, 0);
        else if (t?.kind === 'column') this.tiles.focusHead(((t.column - 1 + dir + 32) % 32) + 1);
        else if (t?.kind === 'period') this.focusRowMember(t.period);
        else this.controls.rotateColumns(dir);
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        const dir = ev.key === 'ArrowUp' ? -1 : 1;
        if (t?.kind === 'element') this.focusNeighbour(t.z, 0, dir);
        else if (t?.kind === 'column') { if (dir > 0) this.focusColumnTop(t.column); }
        else if (t?.kind === 'period') this.rows.focus(Math.min(7, Math.max(1, t.period + dir)));
        // Down tips the top toward the viewer, like dragging down.
        else this.controls.tilt(dir * 0.12);
        break;
      }
      case '+':
      case '=':
        this.controls.zoomBy(1.15);
        break;
      case '-':
      case '_':
        this.controls.zoomBy(1 / 1.15);
        break;
      case '0':
        this.resetView();
        break;
      default:
        return;
    }
    ev.preventDefault();
  }

  /**
   * Arrow navigation between tiles: left/right walk the period (wrapping across the seam, skipping
   * empty cells); up/down walk the column; up from the top of a column reaches its header.
   */
  private focusNeighbour(z: number, dCol: number, dRow: number): void {
    const L = this.model.layout;
    const cell = L.cells.get(z);
    if (!cell) return;
    let next: number | null = null;
    if (dCol !== 0) {
      for (let k = 1; k <= 32 && next === null; k++) {
        const col = ((cell.column - 1 + dCol * k) % 32 + 32) % 32;
        next = L.grid[cell.period - 1]![col] ?? null;
      }
    } else {
      for (let p = cell.period + dRow; p >= 1 && p <= 7 && next === null; p += dRow) next = L.grid[p - 1]![cell.column - 1] ?? null;
      if (next === null && dRow < 0) {
        this.tiles.focusHead(cell.column);
        return;
      }
    }
    if (next !== null) this.tiles.focusTile(next);
  }

  private focusColumnTop(column: number): void {
    const top = this.model.layout.membersOfColumn(column)[0];
    if (top !== undefined) this.tiles.focusTile(top);
  }

  /** From a period label into its row: the member nearest the front of the cylinder. */
  private focusRowMember(period: number): void {
    const members = this.model.layout.membersOfPeriod(period);
    const az = this.stage.view.azimuth;
    let best = members[0];
    let bestCos = -Infinity;
    for (const z of members) {
      const c = this.model.layout.cells.get(z)!;
      const cos = Math.cos((c.column - 0.5) * (2 * Math.PI / 32) - az);
      if (cos > bestCos) { bestCos = cos; best = z; }
    }
    if (best !== undefined) this.tiles.focusTile(best);
  }

  // ------------------------------------------------------------- camera commands

  private stopAutoRotate(): void {
    if (this.store.get().autoRotate) this.store.set({ autoRotate: false });
  }

  faceColumn(column: number): void {
    this.stopAutoRotate();
    this.controls.animateTo({ azimuth: azimuthToFace(column, this.stage.view.azimuth) });
  }

  faceElement(z: number): void {
    const c = this.model.layout.cells.get(z);
    if (c) this.faceColumn(c.column);
  }

  focusElement(z: number): void {
    this.faceElement(z);
    this.tiles.setRovingTile(z);
    this.store.set({ pinned: { kind: 'element', z } });
  }

  resetView(): void {
    const az = this.stage.view.azimuth;
    const tau = Math.PI * 2;
    this.controls.animateTo({ azimuth: Math.round(az / tau) * tau + DEFAULT_VIEW.azimuth, pitch: DEFAULT_VIEW.pitch, zoom: DEFAULT_VIEW.zoom });
  }
}
