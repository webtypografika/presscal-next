// PressCal Pro — PDF Export for Imposition
// Full port of mod_imposer.js export functions to TypeScript + pdf-lib
// Supports: N-Up, Booklet, PerfectBound, Cut&Stack, Work&Turn, GangRun, StepMulti

import {
  PDFDocument,
  PDFPage,
  PDFEmbeddedPage,
  rgb,
  cmyk,
  StandardFonts,
  PDFFont,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  degrees,
} from 'pdf-lib';

import type {
  ImpositionResult,
  BookletSignatureMap,
  StepBlock,
  GangRunData,
  CutStackPosition,
} from '@/types/calculator';

import { internalBleed } from './imposition';

// ─── Constants ───

const MM = 72 / 25.4; // mm → PDF points

function mmToPt(mm: number): number {
  return mm * MM;
}

/** Per-cell bleed for a grid cell: full `outer` on outer grid edges, `inner` on shared edges. */
function cellBleed(col: number, row: number, cols: number, rows: number, outer: number, inner: number) {
  return {
    bL: col === 0 ? outer : inner,
    bR: col === cols - 1 ? outer : inner,
    bT: row === 0 ? outer : inner,
    bB: row === rows - 1 ? outer : inner,
  };
}

/**
 * White-mask the non-bleed strip inside each internal gutter of a uniform grid.
 * `originX/Y` is the trim origin of the first cell. Masks span full paper.
 */
function drawUniformGutterMasks(
  page: PDFPage,
  originX: number, originY: number,
  cols: number, rows: number,
  trimWpt: number, trimHpt: number,
  gutterPt: number, bleedPt: number,
  paperWpt: number, paperHpt: number,
): void {
  if (gutterPt <= 0.1) return;
  const white = cmyk(0, 0, 0, 0);
  const intB = internalBleed(gutterPt, bleedPt);
  for (let gc = 0; gc < cols - 1; gc++) {
    const gx = originX + (gc + 1) * trimWpt + gc * gutterPt;
    const gutL = gx + intB;
    const gutR = gx + gutterPt - intB;
    if (gutR > gutL + 0.5) page.drawRectangle({ x: gutL, y: 0, width: gutR - gutL, height: paperHpt, color: white });
  }
  for (let gr = 0; gr < rows - 1; gr++) {
    const gy = originY + (gr + 1) * trimHpt + gr * gutterPt;
    const gutB = gy + intB;
    const gutT = gy + gutterPt - intB;
    if (gutT > gutB + 0.5) page.drawRectangle({ x: 0, y: gutB, width: paperWpt, height: gutT - gutB, color: white });
  }
}

/**
 * Draw embedded PDF page content into a cell, aligning source TrimBox 1:1 with
 * the target trim area. The asymmetric per-side bleed defines the clip extent
 * so adjacent cells never overlap into each other's trim.
 *
 * pdf-lib's embedPage already accounts for /Rotate on the source page — so
 * `rotDeg` here is ONLY the imposition-level rotation (cell/grid), never epSrcRot.
 */
function drawTrimToCell(
  page: PDFPage,
  epObj: EmbeddedPageInfo,
  trimX: number, trimY: number,
  trimWpt: number, trimHpt: number,
  bleeds: { bL: number; bR: number; bT: number; bB: number },
  rotDeg: number,
  contentScale: number,
): void {
  const rot = ((rotDeg % 360) + 360) % 360;
  const clipX = trimX - bleeds.bL;
  const clipY = trimY - bleeds.bB;
  const clipW = trimWpt + bleeds.bL + bleeds.bR;
  const clipH = trimHpt + bleeds.bT + bleeds.bB;
  page.pushOperators(pushGraphicsState(), rectangle(clipX, clipY, clipW, clipH), clip(), endPath());

  const epPg = epObj.page;
  const epRawW = epPg.width || trimWpt;
  const epRawH = epPg.height || trimHpt;
  const epTW = epObj.trimW || epRawW;
  const epTH = epObj.trimH || epRawH;
  const needsSwap = rot === 90 || rot === 270;
  const sx = (needsSwap ? (trimHpt / epTW) : (trimWpt / epTW)) * contentScale;
  const sy = (needsSwap ? (trimWpt / epTH) : (trimHpt / epTH)) * contentScale;
  // Trim offsets in output coords, position-invariant across contentScale.
  const tox = epObj.trimOffsetX * sx / contentScale;
  const toy = epObj.trimOffsetY * sy / contentScale;

  let drawX: number, drawY: number;
  if (rot === 0) { drawX = trimX - tox; drawY = trimY - toy; }
  else if (rot === 90) { drawX = trimX + trimWpt + toy; drawY = trimY - tox; }
  else if (rot === 180) { drawX = trimX + trimWpt + tox; drawY = trimY + trimHpt + toy; }
  else { drawX = trimX - toy; drawY = trimY + trimHpt + tox; }

  const opts: Parameters<PDFPage['drawPage']>[1] = { x: drawX, y: drawY, xScale: sx, yScale: sy };
  if (rot) opts.rotate = degrees(rot);
  page.drawPage(epPg, opts);
  page.pushOperators(popGraphicsState());
}

/** Strip non-WinAnsi characters (Greek etc) for pdf-lib StandardFonts */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7E\u00A0-\u00FF\u2014]/g, '');
}

// ─── Types ───

export interface ExportOptions {
  imposition: ImpositionResult;
  pdfBytes?: Uint8Array;           // source PDF bytes
  machineCat?: 'digital' | 'offset';
  machineName?: string;
  paperName?: string;
  jobDescription?: string;
  quoteNumber?: string;            // preferred filename prefix (e.g. "QT-2026-0001")
  jobW?: number;
  jobH?: number;
  bleed?: number;
  gutter?: number;
  contentScale?: number;  // % content scale (100 = 1:1, default)

  // Marks
  showCropMarks?: boolean;
  showRegistration?: boolean;      // offset only
  showColorBar?: boolean;
  colorBarType?: 'cmyk' | 'cmyk_tint50';
  colorBarEdge?: 'tail' | 'gripper';
  colorBarPdfBytes?: Uint8Array;   // color bar PDF content
  colorBarOffsetY?: number;
  colorBarScale?: number;           // % scale (default 100)
  showPlateSlug?: boolean;
  plateSlugEdge?: 'tail' | 'gripper';
  keepSourceMarks?: boolean;

  // Duplex
  isDuplex?: boolean;
  duplexOrient?: 'h2h' | 'h2f';

  // Mode-specific
  rotation?: number;

  // Booklet
  signatureMap?: BookletSignatureMap;
  creepPerSheet?: number[];

  // Cut & Stack
  stackPositions?: CutStackPosition[];
  fixedBackPdfBytes?: Uint8Array;
  fixedBackPage?: number;
  fixedBack?: boolean;
  numberingEnabled?: boolean;
  numberPrefix?: string;
  numberStartNum?: number;
  numberDigits?: number;
  numberFontSize?: number;
  numberColor?: string;
  numberFont?: 'Helvetica' | 'Courier';
  numberRotation?: number;
  numberPositions?: Record<number, { x: number; y: number }>;
  numberGlobalPos?: { x: number; y: number };
  cellOffsets?: Record<number, { x: number; y: number }>;
  csStackSize?: number;
  csGetStackNum?: (posIdx: number, ups: number) => number;

  // Gang Run
  gangData?: GangRunData;
  gangJobPdfBytes?: (Uint8Array | undefined)[];  // per-job PDF bytes (indexed by jobIdx)

  // Step Multi
  blocks?: StepBlock[];
  smBlockPdfBytes?: (Uint8Array | undefined)[];  // per-block PDF bytes

  // Work & Turn
  turnType?: 'turn' | 'tumble';

  // PDF page orientation info (for rotation detection)
  pdfPageSizes?: Array<{ trimW: number; trimH: number }>;

  // Source filename for export naming
  sourceFileName?: string;

  // Page range — comma-separated 1-based page indices to embed from source PDF (e.g. "1,5")
  pageRange?: string;
}

interface EmbeddedPageInfo {
  page: PDFEmbeddedPage;
  rotation: number;
  trimOffsetX: number;
  trimOffsetY: number;
  trimW: number;
  trimH: number;
}

interface DrawMarksOptions {
  font?: PDFFont;
  jobName?: string;
  foldLine?: boolean;
  colorBarPage?: PDFEmbeddedPage | null;
  skipCropMarks?: boolean;
  machineCat?: string;
  showPlateSlug?: boolean;
  plateSlugEdge?: string;
  colorBarEdge?: string;
  colorBarOffsetY?: number;
  colorBarScale?: number;
}

// ─── Parse Page Range ───
// Input: comma-separated 1-based page numbers (e.g. "1,5" or "3,7")
// Returns 0-based indices, or null if empty/invalid (= use all pages)
function parsePageRange(range?: string): number[] | null {
  if (!range || !range.trim()) return null;
  const indices = range.split(',')
    .map(s => parseInt(s.trim(), 10) - 1)
    .filter(n => !isNaN(n) && n >= 0);
  return indices.length > 0 ? indices : null;
}

// ─── Embed Source Pages ───

async function embedSourcePages(
  outputDoc: PDFDocument,
  sourceBytes: Uint8Array,
  mode: string,
  bleedMM: number,
  keepSourceMarks?: boolean,
  pageRange?: string,
): Promise<EmbeddedPageInfo[]> {
  const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const embedded: EmbeddedPageInfo[] = [];
  const bleedPt = bleedMM * MM;

  // Determine which pages to embed
  const selectedIndices = parsePageRange(pageRange);
  const pageIndices = selectedIndices
    ? selectedIndices.filter(i => i < srcPages.length)
    : srcPages.map((_, i) => i);

  for (const i of pageIndices) {
    const pg = srcPages[i];

    // Detect page /Rotate
    let rotation = 0;
    try { rotation = pg.getRotation().angle || 0; } catch { /* noop */ }

    // Read all PDF boxes
    const mediaBox = pg.getMediaBox();
    const cropBox = pg.getCropBox();

    let trimBox: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const tb = pg.getTrimBox();
      if (Math.abs(tb.width - mediaBox.width) > 0.5 || Math.abs(tb.height - mediaBox.height) > 0.5) {
        trimBox = tb;
      }
    } catch { /* noop */ }

    let bleedBox: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const bb = pg.getBleedBox();
      if (Math.abs(bb.width - mediaBox.width) > 0.5 || Math.abs(bb.height - mediaBox.height) > 0.5) {
        bleedBox = bb;
      }
    } catch { /* noop */ }

    let bounds: { left: number; bottom: number; right: number; top: number };
    let trimOffsetX = 0;
    let trimOffsetY = 0;
    let trimW: number;
    let trimH: number;

    if (mode === 'cropbox') {
      bounds = {
        left: cropBox.x, bottom: cropBox.y,
        right: cropBox.x + cropBox.width, top: cropBox.y + cropBox.height,
      };
      const cbt = trimBox || cropBox;
      trimOffsetX = cbt.x - cropBox.x;
      trimOffsetY = cbt.y - cropBox.y;
      trimW = cbt.width;
      trimH = cbt.height;
    } else if (mode === 'nup') {
      if (keepSourceMarks) {
        bounds = {
          left: cropBox.x, bottom: cropBox.y,
          right: cropBox.x + cropBox.width, top: cropBox.y + cropBox.height,
        };
        const cbtSrc = trimBox || cropBox;
        trimOffsetX = cbtSrc.x - cropBox.x;
        trimOffsetY = cbtSrc.y - cropBox.y;
        trimW = cbtSrc.width;
        trimH = cbtSrc.height;
      } else if (bleedBox && trimBox) {
        bounds = {
          left: bleedBox.x, bottom: bleedBox.y,
          right: bleedBox.x + bleedBox.width, top: bleedBox.y + bleedBox.height,
        };
        trimOffsetX = trimBox.x - bleedBox.x;
        trimOffsetY = trimBox.y - bleedBox.y;
        trimW = trimBox.width;
        trimH = trimBox.height;
      } else if (trimBox) {
        const synL = Math.max(cropBox.x, trimBox.x - bleedPt);
        const synB = Math.max(cropBox.y, trimBox.y - bleedPt);
        const synR = Math.min(cropBox.x + cropBox.width, trimBox.x + trimBox.width + bleedPt);
        const synT = Math.min(cropBox.y + cropBox.height, trimBox.y + trimBox.height + bleedPt);
        bounds = { left: synL, bottom: synB, right: synR, top: synT };
        trimOffsetX = trimBox.x - synL;
        trimOffsetY = trimBox.y - synB;
        trimW = trimBox.width;
        trimH = trimBox.height;
      } else if (bleedBox) {
        bounds = {
          left: bleedBox.x, bottom: bleedBox.y,
          right: bleedBox.x + bleedBox.width, top: bleedBox.y + bleedBox.height,
        };
        trimW = bleedBox.width;
        trimH = bleedBox.height;
      } else {
        bounds = {
          left: cropBox.x, bottom: cropBox.y,
          right: cropBox.x + cropBox.width, top: cropBox.y + cropBox.height,
        };
        trimW = cropBox.width;
        trimH = cropBox.height;
      }
    } else {
      // Booklet/PerfectBound/CutStack: include bleed content for proper imposition
      if (bleedBox && trimBox) {
        bounds = {
          left: bleedBox.x, bottom: bleedBox.y,
          right: bleedBox.x + bleedBox.width, top: bleedBox.y + bleedBox.height,
        };
        trimOffsetX = trimBox.x - bleedBox.x;
        trimOffsetY = trimBox.y - bleedBox.y;
        trimW = trimBox.width;
        trimH = trimBox.height;
      } else if (trimBox) {
        // Synthesize bleed bounds from trim + bleedPt
        const synL = Math.max(cropBox.x, trimBox.x - bleedPt);
        const synB = Math.max(cropBox.y, trimBox.y - bleedPt);
        const synR = Math.min(cropBox.x + cropBox.width, trimBox.x + trimBox.width + bleedPt);
        const synT = Math.min(cropBox.y + cropBox.height, trimBox.y + trimBox.height + bleedPt);
        bounds = { left: synL, bottom: synB, right: synR, top: synT };
        trimOffsetX = trimBox.x - synL;
        trimOffsetY = trimBox.y - synB;
        trimW = trimBox.width;
        trimH = trimBox.height;
      } else if (bleedBox) {
        bounds = {
          left: bleedBox.x, bottom: bleedBox.y,
          right: bleedBox.x + bleedBox.width, top: bleedBox.y + bleedBox.height,
        };
        trimW = bleedBox.width;
        trimH = bleedBox.height;
      } else {
        // No trim/bleed info — use cropBox as-is
        bounds = { left: cropBox.x, bottom: cropBox.y, right: cropBox.x + cropBox.width, top: cropBox.y + cropBox.height };
        trimW = cropBox.width;
        trimH = cropBox.height;
      }
    }

    const ep = await outputDoc.embedPage(pg, bounds);
    embedded.push({
      page: ep,
      rotation,
      trimOffsetX,
      trimOffsetY,
      trimW,
      trimH,
    });
  }
  return embedded;
}

