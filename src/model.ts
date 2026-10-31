import { buildColumns, buildPeriods } from './data/columns';
import { BY_SYMBOL, BY_Z, ELEMENTS } from './data/elements';
import { buildLayout } from './layout/table';
import { buildLayers } from './relations';
import type { Group3Convention, Model } from './types';

const cache = new Map<Group3Convention, Model>();

/** Everything derived from the dataset for one group-3 convention (memoised). */
export function buildModel(convention: Group3Convention): Model {
  const hit = cache.get(convention);
  if (hit) return hit;
  const layout = buildLayout(convention);
  const ctx = { elements: ELEMENTS, byZ: BY_Z, layout };
  const model: Model = {
    elements: ELEMENTS,
    byZ: BY_Z,
    bySymbol: BY_SYMBOL,
    layout,
    columns: buildColumns(layout, BY_Z),
    periods: buildPeriods(layout, BY_Z),
    layers: buildLayers(ctx),
  };
  cache.set(convention, model);
  return model;
}
