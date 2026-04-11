'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { GmailMessageMeta, GmailFullMessage, GmailLabel } from '@/lib/gmail';
import { parseAddress, getInitials, avatarColor, timeAgo, formatDate, formatSize, attIconClass } from '@/lib/email-utils';
import { createQuote, updateQuote, linkEmailToQuote, unlinkEmailFromQuote, saveEmailAttachments, getLinkedEmailMap } from '../quotes/actions';
import { linkEmailToItem } from '../office/actions';

// ─── TYPES ───
type Folder = 'inbox' | 'sent' | 'drafts' | 'starred' | 'all';
interface ComposeData { to: string; cc: string; subject: string; body: string; inReplyTo?: string; threadId?: string; mode: 'new' | 'reply' | 'forward'; }

const FOLDERS: { id: Folder; label: string; icon: string; q: string; labelIds?: string[] }[] = [
  { id: 'inbox', label: 'Εισερχομενα', icon: 'fa-inbox', q: '', labelIds: ['INBOX'] },
  { id: 'sent', label: 'Απεσταλμενα', icon: 'fa-paper-plane', q: '', labelIds: ['SENT'] },
  { id: 'drafts', label: 'Προχειρα', icon: 'fa-file-alt', q: '', labelIds: ['DRAFT'] },
  { id: 'starred', label: 'Με αστερι', icon: 'fa-star', q: 'is:starred', labelIds: undefined },
  { id: 'all', label: 'Ολα', icon: 'fa-envelope', q: '', labelIds: undefined },
];

