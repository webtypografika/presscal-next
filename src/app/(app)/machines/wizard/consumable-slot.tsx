'use client';

import { useState } from 'react';
import { Row, RowLabel, fmtNum } from './wizard-ui';
import { ConsumablePicker, type ConsumableItem } from './consumable-picker';
import { ConsumablePanel } from '../../inventory/consumable-panel';

type OnChange = (field: string, value: unknown) => void;
type Data = Record<string, unknown>;

interface Props {
  label: string;
  labelCls?: string;
  conType: string;
  conModule: string;
  color?: string;
  costField: string;
  yieldField?: string;
  idField: string;
  nameField?: string;
  data: Data;
  onChange: OnChange;
  dashed?: boolean;
  costStep?: string;
}

export function ConsumableSlot({
  label, labelCls, conType, conModule, color,
  costField, yieldField, idField, nameField,
  data, onChange, dashed,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const isLinked = !!data[idField];
  const linkedName = nameField ? (data[nameField] as string) : null;
  const cost = data[costField] as number | null;
  const yieldVal = yieldField ? (data[yieldField] as number | null) : null;

  function handlePick(item: ConsumableItem) {
    if (item.costPerUnit !== null) onChange(costField, item.costPerUnit);
    if (yieldField && item.yieldPages !== null) onChange(yieldField, item.yieldPages);
    onChange(idField, item.id);
    if (nameField) onChange(nameField, item.name);
    setShowPicker(false);
  }

  function handleCreated(item: { id: string; name: string; costPerUnit: number | null; yieldPages: number | null }) {
    if (item.costPerUnit !== null) onChange(costField, item.costPerUnit);
    if (yieldField && item.yieldPages !== null) onChange(yieldField, item.yieldPages);
    onChange(idField, item.id);
    if (nameField) onChange(nameField, item.name);
    setShowCreate(false);
  }

  function handleUnlink() {
    onChange(idField, null);
    if (nameField) onChange(nameField, null);
    onChange(costField, null);
    if (yieldField) onChange(yieldField, null);
  }

  // ─── LINKED: compact card ───
  if (isLinked) {
    return (
      <Row dashed={dashed}>
        <RowLabel className={labelCls}>{label}</RowLabel>
        <div className="flex-1 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-[var(--teal)]/8 border border-[var(--teal)]/20 px-3 py-2 flex-1 min-w-0">
            <i className="fas fa-warehouse text-[var(--teal)] shrink-0" style={{ fontSize: '0.6rem' }} />
            <span className="text-sm font-semibold text-[var(--text)] truncate">{linkedName || 'Συνδεδεμένο'}</span>
            {cost !== null && cost !== 0 && (
              <span className="shrink-0 text-sm font-bold text-[var(--accent)]">€{fmtNum(cost)}</span>
            )}
            {yieldVal !== null && yieldVal !== 0 && (
              <span className="shrink-0 text-[0.65rem] text-[var(--text-muted)]">{Number(yieldVal).toLocaleString('el-GR')} pg</span>
            )}
          </div>
          <button onClick={handleUnlink} title="Αποσύνδεση"
            className="shrink-0 flex items-center gap-1 rounded-lg border border-[var(--glass-border)] px-2 py-1.5 text-[0.65rem] font-semibold text-[var(--text-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] transition-all">
            <i className="fas fa-times" style={{ fontSize: '0.5rem' }} />
          </button>
        </div>
      </Row>
    );
  }

  // ─── EMPTY: two clear paths ───
  return (
    <>
      <Row dashed={dashed}>
        <RowLabel className={labelCls}>{label}</RowLabel>
        <div className="flex-1 flex items-center justify-center gap-3 py-1">
          <span className="text-xs text-[var(--text-muted)]">Δεν έχει οριστεί</span>
          <button onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--teal)] hover:bg-[var(--teal)]/15 transition-all">
            <i className="fas fa-warehouse" style={{ fontSize: '0.55rem' }} /> Αποθήκη
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-all">
            <i className="fas fa-plus" style={{ fontSize: '0.5rem' }} /> Νέο
          </button>
        </div>
      </Row>

      {showPicker && (
        <ConsumablePicker
          conType={conType} conModule={conModule} color={color}
          onSelect={handlePick} onClose={() => setShowPicker(false)}
        />
      )}

      {showCreate && (
        <ConsumablePanel
          defaultModule={conModule}
          defaultConType={conType}
          defaultColor={color}
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}
    </>
  );
}
