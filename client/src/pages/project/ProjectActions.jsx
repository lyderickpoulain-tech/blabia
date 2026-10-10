import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, ChevronDown, ChevronUp, CalendarDays, Link2 } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Button, IconButton, Card, SectionLabel } from '../../components/ui';
import ExportButtons from '../../components/ExportButtons';
import RemindersToggle from '../../components/RemindersToggle';
import { useAuth } from '../../contexts/AuthContext';

// Actions entre les réunions (v5.1) : proposées à la conclusion des réunions,
// cochées et ordonnées ici par l'humain (l'ordre prime, l'échéance est facultative) ;
// la réunion suivante commence par un point d'avancement.
// Stockées dans TodoItem (routes /todos pour cocher, modifier, supprimer).

const inputCls = 'text-sm text-ink border border-line rounded-[10px] px-3 h-10 outline-none bg-white focus:ring-2 focus:ring-action focus:border-transparent';
const today = () => new Date().toISOString().slice(0, 10);
export const isOverdueAction = a => a.status !== 'done' && a.dueDate && String(a.dueDate).slice(0, 10) < today();
const fmtDue = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

function ActionItem({ action, rank, onToggle, onSave, onDelete, onMove }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(action.title);
  const [due, setDue] = useState(action.dueDate ? String(action.dueDate).slice(0, 10) : '');
  const done = action.status === 'done';
  const late = isOverdueAction(action);

  return (
    <li className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
      late ? 'border-await-border bg-await-bg' : done ? 'border-line bg-canvas' : 'border-line bg-white'
    }`}>
      {rank && (
        <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-full text-xs font-extrabold inline-flex items-center justify-center ${late ? 'bg-await-light text-await' : 'bg-action-light text-action'}`}
          aria-label={`Action ${rank}`}>{rank}</span>
      )}
      <button type="button" onClick={() => onToggle(action)} role="checkbox" aria-checked={done}
        aria-label={done ? 'Marquer comme à faire' : 'Marquer comme faite'}
        className={`mt-0.5 w-6 h-6 shrink-0 rounded-md border-2 inline-flex items-center justify-center transition ${
          done ? 'bg-ok border-ok text-white' : 'border-ink-faint bg-white hover:border-ok'
        }`}>
        {done && <Check size={14} strokeWidth={3} aria-hidden="true" />}
      </button>

      {editing ? (
        <div className="flex-1 flex flex-wrap gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)} aria-label="Action" className={`${inputCls} flex-1 min-w-[200px]`} autoFocus />
          <input type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Échéance" className={inputCls} />
          <Button size="sm" variant="primary" disabled={!title.trim()}
            onClick={async () => { await onSave(action, { title: title.trim(), dueDate: due || null }); setEditing(false); }}>Enregistrer</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{action.title}</p>
          {action.description && <p className="text-xs text-ink-soft mt-0.5">{action.description}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-1">
            {action.dueDate && (
              <span className={`inline-flex items-center gap-1 font-bold ${late ? 'text-await' : 'text-ink-faint'}`}>
                <CalendarDays size={12} aria-hidden="true" /> {late ? 'En retard · ' : ''}{fmtDue(action.dueDate)}
              </span>
            )}
            {action.sessionTask && (
              <span className="inline-flex items-center gap-1 text-ink-faint truncate max-w-[280px]">
                <Link2 size={12} aria-hidden="true" /> {action.sessionTask}
              </span>
            )}
          </p>
        </div>
      )}

      {!editing && (
        <div className="flex shrink-0 -mr-1 -mt-1">
          {onMove && (
            <>
              <IconButton size="sm" label="Monter" disabled={!onMove.up} onClick={onMove.up}><ChevronUp size={16} aria-hidden="true" /></IconButton>
              <IconButton size="sm" label="Descendre" disabled={!onMove.down} onClick={onMove.down}><ChevronDown size={16} aria-hidden="true" /></IconButton>
            </>
          )}
          <IconButton size="sm" label="Modifier" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true" /></IconButton>
          <IconButton size="sm" label="Supprimer" className="hover:!text-red-600"
            onClick={() => { if (confirm('Supprimer cette action ?')) onDelete(action); }}>
            <Trash2 size={15} aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </li>
  );
}

export default function ProjectActions() {
  const { project, setProject, canManage, refreshCounts } = useProject();
  const { user } = useAuth();
  const setReminders = async enabled => {
    setProject(p => ({ ...p, remindersEnabled: enabled }));
    try { await api.patch(`/projects/${project.id}`, { remindersEnabled: enabled }); }
    catch { setProject(p => ({ ...p, remindersEnabled: !enabled })); setError('Réglage des rappels impossible.'); }
  };
  const [actions, setActions] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');
  const [showDone, setShowDone] = useState(false);

  const load = () => api.get(`/projects/${project.id}/actions`)
    .then(({ data }) => { setActions(data); refreshCounts?.(); })
    .catch(() => setError('Impossible de charger les actions.'));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async fn => { setError(''); try { await fn(); await load(); } catch (err) { setError(err.response?.data?.error || 'L’opération a échoué.'); } };
  const toggle = a => run(() => api.patch(`/projects/${project.id}/todos/${a.id}`, { status: a.status === 'done' ? 'todo' : 'done' }));
  const save   = (a, body) => run(() => api.patch(`/projects/${project.id}/todos/${a.id}`, body));
  const remove = a => run(() => api.delete(`/projects/${project.id}/todos/${a.id}`));
  // Réordonne les actions à faire (route /todos/reorder : displayOrder = position)
  const move = (index, delta) => run(() => {
    const ids = open.map(a => a.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setActions(prev => [...ids.map(id => prev.find(a => a.id === id)), ...prev.filter(a => a.status === 'done')]); // affichage immédiat
    return api.patch(`/projects/${project.id}/todos/reorder`, { order: ids });
  });
  const add = () => run(async () => {
    await api.post(`/projects/${project.id}/todos`, { title: newTitle.trim(), dueDate: newDue || null });
    setNewTitle(''); setNewDue(''); setAdding(false);
  });

  const open = (actions || []).filter(a => a.status !== 'done');
  const done = (actions || []).filter(a => a.status === 'done');
  const late = open.filter(isOverdueAction);

  return (
    <>
      <PageHeader title="Actions" subtitle="Ce que vous avez à faire entre deux réunions, dans l'ordre où les mener. BlabIA les propose à la conclusion ; les agents commencent la réunion suivante par un point d'avancement.">
        <ExportButtons pdfPath={`/projects/${project.id}/imprimer/registre`} wordPath={`/projects/${project.id}/export/registry/word`} />
        {!adding && <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Ajouter une action</Button>}
      </PageHeader>

      <div className="space-y-5">
        <div data-tour="act-reminders">
          <RemindersToggle compact checked={!!project.remindersEnabled} onChange={setReminders} reminderDay={user?.reminderDay} disabled={!canManage} />
        </div>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        {adding && (
          <Card className="p-4 border-action-border">
            <form onSubmit={e => { e.preventDefault(); if (newTitle.trim()) add(); }} className="flex flex-wrap gap-2">
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex : Visiter trois locaux à la Croix-Rousse (ajoutée en fin de liste)"
                aria-label="Nouvelle action" className={`${inputCls} flex-1 min-w-[220px]`} autoFocus />
              <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} aria-label="Échéance (facultative)" title="Échéance facultative" className={inputCls} />
              <Button type="submit" size="sm" variant="primary" className="!h-10" disabled={!newTitle.trim()}>Ajouter</Button>
              <Button size="sm" variant="ghost" className="!h-10" onClick={() => setAdding(false)}>Annuler</Button>
            </form>
          </Card>
        )}

        {actions === null && !error && (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
        )}

        {actions && actions.length === 0 && !adding && (
          <Card className="text-center py-12 px-6">
            <p className="text-sm font-bold text-ink mb-1">Aucune action pour l'instant</p>
            <p className="text-sm text-ink-muted">À la conclusion de chaque réunion, BlabIA vous propose les actions à mener d'ici la suivante.</p>
          </Card>
        )}

        {open.length > 0 && (
          <section data-tour="act-list" className="space-y-2">
            <SectionLabel className={late.length ? '!text-await' : ''}>
              À faire · {open.length}{late.length ? ` · dont ${late.length} en retard` : ''}
            </SectionLabel>
            <ul className="space-y-2">
              {open.map((a, i) => (
                <ActionItem key={a.id} action={a} rank={i + 1} onToggle={toggle} onSave={save} onDelete={remove}
                  onMove={open.length > 1 ? { up: i > 0 ? () => move(i, -1) : null, down: i < open.length - 1 ? () => move(i, 1) : null } : null} />
              ))}
            </ul>
          </section>
        )}

        {done.length > 0 && (
          <section className="space-y-2">
            <button type="button" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ok hover:underline">
              <ChevronDown size={14} className={`transition-transform ${showDone ? 'rotate-180' : ''}`} aria-hidden="true" />
              Faites · {done.length}
            </button>
            {showDone && (
              <ul className="space-y-2">
                {done.map(a => <ActionItem key={a.id} action={a} onToggle={toggle} onSave={save} onDelete={remove} />)}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
