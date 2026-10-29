import { describe, expect, it } from 'vitest';
import { Controls } from '../src/scene/controls';
import { DEFAULT_VIEW, PITCH_LIMITS, ZOOM_LIMITS, type FrameHook, type View } from '../src/scene/stage';

/** Just enough of Stage for Controls: a clamped view and a frame-hook list. */
function fakeStage() {
  const hooks: FrameHook[] = [];
  const view: View = { ...DEFAULT_VIEW };
  const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));
  const host = { addEventListener() {}, classList: { add() {}, remove() {} } };
  const stage = {
    host, view, width: 800, height: 600,
    onFrame: (fn: FrameHook) => hooks.push(fn),
    setView(v: Partial<View>) {
      if (v.azimuth !== undefined) view.azimuth = v.azimuth;
      if (v.pitch !== undefined) view.pitch = clamp(v.pitch, PITCH_LIMITS);
      if (v.zoom !== undefined) view.zoom = clamp(v.zoom, ZOOM_LIMITS);
    },
  };
  const step = (seconds: number) => {
    let changed = false;
    for (let t = 0; t < seconds; t += 1 / 60) for (const fn of hooks) if (fn(1 / 60, t * 1000)) changed = true;
    return changed;
  };
  return { stage, view, step };
}

const handlers = { onClick() {}, onPointer() {}, onPointerLeave() {}, onDragStart() {}, onDragEnd() {}, onUserMotion() {} };

describe('Controls animation targets', () => {
  it('settles at the zoom limit instead of chasing an unreachable target', () => {
    const { stage, view, step } = fakeStage();
    const c = new Controls(stage as never, handlers);
    c.autoRotate = false;
    for (let i = 0; i < 12; i++) c.zoomBy(1.15);
    step(3);
    expect(view.zoom).toBeCloseTo(ZOOM_LIMITS[1]);
    expect(step(0.1)).toBe(false); // nothing left to animate, so no forced redraws
    c.zoomBy(1 / 1.15); // reversing responds immediately
    step(3);
    expect(view.zoom).toBeCloseTo(ZOOM_LIMITS[1] / 1.15);
  });

  it('settles at the pitch limits', () => {
    const { stage, view, step } = fakeStage();
    const c = new Controls(stage as never, handlers);
    c.autoRotate = false;
    for (let i = 0; i < 30; i++) c.tilt(0.12);
    step(3);
    expect(view.pitch).toBeCloseTo(PITCH_LIMITS[1]);
    expect(step(0.1)).toBe(false);
    for (let i = 0; i < 30; i++) c.tilt(-0.12);
    step(3);
    expect(view.pitch).toBeCloseTo(PITCH_LIMITS[0]);
  });
});
