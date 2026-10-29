import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { HEADER_HEIGHT, HEADER_Y, RADIUS, WALL_BOTTOM } from '../layout/cylinder';
import { SCENE_BG } from '../ui/palette';

/** Camera pose around the fixed cylinder: azimuth φ (rad), pitch ε (rad, + looks down), zoom (> 1 = closer). */
export interface View {
  azimuth: number;
  pitch: number;
  zoom: number;
}

/** Stage-edge space (CSS px) the cylinder should keep clear of, e.g. for the legend overlay. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_VIEW: Readonly<View> = { azimuth: 0, pitch: 0.2, zoom: 1 };
export const PITCH_LIMITS = [-0.3, 1.25] as const;
export const ZOOM_LIMITS = [0.6, 2.6] as const;
/** The camera never comes closer to the axis than this (horizontally), so some wall always faces it. */
const MIN_HORIZONTAL_DISTANCE = RADIUS * 1.35;

const FOV = 30;
const MARGIN = 14; // px kept clear around the fitted cylinder
const RIM_TOP = HEADER_Y + HEADER_HEIGHT / 2 + 8;

/** A per-frame hook; return true when it changed something that needs a redraw. */
export type FrameHook = (dt: number, now: number) => boolean | void;

/**
 * Two renderers share one camera: WebGL (far wall, rims, relation framework) underneath and
 * CSS3D (element tiles, header ring) on top, so tile text stays crisp and natively hoverable.
 */
