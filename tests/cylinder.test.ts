import { describe, expect, it } from 'vitest';
import {
  angleOfColumn, arcPoints, azimuthToFace, COLUMN_ANGLE, hubPoint, RADIUS, silhouette, TILE_WIDTH, wallPoint, wrapAngle, yOfPeriod,
} from '../src/layout/cylinder';

describe('cylinder geometry', () => {
  it('spaces 32 columns evenly around the full circle', () => {
    expect(COLUMN_ANGLE * 32).toBeCloseTo(2 * Math.PI);
    expect(angleOfColumn(32) - angleOfColumn(1)).toBeCloseTo(31 * COLUMN_ANGLE);
  });

  it('fits flat tiles inside a 32-gon facet', () => {
    expect(TILE_WIDTH).toBeLessThan(2 * RADIUS * Math.tan(Math.PI / 32));
  });

  it('centres period 4 at y = 0 with period 1 on top', () => {
    expect(yOfPeriod(4)).toBe(0);
    expect(yOfPeriod(1)).toBeGreaterThan(yOfPeriod(7));
  });

  it('puts wall points on the radius', () => {
    const [x, , zz] = wallPoint(9, 0);
    expect(Math.hypot(x, zz)).toBeCloseTo(RADIUS);
  });

  it('wraps angles into (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it('finds the nearest camera azimuth that faces a column', () => {
    for (const c of [1, 8, 17, 32]) {
      const az = azimuthToFace(c, 10);
      expect(Math.abs(az - 10)).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.cos(angleOfColumn(c) - az)).toBeCloseTo(1);
    }
  });

  it('pulls a full ring hub onto the axis and a column hub inward', () => {
    const ring = Array.from({ length: 32 }, (_, i) => wallPoint(i + 1, 50));
    const h = hubPoint(ring, 0.5);
    expect(Math.hypot(h[0], h[2])).toBeLessThan(1e-9);
    expect(h[1]).toBeCloseTo(50);
    const col = [wallPoint(5, 0), wallPoint(5, 100)];
    const hc = hubPoint(col, 0.5);
    expect(Math.hypot(hc[0], hc[2])).toBeCloseTo(RADIUS / 2);
  });

  it('draws arcs that start/end on the endpoints and bow inward', () => {
    const a = wallPoint(3, 0), b = wallPoint(4, 0);
    const pts = arcPoints(a, b, 0.6, 10);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual(a);
    expect(pts[10]![0]).toBeCloseTo(b[0]);
    const mid = pts[5]!;
    expect(Math.hypot(mid[0], mid[2])).toBeLessThan(RADIUS * 0.8);
  });

  it('computes tangent silhouette points', () => {
    const s = silhouette(2 * RADIUS);
    expect(s.x).toBeCloseTo(RADIUS * Math.sqrt(3) / 2);
    expect(s.z).toBeCloseTo(RADIUS / 2);
  });
});
