import { describe, it, expect } from 'vitest';
import { fitCount, printable } from './imposition';
import type { PrintableArea } from './imposition';

describe('fitCount', () => {
  it('returns 0 if cellSize > available', () => {
    expect(fitCount(100, 150, 0)).toBe(0);
  });

  it('returns 0 if cellSize is 0', () => {
    expect(fitCount(100, 0, 0)).toBe(0);
  });

  it('fits exactly one cell', () => {
    expect(fitCount(100, 100, 0)).toBe(1);
  });

  it('fits multiple cells without gutter', () => {
    expect(fitCount(300, 100, 0)).toBe(3);
  });

  it('fits multiple cells with gutter', () => {
    // 300mm available, 100mm cell, 10mm gutter
    // 1st cell: 100mm, gap: 10mm, 2nd cell: 100mm = 210mm (fits in 300)
    // 3rd would need 210 + 10 + 100 = 320mm > 300mm → only 2
    expect(fitCount(300, 100, 10)).toBe(2);
  });

  it('fits cells on SRA3 paper (real-world scenario)', () => {
    // SRA3: 320x450, margins 5mm each → printable 310x440
    // A4 trimmed: 210x297 → with 3mm bleed: 216x303
    const printW = 310;
    const cellW = 216;
    expect(fitCount(printW, cellW, 0)).toBe(1);
    // Rotated A4: 303 wide
    expect(fitCount(440, 216, 0)).toBe(2);
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
