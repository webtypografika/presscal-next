'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { ImpositionResult, ImpositionCell } from '@/types/calculator';
import type { ParsedPDF, PDFPageSize } from '@/lib/calc/pdf-utils';

/* ═══════════════════════════════════════════════════
   Imposition Canvas — Preview + Zoom/Pan + PDF Thumbnails
   Dual view (side-by-side) + Single view (pagination)
   ═══════════════════════════════════════════════════ */

interface ImpositionCanvasProps {
  impo: ImpositionResult;
  sheetW: number;
  sheetH: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  bleed: number;
  gutter: number;
  cropMarks: boolean;
  machCat?: 'digital' | 'offset';
  sides?: 1 | 2;
  offsetX?: number;
  offsetY?: number;
  showColorBar?: boolean;
  colorBarEdge?: 'tail' | 'gripper';
  colorBarOffY?: number;  // mm micro-adjust
  colorBarScale?: number; // % scale (default 100)
  showPlateSlug?: boolean;
  plateSlugEdge?: 'tail' | 'gripper';
  pdf?: ParsedPDF | null;
  onDrop?: (files: FileList) => void;
  feedEdge?: 'sef' | 'lef';
  activeSigSheet?: number;   // signature navigator: which sheet to display
  sigShowBack?: boolean;     // signature navigator: show back side
  csNumbering?: {            // cut & stack numbering overlay
    prefix: string;
    digits: number;
    startNum: number;
    posX: number;            // 0-1 normalized
    posY: number;
    color: string;
    fontSize: number;
    font: 'Helvetica' | 'Courier';
    rotation: number;        // degrees
  };
  gangJobPdfs?: (ParsedPDF | undefined)[];  // per-job PDFs for gang run
  gangCellAssign?: Record<number, number>;   // cellIdx → jobIdx (0-based)
  smBlockPdfs?: (ParsedPDF | undefined)[];   // per-block PDFs for step multi
  smBlocks?: import('@/types/calculator').StepBlock[];  // step multi blocks (for drag handles)
  onSmBlockUpdate?: (idx: number, cols: number, rows: number) => void;  // resize callback
  onSmBlockMove?: (idx: number, x: number, y: number) => void;  // move callback
}

type ViewMode = 'single' | 'dual';

