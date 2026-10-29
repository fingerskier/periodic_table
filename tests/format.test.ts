import { describe, expect, it } from 'vitest';
import {
  capitalize,
  formatCompact,
  formatMass,
  formatNumber,
  formatOxidationStates,
  formatPropValue,
  formatSigned,
  formatTemperature,
  formatYear,
  ionLabel,
  MINUS,
  NO_VALUE,
  superscriptConfig,
  toSuperscript,
  UNIT_SPACE as U,
  withUnit,
} from '../src/ui/format';

describe('toSuperscript', () => {
  it('maps digits and signs, passing other characters through', () => {
    expect(toSuperscript('0123456789')).toBe('⁰¹²³⁴⁵⁶⁷⁸⁹');
    expect(toSuperscript('-12')).toBe('⁻¹²');
    expect(toSuperscript(`${MINUS}3+`)).toBe('⁻³⁺');
    expect(toSuperscript('ab')).toBe('ab');
  });
});

describe('superscriptConfig', () => {
  it('superscripts subshell occupancies', () => {
    expect(superscriptConfig('[Ar] 3d6 4s2')).toBe('[Ar] 3d⁶ 4s²');
    expect(superscriptConfig('[Rn] 5f14 6d10 7s2 7p6')).toBe('[Rn] 5f¹⁴ 6d¹⁰ 7s² 7p⁶');
    expect(superscriptConfig('1s2 2s2 2p6')).toBe('1s² 2s² 2p⁶');
  });

  it('writes the implicit single electron of a bare subshell', () => {
    expect(superscriptConfig('1s')).toBe('1s¹');
    expect(superscriptConfig('[He] 2s')).toBe('[He] 2s¹');
    expect(superscriptConfig('[He] 2s2 2p')).toBe('[He] 2s² 2p¹');
  });

  it('leaves noble-gas cores, words and already-formatted text alone', () => {
    expect(superscriptConfig('[Xe]')).toBe('[Xe]');
    expect(superscriptConfig('[Ar] 3d⁶ 4s²')).toBe('[Ar] 3d⁶ 4s²');
    expect(superscriptConfig(superscriptConfig('[Kr] 4d10 5s1'))).toBe('[Kr] 4d¹⁰ 5s¹');
    expect(superscriptConfig('[Rn] 7s2 7p6 (predicted)')).toBe('[Rn] 7s² 7p⁶ (predicted)');
  });
});

describe('formatMass', () => {
  it('shows standard atomic weights as published', () => {
    expect(formatMass({ mass: 55.845, massIsMassNumber: false })).toBe('55.845');
    expect(formatMass({ mass: 30.973761998, massIsMassNumber: false })).toBe('30.973761998');
    expect(formatMass({ mass: 1.008, massIsMassNumber: false })).toBe('1.008');
  });

  it('drops floating-point noise', () => {
    expect(formatMass({ mass: 28.000000000000004, massIsMassNumber: false })).toBe('28');
  });

  it('brackets mass numbers', () => {
    expect(formatMass({ mass: 98, massIsMassNumber: true })).toBe('[98]');
    expect(formatMass({ mass: 294, massIsMassNumber: true })).toBe('[294]');
  });
});

describe('formatTemperature', () => {
  it('gives kelvin and whole-degree Celsius', () => {
    expect(formatTemperature(1811)).toBe(`1811${U}K (1538${U}°C)`);
  });

  it('keeps up to two kelvin decimals, trimmed', () => {
    expect(formatTemperature(1811.15)).toBe(`1811.15${U}K (1538${U}°C)`);
    expect(formatTemperature(234.321)).toBe(`234.32${U}K (${MINUS}39${U}°C)`);
    expect(formatTemperature(13.989999999999952)).toBe(`13.99${U}K (${MINUS}259${U}°C)`);
    expect(formatTemperature(4.2)).toBe(`4.2${U}K (${MINUS}269${U}°C)`);
  });

  it('never prints a negative zero', () => {
    expect(formatTemperature(273.15)).toBe(`273.15${U}K (0${U}°C)`);
    expect(formatTemperature(272.9)).toBe(`272.9${U}K (0${U}°C)`);
  });

  it('shows a dash for missing values', () => {
    expect(formatTemperature(null)).toBe(NO_VALUE);
    expect(formatTemperature(Number.NaN)).toBe(NO_VALUE);
  });
});

