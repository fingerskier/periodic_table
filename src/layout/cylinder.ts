import { COLUMN_COUNT, PERIOD_COUNT } from './table';

// World units: one unit renders as one CSS pixel on a CSS3D tile at the reference depth.
// Axis = +Y, angle θ = 0 faces the default camera (+Z), θ grows to the viewer's right.

export const RADIUS = 1000;
export const COLUMN_ANGLE = (2 * Math.PI) / COLUMN_COUNT;
/** Widest flat tile that fits a 32-gon facet is 2R·tan(π/32) ≈ 197; leave a visible gap. */
export const TILE_WIDTH = 182;
export const TILE_HEIGHT = 208;
export const ROW_PITCH = 226;
export const HEADER_HEIGHT = 84;
export const HEADER_GAP = 26;
/** Spokes and arcs start just inside the wall so they emerge from behind the tile. */
export const ANCHOR_RADIUS = RADIUS * 0.965;

export function angleOfColumn(column: number): number {
  return (column - 0.5) * COLUMN_ANGLE;
}

/** Height of a period's row centre; period 4 sits at y = 0. */
export function yOfPeriod(period: number): number {
  return ((PERIOD_COUNT + 1) / 2 - period) * ROW_PITCH;
}

export const WALL_TOP = yOfPeriod(1) + ROW_PITCH / 2;
export const WALL_BOTTOM = yOfPeriod(PERIOD_COUNT) - ROW_PITCH / 2;
export const HEADER_Y = WALL_TOP + HEADER_GAP + HEADER_HEIGHT / 2;

export type Vec3 = [number, number, number];

/** Point on (or inside, for r < RADIUS) the cylinder at a column's angle. */
export function wallPoint(column: number, y: number, r = RADIUS): Vec3 {
  const t = angleOfColumn(column);
  return [r * Math.sin(t), y, r * Math.cos(t)];
}

/** Where a cell's spokes/arcs attach: tile centre, just inside the wall. */
export function anchorOf(column: number, period: number): Vec3 {
  return wallPoint(column, yOfPeriod(period), ANCHOR_RADIUS);
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  const t = (2 * Math.PI);
  let x = ((a + Math.PI) % t + t) % t - Math.PI;
  if (x === -Math.PI) x = Math.PI;
  return x;
}

/** Yaw (cylinder rotation about +Y) that brings `column` to face the camera, nearest to `currentYaw`. */
export function yawToFace(column: number, currentYaw: number): number {
  const target = -angleOfColumn(column);
  return currentYaw + wrapAngle(target - currentYaw);
}

/** Inward-pulled centroid used as a set's hub. depth 0 = on the wall, 1 = on the axis. */
export function hubPoint(points: readonly Vec3[], depth: number): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  let x = 0, y = 0, zz = 0;
  for (const p of points) { x += p[0]; y += p[1]; zz += p[2]; }
  x /= points.length; y /= points.length; zz /= points.length;
  const k = 1 - Math.min(1, Math.max(0, depth));
  return [x * k, y, zz * k];
}

/**
 * Quadratic Bézier from a to b whose control point is the chord midpoint pulled toward the axis
 * by `bow` (0 = straight chord, 1 = control point on the axis). Returns `segments + 1` points.
 */
export function arcPoints(a: Vec3, b: Vec3, bow: number, segments = 20): Vec3[] {
  const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const k = 1 - Math.min(1, Math.max(0, bow));
  const c: Vec3 = [m[0] * k, m[1], m[2] * k];
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
    ]);
  }
  return out;
}

/**
 * Silhouette of a vertical cylinder seen from a camera at horizontal distance `d` from the axis
 * (d > R): the tangent points sit at x = ±R·√(1 − (R/d)²), z = R²/d in the camera's frame.
 */
export function silhouette(d: number, r = RADIUS): { x: number; z: number } {
  if (d <= r) return { x: r, z: 0 };
  const ratio = r / d;
  return { x: r * Math.sqrt(1 - ratio * ratio), z: (r * r) / d };
}
