'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createCompany, updateCompany, deleteCompany, createContact, updateContact, unlinkContactFromCompany, setPrimaryContact } from './actions';
import { ElorusAfmLookup, type ElorusLookupResult } from '@/components/elorus-afm-lookup';

interface ContactData { id: string; name: string; email: string | null; phone: string | null; mobile: string | null; role: string }
interface CCData { id: string; role: string; isPrimary: boolean; contact: ContactData }
interface CompanyData {
  id: string; name: string; afm: string | null; doy: string | null; email: string | null; phone: string | null;
  website: string | null; address: string | null; city: string | null; zip: string | null; notes: string;
  folderPath: string | null; tags: string[]; companyContacts: CCData[]; _count: { quotes: number };
}

interface Props { initialCompanies: CompanyData[]; initialTotal: number; initialHasMore: boolean; hasElorus?: boolean }

const PAGE_SIZE = 50;

const inp: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)',
  color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color 0.2s, background 0.2s',
};
const inpFocus: React.CSSProperties = { ...inp, borderColor: 'color-mix(in srgb, var(--blue) 40%, transparent)', background: 'rgba(255,255,255,0.06)' };
const lbl: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 2, display: 'block' };
const sectionTitle = (text: string, color = 'var(--blue)') => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
    <div style={{ width: 3, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
    <span style={{ fontSize: '0.62rem', fontWeight: 700, color, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{text}</span>
  </div>
);

// Inline editable field
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

// Contact inline row
function ContactRow({ cc, companyId, onUpdate, onRemove, onSetPrimary }: {
  cc: CCData; companyId: string;
  onUpdate: (contactId: string, data: Partial<ContactData>) => void;
  onRemove: (contactId: string) => void;
  onSetPrimary: (contactId: string) => void;
}) {
  const c = cc.contact;
  const roleLabels: Record<string, string> = { employee: 'Υπάλληλος', designer: 'Γραφίστας', freelancer: 'Freelancer', broker: 'Μεσάζων', contact: 'Επαφή', owner: 'Ιδιοκτήτης' };

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: cc.isPrimary ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${cc.isPrimary ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--glass-border)'}`,
    }}>
      {/* Row 1: avatar + name + actions */}
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
      {/* Row 2: email + phone + mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginLeft: 36 }}>
        <Field label="EMAIL" value={c.email || ''} onChange={v => onUpdate(c.id, { email: v })} placeholder="—" type="email" />
        <Field label="ΤΗΛΕΦΩΝΟ" value={c.phone || ''} onChange={v => onUpdate(c.id, { phone: v })} placeholder="—" />
        <Field label="ΚΙΝΗΤΟ" value={c.mobile || ''} onChange={v => onUpdate(c.id, { mobile: v })} placeholder="—" />
      </div>
    </div>
  );
}

export function CompaniesList({ initialCompanies, initialTotal, initialHasMore, hasElorus }: Props) {
  const [companies, setCompanies] = useState(initialCompanies);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-side search with debounce
  const doSearch = useCallback(async (q: string, append = false) => {
    setLoading(true);
    try {
      const { getCompanies } = await import('./actions');
      const skip = append ? companies.length : 0;
      const result = await getCompanies({ search: q || undefined, skip, take: PAGE_SIZE });
      if (append) {
        setCompanies(prev => [...prev, ...result.companies as any]);
      } else {
        setCompanies(result.companies as any);
      }
      setTotal(result.total);
      setHasMore(result.hasMore);
    } finally { setLoading(false); }
  }, [companies.length]);

  // Debounced search on type
  const handleSearchChange = useCallback((q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(q), 400);
  }, [doSearch]);

  const loadMore = useCallback(() => doSearch(search, true), [doSearch, search]);

  const filtered = companies; // already filtered server-side

  // Debounced company save
  const debouncedSaveCompany = useCallback((id: string, data: Partial<CompanyData>) => {
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => { updateCompany(id, data as any); }, 1000);
  }, []);

  // Update company field locally + debounce save
  const updateCompanyField = useCallback((id: string, field: string, value: string) => {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    debouncedSaveCompany(id, { [field]: value || null });
  }, [debouncedSaveCompany]);

  // Debounced contact save
  const debouncedSaveContact = useCallback((contactId: string, data: Partial<ContactData>) => {
    const key = `c_${contactId}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => { updateContact(contactId, data as any); }, 1000);
  }, []);

  // Update contact locally + debounce save
  const updateContactField = useCallback((companyId: string, contactId: string, data: Partial<ContactData>) => {
    setCompanies(prev => prev.map(c => c.id === companyId ? {
      ...c, companyContacts: c.companyContacts.map(cc => cc.contact.id === contactId ? { ...cc, contact: { ...cc.contact, ...data }, role: data.role || cc.role } : cc)
    } : c));
    debouncedSaveContact(contactId, data);
  }, [debouncedSaveContact]);

  // Create company
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    const c = await createCompany({ name: newName.trim() });
    setCompanies(prev => [c as any, ...prev]);
    setNewName('');
    setCreating(false);
  }, [newName]);

  // Add new contact to company
  const handleAddContact = useCallback(async (companyId: string) => {
    await createContact({ name: 'Νέα επαφή', companyId, role: 'employee' });
    window.location.reload(); // simplest refresh
  }, []);

  // Remove contact
  const handleRemoveContact = useCallback(async (companyId: string, contactId: string) => {
    await unlinkContactFromCompany(companyId, contactId);
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, companyContacts: c.companyContacts.filter(cc => cc.contact.id !== contactId) } : c));
  }, []);

  // Set primary
  const handleSetPrimary = useCallback(async (companyId: string, contactId: string) => {
    await setPrimaryContact(companyId, contactId);
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, companyContacts: c.companyContacts.map(cc => ({ ...cc, isPrimary: cc.contact.id === contactId })) } : c));
  }, []);

  // Delete company
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Διαγραφή εταιρείας;')) return;
    await deleteCompany(id);
    setCompanies(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '2px solid color-mix(in srgb, var(--blue) 35%, transparent)',
            background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', color: 'var(--blue)',
          }}><i className="fas fa-building" /></div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Εταιρείες & Επαφές</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{total} εταιρείες{loading ? ' · φόρτωση...' : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', width: 280 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '0.7rem' }} />
            <input value={search} onChange={e => handleSearchChange(e.target.value)} placeholder="Αναζήτηση..." style={{ ...inp, paddingLeft: 30, borderColor: 'var(--glass-border)', background: 'rgba(255,255,255,0.04)' }} />
          </div>
          {!creating ? (
            <button onClick={() => setCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: '#fff', padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(245,130,32,0.3)', whiteSpace: 'nowrap' }}>
              <i className="fas fa-plus" /> Νέα Εταιρεία
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Επωνυμία..." autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} style={{ ...inp, width: 200, borderColor: 'var(--accent)', background: 'rgba(255,255,255,0.04)' }} />
              <button onClick={handleCreate} disabled={!newName.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', opacity: newName.trim() ? 1 : 0.5 }}>OK</button>
              <button onClick={() => { setCreating(false); setNewName(''); }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><i className="fas fa-times" /></button>
            </div>
          )}
        </div>
      </div>

      {/* Company cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(company => {
          const primary = company.companyContacts.find(cc => cc.isPrimary)?.contact;
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
              <input value={company.name} onChange={e => updateCompanyField(company.id, 'name', e.target.value)}
                style={{ ...inp, flex: 1, fontWeight: 600, fontSize: '0.95rem', padding: '5px 8px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {company.folderPath ? (
                  <a href={`presscal-fh://open-folder?path=${encodeURIComponent(company.folderPath)}`} title={company.folderPath}
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'rgba(245,130,32,0.06)', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fas fa-folder-open" style={{ fontSize: '0.7rem' }} />Φάκελος
                  </a>
                ) : (
                  <a href={`presscal-fh://pick-folder?customerId=${company.id}`} title="Επιλογή φακέλου"
                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px dashed var(--glass-border)', background: 'transparent', color: '#64748b', fontSize: '0.75rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.color = '#64748b'; }}>
                    <i className="fas fa-folder-plus" style={{ fontSize: '0.7rem' }} />Φάκελος
                  </a>
                )}
                <span style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>{company._count.quotes} προσφ.</span>
                <button onClick={() => handleDelete(company.id)} title="Διαγραφή"
                  style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>

            {/* ── COMPANY DETAILS — two sections side by side ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {/* Left: Επικοινωνία */}
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid var(--glass-border)' }}>
                {sectionTitle('Επικοινωνία', 'var(--blue)')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Field label="EMAIL" value={company.email || ''} onChange={v => updateCompanyField(company.id, 'email', v)} placeholder="—" type="email" />
                  <Field label="ΤΗΛΕΦΩΝΟ" value={company.phone || ''} onChange={v => updateCompanyField(company.id, 'phone', v)} placeholder="—" />
                  <Field label="ΔΙΕΥΘΥΝΣΗ" value={company.address || ''} onChange={v => updateCompanyField(company.id, 'address', v)} placeholder="—" />
                  <Field label="ΠΟΛΗ" value={company.city || ''} onChange={v => updateCompanyField(company.id, 'city', v)} placeholder="—" />
                </div>
              </div>
              {/* Right: Φορολογικά */}
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.015)', border: '1px solid var(--glass-border)' }}>
                {sectionTitle('Φορολογικά', 'var(--violet)')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Field label="ΑΦΜ" value={company.afm || ''} onChange={v => updateCompanyField(company.id, 'afm', v)} placeholder="—" />
                  <Field label="ΔΟΥ" value={company.doy || ''} onChange={v => updateCompanyField(company.id, 'doy', v)} placeholder="—" />
                  <Field label="WEBSITE" value={company.website || ''} onChange={v => updateCompanyField(company.id, 'website', v)} placeholder="—" />
                  <Field label="ΤΚ" value={company.zip || ''} onChange={v => updateCompanyField(company.id, 'zip', v)} placeholder="—" />
                </div>
                {hasElorus && (
                  <div style={{ marginTop: 8 }}>
                    <ElorusAfmLookup
                      currentAfm={company.afm || ''}
                      currentValues={{ afm: company.afm || '', doy: company.doy || '', address: company.address || '', city: company.city || '', zip: company.zip || '' }}
                      onApply={(data: ElorusLookupResult) => {
                        if (data.afm) updateCompanyField(company.id, 'afm', data.afm);
                        if (data.doy) updateCompanyField(company.id, 'doy', data.doy);
                        if (data.address) updateCompanyField(company.id, 'address', data.address);
                        if (data.city) updateCompanyField(company.id, 'city', data.city);
                        if (data.zip) updateCompanyField(company.id, 'zip', data.zip);
                        if (data.email && !company.email) updateCompanyField(company.id, 'email', data.email);
                      }}
                      toast={() => {}}
                    />
                  </div>
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
              <button onClick={() => handleAddContact(company.id)}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px dashed color-mix(in srgb, var(--teal) 40%, transparent)', background: 'transparent', color: 'var(--teal)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {filtered.length === 0 && !loading && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <i className="fas fa-building" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{search ? 'Δεν βρέθηκαν αποτελέσματα' : 'Δεν υπάρχουν εταιρείες'}</p>
        </div>
      )}
    </>
  );
}
