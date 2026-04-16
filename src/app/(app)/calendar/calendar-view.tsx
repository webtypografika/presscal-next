'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getEvents, createEvent, updateEvent, deleteEvent, searchCompaniesForCalendar, searchQuotesForCalendar, searchContactsForCalendar } from './actions';

// ─── TYPES ───

interface CalEvent {
  id: string;
  title: string;
  type: string;
  startAt: string | Date;
  endAt: string | Date | null;
  allDay: boolean;
  color: string | null;
  quoteId: string | null;
  quote: { id: string; number: string; title: string | null } | null;
  companyId: string | null;
  company: { id: string; name: string } | null;
  contactId: string | null;
  contact: { id: string; name: string } | null;
  notes: string;
  completed: boolean;
  virtual: boolean;
}

const EVENT_TYPES = [
  { value: 'appointment', label: 'Ραντεβού', icon: 'fa-handshake' },
  { value: 'task', label: 'Εργασία', icon: 'fa-tasks' },
  { value: 'deadline', label: 'Προθεσμία', icon: 'fa-clock' },
  { value: 'reminder', label: 'Υπενθύμιση', icon: 'fa-bell' },
];

const PRESET_COLORS = [
  '#60a5fa', // blue
  '#f58220', // orange (accent)
  '#4ade80', // green
  '#f472b6', // pink
  '#a78bfa', // violet
  '#fbbf24', // yellow
];

const MONTH_NAMES = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος',
  'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος',
  'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος',
];

const DAY_NAMES = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'];

// ─── HELPERS ───

function toDateStr(d: string | Date) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function toLocalDatetime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // Monday = 0 ... Sunday = 6
  let startDow = first.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: Date; inMonth: boolean }[] = [];

  // Previous month filler
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false });
  }

  // Current month
  for (let i = 1; i <= lastDay; i++) {
    days.push({ date: new Date(year, month, i), inMonth: true });
  }

  // Next month filler
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), inMonth: false });
    }
  }

  return days;
}

// ─── TOAST ───

interface ToastData { message: string; type: 'success' | 'error'; id: number }
let tId = 0;

