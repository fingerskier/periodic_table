import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import {
  angleOfColumn, HEADER_HEIGHT, HEADER_Y, RADIUS, TILE_HEIGHT, TILE_WIDTH, yOfPeriod,
} from '../layout/cylinder';
import type { ColumnInfo, ElementData, Layout } from '../types';
import { h } from '../ui/dom';
import { CATEGORY_BY_ID, inkFor, mix, SCENE_BG, TEXT } from '../ui/palette';
import type { Stage } from './stage';

export interface TileColors {
  /** Identity colour (border, glow). */
  accent: string;
  /** Background before wall opacity is applied. */
  fill: string;
  /** "No data" tiles use muted text whatever the fill. */
  muted?: boolean;
}

interface Tile {
  z: number;
  el: HTMLButtonElement;
  obj: CSS3DObject;
  angle: number;
  y: number;
  /** Radial lift while animating between layouts (0 when settled). */
  lift: number;
  from?: { angle: number; y: number };
  to?: { angle: number; y: number };
  front: boolean;
}

interface Head {
  column: number;
  el: HTMLButtonElement;
  obj: CSS3DObject;
  front: boolean;
}

const TWEEN_SECONDS = 0.7;

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function massText(e: ElementData): string {
  if (e.massIsMassNumber) return `[${Math.round(e.mass)}]`;
  const s = e.mass.toPrecision(e.mass < 10 ? 4 : e.mass < 100 ? 5 : 6);
  return String(Number(s));
}

/**
 * Element tiles and the column-header ring, as CSS3D objects on the cylinder wall.
 * Keyboard: each ring is one tab stop (roving tabindex); the scene moves focus with the arrows.
 */
export class Tiles {
  readonly tiles = new Map<number, Tile>();
  readonly heads = new Map<number, Head>();
  private tweenT = 1;
  private onSettled: (() => void) | null = null;
  private byZ: ReadonlyMap<number, ElementData>;

  constructor(private stage: Stage, elements: readonly ElementData[], layout: Layout, columns: readonly ColumnInfo[]) {
    this.byZ = new Map(elements.map((e) => [e.z, e]));
    for (const e of elements) {
      const cell = layout.cells.get(e.z)!;
      const el = h('button', { class: 'tile', type: 'button', 'data-z': e.z, tabindex: -1, 'aria-pressed': 'false' },
        h('span', { class: 'tile-inner', 'aria-hidden': 'true' },
          h('span', { class: 't-z' }, e.z),
          h('span', { class: 't-sym' }, e.symbol),
          h('span', { class: 't-name' }, e.name),
          h('span', { class: 't-mass' }, massText(e)),
        ));
      el.style.width = `${TILE_WIDTH}px`;
      el.style.height = `${TILE_HEIGHT}px`;
      const obj = new CSS3DObject(el);
      const tile: Tile = { z: e.z, el, obj, angle: angleOfColumn(cell.column), y: yOfPeriod(cell.period), lift: 0, front: true };
      this.place(tile);
      stage.cssScene.add(obj);
      this.tiles.set(e.z, tile);
    }
    for (let column = 1; column <= 32; column++) {
      const el = h('button', { class: 'col-head', type: 'button', 'data-col': column, tabindex: -1, 'aria-pressed': 'false' },
        h('span', { class: 'h-label', 'aria-hidden': 'true' }), h('span', { class: 'h-sub', 'aria-hidden': 'true' }));
      el.style.width = `${TILE_WIDTH}px`;
      el.style.height = `${HEADER_HEIGHT}px`;
      const obj = new CSS3DObject(el);
      const t = angleOfColumn(column);
      obj.position.set(RADIUS * Math.sin(t), HEADER_Y, RADIUS * Math.cos(t));
      obj.rotation.y = t;
      stage.cssScene.add(obj);
      this.heads.set(column, { column, el, obj, front: true });
    }
    this.setLabels(layout);
    this.setColumns(columns);
    this.setRovingTile(1);
    this.setRovingHead(1);
    stage.onFrame((dt) => this.tick(dt));
  }

  private place(t: Tile): void {
    const r = RADIUS + t.lift;
    t.obj.position.set(r * Math.sin(t.angle), t.y, r * Math.cos(t.angle));
    t.obj.rotation.y = t.angle;
  }

  /** Accessible names carry what a sighted user reads off the tile and its position. */
  private setLabels(layout: Layout): void {
    for (const t of this.tiles.values()) {
      const e = this.byZ.get(t.z)!;
      const cell = layout.cells.get(t.z)!;
      const where = cell.group !== null ? `group ${cell.group}` : 'f-block';
      const cat = CATEGORY_BY_ID.get(e.category)?.label.toLowerCase() ?? '';
      t.el.setAttribute('aria-label', `${e.name}, ${e.symbol}, atomic number ${e.z}, ${cat}, ${where}, period ${cell.period}`);
    }
  }

  /** Relabel the header ring (labels depend on the group-3 convention). */
  setColumns(columns: readonly ColumnInfo[]): void {
    for (const info of columns) {
      const head = this.heads.get(info.column);
      if (!head) continue;
      const [label, sub] = head.el.children as unknown as [HTMLElement, HTMLElement];
      label.textContent = info.label;
      sub.textContent = info.kind === 'group' ? (info.casLabel ?? '') : 'f-block';
      head.el.classList.toggle('is-f', info.kind === 'f');
      const name = info.kind === 'group'
        ? `Group ${info.group}${info.name ? `, ${info.name}` : ''}`
        : `f-block column ${info.fIndex}`;
      head.el.setAttribute('aria-label', name);
    }
  }