// ─── COLOR HELPERS ───
const COLORS = {
  paper: '#ffffff',
  paperStroke: 'rgba(255,255,255,0.12)',
  shadow: 'rgba(0,0,0,0.25)',
  margin: 'rgba(245,130,32,0.08)',
  marginStroke: 'rgba(245,130,32,0.25)',
  bleedBand: 'rgba(239,68,68,0.08)',
  bleedStroke: 'rgba(239,68,68,0.35)',
  trimFill: 'rgba(245,130,32,0.06)',
  trimStroke: 'rgba(245,130,32,0.18)',
  cellNum: 'rgba(245,130,32,0.35)',
  gutterFill: 'rgba(100,116,139,0.06)',
  info: 'rgba(148,163,184,0.7)',
  gripper: 'rgba(245,130,32,0.5)',
  tail: 'rgba(100,116,139,0.4)',
  cropMark: 'rgba(148,163,184,0.5)',
  rotatedFill: 'rgba(56,189,248,0.06)',
  rotatedStroke: 'rgba(56,189,248,0.18)',
  rotatedNum: 'rgba(56,189,248,0.35)',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── DRAW ONE SHEET ───
function drawSheet(
  ctx: CanvasRenderingContext2D,
  offX: number, offY: number, drawW: number, drawH: number,
  impo: ImpositionResult,
  sheetW: number, sheetH: number,
  marginTop: number, marginBottom: number, marginLeft: number, marginRight: number,
  bleed: number, gutter: number, cropMarks: boolean,
  gridOffsetX: number, gridOffsetY: number,
  showColorBar: boolean, colorBarEdge: string, colorBarOffY: number, colorBarScale: number,
  showPlateSlug: boolean, plateSlugEdge: string,
  machCat: string | undefined,
  pdf: ParsedPDF | null | undefined,
  pdfPageIdx: number, // which PDF page to show in step-repeat cells
  isBack: boolean,
  label?: string,
  activeSigSheet?: number,
  csNumbering?: ImpositionCanvasProps['csNumbering'],
  gangJobPdfs?: (ParsedPDF | undefined)[],
  gangCellAssign?: Record<number, number>,
  smBlockPdfs?: (ParsedPDF | undefined)[],
) {
  const scale = drawW / sheetW;
  const hasBleed = bleed > 0;
  const hasGutter = gutter !== 0;
  const markLen = cropMarks ? 8 : 0;

  // Shadow
  ctx.fillStyle = COLORS.shadow;
  roundRect(ctx, offX + 2, offY + 2, drawW, drawH, 2);
  ctx.fill();

  // Paper
  ctx.fillStyle = COLORS.paper;
  ctx.strokeStyle = COLORS.paperStroke;
  ctx.lineWidth = 1;
  roundRect(ctx, offX, offY, drawW, drawH, 2);
  ctx.fill();
  ctx.stroke();

  // Margins — for offset: marginTop=gripper goes to bottom, marginBottom=tail goes to top
  const isOffset = machCat === 'offset';
  const mL = marginLeft * scale;
  const mR = marginRight * scale;
  const mT = (isOffset ? marginBottom : marginTop) * scale;  // visual top
  const mB = (isOffset ? marginTop : marginBottom) * scale;   // visual bottom (gripper for offset)

  ctx.fillStyle = COLORS.margin;
  ctx.fillRect(offX, offY, drawW, mT);
  ctx.fillRect(offX, offY + drawH - mB, drawW, mB);
  ctx.fillRect(offX, offY + mT, mL, drawH - mT - mB);
  ctx.fillRect(offX + drawW - mR, offY + mT, mR, drawH - mT - mB);

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = COLORS.marginStroke;
  ctx.lineWidth = 0.6;
  ctx.strokeRect(offX + mL, offY + mT, drawW - mL - mR, drawH - mT - mB);
  ctx.setLineDash([]);

  // Gripper/Tail labels (offset)
  // DB convention: marginTop = gripper (off_gripper), marginBottom = tail (off_margin_tail)
  // Display: gripper at BOTTOM of sheet (feed edge), tail at TOP (trailing)
  // So we visually swap: draw marginTop value at bottom, marginBottom at top
  if (machCat === 'offset') {
    ctx.font = '600 7px Inter, DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.tail;
    ctx.fillText('TAIL', offX + drawW / 2, offY + mT / 2 + 3);
    ctx.fillStyle = COLORS.gripper;
    ctx.fillText('GRIPPER', offX + drawW / 2, offY + drawH - mB / 2 + 3);
  }

  // Print area
  const paX = offX + mL;
  const paY = offY + mT;
  const printAreaW = drawW - mL - mR;
  const printAreaH = drawH - mT - mB;

  // Cell grid
  const pw = impo.pieceW * scale;
  const ph = impo.pieceH * scale;
  const gutterPx = gutter * scale;
  const bleedPx = hasBleed ? bleed * scale : 0;
  const totalGridW = impo.cols * pw + Math.max(0, impo.cols - 1) * gutterPx;
  const totalGridH = impo.rows * ph + Math.max(0, impo.rows - 1) * gutterPx;
  const cenX = paX + (printAreaW - totalGridW) / 2 + gridOffsetX * scale;
  const cenY = paY + (printAreaH - totalGridH) / 2 + gridOffsetY * scale;

  // W&T and Step Multi use actual cell coordinates, others use uniform grid
  const isWT = impo.mode === 'workturn';
  const isSM = impo.mode === 'stepmulti';
  const useCellCoords = isWT || isSM;

  // Step multi: map cell index → block index for per-block PDF rendering
  const smCellBlockIdx: number[] = [];
  if (isSM && impo.blocks) {
    for (let bi = 0; bi < impo.blocks.length; bi++) {
      const b = impo.blocks[bi];
      for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) smCellBlockIdx.push(bi);
    }
  }
  const isSmMultiPdf = isSM && smBlockPdfs && smBlockPdfs.some(Boolean);

  // Draw cells — step multi iterates all cells directly (variable grid)
  const cellCount = isSM ? impo.cells.length : impo.rows * impo.cols;
  for (let ci = 0; ci < cellCount; ci++) {
    const row = isSM ? 0 : Math.floor(ci / impo.cols);
    const col = isSM ? 0 : ci % impo.cols;
    const idx = isSM ? ci : row * impo.cols + col;
    if (idx >= impo.cells.length) continue;
    const cell = impo.cells[idx];

      // Signature navigator override: swap page numbers for the active sheet
      let cellPageNum = cell.pageNum;
      if (activeSigSheet != null && impo.signatureMap) {
        const sigSheet = impo.signatureMap.sheets[activeSigSheet];
        if (sigSheet) {
          if (impo.mode === 'booklet') {
            // Booklet: cells alternate [left, right] per spread
            const side = isBack ? sigSheet.back : sigSheet.front;
            const posInSpread = col % 2; // 0=left, 1=right
            cellPageNum = side[posInSpread];
          } else if (impo.mode === 'perfect_bound' && impo.pbSignatures) {
            // PB: show full signature front/back from fold map
            // activeSigSheet indexes into navigator sheets (spreads across all sigs)
            // Determine which signature and use its fold map
            const sheetsPerSig = impo.signatureMap.sheets.length / (impo.numSigs || 1);
            const sigIdx = Math.floor(activeSigSheet / sheetsPerSig);
            const sig = impo.pbSignatures[sigIdx];
            if (sig) {
              const faceMap = isBack ? sig.signatureMap.back : sig.signatureMap.front;
              const localPage = faceMap[row]?.[col] ?? 0;
              cellPageNum = localPage > 0 ? sig.startPage + localPage - 1 : 0;
            }
          }
        }
      }

      const x = offX + cell.x * scale + gridOffsetX * scale;
      const y = offY + cell.y * scale + gridOffsetY * scale;
      // Step multi: per-cell dimensions (blocks can have different trim sizes)
      const cpw = isSM && cell.w ? cell.w * scale : pw;
      const cph = isSM && cell.h ? cell.h * scale : ph;
      const isRotated = cell.rotation && cell.rotation !== 0;

      // Bleed zone
      if (hasBleed) {
        ctx.fillStyle = COLORS.bleedBand;
        ctx.fillRect(x, y, cpw, bleedPx);
        ctx.fillRect(x, y + cph - bleedPx, cpw, bleedPx);
        ctx.fillRect(x, y + bleedPx, bleedPx, cph - 2 * bleedPx);
        ctx.fillRect(x + cpw - bleedPx, y + bleedPx, bleedPx, cph - 2 * bleedPx);

        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = COLORS.bleedStroke;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x + bleedPx, y + bleedPx, cpw - 2 * bleedPx, cph - 2 * bleedPx);
        ctx.setLineDash([]);
      }

      // Trim area
      const trimX = x + (hasBleed ? bleedPx : 0);
      const trimY = y + (hasBleed ? bleedPx : 0);
      const trimW = hasBleed ? cpw - 2 * bleedPx : cpw;
      const trimH = hasBleed ? cph - 2 * bleedPx : cph;

      // PDF page to show
      const mode = impo.mode;
      const isGangMultiPdf = mode === 'gangrun' && gangJobPdfs && gangJobPdfs.some(Boolean);
      const pdfCount = pdf?.thumbnails?.length || 0;
      const isCutStack = mode === 'cutstack' && pdfCount > 1;
      const isStepRepeat = !isCutStack && (mode === 'nup' || mode === 'cutstack' || (mode === 'gangrun' && !isGangMultiPdf));
      let pidx: number;
      let cellPdf: ParsedPDF | null | undefined = pdf;
      if (isSmMultiPdf) {
        // Step Multi: each cell shows its block's PDF
        const bi = smCellBlockIdx[idx] ?? 0;
        cellPdf = smBlockPdfs![bi] || null;
        pidx = pdfPageIdx;
      } else if (isGangMultiPdf) {
        // Gang Run multi-PDF: each cell shows its job's PDF (page 0 = front)
        const jobIdx = gangCellAssign?.[idx] ?? 0;
        cellPdf = gangJobPdfs![jobIdx] || null;
        pidx = pdfPageIdx; // 0=front, 1=back
      } else if (isCutStack) {
        // Cut & Stack: each position gets a different page from the PDF
        // stackNum * sheetsNeeded + sheetIndex → after cut+stack = sequential
        const sheetsNeeded = Math.ceil(pdfCount / Math.max(impo.ups, 1));
        const stackNum = impo.stackPositions?.[idx]?.stackNum ?? idx;
        const sheetIdx = activeSigSheet ?? 0;
        pidx = stackNum * sheetsNeeded + sheetIdx;
      } else if (isStepRepeat) {
        pidx = pdfPageIdx; // controlled by caller (front=0, back=1)
      } else {
        pidx = (cellPageNum || idx + 1) - 1;
      }
      const cellPdfCount = cellPdf?.thumbnails?.length || 0;
      const validPidx = cellPdfCount > 0 && pidx < cellPdfCount;
      const thumb = validPidx ? cellPdf?.thumbnails?.[pidx] : undefined;
      const pgSize = validPidx ? cellPdf?.pageSizes?.[pidx] : undefined;

      if (thumb && pgSize) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cpw, cph);
        ctx.clip();

        const rendW = (pgSize.cropW || pgSize.w) * scale;
        const rendH = (pgSize.cropH || pgSize.h) * scale;
        const tOffX = (pgSize.trimOffX != null ? pgSize.trimOffX : ((pgSize.cropW || pgSize.w) - pgSize.trimW) / 2) * scale;
        const tOffY = (pgSize.trimOffY != null ? pgSize.trimOffY : ((pgSize.cropH || pgSize.h) - pgSize.trimH) / 2) * scale;

        // The cell dimensions (cpw × cph) already reflect any grid rotation
        // (e.g. 90° → cells swapped W↔H by imposition engine).
        // We only need to check if the PDF page orientation matches the CURRENT cell.
        const pdfPortrait = pgSize.trimW <= pgSize.trimH;
        const cellPortrait = cpw <= cph;
        const needsAutoRot = pdfPortrait !== cellPortrait;

        // User content rotation from cell (set by imposition engine)
        const userRot = cell.rotation || 0;
        // Auto-rotate PDF to match cell orientation, then add user rotation
        // But if user already rotated 90°/270° (which swapped the cell),
        // the cell now matches the PDF — so autoRot would be wrong.
        // Rule: autoRot only when PDF and cell mismatch AFTER swap.
        const autoRot = needsAutoRot ? 90 : 0;
        // For user rotations that already swapped the grid (90°/270°),
        // the content rotation is purely the user angle — no auto.
        // The cell dimensions already match. Only apply autoRot at 0°/180°.
        const userSwapped = (userRot > 45 && userRot < 135) || (userRot > 225 && userRot < 315);
        const totalRot = userSwapped ? (userRot % 360) : ((autoRot + userRot) % 360);

        // Draw with rotation around cell center
        const cx = trimX + trimW / 2;
        const cy = trimY + trimH / 2;
        ctx.translate(cx, cy);
        ctx.rotate((totalRot * Math.PI) / 180);

        // The PDF thumbnail is always in its native orientation.
        // Scale it to fit the UN-rotated cell (i.e. what the PDF looks like before rotation).
        // If totalRot is 90/270-ish, the PDF fills the swapped dimensions.
        const effSwap = Math.round(totalRot / 90) % 2 === 1;
        const fitW = effSwap ? trimH : trimW;
        const fitH = effSwap ? trimW : trimH;
        const drawRendW = (pgSize.cropW || pgSize.w) * scale;
        const drawRendH = (pgSize.cropH || pgSize.h) * scale;
        const scX = fitW / (pgSize.trimW * scale);
        const scY = fitH / (pgSize.trimH * scale);
        const sc = Math.min(scX, scY);
        const finalW = drawRendW * sc;
        const finalH = drawRendH * sc;
        const drawTOffX = (pgSize.trimOffX != null ? pgSize.trimOffX : ((pgSize.cropW || pgSize.w) - pgSize.trimW) / 2) * scale * sc;
        const drawTOffY = (pgSize.trimOffY != null ? pgSize.trimOffY : ((pgSize.cropH || pgSize.h) - pgSize.trimH) / 2) * scale * sc;

        ctx.drawImage(thumb, -fitW / 2 - drawTOffX, -fitH / 2 - drawTOffY, finalW, finalH);
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);

        // Gang Run: show job number badge in corner
        if (isGangMultiPdf) {
          const gjIdx = gangCellAssign?.[idx] ?? 0;
          const gjColors = ['#f58220', '#3b82f6', '#14b8a6', '#a78bfa', '#f472b6', '#facc15'];
          const gjColor = gjColors[gjIdx % gjColors.length];
          const badgeW = Math.min(trimW * 0.25, 18);
          const badgeH = Math.min(trimH * 0.2, 14);
          ctx.fillStyle = gjColor;
          ctx.fillRect(trimX + 1, trimY + 1, badgeW, badgeH);
          ctx.font = `800 ${Math.min(badgeH * 0.75, 9)}px Inter, DM Sans, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#fff';
          ctx.fillText(String(gjIdx + 1), trimX + 1 + badgeW / 2, trimY + 1 + badgeH * 0.75);
        }

        // Overlay: show page/position number on top of thumbnail
        if ((isStepRepeat || isCutStack) && impo.mode !== 'gangrun') {
          if (isCutStack && csNumbering) {
            // Formatted numbering overlay at specified position
            const seqNum = csNumbering.startNum + pidx;
            const numStr = csNumbering.prefix + String(seqNum).padStart(csNumbering.digits, '0');
            const nFS = Math.min(csNumbering.fontSize * scale * 0.8, trimW * 0.25, trimH * 0.2);
            const nx = trimX + csNumbering.posX * trimW;
            const ny = trimY + (1 - csNumbering.posY) * trimH;
            const fontFam = csNumbering.font === 'Courier' ? 'Courier New, Courier, monospace' : 'Helvetica, Arial, sans-serif';
            ctx.save();
            ctx.translate(nx, ny);
            if (csNumbering.rotation) ctx.rotate(csNumbering.rotation * Math.PI / 180);
            ctx.font = `700 ${nFS}px ${fontFam}`;
            ctx.textAlign = 'center';
            const tw = ctx.measureText(numStr).width;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(-tw / 2 - 2, -nFS * 0.7, tw + 4, nFS * 1.1);
            ctx.fillStyle = csNumbering.color === '#cc0000' ? 'rgba(204,0,0,0.9)' : 'rgba(0,0,0,0.8)';
            ctx.fillText(numStr, 0, 0);
            ctx.restore();
          } else {
            const overlayNum = isCutStack ? pidx + 1 : (cellPageNum || idx + 1);
            const oFS = Math.min(trimW * 0.22, trimH * 0.22, 16);
            ctx.font = `700 ${oFS}px Inter, DM Sans, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillText(String(overlayNum), trimX + trimW / 2 + 0.5, trimY + trimH / 2 + oFS * 0.35 + 0.5);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillText(String(overlayNum), trimX + trimW / 2, trimY + trimH / 2 + oFS * 0.35);
          }
        }
      } else {
        // Gang Run without PDF: tint cell with job color
        if (isGangMultiPdf) {
          const gjIdx = gangCellAssign?.[idx] ?? 0;
          const gjColors = ['#f58220', '#3b82f6', '#14b8a6', '#a78bfa', '#f472b6', '#facc15'];
          const gjColor = gjColors[gjIdx % gjColors.length];
          ctx.fillStyle = gjColor + '18'; // ~10% opacity
          ctx.fillRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);
          ctx.strokeStyle = gjColor + '55';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);
          const fontSize = Math.min(trimW * 0.3, trimH * 0.3, 20);
          ctx.font = `800 ${fontSize}px Inter, DM Sans, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = gjColor + 'aa';
          ctx.fillText(String(gjIdx + 1), trimX + trimW / 2, trimY + trimH / 2 + fontSize * 0.35);
        } else {
        ctx.fillStyle = isRotated ? COLORS.rotatedFill : COLORS.trimFill;
        ctx.fillRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);

        ctx.strokeStyle = isRotated ? COLORS.rotatedStroke : COLORS.trimStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);
        }

        if (!isGangMultiPdf) {
          const cellLabel = isCutStack ? pidx + 1 : (cellPageNum || idx + 1);
          if (isCutStack && csNumbering) {
            const seqNum = csNumbering.startNum + pidx;
            const numStr = csNumbering.prefix + String(seqNum).padStart(csNumbering.digits, '0');
            const nFS = Math.min(csNumbering.fontSize * scale * 0.8, trimW * 0.25, trimH * 0.2);
            const nx = trimX + csNumbering.posX * trimW;
            const ny = trimY + (1 - csNumbering.posY) * trimH;
            const fontFam = csNumbering.font === 'Courier' ? 'Courier New, Courier, monospace' : 'Helvetica, Arial, sans-serif';
            ctx.save();
            ctx.translate(nx, ny);
            if (csNumbering.rotation) ctx.rotate(csNumbering.rotation * Math.PI / 180);
            ctx.font = `700 ${nFS}px ${fontFam}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = csNumbering.color === '#cc0000' ? 'rgba(204,0,0,0.9)' : 'rgba(0,0,0,0.8)';
            ctx.fillText(numStr, 0, 0);
            ctx.restore();
          } else {
            const fontSize = Math.min(trimW * 0.3, trimH * 0.3, 20);
            ctx.font = `600 ${fontSize}px Inter, DM Sans, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = isRotated ? COLORS.rotatedNum : COLORS.cellNum;
            ctx.fillText(String(cellLabel), trimX + trimW / 2, trimY + trimH / 2 + fontSize * 0.35);
          }
        }
      }
    }
  // end cell loop

  // W&T fold/cut line (dashed line at sheet center — where the sheet is cut after printing)
  if (isWT) {
    const isTumble = impo.turnType === 'tumble';
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = COLORS.cropMark;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (isTumble) {
      const fy = offY + drawH / 2;
      ctx.moveTo(offX, fy);
      ctx.lineTo(offX + drawW, fy);
    } else {
      const fx = offX + drawW / 2;
      ctx.moveTo(fx, offY);
      ctx.lineTo(fx, offY + drawH);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Gutter lines (skip for W&T — cells use actual coordinates with fold gap)
  // Only draw fill for positive gutters (negative = overlap, no visible gap)
  if (gutter > 0 && gutterPx > 1 && !isWT && !isSM) {
    ctx.fillStyle = COLORS.gutterFill;
    for (let col = 1; col < impo.cols; col++) {
      const gx = cenX + col * pw + (col - 1) * gutterPx;
      ctx.fillRect(gx, cenY, gutterPx, totalGridH);
    }
    for (let row = 1; row < impo.rows; row++) {
      const gy = cenY + row * ph + (row - 1) * gutterPx;
      ctx.fillRect(cenX, gy, totalGridW, gutterPx);
    }
  }

  // Crop marks (skip for W&T — uses cell coordinates, marks drawn correctly in PDF export)
  if (cropMarks && !isWT && !isSM) {
    ctx.strokeStyle = COLORS.cropMark;
    ctx.lineWidth = 0.5;
    for (let row = 0; row <= impo.rows; row++) {
      for (let col = 0; col <= impo.cols; col++) {
        const cx = cenX + col * (pw + gutterPx) - (col > 0 ? gutterPx : 0);
        const cy = cenY + row * (ph + gutterPx) - (row > 0 ? gutterPx : 0);
        ctx.beginPath();
        ctx.moveTo(cx - markLen, cy); ctx.lineTo(cx - 2, cy);
        ctx.moveTo(cx + pw + 2, cy); ctx.lineTo(cx + pw + markLen, cy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy - markLen); ctx.lineTo(cx, cy - 2);
        ctx.moveTo(cx, cy + ph + 2); ctx.lineTo(cx, cy + ph + markLen);
        ctx.stroke();
      }
    }
  }

  // ─── STEP MULTI BLOCK BOUNDARIES + DRAG HANDLES ───
  if (impo.mode === 'stepmulti' && impo.blocks && impo.blocks.length > 0) {
    const smColors = ['#f58220', '#3b82f6', '#14b8a6', '#a78bfa', '#f472b6', '#facc15'];
    for (let bi = 0; bi < impo.blocks.length; bi++) {
      const blk = impo.blocks[bi];
      const bx = offX + mL + blk.x * scale;
      const by = offY + mT + blk.y * scale;
      const bw = blk.blockW * scale;
      const bh = blk.blockH * scale;
      const color = smColors[bi % smColors.length];
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.setLineDash([]);
      // Block label
      ctx.fillStyle = color;
      ctx.font = '600 9px Inter, DM Sans, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${bi + 1}  ${blk.cols}×${blk.rows}  ${blk.trimW}×${blk.trimH}mm`, bx + 2, by - 3);
      // Drag handle (bottom-right corner)
      const hx = bx + bw;
      const hy = by + bh;
      const hs = 5;
      ctx.fillStyle = color;
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy + 2); ctx.lineTo(hx + 2, hy - 2);
      ctx.moveTo(hx + 1, hy + 2); ctx.lineTo(hx + 2, hy + 1);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ─── COLOR BAR ───
  if (showColorBar) {
    const cbS = colorBarScale / 100;
    const cbPatchHmm = 5 * cbS;   // patch height in mm
    const cbPatchWmm = 10 * cbS;  // patch width in mm
    const cbGapmm = 0.5 * cbS;    // gap between patches in mm
    const cbPatchH = cbPatchHmm * scale;
    const cbPatchW = cbPatchWmm * scale;
    const cbGap = cbGapmm * scale;
    const cmykFull = ['#00aeef', '#ec008c', '#fff200', '#231f20'];
    const cmykTint = ['rgba(0,174,239,0.5)', 'rgba(236,0,140,0.5)', 'rgba(255,242,0,0.5)', 'rgba(35,31,32,0.5)'];
    const isTailEdge = colorBarEdge === 'tail';
    const cbOffPx = colorBarOffY * scale;
    // Position inside margin + micro-adjust
    const cbBaseY = isTailEdge
      ? offY + mT * 0.3 + cbOffPx
      : offY + drawH - mB * 0.3 - cbPatchH * 2 - cbGap - cbOffPx;
    // Tile patches across printable width
    const startX = offX + mL;
    const endX = offX + drawW - mR;
    let cx = startX;
    let colorIdx = 0;
    while (cx + cbPatchW <= endX) {
      const ci = colorIdx % 4;
      // Full patch
      ctx.fillStyle = cmykFull[ci];
      ctx.fillRect(cx, cbBaseY, cbPatchW, cbPatchH);
      // 50% tint patch below
      ctx.fillStyle = cmykTint[ci];
      ctx.fillRect(cx, cbBaseY + cbPatchH + cbGap, cbPatchW, cbPatchH);
      cx += cbPatchW + cbGap;
      colorIdx++;
    }
  }

  // ─── PLATE SLUG ───
  if (showPlateSlug && machCat === 'offset') {
    const slugColors = ['#00aeef', '#ec008c', '#d4a017', '#231f20'];
    const slugNames = ['Cyan', 'Magenta', 'Yellow', 'Black'];
    const slugFS = 5;
    ctx.font = `600 ${slugFS}px Inter, DM Sans, sans-serif`;
    ctx.textAlign = 'left';
    const isTailEdge = plateSlugEdge === 'tail';
    // Position inside the margin area (not overlapping content)
    const slugY = isTailEdge
      ? offY + Math.max(mT * 0.5 + slugFS * 0.3, 4)
      : offY + drawH - Math.max(mB * 0.5 - slugFS * 0.3, 4);
    let slugX = offX + mL + 2;
    for (let si = 0; si < 4; si++) {
      ctx.fillStyle = slugColors[si];
      ctx.fillText(slugNames[si], slugX, slugY);
      slugX += ctx.measureText(slugNames[si]).width + 3;
    }
  }

  // Label (Front / Back)
  if (label) {
    ctx.font = '700 8px Inter, DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isBack ? 'rgba(96,165,250,0.6)' : 'rgba(245,130,32,0.6)';
    ctx.fillText(label, offX + drawW / 2, offY - 4);
  }
}

