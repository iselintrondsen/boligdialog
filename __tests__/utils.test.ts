/**
 * Tests for pure utility functions used across the app.
 * No React Native dependencies — runs in plain Node/Jest.
 */

// ─── leaseDuration ────────────────────────────────────────────────────────────

function leaseDuration(start: string, end: string | null): string {
  const from = new Date(start);
  const to = end ? new Date(end) : new Date();
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (months === 0) return '< 1 mnd';
  if (years === 0) return `${rem} mnd`;
  if (rem === 0) return `${years} år`;
  return `${years} år ${rem} mnd`;
}

describe('leaseDuration', () => {
  it('returns "< 1 mnd" when start and end are the same month', () => {
    expect(leaseDuration('2024-01-01', '2024-01-15')).toBe('< 1 mnd');
  });

  it('returns months only when less than 12 months', () => {
    expect(leaseDuration('2024-01-01', '2024-07-01')).toBe('6 mnd');
  });

  it('returns years only when evenly divisible', () => {
    expect(leaseDuration('2022-01-01', '2024-01-01')).toBe('2 år');
  });

  it('returns years and months for mixed durations', () => {
    expect(leaseDuration('2022-01-01', '2024-04-01')).toBe('2 år 3 mnd');
  });

  it('handles null end date (open lease) without throwing', () => {
    // We only check it does not throw and returns a string
    const result = leaseDuration('2020-01-01', null);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── isImage ──────────────────────────────────────────────────────────────────

function isImage(name: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|tiff|tif|svg)$/i.test(name);
}

describe('isImage', () => {
  it.each([
    'photo.jpg', 'PHOTO.JPG', 'image.jpeg', 'icon.png',
    'anim.gif', 'pic.webp', 'iphone.heic', 'raw.heif',
    'bitmap.bmp', 'scan.tiff', 'scan.tif', 'logo.svg',
  ])('returns true for %s', (name) => {
    expect(isImage(name)).toBe(true);
  });

  it.each([
    'contract.pdf', 'report.docx', 'data.xlsx', 'readme.txt', 'archive.zip',
  ])('returns false for %s', (name) => {
    expect(isImage(name)).toBe(false);
  });
});

// ─── fmtDate ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('nb-NO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

describe('fmtDate', () => {
  it('formats an ISO date string to Norwegian locale', () => {
    const result = fmtDate('2024-06-15');
    // nb-NO format: 15.06.2024
    expect(result).toMatch(/15/);
    expect(result).toMatch(/06/);
    expect(result).toMatch(/2024/);
  });

  it('does not throw for valid ISO dates', () => {
    expect(() => fmtDate('2020-01-01')).not.toThrow();
    expect(() => fmtDate('2099-12-31')).not.toThrow();
  });
});
