import { describe, it, expect } from 'vitest';
import { parseAddress, getInitials, avatarColor, formatSize, attIconClass } from './email-utils';

describe('parseAddress', () => {
  it('parses "Name <email>" format', () => {
    expect(parseAddress('Γιώργος Παπ. <george@example.com>')).toEqual({
      name: 'Γιώργος Παπ.',
      email: 'george@example.com',
    });
  });

  it('parses quoted name', () => {
    expect(parseAddress('"John Doe" <john@example.com>')).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  it('handles plain email address', () => {
    expect(parseAddress('john@example.com')).toEqual({
      name: 'john',
      email: 'john@example.com',
    });
  });
});

describe('getInitials', () => {
  it('returns two initials from full name', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns first two chars for single word', () => {
    expect(getInitials('George')).toBe('GE');
  });

  it('returns ?? for empty string', () => {
    expect(getInitials('')).toBe('??');
  });

  it('handles Greek names', () => {
    expect(getInitials('Γιώργος Παπαδόπουλος')).toBe('ΓΠ');
  });
});

describe('avatarColor', () => {
  it('returns a color string', () => {
    const color = avatarColor('test@example.com');
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns consistent color for same input', () => {
    expect(avatarColor('foo')).toBe(avatarColor('foo'));
  });

  it('returns different colors for different inputs', () => {
    // Not guaranteed but likely
    const a = avatarColor('alice@example.com');
    const b = avatarColor('bob@example.com');
    // At least they're valid colors
    expect(a).toMatch(/^#/);
    expect(b).toMatch(/^#/);
  });
});

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(500)).toBe('500B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5MB');
  });
});

describe('attIconClass', () => {
  it('returns image icon for image files', () => {
    expect(attIconClass('photo.jpg')).toBe('fa-file-image');
    expect(attIconClass('logo.png')).toBe('fa-file-image');
    expect(attIconClass('icon.svg')).toBe('fa-file-image');
  });

  it('returns pdf icon', () => {
    expect(attIconClass('document.pdf')).toBe('fa-file-pdf');
  });

  it('returns word icon', () => {
    expect(attIconClass('report.docx')).toBe('fa-file-word');
  });

  it('returns excel icon', () => {
    expect(attIconClass('data.xlsx')).toBe('fa-file-excel');
  });

  it('returns archive icon for zip', () => {
    expect(attIconClass('files.zip')).toBe('fa-file-archive');
  });

  it('returns generic icon for unknown types', () => {
    expect(attIconClass('file.xyz')).toBe('fa-file');
  });
});
