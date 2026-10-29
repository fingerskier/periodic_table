import { describe, expect, it } from 'vitest';
import { Controls } from '../src/scene/controls';
import { DEFAULT_VIEW, PITCH_LIMITS, ZOOM_LIMITS, type FrameHook, type View } from '../src/scene/stage';

type Listener = (ev: Record<string, unknown>) => void;

/** Just enough of Stage for Controls: a clamped view, frame hooks and a host that records listeners. */
function fakeStage(maxZoom: number = ZOOM_LIMITS[1]) {
  const hooks: FrameHook[] = [];
  const listeners = new Map<string, Listener>();
  const view: View = { ...DEFAULT_VIEW };
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const captured = new Set<number>();
  const host = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    classList: { add() {}, remove() {} },
    setPointerCapture: (id: number) => captured.add(id),
    releasePointerCapture: (id: number) => captured.delete(id),
    hasPointerCapture: (id: number) => captured.has(id),
  };
  const stage = {
    host, view, width: 800, height: 600,
    onFrame: (fn: FrameHook) => hooks.push(fn),
    setView(v: Partial<View>) {
      if (v.azimuth !== undefined) view.azimuth = v.azimuth;
      if (v.pitch !== undefined) view.pitch = clamp(v.pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]);
      if (v.zoom !== undefined) view.zoom = clamp(v.zoom, ZOOM_LIMITS[0], maxZoom);
    },
  };
  const step = (seconds: number) => {
    let changed = false;
    for (let t = 0; t < seconds; t += 1 / 60) for (const fn of hooks) if (fn(1 / 60, t * 1000)) changed = true;
    return changed;
  };
  const fire = (type: string, ev: Record<string, unknown>) => listeners.get(type)?.({ preventDefault() {}, ...ev });
  return { stage, view, step, fire };
}

function controls(stage: unknown) {
  const calls = { clicks: 0, leaves: 0, dragEnds: 0 };
  const c = new Controls(stage as never, {
    onClick: () => { calls.clicks++; },
    onPointer() {},
    onPointerLeave: () => { calls.leaves++; },
    onDragStart() {},
    onDragEnd: () => { calls.dragEnds++; },
    onUserMotion() {},
  });
  c.autoRotate = false;
  return { c, calls };
}

const mouse = (type: string, x: number, y: number, buttons = 1) => ({ pointerId: 1, pointerType: 'mouse', button: 0, buttons, clientX: x, clientY: y, type });

describe('Controls animation targets', () => {
  it('settles at the zoom limit instead of chasing an unreachable target', () => {
    const { stage, view, step } = fakeStage();
    const { c } = controls(stage);
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
    const { c } = controls(stage);
    for (let i = 0; i < 30; i++) c.tilt(0.12);
    step(3);
    expect(view.pitch).toBeCloseTo(PITCH_LIMITS[1]);
    expect(step(0.1)).toBe(false);
    for (let i = 0; i < 30; i++) c.tilt(-0.12);
    step(3);
    expect(view.pitch).toBeCloseTo(PITCH_LIMITS[0]);
  });

  it('drops a goal the stage clamps dynamically (camera kept outside the cylinder)', () => {
    const { stage, view, step } = fakeStage(1.5);
    const { c } = controls(stage);
    c.animateTo({ zoom: 2.2 });
    step(2);
    expect(view.zoom).toBeCloseTo(1.5);
    expect(step(0.1)).toBe(false);
  });

  it('wheel zoom keeps a rotation that is under way', () => {
    const { stage, view, step, fire } = fakeStage();
    const { c } = controls(stage);
    c.animateTo({ azimuth: 2 });
    step(0.05);
    fire('wheel', { deltaY: -100, deltaMode: 0 });
    step(3);
    expect(view.azimuth).toBeCloseTo(2);
  });
});

describe('Controls pointer handling', () => {
  it('a press released where the stage never saw it does not leave a sticky drag', () => {
    const { stage, view, fire } = fakeStage();
    controls(stage);
    fire('pointerdown', mouse('pointerdown', 100, 100));
    fire('pointermove', mouse('pointermove', 140, 100)); // drag starts
    // ...the release happened elsewhere; the next event is a plain hover with no buttons down.
    fire('pointermove', mouse('pointermove', 300, 100, 0));
    const before = view.azimuth;
    fire('pointermove', mouse('pointermove', 500, 100, 0));
    expect(view.azimuth).toBe(before);
  });

  it('a second finger ends a one-finger drag cleanly', () => {
    const { stage, fire } = fakeStage();
    const { c, calls } = controls(stage);
    const touch = (id: number, x: number, type: string) => ({ pointerId: id, pointerType: 'touch', button: 0, buttons: 1, clientX: x, clientY: 100, type });
    fire('pointerdown', touch(1, 100, 'pointerdown'));
    fire('pointermove', touch(1, 150, 'pointermove'));
    expect(c.isDragging).toBe(true);
    fire('pointerdown', touch(2, 300, 'pointerdown'));
    expect(c.isDragging).toBe(false);
    expect(calls.dragEnds).toBe(1);
  });

  it('a lifted touch stops hovering', () => {
    const { stage, fire } = fakeStage();
    const { c, calls } = controls(stage);
    const touch = (type: string) => ({ pointerId: 7, pointerType: 'touch', button: 0, buttons: 1, clientX: 50, clientY: 60, type });
    fire('pointerdown', touch('pointerdown'));
    fire('pointerup', touch('pointerup'));
    expect(c.pointer).toBeNull();
    expect(calls.leaves).toBe(1);
    expect(calls.clicks).toBe(1);
  });
});
