'use client';

import { useState, useCallback, useRef } from 'react';
import { CompaniesTab } from './companies-tab';
import { PeopleTab } from './people-tab';
import { createCompany, createContact } from '../companies/actions';
import { inp } from './shared-styles';

type Tab = 'companies' | 'people';

interface Props {
  initialCompanies: any[];
  initialCompaniesTotal: number;
  initialCompaniesHasMore: boolean;
  initialContacts: any[];
  initialContactsTotal: number;
  initialContactsHasMore: boolean;
  hasElorus: boolean;
  allCompanies: { id: string; name: string }[];
}

export function ContactsPage({
  initialCompanies, initialCompaniesTotal, initialCompaniesHasMore,
  initialContacts, initialContactsTotal, initialContactsHasMore,
  hasElorus, allCompanies,
}: Props) {
  const [tab, setTab] = useState<Tab>('companies');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(q), 400);
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      if (tab === 'companies') {
        await createCompany({ name: '' });
      } else {
        await createContact({ name: '' });
      }
      window.location.reload();
    } finally {
      setCreating(false);
    }
  }, [tab]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s',
    background: active ? 'color-mix(in srgb, var(--blue) 15%, transparent)' : 'transparent',
    color: active ? 'var(--blue)' : '#64748b',
    borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
  });

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
          }}><i className="fas fa-address-book" /></div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Επαφές & Εταιρείες</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {initialCompaniesTotal} εταιρείες · {initialContactsTotal} άτομα
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', width: 280 }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: '0.7rem' }} />
            <input value={search} onChange={e => handleSearchChange(e.target.value)} placeholder="Αναζήτηση..."
              style={{ ...inp, paddingLeft: 30, borderColor: 'var(--glass-border)', background: 'rgba(255,255,255,0.04)' }} />
          </div>
          <button onClick={handleCreate} disabled={creating} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--accent)', color: '#fff', padding: '8px 18px', borderRadius: 8, border: 'none',
            fontSize: '0.85rem', fontWeight: 700, cursor: creating ? 'wait' : 'pointer',
            boxShadow: '0 4px 16px rgba(245,130,32,0.3)', whiteSpace: 'nowrap', opacity: creating ? 0.6 : 1,
          }}>
            <i className="fas fa-plus" /> {tab === 'companies' ? 'Νέα Εταιρεία' : 'Νέο Άτομο'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button onClick={() => setTab('companies')} style={tabStyle(tab === 'companies')}>
          <i className="fas fa-building" style={{ marginRight: 6, fontSize: '0.75rem' }} />
          Εταιρείες ({initialCompaniesTotal})
        </button>
        <button onClick={() => setTab('people')} style={tabStyle(tab === 'people')}>
          <i className="fas fa-user" style={{ marginRight: 6, fontSize: '0.75rem' }} />
          Άτομα ({initialContactsTotal})
        </button>
      </div>

      {/* Tab content */}
      <div style={{ display: tab === 'companies' ? 'block' : 'none' }}>
        <CompaniesTab
          initialCompanies={initialCompanies}
          initialTotal={initialCompaniesTotal}
          initialHasMore={initialCompaniesHasMore}
          hasElorus={hasElorus}
          search={debouncedSearch}
        />
      </div>
      <div style={{ display: tab === 'people' ? 'block' : 'none' }}>
        <PeopleTab
          initialContacts={initialContacts}
          initialTotal={initialContactsTotal}
          initialHasMore={initialContactsHasMore}
          search={debouncedSearch}
          allCompanies={allCompanies}
        />
      </div>
    </>
  );
}
