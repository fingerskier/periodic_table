import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { anchorOf, arcPoints, hubPoint, RADIUS, yOfPeriod, angleOfColumn, type Vec3 } from '../layout/cylinder';
import { isItemVisible } from '../state';
import type { AppState, Model, RelationLayer, RelationSet, Target } from '../types';
import type { Stage } from './stage';

const HUB_RADIUS = 15;
const SPOKE_SEGMENTS = 6;
const ARC_SEGMENTS = 24;
const FLOW_SPEED = 90; // world units per second
/** Sets at most this large mark all their members as related when one member is the target. */
const RELATED_SET_MAX = 12;
/** Layers with at most this many hubs get text labels beside each hub. */
const LABEL_MAX_HUBS = 20;
const LABEL_HEIGHT = 58; // world units

const labelCache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/** A pill-shaped text label texture (cached by text + colour). */
function labelTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${color}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const px = 44;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `600 ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + px;
  canvas.width = w;
  canvas.height = Math.round(px * 1.6);
  ctx.font = `600 ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  const r = canvas.height / 2;
  ctx.fillStyle = 'rgba(11, 15, 24, 0.82)';
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, canvas.height - 2, r);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f0efec';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const out = { texture, aspect: w / canvas.height };
  labelCache.set(key, out);
  return out;
}

/** What a drawn segment belongs to, for picking and highlighting. */
interface SegRef {
  target: Target;
  /** Elements this segment touches (spoke: the member; arc: both ends). */
  zs: number[];
}

interface HubRef {
  target: Target;
  members: number[];
}

interface LayerMesh {
  layer: RelationLayer;
  lines: LineSegments2;
  material: LineMaterial;
  segRefs: SegRef[];
  /** Segment index ranges per SegRef group (start, count) to rebuild highlight overlays. */
  segRanges: { ref: SegRef; start: number; count: number }[];
  positions: Float32Array;
  colors: Float32Array;
  hubs: THREE.InstancedMesh | null;
  hubRefs: HubRef[];
  flow: boolean;
}

function anchor(model: Model, z: number): Vec3 {
  const c = model.layout.cells.get(z)!;
  return anchorOf(c.column, c.period);
}

function setHub(model: Model, set: Pick<RelationSet, 'members' | 'anchor'>, depth: number): Vec3 {
  if (set.anchor !== undefined) {
    const c = model.layout.cells.get(set.anchor)!;
    const r = RADIUS * (1 - depth);
    const t = angleOfColumn(c.column);
    return [r * Math.sin(t), yOfPeriod(c.period), r * Math.cos(t)];
  }
  return hubPoint(set.members.map((z) => anchor(model, z)), depth);
}

