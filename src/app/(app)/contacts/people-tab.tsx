'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createContact, updateContact, deleteContact, linkContactToCompany, unlinkContactFromCompany } from '../companies/actions';
import { inp, inpFocus, lbl, SectionTitle } from './shared-styles';

interface CompanyLink { id: string; company: { id: string; name: string } }
interface ContactData {
  id: string; name: string; email: string | null; phone: string | null;
  mobile: string | null; role: string; notes: string; folderPath: string | null;
  companyContacts: CompanyLink[];
  _count: { quotes: number };
}

interface Props {
  initialContacts: ContactData[];
  initialTotal: number;
  initialHasMore: boolean;
  search: string;
  allCompanies: { id: string; name: string }[];
}

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

const roleLabels: Record<string, string> = {
  employee: 'Υπάλληλος', designer: 'Γραφίστας', freelancer: 'Freelancer',
  broker: 'Μεσάζων', contact: 'Επαφή', owner: 'Ιδιοκτήτης',
};

function ContactCard({ contact, allCompanies, onUpdate, onDelete }: {
  contact: ContactData;
  allCompanies: { id: string; name: string }[];
  onUpdate: (id: string, data: Partial<ContactData>) => void;
  onDelete: (id: string) => void;
}) {
  const [linking, setLinking] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const linkedIds = new Set(contact.companyContacts.map(cc => cc.company.id));

  const filteredCompanies = allCompanies.filter(c =>
    !linkedIds.has(c.id) && c.name.toLowerCase().includes(linkSearch.toLowerCase())
  );

  async function handleLink(companyId: string) {
    await linkContactToCompany({ companyId, contactId: contact.id });
    setLinking(false);
    setLinkSearch('');
    window.location.reload();
  }

  async function handleUnlink(companyId: string) {
    await unlinkContactFromCompany(companyId, contact.id);
    window.location.reload();
  }

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      {/* Row 1: Avatar + Name + Role + Delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: 'color-mix(in srgb, var(--teal) 12%, transparent)',
          border: '2px solid color-mix(in srgb, var(--teal) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--teal)', fontSize: '0.75rem', fontWeight: 700,
        }}>{contact.name.charAt(0).toUpperCase()}</div>
        <input value={contact.name} onChange={e => onUpdate(contact.id, { name: e.target.value })}
          style={{ ...inp, flex: 1, fontWeight: 600, fontSize: '0.92rem', padding: '5px 8px' }} />
        <select value={contact.role || 'contact'} onChange={e => onUpdate(contact.id, { role: e.target.value })}
          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', outline: 'none' }}>
          {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => onDelete(contact.id)} title="Διαγραφή"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--glass-border)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}>
          <i className="fas fa-trash" />
        </button>
      </div>

      {/* Row 2: Contact details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        <Field label="EMAIL" value={contact.email || ''} onChange={v => onUpdate(contact.id, { email: v })} type="email" />
        <Field label="ΤΗΛΕΦΩΝΟ" value={contact.phone || ''} onChange={v => onUpdate(contact.id, { phone: v })} />
        <Field label="ΚΙΝΗΤΟ" value={contact.mobile || ''} onChange={v => onUpdate(contact.id, { mobile: v })} />
      </div>

      {/* Row 3: Folder — always visible. For contacts linked to a company,
           the company folder takes precedence during quote costing. */}
      <div style={{ marginBottom: 10 }}>
        <Field
          label="ΦΑΚΕΛΟΣ ΠΕΛΑΤΗ"
          value={contact.folderPath || ''}
          onChange={v => onUpdate(contact.id, { folderPath: v } as any)}
          placeholder={contact.companyContacts.length > 0
            ? 'Προαιρετικό — υπερισχύει ο φάκελος της εταιρείας'
            : 'π.χ. D:\\Πελάτες\\Παπαδόπουλος'}
        />
      </div>

      {/* Row 4: Linked companies + quote count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>Εταιρείες:</span>
        {contact.companyContacts.map(cc => (
          <span key={cc.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 12,
            background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--blue) 20%, transparent)',
            fontSize: '0.72rem', color: 'var(--blue)', fontWeight: 600,
          }}>
            {cc.company.name}
            <button onClick={() => handleUnlink(cc.company.id)} title="Αποσύνδεση"
              style={{ border: 'none', background: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontSize: '0.6rem', padding: '0 2px', opacity: 0.6 }}>
              <i className="fas fa-times" />
            </button>
          </span>
        ))}
        {linking ? (
          <div style={{ position: 'relative' }}>
            <input value={linkSearch} onChange={e => setLinkSearch(e.target.value)} autoFocus
              placeholder="Εταιρεία..."
              style={{ ...inp, width: 160, fontSize: '0.75rem', padding: '3px 8px' }}
              onKeyDown={e => { if (e.key === 'Escape') { setLinking(false); setLinkSearch(''); } }}
            />
            {linkSearch && filteredCompanies.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
                width: 220, maxHeight: 180, overflow: 'auto',
                background: 'rgb(20,28,50)', border: '1px solid var(--glass-border)',
                borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                {filteredCompanies.slice(0, 10).map(c => (
                  <button key={c.id} onClick={() => handleLink(c.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'transparent', color: '#cbd5e1', fontSize: '0.78rem', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setLinking(true)}
            style={{ padding: '2px 8px', borderRadius: 12, border: '1px dashed color-mix(in srgb, var(--blue) 30%, transparent)', background: 'transparent', color: '#64748b', fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="fas fa-link" style={{ fontSize: '0.55rem' }} /> Link
          </button>
        )}
        <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>
          {contact._count.quotes} προσφ.
        </span>
      </div>
    </div>
  );
}

export function PeopleTab({ initialContacts, initialTotal, initialHasMore, search, allCompanies }: Props) {
  const [contacts, setContacts] = useState(initialContacts);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSearchRef = useRef(search);

  // Re-fetch when search changes from parent
  useEffect(() => {
    if (search === lastSearchRef.current) return;
    lastSearchRef.current = search;
    (async () => {
      setLoading(true);
      try {
        const { getContactsWithCompanies } = await import('../companies/actions');
        const result = await getContactsWithCompanies({ search: search || undefined, take: PAGE_SIZE });
        setContacts(result.contacts as any);
        setTotal(result.total);
        setHasMore(result.hasMore);
      } finally { setLoading(false); }
    })();
  }, [search]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const { getContactsWithCompanies } = await import('../companies/actions');
      const result = await getContactsWithCompanies({ search: search || undefined, skip: contacts.length, take: PAGE_SIZE });
      setContacts(prev => [...prev, ...result.contacts as any]);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } finally { setLoading(false); }
  }, [contacts.length, search]);

  // Debounced contact save
  const debouncedSave = useCallback((id: string, data: Partial<ContactData>) => {
    const key = `c_${id}`;
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(() => { updateContact(id, data as any); }, 1000);
  }, []);

  const handleUpdate = useCallback((id: string, data: Partial<ContactData>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    debouncedSave(id, data);
  }, [debouncedSave]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Διαγραφή επαφής;')) return;
    await deleteContact(id);
    setContacts(prev => prev.filter(c => c.id !== id));
    setTotal(prev => prev - 1);
  }, []);

  const handleCreate = useCallback(async () => {
    const contact = await createContact({ name: '' });
    const newContact = { ...contact, companyContacts: [], _count: { quotes: 0 } } as any;
    setContacts(prev => [newContact, ...prev]);
    setTotal(prev => prev + 1);
  }, []);

  return (
    <>
      {/* Create button is handled by parent — this just shows items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {contacts.map(contact => (
          <ContactCard
            key={contact.id}
            contact={contact}
            allCompanies={allCompanies}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <button onClick={loadMore} disabled={loading}
            style={{ padding: '10px 28px', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Φόρτωση...' : `Φόρτωσε περισσότερα (${contacts.length} / ${total})`}
          </button>
        </div>
      )}

      {contacts.length === 0 && !loading && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <i className="fas fa-user" style={{ fontSize: '2.5rem', color: 'var(--text-muted)', opacity: 0.2 }} />
          <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{search ? 'Δεν βρέθηκαν αποτελέσματα' : 'Δεν υπάρχουν επαφές'}</p>
        </div>
      )}
    </>
  );
}
