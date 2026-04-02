'use client';

import { useState, useRef } from 'react';
import type { Org } from '@/generated/prisma/client';
import { updateOrg } from './actions';

const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

type Tab = 'company' | 'subscription' | 'integrations';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'company', label: 'Επιχείρηση', icon: 'fa-building' },
  { id: 'subscription', label: 'Συνδρομή', icon: 'fa-crown' },
  { id: 'integrations', label: 'Ενσωματώσεις', icon: 'fa-plug' },
];

const PLANS: { id: string; name: string; price: string; features: string[] }[] = [
  { id: 'free', name: 'Free', price: '€0', features: ['1 μηχανή', '100 χαρτιά', 'Βασική κοστολόγηση'] },
  { id: 'starter', name: 'Starter', price: '€19/μήνα', features: ['5 μηχανές', 'Απεριόριστα χαρτιά', 'Smart Import', 'Email παραγγελίες'] },
  { id: 'pro', name: 'Pro', price: '€49/μήνα', features: ['Απεριόριστα', 'Elorus τιμολόγηση', 'API access', 'Priority support'] },
  { id: 'enterprise', name: 'Enterprise', price: 'Custom', features: ['Multi-branch', 'Custom integrations', 'SLA', 'Dedicated support'] },
];

export function SettingsShell({ org }: { org: Org }) {
  const [tab, setTab] = useState<Tab>('company');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Company fields
  const [legalName, setLegalName] = useState(org.legalName ?? '');
  const [afm, setAfm] = useState(org.afm ?? '');
  const [doy, setDoy] = useState(org.doy ?? '');
  const [gemh, setGemh] = useState(org.gemh ?? '');
  const [profession, setProfession] = useState(org.profession ?? '');
  const [address, setAddress] = useState(org.address ?? '');
  const [city, setCity] = useState(org.city ?? '');
  const [postalCode, setPostalCode] = useState(org.postalCode ?? '');
  const [phone, setPhone] = useState(org.phone ?? '');
  const [email, setEmail] = useState(org.email ?? '');
  const [website, setWebsite] = useState(org.website ?? '');

  // Logo
  const [logo, setLogo] = useState(org.logo ?? '');
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  // Quote terms (simple text lines)
  const [quoteTerms, setQuoteTerms] = useState<string[]>(() => {
    const raw = org.quoteTerms as any;
    if (Array.isArray(raw)) {
      // Handle both old {title,text} format and new string[] format
      return raw.map((t: any) => typeof t === 'string' ? t : (t.text || t.title || '')).filter(Boolean);
    }
    return [];
  });

  // APIs
  const [apiGmail, setApiGmail] = useState(org.apiGmail ?? '');
  const [apiGemini, setApiGemini] = useState(org.apiGemini ?? '');
  const [apiFilehelper, setApiFilehelper] = useState(org.apiFilehelper ?? '');

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload-logo', { method: 'POST', body: form });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { setUploading(false); return; }
      if (data.url) {
        // Logo already saved to DB by the API route, just update UI
        setLogo(data.url);
      }
    } catch { /* silently fail — logo already saved by API */ }
    setUploading(false);
    e.target.value = '';
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateOrg({
      legalName: legalName || null, afm: afm || null, doy: doy || null,
      gemh: gemh || null, profession: profession || null,
      address: address || null, city: city || null, postalCode: postalCode || null,
      phone: phone || null, email: email || null, website: website || null,
      quoteTerms: JSON.stringify(quoteTerms.filter(t => t.trim())),
      apiGmail: apiGmail || null, apiGemini: apiGemini || null, apiFilehelper: apiFilehelper || null,
    });
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      alert(`Σφάλμα αποθήκευσης: ${result.error}`);
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%',
          border: '2px solid color-mix(in srgb, var(--violet) 35%, transparent)',
          background: 'color-mix(in srgb, var(--violet) 10%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem', color: 'var(--violet)',
        }}>
          <i className="fas fa-cog" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Ρυθμίσεις</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Λογαριασμός & Ενσωματώσεις</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            color: tab === t.id ? 'var(--violet)' : 'var(--text-muted)',
            background: tab === t.id ? 'color-mix(in srgb, var(--violet) 12%, transparent)' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className={`fas ${t.icon}`} style={{ fontSize: '0.7rem' }} />{t.label}
          </button>
        ))}
      </div>

      {/* ═══ COMPANY TAB ═══ */}
      {tab === 'company' && (
        <div className="panel" style={{ maxWidth: 700 }}>
          <Section icon="fa-image" iconColor="var(--blue)" title="ΛΟΓΟΤΥΠΟ">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div onClick={() => logoRef.current?.click()} style={{
                width: 120, height: 70, borderRadius: 10,
                border: `2px dashed ${logo ? 'var(--glass-border)' : 'color-mix(in srgb, var(--blue) 40%, transparent)'}`,
                background: logo ? 'rgba(255,255,255,0.03)' : 'color-mix(in srgb, var(--blue) 5%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', overflow: 'hidden', position: 'relative',
              }}>
                {logo ? (
                  <img src={logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <i className="fas fa-cloud-upload-alt" style={{ color: 'var(--blue)', fontSize: '1.2rem' }} />
                    <p style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 2 }}>Ανέβασμα</p>
                  </div>
                )}
                {uploading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 16, height: 16, border: '2px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  </div>
                )}
              </div>
              <div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  {logo ? 'Κλικ για αλλαγή' : 'Ανεβάστε το λογότυπο της εταιρείας'}
                </p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>PNG, JPG ή SVG, μέγιστο 2MB</p>
                {logo && (
                  <button onClick={async (e) => { e.stopPropagation(); setLogo(''); await updateOrg({ logo: null }); }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                    <i className="fas fa-trash" style={{ marginRight: 3, fontSize: '0.6rem' }} />Αφαίρεση
                  </button>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            </div>
          </Section>

          <Section icon="fa-file-invoice" iconColor="var(--accent)" title="ΦΟΡΟΛΟΓΙΚΑ ΣΤΟΙΧΕΙΑ">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Επωνυμία *"><input className={inputCls} value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="π.χ. PressCal ΕΠΕ" /></Field>
              <Field label="ΑΦΜ *"><input className={inputCls} value={afm} onChange={e => setAfm(e.target.value)} placeholder="999999999" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="ΔΟΥ"><input className={inputCls} value={doy} onChange={e => setDoy(e.target.value)} placeholder="π.χ. Α' Αθηνών" /></Field>
              <Field label="ΓΕΜΗ"><input className={inputCls} value={gemh} onChange={e => setGemh(e.target.value)} placeholder="123456789" /></Field>
              <Field label="Δραστηριότητα"><input className={inputCls} value={profession} onChange={e => setProfession(e.target.value)} placeholder="Τυπογραφείο" /></Field>
            </div>
          </Section>

          <Section icon="fa-map-marker-alt" iconColor="var(--teal)" title="ΣΤΟΙΧΕΙΑ ΕΠΙΚΟΙΝΩΝΙΑΣ">
            <Field label="Διεύθυνση"><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="Οδός, Αριθμός" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <Field label="Πόλη"><input className={inputCls} value={city} onChange={e => setCity(e.target.value)} placeholder="Αθήνα" /></Field>
              <Field label="ΤΚ"><input className={inputCls} value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="11111" /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Τηλέφωνο"><input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="210-..." /></Field>
              <Field label="Email"><input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="info@..." /></Field>
              <Field label="Website"><input className={inputCls} value={website} onChange={e => setWebsite(e.target.value)} placeholder="www..." /></Field>
            </div>
          </Section>

          <Section icon="fa-file-contract" iconColor="var(--violet)" title="ΟΡΟΙ & ΠΡΟΫΠΟΘΕΣΕΙΣ ΠΡΟΣΦΟΡΑΣ">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              Αριθμημένοι όροι που εμφανίζονται στο email προσφοράς.
            </p>
            {quoteTerms.map((term, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', minWidth: 20 }}>{idx + 1}.</span>
                <textarea
                  className={inputCls + " !h-10 py-2"}
                  style={{ resize: 'vertical', minHeight: 36, flex: 1 }}
                  value={term}
                  onChange={e => setQuoteTerms(prev => prev.map((t, i) => i === idx ? e.target.value : t))}
                  placeholder="Όρος..."
                />
                <button
                  onClick={() => setQuoteTerms(prev => prev.filter((_, i) => i !== idx))}
                  style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.5 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                ><i className="fas fa-times" /></button>
              </div>
            ))}
            <button
              onClick={() => setQuoteTerms(prev => [...prev, ''])}
              style={{
                border: '1px dashed var(--border)', background: 'transparent', borderRadius: 8,
                padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600,
                cursor: 'pointer', width: '100%',
              }}
            >
              <i className="fas fa-plus" style={{ marginRight: 6, fontSize: '0.6rem' }} />Προσθήκη Όρου
            </button>
          </Section>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '10px 28px', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: '0.88rem', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
              opacity: saving ? 0.5 : 1,
            }}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
            {saved && (
              <span style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 600 }}>
                <i className="fas fa-check" style={{ marginRight: 4 }} /> Αποθηκεύτηκε
              </span>
            )}
          </div>
        </div>
      )}

      {/* ═══ SUBSCRIPTION TAB ═══ */}
      {tab === 'subscription' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 900 }}>
            {PLANS.map(p => {
              const isActive = org.plan === p.id;
              return (
                <div key={p.id} style={{
                  padding: 20, borderRadius: 14,
                  border: `2px solid ${isActive ? 'var(--accent)' : 'var(--glass-border)'}`,
                  background: isActive ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'rgba(255,255,255,0.02)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{p.name}</h3>
                    <p style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--accent)', marginTop: 4 }}>{p.price}</p>
                  </div>
                  <ul style={{ flex: 1, listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-check" style={{ color: 'var(--success)', fontSize: '0.6rem' }} />{f}
                      </li>
                    ))}
                  </ul>
                  {isActive ? (
                    <div style={{ padding: '8px 0', textAlign: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'var(--success)' }}>
                      <i className="fas fa-check-circle" style={{ marginRight: 4 }} /> Ενεργό
                    </div>
                  ) : (
                    <button style={{
                      padding: '8px 0', borderRadius: 8, border: '1px solid var(--glass-border)',
                      background: 'transparent', color: 'var(--text-dim)', fontSize: '0.78rem',
                      fontWeight: 600, cursor: 'pointer',
                    }}>Αναβάθμιση</button>
                  )}
                </div>
              );
            })}
          </div>
          {org.planExpiry && (
            <p style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <i className="fas fa-calendar" style={{ marginRight: 4 }} />
              Λήξη: {new Date(org.planExpiry).toLocaleDateString('el-GR')}
            </p>
          )}
        </div>
      )}

      {/* ═══ INTEGRATIONS TAB ═══ */}
      {tab === 'integrations' && (
        <div className="panel" style={{ maxWidth: 700 }}>
          <ElorusSettings org={org} inputCls={inputCls} />
          <CourierSettings inputCls={inputCls} />

          <Section icon="fa-envelope" iconColor="#ea4335" title="GMAIL — ΑΠΟΣΤΟΛΗ EMAIL">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              App Password για αποστολή email μέσω Gmail (Παραγγελίες, Προσφορές).
            </p>
            <Field label="Gmail App Password">
              <input className={inputCls} type="password" value={apiGmail} onChange={e => setApiGmail(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" />
            </Field>
          </Section>

          <Section icon="fa-robot" iconColor="var(--blue)" title="GEMINI AI — SCAN & IMPORT">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              Override Gemini API key (αν θέλετε δικό σας αντί του default).
            </p>
            <Field label="Gemini API Key">
              <input className={inputCls} type="password" value={apiGemini} onChange={e => setApiGemini(e.target.value)} placeholder="AIza..." />
            </Field>
          </Section>

          <Section icon="fa-folder-open" iconColor="#f58220" title="FILE HELPER — DESKTOP APP">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>
              API key για σύνδεση με την desktop εφαρμογή File Helper (preview, preflight, διαχείριση αρχείων).
            </p>
            <Field label="API Key">
              <div style={{ display: 'flex', gap: 6 }}>
                <input className={inputCls} type="text" value={apiFilehelper} readOnly placeholder="fh_..." style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.72rem' }} />
                <button
                  onClick={() => {
                    const key = 'fh_' + crypto.randomUUID().replace(/-/g, '');
                    setApiFilehelper(key);
                  }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--text-dim)', fontSize: '0.72rem',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <i className="fas fa-sync-alt" style={{ marginRight: 4 }} />
                  Generate
                </button>
                {apiFilehelper && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(apiFilehelper);
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text-dim)', fontSize: '0.72rem',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <i className="fas fa-copy" style={{ marginRight: 4 }} />
                    Copy
                  </button>
                )}
              </div>
            </Field>
            {apiFilehelper && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Βάλε αυτό το key στο File Helper app: Settings → PressCal → API Key
                </span>
              </div>
            )}
          </Section>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '10px 28px', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: '0.88rem', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
              opacity: saving ? 0.5 : 1,
            }}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
            {saved && (
              <span style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 600 }}>
                <i className="fas fa-check" style={{ marginRight: 4 }} /> Αποθηκεύτηκε
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, iconColor, title, children }: { icon: string; iconColor: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
        <i className={`fas ${icon}`} style={{ color: iconColor, fontSize: '0.85rem' }} />
        <h3 style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.04em' }}>{title}</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{label}</span>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════
//  ELORUS SETTINGS (self-contained component)
// ═══════════════════════════════════════════

const MYDATA_DOC_TYPES = [
  { value: '1.1', label: '1.1 — Τιμολόγιο Πώλησης' },
  { value: '2.1', label: '2.1 — Τιμολόγιο Παροχής' },
  { value: '5.1', label: '5.1 — Πιστωτικό Τιμολόγιο' },
  { value: '11.1', label: '11.1 — Απόδειξη Λιανικής' },
  { value: '11.2', label: '11.2 — Απόδειξη Παροχής' },
];
const CLASS_CATEGORIES = [
  { value: 'category1_1', label: 'Έσοδα από Πώληση Εμπορευμάτων' },
  { value: 'category1_2', label: 'Έσοδα από Πώληση Προϊόντων' },
  { value: 'category1_3', label: 'Έσοδα από Παροχή Υπηρεσιών' },
];
const CLASS_TYPES = [
  { value: 'E3_561_001', label: 'Χονδρικές πωλήσεις' },
  { value: 'E3_561_002', label: 'Χονδρικές άρθρο 39α' },
  { value: 'E3_561_003', label: 'Λιανικές' },
  { value: 'E3_561_005', label: 'Ενδοκοινοτικές' },
  { value: 'E3_561_007', label: 'Λοιπές πωλήσεις' },
];

type ElorusDocType = { id: string; title: string; category?: string };
type ElorusTax = { id: string; title: string; percentage?: string };

interface ElorusData {
  configured: boolean;
  orgName: string; orgId: string; orgSlug: string;
  apiKeyMasked: string;
  defaultDocType: string; defaultTaxId: string;
  defaultMyDataType: string; defaultClassCategory: string; defaultClassType: string;
  aadeConfigured: boolean; aadeUsername: string; aadeAfm: string;
  docTypes: ElorusDocType[]; taxes: ElorusTax[];
}

function ElorusSettings({ org, inputCls }: { org: { apiElorus?: string | null; elorusOrgId?: string | null }; inputCls: string }) {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<ElorusData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Connection form
  const [apiKey, setApiKey] = useState('');
  const [orgId, setOrgId] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  // Defaults form
  const [defaultDocType, setDefaultDocType] = useState('');
  const [defaultTaxId, setDefaultTaxId] = useState('');
  const [defaultMyDataType, setDefaultMyDataType] = useState('');
  const [defaultClassCategory, setDefaultClassCategory] = useState('');
  const [defaultClassType, setDefaultClassType] = useState('');

  // AADE form
  const [aadeUsername, setAadeUsername] = useState('');
  const [aadePassword, setAadePassword] = useState('');
  const [aadeAfm, setAadeAfm] = useState('');

  const selectCls = inputCls + ' appearance-none';

  // Load settings on mount
  async function loadSettings() {
    try {
      const res = await fetch('/api/elorus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get' }),
      });
      const d = await res.json();
      setData(d);
      setDefaultDocType(d.defaultDocType || '');
      setDefaultTaxId(d.defaultTaxId || '');
      setDefaultMyDataType(d.defaultMyDataType || '');
      setDefaultClassCategory(d.defaultClassCategory || '');
      setDefaultClassType(d.defaultClassType || '');
      setAadeUsername(d.aadeUsername || '');
      setAadeAfm(d.aadeAfm || '');
    } catch { /* ignore */ }
    setLoaded(true);
  }

  // biome-ignore lint: load once
  useState(() => { loadSettings(); });

  async function handleConnect() {
    if (!apiKey || !orgId) { setMsg('Συμπλήρωσε API Key και Organization ID'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/elorus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', apiKey, orgId, orgSlug }),
      });
      const d = await res.json();
      if (d.ok) {
        setMsg('Συνδέθηκε επιτυχώς!');
        setApiKey(''); setOrgId(''); setOrgSlug('');
        await loadSettings();
      } else {
        setMsg(d.error || 'Σφάλμα σύνδεσης');
      }
    } catch { setMsg('Network error'); }
    setBusy(false);
  }

  async function handleSaveDefaults() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/elorus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveDefaults',
          defaultDocType, defaultTaxId, defaultMyDataType,
          defaultClassCategory, defaultClassType,
          aadeUsername, aadePassword: aadePassword || undefined, aadeAfm,
        }),
      });
      const d = await res.json();
      setMsg(d.ok ? 'Αποθηκεύτηκε!' : (d.error || 'Σφάλμα'));
    } catch { setMsg('Network error'); }
    setBusy(false);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleRefresh() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/elorus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });
      const d = await res.json();
      if (d.ok) {
        setData(prev => prev ? { ...prev, docTypes: d.docTypes, taxes: d.taxes } : prev);
        setMsg('Ανανεώθηκε!');
      } else { setMsg(d.error || 'Σφάλμα'); }
    } catch { setMsg('Network error'); }
    setBusy(false);
    setTimeout(() => setMsg(''), 3000);
  }

  async function handleDisconnect() {
    if (!confirm('Αποσύνδεση Elorus; Τα υπάρχοντα τιμολόγια δεν επηρεάζονται.')) return;
    setBusy(true);
    await fetch('/api/elorus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    setData(null);
    setBusy(false);
    await loadSettings();
  }

  if (!loaded) return (
    <Section icon="fa-file-invoice-dollar" iconColor="#4f46e5" title="ELORUS — ΤΙΜΟΛΟΓΗΣΗ">
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Φόρτωση...</p>
    </Section>
  );

  const connected = data?.configured;
  const docTypes = (data?.docTypes || []) as ElorusDocType[];
  const taxes = (data?.taxes || []) as ElorusTax[];

  return (
    <Section icon="fa-file-invoice-dollar" iconColor="#4f46e5" title="ELORUS — ΤΙΜΟΛΟΓΗΣΗ">
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
        Σύνδεση με <a href="https://www.elorus.com" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Elorus</a> για αυτόματη έκδοση τιμολογίων και παραστατικών.
      </p>

      {/* ── Connected state ── */}
      {connected && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', flex: 1 }}>
              Συνδεδεμένο{data?.orgName ? ` — ${data.orgName}` : ''}
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{data?.apiKeyMasked}</span>
            <button onClick={handleDisconnect} disabled={busy} style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
              background: 'transparent', color: '#ef4444', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
            }}>Αποσύνδεση</button>
          </div>

          {/* ── Defaults ── */}
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em' }}>Προεπιλογές Τιμολογίου</span>
              <button onClick={handleRefresh} disabled={busy} style={{
                padding: '3px 8px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: '0.6rem', cursor: 'pointer',
              }}><i className="fas fa-sync-alt" style={{ marginRight: 3 }} />Ανανέωση</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Τύπος Παραστατικού">
                <select className={selectCls} value={defaultDocType} onChange={e => setDefaultDocType(e.target.value)}>
                  <option value="">— Επιλέξτε —</option>
                  {docTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.title}</option>)}
                </select>
              </Field>
              <Field label="ΦΠΑ">
                <select className={selectCls} value={defaultTaxId} onChange={e => setDefaultTaxId(e.target.value)}>
                  <option value="">— Επιλέξτε —</option>
                  {taxes.map(tx => <option key={tx.id} value={tx.id}>{tx.title} ({tx.percentage}%)</option>)}
                </select>
              </Field>
              <Field label="MyDATA Τύπος">
                <select className={selectCls} value={defaultMyDataType} onChange={e => setDefaultMyDataType(e.target.value)}>
                  <option value="">— Επιλέξτε —</option>
                  {MYDATA_DOC_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Κατηγορία Χαρακτηρισμού">
                <select className={selectCls} value={defaultClassCategory} onChange={e => setDefaultClassCategory(e.target.value)}>
                  <option value="">— Επιλέξτε —</option>
                  {CLASS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Τύπος Χαρακτηρισμού">
                <select className={selectCls} value={defaultClassType} onChange={e => setDefaultClassType(e.target.value)}>
                  <option value="">— Επιλέξτε —</option>
                  {CLASS_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </div>

            {/* ── AADE credentials ── */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em', display: 'block', marginBottom: 8 }}>
                <i className="fas fa-landmark" style={{ marginRight: 4, color: '#4f46e5' }} />
                ΑΑΔΕ — Αναζήτηση ΑΦΜ
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Field label="Username (myAADE)">
                  <input className={inputCls} value={aadeUsername} onChange={e => setAadeUsername(e.target.value)} placeholder="username" />
                </Field>
                <Field label="Password">
                  <input className={inputCls} type="password" value={aadePassword} onChange={e => setAadePassword(e.target.value)} placeholder="••••••" />
                </Field>
                <Field label="ΑΦΜ Επιχείρησης">
                  <input className={inputCls} value={aadeAfm} onChange={e => setAadeAfm(e.target.value)} placeholder="9 ψηφία" maxLength={9} />
                </Field>
              </div>
              {data?.aadeConfigured && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                  <span style={{ fontSize: '0.62rem', color: 'var(--success)' }}>ΑΑΔΕ ρυθμισμένο</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <button onClick={handleSaveDefaults} disabled={busy} style={{
                padding: '7px 20px', borderRadius: 8, border: 'none',
                background: '#4f46e5', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                opacity: busy ? 0.5 : 1,
              }}>{busy ? 'Αποθήκευση...' : 'Αποθήκευση Προεπιλογών'}</button>
              {msg && <span style={{ fontSize: '0.72rem', color: msg.includes('!') ? 'var(--success)' : '#ef4444', fontWeight: 600 }}>{msg}</span>}
            </div>
          </div>
        </>
      )}

      {/* ── Not connected — connection form ── */}
      {!connected && (
        <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="API Key">
              <input className={inputCls} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="el_live_..." />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="Organization ID">
                <input className={inputCls} value={orgId} onChange={e => setOrgId(e.target.value)} placeholder="org id" />
              </Field>
              <Field label="Organization Slug (προαιρετικό)">
                <input className={inputCls} value={orgSlug} onChange={e => setOrgSlug(e.target.value)} placeholder="typografika" />
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button onClick={handleConnect} disabled={busy} style={{
              padding: '7px 20px', borderRadius: 8, border: 'none',
              background: '#4f46e5', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              opacity: busy ? 0.5 : 1,
            }}>{busy ? 'Σύνδεση...' : 'Σύνδεση με Elorus'}</button>
            {msg && <span style={{ fontSize: '0.72rem', color: msg.includes('!') ? 'var(--success)' : '#ef4444', fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>
      )}
    </Section>
  );
}

// ═══ COURIER SETTINGS ═══
function CourierSettings({ inputCls }: { inputCls: string }) {
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loaded, setLoaded] = useState(false);

  useState(() => {
    fetch('/api/courier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get' }) })
      .then(r => r.json())
      .then(d => {
        setConnected(d.connected);
        setApiKeyMasked(d.apiKeyMasked || '');
        setLoaded(true);
      }).catch(() => setLoaded(true));
  });

  async function handleSave() {
    setBusy(true); setMsg('');
    const res = await fetch('/api/courier', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', apiKey }),
    }).then(r => r.json());
    setBusy(false);
    if (res.ok) { setMsg('Συνδέθηκε!'); setConnected(true); setApiKeyMasked('••••' + apiKey.slice(-4)); setApiKey(''); }
    else setMsg(res.error || 'Σφάλμα');
  }

  async function handleDisconnect() {
    setBusy(true);
    await fetch('/api/courier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
    setConnected(false); setApiKeyMasked(''); setApiKey('');
    setBusy(false); setMsg('');
  }

  if (!loaded) return null;

  return (
    <Section icon="fa-truck" iconColor="#10b981" title="COURIER — ΑΠΟΣΤΟΛΕΣ">
      {connected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-check-circle" style={{ color: 'var(--success)' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>NexDay (Hermes)</span>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{apiKeyMasked}</span>
          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>· Στοιχεία αποστολέα από Προφίλ Εταιρείας</span>
          <button onClick={handleDisconnect} disabled={busy} style={{
            marginLeft: 'auto', border: 'none', background: 'transparent',
            color: '#ef4444', fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600,
          }}>Αποσύνδεση</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Συνδέστε τον λογαριασμό NexDay (Hermes) για αποστολή vouchers. Τα στοιχεία αποστολέα λαμβάνονται από το Προφίλ Εταιρείας.</div>
          <div>
            <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: 2 }}>API Key</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="NexDay Bearer Token" className={inputCls} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={handleSave} disabled={busy || !apiKey} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: apiKey ? 'pointer' : 'not-allowed',
              background: apiKey ? '#10b981' : 'var(--border)', color: '#fff', fontSize: '0.78rem', fontWeight: 600,
              opacity: busy ? 0.5 : 1,
            }}>{busy ? 'Σύνδεση...' : 'Σύνδεση'}</button>
            {msg && <span style={{ fontSize: '0.72rem', color: msg.includes('!') ? 'var(--success)' : '#ef4444', fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>
      )}
    </Section>
  );
}
