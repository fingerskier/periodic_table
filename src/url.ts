import type { AppState, ColorMode, Group3Convention, Target } from './types';

// Shareable view state in the URL hash, e.g. #el=Fe&layers=diagonal,decay&color=en&g3=La
// Unknown or malformed parts are ignored, so old links degrade gracefully.

const COLOR_MODES: readonly string[] = [
  'category', 'block', 'phase', 'mass', 'en', 'ie1', 'ea', 'atomicRadius', 'covalentRadius', 'vdwRadius',
  'mp', 'bp', 'density', 'discoveryYear', 'abundanceCrust',
];

export interface HashState {
  pinned?: Target;
  layers?: string[];
  colorMode?: ColorMode;
  convention?: Group3Convention;
}

export function parseHash(hash: string, symbolToZ: (s: string) => number | undefined): HashState {
  const out: HashState = {};
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const el = params.get('el');
  if (el) {
    const z = /^\d+$/.test(el) ? Number(el) : symbolToZ(el);
    if (z !== undefined && z >= 1 && z <= 118) out.pinned = { kind: 'element', z };
  }
  const col = params.get('col');
  if (!out.pinned && col && /^\d+$/.test(col) && +col >= 1 && +col <= 32) out.pinned = { kind: 'column', column: +col };
  const per = params.get('period');
  if (!out.pinned && per && /^[1-7]$/.test(per)) out.pinned = { kind: 'period', period: +per };
  const layers = params.get('layers');
  if (layers !== null) out.layers = layers.split(',').filter(Boolean);
  const color = params.get('color');
  if (color && COLOR_MODES.includes(color)) out.colorMode = color as ColorMode;
  const g3 = params.get('g3');
  if (g3 === 'La' || g3 === 'Lu') out.convention = g3;
  return out;
}

export function formatHash(s: AppState, zToSymbol: (z: number) => string): string {
  const params = new URLSearchParams();
  const p = s.pinned;
  if (p?.kind === 'element') params.set('el', zToSymbol(p.z));
  else if (p?.kind === 'column') params.set('col', String(p.column));
  else if (p?.kind === 'period') params.set('period', String(p.period));
  const on = Object.entries(s.layers).filter(([, t]) => t.on).map(([id]) => id);
  params.set('layers', on.join(','));
  if (s.colorMode !== 'category') params.set('color', s.colorMode);
  if (s.convention !== 'Lu') params.set('g3', s.convention);
  return `#${params.toString().replace(/%2C/g, ',')}`;
}

/** Apply parsed hash state onto an initial state (layers listed in the hash are on, all others off). */
export function applyHash(s: AppState, h: HashState): AppState {
  const next = { ...s };
  if (h.pinned) next.pinned = h.pinned;
  if (h.colorMode) next.colorMode = h.colorMode;
  if (h.convention) next.convention = h.convention;
  if (h.layers) {
    const wanted = new Set(h.layers);
    next.layers = Object.fromEntries(Object.entries(s.layers).map(([id, t]) => [id, { ...t, on: wanted.has(id) }]));
  }
  return next;
}
