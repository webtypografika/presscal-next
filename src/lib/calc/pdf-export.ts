// PressCal Pro — PDF Export for Imposition Preview
// Uses pdf-lib to generate a PDF with imposed layout

import type { ImpositionResult } from '@/types/calculator';

// Lazy-load pdf-lib from CDN
let PDFLib: typeof import('pdf-lib') | null = null;

async function getPDFLib() {
  if (PDFLib) return PDFLib;
  // @ts-expect-error dynamic CDN import
  PDFLib = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  return PDFLib!;
}

// mm to PDF points (72 pt per inch, 25.4 mm per inch)
const MM_TO_PT = 72 / 25.4;

export interface ExportOptions {
  imposition: ImpositionResult;
  machineName?: string;
  paperName?: string;
  jobDescription?: string;
  showCropMarks?: boolean;
  showBleed?: boolean;
  bleed?: number;
}

export async function exportImpositionPDF(options: ExportOptions): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await getPDFLib();
  const { imposition, machineName, paperName, jobDescription, showCropMarks, bleed = 0 } = options;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = imposition.paperW * MM_TO_PT;
  const pageH = imposition.paperH * MM_TO_PT;

  const page = doc.addPage([pageW, pageH]);

  // ─── PAPER OUTLINE ───
  page.drawRectangle({
    x: 0, y: 0, width: pageW, height: pageH,
    borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5,
  });

  // ─── CELLS ───
  const cells = imposition.cells;
  for (const cell of cells) {
    const x = cell.x * MM_TO_PT;
    // PDF Y is bottom-up, canvas Y is top-down
    const y = pageH - (cell.y + cell.h) * MM_TO_PT;
    const w = cell.w * MM_TO_PT;
    const h = cell.h * MM_TO_PT;

    // Bleed zone (light red)
    if (bleed > 0) {
      page.drawRectangle({
        x, y, width: w, height: h,
        color: rgb(1, 0.85, 0.85), opacity: 0.3,
      });
    }

    // Trim area
    const trimX = x + bleed * MM_TO_PT;
    const trimY = y + bleed * MM_TO_PT;
    const trimW = w - bleed * 2 * MM_TO_PT;
    const trimH = h - bleed * 2 * MM_TO_PT;

    page.drawRectangle({
      x: trimX, y: trimY, width: trimW, height: trimH,
      borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.25,
    });

    // Page number label
    if (cell.pageNum) {
      const label = String(cell.pageNum);
      const textW = font.widthOfTextAtSize(label, 8);
      page.drawText(label, {
        x: trimX + (trimW - textW) / 2,
        y: trimY + (trimH - 8) / 2,
        size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Crop marks
    if (showCropMarks) {
      const markLen = 3 * MM_TO_PT;
      const markOffset = 1.5 * MM_TO_PT;
      const corners = [
        { cx: trimX, cy: trimY },
        { cx: trimX + trimW, cy: trimY },
        { cx: trimX, cy: trimY + trimH },
        { cx: trimX + trimW, cy: trimY + trimH },
      ];
      for (const { cx, cy } of corners) {
        // Horizontal
        page.drawLine({
          start: { x: cx - markLen - markOffset, y: cy },
          end: { x: cx - markOffset, y: cy },
          thickness: 0.25, color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: cx + markOffset, y: cy },
          end: { x: cx + markLen + markOffset, y: cy },
          thickness: 0.25, color: rgb(0, 0, 0),
        });
        // Vertical
        page.drawLine({
          start: { x: cx, y: cy - markLen - markOffset },
          end: { x: cx, y: cy - markOffset },
          thickness: 0.25, color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: cx, y: cy + markOffset },
          end: { x: cx, y: cy + markLen + markOffset },
          thickness: 0.25, color: rgb(0, 0, 0),
        });
      }
    }
  }

  // ─── INFO STRIP (bottom) ───
  const infoY = 8;
  const infoSize = 6;
  const modeLabels: Record<string, string> = {
    nup: 'N-Up', booklet: 'Booklet', perfect_bound: 'Perfect Bound',
    cutstack: 'Cut & Stack', workturn: 'Work & Turn', gangrun: 'Gang Run', stepmulti: 'Step Multi',
  };
  const parts = [
    modeLabels[imposition.mode] || imposition.mode,
    `${imposition.ups} ups`,
    `${imposition.cols}×${imposition.rows}`,
    `${imposition.paperW}×${imposition.paperH}mm`,
    `Trim: ${imposition.trimW}×${imposition.trimH}mm`,
    `Waste: ${imposition.wastePercent.toFixed(1)}%`,
  ];
  if (machineName) parts.unshift(machineName);
  if (paperName) parts.push(paperName);

  const infoText = parts.join('  ·  ');
  page.drawText(infoText, {
    x: 10, y: infoY, size: infoSize, font, color: rgb(0.5, 0.5, 0.5),
  });

  // ─── TITLE (top) ───
  if (jobDescription) {
    page.drawText(jobDescription, {
      x: 10, y: pageH - 14, size: 8, font: fontBold, color: rgb(0.2, 0.2, 0.2),
    });
  }

  return doc.save();
}

/** Trigger browser download of the PDF */
export async function downloadImpositionPDF(options: ExportOptions, filename?: string) {
  const bytes = await exportImpositionPDF(options);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `imposition-${options.imposition.mode}-${Date.now()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