describe('formatNumber', () => {
  it('uses four significant figures by default, trimmed', () => {
    expect(formatNumber(7.9024681)).toBe('7.902');
    expect(formatNumber(13.598434599702)).toBe('13.6');
    expect(formatNumber(7.87, { unit: 'g/cm³' })).toBe(`7.87${U}g/cm³`);
  });

  it('honours digits and trim', () => {
    expect(formatNumber(7.9024681, { digits: 3, trim: false })).toBe('7.90');
    expect(formatNumber(0.79, { digits: 3, trim: false })).toBe('0.790');
    expect(formatNumber(0.79, { digits: 3 })).toBe('0.79');
  });

  it('honours fixed decimals', () => {
    expect(formatNumber(2.2, { decimals: 2, trim: false })).toBe('2.20');
    expect(formatNumber(7.9024681, { decimals: 3, unit: 'eV' })).toBe(`7.902${U}eV`);
    expect(formatNumber(28.000000000000004, { decimals: 0, unit: 'pm' })).toBe(`28${U}pm`);
    expect(formatNumber(5, { decimals: 3 })).toBe('5');
  });

  it('keeps integer parts whole instead of rounding them away', () => {
    expect(formatNumber(1811.15, { digits: 3 })).toBe('1811');
    expect(formatNumber(999.7, { digits: 3 })).toBe('1000');
    expect(formatNumber(9999.7, { digits: 4 })).toBe(`10${U}000`);
  });

  it('groups five-digit integers with narrow no-break spaces', () => {
    expect(formatNumber(28200, { digits: 3 })).toBe(`28${U}200`);
    expect(formatNumber(5828)).toBe('5828');
  });

  it('uses a true minus sign', () => {
    expect(formatNumber(-0.5, { unit: 'eV' })).toBe(`${MINUS}0.5${U}eV`);
    expect(formatNumber(-19.7, { decimals: 3 })).toBe(`${MINUS}19.7`);
    expect(formatNumber(-1234567)).toBe(`${MINUS}1.235${U}×${U}10⁶`);
  });

  it('switches to scientific notation for tiny and huge magnitudes', () => {
    expect(formatNumber(8.2e-5, { unit: 'g/cm³' })).toBe(`8.2${U}×${U}10⁻⁵${U}g/cm³`);
    expect(formatNumber(0.000164)).toBe(`1.64${U}×${U}10⁻⁴`);
    expect(formatNumber(1234567)).toBe(`1.235${U}×${U}10⁶`);
    expect(formatNumber(9.9999e6, { digits: 3 })).toBe(`1${U}×${U}10⁷`);
    expect(formatNumber(9.9999e-4, { digits: 3 })).toBe(`1${U}×${U}10⁻³`);
    expect(formatNumber(999990, { digits: 3 })).toBe(`999${U}990`);
    expect(formatNumber(0.001145)).toBe('0.001145');
  });

  it('prints zero plainly and never as negative zero', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-0.004, { decimals: 2 })).toBe('0');
    expect(formatNumber(-0.004, { decimals: 2, trim: false })).toBe('0.00');
  });

  it('shows a dash for missing values', () => {
    expect(formatNumber(null)).toBe(NO_VALUE);
    expect(formatNumber(undefined, { unit: 'pm' })).toBe(NO_VALUE);
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe(NO_VALUE);
  });
});

describe('withUnit', () => {
  it('appends a unit after a narrow no-break space', () => {
    expect(withUnit('5', 'pm')).toBe(`5${U}pm`);
    expect(withUnit('5', '')).toBe('5');
    expect(withUnit('5', undefined)).toBe('5');
  });
});

describe('signs, oxidation states and ions', () => {
  it('formats signed integers', () => {
    expect(formatSigned(3)).toBe('+3');
    expect(formatSigned(-2)).toBe(`${MINUS}2`);
    expect(formatSigned(0)).toBe('0');
  });

  it('formats oxidation states in the given order with a true minus', () => {
    expect(formatOxidationStates([-3, 3, 5])).toBe('−3, +3, +5');
    expect(formatOxidationStates([2, 3])).toBe('+2, +3');
    expect(formatOxidationStates([0])).toBe('0');
    expect(formatOxidationStates([])).toBe('');
  });

  it('writes ion labels with superscript charges', () => {
    expect(ionLabel('O', -2)).toBe('O²⁻');
    expect(ionLabel('Na', 1)).toBe('Na⁺');
    expect(ionLabel('Cl', -1)).toBe('Cl⁻');
    expect(ionLabel('Fe', 3)).toBe('Fe³⁺');
    expect(ionLabel('Ar', 0)).toBe('Ar');
  });
});

describe('formatCompact', () => {
  it('uses scientific notation from ten thousand up', () => {
    expect(formatCompact(1234567)).toBe(`1.23${U}×${U}10⁶`);
    expect(formatCompact(56300)).toBe(`5.63${U}×${U}10⁴`);
    expect(formatCompact(461000)).toBe(`4.61${U}×${U}10⁵`);
    expect(formatCompact(1e6)).toBe(`1${U}×${U}10⁶`);
  });

  it('uses scientific notation below a hundredth', () => {
    expect(formatCompact(0.008)).toBe(`8${U}×${U}10⁻³`);
    expect(formatCompact(1e-9)).toBe(`1${U}×${U}10⁻⁹`);
  });

  it('prints mid-range values plainly with three significant figures', () => {
    expect(formatCompact(1400)).toBe('1400');
    expect(formatCompact(20)).toBe('20');
    expect(formatCompact(2.8)).toBe('2.8');
    expect(formatCompact(0.015)).toBe('0.015');
    expect(formatCompact(1.23456)).toBe('1.23');
  });

  it('handles zero and missing values', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(null)).toBe(NO_VALUE);
  });
});

describe('formatYear', () => {
  it('names antiquity for null and marks BCE years', () => {
    expect(formatYear(null)).toBe('Antiquity');
    expect(formatYear(1766)).toBe('1766');
    expect(formatYear(-3000)).toBe('3000 BCE');
  });
});

describe('formatPropValue', () => {
  it('uses three significant figures with trailing zeros and the property unit', () => {
    expect(formatPropValue('ie1', 7.9024681)).toBe(`7.90${U}eV`);
    expect(formatPropValue('en', 0.79)).toBe('0.790');
    expect(formatPropValue('mp', 1811.15)).toBe(`1811${U}K`);
    expect(formatPropValue('density', 8.2e-5)).toBe(`8.20${U}×${U}10⁻⁵${U}g/cm³`);
  });

  it('special-cases years and abundances', () => {
    expect(formatPropValue('discoveryYear', 1898)).toBe('1898');
    expect(formatPropValue('abundanceCrust', 56300)).toBe(`5.63${U}×${U}10⁴${U}mg/kg`);
  });

  it('shows a dash for missing values', () => {
    expect(formatPropValue('ie1', null)).toBe(NO_VALUE);
  });
});

describe('capitalize', () => {
  it('upper-cases the first letter only', () => {
    expect(capitalize('siderophile')).toBe('Siderophile');
    expect(capitalize('')).toBe('');
  });
});