// ─── Color Bar Embedder ───

const colorBarCache: Record<string, Uint8Array> = {};

async function prepareColorBar(
  outputDoc: PDFDocument,
  colorBarPdfBytes?: Uint8Array,
  colorBarType?: string,
): Promise<PDFEmbeddedPage | null> {
  let bytes = colorBarPdfBytes;
  // If no bytes provided, fetch from public folder
  if ((!bytes || bytes.length === 0) && colorBarType && colorBarType !== 'none') {
    const fileName = colorBarType === 'cmyk' ? 'ColorBar_CMYK_only.pdf' : 'ColorBar_CMYK_tint50.pdf';
    if (!colorBarCache[colorBarType]) {
      try {
        const resp = await fetch(`/colorbars/${fileName}`);
        if (resp.ok) {
          colorBarCache[colorBarType] = new Uint8Array(await resp.arrayBuffer());
        } else {
          console.warn(`Color bar fetch failed: ${resp.status} /colorbars/${fileName}`);
        }
      } catch (e) {
        console.warn('Color bar fetch error:', e);
      }
    }
    bytes = colorBarCache[colorBarType];
  }
  if (!bytes || bytes.length === 0) return null;
  try {
    const cbDoc = await PDFDocument.load(bytes);
    const embeddedPage = await outputDoc.embedPage(cbDoc.getPages()[0]);
    return embeddedPage;
  } catch (e) {
    console.warn('Color bar PDF not loaded:', e);
    return null;
  }
}

// ─── Draw Embedded Page Helper ───

function drawEmbeddedPage(
  page: PDFPage,
  epObj: EmbeddedPageInfo,
  x: number,
  y: number,
  targetW: number,
  targetH: number,
  rotateDeg?: number,
) {
  const ep = epObj.page;
  const srcRot = (360 - (epObj.rotation || 0)) % 360;
  const totalRot = ((srcRot || 0) + (rotateDeg || 0)) % 360;
  const epW = ep.width || targetW;
  const epH = ep.height || targetH;
  const scaleX = targetW / epW;
  const scaleY = targetH / epH;
  const opts: Parameters<PDFPage['drawPage']>[1] = { x, y, xScale: scaleX, yScale: scaleY };
  if (totalRot) opts.rotate = degrees(totalRot);
  page.drawPage(ep, opts);
}

// ─── Draw PDF Marks ───

function drawPDFMarks(
  page: PDFPage,
  paperWpt: number,
  paperHpt: number,
  impo: {
    marginL: number; marginR: number; marginT: number; marginB: number;
    trimW?: number; trimH?: number;
    cols: number; rows: number;
    gutterMM?: number; gutterRowMM?: number;
    bleedMM?: number;
    offsetX?: number; offsetY?: number;
    cropMarks?: boolean;
    // Legacy compat: pieceW/H used if trimW/H not set
    pieceW?: number; pieceH?: number;
  },
  options?: DrawMarksOptions,
) {
  const drawCropMarks = impo.cropMarks !== false && !(options?.skipCropMarks);
  let markLen = mmToPt(4);
  const markOffset = mmToPt(1);
  const mL = mmToPt(impo.marginL);
  const mR = mmToPt(impo.marginR);
  const mT = mmToPt(impo.marginT);
  const mB = mmToPt(impo.marginB);
  // Use trim dimensions for grid positioning
  const bleedPt = mmToPt(impo.bleedMM || 0);
  const trimWpt = impo.trimW ? mmToPt(impo.trimW) : (impo.pieceW ? mmToPt(impo.pieceW) - 2 * bleedPt : 0);
  const trimHpt = impo.trimH ? mmToPt(impo.trimH) : (impo.pieceH ? mmToPt(impo.pieceH) - 2 * bleedPt : 0);
  const gutterColPt = mmToPt(impo.gutterMM || 0);
  const gutterRowPt = mmToPt(impo.gutterRowMM != null ? impo.gutterRowMM : (impo.gutterMM || 0));

  const printableW = paperWpt - mL - mR;
  const printableH = paperHpt - mT - mB;
  const cols = impo.cols;
  const rows = impo.rows;
  // Trim-based grid: N*trim + (N-1)*gutter
  const trimGridW = cols * trimWpt + Math.max(0, cols - 1) * gutterColPt;
  const trimGridH = rows * trimHpt + Math.max(0, rows - 1) * gutterRowPt;
  const offXpt = mmToPt(impo.offsetX || 0);
  const offYpt = mmToPt(impo.offsetY || 0);
  // cenX/cenY = bottom-left of first TRIM in the grid
  const cenX = mL + (printableW - trimGridW) / 2 + offXpt;
  const cenY = mB + (printableH - trimGridH) / 2 - offYpt;

  const regAll = cmyk(1, 1, 1, 1); // Registration — prints on ALL plates
  const markColor = options?.machineCat === 'offset' ? regAll : cmyk(0, 0, 0, 1);

  // Crop marks must start OUTSIDE the bleed, otherwise the first mm of the mark
  // sits inside the colored bleed area and looks like it's inside the job.
  const cropGap = Math.max(markOffset, bleedPt + mmToPt(0.5));

  // Cap mark length to available margin space (use bleed-extended bounds)
  const spaceAbove = paperHpt - (cenY + trimGridH) - bleedPt;
  const spaceBelow = cenY - bleedPt;
  const spaceLeft = cenX - bleedPt;
  const spaceRight = paperWpt - (cenX + trimGridW) - bleedPt;
  const minSpace = Math.min(spaceAbove, spaceBelow, spaceLeft, spaceRight);
  if (cropGap + markLen > minSpace) {
    markLen = Math.max(mmToPt(1), minSpace - cropGap);
  }

  if (drawCropMarks) {
    // Trim-based: collect all trim edge positions
    const trimStepW = trimWpt + gutterColPt;
    const trimStepH = trimHpt + gutterRowPt;

    const trimXs: number[] = [];
    for (let vc = 0; vc < cols; vc++) {
      trimXs.push(cenX + vc * trimStepW);              // left trim edge
      trimXs.push(cenX + vc * trimStepW + trimWpt);    // right trim edge
    }
    trimXs.sort((a, b) => a - b);
    const uV = [trimXs[0]];
    for (let vi = 1; vi < trimXs.length; vi++) {
      if (trimXs[vi] - uV[uV.length - 1] > 0.1) uV.push(trimXs[vi]);
    }

    const trimYs: number[] = [];
    for (let hr = 0; hr < rows; hr++) {
      trimYs.push(cenY + hr * trimStepH);              // bottom trim edge
      trimYs.push(cenY + hr * trimStepH + trimHpt);    // top trim edge
    }
    trimYs.sort((a, b) => a - b);
    const uH = [trimYs[0]];
    for (let hi = 1; hi < trimYs.length; hi++) {
      if (trimYs[hi] - uH[uH.length - 1] > 0.1) uH.push(trimYs[hi]);
    }

    const gL = uV[0], gR = uV[uV.length - 1], gB = uH[0], gT = uH[uH.length - 1];

    // PERIMETER ONLY marks — top & bottom
    for (let vmi = 0; vmi < uV.length; vmi++) {
      const vx = uV[vmi];
      page.drawLine({ start: { x: vx, y: gT + cropGap }, end: { x: vx, y: gT + cropGap + markLen }, thickness: 0.5, color: markColor });
      page.drawLine({ start: { x: vx, y: gB - cropGap }, end: { x: vx, y: gB - cropGap - markLen }, thickness: 0.5, color: markColor });
    }
    // PERIMETER ONLY marks — left & right
    for (let hmi = 0; hmi < uH.length; hmi++) {
      const hy = uH[hmi];
      page.drawLine({ start: { x: gL - cropGap, y: hy }, end: { x: gL - cropGap - markLen, y: hy }, thickness: 0.5, color: markColor });
      page.drawLine({ start: { x: gR + cropGap, y: hy }, end: { x: gR + cropGap + markLen, y: hy }, thickness: 0.5, color: markColor });
    }
    // NO gutter/internal crop marks — perimeter only
  }

  // Registration crosses — offset only
  if (options?.machineCat === 'offset') {
    const regSize = mmToPt(2.5);
    const regPts = [
      { x: paperWpt / 2, y: paperHpt },
      { x: paperWpt / 2, y: 0 },
      { x: 0, y: paperHpt / 2 },
      { x: paperWpt, y: paperHpt / 2 },
    ];
    const regColor = cmyk(1, 1, 1, 1); // Registration — prints on ALL plates
    for (const p of regPts) {
      page.drawLine({ start: { x: p.x - regSize, y: p.y }, end: { x: p.x + regSize, y: p.y }, thickness: 0.3, color: regColor });
      page.drawLine({ start: { x: p.x, y: p.y - regSize }, end: { x: p.x, y: p.y + regSize }, thickness: 0.3, color: regColor });
      page.drawCircle({ x: p.x, y: p.y, size: regSize * 0.6, borderWidth: 0.3, borderColor: regColor });
    }
  }

  // Plate sluglines — offset only
  if (options?.showPlateSlug && options.machineCat === 'offset' && options.font) {
    const cmykColors = [cmyk(1,0,0,0), cmyk(0,1,0,0), cmyk(0,0,1,0), cmyk(0,0,0,1)];
    const slugFont = options.font;
    const slugSize = 5.5;
    const slugNames = ['Cyan', 'Magenta', 'Yellow', 'Black'];
    const slugJobText = '';

    let slugY: number;
    if (options.plateSlugEdge === 'tail') {
      slugY = paperHpt - mmToPt(3);
    } else {
      slugY = mmToPt(3) + slugSize;
    }
    let slugX = mmToPt(5);
    for (let si = 0; si < 4; si++) {
      const slugColor = cmykColors[si];
      const slugText = slugNames[si] + (si === 3 ? slugJobText : '');
      const slugTw = slugFont.widthOfTextAtSize(slugText, slugSize);
      page.drawText(slugText, {
        x: slugX, y: slugY,
        size: slugSize, font: slugFont, color: slugColor,
      });
      slugX += slugTw + mmToPt(3);
    }
  }

  // Job info text — disabled (clutters output)

  // Color bar (tiled at scaled size across paper width)
  if (options?.colorBarPage) {
    const cbp = options.colorBarPage;
    const cbScale = (options.colorBarScale ?? 100) / 100;
    const cbW = cbp.width * cbScale;
    const cbH = cbp.height * cbScale;
    const cbOffY = mmToPt(options.colorBarOffsetY || 0);
    let cbY: number;
    if (options.colorBarEdge === 'tail') {
      cbY = paperHpt - cbH - mmToPt(1) - cbOffY;
    } else {
      cbY = mmToPt(1) + cbOffY;
    }
    const cbTiles = Math.ceil(paperWpt / cbW);
    for (let cbt = 0; cbt < cbTiles; cbt++) {
      const cbX = cbt * cbW;
      page.drawPage(cbp, { x: cbX, y: cbY, width: cbW, height: cbH });
    }
  }

  // Fold marks for booklet
  if (options?.foldLine) {
    const foldX = paperWpt / 2;
    page.drawLine({
      start: { x: foldX, y: mB }, end: { x: foldX, y: paperHpt - mT },
      thickness: 0.5, color: cmyk(0, 1, 1, 0), dashArray: [4, 3],
    });
  }
}

