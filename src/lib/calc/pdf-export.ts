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

// ─── Constants ───

const MM = 72 / 25.4; // mm → PDF points

function mmToPt(mm: number): number {
  return mm * MM;
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

// ─── Embed Source Pages ───

async function embedSourcePages(
  outputDoc: PDFDocument,
  sourceBytes: Uint8Array,
  mode: string,
  bleedMM: number,
  keepSourceMarks?: boolean,
): Promise<EmbeddedPageInfo[]> {
  const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const embedded: EmbeddedPageInfo[] = [];
  const bleedPt = bleedMM * MM;

  for (let i = 0; i < srcPages.length; i++) {
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

  const cropGap = markOffset;

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
    const slugJobText = options.jobName ? (' \u2014 ' + options.jobName).replace(/[^\x20-\x7E\u2014]/g, '') : '';

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

  // Job info text
  if (options?.jobName && options.font) {
    const safeText = ascii(options.jobName + ' | ' + new Date().toLocaleDateString('en-GB'));
    page.drawText(safeText, {
      x: mmToPt(5), y: paperHpt - mmToPt(3),
      size: 6, font: options.font, color: cmyk(0, 0, 0, 0.6),
    });
  }

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
    const intBleedPlace = gutterPt <= 0 ? 0 : (gutterPt >= 2 * bleedPt ? bleedPt : gutterPt / 2);

    for (let row = 0; row < impo.rows; row++) {
      for (let col = 0; col < impo.cols; col++) {
        const pageIdx = s;
        if (pageIdx < embeddedPages.length) {
          const epObj = embeddedPages[pageIdx];
          const epPage = epObj.page;
          // Trim position on grid, then offset by bleed for cell placement
          const frontTrimX = cenX + col * trimStepW;
          const trimYpos = cenY + (impo.rows - 1 - row) * trimStepH;
          const frontCellX = frontTrimX - bleedPt;
          const cellY = trimYpos - bleedPt;

          // Per-cell bleed (asymmetric) — front-side perspective
          const cBL = col === 0 ? bleedPt : intBleedPlace;
          const cBR = col === impo.cols - 1 ? bleedPt : intBleedPlace;
          const cBB = row === impo.rows - 1 ? bleedPt : intBleedPlace;
          const cBT = row === 0 ? bleedPt : intBleedPlace;

          // Unified page placement
          const epSrcRot = (360 - (epObj.rotation || 0)) % 360;
          const gridRot = isRotated ? (isBackSide ? 90 : 270) : 0;
          const userRot = opts.rotation || 0;
          const extraRot0 = (userRot === 180 || userRot === 270) ? 180 : 0;
          let extraRot = extraRot0;
          if (opts.duplexOrient === 'h2f' && (row % 2 === 1)) extraRot = (extraRot + 180) % 360;
          const h2fRot = (isBackSide && opts.duplexOrient === 'h2f') ? 180 : 0;
          const totalRot = (epSrcRot + gridRot + extraRot + h2fRot) % 360;

          const epRawW = epPage.width || pieceW;
          const epRawH = epPage.height || pieceH;

          // Scale PDF so its content fills the CELL (trim + bleed on all sides)
          // This ensures TrimBox aligns with trim area and bleed extends beyond
          const cScaleFactor = (opts.contentScale || 100) / 100;
          const needsSwap = (totalRot === 90 || totalRot === 270);
          const scaleX = (needsSwap ? (pieceH / epRawW) : (pieceW / epRawW)) * cScaleFactor;
          const scaleY = (needsSwap ? (pieceW / epRawH) : (pieceH / epRawH)) * cScaleFactor;

          // Place PDF at CELL position (trim - bleed)
          const frontCellX = frontTrimX - bleedPt;
          const cellY = trimYpos - bleedPt;
          let visX: number, visY: number;
          if (isBackSide && opts.duplexOrient === 'h2f') {
            visX = frontCellX;
            visY = paperHpt - cellY - pieceH;
          } else {
            visX = isBackSide ? (paperWpt - frontCellX - pieceW) : frontCellX;
            visY = cellY;
          }

          // Clip rectangle — based on trim position with asymmetric bleed
          // For back H2H: L↔R swap. For back H2F: T↔B swap.
          let vcBL = cBL, vcBR = cBR, vcBT = cBT, vcBB = cBB;
          if (isBackSide && opts.duplexOrient !== 'h2f') { vcBL = cBR; vcBR = cBL; }
          if (isBackSide && opts.duplexOrient === 'h2f') { vcBT = cBB; vcBB = cBT; }
          // visX is cell pos (trim - bleed), so trim pos = visX + bleedPt
          const visTrimX = visX + bleedPt;
          const visTrimY = visY + bleedPt;
          const clipX = visTrimX - vcBL;
          const clipY = visTrimY - vcBB;
          const clipW = trimWpt + vcBL + vcBR;
          const clipH = trimHpt + vcBT + vcBB;

          // Adjust draw origin for rotation (using cell/piece dimensions)
          let drawX = visX, drawY = visY;
          if (totalRot === 90) { drawX = visX + pieceW; }
          else if (totalRot === 270) { drawY = visY + pieceH; }
          else if (totalRot === 180) { drawX = visX + pieceW; drawY = visY + pieceH; }

          // Clip to asymmetric cell bounds, then draw
          page.pushOperators(pushGraphicsState(), rectangle(clipX, clipY, clipW, clipH), clip(), endPath());
          const drawOpts: Parameters<PDFPage['drawPage']>[1] = { x: drawX, y: drawY, xScale: scaleX, yScale: scaleY };
          if (totalRot) drawOpts.rotate = degrees(totalRot);
          page.drawPage(epPage, drawOpts);
          page.pushOperators(popGraphicsState());
        }
      }
    }

    // When preserving source marks, skip masking + own crop marks
    if (!opts.keepSourceMarks) {
      const white = cmyk(0, 0, 0, 0);
      const maskCenX = isBackSide ? (paperWpt - cenX - trimGridW) : cenX;

      // Asymmetric gutter masks — mask area between cells where internal bleed is 0 or reduced
      // Progressive internal bleed: gutter=0 → 0, gutter<2*bleed → gutter/2, else full bleed
      const intBleedPt = gutterPt <= 0 ? 0 : (gutterPt >= 2 * bleedPt ? bleedPt : gutterPt / 2);
      if (gutterPt > 0.1) {
        for (let gc = 0; gc < impo.cols - 1; gc++) {
          // Gutter starts after right trim edge
          const gx = maskCenX + (gc + 1) * trimWpt + gc * gutterPt;
          const gutL = gx + intBleedPt;
          const gutR = gx + gutterPt - intBleedPt;
          if (gutR > gutL + 0.5) page.drawRectangle({ x: gutL, y: 0, width: gutR - gutL, height: paperHpt, color: white });
        }
        for (let gr = 0; gr < impo.rows - 1; gr++) {
          const gy = cenY + (gr + 1) * trimHpt + gr * gutterPt;
          const gutB = gy + intBleedPt;
          const gutT = gy + gutterPt - intBleedPt;
          if (gutT > gutB + 0.5) page.drawRectangle({ x: 0, y: gutB, width: paperWpt, height: gutT - gutB, color: white });
        }
      }
      // Gutter=0 (μονοτομή): no masking — bleeds overlap naturally at cut line

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
  const rows = impo.rows || 1;
  const spreadsAcross = (impo as any).spreadsAcross || 1;
  const sigsPerSheet = (impo as any).sigsPerSheet || (spreadsAcross * rows);
  const spreadWpt = 2 * pieceW;
  const gapVpt = mmToPt((impo as any).spineOffset || 0);
  const gapHpt = mmToPt((impo as any).rowGap || 0);
  const totalGridW = spreadsAcross * spreadWpt + (spreadsAcross - 1) * gapVpt;
  const totalGridH = rows * pieceH + (rows - 1) * gapHpt;
  const gridX = mL + (printableW - totalGridW) / 2 + offXpt;
  const gridY = mB + (printableH - totalGridH) / 2 - offYpt;

  const totalSigs = sigMap.totalSheets;
  const trimWpt = mmToPt(impo.trimW || opts.jobW || 0);
  const trimHpt = mmToPt(impo.trimH || opts.jobH || 0);
  const pageRot = (impo as any).pageRotation || 0;

  // Crop marks config for booklet
  const bkMarks = {
    marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
    marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
    cols: spreadsAcross,
    rows,
    pieceW: 2 * (impo.trimW || opts.jobW || 0) + 2 * (opts.bleed || 0),
    pieceH: (impo.trimH || opts.jobH || 0) + 2 * (opts.bleed || 0),
    gutterMM: (impo as any).spineOffset || 0,
    gutterRowMM: (impo as any).rowGap || 0,
    bleedMM: opts.bleed || 0,
    offsetX: impo.offsetX, offsetY: impo.offsetY,
    cropMarks: opts.showCropMarks,
  };

  const canRepeat = sigsPerSheet >= totalSigs;
  const totalPressSheets = canRepeat ? 1 : Math.ceil(totalSigs / sigsPerSheet);

  for (let ps = 0; ps < totalPressSheets; ps++) {
    const frontPage = doc.addPage([paperWpt, paperHpt]);
    const backPage = doc.addPage([paperWpt, paperHpt]);

    for (let row = 0; row < rows; row++) {
      for (let sp2 = 0; sp2 < spreadsAcross; sp2++) {
        const slotIdx = row * spreadsAcross + sp2;
        let si: number;
        if (canRepeat) {
          si = slotIdx % totalSigs;
        } else {
          si = ps * sigsPerSheet + slotIdx;
          if (si >= totalSigs) continue;
        }
        const sheet = sigMap.sheets[si];
        const creepPt = mmToPt(creep[si] || 0);
        const rowY = gridY + (rows - 1 - row) * (pieceH + gapHpt);
        const spreadX = gridX + sp2 * (spreadWpt + gapVpt);
        const foldX = spreadX + bleedPt + trimWpt;

        // Front side
        for (let fp = 0; fp < 2; fp++) {
          const pn = sheet.front[fp];
          if (pn > embeddedPages.length) continue;
          const shiftX = fp === 0 ? creepPt : -creepPt;
          const ep = embeddedPages[pn - 1];
          const epPage = ep.page;
          const trimXf = spreadX + bleedPt + fp * trimWpt + shiftX;
          const trimYf = rowY + bleedPt;
          const clipL = fp === 0 ? spreadX : foldX;
          const clipW = fp === 0 ? (foldX - spreadX) : (spreadX + spreadWpt - foldX);
          frontPage.pushOperators(pushGraphicsState(), rectangle(clipL, rowY, clipW, pieceH), clip(), endPath());
          const headToHead = (impo as any).headToHead;
          const rot = pageRot + ((headToHead && fp === 1) ? 180 : 0);
          if (rot % 360 !== 0) {
            drawEmbeddedPage(frontPage, ep, trimXf + ep.trimOffsetX + ep.trimW, trimYf + ep.trimOffsetY + ep.trimH, epPage.width, epPage.height, rot);
          } else {
            drawEmbeddedPage(frontPage, ep, trimXf - ep.trimOffsetX, trimYf - ep.trimOffsetY, epPage.width, epPage.height);
          }
          frontPage.pushOperators(popGraphicsState());
        }

        // Back side
        for (let bp = 0; bp < 2; bp++) {
          const pnb = sheet.back[bp];
          if (pnb > embeddedPages.length) continue;
          const shiftXb = bp === 0 ? creepPt : -creepPt;
          const epb = embeddedPages[pnb - 1];
          const epPageB = epb.page;
          const trimXbk = spreadX + bleedPt + bp * trimWpt + shiftXb;
          const trimYbk = rowY + bleedPt;
          const clipLb = bp === 0 ? spreadX : foldX;
          const clipWb = bp === 0 ? (foldX - spreadX) : (spreadX + spreadWpt - foldX);
          backPage.pushOperators(pushGraphicsState(), rectangle(clipLb, rowY, clipWb, pieceH), clip(), endPath());
          const headToHead = (impo as any).headToHead;
          const rotB = pageRot + ((headToHead && bp === 1) ? 180 : 0);
          if (rotB % 360 !== 0) {
            drawEmbeddedPage(backPage, epb, trimXbk + epb.trimOffsetX + epb.trimW, trimYbk + epb.trimOffsetY + epb.trimH, epPageB.width, epPageB.height, rotB);
          } else {
            drawEmbeddedPage(backPage, epb, trimXbk - epb.trimOffsetX, trimYbk - epb.trimOffsetY, epPageB.width, epPageB.height);
          }
          backPage.pushOperators(popGraphicsState());
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
          const epPage = ep.page;
          const pairIdx = Math.floor(col / 2);
          const colInPair = col % 2;
          const pairX = blockBaseX + pairIdx * pairW + (hasVGap && pairIdx >= 1 ? fgVpt : 0);
          const foldXLocal = pairX + bleedPt + trimWpt;
          const trimX = pairX + bleedPt + colInPair * trimWpt;
          const trimY = rowY + bleedPt;

          const clipL = (colInPair === 0) ? pairX : foldXLocal;
          const clipW = (colInPair === 0) ? (foldXLocal - pairX) : (pairX + pairW - foldXLocal);
          page.pushOperators(pushGraphicsState(), rectangle(clipL, rowY, clipW, pieceHpt), clip(), endPath());

          if (cellRot) {
            drawEmbeddedPage(page, ep, trimX + ep.trimOffsetX + ep.trimW, trimY + ep.trimOffsetY + ep.trimH, epPage.width, epPage.height, 180);
          } else {
            drawEmbeddedPage(page, ep, trimX - ep.trimOffsetX, trimY - ep.trimOffsetY, epPage.width, epPage.height);
          }

          page.pushOperators(popGraphicsState());
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

    // Crop marks
    const pbMarksImpo = {
      marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
      marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
      cols: numPairs * sigsAcross,
      rows: sigRows * sigsDown,
      pieceW: pairW * 25.4 / 72,
      pieceH: impo.pieceH,
      gutterMM: (impo as any).gapVmm || 0,
      gutterRowMM: (impo as any).gapHmm || 0,
      bleedMM: opts.bleed || 0,
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
    drawPDFMarks(frontP, paperWpt, paperHpt, pbMarksImpo, { ...marksOpts, jobName: ascii((pressLabel ? pressLabel + ' ' : '') + 'Front (' + sigsAcross + '\u00d7' + sigsDown + ')') });
    drawPDFMarks(backP, paperWpt, paperHpt, pbMarksImpo, { ...marksOpts, jobName: ascii((pressLabel ? pressLabel + ' ' : '') + 'Back (' + sigsAcross + '\u00d7' + sigsDown + ')') });

    // Mask outer edges
    const white = cmyk(0, 0, 0, 0);
    const gridL = gridOriginX;
    const gridR = gridOriginX + totalGridW;
    const gridB = gridOriginY;
    const gridT = gridOriginY + totalGridH;
    for (const pg of [frontP, backP]) {
      drawMarginalMasks(pg, paperWpt, paperHpt, gridL, gridR, gridB, gridT);
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

  const sheetsNeeded = opts.csStackSize || Math.max(1, embeddedPages.length);

  // Helper: draw masking on a page (asymmetric gutter masks)
  const intBleedCs = gutterPt <= 0 ? 0 : (gutterPt >= 2 * bleedPt ? bleedPt : gutterPt / 2);
  const csMask = (pg: PDFPage, mirrored: boolean) => {
    const white = cmyk(0, 0, 0, 0);
    const mCenX = mirrored ? (paperWpt - cenX - trimGridW) : cenX;
    if (gutterPt > 0.1) {
      for (let gc = 0; gc < impo.cols - 1; gc++) {
        const gx = mCenX + (gc + 1) * trimWpt + gc * gutterPt;
        const gutL = gx + intBleedCs;
        const gutR = gx + gutterPt - intBleedCs;
        if (gutR > gutL + 0.5) pg.drawRectangle({ x: gutL, y: 0, width: gutR - gutL, height: paperHpt, color: white });
      }
      for (let gr = 0; gr < impo.rows - 1; gr++) {
        const gy = cenY + (gr + 1) * trimHpt + gr * gutterPt;
        const gutB = gy + intBleedCs;
        const gutT = gy + gutterPt - intBleedCs;
        if (gutT > gutB + 0.5) pg.drawRectangle({ x: 0, y: gutB, width: paperWpt, height: gutT - gutB, color: white });
      }
    }
    // Gutter=0 (μονοτομή): no masking — bleeds overlap naturally at cut line
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
          const epPage = ep.page;
          // Trim position → cell position (offset by bleed)
          const cellX = cenX + col * csTrimStepW - bleedPt + cOffX;
          const cellY = cenY + (impo.rows - 1 - row) * csTrimStepH - bleedPt - cOffY;
          const epW = epPage.width || pieceW;
          const epH = epPage.height || pieceH;
          page.drawPage(epPage, { x: cellX, y: cellY, xScale: pieceW / epW, yScale: pieceH / epH });
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
        const bEpPage = bEp.page;
        const bEpW = bEpPage.width || pieceW;
        const bEpH = bEpPage.height || pieceH;

        for (let bRow = 0; bRow < impo.rows; bRow++) {
          for (let bCol = 0; bCol < impo.cols; bCol++) {
            const frontCellX = cenX + bCol * csTrimStepW - bleedPt;
            const fCellY = cenY + (impo.rows - 1 - bRow) * csTrimStepH - bleedPt;
            const bCellX = isH2H ? (paperWpt - frontCellX - pieceW) : frontCellX;
            const bCellY = isH2H ? fCellY : (paperHpt - fCellY - pieceH);
            backPage.drawPage(bEpPage, { x: bCellX, y: bCellY, xScale: pieceW / bEpW, yScale: pieceH / bEpH });
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

  // Per-half grid dimensions (not total cols/rows which are doubled for W&T)
  const hCols = impo.halfCols ?? (isTumble ? impo.cols : Math.ceil(impo.cols / 2));
  const hRows = impo.halfRows ?? (isTumble ? Math.ceil(impo.rows / 2) : impo.rows);
  const totalGridW = hCols * pieceW + Math.max(0, hCols - 1) * gutterPt;
  const totalGridH = hRows * pieceH + Math.max(0, hRows - 1) * gutterPt;

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

    // Detect rotation
    const cellPortrait = pieceW <= pieceH;
    const pdfPgInfo = opts.pdfPageSizes?.[0];
    const pdfPortrait = pdfPgInfo ? (pdfPgInfo.trimW <= pdfPgInfo.trimH) : true;
    const wtNeedsRot = cellPortrait !== pdfPortrait;
    const userExtraRot = (opts.rotation === 180 || opts.rotation === 270) ? 180 : 0;

    // Helper: draw page in cell with rotation + clipping
    const wtDrawCell = (pg: PDFPage, cx: number, cy: number, epObj: EmbeddedPageInfo, epPg: PDFEmbeddedPage, extraRotArg?: number) => {
      pg.pushOperators(pushGraphicsState(), rectangle(cx, cy, pieceW, pieceH), clip(), endPath());
      const epSrcRot = (360 - (epObj.rotation || 0)) % 360;
      const gridRot = wtNeedsRot ? 270 : 0;
      const totalRot = (epSrcRot + gridRot + userExtraRot + (extraRotArg || 0)) % 360;
      const epRawW = epPg.width || pieceW;
      const epRawH = epPg.height || pieceH;
      const needsSwap = (totalRot === 90 || totalRot === 270);
      const scX = needsSwap ? (pieceH / epRawW) : (pieceW / epRawW);
      const scY = needsSwap ? (pieceW / epRawH) : (pieceH / epRawH);
      let drawX = cx, drawY = cy;
      if (totalRot === 90) { drawX = cx + pieceW; }
      else if (totalRot === 270) { drawY = cy + pieceH; }
      else if (totalRot === 180) { drawX = cx + pieceW; drawY = cy + pieceH; }
      const drawOpts: Parameters<PDFPage['drawPage']>[1] = { x: drawX, y: drawY, xScale: scX, yScale: scY };
      if (totalRot) drawOpts.rotate = degrees(totalRot);
      pg.drawPage(epPg, drawOpts);
      pg.pushOperators(popGraphicsState());
    }

    for (let row = 0; row < hRows; row++) {
      for (let col = 0; col < hCols; col++) {
        const cellX = cenFX + col * (pieceW + gutterPt);
        const cellY = cenFY + (hRows - 1 - row) * (pieceH + gutterPt);
        wtDrawCell(page, cellX, cellY, epFront, epFrontPg, 0);
      }
    }

    // Back half — αντικριστά (180°)
    const backHalfX = isTumble ? cenFX : mL + halfW + (halfW - totalGridW) / 2;
    const backHalfY = isTumble ? mB + halfH + (halfH - totalGridH) / 2 : cenFY;
    for (let row2 = 0; row2 < hRows; row2++) {
      for (let col2 = 0; col2 < hCols; col2++) {
        // Same grid positions as front half, shifted to back half area
        // Content always rotated 180° (αντικριστά)
        const cellX2 = backHalfX + col2 * (pieceW + gutterPt);
        const cellY2 = backHalfY + (hRows - 1 - row2) * (pieceH + gutterPt);
        // When auto-rotated: back gets opposite direction (heads outward)
        // When natural fit: back same as front (physical turn handles it)
        const backExtraRot = wtNeedsRot ? 180 : 0;
        wtDrawCell(page, cellX2, cellY2, epBack, epBackPg, backExtraRot);
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

    // Gutter masks (per-half grid dimensions, not doubled totals)
    if (gutterPt > 0.5) {
      for (let gc = 0; gc < hCols - 1; gc++) {
        const fgx = fGridL + gc * (pieceW + gutterPt) + pieceW;
        const fgxL = fgx + Math.min(wtBleedPt, gutterPt / 2);
        const fgxR = fgx + gutterPt - Math.min(wtBleedPt, gutterPt / 2);
        if (fgxR > fgxL + 0.5) page.drawRectangle({ x: fgxL, y: fGridB, width: fgxR - fgxL, height: totalGridH, color: white });
        const bgx = bGridL + gc * (pieceW + gutterPt) + pieceW;
        const bgxL = bgx + Math.min(wtBleedPt, gutterPt / 2);
        const bgxR = bgx + gutterPt - Math.min(wtBleedPt, gutterPt / 2);
        if (bgxR > bgxL + 0.5) page.drawRectangle({ x: bgxL, y: bGridB, width: bgxR - bgxL, height: totalGridH, color: white });
      }
      for (let gr = 0; gr < hRows - 1; gr++) {
        const fgy = fGridB + gr * (pieceH + gutterPt) + pieceH;
        const fgyB = fgy + Math.min(wtBleedPt, gutterPt / 2);
        const fgyT = fgy + gutterPt - Math.min(wtBleedPt, gutterPt / 2);
        if (fgyT > fgyB + 0.5) page.drawRectangle({ x: fGridL, y: fgyB, width: totalGridW, height: fgyT - fgyB, color: white });
        const bgy = bGridB + gr * (pieceH + gutterPt) + pieceH;
        const bgyB = bgy + Math.min(wtBleedPt, gutterPt / 2);
        const bgyT = bgy + gutterPt - Math.min(wtBleedPt, gutterPt / 2);
        if (bgyT > bgyB + 0.5) page.drawRectangle({ x: bGridL, y: bgyB, width: totalGridW, height: bgyT - bgyB, color: white });
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

  const page = doc.addPage([paperWpt, paperHpt]);
  const grUserRot = opts.rotation || 0;
  const grBaseRot = (grUserRot === 180 || grUserRot === 270) ? 180 : 0;

  const hasMultiPdf = gangJobEmbedded && gangJobEmbedded.some(arr => arr.length > 0);

  for (let row = 0; row < impo.rows; row++) {
    for (let col = 0; col < impo.cols; col++) {
      const posIdx = row * impo.cols + col;
      const pageNum = gangData?.cellAssign?.[posIdx] || 1;
      const jobIdx = pageNum - 1;

      let epObj: EmbeddedPageInfo | undefined;
      if (hasMultiPdf) {
        const jobPages = gangJobEmbedded![jobIdx];
        epObj = jobPages?.[0];
      } else {
        epObj = jobIdx >= 0 && jobIdx < embeddedPages.length ? embeddedPages[jobIdx] : undefined;
      }

      if (epObj) {
        const epPage = epObj.page;
        // Trim position → offset by bleed for cell placement
        const cellX = cenX + col * grTrimStepW - bleedPt;
        const cellY = cenY + (impo.rows - 1 - row) * grTrimStepH - bleedPt;
        let grExtraRot = grBaseRot;
        if (opts.duplexOrient === 'h2f' && (row % 2 === 1)) grExtraRot = (grExtraRot + 180) % 360;
        drawEmbeddedPage(page, epObj, cellX + bleedPt - epObj.trimOffsetX, cellY + bleedPt - epObj.trimOffsetY, epPage.width, epPage.height, grExtraRot);
      }
    }
  }

  // Asymmetric gutter masks
  const intBleedGr = gutterPt <= 0 ? 0 : (gutterPt >= 2 * bleedPt ? bleedPt : gutterPt / 2);
  const white = cmyk(0, 0, 0, 0);
  if (gutterPt > 0.1) {
    for (let gc = 0; gc < impo.cols - 1; gc++) {
      const gx = cenX + (gc + 1) * trimWpt + gc * gutterPt;
      const gutL = gx + intBleedGr;
      const gutR = gx + gutterPt - intBleedGr;
      if (gutR > gutL + 0.5) page.drawRectangle({ x: gutL, y: 0, width: gutR - gutL, height: paperHpt, color: white });
    }
    for (let gr = 0; gr < impo.rows - 1; gr++) {
      const gy = cenY + (gr + 1) * trimHpt + gr * gutterPt;
      const gutB = gy + intBleedGr;
      const gutT = gy + gutterPt - intBleedGr;
      if (gutT > gutB + 0.5) page.drawRectangle({ x: 0, y: gutB, width: paperWpt, height: gutT - gutB, color: white });
    }
  }
  // Gutter=0 (μονοτομή): no masking — bleeds overlap naturally at cut line

  const gridL = cenX - bleedPt, gridB = cenY - bleedPt;
  const gridR = cenX + trimGridW + bleedPt, gridT = cenY + trimGridH + bleedPt;
  drawMarginalMasks(page, paperWpt, paperHpt, gridL, gridR, gridB, gridT);

  drawPDFMarks(page, paperWpt, paperHpt, {
    marginL: impo.marginL ?? 0, marginR: impo.marginR ?? 0,
    marginT: impo.marginT ?? 0, marginB: impo.marginB ?? 0,
    trimW: impo.trimW, trimH: impo.trimH,
    cols: impo.cols, rows: impo.rows,
    gutterMM: opts.gutter || 0, bleedMM: opts.bleed || 0,
    offsetX: impo.offsetX, offsetY: impo.offsetY,
    cropMarks: opts.showCropMarks,
  }, {
    font,
    jobName: ascii((opts.jobDescription || 'Job') + ' Gang Run'),
    colorBarPage: cbEmbed,
    machineCat: opts.machineCat,
    showPlateSlug: opts.showPlateSlug,
    plateSlugEdge: opts.plateSlugEdge,
    colorBarEdge: opts.colorBarEdge,
    colorBarOffsetY: opts.colorBarOffsetY,
    colorBarScale: opts.colorBarScale,
  });
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

  // Front side
  const frontPage = doc.addPage([paperWpt, paperHpt]);
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.cols === 0) continue;
    const rot = block.rotation || 0;
    let tw = block.trimW, th = block.trimH;
    if (rot === 90 || rot === 270) { const tmp = tw; tw = th; th = tmp; }
    const cellWpt = mmToPt(tw + bl * 2);
    const cellHpt = mmToPt(th + bl * 2);

    const bxPt = mLpt + mmToPt(block.x);
    const byPt = mBpt + printHpt - mmToPt(block.y) - mmToPt(block.blockH);

    // Per-block PDF or global PDF fallback
    const hasBlockPdf = smBlockEmbedded && smBlockEmbedded[bi] && smBlockEmbedded[bi].length > 0;
    const blockPages = hasBlockPdf ? smBlockEmbedded![bi] : embeddedPages;
    const pageIdx = hasBlockPdf ? 0 : block.pageNum - 1;
    if (pageIdx < 0 || pageIdx >= blockPages.length) continue;
    const epObj = blockPages[pageIdx];
    const epPage = epObj.page;

    for (let row = 0; row < block.rows; row++) {
      for (let col = 0; col < block.cols; col++) {
        const cx = bxPt + col * (cellWpt + gutPt);
        const cy = byPt + mmToPt(block.blockH) - (row + 1) * cellHpt - row * gutPt;
        const teX = cx + blPt;
        const teY = cy + blPt;

        if (rot) {
          const mcx = cx + cellWpt / 2, mcy = cy + cellHpt / 2;
          if (rot === 180) {
            drawEmbeddedPage(frontPage, epObj, mcx + epObj.trimOffsetX, mcy + epObj.trimOffsetY, epPage.width, epPage.height, 180);
          } else if (rot === 90) {
            drawEmbeddedPage(frontPage, epObj, teX, teY + (cellHpt - 2 * blPt), epPage.width, epPage.height, 90);
          } else if (rot === 270) {
            drawEmbeddedPage(frontPage, epObj, teX + (cellWpt - 2 * blPt), teY, epPage.width, epPage.height, 270);
          }
        } else {
          drawEmbeddedPage(frontPage, epObj, teX - epObj.trimOffsetX, teY - epObj.trimOffsetY, epPage.width, epPage.height);
        }
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
      const bepPage = bepObj.page;

      // Mirror X for back side
      for (let brow = 0; brow < bb.rows; brow++) {
        for (let bcol = 0; bcol < bb.cols; bcol++) {
          const mirCol = bb.cols - 1 - bcol;
          const bcx = bbxPt + mirCol * (bcWpt + gutPt);
          const bcy = bbyPt + mmToPt(bb.blockH) - (brow + 1) * bcHpt - brow * gutPt;
          const bteX = bcx + blPt;
          const bteY = bcy + blPt;
          drawEmbeddedPage(backPage, bepObj, bteX - bepObj.trimOffsetX, bteY - bepObj.trimOffsetY, bepPage.width, bepPage.height);
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
    embeddedPages = await embedSourcePages(doc, options.pdfBytes, embedMode, options.bleed || 0, options.keepSourceMarks);
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

export async function downloadImpositionPDF(options: ExportOptions, filename?: string): Promise<void> {
  const pdfBytes = await exportImpositionPDF(options);
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // Generate filename from options if not provided
  if (!filename) {
    const impo = options.imposition;
    const jobSize = Math.round(options.jobW || 0) + 'x' + Math.round(options.jobH || 0);
    const paperSize = Math.round(impo.paperW) + 'x' + Math.round(impo.paperH);
    const modeLabel = impo.mode === 'nup' ? 'nup_' + impo.ups + 'UP'
      : impo.mode === 'booklet' ? 'booklet'
      : impo.mode === 'perfect_bound' ? 'pb'
      : impo.mode === 'cutstack' ? 'cutstack_' + impo.ups + 'UP'
      : impo.mode === 'workturn' ? 'workturn_' + impo.ups + 'UP'
      : impo.mode === 'gangrun' ? 'gangrun_' + impo.ups + 'pos'
      : impo.mode === 'stepmulti' ? 'step_' + (impo.blocks?.length || 0) + 'blk'
      : impo.mode;
    // Use source PDF filename (without extension) as base, fallback to 'imposed'
    const baseName = options.sourceFileName
      ? options.sourceFileName.replace(/\.pdf$/i, '')
      : 'imposed';
    filename = `${baseName}_${jobSize}_${paperSize}_${modeLabel}.pdf`;
  }

  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
