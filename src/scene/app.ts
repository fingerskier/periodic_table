import * as THREE from 'three';
import { azimuthToFace } from '../layout/cylinder';
import { buildModel } from '../model';
import { activeTarget, sameTarget, type Store } from '../state';
import type { AppState, Model, Target } from '../types';
import { matchesLegend, tileColors } from './colors';
import { Controls } from './controls';
import { Framework } from './framework';
import { RowLabels } from './rowLabels';
import { DEFAULT_VIEW, Stage } from './stage';
import { Tiles } from './tiles';
import { Wall } from './wall';
import './scene.css';

/** Members highlighted for a hub target (a set, or one set of a setChain). */
function hubMembers(model: Model, t: Extract<Target, { kind: 'hub' }>): number[] {
  const item = model.layers.find((l) => l.id === t.layerId)?.items.find((i) => i.id === t.itemId);
  if (!item) return [];
  if (item.kind === 'set') return item.members;
  if (item.kind === 'setChain') return item.sets.find((s) => s.id === t.setId)?.members ?? [];
  return [];
}

function edgeEnds(model: Model, t: Extract<Target, { kind: 'edge' }>): number[] {
  const item = model.layers.find((l) => l.id === t.layerId)?.items.find((i) => i.id === t.itemId);
  if (item?.kind !== 'edges') return [];
  const e = item.edges[t.edgeIndex];
  return e ? [e.a, e.b] : [];
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

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
  private lastViewKey = '';

  constructor(host: HTMLElement, private store: Store<AppState>) {
    const state = store.get();
    this.model = buildModel(state.convention);
    this.stage = new Stage(host);
    this.wall = new Wall(this.stage, this.model.layout);
    this.framework = new Framework(this.stage);
    this.tiles = new Tiles(this.stage, this.model.elements, this.model.layout, this.model.columns);
    this.rows = new RowLabels(this.stage);
    this.controls = new Controls(this.stage, {
      onClick: (x, y) => this.onClick(x, y),
      onPointer: (x, y) => this.hoverAt(x, y),
      onPointerLeave: () => this.setHover(null),
      onDragStart: () => this.setHover(null),
      onDragEnd: () => {},
      onUserMotion: () => this.stopAutoRotate(),
    });
    this.controls.autoRotate = state.autoRotate;
    this.raycaster.camera = this.stage.camera;

    this.applyColors(state);
    this.framework.rebuild(this.model, state);
    this.applyHighlight(state);
    store.subscribe((s, prev) => this.onState(s, prev));

    // Re-pick under a stationary pointer while the cylinder turns beneath it.
    this.stage.onFrame(() => {
      const v = this.stage.view;
      const key = `${v.azimuth}|${v.pitch}|${v.zoom}`;
      if (key !== this.lastViewKey) {
        this.lastViewKey = key;
        const p = this.controls.pointer;
        if (p && !this.controls.isDragging) this.hoverAt(p.x, p.y);
      }
      return false;
    });

    host.addEventListener('focusin', (ev) => this.onFocusIn(ev));
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

  // ------------------------------------------------------------- state → visuals

  private onState(s: AppState, prev: AppState): void {
    if (s.convention !== prev.convention) {
      this.model = buildModel(s.convention);
      this.tiles.setColumns(this.model.columns);
      this.wall.setLayout(this.model.layout);
      this.framework.rebuild(this.model, { ...s, layers: {} });
      this.tiles.setLayout(this.model.layout, () => {
        this.framework.rebuild(this.model, this.store.get());
        this.applyHighlight(this.store.get());
      });
    }
    if (s.colorMode !== prev.colorMode || s.wallOpacity !== prev.wallOpacity || s.convention !== prev.convention) this.applyColors(s);
    if (s.layers !== prev.layers) this.framework.rebuild(this.model, s);
    if (s.autoRotate !== prev.autoRotate) this.controls.autoRotate = s.autoRotate;
    if (
      !sameTarget(activeTarget(s), activeTarget(prev)) || s.legendFocus !== prev.legendFocus || s.layers !== prev.layers
      || s.convention !== prev.convention || s.wallOpacity !== prev.wallOpacity
    ) this.applyHighlight(s);
    this.controls.paused = !!s.hover || !!s.pinned;
  }

  private applyColors(s: AppState): void {
    const colors = tileColors(this.model, s.colorMode);
    this.tiles.applyColors(colors, s.wallOpacity);
    this.wall.applyColors(colors, s.wallOpacity);
    this.stage.invalidateCss();
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
      hl = new Set(this.model.elements.filter((e) => matchesLegend(e, L.cells.get(e.z)!, focus)).map((e) => e.z));
      dim = true;
    }
    this.tiles.applyStates(active, hl, focus ? new Set() : related, dim);
    this.tiles.applyHeadStates(headActive, headHl);
    this.rows.applyStates(rowActive, rowHl);
    const keep = new Set<number>([...hl, ...related]);
    if (active !== null) keep.add(active);
    this.wall.applyDim(dim ? new Set(this.model.elements.map((e) => e.z).filter((z) => !keep.has(z))) : null, s.wallOpacity);
    this.stage.invalidateCss();
  }

  // ------------------------------------------------------------- picking

  /** DOM targets (tiles, header ring, period labels) win; then hubs/edges of the framework. */
  pick(clientX: number, clientY: number): Target | null {
    const el = document.elementFromPoint(clientX, clientY);
    const hit = el instanceof Element ? el.closest<HTMLElement>('[data-z], [data-col], [data-period]') : null;
    if (hit && this.stage.host.contains(hit)) {
      if (hit.dataset.z) return { kind: 'element', z: Number(hit.dataset.z) };
      if (hit.dataset.col) return { kind: 'column', column: Number(hit.dataset.col) };
      if (hit.dataset.period) return { kind: 'period', period: Number(hit.dataset.period) };
    }
    if (el && !el.closest('.css-layer, .gl-layer')) return null; // over an overlay (legend, hint)
    if (this.framework.visibleLayerCount === 0) return null;
    const r = this.stage.host.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    return this.framework.pick(this.raycaster);
  }

  private hoverAt(x: number, y: number): void {
    this.setHover(this.pick(x, y));
  }

  private setHover(t: Target | null): void {
    if (!sameTarget(this.store.get().hover, t)) this.store.set({ hover: t });
  }

  private onClick(x: number, y: number): void {
    const t = this.pick(x, y);
    const pinned = this.store.get().pinned;
    this.store.set({ pinned: t && !sameTarget(pinned, t) ? t : null, hover: t });
  }

  /** Keyboard activation of a focused tile/header/label (mouse clicks go through onClick). */
  private onNativeClick(ev: MouseEvent): void {
    if (ev.detail !== 0) return;
    const el = (ev.target as Element | null)?.closest<HTMLElement>('[data-z], [data-col], [data-period]');
    if (!el) return;
    const t: Target = el.dataset.z ? { kind: 'element', z: Number(el.dataset.z) }
      : el.dataset.col ? { kind: 'column', column: Number(el.dataset.col) }
      : { kind: 'period', period: Number(el.dataset.period) };
    const pinned = this.store.get().pinned;
    this.store.set({ pinned: sameTarget(pinned, t) ? null : t });
  }

  private onFocusIn(ev: FocusEvent): void {
    const el = (ev.target as Element | null)?.closest<HTMLElement>('[data-z], [data-col], [data-period]');
    if (!el || !el.matches(':focus-visible')) return;
    if (el.dataset.z) {
      const z = Number(el.dataset.z);
      this.faceElement(z);
      this.setHover({ kind: 'element', z });
    } else if (el.dataset.col) {
      const column = Number(el.dataset.col);
      this.faceColumn(column);
      this.setHover({ kind: 'column', column });
    } else if (el.dataset.period) {
      this.setHover({ kind: 'period', period: Number(el.dataset.period) });
    }
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey || isTypingTarget(ev.target)) return;
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-z]');
    const z = focused?.dataset.z ? Number(focused.dataset.z) : null;
    switch (ev.key) {
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = ev.key === 'ArrowLeft' ? -1 : 1;
        if (z !== null) this.focusNeighbour(z, dir, 0);
        else this.controls.rotateColumns(dir);
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown': {
        const dir = ev.key === 'ArrowUp' ? -1 : 1;
        // Down tips the top toward the viewer, like dragging down.
        if (z !== null) this.focusNeighbour(z, 0, dir);
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
      case 'Escape':
        this.store.set({ pinned: null, hover: null, legendFocus: null });
        return;
      default:
        return;
    }
    ev.preventDefault();
  }

  /** Move keyboard focus to the nearest occupied cell left/right (wrapping the seam) or up/down. */
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
    }
    if (next !== null) (this.tiles.tiles.get(next)?.el)?.focus({ preventScroll: true });
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
    this.store.set({ pinned: { kind: 'element', z } });
  }

  resetView(): void {
    const az = this.stage.view.azimuth;
    const tau = Math.PI * 2;
    this.controls.animateTo({ azimuth: Math.round(az / tau) * tau + DEFAULT_VIEW.azimuth, pitch: DEFAULT_VIEW.pitch, zoom: DEFAULT_VIEW.zoom });
  }
}
