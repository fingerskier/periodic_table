import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { HEADER_Y, RADIUS, WALL_BOTTOM } from '../layout/cylinder';
import { SCENE_BG } from '../ui/palette';

/** Camera pose around the fixed cylinder: azimuth φ (rad), pitch ε (rad, + looks down), zoom (> 1 = closer). */
export interface View {
  azimuth: number;
  pitch: number;
  zoom: number;
}

export const DEFAULT_VIEW: Readonly<View> = { azimuth: 0, pitch: 0.2, zoom: 1 };
export const PITCH_LIMITS = [-0.3, 1.25] as const;
export const ZOOM_LIMITS = [0.6, 2.6] as const;

const FOV = 30;
/** Vertical middle of wall + header ring; the camera aims here. */
const LOOK_Y = (HEADER_Y + 50 + WALL_BOTTOM) / 2 - 60;

/** A per-frame hook; return true when it changed something that needs a redraw. */
export type FrameHook = (dt: number, now: number) => boolean | void;

/**
 * Two renderers share one camera: WebGL (far wall, rims, relation framework) underneath and
 * CSS3D (element tiles, header ring) on top, so tile text stays crisp and natively hoverable.
 */
export class Stage {
  readonly host: HTMLElement;
  readonly gl: THREE.WebGLRenderer;
  readonly css: CSS3DRenderer;
  readonly scene = new THREE.Scene();
  readonly cssScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 10, 30000);
  readonly view: View = { ...DEFAULT_VIEW };
  width = 1;
  height = 1;
  private fitDistance = 5000;
  private hooks: FrameHook[] = [];
  private afterRender: (() => void)[] = [];
  private glDirty = true;
  private cssDirty = true;
  private last = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.setClearColor(SCENE_BG, 1);
    this.gl.domElement.className = 'gl-layer';
    this.gl.domElement.setAttribute('aria-hidden', 'true');
    this.css = new CSS3DRenderer();
    this.css.domElement.className = 'css-layer';
    host.prepend(this.gl.domElement, this.css.domElement);
    this.scene.fog = new THREE.Fog(SCENE_BG, 3000, 9000);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    this.gl.setSize(this.width, this.height, false);
    this.gl.domElement.style.width = `${this.width}px`;
    this.gl.domElement.style.height = `${this.height}px`;
    this.css.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    // Fit the cylinder (radius R, wall + header height) with a margin in both directions.
    const halfV = (HEADER_Y + 60 - WALL_BOTTOM) / 2 + 40;
    const halfH = RADIUS * 1.06;
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const th = tv * this.camera.aspect;
    this.fitDistance = Math.max(halfV / tv, halfH / th) + RADIUS;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
    for (const fn of this.resizeHooks) fn(this.width, this.height);
  }

  private resizeHooks: ((w: number, h: number) => void)[] = [];
  onResize(fn: (w: number, h: number) => void): void {
    this.resizeHooks.push(fn);
  }

  /** Camera distance from the look-at point for the current zoom. */
  get distance(): number {
    return this.fitDistance / this.view.zoom;
  }

  setView(v: Partial<View>): void {
    if (v.azimuth !== undefined) this.view.azimuth = v.azimuth;
    if (v.pitch !== undefined) this.view.pitch = THREE.MathUtils.clamp(v.pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]);
    if (v.zoom !== undefined) this.view.zoom = THREE.MathUtils.clamp(v.zoom, ZOOM_LIMITS[0], ZOOM_LIMITS[1]);
    this.updateCamera();
  }

  private updateCamera(): void {
    const { azimuth, pitch } = this.view;
    const d = this.distance;
    this.camera.position.set(
      d * Math.cos(pitch) * Math.sin(azimuth),
      LOOK_Y + d * Math.sin(pitch),
      d * Math.cos(pitch) * Math.cos(azimuth),
    );
    this.camera.lookAt(0, LOOK_Y, 0);
    this.camera.updateMatrixWorld();
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

  onAfterRender(fn: () => void): void {
    this.afterRender.push(fn);
  }

  /** Project a world point to stage-local CSS pixels. */
  project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height, behind: v.z > 1 };
  }

  start(): void {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
      this.last = now;
      let changed = false;
      for (const fn of this.hooks) if (fn(dt, now)) changed = true;
      if (changed) this.glDirty = true;
      if (this.cssDirty) {
        this.css.render(this.cssScene, this.camera);
        this.cssDirty = false;
      }
      if (this.glDirty) {
        this.gl.render(this.scene, this.camera);
        this.glDirty = false;
        for (const fn of this.afterRender) fn();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Force the CSS3D layer to re-render (e.g. after tiles move). */
  invalidateCss(): void {
    this.cssDirty = true;
    this.glDirty = true;
  }
}