/** Straight spoke sampled into a few segments (so dashes and fog behave like arcs). */
function spokePoints(a: Vec3, b: Vec3, n = SPOKE_SEGMENTS): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/** The relation framework inside the cylinder: one line mesh (+ hub spheres) per visible layer. */
export class Framework {
  readonly group = new THREE.Group();
  private meshes: LayerMesh[] = [];
  private overlay: LineSegments2 | null = null;
  private overlayMaterial = new LineMaterial({ linewidth: 3.4, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  private hubGeo = new THREE.SphereGeometry(1, 18, 12);
  private flowOffset = 0;
  private dimmed = false;

  constructor(private stage: Stage) {
    stage.scene.add(this.group);
    stage.onResize((w, h) => {
      for (const m of this.meshes) m.material.resolution.set(w, h);
      this.overlayMaterial.resolution.set(w, h);
    });
    this.overlayMaterial.resolution.set(stage.width, stage.height);
    stage.onFrame((dt) => this.tick(dt));
  }

  get visibleLayerCount(): number {
    return this.meshes.length;
  }

  rebuild(model: Model, state: AppState): void {
    this.clear();
    for (const layer of model.layers) {
      if (!state.layers[layer.id]?.on) continue;
      const mesh = this.buildLayer(model, state, layer);
      if (mesh) this.meshes.push(mesh);
    }
    this.stage.invalidate();
  }

  private clear(): void {
    for (const m of this.meshes) {
      m.lines.geometry.dispose();
      m.material.dispose();
      m.hubs?.dispose();
      (m.hubs?.material as THREE.Material | undefined)?.dispose();
    }
    for (const child of this.group.children) {
      if (child instanceof THREE.Sprite) child.material.dispose(); // textures stay cached
    }
    this.meshes = [];
    this.group.clear();
    this.clearOverlay();
  }

  private buildLayer(model: Model, state: AppState, layer: RelationLayer): LayerMesh | null {
    const style = layer.style ?? {};
    const depth = style.hubDepth ?? 0.45;
    const bow = style.bow ?? 0.6;
    const pos: number[] = [];
    const col: number[] = [];
    const segRanges: LayerMesh['segRanges'] = [];
    const hubs: { at: Vec3; color: THREE.Color; ref: HubRef; label: string; css: string }[] = [];
    const tmp = new THREE.Color();

    const pushPolyline = (pts: Vec3[], color: string, ref: SegRef) => {
      tmp.set(color);
      const start = pos.length / 6;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        col.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
      }
      segRanges.push({ ref, start, count: pts.length - 1 });
    };

    const addSet = (set: { members: number[]; anchor?: number; label: string }, color: string, target: Target): Vec3 => {
      const hub = setHub(model, set, depth);
      for (const m of set.members) {
        if (m === set.anchor) continue;
        pushPolyline(spokePoints(hub, anchor(model, m)), color, { target, zs: [m] });
      }
      hubs.push({ at: hub, color: new THREE.Color(color), ref: { target, members: set.members }, label: set.label, css: color });
      return hub;
    };

    for (const item of layer.items) {
      if (!isItemVisible(state, layer.id, item.id)) continue;
      const color = item.color ?? layer.color;
      if (item.kind === 'set') {
        if (item.members.length === 0) continue;
        addSet(item, color, { kind: 'hub', layerId: layer.id, itemId: item.id });
      } else if (item.kind === 'edges') {
        item.edges.forEach((e, edgeIndex) => {
          if (!model.layout.cells.has(e.a) || !model.layout.cells.has(e.b)) return;
          const pts = arcPoints(anchor(model, e.a), anchor(model, e.b), bow, ARC_SEGMENTS);
          pushPolyline(pts, color, { target: { kind: 'edge', layerId: layer.id, itemId: item.id, edgeIndex }, zs: [e.a, e.b] });
        });
      } else {
        let prev: Vec3 | null = null;
        for (const s of item.sets) {
          if (s.members.length === 0) continue;
          const target: Target = { kind: 'hub', layerId: layer.id, itemId: item.id, setId: s.id };
          const hub = addSet(s, color, target);
          if (prev) pushPolyline(arcPoints(prev, hub, 0.15, 12), color, { target, zs: [] });
          prev = hub;
        }
      }
    }
    if (pos.length === 0 && hubs.length === 0) return null;

    const flow = !!style.flow;
    const material = new LineMaterial({
      linewidth: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
      dashed: flow,
      dashSize: 34,
      gapSize: 22,
    });
    material.resolution.set(this.stage.width, this.stage.height);
    const positions = new Float32Array(pos);
    const colors = new Float32Array(col);
    const geometry = new LineSegmentsGeometry();
    if (positions.length) {
      geometry.setPositions(positions);
      geometry.setColors(colors);
    }
    const lines = new LineSegments2(geometry, material);
    if (flow && positions.length) lines.computeLineDistances();
    this.group.add(lines);

    let hubMesh: THREE.InstancedMesh | null = null;
    if (hubs.length) {
      const hubMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, fog: true });
      hubMesh = new THREE.InstancedMesh(this.hubGeo, hubMat, hubs.length);
      const m = new THREE.Matrix4();
      const scale = HUB_RADIUS * (style.hubScale ?? 1);
      hubs.forEach((hub, i) => {
        m.makeScale(scale, scale, scale).setPosition(hub.at[0], hub.at[1], hub.at[2]);
        hubMesh!.setMatrixAt(i, m);
        hubMesh!.setColorAt(i, hub.color);
      });
      hubMesh.instanceMatrix.needsUpdate = true;
      if (hubMesh.instanceColor) hubMesh.instanceColor.needsUpdate = true;
      hubMesh.computeBoundingSphere();
      this.group.add(hubMesh);
      if (hubs.length <= LABEL_MAX_HUBS) {
        for (const hub of hubs) {
          const { texture, aspect } = labelTexture(hub.label, hub.css);
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: true }));
          sprite.scale.set(LABEL_HEIGHT * aspect, LABEL_HEIGHT, 1);
          sprite.center.set(-0.12, 0.5);
          sprite.position.set(hub.at[0], hub.at[1], hub.at[2]);
          sprite.renderOrder = 3;
          this.group.add(sprite);
        }
      }
    }

    return {
      layer, lines, material, segRefs: segRanges.map((r) => r.ref), segRanges, positions, colors,
      hubs: hubMesh, hubRefs: hubs.map((hb) => hb.ref), flow,
    };
  }

  private clearOverlay(): void {
    if (this.overlay) {
      this.overlay.geometry.dispose();
      this.group.remove(this.overlay);
      this.overlay = null;
    }
  }

  /**
   * Emphasise the framework around a target: segments touching an element, all spokes of a hub,
   * or one edge. Returns the elements that the emphasised segments connect to the target.
   */
  highlight(target: Target | null): Set<number> {
    this.clearOverlay();
    const related = new Set<number>();
    const pick: { mesh: LayerMesh; start: number; count: number }[] = [];
    if (target) {
      for (const mesh of this.meshes) {
        for (const r of mesh.segRanges) {
          if (matches(r.ref, target)) pick.push({ mesh, start: r.start, count: r.count });
        }
        if (target.kind === 'element') {
          for (const hub of mesh.hubRefs) {
            if (hub.members.includes(target.z) && hub.members.length <= RELATED_SET_MAX) hub.members.forEach((z) => related.add(z));
          }
          for (const r of mesh.segRanges) {
            if (r.ref.target.kind === 'edge' && r.ref.zs.includes(target.z)) r.ref.zs.forEach((z) => related.add(z));
          }
        } else {
          for (const r of mesh.segRanges) if (matches(r.ref, target)) r.ref.zs.forEach((z) => related.add(z));
        }
      }
    }
    if (target?.kind === 'element') related.delete(target.z);
    this.dimmed = pick.length > 0;
    for (const m of this.meshes) m.material.opacity = this.dimmed ? 0.32 : 0.85;
    if (pick.length) {
      const pos: number[] = [];
      const col: number[] = [];
      for (const p of pick) {
        const a = p.start * 6;
        const b = (p.start + p.count) * 6;
        for (let i = a; i < b; i++) pos.push(p.mesh.positions[i]!);
        for (let i = a; i < b; i++) col.push(Math.min(1, p.mesh.colors[i]! * 0.6 + 0.45));
      }
      const geo = new LineSegmentsGeometry().setPositions(pos);
      geo.setColors(col);
      this.overlay = new LineSegments2(geo, this.overlayMaterial);
      this.overlay.renderOrder = 2;
      this.group.add(this.overlay);
    }
    this.stage.invalidate();
    return related;
  }

  /** Hubs first (small, deliberate targets), then line segments within a few pixels. */
  pick(raycaster: THREE.Raycaster): Target | null {
    const hubMeshes = this.meshes.filter((m) => m.hubs);
    let best: { d: number; t: Target } | null = null;
    for (const m of hubMeshes) {
      const hits = raycaster.intersectObject(m.hubs!, false);
      const hit = hits[0];
      if (hit && hit.instanceId !== undefined && (!best || hit.distance < best.d)) best = { d: hit.distance, t: m.hubRefs[hit.instanceId]!.target };
    }
    if (best) return best.t;
    raycaster.params.Line2 = { threshold: 5 };
    for (const m of this.meshes) {
      if (!m.positions.length) continue;
      const hits = raycaster.intersectObject(m.lines, false);
      const hit = hits[0];
      const seg = hit?.faceIndex;
      if (!hit || seg === undefined || seg === null) continue;
      const range = m.segRanges.find((r) => seg >= r.start && seg < r.start + r.count);
      if (range && (!best || hit.distance < best.d)) best = { d: hit.distance, t: range.ref.target };
    }
    return best?.t ?? null;
  }

  private tick(dt: number): boolean {
    const flowing = this.meshes.some((m) => m.flow);
    if (!flowing || dt <= 0) return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    this.flowOffset -= FLOW_SPEED * dt;
    for (const m of this.meshes) if (m.flow) m.material.dashOffset = this.flowOffset;
    return true;
  }
}

function matches(ref: SegRef, target: Target): boolean {
  const t = ref.target;
  switch (target.kind) {
    case 'element':
      return ref.zs.includes(target.z);
    case 'hub':
      return t.kind === 'hub' && t.layerId === target.layerId && t.itemId === target.itemId && t.setId === target.setId && ref.zs.length > 0;
    case 'edge':
      return t.kind === 'edge' && t.layerId === target.layerId && t.itemId === target.itemId && t.edgeIndex === target.edgeIndex;
    default:
      return false;
  }
}
