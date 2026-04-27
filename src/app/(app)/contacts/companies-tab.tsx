'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useRouter } from 'next/navigation';
import { createCompany, updateCompany, deleteCompany, createContact, updateContact, unlinkContactFromCompany, setPrimaryContact, linkContactToCompany, searchContacts } from '../companies/actions';
import { createQuote } from '../quotes/actions';
import { ElorusAfmLookup, type ElorusLookupResult } from '@/components/elorus-afm-lookup';
import { inp, inpFocus, lbl, SectionTitle } from './shared-styles';

interface ContactData { id: string; name: string; email: string | null; phone: string | null; mobile: string | null; role: string }
interface CCData { id: string; role: string; isPrimary: boolean; contact: ContactData }
interface CompanyData {
  id: string; name: string; isSupplier: boolean; legalName: string | null; afm: string | null; doy: string | null; email: string | null; phone: string | null;
  website: string | null; address: string | null; city: string | null; zip: string | null;
  fiscalAddress: string | null; fiscalCity: string | null; fiscalZip: string | null;
  activities: string | null; notes: string; folderPath: string | null; tags: string[]; companyContacts: CCData[]; _count: { quotes: number };
}

interface SimpleContact { id: string; name: string; email: string | null; phone: string | null }
interface Props { initialCompanies: CompanyData[]; initialTotal: number; initialHasMore: boolean; hasElorus?: boolean; search: string; allContacts: SimpleContact[] }

const PAGE_SIZE = 50;

function Field({ label, value, onChange, placeholder, type, style: extraStyle }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={extraStyle}>
      <label style={lbl}>{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || '—'} type={type || 'text'}
        style={focused ? inpFocus : inp}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      />
    </div>
  );
}

function InfoField({ label, value, style: extraStyle }: { label: string; value: string; style?: React.CSSProperties }) {
  return (
    <div style={extraStyle}>
      <label style={lbl}>{label}</label>
      <div style={{
        padding: '9px 12px', borderRadius: 8, fontSize: '0.92rem', color: value ? '#cbd5e1' : '#374151',
        background: 'rgba(255,255,255,0.02)', border: '1px solid transparent',
        fontStyle: value ? 'normal' : 'italic', minHeight: 36, display: 'flex', alignItems: 'center',
      }}>{value || '—'}</div>
    </div>
  );
}

const roleLabels: Record<string, string> = { employee: 'Υπάλληλος', designer: 'Γραφίστας', freelancer: 'Freelancer', broker: 'Μεσάζων', contact: 'Επαφή', owner: 'Ιδιοκτήτης' };

function ContactRow({ cc, companyId, onUpdate, onRemove, onSetPrimary }: {
  cc: CCData; companyId: string;
  onUpdate: (contactId: string, data: Partial<ContactData>) => void;
  onRemove: (contactId: string) => void;
  onSetPrimary: (contactId: string) => void;
}) {
  const c = cc.contact;
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: cc.isPrimary ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${cc.isPrimary ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--glass-border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: cc.isPrimary ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: cc.isPrimary ? 'var(--accent)' : '#64748b', fontSize: '0.6rem', fontWeight: 700,
        }}>{c.name.charAt(0).toUpperCase()}</div>
        <input value={c.name} onChange={e => onUpdate(c.id, { name: e.target.value })} placeholder="Όνομα"
          style={{ ...inp, flex: 1, fontSize: '0.85rem', fontWeight: 600, padding: '4px 6px' }} />
        <select value={cc.role} onChange={e => onUpdate(c.id, { role: e.target.value })}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', outline: 'none' }}>
          {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {!cc.isPrimary && (
          <button onClick={() => onSetPrimary(c.id)} title="Κύρια επαφή"
            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'transparent', color: '#475569', cursor: 'pointer', fontSize: '0.65rem' }}>
            <i className="fas fa-star" />
          </button>
        )}
        {cc.isPrimary && <span style={{ fontSize: '0.62rem', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>Κύρια</span>}
        <button onClick={() => onRemove(c.id)} title="Αφαίρεση"
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'transparent', color: '#475569', cursor: 'pointer', fontSize: '0.65rem' }}>
          <i className="fas fa-times" />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginLeft: 36 }}>
        <Field label="EMAIL" value={c.email || ''} onChange={v => onUpdate(c.id, { email: v })} placeholder="—" type="email" />
        <Field label="ΤΗΛΕΦΩΝΟ" value={c.phone || ''} onChange={v => onUpdate(c.id, { phone: v })} placeholder="—" />
        <Field label="ΚΙΝΗΤΟ" value={c.mobile || ''} onChange={v => onUpdate(c.id, { mobile: v })} placeholder="—" />
      </div>
    </div>
  );
}

