import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Check, ChevronDown, ChevronUp, CalendarDays, Link2, Bot, Users, FileText } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Button, IconButton, Card, SectionLabel } from '../../components/ui';
import ExportButtons from '../../components/ExportButtons';
import RemindersToggle from '../../components/RemindersToggle';
import { useAuth } from '../../contexts/AuthContext';
import MissionCard from '../../components/MissionCard';
import SummaryDisplayModal from '../../components/SummaryDisplayModal';
import useMissions from '../../hooks/useMissions';
import { formatUSD } from '../../utils/cost';
import { notifySuccess } from '../../utils/notify';

// Actions entre les réunions (v5.1) : proposées à la conclusion des réunions,
// cochées et ordonnées ici par l'humain (l'ordre prime, l'échéance est facultative) ;
// la réunion suivante commence par un point d'avancement.
// Stockées dans TodoItem (routes /todos pour cocher, modifier, supprimer).

const inputCls = 'text-sm text-ink border border-line rounded-[10px] px-3 h-10 outline-none bg-white focus:ring-2 focus:ring-action focus:border-transparent';
const today = () => new Date().toISOString().slice(0, 10);
export const isOverdueAction = a => a.status !== 'done' && a.dueDate && String(a.dueDate).slice(0, 10) < today();
const fmtDue = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

// Confier une action à un agent : mission menée par un sous-agent (recherche, analyse,
// rédaction), avec un plafond de coût ; le rapport rejoint les documents du projet.
const KINDS = [
  { id: 'research', label: 'Recherche', budget: 0.6, re: /^(v[ée]rifier|rechercher|trouver|comparer|identifier|lister|s.informer|chercher)/i },
  { id: 'analysis', label: 'Analyse', budget: 0.4, re: /^(analyser|[ée]valuer|estimer|chiffrer|calculer|auditer)/i },
  { id: 'writing', label: 'Rédaction', budget: 0.3, re: /^(r[ée]diger|[ée]crire|composer|pr[ée]parer un texte|produire)/i },
];
const guessKind = title => (KINDS.find(k => k.re.test(String(title).trim())) || KINDS[0]).id;

