import './style.css';
import { BY_SYMBOL } from './data/elements';
import { symbolOf } from './data/symbols';
import { buildModel } from './model';
import { SceneApp } from './scene/app';
import { createStore, initialState } from './state';
import type { UiContext } from './types';
import { mountFilters } from './ui/filters';
import { mountInspector } from './ui/inspector';
import { mountLegend } from './ui/legend';
import { mountSearch } from './ui/search';
import { mountToolbar } from './ui/toolbar';
import { applyHash, formatHash, parseHash } from './url';

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const fromHash = parseHash(location.hash, (s) => BY_SYMBOL.get(s)?.z);
const start = applyHash({ ...initialState(buildModel('Lu').layers), autoRotate: !reduceMotion }, fromHash);
// A shared link opens on its selection, so don't spin it away.
if (start.pinned) start.autoRotate = false;
const store = createStore(start);

const scene = new SceneApp(document.getElementById('stage')!, store);
if (start.pinned?.kind === 'element') scene.faceElement(start.pinned.z);
else if (start.pinned?.kind === 'column') scene.faceColumn(start.pinned.column);

const ctx: UiContext = {
  store,
  // Built from the store (memoised per convention) so panels never see a stale model while the
  // scene is still swapping its own in the same notification.
  model: () => buildModel(store.get().convention),
  focusElement: (z) => scene.focusElement(z),
  focusColumn: (column) => scene.faceColumn(column),
  resetView: () => scene.resetView(),
};

const mount = (id: string, fn: (root: HTMLElement, c: UiContext) => void) => {
  const el = document.getElementById(id);
  if (el) fn(el, ctx);
};
mount('inspector', mountInspector);
mount('filters', mountFilters);
mount('legend', mountLegend);
mount('search', mountSearch);
mount('toolbar', mountToolbar);

// Keep the URL shareable without flooding history.
let hashTimer = 0;
store.subscribe((s, prev) => {
  if (s.pinned === prev.pinned && s.layers === prev.layers && s.colorMode === prev.colorMode && s.convention === prev.convention) return;
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const next = formatHash(store.get(), symbolOf);
    if (next !== location.hash) history.replaceState(null, '', next);
  }, 250);
});

// The usage hint retires after the first real interaction.
const hint = document.getElementById('hint');
const retire = () => hint?.classList.add('is-gone');
document.getElementById('stage')?.addEventListener('pointerdown', retire, { once: true });
store.subscribe((s, prev) => { if (s.pinned && !prev.pinned) retire(); });

// Debug/test handle (used by scripts/e2e.mjs).
(window as unknown as { __pc: unknown }).__pc = { store, scene };