export function CompaniesTab({ initialCompanies, initialTotal, initialHasMore, hasElorus, search, allContacts: _allContacts }: Props) {
  const router = useRouter();
  const [companies, setCompanies] = useState(initialCompanies);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSearchRef = useRef(search);

  // Re-fetch when search changes from parent
  useEffect(() => {
    if (search === lastSearchRef.current) return;
    lastSearchRef.current = search;
    (async () => {
      setLoading(true);
      try {
        const { getCompanies } = await import('../companies/actions');
        const result = await getCompanies({ search: search || undefined, take: PAGE_SIZE });
        setCompanies(result.companies as any);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } finally { setLoading(false); }
    })();
  }, [search]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const { getCompanies } = await import('../companies/actions');
      const result = await getCompanies({ search: search || undefined, skip: companies.length, take: PAGE_SIZE });
      setCompanies(prev => [...prev, ...result.companies as any]);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } finally { setLoading(false); }
  }, [companies.length, search]);

  // Debounced company save
  const showSaved = useCallback((id: string) => {
    setSavedId(id);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedId(null), 2000);
  }, []);

  const debouncedSaveCompany = useCallback((id: string, data: Partial<CompanyData>) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => { updateCompany(id, data as any).then(() => showSaved(id)); }, 1000);
  }, [showSaved]);

  const updateCompanyField = useCallback((id: string, field: string, value: string) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    debouncedSaveCompany(id, { [field]: value || null });
  }, [debouncedSaveCompany]);

  // Debounced contact save
  const debouncedSaveContact = useCallback((contactId: string, companyId: string, data: Partial<ContactData>) => {
    const key = `c_${contactId}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => { updateContact(contactId, data as any).then(() => showSaved(companyId)); }, 1000);
  }, [showSaved]);

  const updateContactField = useCallback((companyId: string, contactId: string, data: Partial<ContactData>) => {
    setCompanies(prev => prev.map(c => c.id === companyId ? {
      ...c, companyContacts: c.companyContacts.map(cc => cc.contact.id === contactId ? { ...cc, contact: { ...cc.contact, ...data }, role: data.role || cc.role } : cc)
    } : c));
    debouncedSaveContact(contactId, companyId, data);
  }, [debouncedSaveContact]);

  const [addContactOpen, setAddContactOpen] = useState<string | null>(null);
  const [addContactPos, setAddContactPos] = useState<{ top: number; left: number } | null>(null);
  const [addContactSearch, setAddContactSearch] = useState('');
  const [addContactResults, setAddContactResults] = useState<SimpleContact[]>([]);
  const [addContactLoading, setAddContactLoading] = useState(false);
  const addContactTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load contacts when popover opens or search changes
  const loadContacts = useCallback(async (query: string) => {
    setAddContactLoading(true);
    try {
      const results = await searchContacts(query || undefined);
      setAddContactResults(results.map((c: any) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })));
    } finally { setAddContactLoading(false); }
  }, []);

  const handleOpenAddContact = useCallback((companyId: string, e: React.MouseEvent) => {
    if (addContactOpen === companyId) { setAddContactOpen(null); setAddContactPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const popW = 280, popH = 320;
    let top = rect.bottom + 4;
    let left = rect.right - popW;
    // Clamp to viewport
    if (left < 8) left = 8;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.innerHeight - 8) top = rect.top - popH - 4; // flip above
    if (top < 8) top = 8;
    setAddContactPos({ top, left });
    setAddContactOpen(companyId);
    setAddContactSearch('');
    loadContacts('');
  }, [addContactOpen, loadContacts]);

  const handleAddContactSearch = useCallback((q: string) => {
    setAddContactSearch(q);
    if (addContactTimer.current) clearTimeout(addContactTimer.current);
    addContactTimer.current = setTimeout(() => loadContacts(q), 300);
  }, [loadContacts]);

  const handleAddNewContact = useCallback(async (companyId: string) => {
    const contact = await createContact({ name: 'Νέα επαφή', companyId, role: 'employee' });
    setCompanies(prev => prev.map(c => c.id === companyId ? {
      ...c, companyContacts: [...c.companyContacts, { id: `${companyId}_${contact.id}`, role: 'employee', isPrimary: false, contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, mobile: contact.mobile ?? null, role: contact.role ?? 'employee' } }]
    } : c));
    setAddContactOpen(null);
    setAddContactSearch('');
  }, []);

  const handleLinkExistingContact = useCallback(async (companyId: string, contactId: string) => {
    await linkContactToCompany({ companyId, contactId, role: 'employee' });
    const linked = addContactResults.find(c => c.id === contactId);
    if (linked) {
      setCompanies(prev => prev.map(c => c.id === companyId ? {
        ...c, companyContacts: [...c.companyContacts, { id: `${companyId}_${contactId}`, role: 'employee', isPrimary: false, contact: { id: linked.id, name: linked.name, email: linked.email, phone: linked.phone, mobile: null, role: 'employee' } }]
      } : c));
    }
    setAddContactOpen(null);
    setAddContactSearch('');
  }, [addContactResults]);

  const handleRemoveContact = useCallback(async (companyId: string, contactId: string) => {
    await unlinkContactFromCompany(companyId, contactId);
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, companyContacts: c.companyContacts.filter(cc => cc.contact.id !== contactId) } : c));
  }, []);

  const handleSetPrimary = useCallback(async (companyId: string, contactId: string) => {
    await setPrimaryContact(companyId, contactId);
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, companyContacts: c.companyContacts.map(cc => ({ ...cc, isPrimary: cc.contact.id === contactId })) } : c));
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Διαγραφή εταιρείας;')) return;
    await deleteCompany(id);
    setCompanies(prev => prev.filter(c => c.id !== id));
    setTotal(prev => prev - 1);
  }, []);

  const handleNewQuote = useCallback(async (companyId: string) => {
    const q = await createQuote({ companyId, items: [{ id: crypto.randomUUID(), name: '', qty: 1, unitPrice: 0, finalPrice: 0 }] });
    router.push(`/quotes/${q.id}`);
  }, [router]);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {companies.map(company => {
          return (
          <div key={company.id} className="card" style={{ padding: '16px 18px' }}>
            {/* ── COMPANY HEADER ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: 'color-mix(in srgb, var(--blue) 12%, transparent)',
                border: '2px solid color-mix(in srgb, var(--blue) 25%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--blue)', fontSize: '0.8rem', fontWeight: 700,
              }}>{company.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.58rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 2, display: 'block' }}>Διακριτικός Τίτλος</label>
                <input value={company.name} onChange={e => updateCompanyField(company.id, 'name', e.target.value)}
                  style={{ ...inp, width: '100%', fontWeight: 600, fontSize: '0.95rem', padding: '5px 8px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => {
                    const val = !company.isSupplier;
                    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, isSupplier: val } : c));
                    updateCompany(company.id, { isSupplier: val } as any);
                  }}
                  title={company.isSupplier ? 'Προμηθευτής ✓' : 'Σήμανση ως προμηθευτής'}
                  style={{
                    padding: '4px 10px', borderRadius: 12, border: `1px solid ${company.isSupplier ? 'color-mix(in srgb, var(--teal) 40%, transparent)' : 'var(--glass-border)'}`,
                    background: company.isSupplier ? 'color-mix(in srgb, var(--teal) 10%, transparent)' : 'transparent',
                    color: company.isSupplier ? 'var(--teal)' : '#475569',
                    fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                >
                  <i className={`fas fa-${company.isSupplier ? 'check-circle' : 'truck'}`} style={{ fontSize: '0.55rem' }} />
                  Προμηθευτής
                </button>
                {savedId === company.id && (
                  <span style={{
                    fontSize: '0.68rem', color: 'var(--teal)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4,
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    <i className="fas fa-check" style={{ fontSize: '0.55rem' }} />Αποθηκεύτηκε
                  </span>
                )}
                {company.folderPath ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <a href={`presscal-fh://open-folder?path=${encodeURIComponent(company.folderPath)}`} title={company.folderPath}
                      style={{ padding: '6px 12px', borderRadius: '6px 0 0 6px', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderRight: 'none', background: 'rgba(245,130,32,0.06)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fas fa-folder-open" style={{ fontSize: '0.7rem' }} />Φάκελος
                    </a>
                    <button onClick={() => updateCompanyField(company.id, 'folderPath', '')} title="Αφαίρεση φακέλου"
                      style={{ padding: '6px 8px', borderRadius: '0 6px 6px 0', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'rgba(245,130,32,0.06)', color: '#94a3b8', fontSize: '0.6rem', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}>
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ) : (
                  <button onClick={async () => {
                    try {
                      const res = await fetch('http://localhost:17824/?pickFolder=1');
                      if (!res.ok) { alert('PressKit δεν αποκρίθηκε'); return; }
                      const data = await res.json();
                      if (data.canceled || !data.path) return;
                      updateCompanyField(company.id, 'folderPath', data.path);
                    } catch { alert('Δεν βρέθηκε το PressKit. Βεβαιώσου ότι τρέχει.'); }
                  }} title="Επιλογή φακέλου"
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px dashed var(--glass-border)', background: 'transparent', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.color = '#64748b'; }}>
                    <i className="fas fa-folder-plus" style={{ fontSize: '0.7rem' }} />Φάκελος
                  </button>
                )}
                <button onClick={() => handleNewQuote(company.id)} title="Νέα προσφορά"
                  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'rgba(245,130,32,0.06)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,130,32,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,130,32,0.06)'; }}>
                  <i className="fas fa-plus" style={{ fontSize: '0.55rem' }} />Προσφορά
                </button>
                <span style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{company._count.quotes} προσφ.</span>
                <button onClick={() => handleDelete(company.id)} title="Διαγραφή"
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>

            {/* ── COMPANY DETAILS ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid var(--glass-border)' }}>
                <SectionTitle text="Επικοινωνία" color="var(--blue)" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Field label="EMAIL" value={company.email || ''} onChange={v => updateCompanyField(company.id, 'email', v)} placeholder="—" type="email" />
                  <Field label="ΤΗΛΕΦΩΝΟ" value={company.phone || ''} onChange={v => updateCompanyField(company.id, 'phone', v)} placeholder="—" />
                  <Field label="ΔΙΕΥΘΥΝΣΗ" value={company.address || ''} onChange={v => updateCompanyField(company.id, 'address', v)} placeholder="—" />
                  <Field label="ΠΟΛΗ" value={company.city || ''} onChange={v => updateCompanyField(company.id, 'city', v)} placeholder="—" />
                  <Field label="ΤΚ" value={company.zip || ''} onChange={v => updateCompanyField(company.id, 'zip', v)} placeholder="—" />
                  <Field label="WEBSITE" value={company.website || ''} onChange={v => updateCompanyField(company.id, 'website', v)} placeholder="—" />
                </div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid var(--glass-border)' }}>
                <SectionTitle text="Φορολογικά" color="var(--violet)" />
                {hasElorus ? (
                  <>
                    <InfoField label="ΕΠΩΝΥΜΙΑ" value={company.legalName || ''} style={{ marginBottom: 6 }} />
                    {company.activities && <InfoField label="ΔΡΑΣΤΗΡΙΟΤΗΤΑ" value={company.activities} style={{ marginBottom: 6 }} />}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <InfoField label="ΑΦΜ" value={company.afm || ''} />
                      <InfoField label="ΔΟΥ" value={company.doy || ''} />
                      <InfoField label="ΔΙΕΥΘΥΝΣΗ" value={company.fiscalAddress || ''} />
                      <InfoField label="ΠΟΛΗ" value={company.fiscalCity || ''} />
                      <InfoField label="ΤΚ" value={company.fiscalZip || ''} />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <ElorusAfmLookup
                        currentAfm={company.afm || ''}
                        currentValues={{ afm: company.afm || '', doy: company.doy || '', address: company.fiscalAddress || '', city: company.fiscalCity || '', zip: company.fiscalZip || '' }}
                        onApply={(data: ElorusLookupResult) => {
                          const changes: Record<string, string | null> = {};
                          if (data.name && !company.name) changes.name = data.name;
                          if (data.name) changes.legalName = data.name;
                          if (data.afm) changes.afm = data.afm;
                          if (data.doy) changes.doy = data.doy;
                          if (data.address) changes.fiscalAddress = data.address;
                          if (data.city) changes.fiscalCity = data.city;
                          if (data.zip) changes.fiscalZip = data.zip;
                          if (data.address && !company.address) changes.address = data.address;
                          if (data.city && !company.city) changes.city = data.city;
                          if (data.zip && !company.zip) changes.zip = data.zip;
                          if (data.email && !company.email) changes.email = data.email;
                          if (data.elorusContactId) changes.elorusContactId = data.elorusContactId;
                          if (data.activities) changes.activities = data.activities;
                          setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ...changes } : c));
                          updateCompany(company.id, changes as any);
                        }}
                        toast={() => {}}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="ΕΠΩΝΥΜΙΑ" value={company.legalName || ''} onChange={v => updateCompanyField(company.id, 'legalName', v)} placeholder="Φορολογική επωνυμία" style={{ marginBottom: 6 }} />
                    <Field label="ΔΡΑΣΤΗΡΙΟΤΗΤΑ" value={company.activities || ''} onChange={v => updateCompanyField(company.id, 'activities', v)} placeholder="—" style={{ marginBottom: 6 }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <Field label="ΑΦΜ" value={company.afm || ''} onChange={v => updateCompanyField(company.id, 'afm', v)} placeholder="—" />
                      <Field label="ΔΟΥ" value={company.doy || ''} onChange={v => updateCompanyField(company.id, 'doy', v)} placeholder="—" />
                      <Field label="ΔΙΕΥΘΥΝΣΗ" value={company.fiscalAddress || ''} onChange={v => updateCompanyField(company.id, 'fiscalAddress', v)} placeholder="—" />
                      <Field label="ΠΟΛΗ" value={company.fiscalCity || ''} onChange={v => updateCompanyField(company.id, 'fiscalCity', v)} placeholder="—" />
                      <Field label="ΤΚ" value={company.fiscalZip || ''} onChange={v => updateCompanyField(company.id, 'fiscalZip', v)} placeholder="—" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── CONTACTS ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--teal)' }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                  Επαφές ({company.companyContacts.length})
                </span>
              </div>
              <button onClick={e => handleOpenAddContact(company.id, e)}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px dashed color-mix(in srgb, var(--teal) 40%, transparent)', background: addContactOpen === company.id ? 'color-mix(in srgb, var(--teal) 8%, transparent)' : 'transparent', color: 'var(--teal)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fas fa-user-plus" style={{ fontSize: '0.55rem' }} />Προσθήκη
              </button>
            </div>
            {company.companyContacts.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {company.companyContacts.map(cc => (
                  <ContactRow
                    key={cc.id} cc={cc} companyId={company.id}
                    onUpdate={(cId, data) => updateContactField(company.id, cId, data)}
                    onRemove={(cId) => handleRemoveContact(company.id, cId)}
                    onSetPrimary={(cId) => handleSetPrimary(company.id, cId)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.75rem', color: '#374151', fontStyle: 'italic' }}>Χωρίς επαφές</div>
            )}
          </div>
          );
        })}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <button onClick={loadMore} disabled={loading}
            style={{ padding: '10px 28px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Φόρτωση...' : `Φόρτωσε περισσότερα (${companies.length} / ${total})`}
          </button>
        </div>
      )}

      {companies.length === 0 && !loading && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <i className="fas fa-building" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{search ? 'Δεν βρέθηκαν αποτελέσματα' : 'Δεν υπάρχουν εταιρείες'}</p>
        </div>
      )}
      {/* ── ADD CONTACT PORTAL POPOVER ── */}
      {addContactOpen && addContactPos && ReactDOM.createPortal(
        <>
          <div onClick={() => { setAddContactOpen(null); setAddContactPos(null); setAddContactSearch(''); }} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed',
            top: addContactPos.top,
            left: addContactPos.left,
            zIndex: 9999,
            width: 280, maxHeight: 320, borderRadius: 10,
            background: 'var(--glass-bg, #1e293b)', border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '8px 8px 4px' }}>
              <input
                autoFocus value={addContactSearch} onChange={e => handleAddContactSearch(e.target.value)}
                placeholder="Αναζήτηση επαφής..."
                style={{ ...inp, width: '100%', fontSize: '0.8rem', padding: '7px 10px', borderColor: 'var(--glass-border)', background: 'rgba(255,255,255,0.04)' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {(() => {
                const company = companies.find(c => c.id === addContactOpen);
                const linkedIds = new Set(company?.companyContacts.map(cc => cc.contact.id) || []);
                const filtered = addContactResults.filter(c => !linkedIds.has(c.id));
                return <>
                  {filtered.slice(0, 15).map(c => (
                    <button key={c.id} onClick={() => handleLinkExistingContact(addContactOpen, c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 6,
                        border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', textAlign: 'left',
                        fontSize: '0.8rem',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                        background: 'color-mix(in srgb, var(--teal) 15%, transparent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--teal)', fontSize: '0.55rem', fontWeight: 700,
                      }}>{c.name.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        {c.email && <div style={{ fontSize: '0.65rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>}
                      </div>
                      <i className="fas fa-link" style={{ fontSize: '0.5rem', color: '#475569' }} />
                    </button>
                  ))}
                  {addContactLoading && (
                    <div style={{ padding: '8px', fontSize: '0.75rem', color: '#475569', textAlign: 'center' }}>Αναζήτηση...</div>
                  )}
                  {!addContactLoading && filtered.length === 0 && (
                    <div style={{ padding: '8px', fontSize: '0.75rem', color: '#475569', textAlign: 'center' }}>{addContactSearch ? 'Δεν βρέθηκε' : 'Δεν υπάρχουν επαφές'}</div>
                  )}
                </>;
              })()}
            </div>
            <div style={{ borderTop: '1px solid var(--glass-border)', padding: '6px 8px' }}>
              <button onClick={() => handleAddNewContact(addContactOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 8px', borderRadius: 6,
                  border: '1px dashed color-mix(in srgb, var(--teal) 30%, transparent)', background: 'transparent',
                  color: 'var(--teal)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                }}>
                <i className="fas fa-plus" style={{ fontSize: '0.55rem' }} />Νέα επαφή
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
