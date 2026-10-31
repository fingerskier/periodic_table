import type { BuildContext, LayerBuilder, RelationLayer } from '../types';
import { blocksLayer, categoriesLayer, groupsLayer, periodsLayer } from './structural';
import { diagonalLayer, knightsMoveLayer, lanthanideTwinsLayer, nPlus10Layer } from './chemistry';
import { isoelectronicLayer } from './isoelectronic';
import { atomicNumberLayer, madelungLayer, pettiforLayer } from './sequences';
import { decaySeriesLayer } from './decay';
import { dobereinerLayer, mendeleevPredictionsLayer } from './history';
import { similarityLayer } from './similarity';

/** Display order: the filter panel groups by section in first-appearance order. */
export const LAYER_BUILDERS: readonly LayerBuilder[] = [
  periodsLayer,
  groupsLayer,
  blocksLayer,
  categoriesLayer,
  diagonalLayer,
  nPlus10Layer,
  knightsMoveLayer,
  lanthanideTwinsLayer,
  isoelectronicLayer,
  atomicNumberLayer,
  madelungLayer,
  decaySeriesLayer,
  pettiforLayer,
  dobereinerLayer,
  mendeleevPredictionsLayer,
  similarityLayer,
];

export function buildLayers(ctx: BuildContext): RelationLayer[] {
  return LAYER_BUILDERS.map((build) => build(ctx));
}
