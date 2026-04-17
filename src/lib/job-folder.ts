// Job folder path builder
// Web app computes paths, FileHelper creates physical folders on disk

const ILLEGAL_CHARS = /[<>:"|?*\/\\]/g;

function sanitize(s: string): string {
  return s.replace(ILLEGAL_CHARS, '_').replace(/\s+/g, ' ').trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim();
}

interface BuildOpts {
  globalRoot: string | null;
  companyFolderPath: string | null;
  companyName: string;
  quoteNumber: string;      // "QT-2026-0019"
  quoteTitle: string | null;
  archive?: boolean;
}

/**
 * Compute the intended local folder path for a job.
 *
 * Two modes (automatic):
 *   - Customer mode: if company has folderPath → subfolder inside it
 *   - Global mode: if no company folder → subfolder inside globalRoot
 *
 * Returns null if no root path is available.
 */
export function buildJobFolderPath(opts: BuildOpts): string | null {
  const { globalRoot, companyFolderPath, companyName, quoteNumber, quoteTitle, archive } = opts;

  const title = sanitize(truncate(quoteTitle || 'Εργασία', 60));
  const company = sanitize(truncate(companyName || 'Πελάτης', 40));
  // Matches the PressKit archive folder convention (presscal-fh://archive-quote)
  const archiveSeg = '_01 Archive';

  if (companyFolderPath) {
    // Customer mode: {companyFolder}[\_01 Archive]\{shortNumber} {title}
    const short = quoteNumber.replace(/^[A-Z]+-?/i, ''); // "QT-2026-0019" → "2026-0019"
    const folderName = `${short} ${title}`;
    const root = archive ? `${companyFolderPath}\\${archiveSeg}` : companyFolderPath;
    return `${root}\\${folderName}`;
  }

  if (globalRoot) {
    // Global mode: {globalRoot}[\_01 Archive]\[{number}] {company} - {title}
    const folderName = `[${quoteNumber}] ${company} - ${title}`;
    const root = archive ? `${globalRoot}\\${archiveSeg}` : globalRoot;
    return `${root}\\${folderName}`;
  }

  return null; // No root configured
}

/**
 * Convert an active job folder path to its archive equivalent.
 * Uses the "_01 Archive" subfolder name to match PressKit.
 */
export function toArchivePath(activePath: string): string {
  const sep = activePath.includes('/') ? '/' : '\\';
  const parts = activePath.split(sep);
  const folderName = parts.pop()!;
  return [...parts, '_01 Archive', folderName].join(sep);
}

/**
 * Returns true if a path is already inside an archive subfolder.
 * Recognises both the current `_01 Archive` and the legacy `_Archive` naming.
 */
export function isArchivedPath(path: string): boolean {
  return /[\\/]_(?:01 )?Archive[\\/]/.test(path);
}

/**
 * Convert an archived job folder path back to its active (non-archive) equivalent.
 * Reverses `toArchivePath()` by removing the `_01 Archive` or `_Archive` segment.
 * Returns null if the path is not an archive path.
 */
export function fromArchivePath(archivedPath: string): string | null {
  const sep = archivedPath.includes('/') ? '/' : '\\';
  const re = /[\\/]_(?:01 )?Archive[\\/]/;
  if (!re.test(archivedPath)) return null;
  return archivedPath.replace(re, sep);
}

/**
 * Safety guard: verifies that `candidatePath` is a QUOTE subfolder, not a customer root.
 *
 * Required conditions (any one is enough):
 *   - Differs from the company folder path AND is strictly inside it, OR
 *   - Its basename contains the quote's numeric segment (e.g. "2026-0019" or "QT-2026-0019")
 *
 * Rejected: `candidatePath === companyFolderPath` (would archive the customer itself).
 */
export function isQuoteSubfolder(
  candidatePath: string,
  companyFolderPath: string | null,
  quoteNumber: string,
): boolean {
  if (!candidatePath) return false;

  // Normalize separators for comparison (Windows paths can be mixed)
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const cand = norm(candidatePath);
  const comp = companyFolderPath ? norm(companyFolderPath) : null;

  // Hard fail: exactly the company folder root
  if (comp && cand === comp) return false;

  // Hard pass: properly inside company folder (sep-separated)
  if (comp && cand.startsWith(comp + '/')) return true;

  // Basename must contain the quote number (full "QT-2026-0019" or numeric "2026-0019")
  const basename = candidatePath.split(/[\\/]/).filter(Boolean).pop() || '';
  if (!quoteNumber) return true; // can't verify — allow by default
  const numericOnly = quoteNumber.replace(/^[A-Z]+-?/i, '');
  return basename.includes(quoteNumber) || basename.includes(numericOnly);
}
