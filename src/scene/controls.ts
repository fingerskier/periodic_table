import { COLUMN_ANGLE } from '../layout/cylinder';
import { DEFAULT_VIEW, PITCH_LIMITS, ZOOM_LIMITS, type Stage, type View } from './stage';

const DRAG_THRESHOLD = 5; // px before a press becomes a drag
const FRICTION = 4.2; // 1/s, exponential decay of spin velocity
const AUTO_SPIN = 0.07; // rad/s
const TWEEN_RATE = 9; // 1/s, critically damped approach toward animation targets

export interface ControlHandlers {
  /** A press that did not become a drag. */
  onClick(clientX: number, clientY: number, ev: PointerEvent): void;
  /** Pointer moved (not dragging); used for hover picking. */
  onPointer(clientX: number, clientY: number): void;
  onPointerLeave(): void;
  onDragStart(): void;
  onDragEnd(): void;
  /** The user rotated, tilted or zoomed by any means (stops auto-rotate). */
  onUserMotion(): void;
}

/**
 * Orbit controls for the fixed cylinder: horizontal drag spins (with inertia), vertical drag tilts,
 * wheel / pinch zooms. Dragging anywhere on the stage works, including beside the cylinder.
 */
export class Controls {
  autoRotate = true;
  /** Pause auto-rotation (e.g. while something is hovered). */
  paused = false;
  private velocity = 0;
  private target: Partial<View> | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private press: { id: number; x: number; y: number; lastX: number; lastY: number; lastT: number; dragging: boolean } | null = null;
  private pinchDist = 0;
  private lastPointer: { x: number; y: number } | null = null;

  constructor(private stage: Stage, private handlers: ControlHandlers) {
    const el = stage.host;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    stage.onFrame((dt) => this.tick(dt));
  }

  get isDragging(): boolean {
    return !!this.press?.dragging;
  }

  /** Last known pointer position over the stage (client coords), or null when outside. */
  get pointer(): { x: number; y: number } | null {
    return this.lastPointer;
  }

  /** Animate toward a pose; unspecified fields keep their value. */
  animateTo(v: Partial<View>): void {
    this.velocity = 0;
    const next = { ...this.target, ...v };
    // Targets beyond the stage's clamps could never be reached, so the tween would never settle.
    if (next.pitch !== undefined) next.pitch = Math.min(PITCH_LIMITS[1], Math.max(PITCH_LIMITS[0], next.pitch));
    if (next.zoom !== undefined) next.zoom = Math.min(ZOOM_LIMITS[1], Math.max(ZOOM_LIMITS[0], next.zoom));
    this.target = next;
  }

  rotateColumns(n: number): void {
    const base = this.target?.azimuth ?? this.stage.view.azimuth;
    this.animateTo({ azimuth: base + n * COLUMN_ANGLE });
    this.handlers.onUserMotion();
  }

  tilt(d: number): void {
    const base = this.target?.pitch ?? this.stage.view.pitch;
    this.animateTo({ pitch: base + d });
    this.handlers.onUserMotion();
  }

  zoomBy(f: number): void {
    const base = this.target?.zoom ?? this.stage.view.zoom;
    this.animateTo({ zoom: base * f });
    this.handlers.onUserMotion();
  }

  reset(): void {
    this.animateTo({ pitch: DEFAULT_VIEW.pitch, zoom: DEFAULT_VIEW.zoom });
  }

  private tick(dt: number): boolean {
    if (dt <= 0) return false;
    const v = this.stage.view;
    if (this.target) {
      const k = 1 - Math.exp(-TWEEN_RATE * dt);
      const next: Partial<View> = {};
      let done = true;
      for (const key of ['azimuth', 'pitch', 'zoom'] as const) {
        const goal = this.target[key];
        if (goal === undefined) continue;
        const cur = v[key];
        const step = cur + (goal - cur) * k;
        const eps = key === 'zoom' ? 1e-4 : 1e-4;
        if (Math.abs(goal - step) > eps) done = false;
        next[key] = Math.abs(goal - step) > eps ? step : goal;
      }
      this.stage.setView(next);
      if (done) this.target = null;
      return true;
    }
    if (this.press?.dragging) return false;
    if (Math.abs(this.velocity) > 1e-4) {
      this.stage.setView({ azimuth: v.azimuth + this.velocity * dt });
      this.velocity *= Math.exp(-FRICTION * dt);
      return true;
    }
    if (this.autoRotate && !this.paused) {
      this.stage.setView({ azimuth: v.azimuth + AUTO_SPIN * dt });
      return true;
    }
    return false;
  }

  private onDown = (ev: PointerEvent): void => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.press = null;
      return;
    }
    this.press = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, lastX: ev.clientX, lastY: ev.clientY, lastT: performance.now(), dragging: false };
  };

  private onMove = (ev: PointerEvent): void => {
    this.lastPointer = { x: ev.clientX, y: ev.clientY };
    if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinchDist > 0) {
        this.target = null;
        this.stage.setView({ zoom: this.stage.view.zoom * (d / this.pinchDist) });
        this.handlers.onUserMotion();
      }
      this.pinchDist = d;
      return;
    }
    const p = this.press;
    if (!p || p.id !== ev.pointerId) {
      this.handlers.onPointer(ev.clientX, ev.clientY);
      return;
    }
    if (!p.dragging && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > DRAG_THRESHOLD) {
      p.dragging = true;
      this.target = null;
      this.velocity = 0;
      this.stage.host.setPointerCapture(ev.pointerId);
      this.stage.host.classList.add('dragging');
      this.handlers.onDragStart();
      this.handlers.onUserMotion();
    }
    if (!p.dragging) return;
    const now = performance.now();
    const dx = ev.clientX - p.lastX;
    const dy = ev.clientY - p.lastY;
    // Grab-the-surface feel: dragging right moves the front of the cylinder right.
    const k = Math.PI / Math.max(320, this.stage.width);
    const dAz = -dx * k;
    this.stage.setView({ azimuth: this.stage.view.azimuth + dAz, pitch: this.stage.view.pitch + dy * k * 0.8 });
    const dtS = Math.max(1e-3, (now - p.lastT) / 1000);
    this.velocity = 0.75 * this.velocity + 0.25 * (dAz / dtS);
    p.lastX = ev.clientX;
    p.lastY = ev.clientY;
    p.lastT = now;
  };

  private onUp = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    const p = this.press;
    if (!p || p.id !== ev.pointerId) return;
    this.press = null;
    if (p.dragging) {
      this.stage.host.classList.remove('dragging');
      if (this.stage.host.hasPointerCapture(ev.pointerId)) this.stage.host.releasePointerCapture(ev.pointerId);
      // A drag that ends after a pause should not fling.
      if (performance.now() - p.lastT > 90) this.velocity = 0;
      this.velocity = Math.max(-6, Math.min(6, this.velocity));
      this.handlers.onDragEnd();
    } else if (ev.type === 'pointerup') {
      this.handlers.onClick(ev.clientX, ev.clientY, ev);
    }
  };

  private onLeave = (ev: PointerEvent): void => {
    if (this.press?.dragging) return;
    if (ev.pointerType === 'mouse') {
      this.lastPointer = null;
      this.handlers.onPointerLeave();
    }
  };

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const scale = ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? 800 : 1;
    const f = Math.exp(-ev.deltaY * scale * 0.0012);
    this.target = null;
    this.stage.setView({ zoom: this.stage.view.zoom * f });
    this.handlers.onUserMotion();
  };
}