export class Stage {
  readonly host: HTMLElement;
  /** Null when WebGL is unavailable: tiles (CSS3D) still work, the framework and far wall do not. */
  readonly gl: THREE.WebGLRenderer | null;
  readonly css: CSS3DRenderer;
  readonly scene = new THREE.Scene();
  readonly cssScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 10, 30000);
  readonly view: View = { ...DEFAULT_VIEW };
  width = 1;
  height = 1;
  private fitDistance = 5000;
  private lookY = (RIM_TOP + WALL_BOTTOM) / 2;
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private fog = new THREE.Fog(SCENE_BG, 3000, 9000);
  private hooks: FrameHook[] = [];
  private resizeHooks: ((w: number, h: number) => void)[] = [];
  private failed = new WeakSet<object>();
  private glDirty = true;
  private cssDirty = true;
  private last = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    let gl: THREE.WebGLRenderer | null = null;
    try {
      gl = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      gl.setClearColor(SCENE_BG, 1);
      gl.domElement.className = 'gl-layer';
      gl.domElement.setAttribute('aria-hidden', 'true');
      // Keep the context restorable, and redraw (with our clear colour) once it is back.
      gl.domElement.addEventListener('webglcontextlost', (ev) => ev.preventDefault());
      gl.domElement.addEventListener('webglcontextrestored', () => {
        gl!.setClearColor(SCENE_BG, 1);
        this.invalidateCss();
      });
    } catch (err) {
      console.warn('WebGL unavailable; relations are disabled.', err);
    }
    this.gl = gl;
    this.css = new CSS3DRenderer();
    this.css.domElement.className = 'css-layer';
    // Focusing a tile must never scroll this layer: that would slide tiles off the WebGL wall.
    this.css.domElement.style.overflow = 'clip';
    host.prepend(this.css.domElement);
    if (gl) host.prepend(gl.domElement);
    this.scene.fog = this.fog;
    new ResizeObserver(() => this.resize()).observe(host);
    this.watchPixelRatio();
    this.resize();
  }

  /** Re-run resize when the device pixel ratio changes (browser zoom, moving between screens). */
  private watchPixelRatio(): void {
    const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq?.addEventListener('change', () => {
      this.resize();
      this.watchPixelRatio();
    }, { once: true });
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    if (this.gl) {
      this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.gl.setSize(this.width, this.height, false);
      this.gl.domElement.style.width = `${this.width}px`;
      this.gl.domElement.style.height = `${this.height}px`;
    }
    this.css.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.fit();
    for (const fn of this.resizeHooks) fn(this.width, this.height);
  }

  /** Keep the fitted cylinder clear of overlays; refits when the insets change. */
  setInsets(insets: Partial<Insets>): void {
    const next = { ...this.insets, ...insets };
    if (Object.keys(next).every((k) => Math.abs(next[k as keyof Insets] - this.insets[k as keyof Insets]) < 1)) return;
    this.insets = next;
    this.fit();
  }

  /**
   * Choose the zoom-1 distance and aim height so the whole cylinder (header ring to bottom rim),
   * seen at the default pitch, fills the stage minus insets and a margin. Projects the rims
   * rather than approximating, because pitch and perspective make the near rim loom larger.
   */
  private fit(): void {
    const box = {
      left: this.insets.left + MARGIN,
      right: this.width - this.insets.right - MARGIN,
      top: this.insets.top + MARGIN,
      bottom: this.height - this.insets.bottom - MARGIN,
    };
    if (box.right - box.left < 40 || box.bottom - box.top < 40) return;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      for (const y of [RIM_TOP, WALL_BOTTOM]) pts.push(new THREE.Vector3(RADIUS * Math.sin(a), y, RADIUS * Math.cos(a)));
    }
    const cam = this.camera.clone();
    const v = new THREE.Vector3();
    const bounds = (d: number, lookY: number) => {
      const p = DEFAULT_VIEW.pitch;
      cam.position.set(0, lookY + d * Math.sin(p), d * Math.cos(p));
      cam.lookAt(0, lookY, 0);
      cam.updateMatrixWorld();
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const pt of pts) {
        v.copy(pt).project(cam);
        const x = (v.x * 0.5 + 0.5) * this.width;
        const y = (-v.y * 0.5 + 0.5) * this.height;
        l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
      }
      return { l, r, t, b };
    };
    let lookY = (RIM_TOP + WALL_BOTTOM) / 2;
    let d = this.fitDistance;
    for (let pass = 0; pass < 3; pass++) {
      // Smallest distance at which the projected box fits (bigger d = smaller cylinder).
      let lo = RADIUS * 1.5, hi = RADIUS * 40;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const bb = bounds(mid, lookY);
        const fits = bb.r - bb.l <= box.right - box.left && bb.b - bb.t <= box.bottom - box.top;
        if (fits) hi = mid; else lo = mid;
      }
      d = hi;
      // Re-aim so the projected box is centred vertically in the free area. Aiming higher moves
      // the picture down, so a box that sits too low (dyPx > 0) needs a lower aim.
      const bb = bounds(d, lookY);
      const dyPx = (bb.t + bb.b) / 2 - (box.top + box.bottom) / 2;
      const unitsPerPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.height;
      lookY -= dyPx * unitsPerPx;
    }
    this.fitDistance = d;
    this.lookY = lookY;
    // Horizontal centring: shift the projection so the free area's centre is the image centre.
    const cx = (box.left + box.right) / 2;
    const offsetX = this.width / 2 - cx;
    if (Math.abs(offsetX) > 0.5) this.camera.setViewOffset(this.width, this.height, offsetX, 0, this.width, this.height);
    else this.camera.clearViewOffset();
    this.setView({});
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeHooks.push(fn);
  }

  /** Camera distance from the look-at point for the current zoom. */
  get distance(): number {
    return this.fitDistance / this.view.zoom;
  }

  /** Closest zoom at a pitch that still keeps the camera outside the cylinder. */
  maxZoom(pitch = this.view.pitch): number {
    return Math.min(ZOOM_LIMITS[1], (this.fitDistance * Math.cos(pitch)) / MIN_HORIZONTAL_DISTANCE);
  }

  setView(v: Partial<View>): void {
    if (v.azimuth !== undefined) this.view.azimuth = v.azimuth;
    if (v.pitch !== undefined) this.view.pitch = THREE.MathUtils.clamp(v.pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]);
    const zoom = v.zoom ?? this.view.zoom;
    this.view.zoom = THREE.MathUtils.clamp(zoom, ZOOM_LIMITS[0], Math.max(ZOOM_LIMITS[0], this.maxZoom()));
    this.updateCamera();
  }

  private updateCamera(): void {
    const { azimuth, pitch } = this.view;
    const d = this.distance;
    this.camera.position.set(
      d * Math.cos(pitch) * Math.sin(azimuth),
      this.lookY + d * Math.sin(pitch),
      d * Math.cos(pitch) * Math.cos(azimuth),
    );
    this.camera.lookAt(0, this.lookY, 0);
    this.camera.updateMatrixWorld();
    // Fog follows the camera: the far wall reads about half-faded at any zoom.
    this.fog.near = Math.max(1, d - RADIUS * 0.5);
    this.fog.far = d + RADIUS * 2.5;
    this.glDirty = true;
    this.cssDirty = true;
  }

  /** Horizontal distance from the cylinder axis to the camera. */
  get horizontalDistance(): number {
    return this.distance * Math.cos(this.view.pitch);
  }

  invalidate(css = false): void {
    this.glDirty = true;
    if (css) this.cssDirty = true;
  }

  onFrame(fn: FrameHook): void {
    this.hooks.push(fn);
  }

  /** Project a world point to stage-local CSS pixels. */
  project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, behind: v.z > 1 };
  }

  start(): void {
    const loop = (now: number) => {
      // Schedule first: an exception below must not stop the scene for good.
      requestAnimationFrame(loop);
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
      this.last = now;
      let changed = false;
      for (const fn of this.hooks) {
        try {
          if (fn(dt, now)) changed = true;
        } catch (err) {
          this.report(fn, err);
        }
      }
      if (changed) this.glDirty = true;
      try {
        if (this.cssDirty) {
          this.cssDirty = false;
          this.css.render(this.cssScene, this.camera);
        }
        if (this.glDirty) {
          this.glDirty = false;
          this.gl?.render(this.scene, this.camera);
        }
      } catch (err) {
        this.report(this, err);
      }
    };
    requestAnimationFrame(loop);
  }

  /** Log each failing hook once instead of every frame. */
  private report(source: object, err: unknown): void {
    if (this.failed.has(source)) return;
    this.failed.add(source);
    console.error('Periodic Cylinder: frame update failed', err);
  }

  /** Force the CSS3D layer to re-render (e.g. after tiles move). */
  invalidateCss(): void {
    this.cssDirty = true;
    this.glDirty = true;
  }
}
