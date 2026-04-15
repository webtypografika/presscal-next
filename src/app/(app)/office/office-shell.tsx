'use client';

import { useState, useRef, useEffect } from 'react';
import {
  getItems, createProject, updateProject, deleteProject,
  createItem, updateItem, deleteItem, toggleItem,
  linkEmailToItem, unlinkEmailFromItem,
} from './actions';

// ─── TYPES ───

type Project = {
  id: string; title: string; color: string | null; icon: string | null;
  archived: boolean; sortOrder: number;
  _count: { items: number };
};

type ChecklistItem = { text: string; done: boolean };

type ItemData = {
  id: string; title: string; notes: string | null; tags: string[];
  priority: string; deadline: string | null;
  completed: boolean; completedAt: string | null;
  checklist: ChecklistItem[] | null;
  companyId: string | null; contactId: string | null;
  linkedEmails: string[];
  company: { id: string; name: string } | null;
  contact: { id: string; name: string } | null;
  calendarEvents: { id: string; title: string; startAt: string; type: string; completed: boolean }[];
  sortOrder: number; createdAt: string;
};

type PickerOption = { id: string; name: string };

// ─── COLORS ───

const PROJECT_COLORS = ['#f58220', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#6366f1', '#ec4899'];

const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444',
};

// ─── COMPONENT ───