function Toast({ toast, onRemove }: { toast: ToastData; onRemove: () => void }) {
  useEffect(() => {
    const t = setTimeout(onRemove, toast.type === 'error' ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, onRemove]);
  const c = toast.type === 'success'
    ? { bg: 'var(--success)', icon: 'fa-check-circle' }
    : { bg: 'var(--danger)', icon: 'fa-exclamation-circle' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderRadius: 10,
      background: 'rgb(20,30,55)', border: `1px solid ${c.bg}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'fadeIn 0.3s ease', minWidth: 280,
    }}>
      <i className={`fas ${c.icon}`} style={{ color: c.bg, fontSize: '1rem' }} />
      <span style={{ fontSize: '0.92rem', color: 'var(--text)', flex: 1 }}>{toast.message}</span>
      <button onClick={onRemove} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.92rem' }}>&times;</button>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: ToastData[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div style={{ position: 'fixed', bottom: 80, right: 20, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => <Toast key={t.id} toast={t} onRemove={() => onRemove(t.id)} />)}
    </div>,
    document.body,
  );
}

// ─── SEARCH DROPDOWN ───

function SearchDropdown({ label, onSearch, onSelect, value, displayValue, renderItem }: {
  label: string;
  onSearch: (q: string) => Promise<any[]>;
  onSelect: (item: any | null) => void;
  value: string | null;
  displayValue: string;
  renderItem: (item: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await onSearch(q);
      setResults(res);
    } catch { setResults([]); }
    setLoading(false);
  }, [onSearch]);

  const handleInput = (q: string) => {
    setQuery(q);
    clearTimeout(timerRef.current);
    if (q.trim().length >= 1) {
      timerRef.current = setTimeout(() => doSearch(q), 300);
    } else {
      setResults([]);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {value ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
        }}>
          <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--text)' }}>{displayValue}</span>
          <button onClick={() => onSelect(null)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>&times;</button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onChange={e => { handleInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Αναζήτηση..."
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: '0.88rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            color: 'var(--text)', outline: 'none',
          }}
        />
      )}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          marginTop: 4, borderRadius: 8, overflow: 'hidden',
          background: 'rgb(20,30,55)', border: '1px solid var(--border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map((item: any) => (
            <div
              key={item.id}
              onMouseDown={() => { onSelect(item); setOpen(false); setQuery(''); setResults([]); }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem',
                color: 'var(--text)', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      )}
      {open && loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          marginTop: 4, padding: '8px 12px', borderRadius: 8,
          background: 'rgb(20,30,55)', border: '1px solid var(--border)',
          fontSize: '0.82rem', color: 'var(--text-muted)',
        }}>
          Αναζήτηση...
        </div>
      )}
    </div>
  );
}

// ─── EVENT MODAL ───

interface ModalForm {
  id?: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  quoteId: string | null;
  quoteName: string;
  companyId: string | null;
  companyName: string;
  contactId: string | null;
  contactName: string;
  notes: string;
  completed: boolean;
  virtual?: boolean;
}

function emptyForm(date?: Date): ModalForm {
  const d = date || new Date();
  const start = new Date(d);
  start.setHours(9, 0, 0, 0);
  const end = new Date(d);
  end.setHours(10, 0, 0, 0);
  return {
    title: '', type: 'appointment',
    startAt: toLocalDatetime(start), endAt: toLocalDatetime(end),
    allDay: false, color: PRESET_COLORS[0],
    quoteId: null, quoteName: '',
    companyId: null, companyName: '',
    contactId: null, contactName: '',
    notes: '', completed: false,
  };
}

function eventToForm(ev: CalEvent): ModalForm {
  const start = new Date(ev.startAt);
  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 3600000);
  return {
    id: ev.id,
    title: ev.title,
    type: ev.type,
    startAt: toLocalDatetime(start),
    endAt: toLocalDatetime(end),
    allDay: ev.allDay,
    color: ev.color || PRESET_COLORS[0],
    quoteId: ev.quoteId, quoteName: ev.quote ? `${ev.quote.number} ${ev.quote.title || ''}`.trim() : '',
    companyId: ev.companyId, companyName: ev.company?.name || '',
    contactId: ev.contactId, contactName: ev.contact?.name || '',
    notes: ev.notes,
    completed: ev.completed,
    virtual: ev.virtual,
  };
}

function EventModal({ form, setForm, onSave, onDelete, onClose }: {
  form: ModalForm;
  setForm: (f: ModalForm) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const isEdit = !!form.id;
  const isVirtual = form.virtual;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: '0.88rem',
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none',
  };
  const labelStyle: React.CSSProperties = { fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 400, maxHeight: '85vh',
          background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {isVirtual ? 'Προθεσμία Προσφοράς' : isEdit ? 'Επεξεργασία' : 'Νέο Γεγονός'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isVirtual ? (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <i className="fas fa-info-circle" style={{ marginRight: 6 }} />
              Αυτή η προθεσμία προέρχεται από την προσφορά <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{form.quoteName}</span> και δεν μπορεί να επεξεργαστεί εδώ.
            </div>
          ) : (
            <>
              {/* Title */}
              <div>
                <label style={labelStyle}>Τίτλος</label>
                <input
                  type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Τίτλος γεγονότος..."
                  style={inputStyle} autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label style={labelStyle}>Τύπος</label>
                <select
                  value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* All day */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={form.allDay}
                  onChange={e => setForm({ ...form, allDay: e.target.checked })}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: '0.88rem', color: 'var(--text)' }}>Ολοήμερο</span>
              </label>

              {/* Start / End */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Έναρξη</label>
                  <input
                    type={form.allDay ? 'date' : 'datetime-local'}
                    value={form.allDay ? form.startAt.slice(0, 10) : form.startAt}
                    onChange={e => setForm({ ...form, startAt: form.allDay ? e.target.value + 'T09:00' : e.target.value })}
                    style={inputStyle}
                  />
                </div>
                {!form.allDay && (
                  <div>
                    <label style={labelStyle}>Λήξη</label>
                    <input
                      type="datetime-local" value={form.endAt}
                      onChange={e => setForm({ ...form, endAt: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>

              {/* Color */}
              <div>
                <label style={labelStyle}>Χρώμα</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: c, border: form.color === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer', transition: 'border 0.15s',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Company search */}
              <SearchDropdown
                label="Εταιρεία"
                value={form.companyId}
                displayValue={form.companyName}
                onSearch={searchCompaniesForCalendar}
                onSelect={(item) => setForm({ ...form, companyId: item?.id || null, companyName: item?.name || '' })}
                renderItem={(item) => item.name}
              />

              {/* Contact search */}
              <SearchDropdown
                label="Επαφή"
                value={form.contactId}
                displayValue={form.contactName}
                onSearch={searchContactsForCalendar}
                onSelect={(item) => setForm({ ...form, contactId: item?.id || null, contactName: item?.name || '' })}
                renderItem={(item) => item.name}
              />

              {/* Quote search */}
              <SearchDropdown
                label="Προσφορά"
                value={form.quoteId}
                displayValue={form.quoteName}
                onSearch={searchQuotesForCalendar}
                onSelect={(item) => setForm({ ...form, quoteId: item?.id || null, quoteName: item ? `${item.number} ${item.title || ''}`.trim() : '' })}
                renderItem={(item) => `${item.number} — ${item.company?.name || item.title || ''}`}
              />

              {/* Notes */}
              <div>
                <label style={labelStyle}>Σημειώσεις</label>
                <textarea
                  value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3} placeholder="Σημειώσεις..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Completed (for tasks) */}
              {(form.type === 'task') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox" checked={form.completed}
                    onChange={e => setForm({ ...form, completed: e.target.checked })}
                    style={{ accentColor: 'var(--success)' }}
                  />
                  <span style={{ fontSize: '0.88rem', color: 'var(--text)' }}>Ολοκληρώθηκε</span>
                </label>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {isEdit && !isVirtual && (
            <button
              onClick={onDelete}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)',
                background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
              }}
            >
              <i className="fas fa-trash" style={{ marginRight: 6 }} />Διαγραφή
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.85rem',
            }}
          >
            {isVirtual ? 'Κλείσιμο' : 'Ακύρωση'}
          </button>
          {!isVirtual && (
            <button
              onClick={onSave}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              {isEdit ? 'Αποθήκευση' : 'Δημιουργία'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── MAIN CALENDAR VIEW ───

export function CalendarView({ initialEvents, initialYear, initialMonth }: {
  initialEvents: any[];
  initialYear: number;
  initialMonth: number;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState<CalEvent[]>(initialEvents as CalEvent[]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalForm | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToasts(prev => [...prev, { message, type, id: ++tId }]);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Fetch events when month changes
  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0, 23, 59, 59);
      const data = await getEvents(start.toISOString(), end.toISOString());
      setEvents(data as CalEvent[]);
    } catch {
      toast('Σφάλμα φόρτωσης', 'error');
    }
    setLoading(false);
  }, [toast]);

  const goMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
    fetchEvents(y, m);
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    fetchEvents(now.getFullYear(), now.getMonth());
  };

  const days = getMonthDays(year, month);
  const todayStr = toDateStr(new Date());

  // Group events by date
  const eventsByDate: Record<string, CalEvent[]> = {};
  for (const ev of events) {
    const key = toDateStr(ev.startAt);
    if (!eventsByDate[key]) eventsByDate[key] = [];
    eventsByDate[key].push(ev);
  }

  // Handlers
  const handleDayClick = (date: Date) => {
    setModal(emptyForm(date));
  };

  const handleEventClick = (ev: CalEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal(eventToForm(ev));
  };

  const handleSave = async () => {
    if (!modal) return;
    if (!modal.title.trim() && !modal.virtual) { toast('Συμπληρώστε τίτλο', 'error'); return; }
    try {
      if (modal.id && !modal.virtual) {
        await updateEvent(modal.id, {
          title: modal.title,
          type: modal.type,
          startAt: new Date(modal.startAt).toISOString(),
          endAt: modal.allDay ? null : new Date(modal.endAt).toISOString(),
          allDay: modal.allDay,
          color: modal.color,
          quoteId: modal.quoteId,
          companyId: modal.companyId,
          contactId: modal.contactId,
          notes: modal.notes,
          completed: modal.completed,
        });
        toast('Ενημερώθηκε');
      } else {
        await createEvent({
          title: modal.title,
          type: modal.type,
          startAt: new Date(modal.startAt).toISOString(),
          endAt: modal.allDay ? null : new Date(modal.endAt).toISOString(),
          allDay: modal.allDay,
          color: modal.color,
          quoteId: modal.quoteId,
          companyId: modal.companyId,
          contactId: modal.contactId,
          notes: modal.notes,
        });
        toast('Δημιουργήθηκε');
      }
      setModal(null);
      fetchEvents(year, month);
    } catch {
      toast('Σφάλμα αποθήκευσης', 'error');
    }
  };

  const handleDelete = async () => {
    if (!modal?.id || modal.virtual) return;
    try {
      await deleteEvent(modal.id);
      toast('Διαγράφηκε');
      setModal(null);
      fetchEvents(year, month);
    } catch {
      toast('Σφάλμα διαγραφής', 'error');
    }
  };

  return (
    <div style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => goMonth(-1)}
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <i className="fas fa-chevron-left" />
        </button>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.01em', minWidth: 220, textAlign: 'center' }}>
          {MONTH_NAMES[month]} {year}
        </h1>

        <button
          onClick={() => goMonth(1)}
          style={{
            width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <i className="fas fa-chevron-right" />
        </button>

        <button
          onClick={goToday}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
          }}
        >
          Σήμερα
        </button>

        {loading && <i className="fas fa-spinner fa-spin" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }} />}
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{
            textAlign: 'center', fontSize: '0.75rem', fontWeight: 600,
            color: 'var(--text-muted)', padding: '6px 0', letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
        flex: 1, minHeight: 0,
        background: 'rgba(255,255,255,0.02)', borderRadius: 12, overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        {days.map((day, i) => {
          const dateStr = toDateStr(day.date);
          const isToday = dateStr === todayStr;
          const dayEvents = eventsByDate[dateStr] || [];
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

          return (
            <div
              key={i}
              onClick={() => handleDayClick(day.date)}
              style={{
                minHeight: 90, padding: '4px 6px',
                background: isToday ? 'rgba(245,130,32,0.06)' : isWeekend && day.inMonth ? 'rgba(255,255,255,0.015)' : 'transparent',
                opacity: day.inMonth ? 1 : 0.35,
                cursor: 'pointer', transition: 'background 0.15s',
                borderRight: (i + 1) % 7 !== 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                borderBottom: i < days.length - 7 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                overflow: 'hidden',
              }}
              onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = isWeekend && day.inMonth ? 'rgba(255,255,255,0.015)' : 'transparent'; }}
            >
              {/* Day number */}
              <div style={{
                fontSize: '0.78rem', fontWeight: isToday ? 700 : 500,
                color: isToday ? 'var(--accent)' : 'var(--text-muted)',
                marginBottom: 2, textAlign: 'right',
              }}>
                {isToday ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff', fontSize: '0.72rem',
                  }}>
                    {day.date.getDate()}
                  </span>
                ) : day.date.getDate()}
              </div>

              {/* Events */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayEvents.slice(0, 3).map(ev => {
                  const typeInfo = EVENT_TYPES.find(t => t.value === ev.type);
                  return (
                    <div
                      key={ev.id}
                      onClick={e => handleEventClick(ev, e)}
                      style={{
                        padding: '2px 5px', borderRadius: 4,
                        fontSize: '0.68rem', fontWeight: 500,
                        background: `${ev.color || PRESET_COLORS[0]}22`,
                        color: ev.color || PRESET_COLORS[0],
                        borderLeft: `2px solid ${ev.color || PRESET_COLORS[0]}`,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        cursor: 'pointer', transition: 'opacity 0.15s',
                        textDecoration: ev.completed ? 'line-through' : 'none',
                        opacity: ev.completed ? 0.5 : 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = ev.completed ? '0.5' : '1')}
                    >
                      {ev.virtual && <i className={`fas fa-file-invoice`} style={{ marginRight: 3, fontSize: '0.6rem' }} />}
                      {!ev.virtual && typeInfo && <i className={`fas ${typeInfo.icon}`} style={{ marginRight: 3, fontSize: '0.6rem' }} />}
                      {ev.title}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', paddingLeft: 4 }}>
                    +{dayEvents.length - 3} ακόμη
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && (
        <EventModal
          form={modal}
          setForm={setModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