// ─── MAIN COMPONENT ───
export default function EmailClient() {
  const router = useRouter();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<GmailMessageMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GmailFullMessage | null>(null);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeData | null>(null);
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [matchedCustomer, setMatchedCustomer] = useState<any>(null);
  const [linkedEmailMap, setLinkedEmailMap] = useState<Record<string, { number: string; id: string }>>({}); // emailId → { number, id }
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkQuotes, setLinkQuotes] = useState<any[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const linkBtnRef = useRef<HTMLDivElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);
  // Inline link popup (per-row)
  const [rowLinkEmailId, setRowLinkEmailId] = useState<string | null>(null);
  const [rowLinkPos, setRowLinkPos] = useState<{ top: number; left: number } | null>(null);

  // ─── FETCH MESSAGES ───
  const fetchMessages = useCallback(async (f: Folder, q?: string, label?: string | null) => {
    setLoading(true);
    try {
      const folderDef = FOLDERS.find(fd => fd.id === f)!;
      const params = new URLSearchParams();
      params.set('maxResults', '30');
      const queryParts: string[] = [];
      if (folderDef.q) queryParts.push(folderDef.q);
      if (q) queryParts.push(q);
      if (label) params.set('labelIds', label);
      else if (folderDef.labelIds) params.set('labelIds', folderDef.labelIds.join(','));
      if (queryParts.length) params.set('q', queryParts.join(' '));

      const res = await fetch(`/api/email/messages?${params}`);
      const data = await res.json();
      setEmails(data.messages || []);
      setNextPage(data.nextPageToken);
    } catch { setEmails([]); }
    setLoading(false);
  }, []);

  // ─── FETCH DETAIL ───
  const [detailError, setDetailError] = useState<string | null>(null);
  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/email/messages/${id}`);
      if (!res.ok) {
        const text = await res.text();
        try { const j = JSON.parse(text); setDetailError(j.error || `HTTP ${res.status}`); } catch { setDetailError(`HTTP ${res.status}`); }
        setDetail(null);
        return;
      }
      const data = await res.json();
      if (data.error) { setDetailError(data.error); setDetail(null); }
      else setDetail(data);
    } catch (e) { setDetailError((e as Error).message); setDetail(null); }
    setDetailLoading(false);
  }, []);

  // ─── FETCH LABELS ───
  useEffect(() => {
    fetch('/api/email/labels').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setLabels(data.filter((l: GmailLabel) => l.type === 'user'));
    }).catch(() => {});
  }, []);

  // ─── INITIAL LOAD ───
  useEffect(() => { fetchMessages(folder); }, [folder, fetchMessages]);
  useEffect(() => { getLinkedEmailMap().then(setLinkedEmailMap).catch(() => {}); }, []);

  // Close link picker on outside click
  useEffect(() => {
    if (!showLinkPicker) return;
    const handle = (e: MouseEvent) => {
      if (linkBtnRef.current?.contains(e.target as Node)) return;
      if (linkPickerRef.current?.contains(e.target as Node)) return;
      setShowLinkPicker(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showLinkPicker]);

  // Track link picker position (follows button on resize/scroll)
  const [linkPickerPos, setLinkPickerPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!showLinkPicker) { setLinkPickerPos(null); return; }
    const update = () => {
      const r = linkBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 280;
      // Keep within viewport horizontally
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setLinkPickerPos({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showLinkPicker]);

  // ─── SELECT EMAIL ───
  function handleSelect(id: string) {
    setSelectedId(id);
    setMatchedCustomer(null);
    fetchDetail(id);
    // Mark as read locally
    setEmails(prev => prev.map(e => e.id === id ? { ...e, labelIds: e.labelIds.filter(l => l !== 'UNREAD') } : e));
    // Mark as read on Gmail (fire and forget)
    fetch(`/api/email/messages/${id}/read`, { method: 'POST' }).catch(() => {});
  }

  // ─── MATCH CUSTOMER FROM EMAIL SENDER ───
  useEffect(() => {
    if (!detail) return;
    const senderEmail = parseAddress(detail.from).email;
    if (!senderEmail) return;
    setCustomerLoading(true);
    fetch(`/api/email/match-customer?email=${encodeURIComponent(senderEmail)}`)
      .then(r => r.json())
      .then(data => setMatchedCustomer(data.customer))
      .catch(() => setMatchedCustomer(null))
      .finally(() => setCustomerLoading(false));
  }, [detail]);

  // ─── TOGGLE STAR ───
  async function handleToggleStar(emailId: string) {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;
    const isStarred = email.labelIds.includes('STARRED');
    // Optimistic update
    setEmails(prev => prev.map(e => e.id === emailId
      ? { ...e, labelIds: isStarred ? e.labelIds.filter(l => l !== 'STARRED') : [...e.labelIds, 'STARRED'] }
      : e
    ));
    fetch(`/api/email/messages/${emailId}/star`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: !isStarred }),
    }).catch(() => {
      // Revert on error
      setEmails(prev => prev.map(e => e.id === emailId ? email : e));
    });
  }

  // ─── DISMISS ───
  async function handleDismiss(emailId: string) {
    setEmails(prev => prev.filter(e => e.id !== emailId));
    if (selectedId === emailId) { setSelectedId(null); setDetail(null); }
    fetch('/api/email/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gmailId: emailId }),
    }).catch(() => {});
  }

  // ─── LIVE SEARCH (debounced) ───
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchMessages(folder, search, currentLabel);
    }, search ? 500 : 0);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── CHANGE FOLDER ───
  function handleFolder(f: Folder) {
    setFolder(f);
    setSelectedId(null);
    setDetail(null);
    setCurrentLabel(null);
    setSearch('');
  }

  // ─── CHANGE LABEL ───
  function handleLabel(labelId: string) {
    setCurrentLabel(labelId);
    setSelectedId(null);
    setDetail(null);
    fetchMessages('all', search, labelId);
  }

  // ─── COMPOSE ───
  function handleCompose() {
    setCompose({ to: '', cc: '', subject: '', body: '', mode: 'new' });
  }
  function handleReply() {
    if (!detail) return;
    const from = parseAddress(detail.from);
    setCompose({
      to: from.email,
      cc: '',
      subject: detail.subject.startsWith('Re:') ? detail.subject : `Re: ${detail.subject}`,
      body: `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-top:12px;color:#666">${detail.htmlBody || detail.textBody}</div>`,
      inReplyTo: detail.id,
      threadId: detail.threadId,
      mode: 'reply',
    });
  }
  function handleForward() {
    if (!detail) return;
    setCompose({
      to: '',
      cc: '',
      subject: detail.subject.startsWith('Fwd:') ? detail.subject : `Fwd: ${detail.subject}`,
      body: `<br><br>---------- Forwarded message ----------<br>From: ${detail.from}<br>Date: ${formatDate(detail.date)}<br>Subject: ${detail.subject}<br><br>${detail.htmlBody || detail.textBody}`,
      threadId: detail.threadId,
      mode: 'forward',
    });
  }

  // ─── CREATE QUOTE FROM EMAIL ───
  async function handleCreateQuote() {
    if (!detail || creatingQuote) return;
    setCreatingQuote(true);
    try {
      const senderEmail = parseAddress(detail.from).email;
      const senderName = parseAddress(detail.from).name || senderEmail;
      const emailBody = detail.textBody || detail.htmlBody || '';

      // Match contact → company (fast, local DB lookup)
      const matchRes = await fetch(`/api/email/match-customer?email=${encodeURIComponent(senderEmail)}`).then(r => r.json()).catch(() => ({}));
      const companyId = matchRes?.companies?.[0]?.id || undefined;
      const contactId = matchRes?.contact?.id || undefined;

      // Create quote immediately
      const q = await createQuote({
        companyId,
        contactId,
        recipientContactIds: contactId ? [contactId] : undefined,
        title: detail.subject || undefined,
        description: `Email από: ${senderName}`,
      });

      // Link email + auto-save attachments
      await linkEmailToQuote(q.id, detail.id, detail.threadId);
      saveEmailAttachments(q.id, [detail.id]).catch(() => {});

      // Redirect immediately — don't wait for AI
      router.push(`/quotes/${q.id}`);

      // AI parse in background (results will appear when user refreshes or next autosave)
      fetch('/api/ai/parse-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailBody, subject: detail.subject, senderEmail }),
      }).then(r => r.json()).then(aiRes => {
        if (aiRes?.success && aiRes.items?.length > 0) {
          const items = aiRes.items.map((ai: any) => {
            const nameParts = [ai.description || 'Προϊόν'];
            if (ai.dimensions) nameParts.push(ai.dimensions);
            if (ai.colors) nameParts.push(ai.colors);
            const notesParts: string[] = [];
            if (ai.paperType) notesParts.push(`Χαρτί: ${ai.paperType}`);
            if (ai.finishing?.length) notesParts.push(`Φινίρισμα: ${ai.finishing.join(', ')}`);
            if (ai.specialNotes) notesParts.push(ai.specialNotes);
            return {
              id: crypto.randomUUID(), name: nameParts.join(' '), type: 'manual',
              qty: ai.quantity || 1, unit: 'τεμ', unitPrice: 0, finalPrice: 0,
              cost: 0, profit: 0, status: 'pending',
              notes: notesParts.join(' · '), aiParsed: ai,
            };
          });
          updateQuote(q.id, { items, description: aiRes.customerInterpretation || undefined });
        }
      }).catch(() => {});
    } catch (e) {
      alert('Σφάλμα: ' + (e as Error).message);
      setCreatingQuote(false);
    }
  }

  // ─── SEND ───
  async function handleSend(data: ComposeData) {
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.ok) {
        setCompose(null);
        fetchMessages(folder, search, currentLabel);
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      throw e;
    }
  }

  const userLabels = labels.filter(l => l.type === 'user');

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 160px)', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--glass-border)', background: 'var(--bg-surface)', marginLeft: -40, marginRight: -40, width: 'calc(100% + 80px)' }}>

      {/* ═══ SIDEBAR ═══ */}
      <div style={{ width: 160, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '12px 0' }}>
        {/* Compose button */}
        <div style={{ padding: '0 12px', marginBottom: 16 }}>
          <button onClick={handleCompose} style={{
            width: '100%', padding: '9px 0', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: '0.78rem', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 4px 16px rgba(245,130,32,0.3)',
          }}>
            <i className="fas fa-pen" style={{ fontSize: '0.65rem' }} /> Νεο
          </button>
        </div>

        {/* Folders */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
          {FOLDERS.map(f => (
            <button key={f.id} onClick={() => handleFolder(f.id)} style={{
              width: '100%', padding: '6px 12px', border: 'none', textAlign: 'left',
              background: folder === f.id && !currentLabel ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              color: folder === f.id && !currentLabel ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s',
            }}>
              <i className={`fas ${f.icon}`} style={{ width: 14, fontSize: '0.68rem' }} />
              {f.label}
            </button>
          ))}

          {/* Gmail Labels */}
          {userLabels.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 4px', fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>LABELS</div>
              {userLabels.map(l => (
                <button key={l.id} onClick={() => handleLabel(l.id)} style={{
                  width: '100%', padding: '6px 16px', border: 'none', textAlign: 'left',
                  background: currentLabel === l.id ? 'color-mix(in srgb, var(--blue) 10%, transparent)' : 'transparent',
                  color: currentLabel === l.id ? 'var(--blue)' : 'var(--text-muted)',
                  fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <i className="fas fa-tag" style={{ fontSize: '0.6rem' }} />
                  {l.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ═══ EMAIL LIST ═══ */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        {/* Search */}
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 36,
            border: '1px solid var(--glass-border)', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
          }}>
            <i className="fas fa-search" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Αναζητηση email..."
              style={{ border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none', flex: 1 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}>
                <i className="fas fa-times" />
              </button>
            )}
            {loading && <i className="fas fa-spinner fa-spin" style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }} />}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
          {loading && (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ width: 20, height: 20, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', margin: '0 auto' }} />
            </div>
          )}
          {!loading && emails.length === 0 && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fas fa-inbox" style={{ fontSize: '2rem', opacity: 0.2, marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: '0.85rem' }}>Δεν υπαρχουν emails</p>
            </div>
          )}
          {!loading && emails.map(email => {
            const sender = parseAddress(email.from);
            const isSelected = email.id === selectedId;
            const isUnread = email.labelIds.includes('UNREAD');
            const color = avatarColor(sender.email);
            return (
              <div key={email.id} onClick={() => handleSelect(email.id)} style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                background: isSelected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : isUnread ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderLeft: isSelected ? '3px solid var(--accent)' : isUnread ? '3px solid var(--blue)' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.querySelectorAll<HTMLElement>('.email-filter-btn').forEach(b => b.style.opacity = '0.6')}
                onMouseLeave={e => e.currentTarget.querySelectorAll<HTMLElement>('.email-filter-btn').forEach(b => b.style.opacity = '0')}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 800, color: '#fff',
                  }}>{getInitials(sender.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', minWidth: 0 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: isUnread ? 800 : 600, color: isUnread ? 'var(--text)' : 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sender.name}</span>
                        {sender.email && sender.email !== sender.name && <span style={{ fontSize: '0.68rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sender.email}</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSearch(`from:${sender.email}`); }}
                          title={`Emails από ${sender.email}`}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '1px 3px', fontSize: '0.55rem', color: 'var(--text-muted)', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0, borderRadius: 3 }}
                          className="email-filter-btn"
                        >
                          <i className="fas fa-filter" />
                        </button>
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{timeAgo(email.date)}</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', fontWeight: isUnread ? 700 : 500, color: isUnread ? 'var(--text)' : 'var(--text-muted)', margin: '2px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {linkedEmailMap[email.id] && (
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                          {linkedEmailMap[email.id].number}
                        </span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.subject || '(χωρις θεμα)'}</span>
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email.snippet}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleStar(email.id); }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: '0.7rem', color: email.labelIds.includes('STARRED') ? '#facc15' : 'var(--text-muted)', opacity: email.labelIds.includes('STARRED') ? 1 : 0.4, transition: 'all 0.15s' }}
                    >
                      <i className={email.labelIds.includes('STARRED') ? 'fas fa-star' : 'far fa-star'} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setRowLinkEmailId(prev => prev === email.id ? null : email.id);
                        setRowLinkPos({ top: r.bottom + 4, left: Math.min(r.left - 120, window.innerWidth - 300) });
                      }}
                      title="Σύνδεση email σε..."
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: '0.65rem', color: linkedEmailMap[email.id] ? 'var(--accent)' : 'var(--text-muted)', opacity: linkedEmailMap[email.id] ? 0.9 : 0.3, transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.color = 'var(--blue)'; }}
                      onMouseLeave={e => { if (!linkedEmailMap[email.id]) { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                    >
                      <i className="fas fa-link" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDismiss(email.id); }}
                      title="Διαγραφή από την εφαρμογή (παραμένει στο Gmail)"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: '0.65rem', color: 'var(--text-muted)', opacity: 0.3, transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <i className="fas fa-trash" />
                    </button>
                    {isUnread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />}
                    {email.hasAttachments && <i className="fas fa-paperclip" style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }} />}
                  </div>
                </div>
              </div>
            );
          })}
          {nextPage && !loading && (
            <button onClick={() => {/* TODO: load more */}} style={{
              width: '100%', padding: 12, border: 'none', background: 'transparent',
              color: 'var(--blue)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            }}>Φορτωση περισσοτερων...</button>
          )}

          {/* Row-level link popup */}
          {rowLinkEmailId && rowLinkPos && (
            <EmailLinkPopup
              emailId={rowLinkEmailId}
              threadId={emails.find(e => e.id === rowLinkEmailId)?.threadId || ''}
              pos={rowLinkPos}
              onClose={() => setRowLinkEmailId(null)}
              onLinkedToQuote={(emailId, quoteNumber, quoteId) => {
                setLinkedEmailMap(prev => ({ ...prev, [emailId]: { number: quoteNumber, id: quoteId } }));
                setRowLinkEmailId(null);
              }}
              onLinkedToOffice={() => setRowLinkEmailId(null)}
            />
          )}
        </div>
      </div>

      {/* ═══ DETAIL PANE ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedId && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <i className="fas fa-envelope-open" style={{ fontSize: '3rem', opacity: 0.15, marginBottom: 16, display: 'block' }} />
              <p style={{ fontSize: '0.88rem' }}>Επιλεξτε ενα email</p>
            </div>
          </div>
        )}
        {selectedId && detailLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
          </div>
        )}
        {selectedId && detailError && !detailLoading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <div style={{ textAlign: 'center', maxWidth: 400 }}>
              <i className="fas fa-exclamation-triangle" style={{ fontSize: '2rem', color: 'var(--danger)', opacity: 0.5, marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--danger)', marginBottom: 8 }}>Σφαλμα φορτωσης email</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{detailError}</p>
            </div>
          </div>
        )}
        {selectedId && detail && !detailLoading && (
          <>
            {/* Detail header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, flex: 1 }}>{detail.subject || '(χωρις θεμα)'}</h2>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={handleCreateQuote}
                    disabled={creatingQuote}
                    title="Νέα Προσφορά από αυτό το email"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                      color: 'var(--accent)', cursor: creatingQuote ? 'wait' : 'pointer',
                      opacity: creatingQuote ? 0.6 : 1,
                    }}
                  >
                    {creatingQuote ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-file-invoice" />}
                    Προσφορά
                  </button>
                  {/* Link to existing quote / quick access */}
                  {linkedEmailMap[detail?.id] ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <button
                        onClick={() => router.push(`/quotes/${linkedEmailMap[detail.id].id}`)}
                        title="Άνοιγμα προσφοράς"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', borderRadius: '6px 0 0 6px', fontSize: '0.68rem', fontWeight: 700,
                          border: '1px solid color-mix(in srgb, #14b8a6 30%, transparent)',
                          borderRight: 'none',
                          background: 'color-mix(in srgb, #14b8a6 10%, transparent)',
                          color: '#14b8a6', cursor: 'pointer',
                        }}
                      >
                        <i className="fas fa-file-invoice" style={{ fontSize: '0.6rem' }} />
                        {linkedEmailMap[detail.id].number}
                        <i className="fas fa-external-link-alt" style={{ fontSize: '0.5rem', opacity: 0.6 }} />
                      </button>
                      <button
                        onClick={async () => {
                          const linked = linkedEmailMap[detail.id];
                          await unlinkEmailFromQuote(linked.id, detail.id);
                          setLinkedEmailMap(prev => { const next = { ...prev }; delete next[detail.id]; return next; });
                        }}
                        title="Αποσύνδεση από προσφορά"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 28, borderRadius: '0 6px 6px 0', fontSize: '0.6rem',
                          border: '1px solid color-mix(in srgb, #14b8a6 30%, transparent)',
                          background: 'color-mix(in srgb, #14b8a6 10%, transparent)',
                          color: '#14b8a6', cursor: 'pointer', opacity: 0.7,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = '#14b8a6'; }}
                      >
                        <i className="fas fa-unlink" />
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }} ref={linkBtnRef}>
                      <button
                        onClick={async () => {
                          setShowLinkPicker(p => !p);
                          if (!showLinkPicker) {
                            setLinkLoading(true);
                            try {
                              const { getQuotes } = await import('../quotes/actions');
                              const qs = await getQuotes();
                              setLinkQuotes(qs.filter(q => q.status !== 'cancelled').slice(0, 50));
                            } catch {} finally { setLinkLoading(false); }
                          }
                        }}
                        title="Σύνδεση σε υπάρχουσα προσφορά"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600,
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--text-muted)', cursor: 'pointer',
                        }}
                      >
                        <i className="fas fa-link" />
                        Σύνδεση
                      </button>
                      {showLinkPicker && linkPickerPos && createPortal(
                        <div
                          ref={linkPickerRef}
                          style={{
                            position: 'fixed',
                            top: linkPickerPos.top,
                            left: linkPickerPos.left,
                            zIndex: 99999,
                            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            width: 280, maxHeight: 320, overflow: 'hidden',
                          }}
                        >
                          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                            <input
                              autoFocus
                              value={linkSearch}
                              onChange={e => setLinkSearch(e.target.value)}
                              placeholder="Αναζήτηση προσφοράς..."
                              style={{ width: '100%', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit' }}
                            />
                          </div>
                          <div style={{ overflowY: 'auto', maxHeight: 260 }}>
                            {linkLoading ? (
                              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}><i className="fas fa-spinner fa-spin" /></div>
                            ) : linkQuotes
                              .filter(q => !linkSearch || q.number?.toLowerCase().includes(linkSearch.toLowerCase()) || q.title?.toLowerCase().includes(linkSearch.toLowerCase()) || q.company?.name?.toLowerCase().includes(linkSearch.toLowerCase()))
                              .map(q => (
                              <button
                                key={q.id}
                                onClick={async () => {
                                  if (!detail) return;
                                  await linkEmailToQuote(q.id, detail.id, detail.threadId);
                                  saveEmailAttachments(q.id, [detail.id]).catch(() => {});
                                  setLinkedEmailMap(prev => ({ ...prev, [detail.id]: { number: q.number, id: q.id } }));
                                  setShowLinkPicker(false);
                                  setLinkSearch('');
                                }}
                                style={{
                                  display: 'block', width: '100%', padding: '8px 10px', border: 'none',
                                  background: 'transparent', color: 'var(--text)', fontSize: '0.72rem',
                                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{q.number}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  {q.title || q.company?.name || '—'} · {q.grandTotal?.toFixed(2)}€
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>,
                        document.body,
                      )}
                    </div>
                  )}
                  <ActionBtn icon="fa-reply" title="Απαντηση" onClick={handleReply} />
                  <ActionBtn icon="fa-share" title="Προωθηση" onClick={handleForward} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: avatarColor(parseAddress(detail.from).email),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 800, color: '#fff',
                }}>{getInitials(parseAddress(detail.from).name)}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700 }}>{parseAddress(detail.from).name}</p>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Προς: {parseAddress(detail.to).email}
                    {detail.cc ? ` · CC: ${detail.cc}` : ''}
                    <span style={{ marginLeft: 8 }}>{formatDate(detail.date)}</span>
                  </p>
                </div>
                {/* Customer match badge */}
                {matchedCustomer && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8,
                    background: 'color-mix(in srgb, var(--success) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)',
                  }}>
                    <i className="fas fa-user-check" style={{ color: 'var(--success)', fontSize: '0.65rem' }} />
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)' }}>{matchedCustomer.name}</div>
                      {matchedCustomer.company && <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{matchedCustomer.company}</div>}
                      {matchedCustomer.quotes?.length > 0 && (
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {matchedCustomer.quotes.length} προσφορ{matchedCustomer.quotes.length === 1 ? 'ά' : 'ές'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            {detail.attachments.length > 0 && (
              <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {detail.attachments.map((att, i) => (
                  <button key={i} onClick={() => downloadAttachment(detail.id, att.id, att.filename)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6,
                      border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)',
                      color: 'var(--text-dim)', fontSize: '0.72rem', cursor: 'pointer',
                    }}>
                    <i className={`fas ${attIconClass(att.filename)}`} style={{ fontSize: '0.65rem' }} />
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatSize(att.size)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
              {detail.htmlBody ? (
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:14px;color:#1e293b;margin:16px 20px;line-height:1.6}img{max-width:100%}a{color:#3b82f6}blockquote{border-left:2px solid #e2e8f0;margin:8px 0;padding-left:12px;color:#64748b}</style></head><body>${detail.htmlBody}</body></html>`}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <pre style={{ padding: 20, fontSize: '0.85rem', color: 'var(--text-dim)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detail.textBody}</pre>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ COMPOSE OVERLAY ═══ */}
      {compose && <ComposePanel data={compose} onSend={handleSend} onClose={() => setCompose(null)} />}
    </div>
  );
}

// ─── ACTION BUTTON ───
function ActionBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, borderRadius: 8, border: '1px solid var(--glass-border)',
      background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem',
    }}>
      <i className={`fas ${icon}`} />
    </button>
  );
}

// ─── DOWNLOAD ATTACHMENT ───
async function downloadAttachment(messageId: string, attachmentId: string, filename: string) {
  try {
    const res = await fetch(`/api/email/messages/${messageId}/attachments/${attachmentId}`);
    const data = await res.json();
    if (!data.data) return;

    const binary = atob(data.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch { /* download failed */ }
}

// ─── COMPOSE PANEL ───
function ComposePanel({ data, onSend, onClose }: { data: ComposeData; onSend: (d: ComposeData) => Promise<void>; onClose: () => void }) {
  const [to, setTo] = useState(data.to);
  const [cc, setCc] = useState(data.cc);
  const [subject, setSubject] = useState(data.subject);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const inputCls = "h-9 w-full rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

  async function handleSubmit() {
    if (!to.trim()) return;
    setSending(true);
    setError('');
    try {
      const htmlBody = (bodyRef.current?.innerHTML || '') + (data.body || '');
      await onSend({ ...data, to, cc, subject, body: htmlBody });
    } catch (e) {
      setError((e as Error).message);
    }
    setSending(false);
  }

  return createPortal(
    <div style={{ position: 'fixed', bottom: 0, right: 40, zIndex: 200, width: 520 }}>
      <div style={{
        background: 'rgb(20,30,55)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px 12px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', maxHeight: '70vh',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px', background: 'var(--accent)', borderRadius: '12px 12px 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
            {data.mode === 'reply' ? 'Απαντηση' : data.mode === 'forward' ? 'Προωθηση' : 'Νεο Email'}
          </span>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
        </div>

        {/* Fields */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className={inputCls} value={to} onChange={e => setTo(e.target.value)} placeholder="Προς" />
          <input className={inputCls} value={cc} onChange={e => setCc(e.target.value)} placeholder="CC" />
          <input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θεμα" />
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '0 16px', minHeight: 180, maxHeight: 300, overflowY: 'auto' }}>
          <div ref={bodyRef} contentEditable suppressContentEditableWarning
            style={{
              minHeight: 160, padding: 12, borderRadius: 8,
              border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)',
              color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.6,
              outline: 'none', fontFamily: 'inherit',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
          />
          {data.body && (
            <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', fontSize: '0.78rem', color: 'var(--text-muted)', maxHeight: 150, overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: data.body }}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && <span style={{ fontSize: '0.72rem', color: 'var(--danger)', flex: 1 }}>{error}</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Ctrl+Enter</span>
          <button onClick={handleSubmit} disabled={sending || !to.trim()} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
            cursor: 'pointer', opacity: sending ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className="fas fa-paper-plane" style={{ fontSize: '0.7rem' }} />
            {sending ? 'Αποστολη...' : 'Αποστολη'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ═══ EMAIL LINK POPUP (NetHunt-style) ═══

function EmailLinkPopup({ emailId, threadId, pos, onClose, onLinkedToQuote, onLinkedToOffice }: {
  emailId: string; threadId: string;
  pos: { top: number; left: number };
  onClose: () => void;
  onLinkedToQuote: (emailId: string, quoteNumber: string, quoteId: string) => void;
  onLinkedToOffice: () => void;
}) {
  const [tab, setTab] = useState<'quote' | 'office'>('quote');
  const [search, setSearch] = useState('');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [officeProjects, setOfficeProjects] = useState<any[]>([]);
  const [officeItems, setOfficeItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Load data on mount
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [quotesRes, projectsRes] = await Promise.all([
          import('../quotes/actions').then(m => m.getQuotes()),
          import('../office/actions').then(m => m.getProjects()),
        ]);
        setQuotes(quotesRes.filter(q => q.status !== 'cancelled').slice(0, 50));
        setOfficeProjects(projectsRes.filter((p: any) => !p.archived));
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Load items when project selected
  useEffect(() => {
    if (!selectedProject) { setOfficeItems([]); return; }
    import('../office/actions').then(m => m.getItems(selectedProject)).then(items => {
      setOfficeItems(items as any[]);
    });
  }, [selectedProject]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const handleLinkQuote = async (q: any) => {
    await linkEmailToQuote(q.id, emailId, threadId);
    saveEmailAttachments(q.id, [emailId]).catch(() => {});
    onLinkedToQuote(emailId, q.number, q.id);
  };

  const handleLinkOfficeItem = async (itemId: string) => {
    await linkEmailToItem(itemId, emailId);
    onLinkedToOffice();
  };

  const filteredQuotes = quotes.filter(q =>
    !search || q.number?.toLowerCase().includes(search.toLowerCase())
    || q.title?.toLowerCase().includes(search.toLowerCase())
    || q.company?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredItems = officeItems.filter(i =>
    !search || i.title?.toLowerCase().includes(search.toLowerCase())
  );

  return createPortal(
    <div ref={ref} style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
      width: 300, background: 'var(--bg-elevated)',
      border: '1px solid var(--border)', borderRadius: 10,
      boxShadow: '0 12px 36px rgba(0,0,0,0.5)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Σύνδεση email σε...</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}>
          <i className="fas fa-times" />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
        {([
          { id: 'quote' as const, label: 'Προσφορά', icon: 'fa-file-invoice', color: 'var(--accent)' },
          { id: 'office' as const, label: 'Γραφείο', icon: 'fa-briefcase', color: 'var(--blue)' },
        ]).map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }} style={{
            flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
            background: tab === t.id ? `${t.color}10` : 'transparent',
            color: tab === t.id ? t.color : 'var(--text-muted)',
            fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit',
            borderBottom: tab === t.id ? `2px solid ${t.color}` : '2px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            <i className={`fas ${t.icon}`} style={{ fontSize: '0.6rem' }} />{t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '4px 8px' }}>
          <i className="fas fa-search" style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }} />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'quote' ? 'Αναζήτηση προσφοράς...' : 'Αναζήτηση item...'}
            style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: '0.72rem', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}><i className="fas fa-spinner fa-spin" /></div>
        ) : tab === 'quote' ? (
          /* ── Quotes ── */
          filteredQuotes.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Καμία προσφορά</div>
          ) : filteredQuotes.map(q => (
            <button key={q.id} onClick={() => handleLinkQuote(q)} style={{
              width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,130,32,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)' }}>{q.number}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{q.title || q.company?.name || '---'}</div>
            </button>
          ))
        ) : (
          /* ── Office (Projects → Items) ── */
          !selectedProject ? (
            officeProjects.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Κανένα project</div>
            ) : officeProjects.map((p: any) => (
              <button key={p.id} onClick={() => setSelectedProject(p.id)} style={{
                width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#64748b', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>{p.title}</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{p._count?.items || 0} items</div>
                </div>
                <i className="fas fa-chevron-right" style={{ fontSize: '0.5rem', color: '#475569' }} />
              </button>
            ))
          ) : (
            <>
              <button onClick={() => setSelectedProject(null)} style={{
                width: '100%', padding: '6px 12px', border: 'none', borderBottom: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.1)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600,
              }}>
                <i className="fas fa-arrow-left" style={{ fontSize: '0.5rem' }} />
                {officeProjects.find((p: any) => p.id === selectedProject)?.title || 'Πίσω'}
              </button>
              {filteredItems.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>Κανένα item</div>
              ) : filteredItems.map((item: any) => (
                <button key={item.id} onClick={() => handleLinkOfficeItem(item.id)} style={{
                  width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${item.completed ? 'var(--success)' : 'var(--border)'}`,
                    background: item.completed ? 'var(--success)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.45rem',
                  }}>
                    {item.completed && <i className="fas fa-check" />}
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                </button>
              ))}
            </>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}
