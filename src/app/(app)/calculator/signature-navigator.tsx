'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { ImpositionResult, BookletSignatureSheet } from '@/types/calculator';

/* ═══════════════════════════════════════════════════
   Duplex Navigator — unified A/B + page/sheet strip
   for ALL duplex imposition modes.
   - Booklet/PB: sheet cards with signature page map
   - Other modes: page cards (A, B, 3, 4 …)
   ═══════════════════════════════════════════════════ */

interface DuplexNavigatorProps {
  impo: ImpositionResult;
  activePage: number;
  showBack: boolean;
  totalPdfPages: number;
  isDuplex: boolean;
  ups: number;
  onPageChange: (idx: number) => void;
  onSideChange: (back: boolean) => void;
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '3px 8px', borderRadius: 5, border: 'none', fontSize: '0.58rem', fontWeight: 700,
  background: active ? 'var(--impo)' : 'rgba(255,255,255,0.06)',
  color: active ? '#fff' : 'rgba(148,163,184,0.7)',
  cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
});

// ─── BOOKLET SHEET CARD ───
function SheetCard({
  idx, sheet, active, showBack, totalPages, onClick,
}: {
  idx: number;
  sheet: BookletSignatureSheet;
  active: boolean;
  showBack: boolean;
  totalPages: number;
  onClick: () => void;
}) {
  const blank = (p: number) => p > totalPages;
  const side = showBack ? sheet.back : sheet.front;

  return (
    <button onClick={onClick} style={{
      flexShrink: 0, minWidth: 52, padding: '3px 7px',
      borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${active ? 'var(--impo)' : 'rgba(255,255,255,0.06)'}`,
      background: active ? 'rgba(132,204,22,0.10)' : 'rgba(255,255,255,0.02)',
      transition: 'all 0.15s',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
    }}>
      <div style={{
        fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.06em',
        color: active ? 'var(--impo)' : '#475569',
      }}>
        {idx + 1}
      </div>
      <div style={{
        display: 'flex', gap: 3, fontSize: '0.62rem', lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{
          color: blank(side[0]) ? 'rgba(100,116,139,0.25)' : active ? '#e2e8f0' : '#94a3b8',
          fontWeight: 600,
        }}>
          {blank(side[0]) ? '\u2013' : side[0]}
        </span>
        <span style={{ color: 'rgba(100,116,139,0.18)' }}>|</span>
        <span style={{
          color: blank(side[1]) ? 'rgba(100,116,139,0.25)' : active ? '#e2e8f0' : '#94a3b8',
          fontWeight: 600,
        }}>
          {blank(side[1]) ? '\u2013' : side[1]}
        </span>
      </div>
    </button>
  );
}

// ─── GENERIC PAGE CARD (non-booklet modes) ───
function PageCard({ idx, active, onClick }: { idx: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, minWidth: 28, padding: '5px 10px',
      borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${active ? 'var(--impo)' : 'rgba(255,255,255,0.06)'}`,
      background: active ? 'rgba(132,204,22,0.10)' : 'rgba(255,255,255,0.02)',
      transition: 'all 0.15s',
      fontSize: '0.62rem', fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: active ? '#e2e8f0' : '#94a3b8',
    }}>
      {idx + 1}
    </button>
  );
}