function MissionLauncher({ action, agents, budget, onLaunch, onCancel }) {
  const [agentName, setAgentName] = useState(agents[0]?.name || '');
  const [kind, setKind] = useState(guessKind(action.title));
  const [objective, setObjective] = useState([action.title, action.description].filter(Boolean).join('\n'));
  const [deliverable, setDeliverable] = useState('');
  const [cap, setCap] = useState(KINDS.find(k => k.id === guessKind(action.title)).budget);
  const [busy, setBusy] = useState(false);
  const left = budget ? budget.monthlyUSD - budget.spentUSD - budget.reservedUSD : null;
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try { await onLaunch({ agentName, kind, objective, deliverable, budgetUSD: Number(cap) }); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl border border-ai-border bg-ai-bg p-3">
      <p className="text-xs font-extrabold text-ai uppercase tracking-wider">Confier à un agent</p>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-ink-soft flex flex-col gap-1 flex-1 min-w-[160px]">Agent
          <select value={agentName} onChange={e => setAgentName(e.target.value)} className={inputCls}>
            {agents.map(a => <option key={a.agentId || a.id} value={a.name}>{a.name} — {a.role}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-soft flex flex-col gap-1">Nature
          <select value={kind} onChange={e => { setKind(e.target.value); setCap(KINDS.find(k => k.id === e.target.value).budget); }} className={inputCls}>
            {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-soft flex flex-col gap-1 w-28">Plafond ($)
          <input type="number" min="0.1" max="3" step="0.1" value={cap} onChange={e => setCap(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="text-xs text-ink-soft flex flex-col gap-1">Ce que l’agent doit faire
        <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3} className={`${inputCls} h-auto py-2 resize-y`} />
      </label>
      <label className="text-xs text-ink-soft flex flex-col gap-1">Ce que vous attendez en retour (facultatif)
        <input value={deliverable} onChange={e => setDeliverable(e.target.value)} placeholder="Ex. : une note d’une page avec les risques et une recommandation" className={inputCls} />
      </label>
      <p className="text-[11px] text-ink-muted">L’agent travaille seul, sans vous poser de question ; il signale ses hypothèses. Le rapport rejoint les documents du projet ; vous cochez l’action une fois satisfait.{left !== null ? ` Reste ce mois-ci pour les missions : ${formatUSD(Math.max(0, left))}.` : ''}</p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" variant="primary" disabled={busy || !agentName || !objective.trim()}><Bot size={14} aria-hidden="true" /> {busy ? 'Lancement…' : 'Lancer la mission'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  );
}

const MISSION_STATE = {
  queued:  { text: 'Mission en attente', cls: 'text-ai' },
  running: { text: 'Mission en cours', cls: 'text-ai' },
  done:    { text: 'Rapport de mission prêt', cls: 'text-ok' },
  failed:  { text: 'Mission échouée', cls: 'text-await' },
  proposed: { text: 'Mission proposée', cls: 'text-ai' },
};

function ActionItem({ action, rank, onToggle, onSave, onDelete, onMove, agents, budget, onDelegate, onMeeting, onOpenReport }) {
  const [delegating, setDelegating] = useState(false);
  const mission = action.mission;
  const missionActive = mission && ['queued', 'running'].includes(mission.status);
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
            {mission && MISSION_STATE[mission.status] && (
              <span className={`inline-flex items-center gap-1 font-bold ${MISSION_STATE[mission.status].cls}`}>
                <Bot size={12} aria-hidden="true" /> {MISSION_STATE[mission.status].text} ({mission.agentName})
                {mission.status === 'done' && <button type="button" className="underline ml-1" onClick={() => onOpenReport(mission.id)}>Lire</button>}
              </span>
            )}
          </p>
          {/* Traiter l'action autrement qu'à la main : mission d'un agent, ou réunion */}
          {!done && onDelegate && !delegating && !missionActive && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Button size="sm" variant="ghost" className="!h-8 !text-ai hover:!bg-ai-bg" onClick={() => setDelegating(true)} disabled={!agents?.length}>
                <Bot size={14} aria-hidden="true" /> {mission?.status === 'failed' ? 'Relancer une mission' : 'Confier à un agent'}
              </Button>
              <Button size="sm" variant="ghost" className="!h-8" onClick={() => onMeeting(action)}>
                <Users size={14} aria-hidden="true" /> Traiter en réunion
              </Button>
            </div>
          )}
          {delegating && (
            <MissionLauncher action={action} agents={agents} budget={budget} onCancel={() => setDelegating(false)}
              onLaunch={async body => { if (await onDelegate(action, body)) setDelegating(false); }} />
          )}
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
  const missionsApi = useMissions(project.id);
  const shownMissions = missionsApi.missions.filter(m => !['rejected', 'cancelled'].includes(m.status));
  const [report, setReport] = useState(null);
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

  // Agents du projet, pour confier une action en mission
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  useEffect(() => {
    api.get(`/projects/${project.id}/agents`).then(({ data }) => setAgents(data.filter(a => a.enabled !== false))).catch(() => setAgents([]));
  }, [project.id]);
  const delegate = async (action, body) => {
    setError('');
    try {
      await api.post(`/projects/${project.id}/actions/${action.id}/mission`, body);
      notifySuccess('Mission lancée : le rapport arrivera dans les documents du projet.');
      await Promise.all([load(), missionsApi.reload()]);
      return true;
    } catch (err) { setError(err.response?.data?.error || 'La mission n’a pas pu être lancée.'); return false; }
  };
  // Traiter en réunion : nouvelle réunion préremplie avec l'action comme objectif
  const toMeeting = action => navigate(`/projects/${project.id}/meeting/new`, {
    state: { milestoneTitle: [action.title, action.description].filter(Boolean).join(' — '), milestoneType: 'decision' },
  });
  const openReport = id => setReport(missionsApi.missions.find(m => m.id === id) || null);
  // Une mission terminée met à jour l'action correspondante
  const missionKey = missionsApi.missions.map(m => `${m.id}:${m.status}`).join(',');
  useEffect(() => { if (actions) load(); }, [missionKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
                  agents={agents} budget={missionsApi.budget} onDelegate={project.isDemo ? null : delegate} onMeeting={toMeeting} onOpenReport={openReport}
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
                {done.map(a => <ActionItem key={a.id} action={a} onToggle={toggle} onSave={save} onDelete={remove} onOpenReport={openReport} />)}
              </ul>
            )}
          </section>
        )}

        {/* Missions des agents (v5.1) : travaux approfondis menés par des sous-agents */}
        <section data-tour="mission-list" className="space-y-2 pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionLabel className="!text-ai">Missions des agents · {shownMissions.length}</SectionLabel>
            {missionsApi.budget && (
              <span className="text-xs text-ink-faint">
                Ce mois : {formatUSD(missionsApi.budget.spentUSD + missionsApi.budget.reservedUSD)} sur {formatUSD(missionsApi.budget.monthlyUSD)}
              </span>
            )}
          </div>
          {shownMissions.length === 0 ? (
            <p className="text-xs text-ink-faint">Aucune mission. En réunion, un agent peut proposer de confier un travail approfondi (recherche, analyse, rédaction) à un sous-agent ; vous la validez, avec un plafond de coût.</p>
          ) : (
            <ul className="space-y-2">
              {shownMissions.map(m => (
                <li key={m.id}>
                  <MissionCard mission={m} onApprove={missionsApi.approve} onReject={missionsApi.reject}
                    onCancel={missionsApi.cancel} onOpenReport={setReport} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {report && <SummaryDisplayModal title={`Mission — ${report.title}`} content={report.report || ''} onClose={() => setReport(null)} />}
    </>
  );
}
