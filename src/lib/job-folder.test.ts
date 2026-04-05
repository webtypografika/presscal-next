import { describe, it, expect } from 'vitest';
import { buildJobFolderPath, toArchivePath } from './job-folder';

describe('buildJobFolderPath', () => {
  it('returns null when no root configured', () => {
    expect(buildJobFolderPath({
      globalRoot: null,
      companyFolderPath: null,
      companyName: 'ASHRAE',
      quoteNumber: 'QT-2026-0019',
      quoteTitle: 'Posters',
    })).toBeNull();
  });

  it('builds customer mode path', () => {
    const result = buildJobFolderPath({
      globalRoot: null,
      companyFolderPath: 'D:\\Clients\\ASHRAE',
      companyName: 'ASHRAE',
      quoteNumber: 'QT-2026-0019',
      quoteTitle: 'Posters A3',
    });
    expect(result).toBe('D:\\Clients\\ASHRAE\\2026-0019 Posters A3');
  });

  it('builds customer mode archive path', () => {
    const result = buildJobFolderPath({
      globalRoot: null,
      companyFolderPath: 'D:\\Clients\\ASHRAE',
      companyName: 'ASHRAE',
      quoteNumber: 'QT-2026-0019',
      quoteTitle: 'Posters A3',
      archive: true,
    });
    expect(result).toBe('D:\\Clients\\ASHRAE\\_Archive\\2026-0019 Posters A3');
  });

  it('builds global mode path', () => {
    const result = buildJobFolderPath({
      globalRoot: 'D:\\Jobs',
      companyFolderPath: null,
      companyName: 'ASHRAE',
      quoteNumber: 'QT-2026-0019',
      quoteTitle: 'Posters A3',
    });
    expect(result).toBe('D:\\Jobs\\[QT-2026-0019] ASHRAE - Posters A3');
  });

  it('builds global mode archive path', () => {
    const result = buildJobFolderPath({
      globalRoot: 'D:\\Jobs',
      companyFolderPath: null,
      companyName: 'ASHRAE',
      quoteNumber: 'QT-2026-0019',
      quoteTitle: 'Posters A3',
      archive: true,
    });
    expect(result).toBe('D:\\Jobs\\_Archive\\[QT-2026-0019] ASHRAE - Posters A3');
  });

  it('prefers customer path over global', () => {
    const result = buildJobFolderPath({
      globalRoot: 'D:\\Jobs',
      companyFolderPath: 'D:\\Clients\\ASHRAE',
      companyName: 'ASHRAE',
      quoteNumber: 'QT-2026-0019',
      quoteTitle: 'Test',
    });
    expect(result).toContain('D:\\Clients\\ASHRAE');
  });

  it('sanitizes illegal path characters', () => {
    const result = buildJobFolderPath({
      globalRoot: 'D:\\Jobs',
      companyFolderPath: null,
      companyName: 'Company "A"',
      quoteNumber: 'QT-2026-0001',
      quoteTitle: 'Title: Special?',
    });
    expect(result).not.toContain('"');
    expect(result).not.toContain('?');
    // Note: colon in "Title:" gets sanitized to "_" but "D:" drive letter stays
    expect(result).toContain('Company _A_');
    expect(result).toContain('Title_ Special_');
  });

  it('uses default title when null', () => {
    const result = buildJobFolderPath({
      globalRoot: 'D:\\Jobs',
      companyFolderPath: null,
      companyName: 'Test',
      quoteNumber: 'QT-2026-0001',
      quoteTitle: null,
    });
    expect(result).toContain('Εργασία');
  });
});

describe('toArchivePath', () => {
  it('inserts _Archive before last segment (backslash)', () => {
    expect(toArchivePath('D:\\Clients\\ASHRAE\\2026-0019 Posters'))
      .toBe('D:\\Clients\\ASHRAE\\_Archive\\2026-0019 Posters');
  });

  it('inserts _Archive before last segment (forward slash)', () => {
    expect(toArchivePath('/home/jobs/2026-0019'))
      .toBe('/home/jobs/_Archive/2026-0019');
  });
});