export default function DuplexNavigator({
  impo, activePage, showBack, totalPdfPages, isDuplex, ups, onPageChange, onSideChange,
}: DuplexNavigatorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const hasSigMap = !!impo.signatureMap && impo.signatureMap.sheets.length > 0;
  const sigMap = impo.signatureMap;
  const isCutStack = impo.mode === 'cutstack' && totalPdfPages > 1;
  const totalItems = hasSigMap
    ? (sigMap?.sheets.length ?? 0)
    : isCutStack
      ? Math.max(1, Math.ceil(totalPdfPages / Math.max(ups, 1)))
      : Math.max(1, isDuplex ? Math.ceil(totalPdfPages / 2) : totalPdfPages);

  // Auto-scroll active item into view
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const left = el.offsetLeft - container.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left, behavior: 'smooth' });
    }
  }, [activePage]);

  // Keyboard nav
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && activePage > 0) {
      onPageChange(activePage - 1);
    } else if (e.key === 'ArrowRight' && activePage < totalItems - 1) {
      onPageChange(activePage + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      onSideChange(!showBack);
    }
  }, [activePage, totalItems, showBack, onPageChange, onSideChange]);

  // PB grouping
  const isPerfectBound = impo.mode === 'perfect_bound';
  const numSigs = impo.numSigs || impo.signatures || 1;
  const sheetsPerSig = hasSigMap ? Math.ceil(sigMap!.sheets.length / numSigs) : 0;
  const sigTotalPages = hasSigMap ? (impo.pageCount || sigMap!.paddedPages) : 0;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 0', flexShrink: 0,
      }}
      tabIndex={0}
      onKeyDown={onKey}
    >
      {/* A/B side toggle (duplex only) */}
      {isDuplex && (
        <div style={{
          display: 'flex', gap: 2, flexShrink: 0,
          background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 2,
        }}>
          <button onClick={() => onSideChange(false)} style={pillStyle(!showBack)}>A</button>
          <button onClick={() => onSideChange(true)} style={pillStyle(showBack)}>B</button>
        </div>
      )}

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, minWidth: 0, display: 'flex', gap: 3,
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none',
          padding: '2px 0',
        }}
      >
        {hasSigMap && isPerfectBound ? (
          // ── Perfect Bound: grouped by signature ──
          Array.from({ length: numSigs }, (_, s) => {
            const start = s * sheetsPerSig;
            const end = Math.min(start + sheetsPerSig, sigMap!.sheets.length);
            const groupSheets = sigMap!.sheets.slice(start, end);
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{
                  fontSize: '0.42rem', fontWeight: 700, letterSpacing: '0.06em',
                  color: '#475569', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  S{s + 1}
                </div>
                {groupSheets.map((sh, i) => {
                  const gIdx = start + i;
                  return (
                    <div key={gIdx} ref={activePage === gIdx ? activeRef : undefined}>
                      <SheetCard
                        idx={gIdx} sheet={sh} active={activePage === gIdx}
                        showBack={showBack} totalPages={sigTotalPages}
                        onClick={() => onPageChange(gIdx)}
                      />
                    </div>
                  );
                })}
                {s < numSigs - 1 && (
                  <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                )}
              </div>
            );
          })
        ) : hasSigMap ? (
          // ── Booklet: flat sheet list ──
          sigMap!.sheets.map((sh, i) => (
            <div key={i} ref={activePage === i ? activeRef : undefined}>
              <SheetCard
                idx={i} sheet={sh} active={activePage === i}
                showBack={showBack} totalPages={sigTotalPages}
                onClick={() => onPageChange(i)}
              />
            </div>
          ))
        ) : (
          // ── Other duplex modes: page cards ──
          Array.from({ length: totalItems }, (_, i) => (
            <div key={i} ref={activePage === i ? activeRef : undefined}>
              <PageCard idx={i} active={activePage === i} onClick={() => onPageChange(i)} />
            </div>
          ))
        )}
      </div>

      {/* Prev / Next + counter */}
      {totalItems > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <button
            onClick={() => activePage > 0 && onPageChange(activePage - 1)}
            style={{ ...pillStyle(false), padding: '3px 5px', opacity: activePage === 0 ? 0.3 : 1 }}
          >
            <i className="fas fa-chevron-left" style={{ fontSize: '0.45rem' }} />
          </button>
          <span style={{
            fontSize: '0.55rem', fontWeight: 600, color: '#64748b',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 28, textAlign: 'center',
          }}>
            {activePage + 1}/{totalItems}
          </span>
          <button
            onClick={() => activePage < totalItems - 1 && onPageChange(activePage + 1)}
            style={{ ...pillStyle(false), padding: '3px 5px', opacity: activePage >= totalItems - 1 ? 0.3 : 1 }}
          >
            <i className="fas fa-chevron-right" style={{ fontSize: '0.45rem' }} />
          </button>
        </div>
      )}
    </div>
  );
}
