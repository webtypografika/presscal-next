/* ─── Dashboard — exact D-hybrid.html replica ─── */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGmailToken, listMessages, type GmailMessageMeta } from '@/lib/gmail';
import { parseAddress, getInitials, timeAgo } from '@/lib/email-utils';
import { prisma } from '@/lib/db';
import { UnreadCard } from './unread-card';

export type UnreadItem = { id: string; initials: string; sender: string; time: string; subject: string; preview: string };

async function fetchUnread(): Promise<UnreadItem[]> {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as Record<string, unknown>)?.id as string;
    if (!userId) return [];
    const token = await getGmailToken(userId);
    if (!token) return [];

    const dismissed = await prisma.dismissedEmail.findMany({
      where: { userId },
      select: { gmailId: true },
    });
    const dismissedIds = new Set(dismissed.map(d => d.gmailId));

    const { messages } = await listMessages(token, { maxResults: 20, labelIds: ['UNREAD', 'INBOX'] });
    return messages
      .filter((m: GmailMessageMeta) => !dismissedIds.has(m.id))
      .slice(0, 6)
      .map((m: GmailMessageMeta) => {
        const { name } = parseAddress(m.from);
        return {
          id: m.id,
          initials: getInitials(name),
          sender: name,
          time: timeAgo(m.date),
          subject: m.subject || '(χωρίς θέμα)',
          preview: m.snippet,
        };
      });
  } catch {
    return [];
  }
}

type QuoteItem = { id: string; num: string; customer: string; amount: string; desc: string; pill: string; pillClass: string; age: string };

const STATUS_PILL: Record<string, { pill: string; cls: string }> = {
  draft: { pill: 'Πρόχειρη', cls: 'orange' },
  sent: { pill: 'Εστάλη', cls: 'blue' },
  approved: { pill: 'Εγκρίθηκε', cls: 'green' },
  partial: { pill: 'Μερική', cls: 'violet' },
  rejected: { pill: 'Απορρίφθηκε', cls: 'orange' },
};

function daysAgo(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Σήμερα';
  if (diff === 1) return '1 μέρα';
  return `${diff} μέρες`;
}

async function fetchPendingQuotes(): Promise<QuoteItem[]> {
  try {
    const session = await getServerSession(authOptions);
    const orgId = (session?.user as Record<string, unknown>)?.orgId as string;
    if (!orgId) return [];

    const quotes = await prisma.quote.findMany({
      where: { orgId, deletedAt: null, status: { in: ['draft', 'sent', 'partial'] } },
      include: { customer: { select: { name: true, email: true } }, company: { select: { name: true, email: true } }, contact: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    return quotes.map(q => {
      const sp = STATUS_PILL[q.status] || STATUS_PILL.draft;
      const emailSender = typeof q.description === 'string' && q.description.startsWith('Email από:') ? q.description.replace('Email από:', '').trim() : null;
      return {
        id: q.id,
        num: q.number,
        customer: (q as any).company?.name ?? (q as any).contact?.name ?? q.customer?.name ?? (q as any).contact?.email ?? (q as any).company?.email ?? q.customer?.email ?? emailSender ?? '—',
        amount: `€${q.grandTotal.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
        desc: q.title || (q.description && !q.description.startsWith('Email από:') ? q.description : '') || '-',
        pill: sp.pill,
        pillClass: sp.cls,
        age: daysAgo(q.createdAt),
      };
    });
  } catch (e) {
    console.error('[dashboard] fetchPendingQuotes error:', e);
    return [];
  }
}

const STAGE_KEYS = ['files', 'printing', 'cutting', 'finishing', 'delivery'];
const STAGE_NAMES = ['Αρχεία', 'Εκτύπωση', 'Κοπή', 'Φινίρισμα', 'Παράδοση'];

type JobItem = { id: string; customer: string; desc: string; deadline: string; urgent: boolean; stages: (boolean | 'active')[] };

function buildStages(jobStage: string | null): (boolean | 'active')[] {
  const idx = STAGE_KEYS.indexOf(jobStage || '');
  if (idx === -1) return [false, false, false, false, false];
  return STAGE_KEYS.map((_, i) => (i < idx ? true : i === idx ? 'active' : false));
}

function formatDeadline(d: Date | null): { text: string; urgent: boolean } {
  if (!d) return { text: '-', urgent: false };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((target.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${-diff}μ πριν!`, urgent: true };
  if (diff === 0) return { text: 'Σήμερα', urgent: true };
  if (diff === 1) return { text: 'Αύριο', urgent: true };
  return { text: d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' }), urgent: false };
}

async function fetchActiveJobs(): Promise<JobItem[]> {
  try {
    const session = await getServerSession(authOptions);
    const orgId = (session?.user as Record<string, unknown>)?.orgId as string;
    if (!orgId) return [];

    const jobs = await prisma.quote.findMany({
      where: { orgId, deletedAt: null, jobStage: { not: null }, status: { notIn: ['completed', 'cancelled', 'rejected'] } },
      include: { customer: { select: { name: true, email: true } }, company: { select: { name: true, email: true } } },
      orderBy: { deadline: 'asc' },
      take: 6,
    });

    return jobs.map(j => {
      const dl = formatDeadline(j.deadline);
      return {
        id: j.id,
        customer: (j as any).company?.name || j.customer?.name || (j as any).company?.email || j.customer?.email || '—',
        desc: j.title || j.description || '-',
        deadline: dl.text,
        urgent: dl.urgent || j.jobPriority === 'urgent' || j.jobPriority === 'rush',
        stages: buildStages(j.jobStage),
      };
    });
  } catch (e) {
    console.error('[dashboard] fetchActiveJobs error:', e);
    return [];
  }
}

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

export default async function DashboardPage() {
  const [inbox, quotes, jobs] = await Promise.all([fetchUnread(), fetchPendingQuotes(), fetchActiveJobs()]);
  const cells = buildCalendar();

  return (
    <div>

      {/* ROW 1: Emails | Quotes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* ΕΙΣΕΡΧΟΜΕΝΑ */}
        <UnreadCard items={inbox} />

        {/* ΕΚΚΡΕΜΕΙΣ ΠΡΟΣΦΟΡΕΣ */}
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-file-invoice" style={{ color: 'var(--accent)', fontSize: '0.95rem' }} /> Εκκρεμείς Προσφορές
              {quotes.length > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{quotes.length}</span>}
            </h2>
            <button style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Όλες →</button>
          </div>

          {quotes.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Καμία εκκρεμής προσφορά</div>
          )}
          {quotes.map((q, i) => (
            <a key={i} href={`/quotes/${q.id}`} style={{ display: 'block', padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', transition: 'background 0.2s', textDecoration: 'none', color: 'inherit' }}>
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
            </a>
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
              {jobs.length > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10 }}>{jobs.length}</span>}
            </h2>
            <button style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Πίνακας →</button>
          </div>

          {jobs.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Καμία ενεργή εργασία</div>
          )}
          {jobs.map((j, i) => (
            <a key={i} href={`/quotes/${j.id}`} style={{ display: 'block', padding: '10px 12px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', transition: 'background 0.2s', textDecoration: 'none', color: 'inherit' }}>
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
            </a>
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