// ─── Masking helpers ───

function drawMarginalMasks(
  page: PDFPage,
  paperWpt: number,
  paperHpt: number,
  gridL: number,
  gridR: number,
  gridB: number,
  gridT: number,
) {
  const white = cmyk(0, 0, 0, 0);
  if (gridL > 0.5) page.drawRectangle({ x: 0, y: 0, width: gridL, height: paperHpt, color: white });
  if (paperWpt - gridR > 0.5) page.drawRectangle({ x: gridR, y: 0, width: paperWpt - gridR, height: paperHpt, color: white });
  if (gridB > 0.5) page.drawRectangle({ x: gridL, y: 0, width: gridR - gridL, height: gridB, color: white });
  if (paperHpt - gridT > 0.5) page.drawRectangle({ x: gridL, y: gridT, width: gridR - gridL, height: paperHpt - gridT, color: white });
}

function drawGutterMasks(
  page: PDFPage,
  paperWpt: number,
  paperHpt: number,
  cenX: number,
  cenY: number,
  cols: number,
  rows: number,
  pieceW: number,
  pieceH: number,
  gutterPt: number,
  bleedPt: number,
  totalGridH: number,
) {
  const white = cmyk(0, 0, 0, 0);
  if (gutterPt > 0.5) {
    for (let gc = 0; gc < cols - 1; gc++) {
      const gx = cenX + gc * (pieceW + gutterPt) + pieceW;
      const gutL = gx + Math.min(bleedPt, gutterPt / 2);
      const gutR = gx + gutterPt - Math.min(bleedPt, gutterPt / 2);
      if (gutR > gutL + 0.5) page.drawRectangle({ x: gutL, y: 0, width: gutR - gutL, height: paperHpt, color: white });
    }
    for (let gr = 0; gr < rows - 1; gr++) {
      const gy = cenY + gr * (pieceH + gutterPt) + pieceH;
      const gutB = gy + Math.min(bleedPt, gutterPt / 2);
      const gutT = gy + gutterPt - Math.min(bleedPt, gutterPt / 2);
      if (gutT > gutB + 0.5) page.drawRectangle({ x: 0, y: gutB, width: paperWpt, height: gutT - gutB, color: white });
    }
  }
}

// ─── PerfectBound rotation helper ───

function pbIsRotated(row: number, totalRows: number): boolean {
  const rowFromBottom = totalRows - 1 - row;
  return (rowFromBottom % 2 === 1);
}

// ─── Format number for Cut&Stack numbering ───

function formatNumber(prefix: string, num: number, digits: number): string {
  let s = String(num);
  while (s.length < digits) s = '0' + s;
  return ascii(prefix || '') + s;
}

// ═══════════════════════════════════════════════════════════
//  N-Up Export
// ═══════════════════════════════════════════════════════════

