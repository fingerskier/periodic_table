import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
  angleOfColumn, HEADER_HEIGHT, HEADER_Y, RADIUS, TILE_HEIGHT, TILE_WIDTH, WALL_BOTTOM, WALL_TOP, yOfPeriod,
} from '../layout/cylinder';
import type { Layout } from '../types';
import type { Stage } from './stage';
import type { TileColors } from './tiles';

/**
 * WebGL half of the wall: the inside faces of the tiles (visible only on the far side, through
 * the translucent front), rim rings and a faint axis. Tile text lives in the CSS3D layer.
 */
export class Wall {
  readonly group = new THREE.Group();
  private panels = new Map<number, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  private rimMaterial: LineMaterial;

  constructor(private stage: Stage, layout: Layout) {
    const geo = new THREE.PlaneGeometry(TILE_WIDTH, TILE_HEIGHT);
    for (const cell of layout.cells.values()) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.4, side: THREE.BackSide, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      this.panels.set(cell.z, mesh);
      this.group.add(mesh);
    }
    this.setLayout(layout);

    this.rimMaterial = new LineMaterial({ color: 0x5a6680, linewidth: 1.2, transparent: true, opacity: 0.55, depthWrite: false });
    const rimPos: number[] = [];
    const ring = (y: number, r: number) => {
      const n = 128;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        rimPos.push(r * Math.sin(a0), y, r * Math.cos(a0), r * Math.sin(a1), y, r * Math.cos(a1));
      }
    };
    ring(WALL_TOP, RADIUS * 0.995);
    ring(WALL_BOTTOM, RADIUS * 0.995);
    ring(HEADER_Y + HEADER_HEIGHT / 2 + 8, RADIUS * 0.995);
    const rimGeo = new LineSegmentsGeometry().setPositions(rimPos);
    this.group.add(new LineSegments2(rimGeo, this.rimMaterial));

    const axisMat = new LineMaterial({ color: 0x3a4660, linewidth: 1, transparent: true, opacity: 0.5, dashed: true, dashSize: 24, gapSize: 18, depthWrite: false });
    const axis = new LineSegments2(new LineSegmentsGeometry().setPositions([0, WALL_BOTTOM, 0, 0, HEADER_Y, 0]), axisMat);
    axis.computeLineDistances();
    this.group.add(axis);

    stage.scene.add(this.group);
    stage.onResize((w, h) => {
      this.rimMaterial.resolution.set(w, h);
      axisMat.resolution.set(w, h);
    });
    this.rimMaterial.resolution.set(stage.width, stage.height);
    axisMat.resolution.set(stage.width, stage.height);
  }

  setLayout(layout: Layout): void {
    for (const cell of layout.cells.values()) {
      const mesh = this.panels.get(cell.z)!;
      const t = angleOfColumn(cell.column);
      const r = RADIUS * 0.998;
      mesh.position.set(r * Math.sin(t), yOfPeriod(cell.period), r * Math.cos(t));
      mesh.rotation.set(0, t, 0);
    }
    this.stage.invalidate();
  }

  applyColors(colors: ReadonlyMap<number, TileColors>, opacity: number): void {
    for (const [z, mesh] of this.panels) {
      const c = colors.get(z);
      if (!c) continue;
      mesh.material.color.set(c.fill);
      mesh.material.opacity = 0.18 + 0.4 * opacity;
    }
    this.stage.invalidate();
  }

  /** Dim far-wall panels to match the CSS tiles' state. */
  applyDim(dimmed: ReadonlySet<number> | null, opacity: number): void {
    for (const [z, mesh] of this.panels) {
      const base = 0.18 + 0.4 * opacity;
      mesh.material.opacity = dimmed && dimmed.has(z) ? base * 0.3 : base;
    }
    this.stage.invalidate();
  }
}
