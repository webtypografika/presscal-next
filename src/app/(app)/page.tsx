/* ─── Dashboard — exact D-hybrid.html replica ─── */

const INBOX = [
  { initials: 'ΔΑ', sender: 'Δημητρίου Α.Ε.', time: '10:24', subject: 'Re: Προσφορά φυλλαδίων A4', preview: 'Καλημέρα, θα ήθελα να αλλάξουμε την ποσότητα σε 10.000 τεμ...', pill: '→ #0152', pillClass: 'orange' },
  { initials: 'ΚΚ', sender: 'Κωνσταντίνου Κ.', time: '09:15', subject: 'Αυτοκόλλητα — ερώτηση για χαρτί', preview: 'Μπορούμε να τα κάνουμε σε διαφανές αντί για λευκό βινύλιο;', pill: 'Νέο', pillClass: 'blue' },
  { initials: 'ΜΔ', sender: 'Μαρίνα Design', time: 'Χθες', subject: 'Αφίσες Α2 — στείλτε proof', preview: 'Θέλω να δω ένα proof πριν προχωρήσετε στην εκτύπωση...' },
  { initials: 'ΛΑ', sender: 'Λογιστικό Αθανασίου', time: 'Χθες', subject: 'Επιστολόχαρτα — νέο λογότυπο', preview: 'Σας στέλνω το νέο λογότυπο σε AI, παρακαλώ αντικαταστήστε...', pill: '→ #0149', pillClass: 'orange' },
];

const QUOTES = [
  { num: '#0152', customer: 'Δημητρίου Α.Ε.', amount: '€1.245', desc: 'Φυλλάδια A4 4χρ. · 5.000 τεμ.', pill: 'Εστάλη', pillClass: 'blue', age: '5 μέρες' },
  { num: '#0150', customer: 'Παπαδόπουλος Γ.', amount: '€95', desc: 'Κάρτες 9×5 2όψ. · 2.000 τεμ.', pill: 'Νέα', pillClass: 'orange', age: '2 μέρες' },
  { num: '#0149', customer: 'Λογιστικό Αθανασίου', amount: '€520', desc: 'Επιστολόχαρτα A4 · 1.000 τεμ.', pill: 'Εστάλη', pillClass: 'blue', age: '3 μέρες' },
  { num: '#0148', customer: 'Μαρίνα Design', amount: '€890', desc: 'Αφίσες Α2 · 50 τεμ.', pill: 'Μερική', pillClass: 'violet', age: '7 μέρες' },
  { num: '#0147', customer: 'Σύλλογος Μαρ.', amount: '€180', desc: 'Αφίσες A3 · 200 τεμ.', pill: 'Εστάλη', pillClass: 'blue', age: '1 μέρα' },
];

const JOBS = [
  { customer: 'Σύλλογος Μαρ.', desc: 'Αφίσες A3 — 200 τεμ.', deadline: 'Σήμερα', urgent: true, stages: [true, true, true, true, 'active'] },
  { customer: 'Δημητρίου Α.Ε.', desc: 'Φυλλάδια A4 — 5.000', deadline: '27/03', urgent: false, stages: [true, true, 'active', false, false] },
  { customer: 'Παπαδόπουλος Γ.', desc: 'Κάρτες 9×5 — 2.000', deadline: '28/03', urgent: false, stages: [true, 'active', false, false, false] },
  { customer: 'Μαρίνα Design', desc: 'Αφίσες Α2 — 50 τεμ.', deadline: '31/03', urgent: false, stages: ['active', false, false, false, false] },
];

const STAGE_NAMES = ['Αρχεία', 'Εκτύπωση', 'Κοπή', 'Φινίρισμα', 'Παράδοση'];

const CAL_EVENTS = [
  { dot: 'var(--danger)', date: '25/03', text: 'Παράδοση: Αφίσες A3 — Σύλλογος' },
  { dot: 'var(--accent)', date: '27/03', text: 'Παράδοση: Φυλλάδια — Δημητρίου' },
  { dot: 'var(--accent)', date: '28/03', text: 'Παράδοση: Κάρτες — Παπαδόπουλος' },
  { dot: 'var(--blue)', date: '31/03', text: 'Παράδοση: Αφίσες Α2 — Μαρίνα' },
];

const pillBg: Record<string, string> = {
  blue: 'rgba(59,130,246,0.15)',
  green: 'rgba(16,185,129,0.15)',
  orange: 'rgba(245,130,32,0.15)',
  violet: 'rgba(124,58,237,0.15)',
};
const pillColor: Record<string, string> = {
  blue: '#60a5fa',
  green: '#34d399',
  orange: '#fb923c',
  violet: '#a78bfa',
};