async function exportNUp(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
): Promise<void> {
  const impo = opts.imposition;
  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const mL = mmToPt(impo.marginL ?? 0);
  const mB = mmToPt(impo.marginB ?? 0);
  const bleedPt = mmToPt(opts.bleed || 0);
  const gutterPt = mmToPt(opts.gutter || 0);
  const trimWpt = mmToPt(impo.trimW);
  const trimHpt = mmToPt(impo.trimH);
  const pieceW = mmToPt(impo.pieceW); // max cell = trim + 2*bleed (for scaling)
  const pieceH = mmToPt(impo.pieceH);
  const printableW = paperWpt - mL - mmToPt(impo.marginR ?? 0);
  const printableH = paperHpt - mmToPt(impo.marginT ?? 0) - mB;
  // Trim-based grid
  const trimGridW = impo.cols * trimWpt + Math.max(0, impo.cols - 1) * gutterPt;
  const trimGridH = impo.rows * trimHpt + Math.max(0, impo.rows - 1) * gutterPt;
  const offXpt = mmToPt(impo.offsetX ?? 0);
  const offYpt = mmToPt(impo.offsetY ?? 0);
  // cenX/cenY = bottom-left of first TRIM cell
  const cenX = mL + (printableW - trimGridW) / 2 + offXpt;
  const cenY = mB + (printableH - trimGridH) / 2 - offYpt;
  // Cell step = trim + gutter (not cell + cellGap)
  const trimStepW = trimWpt + gutterPt;
  const trimStepH = trimHpt + gutterPt;

  // Detect orientation mismatch
  const pdfPg = opts.pdfPageSizes?.[0];
  const pdfPortrait = pdfPg ? (pdfPg.trimW <= pdfPg.trimH) : true;
  const cellPortrait = impo.pieceW <= impo.pieceH;
  const isRotated = pdfPortrait !== cellPortrait;

  const pdfPageCount = embeddedPages.length;
  const sheetsNeeded = pdfPageCount;
  const maxSheets = 50;

  const isDuplex = !!opts.isDuplex && pdfPageCount >= 2;

  for (let s = 0; s < Math.min(sheetsNeeded, maxSheets); s++) {
    const isBackSide = isDuplex && (s % 2 === 1);
    const page = doc.addPage([paperWpt, paperHpt]);

    // Per-cell asymmetric bleed: compute internal bleed for clipping
    const intBleedPlace = internalBleed(gutterPt, bleedPt);

    for (let row = 0; row < impo.rows; row++) {
      for (let col = 0; col < impo.cols; col++) {
        const pageIdx = s;
        if (pageIdx < embeddedPages.length) {
          const epObj = embeddedPages[pageIdx];
          const frontTrimX = cenX + col * trimStepW;
          const trimYpos = cenY + (impo.rows - 1 - row) * trimStepH;

          // Rotation composite — pdf-lib handles source /Rotate automatically,
          // so we only add grid + user + H2F rotations.
          const gridRot = isRotated ? (isBackSide ? 90 : 270) : 0;
          const userRot = opts.rotation || 0;
          let extraRot = (userRot === 180 || userRot === 270) ? 180 : 0;
          if (opts.duplexOrient === 'h2f' && (row % 2 === 1)) extraRot = (extraRot + 180) % 360;
          const h2fRot = (isBackSide && opts.duplexOrient === 'h2f') ? 180 : 0;
          const rot = (gridRot + extraRot + h2fRot) % 360;

          // Trim position on the output page — mirror for duplex back.
          let trimX: number, trimY: number;
          if (isBackSide && opts.duplexOrient === 'h2f') {
            trimX = frontTrimX;
            trimY = paperHpt - trimYpos - trimHpt;
          } else if (isBackSide) {
            trimX = paperWpt - frontTrimX - trimWpt;
            trimY = trimYpos;
          } else {
            trimX = frontTrimX;
            trimY = trimYpos;
          }

          // Per-cell bleed, mirrored for back: H2H flips L↔R, H2F flips T↔B.
          const f = cellBleed(col, row, impo.cols, impo.rows, bleedPt, intBleedPlace);
          const bleeds = !isBackSide ? f
            : opts.duplexOrient === 'h2f'
              ? { bL: f.bL, bR: f.bR, bT: f.bB, bB: f.bT }
              : { bL: f.bR, bR: f.bL, bT: f.bT, bB: f.bB };

          const cScaleFactor = (opts.contentScale || 100) / 100;
          drawTrimToCell(page, epObj, trimX, trimY, trimWpt, trimHpt, bleeds, rot, cScaleFactor);
        }
      }
    }

    // When preserving source marks, skip masking + own crop marks
    if (!opts.keepSourceMarks) {
      const white = cmyk(0, 0, 0, 0);
      const maskCenX = isBackSide ? (paperWpt - cenX - trimGridW) : cenX;

      drawUniformGutterMasks(page, maskCenX, cenY, impo.cols, impo.rows, trimWpt, trimHpt, gutterPt, bleedPt, paperWpt, paperHpt);

      // Margin masks — extend to cover bleed on external sides
      const gridL = maskCenX - bleedPt;
      const gridB = cenY - bleedPt;
      const gridR = maskCenX + trimGridW + bleedPt;
      const gridT = cenY + trimGridH + bleedPt;
      drawMarginalMasks(page, paperWpt, paperHpt, gridL, gridR, gridB, gridT);

      const sheetLabel = isDuplex
        ? ascii((opts.jobDescription || 'Job') + (isBackSide ? ' (Back)' : ' (Front)'))
        : ascii(opts.jobDescription || 'Job');

      drawPDFMarks(page, paperWpt, paperHpt, {
        marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
        marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
        trimW: impo.trimW, trimH: impo.trimH,
        cols: impo.cols, rows: impo.rows,
        gutterMM: opts.gutter || 0,
        bleedMM: opts.bleed || 0,
        offsetX: impo.offsetX, offsetY: impo.offsetY,
        cropMarks: opts.showCropMarks,
      }, {
        font, jobName: sheetLabel, foldLine: false, colorBarPage: cbEmbed,
        machineCat: opts.machineCat,
        showPlateSlug: opts.showPlateSlug,
        plateSlugEdge: opts.plateSlugEdge,
        colorBarEdge: opts.colorBarEdge,
        colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Booklet Export
// ═══════════════════════════════════════════════════════════

async function exportBooklet(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
): Promise<void> {
  const impo = opts.imposition;
  const sigMap = opts.signatureMap || impo.signatureMap;
  if (!sigMap) return;
  const creep = opts.creepPerSheet || impo.creepPerSheet || [];

  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const mL = mmToPt(impo.marginL ?? 0);
  const mB = mmToPt(impo.marginB ?? 0);
  const pieceW = mmToPt(impo.pieceW);
  const pieceH = mmToPt(impo.pieceH);
  const bleedPt = mmToPt(opts.bleed || 0);
  const printableW = paperWpt - mL - mmToPt(impo.marginR ?? 0);
  const printableH = paperHpt - mmToPt(impo.marginT ?? 0) - mB;
  const offXpt = mmToPt(impo.offsetX || 0);
  const offYpt = mmToPt(impo.offsetY || 0);
  const spreadsAcross = (impo as any).spreadsAcross || 1;
  const canvasRot = (impo as any).pageRotation || 0;
  const isRotated = canvasRot === 90 || canvasRot === 270;
  // Canvas ctx.rotate is CW (Y-down); pdf-lib rotate is CCW (Y-up). Mirror the
  // angle so the exported PDF matches what's previewed on screen.
  const pageRot = isRotated ? (360 - canvasRot) % 360 : 0;
  // For unrotated booklet: spread rows stack vertically on the sheet (each row is one spread tall).
  // For rotated booklet: the "rows" value from the engine counts cells (2 per spread), so divide by 2.
  const spreadsDown = isRotated
    ? Math.max(1, Math.floor((impo.rows || 2) / 2))
    : (impo.rows || 1);
  // Traditional 2-up imposition: every spread slot on a press sheet prints
  // the SAME signature (2 book copies printed at once). So "sigs per press sheet"
  // is always 1 — totalPressSheets = totalSigs, and each sheet repeats one sig.
  const sigsPerSheet = 1;
  const gapVpt = mmToPt((impo as any).spineOffset || 0);
  const gapHpt = mmToPt((impo as any).rowGap || 0);

  // Trim + bleed dimensions of a single book page (pre-rotation semantics).
  const trimWpt = mmToPt(impo.trimW || opts.jobW || 0);
  const trimHpt = mmToPt(impo.trimH || opts.jobH || 0);

  // Spread footprint on the press sheet, accounting for rotation.
  // Two pages of the spread share the spine (no internal gap); outer bleed only.
  // Unrotated: (2·trim + 2·bleed) × (trim + 2·bleed).
  // Rotated  : (trim + 2·bleed) × (2·trim + 2·bleed).
  const spreadWpt = isRotated ? (trimHpt + 2 * bleedPt) : (2 * trimWpt + 2 * bleedPt);
  const spreadHpt = isRotated ? (2 * trimWpt + 2 * bleedPt) : (trimHpt + 2 * bleedPt);
  const totalGridW = spreadsAcross * spreadWpt + (spreadsAcross - 1) * gapVpt;
  const totalGridH = spreadsDown * spreadHpt + (spreadsDown - 1) * gapHpt;
  const gridX = mL + (printableW - totalGridW) / 2 + offXpt;
  const gridY = mB + (printableH - totalGridH) / 2 - offYpt;

  const totalSigs = sigMap.totalSheets;

  // Crop marks config for booklet (operates on the on-sheet spread footprint).
  // Each "cell" in the marks grid corresponds to one entire spread (2 pages sharing
  // the spine — no internal gap). We pass trim dimensions directly and encode the
  // inter-spread gap as `spineOffset + 2×bleed`: the 12mm zone between adjacent trims
  // contains one bleed-band per spread plus the spine offset between them.
  const jobW = impo.trimW || opts.jobW || 0;
  const jobH = impo.trimH || opts.jobH || 0;
  const spineOffsetMM = (impo as any).spineOffset || 0;
  const rowGapMM = (impo as any).rowGap || 0;
  const bleedMMval = opts.bleed || 0;
  const bkMarks = {
    marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
    marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
    cols: spreadsAcross,
    rows: spreadsDown,
    trimW: isRotated ? jobH : (2 * jobW),
    trimH: isRotated ? (2 * jobW) : jobH,
    gutterMM: spineOffsetMM + 2 * bleedMMval,
    gutterRowMM: rowGapMM + 2 * bleedMMval,
    bleedMM: bleedMMval,
    offsetX: impo.offsetX, offsetY: impo.offsetY,
    cropMarks: opts.showCropMarks,
  };

  const canRepeat = sigsPerSheet >= totalSigs;
  const totalPressSheets = canRepeat ? 1 : Math.ceil(totalSigs / sigsPerSheet);

  // Progressive internal bleed for the inter-spread gap on the "rows" axis.
  const bkIntBleedGapPt = internalBleed(gapHpt, bleedPt);

  for (let ps = 0; ps < totalPressSheets; ps++) {
    const frontPage = doc.addPage([paperWpt, paperHpt]);
    const backPage = doc.addPage([paperWpt, paperHpt]);

    // Each press sheet represents one signature — all spread slots on this
    // sheet print the same sig (2-up book imposition).
    const si = canRepeat ? (ps % totalSigs) : ps;
    if (si >= totalSigs) continue;
    const sheet = sigMap.sheets[si];
    const creepPt = mmToPt(creep[si] || 0);

    for (let row = 0; row < spreadsDown; row++) {
      for (let sp2 = 0; sp2 < spreadsAcross; sp2++) {
        // Place spread — y index 0 is at the TOP of the sheet (higher PDF y).
        const rowY = gridY + (spreadsDown - 1 - row) * (spreadHpt + gapHpt);
        const spreadX = gridX + sp2 * (spreadWpt + gapVpt);

        // Bleeds for each page of the spread. In both orientations the spine is
        // the inner edge where L meets R (0 bleed), and outer edges carry full bleed.
        // fp=0 is L (first-printed), fp=1 is R.
        const spreadBleeds = (fp: number) => {
          if (!isRotated) {
            // Pages side by side: spine on the inner vertical edge.
            return {
              bL: fp === 0 ? bleedPt : 0,
              bR: fp === 0 ? 0 : bleedPt,
              bT: bleedPt,
              bB: bleedPt,
            };
          }
          // Pages stacked: after 90° CW rotation, L is on TOP, R is on BOTTOM.
          // Spine is the horizontal inner edge (L bottom / R top).
          return {
            bL: bleedPt,
            bR: bleedPt,
            bT: fp === 0 ? bleedPt : 0,
            bB: fp === 0 ? 0 : bleedPt,
          };
        };

        // drawTrimToCell expects trimW/trimH to be the ON-SHEET dimensions of the trim
        // rectangle (post-rotation), because it sizes the clip and scales the embedded
        // page to fit that rect exactly. For the rotated layout the on-sheet trim swaps
        // dimensions: each page lands as (trimH × trimW) on the sheet.
        const cellTrimW = isRotated ? trimHpt : trimWpt;
        const cellTrimH = isRotated ? trimWpt : trimHpt;

        for (let fp = 0; fp < 2; fp++) {
          const pn = sheet.front[fp];
          if (pn > embeddedPages.length) continue;
          const ep = embeddedPages[pn - 1];
          let trimXf: number, trimYf: number;
          if (!isRotated) {
            // L on the left, R on the right, creep pushes L outward / R inward.
            const shiftX = fp === 0 ? creepPt : -creepPt;
            trimXf = spreadX + bleedPt + fp * trimWpt + shiftX;
            trimYf = rowY + bleedPt;
          } else {
            // L on top, R on bottom. In PDF coords top-y is higher, so fp=0 (L) lands at
            // the upper half. Creep on the spine-facing edge.
            const shiftY = fp === 0 ? -creepPt : creepPt;
            trimXf = spreadX + bleedPt;
            trimYf = rowY + bleedPt + (1 - fp) * cellTrimH + shiftY;
          }
          drawTrimToCell(frontPage, ep, trimXf, trimYf, cellTrimW, cellTrimH, spreadBleeds(fp), pageRot, 1);
        }

        for (let bp = 0; bp < 2; bp++) {
          const pnb = sheet.back[bp];
          if (pnb > embeddedPages.length) continue;
          const epb = embeddedPages[pnb - 1];
          let trimXbk: number, trimYbk: number;
          if (!isRotated) {
            const shiftXb = bp === 0 ? creepPt : -creepPt;
            trimXbk = spreadX + bleedPt + bp * trimWpt + shiftXb;
            trimYbk = rowY + bleedPt;
          } else {
            const shiftYb = bp === 0 ? -creepPt : creepPt;
            trimXbk = spreadX + bleedPt;
            trimYbk = rowY + bleedPt + (1 - bp) * cellTrimH + shiftYb;
          }
          drawTrimToCell(backPage, epb, trimXbk, trimYbk, cellTrimW, cellTrimH, spreadBleeds(bp), pageRot, 1);
        }
      }
    }

    const psLabel = totalPressSheets > 1 ? ' Press ' + (ps + 1) + '/' + totalPressSheets : '';
    const marksOpts = {
      font, foldLine: false, colorBarPage: cbEmbed,
      machineCat: opts.machineCat,
      showPlateSlug: opts.showPlateSlug,
      plateSlugEdge: opts.plateSlugEdge,
      colorBarEdge: opts.colorBarEdge,
      colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
    };
    drawPDFMarks(frontPage, paperWpt, paperHpt, bkMarks, { ...marksOpts, jobName: ascii((opts.jobDescription || 'Job') + psLabel + ' Front') });
    drawPDFMarks(backPage, paperWpt, paperHpt, bkMarks, { ...marksOpts, jobName: ascii((opts.jobDescription || 'Job') + psLabel + ' Back') });
  }
}

// ═══════════════════════════════════════════════════════════
//  Perfect Bound Export
// ═══════════════════════════════════════════════════════════

async function exportPerfectBound(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
): Promise<void> {
  const impo = opts.imposition;
  const sigRows = impo.rows || 1;
  const sigCols = impo.cols || 2;

  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const mL = mmToPt(impo.marginL ?? 0);
  const mB = mmToPt(impo.marginB ?? 0);
  const pieceWpt = mmToPt(impo.pieceW);
  const pieceHpt = mmToPt(impo.pieceH);
  const printableW = paperWpt - mL - mmToPt(impo.marginR ?? 0);
  const printableH = paperHpt - mmToPt(impo.marginT ?? 0) - mB;
  const offXpt = mmToPt(impo.offsetX || 0);
  const offYpt = mmToPt(impo.offsetY || 0);
  const fgVpt = mmToPt((impo as any).gapVmm || 0);
  const fgHpt = mmToPt((impo as any).gapHmm || 0);
  const bleedPt = mmToPt(opts.bleed || 0);
  const trimWpt = mmToPt(impo.trimW || (impo.pieceW - 2 * (opts.bleed || 0)));
  const trimHpt = mmToPt(impo.trimH || (impo.pieceH - 2 * (opts.bleed || 0)));

  const numPairs = Math.ceil(sigCols / 2);
  const pairW = 2 * trimWpt + 2 * bleedPt;
  const hasVGap = numPairs >= 2 && fgVpt > 0;
  const hasHGap = sigRows >= 2 && fgHpt > 0;
  const blockWpt = numPairs * pairW + (hasVGap ? fgVpt : 0);
  const blockHpt = sigRows * pieceHpt + (hasHGap ? fgHpt : 0);

  const sigsAcross = (impo as any).sigsAcross || 1;
  const sigsDown = (impo as any).sigsDown || 1;
  const sigsPerSheet = (impo as any).sigsPerSheet || 1;
  const blockGapHpt = mmToPt((impo as any).blockGapH || 3);
  const blockGapVpt = mmToPt((impo as any).blockGapV || 3);
  const totalGridW = sigsAcross * blockWpt + (sigsAcross - 1) * blockGapHpt;
  const totalGridH = sigsDown * blockHpt + (sigsDown - 1) * blockGapVpt;
  const gridOriginX = mL + (printableW - totalGridW) / 2 + offXpt;
  const gridOriginY = mB + (printableH - totalGridH) / 2 - offYpt;

  const signatures = (impo as any).pbSignatures || [];
  const numSigs = (impo as any).numSigs || signatures.length;
  const canRepeat = (impo as any).canRepeat || false;
  const totalPressSheets = (impo as any).totalPressSheets || 1;

  if (signatures.length === 0) return; // no signatures to export

  const drawBlock = (page: PDFPage, sig: { startPage: number; actualPages: number; signatureMap: { front: number[][]; back: number[][] } }, faceName: string, blockBaseX: number, blockBaseY: number) => {
    const sigMapLocal = sig.signatureMap;
    const sigOffset = sig.startPage - 1;
    const faceRows = faceName === 'front' ? sigMapLocal.front : sigMapLocal.back;

    // Progressive internal bleed for rows (between top/bottom half of signature).
    // Columns within a pair share the SPINE (no bleed) — already handled via clipL/clipW.
    const pbIntBleedPt = internalBleed(fgHpt, bleedPt);

    for (let row = 0; row < sigRows; row++) {
      const rowPages = faceRows[row] || [];
      const cellRot = pbIsRotated(row, sigRows);
      const rowFromBot = sigRows - 1 - row;
      const rowY = blockBaseY + rowFromBot * pieceHpt + (hasHGap && rowFromBot >= Math.floor(sigRows / 2) ? fgHpt : 0);

      for (let col = 0; col < sigCols; col++) {
        const localPN = rowPages[col] || 0;
        const globalPN = sigOffset + localPN;
        if (globalPN > 0 && globalPN <= embeddedPages.length && localPN <= sig.actualPages) {
          const ep = embeddedPages[globalPN - 1];
          const pairIdx = Math.floor(col / 2);
          const colInPair = col % 2;
          const pairX = blockBaseX + pairIdx * pairW + (hasVGap && pairIdx >= 1 ? fgVpt : 0);
          const trimX = pairX + bleedPt + colInPair * trimWpt;
          const trimY = rowY + bleedPt;

          // Left page of spread: full bleed on left edge, none on the spine (right).
          // Right page: none on spine (left), full bleed on right.
          // Top/bottom follow the per-row progressive rule (shared between top/bottom halves).
          const bleeds = {
            bL: colInPair === 0 ? bleedPt : 0,
            bR: colInPair === 0 ? 0 : bleedPt,
            bT: row === 0 ? bleedPt : pbIntBleedPt,
            bB: row === sigRows - 1 ? bleedPt : pbIntBleedPt,
          };
          drawTrimToCell(page, ep, trimX, trimY, trimWpt, trimHpt, bleeds, cellRot ? 180 : 0, 1);
        }
      }
    }
  }

  for (let ps = 0; ps < totalPressSheets; ps++) {
    const frontP = doc.addPage([paperWpt, paperHpt]);
    const backP = doc.addPage([paperWpt, paperHpt]);

    for (let bRow = 0; bRow < sigsDown; bRow++) {
      for (let bCol = 0; bCol < sigsAcross; bCol++) {
        const slotIdx = bRow * sigsAcross + bCol;
        let sigIdx: number;
        if (canRepeat) {
          sigIdx = slotIdx % numSigs;
        } else {
          sigIdx = ps * sigsPerSheet + slotIdx;
          if (sigIdx >= numSigs) continue;
        }
        const sig = signatures[sigIdx];

        const blockX = gridOriginX + bCol * (blockWpt + blockGapHpt);
        const blockY = gridOriginY + (sigsDown - 1 - bRow) * (blockHpt + blockGapVpt);

        drawBlock(frontP, sig, 'front', blockX, blockY);
        drawBlock(backP, sig, 'back', blockX, blockY);
      }
    }

    // Crop marks. Gutter between trim edges = inter-pair gap + 2×bleed, because each
    // pair absorbs its own bleed on both outer sides before the inter-pair gap.
    const bleedMm = opts.bleed || 0;
    const pbMarksImpo = {
      marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
      marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
      cols: numPairs * sigsAcross,
      rows: sigRows * sigsDown,
      pieceW: pairW * 25.4 / 72,
      pieceH: impo.pieceH,
      gutterMM: ((impo as any).gapVmm || 0) + 2 * bleedMm,
      gutterRowMM: ((impo as any).gapHmm || 0) + 2 * bleedMm,
      bleedMM: bleedMm,
      offsetX: impo.offsetX, offsetY: impo.offsetY,
      cropMarks: opts.showCropMarks,
    };
    const pressLabel = totalPressSheets > 1 ? 'Press ' + (ps + 1) + '/' + totalPressSheets : '';
    const marksOpts: DrawMarksOptions = {
      font, foldLine: false, colorBarPage: cbEmbed,
      machineCat: opts.machineCat,
      showPlateSlug: opts.showPlateSlug,
      plateSlugEdge: opts.plateSlugEdge,
      colorBarEdge: opts.colorBarEdge,
      colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
    };
    // Mask outer edges FIRST so crop marks (drawn next) don't get covered.
    const gridL = gridOriginX;
    const gridR = gridOriginX + totalGridW;
    const gridB = gridOriginY;
    const gridT = gridOriginY + totalGridH;
    for (const pg of [frontP, backP]) {
      drawMarginalMasks(pg, paperWpt, paperHpt, gridL, gridR, gridB, gridT);
    }

    drawPDFMarks(frontP, paperWpt, paperHpt, pbMarksImpo, { ...marksOpts, jobName: ascii((pressLabel ? pressLabel + ' ' : '') + 'Front (' + sigsAcross + '\u00d7' + sigsDown + ')') });
    drawPDFMarks(backP, paperWpt, paperHpt, pbMarksImpo, { ...marksOpts, jobName: ascii((pressLabel ? pressLabel + ' ' : '') + 'Back (' + sigsAcross + '\u00d7' + sigsDown + ')') });

    // Fold ticks at each spine (between the two pages of every spread).
    // Dashed to distinguish from cut marks — this is a fold line, not a cut.
    if (opts.showCropMarks) {
      const tickColor = opts.machineCat === 'offset' ? cmyk(1, 1, 1, 1) : cmyk(0, 0, 0, 1);
      const tickLen = mmToPt(3);
      const tickGap = Math.max(mmToPt(1), bleedPt + mmToPt(0.5));
      const dashArr = [mmToPt(0.7), mmToPt(0.5)];
      for (let bRow = 0; bRow < sigsDown; bRow++) {
        for (let bCol = 0; bCol < sigsAcross; bCol++) {
          const slotIdx = bRow * sigsAcross + bCol;
          const sigIdx = canRepeat ? (slotIdx % numSigs) : (ps * sigsPerSheet + slotIdx);
          if (sigIdx >= numSigs) continue;
          const blockX = gridOriginX + bCol * (blockWpt + blockGapHpt);
          const blockY = gridOriginY + (sigsDown - 1 - bRow) * (blockHpt + blockGapVpt);
          const blockTopY = blockY + blockHpt;
          for (let p = 0; p < numPairs; p++) {
            const pairX = blockX + p * pairW + (hasVGap && p >= 1 ? fgVpt : 0);
            const spineX = pairX + bleedPt + trimWpt;
            for (const pg of [frontP, backP]) {
              pg.drawLine({
                start: { x: spineX, y: blockTopY + tickGap },
                end: { x: spineX, y: blockTopY + tickGap + tickLen },
                thickness: 0.5, color: tickColor, dashArray: dashArr,
              });
              pg.drawLine({
                start: { x: spineX, y: blockY - tickGap },
                end: { x: spineX, y: blockY - tickGap - tickLen },
                thickness: 0.5, color: tickColor, dashArray: dashArr,
              });
            }
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Cut & Stack Export
// ═══════════════════════════════════════════════════════════

async function exportCutStack(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
): Promise<void> {
  const impo = opts.imposition;

  // Embed numbering font
  let numFont = font;
  if (opts.numberingEnabled && opts.numberFont === 'Courier') {
    numFont = await doc.embedFont(StandardFonts.Courier);
  }

  // Fixed back: embed back pages from separate PDF or reuse from main PDF
  const isDuplex = !!opts.fixedBack;
  let backEmbedded: EmbeddedPageInfo[] | null = null;
  const fixedBackIdx = (opts.fixedBackPage != null && opts.fixedBackPage >= 0)
    ? opts.fixedBackPage
    : Math.max(0, embeddedPages.length - 1);
  if (isDuplex && opts.fixedBackPdfBytes) {
    backEmbedded = await embedSourcePages(doc, opts.fixedBackPdfBytes, 'nup', opts.bleed || 0, opts.keepSourceMarks);
  }

  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const bleedPt = mmToPt(opts.bleed || 0);
  const gutterPt = mmToPt(opts.gutter || 0);
  const trimWpt = mmToPt(impo.trimW);
  const trimHpt = mmToPt(impo.trimH);
  const pieceW = mmToPt(impo.pieceW);
  const pieceH = mmToPt(impo.pieceH);
  const mLcs = mmToPt(impo.marginL ?? 0);
  const mBcs = mmToPt(impo.marginB ?? 0);
  const printableW = paperWpt - mLcs - mmToPt(impo.marginR ?? 0);
  const printableH = paperHpt - mmToPt(impo.marginT ?? 0) - mBcs;
  // Trim-based grid
  const trimGridW = impo.cols * trimWpt + Math.max(0, impo.cols - 1) * gutterPt;
  const trimGridH = impo.rows * trimHpt + Math.max(0, impo.rows - 1) * gutterPt;
  const offXpt = mmToPt(impo.offsetX || 0);
  const offYpt = mmToPt(impo.offsetY || 0);
  const cenX = mLcs + (printableW - trimGridW) / 2 + offXpt;
  const cenY = mBcs + (printableH - trimGridH) / 2 - offYpt;
  const csTrimStepW = trimWpt + gutterPt;
  const csTrimStepH = trimHpt + gutterPt;

  const numPdfColor = (opts.numberColor === '#cc0000') ? cmyk(0, 1, 1, 0) : cmyk(0, 0, 0, 1);
  const startNum = opts.numberStartNum || 1;

  const isH2H = (opts.duplexOrient || 'h2h') === 'h2h';

  const csIntBleedPt = internalBleed(gutterPt, bleedPt);

  const sheetsNeeded = opts.csStackSize || Math.max(1, embeddedPages.length);

  const csMask = (pg: PDFPage, mirrored: boolean) => {
    const mCenX = mirrored ? (paperWpt - cenX - trimGridW) : cenX;
    drawUniformGutterMasks(pg, mCenX, cenY, impo.cols, impo.rows, trimWpt, trimHpt, gutterPt, bleedPt, paperWpt, paperHpt);
    const gridL = mCenX - bleedPt;
    const gridB = cenY - bleedPt;
    const gridR = mCenX + trimGridW + bleedPt;
    const gridT = cenY + trimGridH + bleedPt;
    drawMarginalMasks(pg, paperWpt, paperHpt, gridL, gridR, gridB, gridT);
  }

  const defaultStackNumFn = (posIdx: number, ups: number) => posIdx;

  for (let s = 0; s < sheetsNeeded; s++) {
    // FRONT PAGE
    const page = doc.addPage([paperWpt, paperHpt]);

    for (let row = 0; row < impo.rows; row++) {
      for (let col = 0; col < impo.cols; col++) {
        const posIdx = row * impo.cols + col;
        const cellOff = opts.cellOffsets?.[posIdx] || { x: 0, y: 0 };
        const cOffX = mmToPt(cellOff.x);
        const cOffY = mmToPt(cellOff.y);
        const csStack = opts.csStackSize || Math.max(1, embeddedPages.length);
        const stackNum = opts.csGetStackNum ? opts.csGetStackNum(posIdx, impo.ups) : defaultStackNumFn(posIdx, impo.ups);
        const pageIdx = (stackNum * csStack + s) % Math.max(1, embeddedPages.length);
        if (embeddedPages.length > 0) {
          const ep = embeddedPages[pageIdx];
          const trimX = cenX + col * csTrimStepW + cOffX;
          const trimY = cenY + (impo.rows - 1 - row) * csTrimStepH - cOffY;
          const bleeds = cellBleed(col, row, impo.cols, impo.rows, bleedPt, csIntBleedPt);
          const cScale = (opts.contentScale || 100) / 100;
          drawTrimToCell(page, ep, trimX, trimY, trimWpt, trimHpt, bleeds, 0, cScale);
        }

        // Numbering overlay (front only)
        if (opts.numberingEnabled) {
          const numPos = opts.numberPositions?.[posIdx] || opts.numberGlobalPos || { x: 0.5, y: 0.5 };
          const csStack2 = opts.csStackSize || Math.max(1, embeddedPages.length);
          const seqNumber = startNum + stackNum * csStack2 + s;
          const numStr = formatNumber(opts.numberPrefix || '', seqNumber, opts.numberDigits || 4);
          const cellXn = cenX + col * csTrimStepW - bleedPt + cOffX;
          const cellYn = cenY + (impo.rows - 1 - row) * csTrimStepH - bleedPt - cOffY;
          const pdfNumFS = Math.max(6, Math.min((opts.numberFontSize || 12) * pieceW / 150, pieceW * 0.15, pieceH * 0.12));
          const numXpt = cellXn + numPos.x * pieceW;
          const numYpt = cellYn + (1 - numPos.y) * pieceH;
          const textW = numFont.widthOfTextAtSize(numStr, pdfNumFS);
          const drawOpts: Parameters<PDFPage['drawText']>[1] = {
            x: numXpt - textW / 2, y: numYpt - pdfNumFS * 0.35,
            size: pdfNumFS, font: numFont, color: numPdfColor,
          };
          if (opts.numberRotation) drawOpts.rotate = degrees(opts.numberRotation);
          page.drawText(numStr, drawOpts);
        }
      }
    }

    csMask(page, false);
    const marksImpo = {
      marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
      marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
      trimW: impo.trimW, trimH: impo.trimH,
      cols: impo.cols, rows: impo.rows,
      gutterMM: opts.gutter || 0,
      bleedMM: opts.bleed || 0,
      offsetX: impo.offsetX, offsetY: impo.offsetY,
      cropMarks: opts.showCropMarks,
    };
    drawPDFMarks(page, paperWpt, paperHpt, marksImpo, {
      font,
      jobName: ascii((opts.jobDescription || 'Job') + ' S' + (s + 1) + (isDuplex ? ' Front' : '')),
      colorBarPage: cbEmbed,
      machineCat: opts.machineCat,
      showPlateSlug: opts.showPlateSlug,
      plateSlugEdge: opts.plateSlugEdge,
      colorBarEdge: opts.colorBarEdge,
      colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
    });

    // BACK PAGE (fixed — same content in every cell, mirrored)
    if (isDuplex) {
      const backPage = doc.addPage([paperWpt, paperHpt]);
      const bEp = backEmbedded ? (backEmbedded[0] || backEmbedded[fixedBackIdx]) : embeddedPages[fixedBackIdx];
      if (bEp) {
        const bCScale = (opts.contentScale || 100) / 100;

        for (let bRow = 0; bRow < impo.rows; bRow++) {
          for (let bCol = 0; bCol < impo.cols; bCol++) {
            const fTrimX = cenX + bCol * csTrimStepW;
            const fTrimY = cenY + (impo.rows - 1 - bRow) * csTrimStepH;
            // Mirror the trim rect for duplex back: H2H flips X, H2F flips Y.
            const bTrimX = isH2H ? (paperWpt - fTrimX - trimWpt) : fTrimX;
            const bTrimY = isH2H ? fTrimY : (paperHpt - fTrimY - trimHpt);
            // Per-cell bleed — mirror L↔R for H2H back, T↔B for H2F back.
            const f = cellBleed(bCol, bRow, impo.cols, impo.rows, bleedPt, csIntBleedPt);
            const b = isH2H
              ? { bL: f.bR, bR: f.bL, bT: f.bT, bB: f.bB }
              : { bL: f.bL, bR: f.bR, bT: f.bB, bB: f.bT };
            drawTrimToCell(backPage, bEp, bTrimX, bTrimY, trimWpt, trimHpt, b, 0, bCScale);
          }
        }
      }

      csMask(backPage, isH2H);
      drawPDFMarks(backPage, paperWpt, paperHpt, marksImpo, {
        font,
        jobName: ascii((opts.jobDescription || 'Job') + ' S' + (s + 1) + ' Back'),
        colorBarPage: cbEmbed,
        machineCat: opts.machineCat,
        showPlateSlug: opts.showPlateSlug,
        plateSlugEdge: opts.plateSlugEdge,
        colorBarEdge: opts.colorBarEdge,
        colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Work & Turn Export
// ═══════════════════════════════════════════════════════════

async function exportWorkTurn(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
): Promise<void> {
  const impo = opts.imposition;
  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const mL = mmToPt(impo.marginL ?? 0), mR = mmToPt(impo.marginR ?? 0);
  const mT = mmToPt(impo.marginT ?? 0), mB = mmToPt(impo.marginB ?? 0);
  const pieceW = mmToPt(impo.pieceW), pieceH = mmToPt(impo.pieceH);
  const gutterPt = mmToPt(opts.gutter || 0);
  const isTumble = (opts.turnType || impo.turnType) === 'tumble';
  const printableW = paperWpt - mL - mR;
  const printableH = paperHpt - mT - mB;
  const halfW = isTumble ? printableW : printableW / 2;
  const halfH = isTumble ? printableH / 2 : printableH;

  // Per-half grid dimensions (not total cols/rows which are doubled for W&T).
  // Grid sizing uses TRIM step (= trim + gutter), same as the engine — not PIECE step.
  // Bleeds on adjacent cells share edges; pieces overlap when gutter < 2×bleed.
  const hCols = impo.halfCols ?? (isTumble ? impo.cols : Math.ceil(impo.cols / 2));
  const hRows = impo.halfRows ?? (isTumble ? Math.ceil(impo.rows / 2) : impo.rows);
  const trimWPtGrid = mmToPt(impo.trimW);
  const trimHPtGrid = mmToPt(impo.trimH);
  const wtBleedPtGrid = mmToPt(opts.bleed || 0);
  const trimGridW = hCols * trimWPtGrid + Math.max(0, hCols - 1) * gutterPt;
  const trimGridH = hRows * trimHPtGrid + Math.max(0, hRows - 1) * gutterPt;
  // Block size including outer bleeds (used for bounds/masks)
  const totalGridW = trimGridW + 2 * wtBleedPtGrid;
  const totalGridH = trimGridH + 2 * wtBleedPtGrid;

  const pdfPageCount = embeddedPages.length;
  const maxSheets = 50;
  const is2Sided = pdfPageCount >= 2;
  const sheetCount = is2Sided ? Math.ceil(pdfPageCount / 2) : pdfPageCount;

  for (let s = 0; s < Math.min(sheetCount, maxSheets); s++) {
    const frontIdx = is2Sided ? s * 2 : s;
    const backIdx = is2Sided ? Math.min(s * 2 + 1, pdfPageCount - 1) : s;
    const page = doc.addPage([paperWpt, paperHpt]);
    const epFront = embeddedPages[frontIdx];
    const epFrontPg = epFront.page;
    const epBack = embeddedPages[backIdx];
    const epBackPg = epBack.page;

    // Front half
    const cenFX = mL + (halfW - totalGridW) / 2;
    const cenFY = mB + (halfH - totalGridH) / 2;
    const wtBleedPt = mmToPt(opts.bleed || 0);
    const trimWPt = mmToPt(impo.trimW);
    const trimHPt = mmToPt(impo.trimH);
    const cScaleFactor = (opts.contentScale || 100) / 100;

    // Progressive internal bleed — matches engine's internalBleed() in imposition.ts.
    // gutter=0 → 0 (μονοτομή), gutter<2×bleed → gutter/2, gutter≥2×bleed → full.
    const intBleedPt = internalBleed(gutterPt, wtBleedPt);

    // Detect rotation
    const cellPortrait = pieceW <= pieceH;
    const pdfPgInfo = opts.pdfPageSizes?.[0];
    const pdfPortrait = pdfPgInfo ? (pdfPgInfo.trimW <= pdfPgInfo.trimH) : true;
    const wtNeedsRot = cellPortrait !== pdfPortrait;
    const userExtraRot = (opts.rotation === 180 || opts.rotation === 270) ? 180 : 0;

    const wtDrawCell = (
      pg: PDFPage, trimX: number, trimY: number,
      bL: number, bR: number, bT: number, bB: number,
      epObj: EmbeddedPageInfo, _epPg: PDFEmbeddedPage, extraRotArg?: number,
    ) => {
      const gridRot = wtNeedsRot ? 270 : 0;
      const rot = (gridRot + userExtraRot + (extraRotArg || 0)) % 360;
      drawTrimToCell(pg, epObj, trimX, trimY, trimWPt, trimHPt, { bL, bR, bT, bB }, rot, cScaleFactor);
    }

    // Per-cell bleed: full on outer edges of the half, internal on shared edges.
    for (let row = 0; row < hRows; row++) {
      for (let col = 0; col < hCols; col++) {
        const trimX = cenFX + wtBleedPt + col * (trimWPt + gutterPt);
        const trimY = cenFY + wtBleedPt + (hRows - 1 - row) * (trimHPt + gutterPt);
        const { bL, bR, bT, bB } = cellBleed(col, row, hCols, hRows, wtBleedPt, intBleedPt);
        wtDrawCell(page, trimX, trimY, bL, bR, bT, bB, epFront, epFrontPg, 0);
      }
    }

    // Back half — αντικριστά (180°)
    const backHalfX = isTumble ? cenFX : mL + halfW + (halfW - totalGridW) / 2;
    const backHalfY = isTumble ? mB + halfH + (halfH - totalGridH) / 2 : cenFY;
    for (let row2 = 0; row2 < hRows; row2++) {
      for (let col2 = 0; col2 < hCols; col2++) {
        const trimX2 = backHalfX + wtBleedPt + col2 * (trimWPt + gutterPt);
        const trimY2 = backHalfY + wtBleedPt + (hRows - 1 - row2) * (trimHPt + gutterPt);
        const { bL: bL2, bR: bR2, bT: bT2, bB: bB2 } = cellBleed(col2, row2, hCols, hRows, wtBleedPt, intBleedPt);
        // When auto-rotated: back gets opposite direction (heads outward)
        // When natural fit: back same as front (physical turn handles it)
        const backExtraRot = wtNeedsRot ? 180 : 0;
        wtDrawCell(page, trimX2, trimY2, bL2, bR2, bT2, bB2, epBack, epBackPg, backExtraRot);
      }
    }

    // White masks
    const white = cmyk(0, 0, 0, 0);

    // Front half grid bounds (using per-half grid size)
    const fGridL = cenFX;
    const fGridR = cenFX + totalGridW;
    const fGridB = cenFY;
    const fGridT = cenFY + totalGridH;

    // Back half grid bounds (using per-half grid size)
    const bGridL = backHalfX;
    const bGridR = backHalfX + totalGridW;
    const bGridB = backHalfY;
    const bGridT = backHalfY + totalGridH;

    // Margin masks
    const allL = Math.min(fGridL, bGridL);
    const allR = Math.max(fGridR, bGridR);
    const allB = Math.min(fGridB, bGridB);
    const allT = Math.max(fGridT, bGridT);
    drawMarginalMasks(page, paperWpt, paperHpt, allL, allR, allB, allT);

    // Fold axis mask
    if (!isTumble && fGridR < bGridL - 0.5) {
      page.drawRectangle({ x: fGridR, y: 0, width: bGridL - fGridR, height: paperHpt, color: white });
    }
    if (isTumble && fGridT < bGridB - 0.5) {
      page.drawRectangle({ x: 0, y: fGridT, width: paperWpt, height: bGridB - fGridT, color: white });
    }

    // Gutter masks — mask the non-bleed strip between adjacent pieces.
    // With trim step, adjacent pieces may overlap (when gutter < 2×bleed) or leave a gap (when >).
    if (gutterPt > 0.5) {
      for (let gc = 0; gc < hCols - 1; gc++) {
        const fPieceR = fGridL + gc * (trimWPt + gutterPt) + pieceW;
        const fPieceNextL = fGridL + (gc + 1) * (trimWPt + gutterPt);
        if (fPieceNextL > fPieceR + 0.5) page.drawRectangle({ x: fPieceR, y: fGridB, width: fPieceNextL - fPieceR, height: totalGridH, color: white });
        const bPieceR = bGridL + gc * (trimWPt + gutterPt) + pieceW;
        const bPieceNextL = bGridL + (gc + 1) * (trimWPt + gutterPt);
        if (bPieceNextL > bPieceR + 0.5) page.drawRectangle({ x: bPieceR, y: bGridB, width: bPieceNextL - bPieceR, height: totalGridH, color: white });
      }
      for (let gr = 0; gr < hRows - 1; gr++) {
        const fPieceT = fGridB + gr * (trimHPt + gutterPt) + pieceH;
        const fPieceNextB = fGridB + (gr + 1) * (trimHPt + gutterPt);
        if (fPieceNextB > fPieceT + 0.5) page.drawRectangle({ x: fGridL, y: fPieceT, width: totalGridW, height: fPieceNextB - fPieceT, color: white });
        const bPieceT = bGridB + gr * (trimHPt + gutterPt) + pieceH;
        const bPieceNextB = bGridB + (gr + 1) * (trimHPt + gutterPt);
        if (bPieceNextB > bPieceT + 0.5) page.drawRectangle({ x: bGridL, y: bPieceT, width: totalGridW, height: bPieceNextB - bPieceT, color: white });
      }
    }

    // Crop marks per half
    const sheetLabel = is2Sided
      ? ascii((opts.jobDescription || 'Job') + ' W&T ' + (s + 1) + ' (P' + (frontIdx + 1) + '+P' + (backIdx + 1) + ')')
      : ascii((opts.jobDescription || 'Job') + ' W&T ' + (s + 1));

    const halfMM = ((isTumble ? impo.printableH : impo.printableW) ?? 0) / 2;
    const baseMarks = {
      marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
      marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
      pieceW: impo.pieceW, pieceH: impo.pieceH,
      cols: hCols, rows: hRows,
      gutterMM: opts.gutter || 0, bleedMM: opts.bleed || 0,
      offsetX: impo.offsetX, offsetY: impo.offsetY,
      cropMarks: opts.showCropMarks,
    };

    const baseMarksOpts: DrawMarksOptions = {
      font,
      machineCat: opts.machineCat,
      showPlateSlug: opts.showPlateSlug,
      plateSlugEdge: opts.plateSlugEdge,
      colorBarEdge: opts.colorBarEdge,
      colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
    };

    if (isTumble) {
      const topMarks = { ...baseMarks, marginB: (impo.marginB ?? 0) + halfMM };
      const botMarks = { ...baseMarks, marginT: (impo.marginT ?? 0) + halfMM };
      drawPDFMarks(page, paperWpt, paperHpt, topMarks, { ...baseMarksOpts, jobName: sheetLabel + ' Front', colorBarPage: cbEmbed });
      drawPDFMarks(page, paperWpt, paperHpt, botMarks, { ...baseMarksOpts, jobName: '', foldLine: false });
    } else {
      const leftMarks = { ...baseMarks, marginR: (impo.marginR ?? 0) + halfMM };
      const rightMarks = { ...baseMarks, marginL: (impo.marginL ?? 0) + halfMM };
      drawPDFMarks(page, paperWpt, paperHpt, leftMarks, { ...baseMarksOpts, jobName: sheetLabel, colorBarPage: cbEmbed });
      drawPDFMarks(page, paperWpt, paperHpt, rightMarks, { ...baseMarksOpts, jobName: '', foldLine: false });
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Gang Run Export
// ═══════════════════════════════════════════════════════════

async function exportGangRun(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
  gangJobEmbedded?: EmbeddedPageInfo[][],
): Promise<void> {
  const impo = opts.imposition;
  const gangData = opts.gangData || impo.gangData;

  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const mLgr = mmToPt(impo.marginL ?? 0);
  const mBgr = mmToPt(impo.marginB ?? 0);
  const bleedPt = mmToPt(opts.bleed || 0);
  const gutterPt = mmToPt(opts.gutter || 0);
  const trimWpt = mmToPt(impo.trimW);
  const trimHpt = mmToPt(impo.trimH);
  const pieceW = mmToPt(impo.pieceW);
  const pieceH = mmToPt(impo.pieceH);
  const printableW = paperWpt - mLgr - mmToPt(impo.marginR ?? 0);
  const printableH = paperHpt - mmToPt(impo.marginT ?? 0) - mBgr;
  const trimGridW = impo.cols * trimWpt + Math.max(0, impo.cols - 1) * gutterPt;
  const trimGridH = impo.rows * trimHpt + Math.max(0, impo.rows - 1) * gutterPt;
  const offXpt = mmToPt(impo.offsetX || 0);
  const offYpt = mmToPt(impo.offsetY || 0);
  const cenX = mLgr + (printableW - trimGridW) / 2 + offXpt;
  const cenY = mBgr + (printableH - trimGridH) / 2 - offYpt;
  const grTrimStepW = trimWpt + gutterPt;
  const grTrimStepH = trimHpt + gutterPt;

  const grUserRot = opts.rotation || 0;
  const grBaseRot = (grUserRot === 180 || grUserRot === 270) ? 180 : 0;
  const grIntBleedPt = internalBleed(gutterPt, bleedPt);
  const hasMultiPdf = gangJobEmbedded && gangJobEmbedded.some(arr => arr.length > 0);
  const isDuplex = !!opts.isDuplex;
  const isH2H = (opts.duplexOrient || 'h2h') === 'h2h';

  const marksImpo = {
    marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
    marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
    trimW: impo.trimW, trimH: impo.trimH,
    cols: impo.cols, rows: impo.rows,
    gutterMM: opts.gutter || 0, bleedMM: opts.bleed || 0,
    offsetX: impo.offsetX, offsetY: impo.offsetY,
    cropMarks: opts.showCropMarks,
  };
  const marksOpts = {
    font,
    colorBarPage: cbEmbed,
    machineCat: opts.machineCat,
    showPlateSlug: opts.showPlateSlug,
    plateSlugEdge: opts.plateSlugEdge,
    colorBarEdge: opts.colorBarEdge,
    colorBarOffsetY: opts.colorBarOffsetY,
    colorBarScale: opts.colorBarScale,
  };

  // ─── FRONT PAGE ───
  const page = doc.addPage([paperWpt, paperHpt]);

  for (let row = 0; row < impo.rows; row++) {
    for (let col = 0; col < impo.cols; col++) {
      const posIdx = row * impo.cols + col;
      const pageNum = gangData?.cellAssign?.[posIdx] || 1;
      const jobIdx = pageNum - 1;

      let epObj: EmbeddedPageInfo | undefined;
      if (hasMultiPdf) {
        // Multi-PDF: first page of that job's PDF
        epObj = gangJobEmbedded![jobIdx]?.[0];
      } else {
        epObj = jobIdx >= 0 && jobIdx < embeddedPages.length ? embeddedPages[jobIdx] : undefined;
      }

      if (epObj) {
        const grCScale = (opts.contentScale || 100) / 100;
        const cell = impo.cells[posIdx];
        const grExtraRot = cell?.rotation ?? grBaseRot;
        const trimX = cenX + col * grTrimStepW;
        const trimY = cenY + (impo.rows - 1 - row) * grTrimStepH;
        const bleeds = cellBleed(col, row, impo.cols, impo.rows, bleedPt, grIntBleedPt);
        drawTrimToCell(page, epObj, trimX, trimY, trimWpt, trimHpt, bleeds, grExtraRot, grCScale);
      }
    }
  }

  drawUniformGutterMasks(page, cenX, cenY, impo.cols, impo.rows, trimWpt, trimHpt, gutterPt, bleedPt, paperWpt, paperHpt);
  const gridL = cenX - bleedPt, gridB = cenY - bleedPt;
  const gridR = cenX + trimGridW + bleedPt, gridT = cenY + trimGridH + bleedPt;
  drawMarginalMasks(page, paperWpt, paperHpt, gridL, gridR, gridB, gridT);
  drawPDFMarks(page, paperWpt, paperHpt, marksImpo, {
    ...marksOpts,
    jobName: ascii((opts.jobDescription || 'Job') + ' Gang Run' + (isDuplex ? ' Front' : '')),
  });

  // ─── BACK PAGE (duplex only) ───
  // Each cell shows the SAME job but its second PDF page (page 1).
  // Trim rect is mirrored (H2H flips X, H2F flips Y) so the back aligns with the front on press.
  if (isDuplex) {
    const backPage = doc.addPage([paperWpt, paperHpt]);

    for (let row = 0; row < impo.rows; row++) {
      for (let col = 0; col < impo.cols; col++) {
        const posIdx = row * impo.cols + col;
        // Prefer explicit cellAssignBack if present; otherwise same job as front (natural duplex).
        const pageNum = gangData?.cellAssignBack?.[posIdx] || gangData?.cellAssign?.[posIdx] || 1;
        const jobIdx = pageNum - 1;

        let epObj: EmbeddedPageInfo | undefined;
        if (hasMultiPdf) {
          // Multi-PDF: second page of that job's PDF (back side of the same design)
          const jobPages = gangJobEmbedded![jobIdx];
          epObj = jobPages?.[1] || jobPages?.[0]; // fallback to front if no back page provided
        } else {
          epObj = jobIdx >= 0 && jobIdx < embeddedPages.length ? embeddedPages[jobIdx] : undefined;
        }

        if (epObj) {
          const grCScale = (opts.contentScale || 100) / 100;
          const cell = impo.cells[posIdx];
          const grExtraRot = cell?.rotation ?? grBaseRot;
          const fTrimX = cenX + col * grTrimStepW;
          const fTrimY = cenY + (impo.rows - 1 - row) * grTrimStepH;
          const bTrimX = isH2H ? (paperWpt - fTrimX - trimWpt) : fTrimX;
          const bTrimY = isH2H ? fTrimY : (paperHpt - fTrimY - trimHpt);
          const f = cellBleed(col, row, impo.cols, impo.rows, bleedPt, grIntBleedPt);
          const b = isH2H
            ? { bL: f.bR, bR: f.bL, bT: f.bT, bB: f.bB }
            : { bL: f.bL, bR: f.bR, bT: f.bB, bB: f.bT };
          drawTrimToCell(backPage, epObj, bTrimX, bTrimY, trimWpt, trimHpt, b, grExtraRot, grCScale);
        }
      }
    }

    // Mirror grid position for masks + marks (H2H only — H2F keeps X same)
    const bCenX = isH2H ? (paperWpt - cenX - trimGridW) : cenX;
    const bCenY = isH2H ? cenY : (paperHpt - cenY - trimGridH);
    drawUniformGutterMasks(backPage, bCenX, bCenY, impo.cols, impo.rows, trimWpt, trimHpt, gutterPt, bleedPt, paperWpt, paperHpt);
    const bGridL = bCenX - bleedPt, bGridB = bCenY - bleedPt;
    const bGridR = bCenX + trimGridW + bleedPt, bGridT = bCenY + trimGridH + bleedPt;
    drawMarginalMasks(backPage, paperWpt, paperHpt, bGridL, bGridR, bGridB, bGridT);
    drawPDFMarks(backPage, paperWpt, paperHpt, marksImpo, {
      ...marksOpts,
      jobName: ascii((opts.jobDescription || 'Job') + ' Gang Run Back'),
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  Step Multi: per-block crop marks
// ═══════════════════════════════════════════════════════════

function drawStepMultiMarks(
  page: PDFPage,
  paperWpt: number,
  paperHpt: number,
  impo: { cropMarks?: boolean; gutterMM?: number; bleedMM?: number },
  blocks: StepBlock[],
  mLpt: number,
  mBpt: number,
  printWpt: number,
  printHpt: number,
  blPt: number,
  machineCat?: string,
) {
  if (impo.cropMarks === false) return;
  const regAll = cmyk(1, 1, 1, 1);
  const black = machineCat === 'offset' ? regAll : cmyk(0, 0, 0, 1);
  const markLen = mmToPt(4);
  const markOff = mmToPt(1);
  const gutterPt = mmToPt(impo.gutterMM || 0);

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.cols === 0) continue;
    const rot = block.rotation || 0;
    let tw = block.trimW, th = block.trimH;
    if (rot === 90 || rot === 270) { const tmp = tw; tw = th; th = tmp; }
    const cellWpt = mmToPt(tw + (impo.bleedMM || 0) * 2);
    const cellHpt = mmToPt(th + (impo.bleedMM || 0) * 2);

    const bxPt = mLpt + mmToPt(block.x);
    const byPt = mBpt + printHpt - mmToPt(block.y) - mmToPt(block.blockH);

    // Collect trim cut positions
    const vCuts: number[] = [], hCuts: number[] = [];
    for (let c = 0; c < block.cols; c++) {
      const cx = bxPt + c * (cellWpt + gutterPt);
      vCuts.push(cx + blPt);
      vCuts.push(cx + cellWpt - blPt);
    }
    for (let r = 0; r < block.rows; r++) {
      const cy = byPt + mmToPt(block.blockH) - r * (cellHpt + gutterPt);
      hCuts.push(cy - blPt);
      hCuts.push(cy - cellHpt + blPt);
    }

    // Deduplicate
    vCuts.sort((a, b) => a - b);
    hCuts.sort((a, b) => a - b);
    const uV = [vCuts[0]];
    for (let vi = 1; vi < vCuts.length; vi++) { if (vCuts[vi] - uV[uV.length - 1] > 0.1) uV.push(vCuts[vi]); }
    const uH = [hCuts[0]];
    for (let hi = 1; hi < hCuts.length; hi++) { if (hCuts[hi] - uH[uH.length - 1] > 0.1) uH.push(hCuts[hi]); }

    const gL = uV[0], gR = uV[uV.length - 1], gB = uH[0], gT = uH[uH.length - 1];

    // Perimeter marks
    for (let vmi = 0; vmi < uV.length; vmi++) {
      const vx = uV[vmi];
      page.drawLine({ start: { x: vx, y: gT + markOff }, end: { x: vx, y: gT + markOff + markLen }, thickness: 0.5, color: black });
      page.drawLine({ start: { x: vx, y: gB - markOff }, end: { x: vx, y: gB - markOff - markLen }, thickness: 0.5, color: black });
    }
    for (let hmi = 0; hmi < uH.length; hmi++) {
      const hy = uH[hmi];
      page.drawLine({ start: { x: gL - markOff, y: hy }, end: { x: gL - markOff - markLen, y: hy }, thickness: 0.5, color: black });
      page.drawLine({ start: { x: gR + markOff, y: hy }, end: { x: gR + markOff + markLen, y: hy }, thickness: 0.5, color: black });
    }

    // Gutter marks inside block
    if (gutterPt > mmToPt(0.5)) {
      const gutML = Math.min(markLen, gutterPt / 2 - markOff);
      if (gutML > mmToPt(0.3)) {
        for (let vg = 0; vg < block.cols - 1; vg++) {
          const gvX = bxPt + (vg + 1) * cellWpt + vg * gutterPt;
          for (let hci = 0; hci < uH.length; hci++) {
            page.drawLine({ start: { x: gvX + markOff, y: uH[hci] }, end: { x: gvX + markOff + gutML, y: uH[hci] }, thickness: 0.5, color: black });
            page.drawLine({ start: { x: gvX + gutterPt - markOff, y: uH[hci] }, end: { x: gvX + gutterPt - markOff - gutML, y: uH[hci] }, thickness: 0.5, color: black });
          }
        }
        for (let hg = 0; hg < block.rows - 1; hg++) {
          const ghY = byPt + mmToPt(block.blockH) - (hg + 1) * cellHpt - hg * gutterPt;
          for (let vci = 0; vci < uV.length; vci++) {
            page.drawLine({ start: { x: uV[vci], y: ghY - markOff }, end: { x: uV[vci], y: ghY - markOff - gutML }, thickness: 0.5, color: black });
            page.drawLine({ start: { x: uV[vci], y: ghY - gutterPt + markOff }, end: { x: uV[vci], y: ghY - gutterPt + markOff + gutML }, thickness: 0.5, color: black });
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  Step Multi Export
// ═══════════════════════════════════════════════════════════

async function exportStepMulti(
  doc: PDFDocument,
  opts: ExportOptions,
  embeddedPages: EmbeddedPageInfo[],
  font: PDFFont,
  cbEmbed: PDFEmbeddedPage | null,
  smBlockEmbedded?: EmbeddedPageInfo[][],
): Promise<void> {
  const impo = opts.imposition;
  const blocks = opts.blocks || impo.blocks || [];
  if (blocks.length === 0) return;

  const paperWpt = mmToPt(impo.paperW);
  const paperHpt = mmToPt(impo.paperH);
  const mLpt = mmToPt(impo.marginL ?? 0), mBpt = mmToPt(impo.marginB ?? 0);
  const printWpt = paperWpt - mLpt - mmToPt(impo.marginR ?? 0);
  const printHpt = paperHpt - mmToPt(impo.marginT ?? 0) - mBpt;
  const bl = opts.bleed || 0;
  const blPt = mmToPt(bl);
  const gutMM = opts.gutter || 0;
  const gutPt = mmToPt(gutMM);

  const smContentScale = (opts.contentScale || 100) / 100;
  const smIntBleedPt = internalBleed(gutPt, blPt);

  // Front side
  const frontPage = doc.addPage([paperWpt, paperHpt]);
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.cols === 0) continue;
    const rot = block.rotation || 0;
    let tw = block.trimW, th = block.trimH;
    if (rot === 90 || rot === 270) { const tmp = tw; tw = th; th = tmp; }
    const trimWpt = mmToPt(tw);
    const trimHpt = mmToPt(th);
    const cellWpt = trimWpt + 2 * blPt;
    const cellHpt = trimHpt + 2 * blPt;

    const bxPt = mLpt + mmToPt(block.x);
    const byPt = mBpt + printHpt - mmToPt(block.y) - mmToPt(block.blockH);

    // Per-block PDF or global PDF fallback
    const hasBlockPdf = smBlockEmbedded && smBlockEmbedded[bi] && smBlockEmbedded[bi].length > 0;
    const blockPages = hasBlockPdf ? smBlockEmbedded![bi] : embeddedPages;
    const pageIdx = hasBlockPdf ? 0 : block.pageNum - 1;
    if (pageIdx < 0 || pageIdx >= blockPages.length) continue;
    const epObj = blockPages[pageIdx];

    for (let row = 0; row < block.rows; row++) {
      for (let col = 0; col < block.cols; col++) {
        const cx = bxPt + col * (cellWpt + gutPt);
        const cy = byPt + mmToPt(block.blockH) - (row + 1) * cellHpt - row * gutPt;
        const trimX = cx + blPt;
        const trimY = cy + blPt;
        const bleeds = cellBleed(col, row, block.cols, block.rows, blPt, smIntBleedPt);
        drawTrimToCell(frontPage, epObj, trimX, trimY, trimWpt, trimHpt, bleeds, rot, smContentScale);
      }
    }
  }

  // White masking outside all blocks
  const white = cmyk(0, 0, 0, 0);
  if (mLpt > 0.5) frontPage.drawRectangle({ x: 0, y: 0, width: mLpt, height: paperHpt, color: white });
  const mRpt = mmToPt(impo.marginR ?? 0);
  if (mRpt > 0.5) frontPage.drawRectangle({ x: paperWpt - mRpt, y: 0, width: mRpt, height: paperHpt, color: white });
  if (mBpt > 0.5) frontPage.drawRectangle({ x: mLpt, y: 0, width: printWpt, height: mBpt, color: white });
  const mTpt = mmToPt(impo.marginT ?? 0);
  if (mTpt > 0.5) frontPage.drawRectangle({ x: mLpt, y: paperHpt - mTpt, width: printWpt, height: mTpt, color: white });

  // Per-block gutter masking
  for (let gbi = 0; gbi < blocks.length; gbi++) {
    const gb = blocks[gbi];
    if (gb.cols === 0 || gutPt < 0.5) continue;
    const gRot = gb.rotation || 0;
    let gtw = gb.trimW, gth = gb.trimH;
    if (gRot === 90 || gRot === 270) { const tmp = gtw; gtw = gth; gth = tmp; }
    const gcWpt = mmToPt(gtw + bl * 2);
    const gcHpt = mmToPt(gth + bl * 2);
    const gbxPt = mLpt + mmToPt(gb.x);
    const gbyPt = mBpt + printHpt - mmToPt(gb.y) - mmToPt(gb.blockH);

    // Vertical gutters
    for (let vg2 = 0; vg2 < gb.cols - 1; vg2++) {
      const gvx = gbxPt + (vg2 + 1) * gcWpt + vg2 * gutPt;
      const gutL2 = gvx + Math.min(blPt, gutPt / 2);
      const gutR2 = gvx + gutPt - Math.min(blPt, gutPt / 2);
      if (gutR2 > gutL2 + 0.5) frontPage.drawRectangle({ x: gutL2, y: gbyPt, width: gutR2 - gutL2, height: mmToPt(gb.blockH), color: white });
    }
    // Horizontal gutters
    for (let hg2 = 0; hg2 < gb.rows - 1; hg2++) {
      const ghy = gbyPt + mmToPt(gb.blockH) - (hg2 + 1) * gcHpt - hg2 * gutPt;
      const gutB2 = ghy - gutPt + Math.min(blPt, gutPt / 2);
      const gutT2 = ghy - Math.min(blPt, gutPt / 2);
      if (gutT2 > gutB2 + 0.5) frontPage.drawRectangle({ x: gbxPt, y: gutB2, width: mmToPt(gb.blockW), height: gutT2 - gutB2, color: white });
    }
  }

  // Crop marks
  drawStepMultiMarks(frontPage, paperWpt, paperHpt, { cropMarks: opts.showCropMarks, gutterMM: gutMM, bleedMM: bl }, blocks, mLpt, mBpt, printWpt, printHpt, blPt, opts.machineCat);

  const smJobName = ascii(opts.jobDescription || 'Step Multi');
  drawPDFMarks(frontPage, paperWpt, paperHpt, {
    marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
    marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
    pieceW: impo.pieceW, pieceH: impo.pieceH,
    cols: impo.cols, rows: impo.rows,
    gutterMM: gutMM, bleedMM: bl,
    offsetX: impo.offsetX, offsetY: impo.offsetY,
    cropMarks: opts.showCropMarks,
  }, {
    font, jobName: smJobName, colorBarPage: cbEmbed, skipCropMarks: true,
    machineCat: opts.machineCat,
    showPlateSlug: opts.showPlateSlug,
    plateSlugEdge: opts.plateSlugEdge,
    colorBarEdge: opts.colorBarEdge,
    colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
  });

  // Back side (if any block has backPageNum)
  const hasBack = blocks.some(b => b.backPageNum && b.backPageNum > 0);
  if (hasBack) {
    const backPage = doc.addPage([paperWpt, paperHpt]);
    for (let bbi = 0; bbi < blocks.length; bbi++) {
      const bb = blocks[bbi];
      if (bb.cols === 0 || !bb.backPageNum || bb.backPageNum < 1) continue;
      const bRot = bb.rotation || 0;
      let btw = bb.trimW, bth = bb.trimH;
      if (bRot === 90 || bRot === 270) { const tmp = btw; btw = bth; bth = tmp; }
      const bcWpt = mmToPt(btw + bl * 2);
      const bcHpt = mmToPt(bth + bl * 2);
      const bbxPt = mLpt + mmToPt(bb.x);
      const bbyPt = mBpt + printHpt - mmToPt(bb.y) - mmToPt(bb.blockH);

      const hasBackBlockPdf = smBlockEmbedded && smBlockEmbedded[bbi] && smBlockEmbedded[bbi].length > 1;
      const backBlockPages = hasBackBlockPdf ? smBlockEmbedded![bbi] : embeddedPages;
      const bpIdx = hasBackBlockPdf ? 1 : bb.backPageNum - 1;
      if (bpIdx < 0 || bpIdx >= backBlockPages.length) continue;
      const bepObj = backBlockPages[bpIdx];
      const bTrimWpt = mmToPt(bRot === 90 || bRot === 270 ? bb.trimH : bb.trimW);
      const bTrimHpt = mmToPt(bRot === 90 || bRot === 270 ? bb.trimW : bb.trimH);

      // Mirror X for back side
      for (let brow = 0; brow < bb.rows; brow++) {
        for (let bcol = 0; bcol < bb.cols; bcol++) {
          const mirCol = bb.cols - 1 - bcol;
          const bcx = bbxPt + mirCol * (bcWpt + gutPt);
          const bcy = bbyPt + mmToPt(bb.blockH) - (brow + 1) * bcHpt - brow * gutPt;
          const bTrimX = bcx + blPt;
          const bTrimY = bcy + blPt;
          // Back-side mirror: L↔R swap in per-cell bleeds to match mirrored column order.
          const f = cellBleed(bcol, brow, bb.cols, bb.rows, blPt, smIntBleedPt);
          const bBleeds = { bL: f.bR, bR: f.bL, bT: f.bT, bB: f.bB };
          drawTrimToCell(backPage, bepObj, bTrimX, bTrimY, bTrimWpt, bTrimHpt, bBleeds, 0, smContentScale);
        }
      }
    }

    // Margin masking on back
    if (mLpt > 0.5) backPage.drawRectangle({ x: 0, y: 0, width: mLpt, height: paperHpt, color: white });
    if (mRpt > 0.5) backPage.drawRectangle({ x: paperWpt - mRpt, y: 0, width: mRpt, height: paperHpt, color: white });
    if (mBpt > 0.5) backPage.drawRectangle({ x: mLpt, y: 0, width: printWpt, height: mBpt, color: white });
    if (mTpt > 0.5) backPage.drawRectangle({ x: mLpt, y: paperHpt - mTpt, width: printWpt, height: mTpt, color: white });

    drawStepMultiMarks(backPage, paperWpt, paperHpt, { cropMarks: opts.showCropMarks, gutterMM: gutMM, bleedMM: bl }, blocks, mLpt, mBpt, printWpt, printHpt, blPt, opts.machineCat);
    drawPDFMarks(backPage, paperWpt, paperHpt, {
      marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
      marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
      pieceW: impo.pieceW, pieceH: impo.pieceH,
      cols: impo.cols, rows: impo.rows,
      gutterMM: gutMM, bleedMM: bl,
      offsetX: impo.offsetX, offsetY: impo.offsetY,
      cropMarks: opts.showCropMarks,
    }, {
      font, jobName: smJobName + ' (back)', colorBarPage: cbEmbed, skipCropMarks: true,
      machineCat: opts.machineCat,
      showPlateSlug: opts.showPlateSlug,
      plateSlugEdge: opts.plateSlugEdge,
      colorBarEdge: opts.colorBarEdge,
      colorBarOffsetY: opts.colorBarOffsetY,
        colorBarScale: opts.colorBarScale,
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  Main Dispatcher
// ═══════════════════════════════════════════════════════════

export async function exportImpositionPDF(options: ExportOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Prepare color bar
  const cbEmbed = options.showColorBar
    ? await prepareColorBar(doc, options.colorBarPdfBytes, options.colorBarType)
    : null;

  // Embed source PDF pages
  let embeddedPages: EmbeddedPageInfo[] = [];
  if (options.pdfBytes && options.pdfBytes.length > 0) {
    const embedMode = (options.imposition.mode === 'booklet' || options.imposition.mode === 'perfect_bound')
      ? 'trim'
      : 'nup';
    embeddedPages = await embedSourcePages(doc, options.pdfBytes, embedMode, options.bleed || 0, options.keepSourceMarks, options.pageRange);
  }

  const mode = options.imposition.mode;

  if (mode === 'booklet') {
    await exportBooklet(doc, options, embeddedPages, font, cbEmbed);
  } else if (mode === 'perfect_bound') {
    await exportPerfectBound(doc, options, embeddedPages, font, cbEmbed);
  } else if (mode === 'cutstack') {
    await exportCutStack(doc, options, embeddedPages, font, cbEmbed);
  } else if (mode === 'workturn') {
    await exportWorkTurn(doc, options, embeddedPages, font, cbEmbed);
  } else if (mode === 'gangrun') {
    // Multi-PDF: embed each job's PDF separately
    let gangJobEmbedded: EmbeddedPageInfo[][] | undefined;
    if (options.gangJobPdfBytes && options.gangJobPdfBytes.some(Boolean)) {
      gangJobEmbedded = [];
      for (const jobBytes of options.gangJobPdfBytes) {
        if (jobBytes && jobBytes.length > 0) {
          gangJobEmbedded.push(await embedSourcePages(doc, jobBytes, 'nup', options.bleed || 0, options.keepSourceMarks));
        } else {
          gangJobEmbedded.push([]);
        }
      }
    }
    await exportGangRun(doc, options, embeddedPages, font, cbEmbed, gangJobEmbedded);
  } else if (mode === 'stepmulti') {
    // Multi-PDF: embed each block's PDF separately
    let smBlockEmbedded: EmbeddedPageInfo[][] | undefined;
    if (options.smBlockPdfBytes && options.smBlockPdfBytes.some(Boolean)) {
      smBlockEmbedded = [];
      for (const blockBytes of options.smBlockPdfBytes) {
        if (blockBytes && blockBytes.length > 0) {
          smBlockEmbedded.push(await embedSourcePages(doc, blockBytes, 'nup', options.bleed || 0, options.keepSourceMarks));
        } else {
          smBlockEmbedded.push([]);
        }
      }
    }
    await exportStepMulti(doc, options, embeddedPages, font, cbEmbed, smBlockEmbedded);
  } else {
    // Default: N-Up
    await exportNUp(doc, options, embeddedPages, font, cbEmbed);
  }

  return doc.save();
}

// ═══════════════════════════════════════════════════════════
//  Browser Download Trigger
// ═══════════════════════════════════════════════════════════

/**
 * Canonical export filename builder — unified across all export paths
 * (download, customer folder, job folder, plate order, snapshot).
 *
 * Format: `[quoteNumber|imposed]_[trimWxtrimH]_[sheetWxsheetH]_[modeLabel].pdf`
 * Example: `QT-2026-0001_210x297_487x330_nup_2UP.pdf`
 *
 * Pass a `suffix` to append before `.pdf` (e.g. '_plates' for plate orders).
 */
export function buildExportFilename(options: ExportOptions, suffix = ''): string {
  const impo = options.imposition;
  const jobSize = Math.round(options.jobW || 0) + 'x' + Math.round(options.jobH || 0);
  const paperSize = Math.round(impo.paperW) + 'x' + Math.round(impo.paperH);
  const modeLabel = impo.mode === 'nup' ? 'nup_' + impo.ups + 'UP'
    : impo.mode === 'booklet' ? 'booklet'
    : impo.mode === 'perfect_bound' ? 'pb'
    : impo.mode === 'cutstack' ? 'cutstack_' + impo.ups + 'UP'
    : impo.mode === 'workturn' ? 'workturn_' + impo.ups + 'UP'
    : impo.mode === 'gangrun' ? 'gangrun_' + impo.ups + 'UP'
    : impo.mode === 'stepmulti' ? 'step_' + (impo.blocks?.length || 0) + 'blk'
    : impo.mode;
  // Prefer quote number; fall back to "imposed". Sanitize for filesystem safety.
  const rawPrefix = (options.quoteNumber || '').trim() || 'imposed';
  const prefix = rawPrefix.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  const pgSuffix = options.pageRange ? '_pg' + options.pageRange.replace(/,/g, '-') : '';
  return `${prefix}_${jobSize}_${paperSize}_${modeLabel}${pgSuffix}${suffix}.pdf`;
}

export async function downloadImpositionPDF(options: ExportOptions, filename?: string): Promise<void> {
  const pdfBytes = await exportImpositionPDF(options);
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || buildExportFilename(options);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
