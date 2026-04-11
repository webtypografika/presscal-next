'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  createProject, updateProject, deleteProject,
  createItem, updateItem, deleteItem, toggleItem, moveItemToProject,
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
  priority: string; deadline: string | null; projectId: string;
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

export default function OfficeShell({ initialProjects, initialItems, companies, contacts }: {
  initialProjects: Project[];
  initialItems: ItemData[];
  companies: PickerOption[];
  contacts: PickerOption[];
}) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [items, setItems] = useState<ItemData[]>(initialItems);
  const [detailItem, setDetailItem] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [newItemProject, setNewItemProject] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const newProjectRef = useRef<HTMLInputElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  const activeProjects = projects.filter(p => !p.archived);

  useEffect(() => { if (showNewProject) newProjectRef.current?.focus(); }, [showNewProject]);
  useEffect(() => { if (newItemProject) newItemRef.current?.focus(); }, [newItemProject]);

  // ─── DRAG & DROP ───
  const handleDragStart = (e: React.DragEvent, id: string) => { e.dataTransfer.effectAllowed = 'move'; setDragId(id); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = async (e: React.DragEvent, projectId: string) => {
    e.preventDefault();
    if (!dragId) return;
    const item = items.find(i => i.id === dragId);
    if (!item || item.projectId === projectId) { setDragId(null); return; }
    setItems(prev => prev.map(i => i.id === dragId ? { ...i, projectId } : i));
    setDragId(null);
    await moveItemToProject(dragId, projectId);
  };

  // ─── PROJECT ACTIONS ───
  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    const proj = await createProject(newProjectTitle.trim(), color);
    setProjects(prev => [...prev, { ...proj, _count: { items: 0 } } as Project]);
    setNewProjectTitle(''); setShowNewProject(false);
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Διαγραφή project και όλων των items;')) return;
    await deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setItems(prev => prev.filter(i => i.projectId !== id));
  };

  // ─── ITEM ACTIONS ───
  const handleCreateItem = async (projectId: string) => {
    if (!newItemTitle.trim()) return;
    const item = await createItem(projectId, newItemTitle.trim());
    setItems(prev => [{ ...item, projectId, notes: null, tags: [], priority: 'normal', deadline: null, completed: false, completedAt: null, checklist: null, companyId: null, contactId: null, linkedEmails: [], company: null, contact: null, calendarEvents: [], createdAt: item.createdAt.toISOString() } as unknown as ItemData, ...prev]);
    setNewItemTitle(''); setNewItemProject(null);
  };

  const handleToggleItem = async (id: string) => {
    await toggleItem(id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: !i.completed, completedAt: !i.completed ? new Date().toISOString() : null } : i));
  };

  const handleDeleteItem = async (id: string) => {
    await deleteItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (detailItem === id) setDetailItem(null);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', marginTop: -8 }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 800, flex: 1 }}>
          <i className="fas fa-briefcase" style={{ marginRight: 8, color: 'var(--blue)', fontSize: '0.85rem' }} />
          Γραφείο
        </h1>
        {showNewProject ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              ref={newProjectRef}
              value={newProjectTitle}
              onChange={e => setNewProjectTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') { setShowNewProject(false); setNewProjectTitle(''); } }}
              placeholder="Τίτλος project..."
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: '0.75rem',
                border: '1px solid var(--blue)', background: 'rgba(0,0,0,0.2)',
                color: 'var(--text)', outline: 'none', width: 180,
              }}
            />
            <button onClick={handleCreateProject} disabled={!newProjectTitle.trim()} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none',
              background: newProjectTitle.trim() ? 'var(--blue)' : 'var(--border)',
              color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: newProjectTitle.trim() ? 'pointer' : 'default', fontFamily: 'inherit',
            }}>Δημιουργία</button>
            <button onClick={() => { setShowNewProject(false); setNewProjectTitle(''); }} style={{
              border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem',
            }}><i className="fas fa-times" /></button>
          </div>
        ) : (
          <button onClick={() => setShowNewProject(true)} style={{
            padding: '5px 14px', borderRadius: 6, border: 'none',
            background: 'var(--blue)', color: '#fff', fontSize: '0.72rem',
            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <i className="fas fa-plus" style={{ fontSize: '0.55rem' }} />Νέο Project
          </button>
        )}
      </div>

      {/* ═══ KANBAN BOARD ═══ */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: `repeat(${activeProjects.length || 1}, minmax(280px, 1fr))`,
        gap: 10, padding: 12, overflowX: 'auto', overflowY: 'hidden',
        minHeight: 0,
      }}>
        {activeProjects.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
            <div style={{ textAlign: 'center' }}>
              <i className="fas fa-briefcase" style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.2 }} />
              <p style={{ fontSize: '0.85rem' }}>Δημιουργήστε ένα project για να ξεκινήσετε</p>
            </div>
          </div>
        )}

        {activeProjects.map(project => {
          const projItems = items.filter(i => i.projectId === project.id);
          const pendingItems = projItems.filter(i => !i.completed);
          const doneItems = projItems.filter(i => i.completed);

          return (
            <div
              key={project.id}
              onDrop={e => handleDrop(e, project.id)}
              onDragOver={handleDragOver}
              style={{
                borderRadius: 12, border: '1px solid var(--border)',
                background: dragId ? 'rgba(255,255,255,0.02)' : 'transparent',
                display: 'flex', flexDirection: 'column',
                minWidth: 0, overflow: 'hidden', minHeight: 0,
              }}
            >
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: project.color || '#64748b', flexShrink: 0 }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: project.color || 'var(--text)', flex: 1 }}>{project.title}</span>
                <span style={{
                  fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)',
                  background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8,
                }}>{pendingItems.length}</span>
                <button onClick={() => { setNewItemProject(project.id); setNewItemTitle(''); }} style={{
                  width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem',
                }}><i className="fas fa-plus" /></button>
                <button onClick={() => handleDeleteProject(project.id)} style={{
                  width: 22, height: 22, borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', opacity: 0.3,
                }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                ><i className="fas fa-trash" /></button>
              </div>

              {/* New item input (inline) */}
              {newItemProject === project.id && (
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    ref={newItemRef}
                    value={newItemTitle}
                    onChange={e => setNewItemTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateItem(project.id); if (e.key === 'Escape') setNewItemProject(null); }}
                    onBlur={() => { if (!newItemTitle.trim()) setNewItemProject(null); }}
                    placeholder="Νέο item..."
                    style={{
                      width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: '0.75rem',
                      border: `1px solid ${project.color || 'var(--border)'}`, background: 'rgba(0,0,0,0.2)',
                      color: 'var(--text)', outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }} className="custom-scrollbar">
                {pendingItems.map(item => {
                  const cl = getChecklist(item);
                  const clDone = cl.filter(c => c.done).length;
                  const prioColor = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.normal;
                  const overdue = item.deadline && new Date(item.deadline) < new Date() && !item.completed;

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={e => handleDragStart(e, item.id)}
                      onClick={() => setDetailItem(item.id)}
                      style={{
                        padding: '8px 10px', borderRadius: 8, cursor: 'grab',
                        border: `1px solid ${overdue ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                        borderLeft: `3px solid ${prioColor}`,
                        background: overdue ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); handleToggleItem(item.id); }} style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: '1.5px solid var(--border)', background: 'transparent',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.45rem', color: '#fff',
                        }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </span>
                      </div>
                      {/* Badges row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {item.company && (
                          <span style={{ fontSize: '0.58rem', color: 'var(--teal)' }}>
                            <i className="fas fa-building" style={{ marginRight: 2 }} />{item.company.name}
                          </span>
                        )}
                        {cl.length > 0 && (
                          <span style={{ fontSize: '0.55rem', color: clDone === cl.length ? 'var(--success)' : '#64748b' }}>
                            <i className="fas fa-tasks" style={{ marginRight: 2 }} />{clDone}/{cl.length}
                          </span>
                        )}
                        {item.linkedEmails.length > 0 && (
                          <span style={{ fontSize: '0.55rem', color: '#64748b' }}>
                            <i className="fas fa-envelope" style={{ marginRight: 2 }} />{item.linkedEmails.length}
                          </span>
                        )}
                        {item.deadline && (
                          <span style={{ fontSize: '0.58rem', fontWeight: 600, color: overdue ? '#ef4444' : '#64748b', marginLeft: 'auto' }}>
                            <i className="fas fa-clock" style={{ marginRight: 2, fontSize: '0.5rem' }} />
                            {new Date(item.deadline).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                        {item.tags.slice(0, 2).map(t => (
                          <span key={t} style={{ fontSize: '0.5rem', padding: '0 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', color: '#64748b' }}>#{t}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Done items (collapsed) */}
                {doneItems.length > 0 && (
                  <div style={{ fontSize: '0.6rem', color: 'var(--success)', padding: '6px 4px 2px', fontWeight: 600, opacity: 0.6 }}>
                    <i className="fas fa-check-circle" style={{ marginRight: 4 }} />{doneItems.length} ολοκληρωμένα
                  </div>
                )}
                {doneItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setDetailItem(item.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid rgba(16,185,129,0.15)',
                      background: 'rgba(16,185,129,0.03)', opacity: 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); handleToggleItem(item.id); }} style={{
                        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                        border: 'none', background: 'var(--success)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.4rem', color: '#fff',
                      }}><i className="fas fa-check" /></button>
                      <span style={{ fontSize: '0.72rem', textDecoration: 'line-through', color: 'var(--text-muted)' }}>{item.title}</span>
                    </div>
                  </div>
                ))}

                {projItems.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', opacity: 0.4, minHeight: 60 }}>
                    Σύρετε εδώ
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ DETAIL MODAL ═══ */}
      {detailItem && (() => {
        const item = items.find(i => i.id === detailItem);
        if (!item) return null;
        const cl = getChecklist(item);
        return createPortal(
          <div onClick={() => setDetailItem(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: '85vh', overflow: 'auto', background: 'var(--bg-elevated)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }} className="custom-scrollbar">
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button onClick={e => { e.stopPropagation(); handleToggleItem(item.id); }} style={{
                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${item.completed ? 'var(--success)' : 'var(--border)'}`,
                  background: item.completed ? 'var(--success)' : 'transparent',
                  color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem',
                }}>{item.completed && <i className="fas fa-check" />}</button>
                <input
                  value={item.title}
                  onChange={e => handleUpdateItem(item.id, { title: e.target.value })}
                  style={{ flex: 1, fontSize: '1.05rem', fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={() => setDetailItem(null)} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Notes */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ΣΗΜΕΙΩΣΕΙΣ</label>
                  <textarea value={item.notes || ''} onChange={e => handleUpdateItem(item.id, { notes: e.target.value })} placeholder="Σημειώσεις..."
                    style={{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, resize: 'vertical', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', fontSize: '0.78rem', outline: 'none' }} />
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
                        color: item.priority === p ? PRIORITY_COLORS[p] : '#64748b', cursor: 'pointer',
                      }}>{p === 'low' ? 'Low' : p === 'normal' ? 'Mid' : p === 'high' ? 'High' : '!!!'}</button>
                    ))}
                  </div>
                </div>
                {/* Deadline */}
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>DEADLINE</label>
                  <input type="date" value={item.deadline ? item.deadline.slice(0, 10) : ''} onChange={e => handleUpdateItem(item.id, { deadline: e.target.value || null })}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', outline: 'none' }} />
                </div>
                {/* Tags */}
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TAGS</label>
                  <input value={item.tags.join(', ')} onChange={e => handleUpdateItem(item.id, { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="tag1, tag2..."
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', outline: 'none' }} />
                </div>
                {/* Company */}
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ΕΤΑΙΡΕΙΑ</label>
                  <select value={item.companyId || ''} onChange={e => handleUpdateItem(item.id, { companyId: e.target.value || null } as any)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', outline: 'none' }}>
                    <option value="">--</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Contact */}
                <div>
                  <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>ΕΠΑΦΗ</label>
                  <select value={item.contactId || ''} onChange={e => handleUpdateItem(item.id, { contactId: e.target.value || null } as any)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)', color: 'var(--text)', outline: 'none' }}>
                    <option value="">--</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Checklist */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>CHECKLIST</label>
                  {cl.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <button onClick={() => { const u = [...cl]; u[i] = { ...c, done: !c.done }; updateChecklist(item.id, u); }} style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        border: `1.5px solid ${c.done ? 'var(--success)' : 'var(--border)'}`,
                        background: c.done ? 'var(--success)' : 'transparent', color: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.45rem',
                      }}>{c.done && <i className="fas fa-check" />}</button>
                      <input value={c.text} onChange={e => { const u = [...cl]; u[i] = { ...c, text: e.target.value }; updateChecklist(item.id, u); }}
                        style={{ flex: 1, padding: '3px 6px', borderRadius: 4, fontSize: '0.72rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)', color: 'var(--text)', outline: 'none', textDecoration: c.done ? 'line-through' : 'none' }} />
                      <button onClick={() => updateChecklist(item.id, cl.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.6rem', padding: '2px 4px' }}><i className="fas fa-times" /></button>
                    </div>
                  ))}
                  <button onClick={() => updateChecklist(item.id, [...cl, { text: '', done: false }])} style={{
                    padding: '4px 10px', borderRadius: 5, border: '1px dashed var(--border)',
                    background: 'transparent', color: 'var(--text-muted)', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600, width: '100%', marginTop: 2,
                  }}><i className="fas fa-plus" style={{ marginRight: 4, fontSize: '0.55rem' }} />Sub-task</button>
                </div>
                {/* Emails */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <EmailSection
                    itemId={item.id} linkedEmails={item.linkedEmails}
                    onLink={async (msgId) => { await linkEmailToItem(item.id, msgId); setItems(prev => prev.map(i => i.id === item.id ? { ...i, linkedEmails: [...i.linkedEmails, msgId] } : i)); }}
                    onUnlink={async (msgId) => { await unlinkEmailFromItem(item.id, msgId); setItems(prev => prev.map(i => i.id === item.id ? { ...i, linkedEmails: i.linkedEmails.filter(e => e !== msgId) } : i)); }}
                  />
                </div>
              </div>
              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
                <button onClick={() => handleDeleteItem(item.id)} style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'transparent', color: '#ef4444', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                }}><i className="fas fa-trash" style={{ marginRight: 4 }} />Διαγραφή</button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}
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
    // Fetch details for linked emails
    Promise.all(missing.map(eid =>
      fetch(`/api/email/messages/${eid}`).then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const cache: Record<string, GmailMsg> = {};
      results.forEach((msg, i) => {
        if (msg) {
          const headers = msg.payload?.headers || [];
          const from = headers.find((h: any) => h.name === 'From')?.value || '';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          cache[missing[i]] = { id: msg.id, threadId: msg.threadId, snippet: msg.snippet || '', from, subject, date };
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

      {/* Linked emails */}
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

// ─── LINKED EMAIL CARD (expandable with body) ───

function LinkedEmailCard({ emailId, meta, formatFrom, formatDate, onUnlink }: {
  emailId: string;
  meta: GmailMsg | null;
  formatFrom: (f: string) => string;
  formatDate: (d: string) => string;
  onUnlink: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  const handleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (body) return; // already loaded
    setLoadingBody(true);
    try {
      const res = await fetch(`/api/email/messages/${emailId}`);
      if (res.ok) {
        const data = await res.json();
        setBody(data.htmlBody || data.textBody || '');
      }
    } catch { /* ignore */ }
    setLoadingBody(false);
  };

  return (
    <div style={{
      borderRadius: 6, overflow: 'hidden',
      background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
    }}>
      {/* Header row */}
      <div
        onClick={handleExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
          cursor: 'pointer',
        }}
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

      {/* Body */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(59,130,246,0.1)',
          padding: '8px 10px', maxHeight: 300, overflowY: 'auto',
          background: 'rgba(255,255,255,0.03)',
        }}>
          {loadingBody ? (
            <div style={{ textAlign: 'center', padding: 12, color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              <i className="fas fa-spinner fa-spin" />
            </div>
          ) : body ? (
            <div
              dangerouslySetInnerHTML={{ __html: body }}
              style={{
                fontSize: '0.75rem', lineHeight: 1.6, color: 'var(--text-dim)',
                wordBreak: 'break-word',
              }}
            />
          ) : (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Δεν βρέθηκε περιεχόμενο</div>
          )}
        </div>
      )}
    </div>
  );
}
