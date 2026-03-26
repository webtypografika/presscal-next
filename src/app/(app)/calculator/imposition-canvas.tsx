'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { ImpositionResult, ImpositionCell } from '@/types/calculator';
import type { ParsedPDF, PDFPageSize } from '@/lib/calc/pdf-utils';

/* ═══════════════════════════════════════════════════
   Imposition Canvas — Phase 1+2: Preview + Zoom/Pan + PDF Thumbnails
   Port of mod_imposer.js canvas renderer
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
  pdf?: ParsedPDF | null;
  onDrop?: (files: FileList) => void;
}

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

// ─── ROUND RECT HELPER ───
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

export default function ImpositionCanvas({
  impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight,
  bleed, gutter, cropMarks, machCat, pdf, onDrop,
}: ImpositionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const panRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragLastRef = useRef({ x: 0, y: 0 });

  // Logical canvas size
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
    // Fit within container using object-fit contain behavior
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr * renderScale, 0, 0, dpr * renderScale, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    const cW = LOGICAL_W;
    const cH = LOGICAL_H;

    const hasBleed = bleed > 0;
    const hasGutter = gutter > 0;
    const markLen = cropMarks ? 8 : 0;
    const reserveTop = 20;
    const reserveBot = 22;

    // Scale to fit
    const scaleX = (cW - 24 - markLen * 2) / sheetW;
    const scaleY = (cH - reserveTop - reserveBot - markLen * 2) / sheetH;
    const scale = Math.min(scaleX, scaleY);

    const drawW = sheetW * scale;
    const drawH = sheetH * scale;
    const offX = (cW - drawW) / 2;
    const offY = reserveTop + markLen + (cH - reserveTop - reserveBot - markLen * 2 - drawH) / 2;

    // Shadow
    ctx.fillStyle = COLORS.shadow;
    roundRect(ctx, offX + 3, offY + 3, drawW, drawH, 3);
    ctx.fill();

    // Paper
    ctx.fillStyle = COLORS.paper;
    ctx.strokeStyle = COLORS.paperStroke;
    ctx.lineWidth = 1;
    roundRect(ctx, offX, offY, drawW, drawH, 3);
    ctx.fill();
    ctx.stroke();

    // Margins
    const mL = marginLeft * scale;
    const mR = marginRight * scale;
    const mT = marginTop * scale;
    const mB = marginBottom * scale;

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
    const gutterPx = hasGutter ? gutter * scale : 0;
    const bleedPx = hasBleed ? bleed * scale : 0;
    const totalGridW = impo.cols * pw + Math.max(0, impo.cols - 1) * gutterPx;
    const totalGridH = impo.rows * ph + Math.max(0, impo.rows - 1) * gutterPx;
    const cenX = paX + (printAreaW - totalGridW) / 2;
    const cenY = paY + (printAreaH - totalGridH) / 2;

    // Draw cells
    for (let row = 0; row < impo.rows; row++) {
      for (let col = 0; col < impo.cols; col++) {
        const idx = row * impo.cols + col;
        if (idx >= impo.cells.length) continue;
        const cell = impo.cells[idx];

        const x = cenX + col * (pw + gutterPx);
        const y = cenY + row * (ph + gutterPx);
        const isRotated = cell.rotation && cell.rotation !== 0;

        // Bleed zone
        if (hasBleed) {
          ctx.fillStyle = COLORS.bleedBand;
          ctx.fillRect(x, y, pw, bleedPx);
          ctx.fillRect(x, y + ph - bleedPx, pw, bleedPx);
          ctx.fillRect(x, y + bleedPx, bleedPx, ph - 2 * bleedPx);
          ctx.fillRect(x + pw - bleedPx, y + bleedPx, bleedPx, ph - 2 * bleedPx);

          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = COLORS.bleedStroke;
          ctx.lineWidth = 0.6;
          ctx.strokeRect(x + bleedPx, y + bleedPx, pw - 2 * bleedPx, ph - 2 * bleedPx);
          ctx.setLineDash([]);
        }

        // Trim area
        const trimX = x + (hasBleed ? bleedPx : 0);
        const trimY = y + (hasBleed ? bleedPx : 0);
        const trimW = hasBleed ? pw - 2 * bleedPx : pw;
        const trimH = hasBleed ? ph - 2 * bleedPx : ph;

        // PDF thumbnail or colored fill
        const pageIdx = (cell.pageNum || idx + 1) - 1;
        const thumb = pdf?.thumbnails?.[pageIdx % (pdf?.thumbnails?.length || 1)];
        const pgSize = pdf?.pageSizes?.[pageIdx % (pdf?.pageSizes?.length || 1)];

        if (thumb && pgSize) {
          // Render PDF thumbnail clipped to cell
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, pw, ph);
          ctx.clip();

          const rendW = (pgSize.cropW || pgSize.w) * scale;
          const rendH = (pgSize.cropH || pgSize.h) * scale;
          const tOffX = (pgSize.trimOffX != null ? pgSize.trimOffX : ((pgSize.cropW || pgSize.w) - pgSize.trimW) / 2) * scale;
          const tOffY = (pgSize.trimOffY != null ? pgSize.trimOffY : ((pgSize.cropH || pgSize.h) - pgSize.trimH) / 2) * scale;

          // Check if PDF page orientation matches cell orientation
          const pdfPortrait = pgSize.trimW <= pgSize.trimH;
          const cellPortrait = pw <= ph;

          if (pdfPortrait !== cellPortrait) {
            // Rotate 90° to fit
            ctx.translate(trimX + trimW / 2, trimY + trimH / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(thumb, -(tOffX + (pgSize.trimW * scale) / 2), -(tOffY + (pgSize.trimH * scale) / 2), rendW, rendH);
          } else {
            // Align TrimBox with cell trim area
            ctx.drawImage(thumb, trimX - tOffX, trimY - tOffY, rendW, rendH);
          }
          ctx.restore();

          // Light border over thumbnail
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);
        } else {
          // No PDF — colored fill + page number
          ctx.fillStyle = isRotated ? COLORS.rotatedFill : COLORS.trimFill;
          ctx.fillRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);

          ctx.strokeStyle = isRotated ? COLORS.rotatedStroke : COLORS.trimStroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(trimX + 0.5, trimY + 0.5, trimW - 1, trimH - 1);

          const fontSize = Math.min(trimW * 0.3, trimH * 0.3, 20);
          ctx.font = `600 ${fontSize}px Inter, DM Sans, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = isRotated ? COLORS.rotatedNum : COLORS.cellNum;
          ctx.fillText(String(cell.pageNum || idx + 1), trimX + trimW / 2, trimY + trimH / 2 + fontSize * 0.35);
        }
      }
    }

    // Gutter lines
    if (hasGutter && gutterPx > 1) {
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

    // Crop marks
    if (cropMarks) {
      ctx.strokeStyle = COLORS.cropMark;
      ctx.lineWidth = 0.5;
      for (let row = 0; row <= impo.rows; row++) {
        for (let col = 0; col <= impo.cols; col++) {
          const cx = cenX + col * (pw + gutterPx) - (col > 0 ? gutterPx : 0);
          const cy = cenY + row * (ph + gutterPx) - (row > 0 ? gutterPx : 0);
          // Horizontal marks
          ctx.beginPath();
          ctx.moveTo(cx - markLen, cy);
          ctx.lineTo(cx - 2, cy);
          ctx.moveTo(cx + pw + 2, cy);
          ctx.lineTo(cx + pw + markLen, cy);
          ctx.stroke();
          // Vertical marks
          ctx.beginPath();
          ctx.moveTo(cx, cy - markLen);
          ctx.lineTo(cx, cy - 2);
          ctx.moveTo(cx, cy + ph + 2);
          ctx.lineTo(cx, cy + ph + markLen);
          ctx.stroke();
        }
      }
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

  }, [impo, sheetW, sheetH, marginTop, marginBottom, marginLeft, marginRight, bleed, gutter, cropMarks, machCat, pdf]);

  // ─── DRAW ON CHANGE ───
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

  // Apply zoom transform
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

  // ─── PAN (drag when zoomed) ───
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1.02) return;
    draggingRef.current = true;
    dragLastRef.current = { x: e.clientX, y: e.clientY };
  }, [zoom]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragLastRef.current.x;
    const dy = e.clientY - dragLastRef.current.y;
    dragLastRef.current = { x: e.clientX, y: e.clientY };
    panRef.current.x += dx;
    panRef.current.y += dy;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.transform = `translate(${panRef.current.x}px,${panRef.current.y}px) scale(${zoom})`;
    }
  }, [zoom]);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ─── DOUBLE-CLICK RESET ───
  const onDoubleClick = useCallback(() => {
    setZoom(1);
    panRef.current = { x: 0, y: 0 };
  }, []);

  // ─── DROP ZONE ───
  const [dragOver, setDragOver] = useState(false);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback(() => setDragOver(false), []);
  const onDropHandler = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (onDrop && e.dataTransfer.files.length) {
      onDrop(e.dataTransfer.files);
    }
  }, [onDrop]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
        borderRadius: 10, cursor: zoom > 1.02 ? 'grab' : 'default',
        border: dragOver ? '2px dashed var(--accent)' : '2px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.25)',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropHandler}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', transformOrigin: '0 0' }}
      />
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
          <button onClick={onDoubleClick} style={{
            border: 'none', background: 'none', color: '#64748b',
            cursor: 'pointer', fontSize: '0.6rem', padding: 0,
          }}><i className="fas fa-compress" /></button>
        </div>
      )}
      {/* Drop overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(245,130,32,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-file-pdf" style={{ fontSize: '1.2rem' }} />
            Drop PDF εδώ
          </div>
        </div>
      )}
    </div>
  );
}
