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
import { applyHash, formatHash, parseHash, type HashState } from './url';

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const toZ = (s: string) => BY_SYMBOL.get(s)?.z;
const start = applyHash({ ...initialState(buildModel('Lu').layers), autoRotate: !reduceMotion }, parseHash(location.hash, toZ));
// A shared link opens on its selection, so don't spin it away.
if (start.pinned) start.autoRotate = false;
const store = createStore(start);

const stageEl = document.getElementById('stage')!;
const scene = new SceneApp(stageEl, store);

/** Face whatever a link pinned. */
function facePinned(h: HashState): void {
  if (h.pinned?.kind === 'element') scene.faceElement(h.pinned.z);
  else if (h.pinned?.kind === 'column') scene.faceColumn(h.pinned.column);
}
facePinned(parseHash(location.hash, toZ));

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

// Keep the cylinder clear of the legend in the top-left corner (it folds and unfolds).
const legend = document.getElementById('legend');
if (legend) {
  const reserve = () => {
    const l = legend.getBoundingClientRect();
    const s = stageEl.getBoundingClientRect();
    scene.stage.setInsets({ top: l.height ? Math.max(0, l.bottom - s.top) : 0 });
  };
  new ResizeObserver(reserve).observe(legend);
  reserve();
}

// Keep the URL shareable without flooding history; a pasted or edited link applies in place.
let hashTimer = 0;
let writtenHash = location.hash;
store.subscribe((s, prev) => {
  if (s.pinned === prev.pinned && s.layers === prev.layers && s.colorMode === prev.colorMode && s.convention === prev.convention) return;
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const next = formatHash(store.get(), symbolOf);
    if (next !== location.hash) history.replaceState(null, '', next);
    writtenHash = location.hash;
  }, 250);
});
window.addEventListener('hashchange', () => {
  if (location.hash === writtenHash) return;
  window.clearTimeout(hashTimer);
  const h = parseHash(location.hash, toZ);
  const next = applyHash(store.get(), h);
  // The hash omits defaults, so absent fields mean the default, not "keep what is there".
  store.set({
    pinned: h.pinned ?? null,
    layers: next.layers,
    colorMode: h.colorMode ?? 'category',
    convention: h.convention ?? 'Lu',
    autoRotate: false,
  });
  facePinned(h);
  writtenHash = location.hash;
});

// Skip link: straight into the table's roving focus.
document.querySelector('.skip-link')?.addEventListener('click', (ev) => {
  ev.preventDefault();
  scene.focusTable();
});

// The usage hint retires after the first real interaction.
const hint = document.getElementById('hint');
const retire = () => hint?.classList.add('is-gone');
stageEl.addEventListener('pointerdown', retire, { once: true });
store.subscribe((s, prev) => { if (s.pinned && !prev.pinned) retire(); });

// Debug/test handle (used by scripts/e2e.mjs).
(window as unknown as { __pc: unknown }).__pc = { store, scene };
