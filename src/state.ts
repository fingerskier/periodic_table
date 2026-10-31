import type { AppState, RelationLayer, Target } from './types';

export type Listener<T> = (state: T, prev: T) => void;

export interface Store<T> {
  get(): T;
  /** Shallow-merge a patch (or the result of a patch function) and notify if anything changed. */
  set(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(p) as (keyof T)[]) {
        if (!Object.is(state[k], p[k])) { changed = true; break; }
      }
      if (!changed) return;
      const prev = state;
      state = { ...state, ...p };
      for (const l of [...listeners]) l(state, prev);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function initialState(layers: readonly RelationLayer[]): AppState {
  return {
    hover: null,
    pinned: null,
    layers: Object.fromEntries(layers.map((l) => [l.id, { on: !!l.defaultOn, hiddenItems: [] }])),
    colorMode: 'category',
    convention: 'Lu',
    wallOpacity: 0.62,
    autoRotate: true,
    trendProp: 'ie1',
    legendFocus: null,
  };
}

/** The target the UI should describe: a pinned selection wins over transient hover. */
export function activeTarget(s: AppState): Target | null {
  return s.pinned ?? s.hover;
}

export function sameTarget(a: Target | null, b: Target | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'element': return a.z === (b as typeof a).z;
    case 'column': return a.column === (b as typeof a).column;
    case 'period': return a.period === (b as typeof a).period;
    case 'hub': {
      const o = b as typeof a;
      return a.layerId === o.layerId && a.itemId === o.itemId && a.setId === o.setId;
    }
    case 'edge': {
      const o = b as typeof a;
      return a.layerId === o.layerId && a.itemId === o.itemId && a.edgeIndex === o.edgeIndex;
    }
  }
}

export function isLayerOn(s: AppState, layerId: string): boolean {
  return !!s.layers[layerId]?.on;
}

export function isItemVisible(s: AppState, layerId: string, itemId: string): boolean {
  const t = s.layers[layerId];
  return !!t?.on && !t.hiddenItems.includes(itemId);
}

/** Immutable helpers for layer toggles (return a new `layers` record). */
export function withLayer(s: AppState, layerId: string, on: boolean): AppState['layers'] {
  const cur = s.layers[layerId] ?? { on: false, hiddenItems: [] };
  return { ...s.layers, [layerId]: { ...cur, on } };
}

export function withItem(s: AppState, layerId: string, itemId: string, visible: boolean): AppState['layers'] {
  const cur = s.layers[layerId] ?? { on: true, hiddenItems: [] };
  const hidden = new Set(cur.hiddenItems);
  if (visible) hidden.delete(itemId); else hidden.add(itemId);
  return { ...s.layers, [layerId]: { ...cur, hiddenItems: [...hidden] } };
}