  /** The one tile that Tab reaches; arrow keys move it. */
  setRovingTile(z: number): void {
    for (const t of this.tiles.values()) t.el.tabIndex = t.z === z ? 0 : -1;
  }

  setRovingHead(column: number): void {
    for (const hd of this.heads.values()) hd.el.tabIndex = hd.column === column ? 0 : -1;
  }

  focusTile(z: number): void {
    this.setRovingTile(z);
    this.tiles.get(z)?.el.focus({ preventScroll: true });
  }

  focusHead(column: number): void {
    this.setRovingHead(column);
    this.heads.get(column)?.el.focus({ preventScroll: true });
  }

  /** Move tiles to a new layout, animating along the wall; `done` runs once they settle. */
  setLayout(layout: Layout, done?: () => void): void {
    this.setLabels(layout);
    let moving = false;
    for (const t of this.tiles.values()) {
      const cell = layout.cells.get(t.z)!;
      const to = { angle: angleOfColumn(cell.column), y: yOfPeriod(cell.period) };
      if (Math.abs(to.angle - t.angle) < 1e-9 && Math.abs(to.y - t.y) < 1e-9) continue;
      t.from = { angle: t.angle, y: t.y };
      t.to = to;
      moving = true;
    }
    if (!moving) { done?.(); return; }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.tweenT = reduce ? 1 - 1e-9 : 0;
    this.onSettled = done ?? null;
  }

  get isTweening(): boolean {
    return this.tweenT < 1;
  }

  private tick(dt: number): boolean {
    let changed = false;
    if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / TWEEN_SECONDS);
      const u = this.tweenT;
      const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      for (const t of this.tiles.values()) {
        if (!t.from || !t.to) continue;
        t.angle = t.from.angle + (t.to.angle - t.from.angle) * e;
        t.y = t.from.y + (t.to.y - t.from.y) * e;
        // Lift moving tiles off the wall mid-flight so they pass over their neighbours.
        t.lift = u >= 1 ? 0 : 90 * Math.sin(Math.PI * e);
        this.place(t);
        if (u >= 1) { t.from = undefined; t.to = undefined; }
      }
      this.stage.invalidateCss();
      changed = true;
      if (u >= 1) { const cb = this.onSettled; this.onSettled = null; cb?.(); }
    }
    this.updateFacing();
    return changed;
  }

  /**
   * Front-facing iff cos(θ − φ) > R / d_h. Back-facing tiles stop taking pointer events; this is
   * set inline because CSS3DObject itself writes an inline pointer-events: auto.
   */
  private updateFacing(): void {
    const az = this.stage.view.azimuth;
    const limit = RADIUS / Math.max(RADIUS + 1, this.stage.horizontalDistance);
    const apply = (el: HTMLElement, front: boolean) => {
      el.classList.toggle('is-back', !front);
      el.style.pointerEvents = front ? 'auto' : 'none';
    };
    for (const t of this.tiles.values()) {
      const front = Math.cos(t.angle - az) > limit + 0.02;
      if (front !== t.front) { t.front = front; apply(t.el, front); }
    }
    for (const hd of this.heads.values()) {
      const front = Math.cos(angleOfColumn(hd.column) - az) > limit + 0.02;
      if (front !== hd.front) { hd.front = front; apply(hd.el, front); }
    }
  }

  /**
   * Fills are drawn at `opacity` over the dark scene, so text colour is chosen against the colour
   * actually seen, not the opaque fill (a light ramp step at 60% reads much darker).
   */
  applyColors(colors: ReadonlyMap<number, TileColors>, opacity: number): void {
    for (const t of this.tiles.values()) {
      const c = colors.get(t.z);
      if (!c) continue;
      const seen = mix(c.fill, SCENE_BG, 1 - opacity);
      const ink = c.muted ? TEXT.muted : inkFor(seen);
      t.el.style.setProperty('--accent', c.accent);
      t.el.style.background = hexToRgba(c.fill, opacity);
      t.el.style.color = ink;
      // The legibility shadow only helps light text; on light fills it would smear dark text.
      t.el.style.textShadow = ink === TEXT.onLight ? 'none' : '';
    }
  }

  /** Visual state per tile: active (the target), highlighted members, related elements, dimmed others. */
  applyStates(active: number | null, hl: ReadonlySet<number>, related: ReadonlySet<number>, dimOthers: boolean): void {
    for (const t of this.tiles.values()) {
      const isActive = t.z === active;
      const isHl = hl.has(t.z);
      const isRel = related.has(t.z);
      t.el.classList.toggle('is-active', isActive);
      t.el.classList.toggle('is-hl', isHl && !isActive);
      t.el.classList.toggle('is-rel', isRel && !isActive && !isHl);
      t.el.classList.toggle('is-dim', dimOthers && !isActive && !isHl && !isRel);
    }
  }

  applyHeadStates(active: number | null, hl: number | null): void {
    for (const hd of this.heads.values()) {
      hd.el.classList.toggle('is-active', hd.column === active);
      hd.el.classList.toggle('is-hl', hd.column === hl && hd.column !== active);
    }
  }

  /** Expose the pinned selection to assistive tech (tiles and headers are pin toggles). */
  applyPinned(z: number | null, column: number | null): void {
    for (const t of this.tiles.values()) t.el.setAttribute('aria-pressed', String(t.z === z));
    for (const hd of this.heads.values()) hd.el.setAttribute('aria-pressed', String(hd.column === column));
  }

  isFront(z: number): boolean {
    return !!this.tiles.get(z)?.front;
  }
}
