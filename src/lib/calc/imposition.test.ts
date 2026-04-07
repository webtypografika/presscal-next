import { describe, it, expect } from 'vitest';
import { fitCount, printable, internalBleed } from './imposition';
import type { PrintableArea } from './imposition';

describe('fitCount (trim-based)', () => {
  it('returns 0 if trim + 2*bleed > available', () => {
    // trimSize=150, bleed=0, need 150 in 100 → 0
    expect(fitCount(100, 150, 0, 0)).toBe(0);
  });

  it('returns 0 if trimSize is 0', () => {
    expect(fitCount(100, 0, 0, 0)).toBe(0);
  });

  it('fits exactly one trim with bleed', () => {
    // available=106, trim=100, bleed=3 → need 2*3+100=106 → fits 1
    expect(fitCount(106, 100, 3, 0)).toBe(1);
  });

  it('fits multiple trims without gutter', () => {
    // available=306, trim=100, bleed=3 → need 2*3+N*100+(N-1)*0
    // N=1: 106, N=2: 206, N=3: 306 → fits 3
    expect(fitCount(306, 100, 3, 0)).toBe(3);
  });

  it('fits trims with gutter', () => {
    // available=300, trim=100, bleed=3, gutter=10
    // need: 6 + N*100 + (N-1)*10
    // N=1: 106, N=2: 216, N=3: 326 > 300 → fits 2
    expect(fitCount(300, 100, 3, 10)).toBe(2);
  });

  it('fits trims on SRA3 paper (real-world scenario)', () => {
    // SRA3 printable: 310x440, A4 trim: 210x297, bleed=3
    // Width: 6 + 210 = 216 → fits 1
    expect(fitCount(310, 210, 3, 0)).toBe(1);
    // Height: 6 + N*210 → N=1: 216, N=2: 426 → fits 2
    expect(fitCount(440, 210, 3, 0)).toBe(2);
  });
});

describe('internalBleed', () => {
  it('returns 0 when gutter=0 (μονοτομή)', () => {
    expect(internalBleed(0, 3)).toBe(0);
  });

  it('returns gutter/2 when gutter < 2*bleed', () => {
    expect(internalBleed(4, 3)).toBe(2);
  });

  it('returns full bleed when gutter >= 2*bleed', () => {
    expect(internalBleed(6, 3)).toBe(3);
    expect(internalBleed(10, 3)).toBe(3);
  });
});

describe('printable', () => {
  it('calculates printable area', () => {
    const area: PrintableArea = {
      paperW: 320,
      paperH: 450,
      marginTop: 5,
      marginBottom: 5,
      marginLeft: 5,
      marginRight: 5,
    };
    const { w, h } = printable(area);
    expect(w).toBe(310);
    expect(h).toBe(440);
  });

  it('handles zero margins', () => {
    const area: PrintableArea = {
      paperW: 297,
      paperH: 420,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    };
    const { w, h } = printable(area);
    expect(w).toBe(297);
    expect(h).toBe(420);
  });

  it('handles asymmetric margins', () => {
    const area: PrintableArea = {
      paperW: 320,
      paperH: 450,
      marginTop: 10,
      marginBottom: 5,
      marginLeft: 8,
      marginRight: 7,
    };
    const { w, h } = printable(area);
    expect(w).toBe(305);
    expect(h).toBe(435);
  });
});
