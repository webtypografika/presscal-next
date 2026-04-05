'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { parsePDF } from '@/lib/calc/pdf-utils';
import type { ParsedPDF } from '@/lib/calc/pdf-utils';

/* ═══════════════════════════════════════════════════
   Grid Builder Prototype — Preps-style drag-to-repeat
   Drop PDF → 1 cell → drag corner to expand grid
   ═══════════════════════════════════════════════════ */

// Sheet dimensions (mm) — hardcoded for prototype
const SHEET_W = 487;
const SHEET_H = 330;
const MARGIN = 10; // mm all sides
const BLEED = 3;   // mm
const GUTTER = 0;  // mm between cells

const PRINT_W = SHEET_W - MARGIN * 2;
const PRINT_H = SHEET_H - MARGIN * 2;

interface GridBlock {
  pdf: ParsedPDF;
  trimW: number; // mm
  trimH: number;
  cols: number;
  rows: number;
  x: number; // mm from printable origin
  y: number;
}

export default function TestGridPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [blocks, setBlocks] = useState<GridBlock[]>([]);
  const [dragState, setDragState] = useState<{
    blockIdx: number;
    startX: number;
    startY: number;
    cols: number;
    rows: number;
  } | null>(null);

  // Canvas scale: fit sheet into available width
  const [canvasW, setCanvasW] = useState(800);
  const scale = canvasW / SHEET_W;
  const canvasH = SHEET_H * scale;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width || 800;
      setCanvasW(Math.min(w - 4, 1200));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Handle PDF drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length === 0) return;

    for (const file of files) {
      const parsed = await parsePDF(file);
      if (parsed.pageSizes.length === 0) continue;
      const pg = parsed.pageSizes[0];
      const trimW = pg.trimW;
      const trimH = pg.trimH;

      // Find free Y position (stack below existing blocks)
      let freeY = 0;
      for (const b of blocks) {
        const bBottom = b.y + b.rows * (b.trimH + BLEED * 2 + GUTTER) - GUTTER;
        if (bBottom > freeY) freeY = bBottom + GUTTER;
      }

      setBlocks(prev => [...prev, {
        pdf: parsed,
        trimW,
        trimH,
        cols: 1,
        rows: 1,
        x: 0,
        y: freeY,
      }]);
    }
  }, [blocks]);

  // Mouse → mm conversion (relative to printable area origin)
  const canvasToMM = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { mmX: 0, mmY: 0 };
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      mmX: px / scale - MARGIN,
      mmY: py / scale - MARGIN,
    };
  }, [scale]);

  // Find if mouse is near a block's bottom-right corner (drag handle)
  const findHandle = useCallback((mmX: number, mmY: number): number => {
    const handleSize = 8; // mm
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      const cellW = b.trimW + BLEED * 2;
      const cellH = b.trimH + BLEED * 2;
      const blockRight = b.x + b.cols * (cellW + GUTTER) - GUTTER;
      const blockBottom = b.y + b.rows * (cellH + GUTTER) - GUTTER;
      if (mmX >= blockRight - handleSize && mmX <= blockRight + handleSize &&
          mmY >= blockBottom - handleSize && mmY <= blockBottom + handleSize) {
        return i;
      }
    }
    return -1;
  }, [blocks]);

  // Mouse down — start drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const { mmX, mmY } = canvasToMM(e.clientX, e.clientY);
    const handleIdx = findHandle(mmX, mmY);
    if (handleIdx >= 0) {
      setDragState({
        blockIdx: handleIdx,
        startX: mmX,
        startY: mmY,
        cols: blocks[handleIdx].cols,
        rows: blocks[handleIdx].rows,
      });
      e.preventDefault();
    }
  }, [canvasToMM, findHandle, blocks]);

  // Mouse move — update grid size
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState) {
      // Update cursor
      const { mmX, mmY } = canvasToMM(e.clientX, e.clientY);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = findHandle(mmX, mmY) >= 0 ? 'nwse-resize' : 'default';
      }
      return;
    }

    const { mmX, mmY } = canvasToMM(e.clientX, e.clientY);
    const b = blocks[dragState.blockIdx];
    const cellW = b.trimW + BLEED * 2;
    const cellH = b.trimH + BLEED * 2;

    // Calculate cols/rows from drag position relative to block origin
    const dragW = mmX - b.x;
    const dragH = mmY - b.y;
    const newCols = Math.max(1, Math.min(
      Math.round((dragW + GUTTER) / (cellW + GUTTER)),
      Math.floor((PRINT_W - b.x + GUTTER) / (cellW + GUTTER)),
    ));
    const newRows = Math.max(1, Math.min(
      Math.round((dragH + GUTTER) / (cellH + GUTTER)),
      Math.floor((PRINT_H - b.y + GUTTER) / (cellH + GUTTER)),
    ));

    if (newCols !== dragState.cols || newRows !== dragState.rows) {
      setDragState(prev => prev ? { ...prev, cols: newCols, rows: newRows } : null);
      setBlocks(prev => prev.map((bl, i) =>
        i === dragState.blockIdx ? { ...bl, cols: newCols, rows: newRows } : bl
      ));
    }
  }, [dragState, blocks, canvasToMM, findHandle]);

  // Mouse up — finish drag
  const onMouseUp = useCallback(() => {
    if (dragState) setDragState(null);
  }, [dragState]);

  // ─── DRAW ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasW * 2; // retina
    canvas.height = canvasH * 2;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Sheet
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.fillRect(0, 0, SHEET_W * scale, SHEET_H * scale);
    ctx.strokeRect(0, 0, SHEET_W * scale, SHEET_H * scale);

    // Margin area
    ctx.strokeStyle = 'rgba(245,130,32,0.25)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(
      MARGIN * scale, MARGIN * scale,
      PRINT_W * scale, PRINT_H * scale,
    );
    ctx.setLineDash([]);

    // Draw blocks
    const blkColors = ['#f58220', '#3b82f6', '#14b8a6', '#a78bfa', '#f472b6', '#facc15'];

    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const cellW = b.trimW + BLEED * 2;
      const cellH = b.trimH + BLEED * 2;
      const color = blkColors[bi % blkColors.length];
      const thumb = b.pdf.thumbnails[0];

      for (let row = 0; row < b.rows; row++) {
        for (let col = 0; col < b.cols; col++) {
          const cx = (MARGIN + b.x + col * (cellW + GUTTER)) * scale;
          const cy = (MARGIN + b.y + row * (cellH + GUTTER)) * scale;
          const cw = cellW * scale;
          const ch = cellH * scale;

          // Bleed zone
          ctx.fillStyle = 'rgba(239,68,68,0.06)';
          ctx.fillRect(cx, cy, cw, ch);

          // Trim area
          const bpx = BLEED * scale;
          const tx = cx + bpx;
          const ty = cy + bpx;
          const tw = cw - bpx * 2;
          const th = ch - bpx * 2;

          // PDF thumbnail
          if (thumb) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(cx, cy, cw, ch);
            ctx.clip();

            const pgSize = b.pdf.pageSizes[0];
            const pdfW = pgSize.trimW;
            const pdfH = pgSize.trimH;
            const scX = tw / (pdfW * scale);
            const scY = th / (pdfH * scale);
            const sc = Math.min(scX, scY);
            const drawW = (pgSize.cropW || pgSize.w) * scale * sc;
            const drawH = (pgSize.cropH || pgSize.h) * scale * sc;
            const offX = (pgSize.trimOffX ?? ((pgSize.cropW || pgSize.w) - pdfW) / 2) * scale * sc;
            const offY = (pgSize.trimOffY ?? ((pgSize.cropH || pgSize.h) - pdfH) / 2) * scale * sc;
            ctx.drawImage(thumb, tx - offX, ty - offY, drawW, drawH);
            ctx.restore();
          } else {
            ctx.fillStyle = `${color}15`;
            ctx.fillRect(tx, ty, tw, th);
          }

          // Trim border
          ctx.strokeStyle = `${color}40`;
          ctx.lineWidth = 0.8;
          ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
        }
      }

      // Block boundary
      const totalW = (b.cols * (cellW + GUTTER) - GUTTER) * scale;
      const totalH = (b.rows * (cellH + GUTTER) - GUTTER) * scale;
      const bx = (MARGIN + b.x) * scale;
      const by = (MARGIN + b.y) * scale;

      ctx.strokeStyle = color;
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 1, by - 1, totalW + 2, totalH + 2);
      ctx.setLineDash([]);

      // Drag handle (bottom-right corner)
      const hx = bx + totalW;
      const hy = by + totalH;
      const hs = 6;
      ctx.fillStyle = color;
      ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      // Handle icon (diagonal lines)
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(hx - 3, hy + 3); ctx.lineTo(hx + 3, hy - 3);
      ctx.moveTo(hx, hy + 3); ctx.lineTo(hx + 3, hy);
      ctx.stroke();

      // Block label
      ctx.fillStyle = color;
      ctx.font = '600 11px Inter, DM Sans, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Block ${bi + 1}  ${b.cols}×${b.rows} = ${b.cols * b.rows} ups  (${b.trimW}×${b.trimH}mm)`, bx + 2, by - 5);
    }

    // Drop hint if empty
    if (blocks.length === 0) {
      ctx.fillStyle = 'rgba(148,163,184,0.4)';
      ctx.font = '600 16px Inter, DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Drop PDF here', SHEET_W * scale / 2, SHEET_H * scale / 2);
      ctx.font = '400 12px Inter, DM Sans, sans-serif';
      ctx.fillText('Drag corner handle to expand grid', SHEET_W * scale / 2, SHEET_H * scale / 2 + 22);
    }
  }, [canvasW, canvasH, scale, blocks, dragState]);

  // Remove block
  const removeBlock = (idx: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>
        Grid Builder Prototype
      </h2>
      <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 16 }}>
        Drop PDF on canvas. Drag the corner handle to expand the grid.
      </p>

      {/* Block list */}
      {blocks.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {blocks.map((b, i) => {
            const color = ['#f58220', '#3b82f6', '#14b8a6', '#a78bfa'][i % 4];
            return (
              <div key={i} style={{
                padding: '4px 10px', borderRadius: 6,
                background: `${color}18`, border: `1px solid ${color}40`,
                fontSize: '0.7rem', fontWeight: 600, color,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 3, background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.5rem', fontWeight: 800, color: '#fff',
                }}>{i + 1}</span>
                {b.pdf.fileName.slice(0, 20)} — {b.trimW}×{b.trimH}mm — {b.cols}×{b.rows} = {b.cols * b.rows} ups
                <button onClick={() => removeBlock(i)} style={{
                  border: 'none', background: 'transparent', color: '#64748b',
                  cursor: 'pointer', fontSize: '0.6rem', padding: '2px',
                }}>
                  <i className="fas fa-times" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} style={{ width: '100%' }}>
        <canvas
          ref={canvasRef}
          width={canvasW * 2}
          height={canvasH * 2}
          style={{
            width: canvasW, height: canvasH,
            borderRadius: 8, cursor: 'default',
          }}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>

      <div style={{ marginTop: 8, fontSize: '0.65rem', color: '#475569' }}>
        {SHEET_W}×{SHEET_H}mm sheet · {MARGIN}mm margins · {BLEED}mm bleed · {GUTTER}mm gutter
      </div>
    </div>
  );
}
