import type { ElementData } from '../types';
import raw from './elements.json';

/** All 118 elements in atomic-number order. */
export const ELEMENTS: readonly ElementData[] = (raw as ElementData[]).slice().sort((a, b) => a.z - b.z);

export const BY_Z: ReadonlyMap<number, ElementData> = new Map(ELEMENTS.map((e) => [e.z, e]));

export const BY_SYMBOL: ReadonlyMap<string, ElementData> = new Map(ELEMENTS.map((e) => [e.symbol, e]));

export function element(z: number): ElementData {
  const e = BY_Z.get(z);
  if (!e) throw new Error(`No element with Z = ${z}`);
  return e;
}
