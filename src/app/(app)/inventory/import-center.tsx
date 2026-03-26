'use client';

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FileSpreadsheet, FileText, Download } from 'lucide-react';

interface Props {
  onStandardFile: (rows: Record<string, unknown>[]) => void;
  onSmartFile: (rawRows: string[][]) => void;
  onSmartPdf: (rawRows: string[][]) => void;
  onClose: () => void;
}

export function ImportCenter({ onStandardFile, onSmartFile, onSmartPdf, onClose }: Props) {
  const stdRef = useRef<HTMLInputElement>(null);
  const smartRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  async function loadXlsx() {
    // Dynamic import — xlsx is heavy, load only when needed
    const XLSX = (await import('xlsx')).default ?? await import('xlsx');
    return XLSX;
  }

  async function handleStandard(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await loadXlsx();
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<string, unknown>[];
      if (rows.length === 0) { alert('Το αρχείο είναι κενό.'); return; }
      onStandardFile(rows);
    } catch (err) {
      alert(`Σφάλμα ανάγνωσης αρχείου: ${(err as Error).message}`);
    }
    e.target.value = '';
  }

  async function handleSmart(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await loadXlsx();
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][];
      if (rows.length === 0) { alert('Το αρχείο είναι κενό.'); return; }
      onSmartFile(rows);
    } catch (err) {
      alert(`Σφάλμα ανάγνωσης αρχείου: ${(err as Error).message}`);
    }
    e.target.value = '';
  }

  async function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // @ts-expect-error — pdfjs loaded from CDN at runtime
    const pdfjsLib = window['pdfjs-dist/build/pdf'] ?? window.pdfjsLib;
    if (!pdfjsLib) {
      alert('PDF.js library not loaded');
      return;
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const fullRows: string[][] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const rowsMap: Record<number, Array<{ x: number; t: string }>> = {};

      for (const item of textContent.items) {
        const y = Math.round((item as { transform: number[] }).transform[5]);
        const text = (item as { str: string }).str.trim().replace(/["\n\r]/g, '');
        if (text.length === 0) continue;
        const foundY = Object.keys(rowsMap).find(key => Math.abs(Number(key) - y) < 8);
        if (foundY) rowsMap[Number(foundY)].push({ x: (item as { transform: number[] }).transform[4], t: text });
        else rowsMap[y] = [{ x: (item as { transform: number[] }).transform[4], t: text }];
      }

      Object.keys(rowsMap)
        .sort((a, b) => Number(b) - Number(a))
        .forEach(y => {
          fullRows.push(rowsMap[Number(y)].sort((a, b) => a.x - b.x).map(it => it.t));
        });
    }

    onSmartPdf(fullRows);
    e.target.value = '';
  }

  function downloadTemplate() {
    import('xlsx').then(XLSX => {
      const data = [{
        Name: 'Velvet 130gr 70x100', Width: 700, Height: 1000, Grams: 130,
        Cost: 0.08, Group: '', Category: '', Supplier: '', 'Supplier Email': '',
        Grain: '', Markup: 30,
      }];
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'PressCal_Sheet_Template.xlsx');
    });
  }

  const cards = [
    {
      icon: <FileSpreadsheet className="h-8 w-8" />,
      badge: null,
      title: '1. STANDARD IMPORT',
      titleColor: 'text-[var(--text)]',
      iconColor: 'text-[var(--success)]',
      sections: [
        { icon: 'fa-bullseye', label: 'ΣΤΟΧΟΣ', text: 'Μαζική, γρήγορη και ασφαλής εισαγωγή 1:1.' },
        { icon: 'fa-cogs', label: 'ΛΕΙΤΟΥΡΓΙΑ', text: 'Διαβάζει τα δεδομένα από το πρότυπο Excel του PressCal.' },
        { icon: 'fa-user-check', label: 'ΕΝΕΡΓΕΙΑ', text: 'Επιλέξτε το συμπληρωμένο αρχείο Template.' },
      ],
      template: true,
      btnLabel: 'ΕΠΙΛΟΓΗ XLS',
      onClick: () => stdRef.current?.click(),
    },
    {
      icon: <FileSpreadsheet className="h-8 w-8" />,
      badge: 'AI',
      title: '2. SMART IMPORT (XLS)',
      titleColor: 'text-[var(--accent)]',
      iconColor: 'text-[var(--accent)]',
      sections: [
        { icon: 'fa-bullseye', label: 'ΣΤΟΧΟΣ', text: 'Εισαγωγή από οποιονδήποτε τιμοκατάλογο προμηθευτή.' },
        { icon: 'fa-cogs', label: 'ΛΕΙΤΟΥΡΓΙΑ', text: 'Αναλύει το αρχείο και σας ζητάει να αντιστοιχίσετε τις στήλες.' },
        { icon: 'fa-user-check', label: 'ΕΝΕΡΓΕΙΑ', text: 'Ανεβάστε το Excel του προμηθευτή όπως είναι.' },
      ],
      template: false,
      btnLabel: 'ΕΝΑΡΞΗ SMART XLS',
      onClick: () => smartRef.current?.click(),
    },
    {
      icon: <FileText className="h-8 w-8" />,
      badge: 'AI',
      title: '3. SMART PDF (BETA)',
      titleColor: 'text-[var(--danger)]',
      iconColor: 'text-[var(--danger)]',
      sections: [
        { icon: 'fa-bullseye', label: 'ΣΤΟΧΟΣ', text: 'Εξαγωγή δεδομένων απευθείας από ψηφιακά PDF.' },
        { icon: 'fa-cogs', label: 'ΛΕΙΤΟΥΡΓΙΑ', text: 'Ο αλγόριθμος σαρώνει το έγγραφο και εντοπίζει υλικά.' },
        { icon: 'fa-user-check', label: 'ΕΝΕΡΓΕΙΑ', text: 'Ανεβάστε το PDF. Απαιτείται έλεγχος μετά.' },
      ],
      template: false,
      btnLabel: 'ΕΝΑΡΞΗ SMART PDF',
      onClick: () => pdfRef.current?.click(),
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div className="w-[1050px] max-h-[85vh] flex flex-col rounded-2xl border border-[var(--glass-border)] shadow-[0_32px_80px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ background: 'rgb(20, 30, 55)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]"
          style={{ background: 'var(--blue)' }}>
          <h3 className="text-lg font-black text-white flex items-center gap-3">
            <i className="fas fa-database" /> ΚΕΝΤΡΟ ΕΙΣΑΓΩΓΩΝ ΧΑΡΤΙΩΝ
          </h3>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Cards grid */}
        <div className="flex-1 overflow-auto p-8 grid grid-cols-3 gap-6">
          {cards.map((card) => (
            <div key={card.title}
              onClick={card.onClick}
              className="flex flex-col rounded-xl border border-[var(--glass-border)] bg-white/[0.02] p-6 cursor-pointer hover:border-[var(--accent)]/40 hover:bg-white/[0.04] transition-all">

              {/* Icon */}
              <div className="flex items-center justify-center mb-4">
                <div className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--glass-border)] bg-white/[0.03] ${card.iconColor}`}>
                  {card.icon}
                  {card.badge && (
                    <span className="absolute -top-1 -right-1 rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[0.55rem] font-black text-white">{card.badge}</span>
                  )}
                </div>
              </div>

              {/* Title */}
              <h4 className={`text-sm font-black text-center mb-4 ${card.titleColor}`}>{card.title}</h4>

              {/* Sections */}
              <div className="flex-1 space-y-3">
                {card.sections.map((s) => (
                  <div key={s.label} className="flex items-start gap-2">
                    <i className={`fas ${s.icon} text-[0.6rem] text-[var(--success)] mt-1 shrink-0`} />
                    <div>
                      <span className="text-[0.6rem] font-bold text-[var(--success)] uppercase">{s.label}</span>
                      <p className="text-xs text-[var(--text-dim)] leading-tight">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Template download */}
              {card.template && (
                <button onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                  className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-[var(--glass-border)] p-3 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
                  <Download className="h-3.5 w-3.5" />
                  <span className="font-semibold">ΛΗΨΗ ΠΡΟΤΥΠΟΥ</span>
                </button>
              )}

              {/* Action button */}
              <button className="mt-4 w-full rounded-lg py-3 text-sm font-black text-white transition-all"
                style={{ background: 'var(--blue)' }}>
                {card.btnLabel}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="py-3 text-center text-[0.7rem] text-[var(--text-muted)] border-t border-[var(--border)]">
          PressCal Intelligent Import System
        </div>
      </div>

      {/* Hidden file inputs — outside the backdrop so click doesn't trigger onClose */}
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: -9999, left: -9999 }}>
        <input ref={stdRef} type="file" accept=".xlsx,.xls" onChange={handleStandard} />
        <input ref={smartRef} type="file" accept=".xlsx,.xls" onChange={handleSmart} />
        <input ref={pdfRef} type="file" accept=".pdf" onChange={handlePdf} />
      </div>
    </div>,
    document.body
  );
}
