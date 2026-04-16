import { describe, it, expect } from 'vitest';
import { buildJobFolderPath, toArchivePath, isArchivedPath, isQuoteSubfolder } from './job-folder';

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
    expect(result).toBe('D:\\Clients\\ASHRAE\\_01 Archive\\2026-0019 Posters A3');
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
    expect(result).toBe('D:\\Jobs\\_01 Archive\\[QT-2026-0019] ASHRAE - Posters A3');
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
  it('inserts _01 Archive before last segment (backslash)', () => {
    expect(toArchivePath('D:\\Clients\\ASHRAE\\2026-0019 Posters'))
      .toBe('D:\\Clients\\ASHRAE\\_01 Archive\\2026-0019 Posters');
  });

  it('inserts _01 Archive before last segment (forward slash)', () => {
    expect(toArchivePath('/home/jobs/2026-0019'))
      .toBe('/home/jobs/_01 Archive/2026-0019');
  });
});

describe('isArchivedPath', () => {
  it('recognises _01 Archive (current)', () => {
    expect(isArchivedPath('D:\\Clients\\ASHRAE\\_01 Archive\\2026-0019')).toBe(true);
  });
  it('recognises _Archive (legacy)', () => {
    expect(isArchivedPath('D:\\Jobs\\_Archive\\[QT-2026-0042]')).toBe(true);
  });
  it('rejects active path', () => {
    expect(isArchivedPath('D:\\Jobs\\[QT-2026-0019]')).toBe(false);
  });
});

describe('isQuoteSubfolder (safety: quote vs customer folder)', () => {
  it('rejects when candidate equals company folder', () => {
    expect(isQuoteSubfolder('D:\\Clients\\ASHRAE', 'D:\\Clients\\ASHRAE', 'QT-2026-0019')).toBe(false);
  });
  it('rejects case-insensitively', () => {
    expect(isQuoteSubfolder('d:\\clients\\ashrae', 'D:\\Clients\\ASHRAE', 'QT-2026-0019')).toBe(false);
  });
  it('accepts proper subfolder of company', () => {
    expect(isQuoteSubfolder('D:\\Clients\\ASHRAE\\2026-0019 Posters', 'D:\\Clients\\ASHRAE', 'QT-2026-0019')).toBe(true);
  });
  it('accepts global-mode path with quote number in basename', () => {
    expect(isQuoteSubfolder('D:\\Jobs\\[QT-2026-0036] Λιβανιος - Κάρτες', null, 'QT-2026-0036')).toBe(true);
  });
  it('accepts numeric-only quote-number match in basename', () => {
    expect(isQuoteSubfolder('/home/jobs/2026-0042 some title', null, 'QT-2026-0042')).toBe(true);
  });
  it('rejects path that has neither relation to company nor quote number', () => {
    expect(isQuoteSubfolder('D:\\Totally\\Unrelated\\Folder', 'D:\\Clients\\ASHRAE', 'QT-2026-0019')).toBe(false);
  });
});
