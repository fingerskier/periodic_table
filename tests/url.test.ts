import { describe, expect, it } from 'vitest';
import { symbolOf, z } from '../src/data/symbols';
import { applyHash, formatHash, parseHash } from '../src/url';
import type { AppState } from '../src/types';

const base: AppState = {
  hover: null,
  pinned: null,
  layers: { periods: { on: true, hiddenItems: [] }, diagonal: { on: false, hiddenItems: [] }, decay: { on: false, hiddenItems: [] } },
  colorMode: 'category',
  convention: 'Lu',
  wallOpacity: 0.86,
  autoRotate: true,
  trendProp: 'ie1',
  legendFocus: null,
};

const toZ = (s: string) => {
  try { return z(s); } catch { return undefined; }
};

describe('url hash state', () => {
  it('parses element, layers, colour mode and convention', () => {
    const h = parseHash('#el=Fe&layers=diagonal,decay&color=en&g3=La', toZ);
    expect(h).toEqual({ pinned: { kind: 'element', z: 26 }, layers: ['diagonal', 'decay'], colorMode: 'en', convention: 'La' });
  });

  it('accepts atomic numbers and ignores junk', () => {
    expect(parseHash('#el=92', toZ).pinned).toEqual({ kind: 'element', z: 92 });
    expect(parseHash('#el=Xx&color=rainbow&g3=Sc', toZ)).toEqual({});
    expect(parseHash('#el=200', toZ)).toEqual({});
  });

  it('round-trips through formatHash', () => {
    const s = applyHash(base, parseHash('#el=U&layers=decay&color=density&g3=La', toZ));
    expect(s.layers.periods!.on).toBe(false);
    expect(s.layers.decay!.on).toBe(true);
    const again = parseHash(formatHash(s, symbolOf), toZ);
    expect(again).toEqual({ pinned: { kind: 'element', z: 92 }, layers: ['decay'], colorMode: 'density', convention: 'La' });
  });

  it('keeps defaults out of the hash', () => {
    expect(formatHash(base, symbolOf)).toBe('#layers=periods');
  });

  it('handles column and period pins', () => {
    expect(parseHash('#col=31', toZ).pinned).toEqual({ kind: 'column', column: 31 });
    expect(parseHash('#period=6', toZ).pinned).toEqual({ kind: 'period', period: 6 });
    expect(parseHash('#period=8', toZ).pinned).toBeUndefined();
  });
});