function Pill({ text, cls }: { text: string; cls: string }) {
  return (
    <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600, alignSelf: 'center', flexShrink: 0, background: pillBg[cls], color: pillColor[cls] }}>
      {text}
    </span>
  );
}

/* ─── Build March 2026 calendar ─── */
function buildCalendar() {
  // March 2026: starts on Sunday (day 0 in JS, day 7 in EU grid)
  const firstDay = new Date(2026, 2, 1).getDay(); // 0=Sun
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Mon-based
  const daysInMonth = 31;
  const eventDays = [25, 27, 28, 31];
  const today = 24;

  const cells: { num: number; empty: boolean; today: boolean; event: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) cells.push({ num: 0, empty: true, today: false, event: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ num: d, empty: false, today: d === today, event: eventDays.includes(d) });
  return cells;
}

export default function DashboardPage() {
  const cells = buildCalendar();

  return (
    <div>

      {/* ROW 1: Emails | Quotes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* ΕΙΣΕΡΧΟΜΕΝΑ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-envelope" style={{ color: 'var(--accent)', fontSize: '0.95rem' }} /> Αδιάβαστα
              <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>4</span>
            </h2>
            <button style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Όλα →</button>
          </div>

          {INBOX.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', transition: 'background 0.2s', borderLeft: '3px solid var(--accent)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'color-mix(in srgb, var(--blue) 15%, transparent)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 700 }}>{m.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{m.sender}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.time}</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subject}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.preview}</div>
              </div>
              {m.pill && <Pill text={m.pill} cls={m.pillClass!} />}
            </div>
          ))}
        </div>

        {/* ΕΚΚΡΕΜΕΙΣ ΠΡΟΣΦΟΡΕΣ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-file-invoice" style={{ color: 'var(--accent)', fontSize: '0.95rem' }} /> Εκκρεμείς Προσφορές
              <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>5</span>
            </h2>
            <button style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Όλες →</button>
          </div>

          {QUOTES.map((q, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', transition: 'background 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)' }}>{q.num}</span>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, flex: 1 }}>{q.customer}</span>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{q.amount}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{q.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                <Pill text={q.pill} cls={q.pillClass} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}><i className="fas fa-clock" style={{ marginRight: 3, fontSize: '0.55rem' }} />{q.age}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROW 2: Jobs | Calendar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>

        {/* ΕΝΕΡΓΕΣ ΕΡΓΑΣΙΕΣ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-tasks" style={{ color: 'var(--accent)', fontSize: '0.95rem' }} /> Ενεργές Εργασίες
              <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>4</span>
            </h2>
            <button style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Πίνακας →</button>
          </div>

          {JOBS.map((j, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', transition: 'background 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{j.customer}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', flex: 1 }}>{j.desc}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: j.urgent ? 'var(--danger)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: j.urgent ? 700 : 400 }}>
                  <i className="fas fa-clock" />{j.deadline}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {j.stages.map((s, si) => {
                  const isDone = s === true;
                  const isActive = s === 'active';
                  return (
                    <div key={si} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{
                        width: '100%', height: 5, borderRadius: 3,
                        background: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                        animation: isActive ? 'jobPulse 2s ease infinite' : undefined,
                      }} />
                      <span style={{
                        fontSize: '0.52rem', fontWeight: isActive ? 700 : 500,
                        color: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--text-muted)',
                      }}>{STAGE_NAMES[si]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ΗΜΕΡΟΛΟΓΙΟ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-calendar-alt" style={{ color: 'var(--accent)', fontSize: '0.95rem' }} /> Μάρτιος 2026
            </h2>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', transition: 'color 0.2s' }}><i className="fas fa-chevron-left" /></button>
              <button style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', transition: 'color 0.2s' }}><i className="fas fa-chevron-right" /></button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', gap: 2 }}>
            {['Δευ','Τρί','Τετ','Πέμ','Παρ','Σάβ','Κυρ'].map(d => (
              <span key={d} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</span>
            ))}
            {cells.map((c, i) => {
              if (c.empty) return <span key={`e${i}`} style={{ opacity: 0 }} />;
              const cls = [c.today ? 'cal-today' : '', c.event ? 'cal-ev' : ''].filter(Boolean).join(' ');
              return (
                <span key={c.num} className={cls || undefined} style={{
                  fontSize: '0.82rem', padding: '8px 0', borderRadius: 6,
                  cursor: 'default', transition: 'background 0.15s',
                  position: c.event ? 'relative' as const : undefined,
                }}>
                  {c.num}
                </span>
              );
            })}
          </div>

          <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-border)', paddingTop: 10 }}>
            {CAL_EVENTS.map((e, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-dim)', padding: '5px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: e.dot }} />
                <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.72rem', minWidth: 42 }}>{e.date}</span>
                {e.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