export default function ImpositionCanvas({
  impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight,
  bleed, gutter, cropMarks, machCat, sides, offsetX, offsetY,
  showColorBar, colorBarEdge, colorBarOffY, colorBarScale, showPlateSlug, plateSlugEdge,
  pdf, onDrop, feedEdge, activeSigSheet, sigShowBack, csNumbering,
  gangJobPdfs, gangCellAssign, smBlockPdfs, smBlocks, onSmBlockUpdate, onSmBlockMove,
}: ImpositionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const panRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragLastRef = useRef({ x: 0, y: 0 });

  // View controls — external navigator drives front/back for all duplex modes
  const hasSigNav = activeSigSheet != null;
  const isDuplex = (sides ?? 1) === 2 && impo.mode !== 'workturn';
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  const LOGICAL_W = 750;
  const LOGICAL_H = 625;

  // ─── DRAW ───
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = containerRef.current;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const renderScale = 2;
    canvas.width = LOGICAL_W * dpr * renderScale;
    canvas.height = LOGICAL_H * dpr * renderScale;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * renderScale, 0, 0, dpr * renderScale, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    const cW = LOGICAL_W;
    const cH = LOGICAL_H;
    const reserveTop = 20;
    const reserveBot = 22;
    const markLen = cropMarks ? 8 : 0;

    if (isDuplex && viewMode === 'dual') {
      // ═══ DUAL VIEW: front + back side by side ═══
      const gap = 12;
      const availW = cW - 24 - markLen * 2 - gap;
      const availH = cH - reserveTop - reserveBot - markLen * 2;
      const halfW = availW / 2;
      const scaleX = halfW / sheetW;
      const scaleY = availH / sheetH;
      const scale = Math.min(scaleX, scaleY);
      const drawW = sheetW * scale;
      const drawH = sheetH * scale;

      const totalW = drawW * 2 + gap;
      const baseX = (cW - totalW) / 2;
      const baseY = reserveTop + markLen + (availH - drawH) / 2;

      // Front
      drawSheet(ctx, baseX, baseY, drawW, drawH,
        impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight,
        bleed, gutter, cropMarks, offsetX ?? 0, offsetY ?? 0,
        showColorBar ?? false, colorBarEdge ?? 'tail', colorBarOffY ?? 0, colorBarScale ?? 100, showPlateSlug ?? false, plateSlugEdge ?? 'tail',
        machCat, pdf, 0, false, 'A', activeSigSheet, csNumbering, gangJobPdfs, gangCellAssign, smBlockPdfs);

      // Back
      drawSheet(ctx, baseX + drawW + gap, baseY, drawW, drawH,
        impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight,
        bleed, gutter, cropMarks, offsetX ?? 0, offsetY ?? 0,
        showColorBar ?? false, colorBarEdge ?? 'tail', colorBarOffY ?? 0, colorBarScale ?? 100, showPlateSlug ?? false, plateSlugEdge ?? 'tail',
        machCat, pdf, 1, true, 'B', activeSigSheet, csNumbering, gangJobPdfs, gangCellAssign, smBlockPdfs);
    } else {
      // ═══ SINGLE VIEW: one sheet, pagination ═══
      const scaleX = (cW - 24 - markLen * 2) / sheetW;
      const scaleY = (cH - reserveTop - reserveBot - markLen * 2) / sheetH;
      const scale = Math.min(scaleX, scaleY);
      const drawW = sheetW * scale;
      const drawH = sheetH * scale;
      const offX = (cW - drawW) / 2;
      const offY = reserveTop + markLen + (cH - reserveTop - reserveBot - markLen * 2 - drawH) / 2;

      // External navigator controls front/back
      const isBack = hasSigNav ? (sigShowBack ?? false) : false;
      // For signature modes: page comes from signature map override (activeSigSheet drives drawSheet)
      // For non-signature modes: activeSigSheet = page/sheet index
      const pageIdx = hasSigNav
        ? (impo.signatureMap
          ? (isBack ? 1 : 0)
          : (isDuplex ? (activeSigSheet ?? 0) * 2 + (isBack ? 1 : 0) : (activeSigSheet ?? 0)))
        : 0;
      drawSheet(ctx, offX, offY, drawW, drawH,
        impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight,
        bleed, gutter, cropMarks, offsetX ?? 0, offsetY ?? 0,
        showColorBar ?? false, colorBarEdge ?? 'tail', colorBarOffY ?? 0, colorBarScale ?? 100, showPlateSlug ?? false, plateSlugEdge ?? 'tail',
        machCat, pdf, pageIdx, isBack, isDuplex ? (isBack ? 'B' : 'A') : undefined, activeSigSheet, csNumbering, gangJobPdfs, gangCellAssign, smBlockPdfs);

      // ─── STEP MULTI DIMENSION LINES (during drag) ───
      if (impo.mode === 'stepmulti' && smDragRef.current && impo.blocks) {
        const sbi = smDragRef.current.blockIdx;
        const sblk = impo.blocks[sbi];
        if (sblk) {
          const isOff = machCat === 'offset';
          const dmL = marginLeft * scale;
          const dmT = (isOff ? marginBottom : marginTop) * scale;
          const dmR = (isOff ? marginLeft : marginRight) * scale;  // not used directly
          const printWpx = drawW - marginLeft * scale - marginRight * scale;
          const printHpx = drawH - marginTop * scale - marginBottom * scale;
          const sbx = offX + dmL + sblk.x * scale;
          const sby = offY + dmT + sblk.y * scale;
          const sbw = sblk.blockW * scale;
          const sbh = sblk.blockH * scale;
          const paL = offX + dmL;  // printable area left
          const paT = offY + dmT;  // printable area top
          const paR = paL + printWpx;
          const paB = paT + printHpx;

          ctx.save();
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = 'rgba(245,130,32,0.6)';
          ctx.lineWidth = 0.8;
          ctx.font = '600 8px Inter, DM Sans, sans-serif';
          ctx.fillStyle = 'rgba(245,130,32,0.9)';
          ctx.textAlign = 'center';

          // Left distance
          const distL = sblk.x;
          if (distL > 0.5) {
            const ly = sby + sbh / 2;
            ctx.beginPath(); ctx.moveTo(paL, ly); ctx.lineTo(sbx, ly); ctx.stroke();
            ctx.fillText(`${distL.toFixed(1)}`, (paL + sbx) / 2, ly - 3);
          }
          // Top distance
          const distT = sblk.y;
          if (distT > 0.5) {
            const lx = sbx + sbw / 2;
            ctx.beginPath(); ctx.moveTo(lx, paT); ctx.lineTo(lx, sby); ctx.stroke();
            ctx.fillText(`${distT.toFixed(1)}`, lx, (paT + sby) / 2 + 3);
          }
          // Right distance
          const printWmm = sheetW - marginLeft - marginRight;
          const distR = printWmm - sblk.x - sblk.blockW;
          if (distR > 0.5) {
            const ly = sby + sbh / 2;
            ctx.beginPath(); ctx.moveTo(sbx + sbw, ly); ctx.lineTo(paR, ly); ctx.stroke();
            ctx.fillText(`${distR.toFixed(1)}`, (sbx + sbw + paR) / 2, ly - 3);
          }
          // Bottom distance
          const printHmm = sheetH - marginTop - marginBottom;
          const distB = printHmm - sblk.y - sblk.blockH;
          if (distB > 0.5) {
            const lx = sbx + sbw / 2;
            ctx.beginPath(); ctx.moveTo(lx, sby + sbh); ctx.lineTo(lx, paB); ctx.stroke();
            ctx.fillText(`${distB.toFixed(1)}`, lx, (sby + sbh + paB) / 2 + 3);
          }

          // Snap guide lines (green)
          const printWmm2 = sheetW - marginLeft - marginRight;
          const printHmm2 = sheetH - marginTop - marginBottom;
          ctx.strokeStyle = 'rgba(16,185,129,0.7)';
          ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 2]);
          const snapT = 1.5; // mm threshold for showing guide
          // Horizontal center
          if (Math.abs(sblk.x + sblk.blockW / 2 - printWmm2 / 2) < snapT) {
            const cx = paL + printWpx / 2;
            ctx.beginPath(); ctx.moveTo(cx, paT); ctx.lineTo(cx, paB); ctx.stroke();
          }
          // Vertical center
          if (Math.abs(sblk.y + sblk.blockH / 2 - printHmm2 / 2) < snapT) {
            const cy = paT + printHpx / 2;
            ctx.beginPath(); ctx.moveTo(paL, cy); ctx.lineTo(paR, cy); ctx.stroke();
          }
          // Edge alignment with other blocks
          if (impo.blocks!.length > 1) {
            for (let oi = 0; oi < impo.blocks!.length; oi++) {
              if (oi === sbi) continue;
              const ob = impo.blocks![oi];
              const obx = offX + dmL + ob.x * scale;
              const oby = offY + dmT + ob.y * scale;
              const obr = obx + ob.blockW * scale;
              const obb = oby + ob.blockH * scale;
              // Left aligned
              if (Math.abs(sblk.x - ob.x) < snapT) {
                ctx.beginPath(); ctx.moveTo(obx, Math.min(sby, oby) - 4); ctx.lineTo(obx, Math.max(sby + sbh, obb) + 4); ctx.stroke();
              }
              // Right aligned
              if (Math.abs(sblk.x + sblk.blockW - ob.x - ob.blockW) < snapT) {
                ctx.beginPath(); ctx.moveTo(obr, Math.min(sby, oby) - 4); ctx.lineTo(obr, Math.max(sby + sbh, obb) + 4); ctx.stroke();
              }
              // Top aligned
              if (Math.abs(sblk.y - ob.y) < snapT) {
                ctx.beginPath(); ctx.moveTo(Math.min(sbx, obx) - 4, oby); ctx.lineTo(Math.max(sbx + sbw, obr) + 4, oby); ctx.stroke();
              }
              // Bottom aligned
              if (Math.abs(sblk.y + sblk.blockH - ob.y - ob.blockH) < snapT) {
                ctx.beginPath(); ctx.moveTo(Math.min(sbx, obx) - 4, obb); ctx.lineTo(Math.max(sbx + sbw, obr) + 4, obb); ctx.stroke();
              }
            }
          }
          ctx.restore();
        }
      }
    }

    // Feed direction indicator — LEFT edge = paper entry side
    if (feedEdge) {
      const scX = (cW - 24) / sheetW;
      const scY = (cH - reserveTop - reserveBot) / sheetH;
      const sc = Math.min(scX, scY);
      const dW = sheetW * sc;
      const dH = sheetH * sc;
      const sx = (cW - dW) / 2;
      const sy = reserveTop + (cH - reserveTop - reserveBot - dH) / 2;

      ctx.save();
      ctx.fillStyle = 'rgba(245,130,32,0.7)';

      // Large triangle arrow (no tail) pointing right at sheet left edge
      const ax = sx - 2;
      const ay = sy + dH / 2;
      const triW = 12;
      const triH = 8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - triW, ay - triH);
      ctx.lineTo(ax - triW, ay + triH);
      ctx.closePath();
      ctx.fill();

      // Label: "MACHINE FEED SIDE" — left of the arrow, never overlapping
      ctx.save();
      ctx.font = '700 8px Inter, DM Sans, sans-serif';
      ctx.translate(ax - triW - 6, sy + dH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText('MACHINE FEED SIDE', 0, 0);
      ctx.restore();

      ctx.restore();
    }

    // Bottom info strip
    const modeLabels: Record<string, string> = {
      nup: 'N-Up', booklet: 'Booklet', perfect_bound: 'Perfect Bound',
      cutstack: 'Cut & Stack', workturn: 'Work & Turn',
      gangrun: 'Gang Run', stepmulti: 'Step Multi',
    };
    const parts: string[] = [];
    parts.push(modeLabels[impo.mode] || impo.mode);
    if (impo.ups) parts.push(impo.ups + ' UP');
    parts.push(Math.round(sheetW) + '×' + Math.round(sheetH) + ' mm');
    parts.push(Math.round(impo.trimW) + '×' + Math.round(impo.trimH) + ' mm/τεμ.');
    if (impo.wastePercent > 0) parts.push(impo.wastePercent.toFixed(1) + '% waste');

    ctx.font = '600 9px Inter, DM Sans, sans-serif';
    ctx.fillStyle = COLORS.info;
    ctx.textAlign = 'center';
    ctx.fillText(parts.join(' · '), cW / 2, cH - 5);

  }, [impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight, bleed, gutter, cropMarks, machCat, sides, offsetX, offsetY, showColorBar, colorBarEdge, colorBarOffY, colorBarScale, showPlateSlug, plateSlugEdge, pdf, viewMode, isDuplex, feedEdge, activeSigSheet, sigShowBack, hasSigNav, csNumbering]);

  useEffect(() => { draw(); }, [draw]);

  // ─── ZOOM ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const canvasX = (mx - panRef.current.x) / zoom;
      const canvasY = (my - panRef.current.y) / zoom;
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      const newZoom = Math.max(1, Math.min(6, zoom * factor));
      panRef.current.x = mx - canvasX * newZoom;
      panRef.current.y = my - canvasY * newZoom;
      setZoom(newZoom);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (zoom <= 1.02) {
      canvas.style.transform = '';
      panRef.current = { x: 0, y: 0 };
    } else {
      canvas.style.transform = `translate(${panRef.current.x}px,${panRef.current.y}px) scale(${zoom})`;
    }
  }, [zoom]);

  // ─── STEP MULTI DRAG ───
  const smDragRef = useRef<{
    blockIdx: number;
    mode: 'resize' | 'move';
    cols: number; rows: number;  // for resize
    startMmX: number; startMmY: number; origX: number; origY: number;  // for move
  } | null>(null);

  const canvasToMM = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { mmX: 0, mmY: 0 };
    const rect = canvas.getBoundingClientRect();
    // Account for object-fit: contain (letterboxing)
    const canvasAspect = LOGICAL_W / LOGICAL_H;
    const boxAspect = rect.width / rect.height;
    let contentW: number, contentH: number, contentX: number, contentY: number;
    if (boxAspect > canvasAspect) {
      contentH = rect.height;
      contentW = rect.height * canvasAspect;
      contentX = (rect.width - contentW) / 2;
      contentY = 0;
    } else {
      contentW = rect.width;
      contentH = rect.width / canvasAspect;
      contentX = 0;
      contentY = (rect.height - contentH) / 2;
    }
    const lx = (clientX - rect.left - contentX) / contentW * LOGICAL_W;
    const ly = (clientY - rect.top - contentY) / contentH * LOGICAL_H;
    // Replicate the sheet positioning from draw()
    const markLen = cropMarks ? 8 : 0;
    const reserveTop = 20;
    const reserveBot = 22;
    const scaleX = (LOGICAL_W - 24 - markLen * 2) / sheetW;
    const scaleY = (LOGICAL_H - reserveTop - reserveBot - markLen * 2) / sheetH;
    const s = Math.min(scaleX, scaleY);
    const drawW = sheetW * s;
    const drawH = sheetH * s;
    const sheetOffX = (LOGICAL_W - drawW) / 2;
    const sheetOffY = reserveTop + markLen + (LOGICAL_H - reserveTop - reserveBot - markLen * 2 - drawH) / 2;
    // Convert to mm relative to printable area origin
    const isOff = machCat === 'offset';
    const mt = isOff ? marginBottom : marginTop;
    return { mmX: (lx - sheetOffX) / s - marginLeft, mmY: (ly - sheetOffY) / s - mt };
  }, [sheetW, sheetH, marginLeft, marginTop, marginBottom, machCat, cropMarks]);

  const findSmHandle = useCallback((mmX: number, mmY: number): number => {
    if (!smBlocks || impo.mode !== 'stepmulti') return -1;
    const handleMM = 6;
    const computed = impo.blocks || [];
    for (let i = computed.length - 1; i >= 0; i--) {
      const blk = computed[i];
      const right = blk.x + blk.blockW;
      const bottom = blk.y + blk.blockH;
      if (mmX >= right - handleMM && mmX <= right + handleMM &&
          mmY >= bottom - handleMM && mmY <= bottom + handleMM) return i;
    }
    return -1;
  }, [smBlocks, impo]);

  const findSmBlock = useCallback((mmX: number, mmY: number): number => {
    if (!smBlocks || impo.mode !== 'stepmulti') return -1;
    const computed = impo.blocks || [];
    for (let i = computed.length - 1; i >= 0; i--) {
      const blk = computed[i];
      if (mmX >= blk.x && mmX <= blk.x + blk.blockW &&
          mmY >= blk.y && mmY <= blk.y + blk.blockH) return i;
    }
    return -1;
  }, [smBlocks, impo]);

  // ─── PAN ───
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Step multi: resize handle takes priority, then block move
    if (smBlocks && impo.mode === 'stepmulti' && impo.blocks) {
      const { mmX, mmY } = canvasToMM(e.clientX, e.clientY);
      const hi = findSmHandle(mmX, mmY);
      if (hi >= 0) {
        const blk = impo.blocks[hi];
        smDragRef.current = { blockIdx: hi, mode: 'resize', cols: blk.cols, rows: blk.rows, startMmX: mmX, startMmY: mmY, origX: blk.x, origY: blk.y };
        e.preventDefault();
        return;
      }
      const bi = findSmBlock(mmX, mmY);
      if (bi >= 0) {
        const blk = impo.blocks[bi];
        smDragRef.current = { blockIdx: bi, mode: 'move', cols: blk.cols, rows: blk.rows, startMmX: mmX, startMmY: mmY, origX: blk.x, origY: blk.y };
        e.preventDefault();
        return;
      }
    }
    if (zoom <= 1.02) return;
    draggingRef.current = true;
    dragLastRef.current = { x: e.clientX, y: e.clientY };
  }, [zoom, smBlocks, impo, canvasToMM, findSmHandle, findSmBlock]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Step multi drag (resize or move)
    if (smDragRef.current && smBlocks && impo.blocks) {
      const { mmX, mmY } = canvasToMM(e.clientX, e.clientY);
      const bi = smDragRef.current.blockIdx;
      const blk = smBlocks[bi];
      if (!blk) return;
      const printW = sheetW - marginLeft - marginRight;
      const printH = sheetH - marginTop - marginBottom;

      if (smDragRef.current.mode === 'resize' && onSmBlockUpdate) {
        const rot = blk.rotation || 0;
        const sw = rot === 90 || rot === 270;
        const cellW = (sw ? blk.trimH : blk.trimW) + bleed * 2;
        const cellH = (sw ? blk.trimW : blk.trimH) + bleed * 2;
        const bx = impo.blocks[bi]?.x ?? 0;
        const by = impo.blocks[bi]?.y ?? 0;
        const dragW = mmX - bx;
        const dragH = mmY - by;
        const newCols = Math.max(1, Math.min(
          Math.round((dragW + gutter) / (cellW + gutter)),
          Math.floor((printW - bx + gutter) / (cellW + gutter)),
        ));
        const newRows = Math.max(1, Math.min(
          Math.round((dragH + gutter) / (cellH + gutter)),
          Math.floor((printH - by + gutter) / (cellH + gutter)),
        ));
        if (newCols !== smDragRef.current.cols || newRows !== smDragRef.current.rows) {
          smDragRef.current.cols = newCols;
          smDragRef.current.rows = newRows;
          onSmBlockUpdate(bi, newCols, newRows);
        }
      } else if (smDragRef.current.mode === 'move' && onSmBlockMove) {
        const dx = mmX - smDragRef.current.startMmX;
        const dy = mmY - smDragRef.current.startMmY;
        const blockW = impo.blocks[bi]?.blockW ?? 0;
        const blockH = impo.blocks[bi]?.blockH ?? 0;
        let newX = Math.max(0, Math.min(printW - blockW, smDragRef.current.origX + dx));
        let newY = Math.max(0, Math.min(printH - blockH, smDragRef.current.origY + dy));

        // Magnetic snap
        const snapThreshold = 3; // mm
        const xEdges: number[] = [0, printW, printW / 2]; // left, right, center
        const yEdges: number[] = [0, printH, printH / 2]; // top, bottom, center
        // Add edges from other blocks
        for (let j = 0; j < impo.blocks.length; j++) {
          if (j === bi) continue;
          const ob = impo.blocks[j];
          xEdges.push(ob.x, ob.x + ob.blockW);
          yEdges.push(ob.y, ob.y + ob.blockH);
        }
        // Snap block edges (left, right, centerX)
        const myXEdges = [newX, newX + blockW, newX + blockW / 2];
        let bestDx = snapThreshold + 1;
        for (const me of myXEdges) {
          for (const se of xEdges) {
            const d = Math.abs(me - se);
            if (d < bestDx) { bestDx = d; newX += se - me; }
          }
        }
        // Snap block edges (top, bottom, centerY)
        const myYEdges = [newY, newY + blockH, newY + blockH / 2];
        let bestDy = snapThreshold + 1;
        for (const me of myYEdges) {
          for (const se of yEdges) {
            const d = Math.abs(me - se);
            if (d < bestDy) { bestDy = d; newY += se - me; }
          }
        }
        newX = Math.max(0, Math.min(printW - blockW, newX));
        newY = Math.max(0, Math.min(printH - blockH, newY));
        onSmBlockMove(bi, Math.round(newX * 10) / 10, Math.round(newY * 10) / 10);
      }
      return;
    }
    // Step multi cursor
    if (smBlocks && impo.mode === 'stepmulti') {
      const { mmX, mmY } = canvasToMM(e.clientX, e.clientY);
      const container = containerRef.current;
      if (container) {
        const h = findSmHandle(mmX, mmY);
        const b = h < 0 ? findSmBlock(mmX, mmY) : -1;
        container.style.cursor = h >= 0 ? 'nwse-resize' : b >= 0 ? 'move' : (zoom > 1.02 ? 'grab' : 'default');
      }
    }
    if (!draggingRef.current) return;
    const dx = e.clientX - dragLastRef.current.x;
    const dy = e.clientY - dragLastRef.current.y;
    dragLastRef.current = { x: e.clientX, y: e.clientY };
    panRef.current.x += dx;
    panRef.current.y += dy;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.transform = `translate(${panRef.current.x}px,${panRef.current.y}px) scale(${zoom})`;
  }, [zoom, smBlocks, impo, onSmBlockUpdate, onSmBlockMove, canvasToMM, findSmHandle, findSmBlock, bleed, gutter, sheetW, sheetH, marginLeft, marginRight, marginTop, marginBottom]);
  const onMouseUp = useCallback(() => { draggingRef.current = false; smDragRef.current = null; }, []);
  const onDoubleClick = useCallback(() => { setZoom(1); panRef.current = { x: 0, y: 0 }; }, []);

  // ─── DROP ───
  const [dragOver, setDragOver] = useState(false);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onDropHandler = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (onDrop && e.dataTransfer.files.length) onDrop(e.dataTransfer.files);
  }, [onDrop]);

  // ─── PILL STYLE ───
  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 6, border: 'none', fontSize: '0.62rem', fontWeight: 700,
    background: active ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
    color: active ? '#fff' : 'rgba(148,163,184,0.7)',
    cursor: 'pointer', transition: 'all 0.15s',
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        borderRadius: 10, cursor: zoom > 1.02 ? 'grab' : 'default',
        border: dragOver ? '2px dashed var(--accent)' : '2px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.25)',
      }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp} onDoubleClick={onDoubleClick}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDropHandler}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', transformOrigin: '0 0' }} />

      {/* View mode toggle (bottom-right, dual only) */}
      {isDuplex && (
        <div style={{
          position: 'absolute', bottom: 26, right: 8, zIndex: 3,
          display: 'flex', gap: 3, alignItems: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
          borderRadius: 8, padding: '3px 4px',
        }}>
          <button onClick={() => setViewMode('single')} style={pillStyle(viewMode === 'single')} title="Single view">
            <i className="fas fa-square" style={{ fontSize: '0.5rem' }} />
          </button>
          <button onClick={() => setViewMode('dual')} style={pillStyle(viewMode === 'dual')} title="Side-by-side">
            <i className="fas fa-columns" style={{ fontSize: '0.5rem' }} />
          </button>
        </div>
      )}

      {/* Zoom indicator */}
      {zoom > 1.02 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          borderRadius: 6, padding: '3px 8px', fontSize: '0.65rem',
          fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <i className="fas fa-search-plus" style={{ fontSize: '0.55rem' }} />
          {Math.round(zoom * 100)}%
          <button onClick={onDoubleClick} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.6rem', padding: 0 }}>
            <i className="fas fa-compress" />
          </button>
        </div>
      )}

      {/* Drop overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(245,130,32,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-file-pdf" style={{ fontSize: '1.2rem' }} /> Drop PDF
          </div>
        </div>
      )}
    </div>
  );
}
