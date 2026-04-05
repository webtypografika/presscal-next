import { describe, it, expect } from 'vitest';
import { parseNumericInput, formatNumber, formatCurrency, cleanNumericValue } from './number';

describe('parseNumericInput', () => {
  it('returns empty for empty input', () => {
    expect(parseNumericInput('')).toBe('');
  });

  it('handles European format (dot=thousands, comma=decimal)', () => {
    expect(parseNumericInput('1.500,50')).toBe('1500.50');
  });

  it('handles US format (comma=thousands, dot=decimal)', () => {
    expect(parseNumericInput('1,500.50')).toBe('1500.50');
  });

  it('handles comma as decimal separator', () => {
    expect(parseNumericInput('0,5')).toBe('0.5');
    expect(parseNumericInput('12,75')).toBe('12.75');
  });

  it('handles dot as decimal separator', () => {
    expect(parseNumericInput('1500.5')).toBe('1500.5');
  });

  it('handles integer input', () => {
    expect(parseNumericInput('1500')).toBe('1500');
  });

  it('handles comma with 3 digits after (ambiguous)', () => {
    // In Greek context, treated as decimal
    expect(parseNumericInput('1,000')).toBe('1.000');
  });
});

describe('formatNumber', () => {
  it('returns empty for null/undefined', () => {
    expect(formatNumber(null)).toBe('');
    expect(formatNumber(undefined)).toBe('');
    expect(formatNumber('')).toBe('');
  });

  it('returns empty for NaN', () => {
    expect(formatNumber('abc')).toBe('');
  });

  it('formats with Greek locale', () => {
    const result = formatNumber(1500.5, 2);
    // Greek locale uses comma as decimal separator
    expect(result).toContain(',');
  });

  it('formats integer', () => {
    const result = formatNumber(1000);
    expect(result).toBe('1.000');
  });
});

describe('formatCurrency', () => {
  it('returns empty for null', () => {
    expect(formatCurrency(null)).toBe('');
    expect(formatCurrency(undefined)).toBe('');
  });

  it('formats as EUR', () => {
    const result = formatCurrency(1500.5);
    expect(result).toContain('€');
  });
});

describe('cleanNumericValue', () => {
  it('replaces commas with dots', () => {
    expect(cleanNumericValue('1,5')).toBe('1.5');
    expect(cleanNumericValue('1,500,00')).toBe('1.500.00');
  });

  it('leaves dots unchanged', () => {
    expect(cleanNumericValue('1.5')).toBe('1.5');
  });
});