export default function OfficeShell({ initialProjects, companies, contacts }: {
  initialProjects: Project[];
  companies: PickerOption[];
  contacts: PickerOption[];
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjects.find(p => !p.archived)?.id || null);
  const [items, setItems] = useState<ItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const newProjectRef = useRef<HTMLInputElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  // Load items when project changes
  useEffect(() => {
    if (!activeProjectId) { setItems([]); return; }
    setLoading(true);
    getItems(activeProjectId).then((data) => {
      setItems(data as unknown as ItemData[]);
      setLoading(false);
    });
  }, [activeProjectId]);

  // Focus new project input
  useEffect(() => { if (showNewProject) newProjectRef.current?.focus(); }, [showNewProject]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeProjects = projects.filter(p => !p.archived);
  const archivedProjects = projects.filter(p => p.archived);

  // ─── PROJECT ACTIONS ───

  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    const proj = await createProject(newProjectTitle.trim(), color);
    setProjects(prev => [...prev, { ...proj, _count: { items: 0 } } as Project]);
    setActiveProjectId(proj.id);
    setNewProjectTitle('');
    setShowNewProject(false);
  };

  const handleArchiveProject = async (id: string) => {
    await updateProject(id, { archived: true });
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: true } : p));
    if (activeProjectId === id) {
      const next = projects.find(p => !p.archived && p.id !== id);
      setActiveProjectId(next?.id || null);
    }
  };

  const handleRestoreProject = async (id: string) => {
    await updateProject(id, { archived: false });
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: false } : p));
    setActiveProjectId(id);
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Διαγραφή project και όλων των items;')) return;
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      const next = projects.find(p => !p.archived && p.id !== id);
      setActiveProjectId(next?.id || null);
    }
  };

  const handleRenameProject = async (id: string) => {
    if (!editTitle.trim()) { setEditingProject(null); return; }
    await updateProject(id, { title: editTitle.trim() });
    setProjects(prev => prev.map(p => p.id === id ? { ...p, title: editTitle.trim() } : p));
    setEditingProject(null);
  };

  // ─── ITEM ACTIONS ───

  const handleCreateItem = async () => {
    if (!newItemTitle.trim() || !activeProjectId) return;
    const item = await createItem(activeProjectId, newItemTitle.trim());
    setItems(prev => [{ ...item, notes: null, tags: [], priority: 'normal', deadline: null, completed: false, completedAt: null, checklist: null, companyId: null, contactId: null, linkedEmails: [], company: null, contact: null, calendarEvents: [], createdAt: item.createdAt.toISOString() } as unknown as ItemData, ...prev]);
    setNewItemTitle('');
    setExpandedItem(item.id);
    // Update project count
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, _count: { items: p._count.items + 1 } } : p));
  };

  const handleToggleItem = async (id: string) => {
    await toggleItem(id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: !i.completed, completedAt: !i.completed ? new Date().toISOString() : null } : i));
  };

  const handleDeleteItem = async (id: string) => {
    await deleteItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, _count: { items: Math.max(0, p._count.items - 1) } } : p));
    if (expandedItem === id) setExpandedItem(null);
  };

  const handleUpdateItem = async (id: string, data: Partial<ItemData>) => {
    const clean: Record<string, unknown> = {};
    if (data.title !== undefined) clean.title = data.title;
    if (data.notes !== undefined) clean.notes = data.notes || null;
    if (data.tags !== undefined) clean.tags = data.tags;
    if (data.priority !== undefined) clean.priority = data.priority;
    if (data.deadline !== undefined) clean.deadline = data.deadline ? new Date(data.deadline) : null;
    if (data.checklist !== undefined) clean.checklist = data.checklist;
    if (data.companyId !== undefined) clean.companyId = data.companyId || null;
    if (data.contactId !== undefined) clean.contactId = data.contactId || null;
    await updateItem(id, clean as any);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...data } : i));
  };

  // ─── CHECKLIST HELPERS ───

  const getChecklist = (item: ItemData): ChecklistItem[] => {
    if (!item.checklist) return [];
    if (Array.isArray(item.checklist)) return item.checklist;
    return [];
  };

  const updateChecklist = (id: string, cl: ChecklistItem[]) => {
    handleUpdateItem(id, { checklist: cl.length > 0 ? cl : null } as any);
  };

  // ─── RENDER ───

  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 140px)', marginTop: -8 }}>

      {/* ═══ LEFT: Project Sidebar ═══ */}
      <div style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.08)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>PROJECTS</span>
          <button onClick={() => setShowNewProject(true)} style={{
            width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem',
          }}><i className="fas fa-plus" /></button>
        </div>

        {/* New project input */}
        {showNewProject && (
          <div style={{ padding: '0 10px 8px' }}>
            <input
              ref={newProjectRef}
              value={newProjectTitle}
              onChange={e => setNewProjectTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false); }}
              onBlur={() => { if (!newProjectTitle.trim()) setShowNewProject(false); }}
              placeholder="Τίτλος project..."
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: '0.75rem',
                border: '1px solid var(--accent)', background: 'rgba(0,0,0,0.2)',
                color: 'var(--text)', outline: 'none',
              }}
            />
          </div>
        )}

        {/* Project list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
          {activeProjects.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveProjectId(p.id)}
              onDoubleClick={() => { setEditingProject(p.id); setEditTitle(p.title); }}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none',
                background: p.id === activeProjectId ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: p.id === activeProjectId ? 'var(--text)' : 'var(--text-dim)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit', textAlign: 'left',
                marginBottom: 2,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#64748b', flexShrink: 0 }} />
              {editingProject === p.id ? (
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameProject(p.id); if (e.key === 'Escape') setEditingProject(null); }}
                  onBlur={() => handleRenameProject(p.id)}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent)',
                    borderRadius: 4, padding: '2px 6px', fontSize: '0.75rem', color: 'var(--text)', outline: 'none',
                  }}
                />
              ) : (
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
              )}
              <span style={{ fontSize: '0.6rem', color: '#64748b', flexShrink: 0 }}>{p._count.items}</span>
            </button>
          ))}

          {/* Archived section */}
          {archivedProjects.length > 0 && (
            <>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#475569', padding: '12px 10px 4px', letterSpacing: '0.05em' }}>
                ΑΡΧΕΙΟ
              </div>
              {archivedProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 7, border: 'none',
                    background: p.id === activeProjectId ? 'rgba(255,255,255,0.04)' : 'transparent',
                    color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.72rem', fontFamily: 'inherit', textAlign: 'left', opacity: 0.6,
                    marginBottom: 2,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#64748b', flexShrink: 0, opacity: 0.4 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  <span style={{ fontSize: '0.6rem' }}>{p._count.items}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ═══ RIGHT: Items ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Project header */}
        {activeProject && (
          <div style={{
            padding: '10px 18px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeProject.color || '#64748b' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 800, flex: 1 }}>{activeProject.title}</h2>
            {activeProject.archived ? (
              <button onClick={() => handleRestoreProject(activeProject.id)} style={{
                padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
              }}><i className="fas fa-undo" style={{ marginRight: 4 }} />Επαναφορά</button>
            ) : (
              <button onClick={() => handleArchiveProject(activeProject.id)} style={{
                padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
              }}><i className="fas fa-archive" style={{ marginRight: 4 }} />Αρχειοθέτηση</button>
            )}
            <button onClick={() => handleDeleteProject(activeProject.id)} style={{
              width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem',
            }}><i className="fas fa-trash" /></button>
          </div>
        )}

        {/* New item input */}
        {activeProject && !activeProject.archived && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={newItemRef}
                value={newItemTitle}
                onChange={e => setNewItemTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateItem(); }}
                placeholder="Νέο item..."
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem',
                  border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)',
                  color: 'var(--text)', outline: 'none',
                }}
              />
              <button onClick={handleCreateItem} disabled={!newItemTitle.trim()} style={{
                padding: '0 16px', borderRadius: 8, border: 'none',
                background: newItemTitle.trim() ? 'var(--accent)' : 'var(--border)',
                color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: newItemTitle.trim() ? 'pointer' : 'default',
              }}><i className="fas fa-plus" style={{ marginRight: 4 }} />Προσθήκη</button>
            </div>
          </div>
        )}

        {/* Items list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Φόρτωση...</div>}

          {!loading && !activeProject && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fas fa-briefcase" style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: '0.85rem' }}>Επιλέξτε ή δημιουργήστε ένα project</p>
            </div>
          )}

          {!loading && activeProject && items.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fas fa-clipboard-list" style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }} />
              <p style={{ fontSize: '0.85rem' }}>Κανένα item. Προσθέστε ένα παραπάνω.</p>
            </div>
          )}

          {items.map(item => {
            const isExpanded = expandedItem === item.id;
            const cl = getChecklist(item);
            const clDone = cl.filter(c => c.done).length;
            const prioColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal;

            return (
              <div key={item.id} style={{
                marginBottom: 6, borderRadius: 10,
                border: `1px solid ${item.completed ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                background: item.completed ? 'rgba(16,185,129,0.03)' : 'rgba(255,255,255,0.02)',
                overflow: 'hidden',
              }}>
                {/* Item row */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                >
                  {/* Checkbox */}
                  <button onClick={e => { e.stopPropagation(); handleToggleItem(item.id); }} style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${item.completed ? 'var(--success)' : 'var(--border)'}`,
                    background: item.completed ? 'var(--success)' : 'transparent',
                    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.55rem',
                  }}>
                    {item.completed && <i className="fas fa-check" />}
                  </button>

                  {/* Title */}
                  <span style={{
                    flex: 1, fontSize: '0.82rem', fontWeight: 600,
                    textDecoration: item.completed ? 'line-through' : 'none',
                    color: item.completed ? 'var(--text-muted)' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{item.title}</span>

                  {/* Priority dot */}
                  {item.priority !== 'normal' && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: prioColor, flexShrink: 0 }} title={item.priority} />
                  )}

                  {/* Tags */}
                  {item.tags.slice(0, 2).map(t => (
                    <span key={t} style={{
                      padding: '1px 6px', borderRadius: 4, fontSize: '0.55rem', fontWeight: 600,
                      background: 'rgba(255,255,255,0.06)', color: '#64748b', flexShrink: 0,
                    }}>#{t}</span>
                  ))}

                  {/* Badges */}
                  {cl.length > 0 && (
                    <span style={{ fontSize: '0.58rem', color: clDone === cl.length ? 'var(--success)' : '#64748b' }}>
                      <i className="fas fa-tasks" style={{ marginRight: 2 }} />{clDone}/{cl.length}
                    </span>
                  )}
                  {item.linkedEmails.length > 0 && (
                    <span style={{ fontSize: '0.58rem', color: '#64748b' }}>
                      <i className="fas fa-envelope" style={{ marginRight: 2 }} />{item.linkedEmails.length}
                    </span>
                  )}
                  {item.calendarEvents.length > 0 && (
                    <span style={{ fontSize: '0.58rem', color: '#64748b' }}>
                      <i className="fas fa-calendar" style={{ marginRight: 2 }} />{item.calendarEvents.length}
                    </span>
                  )}

                  {/* Deadline */}
                  {item.deadline && (
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 600, flexShrink: 0,
                      color: new Date(item.deadline) < new Date() && !item.completed ? '#ef4444' : '#64748b',
                    }}>
                      {new Date(item.deadline).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  )}

                  {/* Expand arrow */}
                  <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: '0.55rem', color: '#475569' }} />
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>

                      {/* Notes */}
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ΣΗΜΕΙΩΣΕΙΣ</label>
                        <textarea
                          value={item.notes || ''}
                          onChange={e => handleUpdateItem(item.id, { notes: e.target.value })}
                          placeholder="Σημειώσεις..."
                          style={{
                            width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, resize: 'vertical',
                            border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)',
                            color: 'var(--text)', fontSize: '0.78rem', outline: 'none',
                          }}
                        />
                      </div>

                      {/* Priority */}
                      <div>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ΠΡΟΤΕΡΑΙΟΤΗΤΑ</label>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {['low', 'normal', 'high', 'urgent'].map(p => (
                            <button key={p} onClick={() => handleUpdateItem(item.id, { priority: p })} style={{
                              flex: 1, padding: '4px 0', borderRadius: 5, fontSize: '0.6rem', fontWeight: 600,
                              border: `1px solid ${item.priority === p ? PRIORITY_COLORS[p] : 'var(--border)'}`,
                              background: item.priority === p ? `${PRIORITY_COLORS[p]}15` : 'transparent',
                              color: item.priority === p ? PRIORITY_COLORS[p] : '#64748b',
                              cursor: 'pointer', textTransform: 'capitalize',
                            }}>{p === 'low' ? 'Low' : p === 'normal' ? 'Mid' : p === 'high' ? 'High' : '!!!'}</button>
                          ))}
                        </div>
                      </div>

                      {/* Deadline */}
                      <div>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>DEADLINE</label>
                        <input
                          type="date"
                          value={item.deadline ? item.deadline.slice(0, 10) : ''}
                          onChange={e => handleUpdateItem(item.id, { deadline: e.target.value || null })}
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem',
                            border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)',
                            color: 'var(--text)', outline: 'none',
                          }}
                        />
                      </div>

                      {/* Tags */}
                      <div>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TAGS</label>
                        <input
                          value={item.tags.join(', ')}
                          onChange={e => handleUpdateItem(item.id, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                          placeholder="tag1, tag2..."
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem',
                            border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)',
                            color: 'var(--text)', outline: 'none',
                          }}
                        />
                      </div>

                      {/* Company */}
                      <div>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--blue)', display: 'block', marginBottom: 4 }}>
                          <i className="fas fa-building" style={{ fontSize: '0.5rem', marginRight: 3 }} />ΕΤΑΙΡΕΙΑ
                        </label>
                        <select
                          value={item.companyId || ''}
                          onChange={e => handleUpdateItem(item.id, { companyId: e.target.value || null } as any)}
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem',
                            border: `1px solid ${item.companyId ? 'color-mix(in srgb, var(--blue) 30%, transparent)' : 'var(--border)'}`,
                            background: item.companyId ? 'color-mix(in srgb, var(--blue) 5%, transparent)' : 'rgba(0,0,0,0.15)',
                            color: 'var(--text)', outline: 'none',
                          }}
                        >
                          <option value="">--</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>

                      {/* Contact */}
                      <div>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--teal)', display: 'block', marginBottom: 4 }}>
                          <i className="fas fa-user" style={{ fontSize: '0.5rem', marginRight: 3 }} />ΕΠΑΦΗ
                        </label>
                        <select
                          value={item.contactId || ''}
                          onChange={e => handleUpdateItem(item.id, { contactId: e.target.value || null } as any)}
                          style={{
                            width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem',
                            border: `1px solid ${item.contactId ? 'color-mix(in srgb, var(--teal) 30%, transparent)' : 'var(--border)'}`,
                            background: item.contactId ? 'color-mix(in srgb, var(--teal) 5%, transparent)' : 'rgba(0,0,0,0.15)',
                            color: 'var(--text)', outline: 'none',
                          }}
                        >
                          <option value="">--</option>
                          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>

                      {/* Checklist */}
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>CHECKLIST</label>
                        {cl.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <button onClick={() => {
                              const updated = [...cl]; updated[i] = { ...c, done: !c.done };
                              updateChecklist(item.id, updated);
                            }} style={{
                              width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                              border: `1.5px solid ${c.done ? 'var(--success)' : 'var(--border)'}`,
                              background: c.done ? 'var(--success)' : 'transparent',
                              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.45rem',
                            }}>
                              {c.done && <i className="fas fa-check" />}
                            </button>
                            <input
                              value={c.text}
                              onChange={e => {
                                const updated = [...cl]; updated[i] = { ...c, text: e.target.value };
                                updateChecklist(item.id, updated);
                              }}
                              style={{
                                flex: 1, padding: '3px 6px', borderRadius: 4, fontSize: '0.72rem',
                                border: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)',
                                color: 'var(--text)', outline: 'none',
                                textDecoration: c.done ? 'line-through' : 'none',
                              }}
                            />
                            <button onClick={() => {
                              updateChecklist(item.id, cl.filter((_, j) => j !== i));
                            }} style={{
                              border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer',
                              fontSize: '0.6rem', padding: '2px 4px',
                            }}><i className="fas fa-times" /></button>
                          </div>
                        ))}
                        <button onClick={() => {
                          updateChecklist(item.id, [...cl, { text: '', done: false }]);
                        }} style={{
                          padding: '4px 10px', borderRadius: 5, border: '1px dashed var(--border)',
                          background: 'transparent', color: 'var(--text-muted)', fontSize: '0.65rem',
                          cursor: 'pointer', fontWeight: 600, width: '100%', marginTop: 2,
                        }}><i className="fas fa-plus" style={{ marginRight: 4, fontSize: '0.55rem' }} />Sub-task</button>
                      </div>

                      {/* Emails */}
                      <div style={{ gridColumn: '1 / -1' }}>
                        <EmailSection
                          itemId={item.id}
                          linkedEmails={item.linkedEmails}
                          onLink={async (msgId, snippet) => {
                            await linkEmailToItem(item.id, msgId);
                            setItems(prev => prev.map(i => i.id === item.id
                              ? { ...i, linkedEmails: [...i.linkedEmails, msgId] }
                              : i
                            ));
                          }}
                          onUnlink={async (msgId) => {
                            await unlinkEmailFromItem(item.id, msgId);
                            setItems(prev => prev.map(i => i.id === item.id
                              ? { ...i, linkedEmails: i.linkedEmails.filter(e => e !== msgId) }
                              : i
                            ));
                          }}
                        />
                      </div>

                      {/* Calendar events */}
                      {item.calendarEvents.length > 0 && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>EVENTS</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {item.calendarEvents.map(ev => (
                              <span key={ev.id} style={{
                                padding: '2px 8px', borderRadius: 4, fontSize: '0.6rem',
                                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                                color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4,
                              }}>
                                <i className="fas fa-calendar" style={{ fontSize: '0.5rem' }} />
                                {ev.title} · {new Date(ev.startAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Delete button */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <button onClick={() => handleDeleteItem(item.id)} style={{
                        padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                        background: 'transparent', color: '#ef4444', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                      }}><i className="fas fa-trash" style={{ marginRight: 4 }} />Διαγραφή</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── EMAIL SECTION ───

type GmailMsg = { id: string; threadId: string; snippet: string; from: string; subject: string; date: string };

function EmailSection({ itemId, linkedEmails, onLink, onUnlink }: {
  itemId: string;
  linkedEmails: string[];
  onLink: (msgId: string, snippet: string) => void;
  onUnlink: (msgId: string) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GmailMsg[]>([]);
  const [searching, setSearching] = useState(false);
  const [emailCache, setEmailCache] = useState<Record<string, GmailMsg>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Load linked email details
  useEffect(() => {
    if (linkedEmails.length === 0) return;
    const missing = linkedEmails.filter(eid => !emailCache[eid]);
    if (missing.length === 0) return;
    // Fetch details for linked emails (API returns GmailFullMessage: {id, from, subject, date, ...})
    Promise.all(missing.map(eid =>
      fetch(`/api/email/messages/${eid}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const cache: Record<string, GmailMsg> = {};
      results.forEach((msg, i) => {
        if (msg) {
          cache[missing[i]] = {
            id: msg.id,
            threadId: msg.threadId || '',
            snippet: msg.textBody?.slice(0, 100) || '',
            from: msg.from || '',
            subject: msg.subject || '',
            date: msg.date || '',
          };
        }
      });
      setEmailCache(prev => ({ ...prev, ...cache }));
    });
  }, [linkedEmails, emailCache]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/email/messages?q=${encodeURIComponent(query)}&maxResults=8`);
      if (res.ok) {
        const data = await res.json();
        setResults((data.messages || []).map((m: any) => {
          const headers = m.payload?.headers || [];
          const from = headers.find((h: any) => h.name === 'From')?.value || '';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          return { id: m.id, threadId: m.threadId, snippet: m.snippet || '', from, subject, date };
        }));
      }
    } catch { /* ignore */ }
    setSearching(false);
  };

  useEffect(() => { if (showSearch) inputRef.current?.focus(); }, [showSearch]);

  const formatFrom = (from: string) => {
    const match = from.match(/^(.+?)\s*</) || from.match(/^(.+)$/);
    return match?.[1]?.replace(/"/g, '').trim().slice(0, 30) || from.slice(0, 30);
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>EMAILS</label>
        <button onClick={() => setShowSearch(!showSearch)} style={{
          border: 'none', background: 'transparent', color: 'var(--blue)', cursor: 'pointer',
          fontSize: '0.58rem', fontWeight: 600, padding: '2px 6px',
        }}>
          <i className={`fas ${showSearch ? 'fa-times' : 'fa-plus'}`} style={{ marginRight: 3 }} />
          {showSearch ? 'Κλείσιμο' : 'Σύνδεση Email'}
        </button>
      </div>

      {/* Linked emails (expandable) */}
      {linkedEmails.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: showSearch ? 8 : 0 }}>
          {linkedEmails.map(eid => (
            <LinkedEmailCard
              key={eid}
              emailId={eid}
              meta={emailCache[eid] || null}
              formatFrom={formatFrom}
              formatDate={formatDate}
              onUnlink={() => onUnlink(eid)}
            />
          ))}
        </div>
      )}

      {/* Search */}
      {showSearch && (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Αναζήτηση email (from, subject...)"
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: '0.72rem',
                border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)',
                color: 'var(--text)', outline: 'none',
              }}
            />
            <button onClick={handleSearch} disabled={searching} style={{
              padding: '0 12px', borderRadius: 6, border: 'none',
              background: 'var(--blue)', color: '#fff', fontSize: '0.68rem', fontWeight: 700,
              cursor: 'pointer', opacity: searching ? 0.5 : 1,
            }}>
              {searching ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-search" />}
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
              {results.filter(r => !linkedEmails.includes(r.id)).map(msg => (
                <button
                  key={msg.id}
                  onClick={() => { onLink(msg.id, msg.snippet); setResults(prev => prev.filter(r => r.id !== msg.id)); }}
                  style={{
                    width: '100%', padding: '8px 10px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.subject || '(χωρίς θέμα)'}
                    </span>
                    <span style={{ fontSize: '0.55rem', color: '#64748b', flexShrink: 0 }}>{formatDate(msg.date)}</span>
                  </div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>{formatFrom(msg.from)}</div>
                  <div style={{ fontSize: '0.55rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.snippet.slice(0, 80)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LINKED EMAIL CARD (click to expand + read body) ───

function LinkedEmailCard({ emailId, meta, formatFrom, formatDate, onUnlink }: {
  emailId: string;
  meta: GmailMsg | null;
  formatFrom: (f: string) => string;
  formatDate: (d: string) => string;
  onUnlink: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; filename: string; mimeType: string; size: number }[]>([]);
  const [loadingBody, setLoadingBody] = useState(false);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (body) return;
    setLoadingBody(true);
    try {
      const res = await fetch(`/api/email/messages/${emailId}`);
      if (res.ok) {
        const data = await res.json();
        setBody(data.htmlBody || data.textBody || '');
        if (data.attachments?.length) setAttachments(data.attachments);
      }
    } catch { /* ignore */ }
    setLoadingBody(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div style={{
      borderRadius: 6, overflow: 'hidden',
      background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
    }}>
      <div
        onClick={handleExpand}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer' }}
      >
        <i className={`fas ${expanded ? 'fa-envelope-open' : 'fa-envelope'}`} style={{ fontSize: '0.55rem', color: 'var(--blue)', flexShrink: 0 }} />
        {meta ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {meta.subject || '(χωρίς θέμα)'}
            </div>
            <div style={{ fontSize: '0.58rem', color: '#64748b' }}>
              {formatFrom(meta.from)} · {formatDate(meta.date)}
            </div>
          </div>
        ) : (
          <span style={{ flex: 1, fontSize: '0.65rem', color: '#64748b' }}>{emailId.slice(0, 16)}...</span>
        )}
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: '0.45rem', color: '#475569', flexShrink: 0 }} />
        <button onClick={e => { e.stopPropagation(); onUnlink(); }} style={{
          border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer',
          fontSize: '0.55rem', padding: '2px 4px', flexShrink: 0,
        }} title="Αποσύνδεση"><i className="fas fa-times" /></button>
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(59,130,246,0.1)',
          padding: '10px 12px', maxHeight: 400, overflowY: 'auto',
          background: 'rgba(255,255,255,0.02)',
        }}>
          {loadingBody ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: '0.72rem' }}>
              <i className="fas fa-spinner fa-spin" /> Φόρτωση...
            </div>
          ) : body ? (
            <>
              <div
                dangerouslySetInnerHTML={{ __html: body }}
                style={{ fontSize: '0.78rem', lineHeight: 1.7, color: 'var(--text-dim)', wordBreak: 'break-word' }}
              />
              {attachments.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(59,130,246,0.1)' }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                    <i className="fas fa-paperclip" style={{ marginRight: 4 }} />ΣΥΝΗΜΜΕΝΑ ({attachments.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {attachments.map(att => (
                      <a
                        key={att.id}
                        href={`/api/email/messages/${emailId}/attachments/${att.id}?filename=${encodeURIComponent(att.filename)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 5,
                          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
                          color: 'var(--blue)', fontSize: '0.65rem', fontWeight: 600, textDecoration: 'none',
                        }}
                      >
                        <i className={`fas ${att.mimeType.startsWith('image/') ? 'fa-image' : att.filename.endsWith('.pdf') ? 'fa-file-pdf' : 'fa-file'}`} style={{ fontSize: '0.55rem' }} />
                        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                        <span style={{ fontSize: '0.55rem', color: '#64748b' }}>{formatSize(att.size)}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Δεν βρέθηκε περιεχόμενο</div>
          )}
        </div>
      )}
    </div>
  );
}
