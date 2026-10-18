import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Archive, RotateCcw, Trash2, GitPullRequest, Github } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Button, Card } from '../../components/ui';
import QuestionModePicker from '../../components/QuestionModePicker';
import ChallengerToggle from '../../components/ChallengerToggle';
import RemindersToggle from '../../components/RemindersToggle';
import { useAuth } from '../../contexts/AuthContext';
import LevelSlider, { EXPERTISE_LABELS, HUMOR_LABELS, HUMOR_ICONS } from '../../components/LevelSlider';
import Markdown from '../../components/Markdown';
import { notifyError, notifySuccess } from '../../utils/notify';

// Paramètres du projet (refonte UX v5.1) : tout ce qui était empilé en bas de
// l'ancienne page projet — identité, niveaux par défaut, brief, répertoire de
// dev, mémoire brute, membres, archivage, zone de danger.

const inputCls = 'w-full text-sm border border-line rounded-lg px-3 outline-none focus:ring-2 focus:ring-action-border bg-white';

function Section({ title, subtitle, children }) {
  return (
    <Card as="section" className="p-5 space-y-4">
      <div>
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function SaveRow({ saving, saved, error, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" variant="primary" disabled={saving || disabled}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
      {saved && <span className="text-sm font-semibold text-ok" role="status">Enregistré</span>}
      {error && <span className="text-sm font-semibold text-red-700" role="alert">{error}</span>}
    </div>
  );
}

function useSave() {
  const [state, setState] = useState({ saving: false, saved: false, error: '' });
  const run = async (fn) => {
    setState({ saving: true, saved: false, error: '' });
    try { await fn(); setState({ saving: false, saved: true, error: '' }); }
    catch (err) { setState({ saving: false, saved: false, error: err.response?.data?.error || 'Erreur lors de l\u2019enregistrement' }); }
  };
  return [state, run];
}

function parseBriefFields(brief) {
  const objectif = brief?.match(/OBJECTIF\s*:\s*([\s\S]*?)(?=\n\nCONTEXTE|\n\nNOTES|$)/)?.[1]?.trim() || '';
  const contexte = brief?.match(/CONTEXTE\s*:\s*([\s\S]*?)(?=\n\nOBJECTIF|\n\nNOTES|$)/)?.[1]?.trim() || '';
  const notes    = brief?.match(/NOTES\s*:\s*([\s\S]*?)(?=\n\nOBJECTIF|\n\nCONTEXTE|$)/)?.[1]?.trim() || '';
  return { objectif, contexte, notes };
}

function IdentitySection({ project, setProject, canEdit }) {
  const [f, setF] = useState({
    name: project.name, description: project.description || '',
    expertiseLevel: project.expertiseLevel || 3, humorLevel: project.humorLevel || 2,
    questionMode: project.questionMode || 'balanced',
    challengerEnabled: project.challengerEnabled !== false,
    remindersEnabled: !!project.remindersEnabled,
    missionsMonthlyBudgetUSD: project.missionsMonthlyBudgetUSD ?? 5,
  });
  const { user } = useAuth();
  const [st, run] = useSave();
  const submit = e => { e.preventDefault(); run(async () => {
    const { data } = await api.patch(`/projects/${project.id}`, f);
    setProject(p => ({ ...p, ...data }));
  }); };
  return (
    <Section title="Projet et réglages par défaut" subtitle="Les niveaux s'appliquent aux nouvelles réunions ; chaque réunion peut les ajuster.">
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={!canEdit} className="space-y-4">
          <div>
            <label htmlFor="p-name" className="block text-sm font-bold text-ink-soft mb-1">Nom</label>
            <input id="p-name" required value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))} className={`${inputCls} h-11`} />
          </div>
          <div>
            <label htmlFor="p-desc" className="block text-sm font-bold text-ink-soft mb-1">Description</label>
            <textarea id="p-desc" rows={2} value={f.description} onChange={e => setF(v => ({ ...v, description: e.target.value }))} className={`${inputCls} py-2 resize-none`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <LevelSlider label="Maîtrise du sujet" value={f.expertiseLevel} onChange={v => setF(x => ({ ...x, expertiseLevel: v }))} labels={EXPERTISE_LABELS} />
            <LevelSlider label="Humour" value={f.humorLevel} onChange={v => setF(x => ({ ...x, humorLevel: v }))} labels={HUMOR_LABELS} icons={HUMOR_ICONS} />
          </div>
          <QuestionModePicker value={f.questionMode} onChange={v => setF(x => ({ ...x, questionMode: v }))} />
          <ChallengerToggle checked={f.challengerEnabled} onChange={v => setF(x => ({ ...x, challengerEnabled: v }))} disabled={!canEdit} />
          <RemindersToggle checked={f.remindersEnabled} onChange={v => setF(x => ({ ...x, remindersEnabled: v }))} reminderDay={user?.reminderDay} disabled={!canEdit} />
          <label className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line p-3.5">
            <span className="flex-1 min-w-[220px]">
              <span className="block text-sm font-extrabold text-ink">Budget mensuel des missions des assistants</span>
              <span className="block text-xs text-ink-muted mt-0.5">Plafond de dépense par mois pour les travaux confiés à des assistants dédiés (recherche, analyse, rédaction). 0 pour les désactiver.</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <input type="number" min="0" max="100" step="0.5" value={f.missionsMonthlyBudgetUSD} aria-label="Budget mensuel des missions (dollars)"
                onChange={e => setF(x => ({ ...x, missionsMonthlyBudgetUSD: e.target.value === '' ? '' : Number(e.target.value) }))}
                className={`${inputCls} h-10 !w-24 text-right`} /> $
            </span>
          </label>
        </fieldset>
        {canEdit && <SaveRow {...st} disabled={!f.name.trim()} />}
      </form>
    </Section>
  );
}

function BriefSection({ project, setProject, canEdit }) {
  const init = parseBriefFields(project.brief);
  const [f, setF] = useState(init);
  const [st, run] = useSave();
  const submit = e => { e.preventDefault(); run(async () => {
    const { data } = await api.patch(`/projects/${project.id}/brief`, f);
    setProject(p => ({ ...p, ...data }));
  }); };
  const field = (key, label, placeholder, rows) => (
    <div>
      <label htmlFor={`b-${key}`} className="block text-sm font-bold text-ink-soft mb-1">{label}</label>
      <textarea id={`b-${key}`} rows={rows} value={f[key]} placeholder={placeholder}
        onChange={e => setF(v => ({ ...v, [key]: e.target.value }))} className={`${inputCls} py-2 resize-none`} />
    </div>
  );
  return (
    <Section title="Brief" subtitle="Transmis aux assistants au début de chaque réunion. Plus il est précis, moins ils posent de questions.">
      <form onSubmit={submit} className="space-y-3">
        <fieldset disabled={!canEdit} className="space-y-3">
          {field('objectif', 'Objectif principal', 'Que cherchez-vous à accomplir ?', 3)}
          {field('contexte', 'Contexte', 'Pour qui ? Quelles contraintes ?', 3)}
          {field('notes', 'Notes', 'Idées, références, contraintes…', 2)}
        </fieldset>
        {canEdit && <SaveRow {...st} />}
      </form>
    </Section>
  );
}

function DevDirectorySection({ project, setProject, canEdit }) {
  const [val, setVal] = useState(project.devDirectory || '');
  const [st, run] = useSave();
  const submit = e => { e.preventDefault(); run(async () => {
    await api.patch(`/projects/${project.id}`, { devDirectory: val });
    setProject(p => ({ ...p, devDirectory: val.trim() || null }));
  }); };
  return (
    <Section title="Répertoire de développement" subtitle="Utilisé par les prompts Claude Code (commande cd en tête de prompt).">
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="p-dir" className="sr-only">Répertoire</label>
        <input id="p-dir" value={val} disabled={!canEdit} onChange={e => setVal(e.target.value)}
          placeholder="ex. C:\MonProjet ou /home/moi/projet" className={`${inputCls} h-11 font-mono`} />
        {canEdit && <SaveRow {...st} />}
      </form>
    </Section>
  );
}

// Mémoire du projet à deux étages (services/memory.js) : synthèse consolidée (rien n'est
// perdu, chaque point a sa source ; corrigible) + dernières entrées telles quelles
function MemorySection({ project, canEdit, memoryOpen, setMemoryOpen }) {
  const [mem, setMem] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    api.get(`/projects/${project.id}/memory`).then(({ data }) => setMem(data)).catch(() => setMem({ summary: null, recent: project.context || null }));
  }, [project.id, project.context]);
  if (!mem || (!mem.summary && !mem.recent)) return null;

  const fmt = d => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const save = async () => {
    setBusy('save');
    try { const { data } = await api.put(`/projects/${project.id}/memory-summary`, { summary: draft }); setMem(m => ({ ...m, ...data })); setEditing(false); notifySuccess('Synthèse enregistrée : vos corrections seront respectées.'); }
    catch (err) { notifyError(err, 'Synthèse non enregistrée.'); } finally { setBusy(''); }
  };
  const rebuild = async () => {
    const msg = mem.editedAt
      ? 'Reprendre tout l’historique (réunions conclues, missions) dans la synthèse ? Vos corrections sont conservées. Cela peut prendre une minute.'
      : 'Construire la synthèse à partir de tout l’historique (réunions conclues, missions) ? Cela peut prendre une minute.';
    if (!confirm(msg)) return;
    setBusy('rebuild');
    try { const { data } = await api.post(`/projects/${project.id}/memory/rebuild`, { fromScratch: !mem.editedAt }); setMem(data); notifySuccess('Synthèse à jour.'); }
    catch (err) { notifyError(err, 'La synthèse n’a pas pu être construite.'); } finally { setBusy(''); }
  };

  return (
    <Section title="Mémoire du projet" subtitle="Ce que les assistants retiennent du projet. Les entrées anciennes sont fondues dans la synthèse au lieu d'être oubliées ; chaque point indique sa source. Le registre des décisions et les actions sont gardés à part.">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-extrabold text-ink">Synthèse</p>
          <span className="text-[11px] text-ink-faint">
            {mem.summaryAt ? `Mise à jour le ${fmt(mem.summaryAt)}` : 'Pas encore construite'}{mem.editedAt ? ' · corrigée par vous' : ''}
          </span>
        </div>
        {editing ? (
          <>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={16} aria-label="Synthèse de la mémoire du projet"
              className={`${inputCls} py-2 font-mono text-xs leading-relaxed`} />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={save} disabled={busy === 'save'}>{busy === 'save' ? '…' : 'Enregistrer'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
            </div>
          </>
        ) : mem.summary ? (
          <div tabIndex={0} role="region" aria-label="Synthèse de la mémoire du projet" className="max-h-96 overflow-y-auto bg-canvas rounded-lg p-3 focus:outline focus:outline-2 focus:outline-action"><Markdown size="synthesis">{mem.summary}</Markdown></div>
        ) : (
          <p className="text-xs text-ink-muted">Elle se construit d’elle-même quand la mémoire s’allonge, ou dès maintenant à partir de l’historique.</p>
        )}
        {canEdit && !editing && (
          <div className="flex flex-wrap gap-2">
            {mem.summary && <Button size="sm" variant="secondary" onClick={() => { setDraft(mem.summary); setEditing(true); }}>Corriger</Button>}
            <Button size="sm" variant="ghost" onClick={rebuild} disabled={busy === 'rebuild'}>
              <RotateCcw size={14} aria-hidden="true" /> {busy === 'rebuild' ? 'Construction…' : mem.summary ? 'Reprendre tout l’historique' : 'Construire depuis l’historique'}
            </Button>
          </div>
        )}
      </div>
      {mem.recent && (
        <div className="space-y-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setMemoryOpen(o => !o)}>{memoryOpen ? 'Masquer' : 'Afficher'} les dernières entrées</Button>
          {memoryOpen && (
            <pre className="text-xs text-ink-muted whitespace-pre-wrap font-sans leading-relaxed max-h-72 overflow-y-auto bg-canvas rounded-lg p-3">{mem.recent}</pre>
          )}
        </div>
      )}
    </Section>
  );
}

function MembersSection({ project }) {
  const [members, setMembers] = useState(null);
  const [input, setInput] = useState('');
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => {
    api.get(`/projects/${project.id}/members`).then(({ data }) => setMembers(data)).catch(() => setMembers([]));
  }, [project.id]);

  const invite = async (e) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInviting(true); setResult(null);
    try {
      const { data } = await api.post(`/projects/${project.id}/members`, v.startsWith('@') ? { username: v.slice(1) } : { email: v });
      if (data.type === 'added') {
        setMembers(m => [...m, data.member]);
        setResult({ ok: true, text: `${data.member.username ? '@' + data.member.username : data.member.email} ajouté.` });
      } else {
        setResult({ ok: true, text: `Invitation envoyée à ${data.email}.` });
      }
      setInput('');
    } catch (err) {
      setResult({ ok: false, text: err.response?.data?.error || 'Invitation impossible.' });
    }
    setInviting(false);
  };

  const remove = async (userId) => {
    setRemoving(userId);
    try {
      await api.delete(`/projects/${project.id}/members/${userId}`);
      setMembers(m => m.filter(x => x.userId !== userId));
    } catch (err) {
      setResult({ ok: false, text: err.response?.data?.error || 'Retrait impossible.' });
    }
    setRemoving(null);
  };

  return (
    <Section title="Membres" subtitle="Les personnes qui ont accès au projet.">
      <form onSubmit={invite} className="flex gap-2">
        <label htmlFor="p-invite" className="sr-only">E-mail ou @pseudo</label>
        <input id="p-invite" value={input} onChange={e => { setInput(e.target.value); setResult(null); }}
          placeholder="email@exemple.com ou @pseudo" className={`${inputCls} h-11 flex-1`} />
        <Button type="submit" variant="primary" disabled={inviting || !input.trim()}>{inviting ? '…' : 'Inviter'}</Button>
      </form>
      {result && <p role="status" className={`text-sm font-semibold ${result.ok ? 'text-ok' : 'text-red-700'}`}>{result.text}</p>}
      {members === null ? <p className="text-sm text-ink-faint">Chargement…</p>
        : members.length === 0 ? <p className="text-sm text-ink-faint">Aucun collaborateur pour l'instant.</p>
        : (
          <ul className="divide-y divide-line border border-line rounded-xl">
            {members.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{m.email}{m.username && <span className="ml-1.5 text-xs font-semibold text-ink-faint">@{m.username}</span>}</p>
                  <p className="text-xs text-ink-faint">{m.role}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(m.userId)} disabled={removing === m.userId}>Retirer</Button>
              </li>
            ))}
          </ul>
        )}
    </Section>
  );
}

function ConfirmByName({ project, title, children, confirmLabel, tone, busy, onConfirm, onClose }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <Card className="max-w-md w-full p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-extrabold text-ink">{title}</h3>
        {children}
        <div>
          <label htmlFor="confirm-name" className="block text-sm text-ink-muted mb-1">Pour confirmer, saisissez le nom du projet : <strong className="text-ink">{project.name}</strong></label>
          <input id="confirm-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={project.name} className={`${inputCls} h-11`} />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button variant={tone} className="flex-1" onClick={onConfirm} disabled={busy || name !== project.name}>{busy ? '…' : confirmLabel}</Button>
        </div>
      </Card>
    </div>
  );
}

export default function ProjectSettings() {
  const { project, setProject, canManage, isOwner, refreshCounts } = useProject();
  const navigate = useNavigate();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [modal, setModal] = useState(null); // 'reset' | 'delete'
  const [deleteMilestones, setDeleteMilestones] = useState(true); // v5.1 : repartir d'un nouveau plan par défaut
  // Projet relié à un dépôt : développements en attente (pull request ouverte, échec) et en cours
  const [devInfo, setDevInfo] = useState(null); // { pending, running }
  const [abandonDevs, setAbandonDevs] = useState(true);
  const openReset = () => {
    setDeleteMilestones(false);
    setAbandonDevs(true);
    setDevInfo(null);
    setModal('reset');
    if (project.githubRepo) {
      api.get(`/projects/${project.id}/dev-tasks`)
        .then(({ data }) => setDevInfo({
          pending: data.tasks.filter(t => ['ready', 'deploy_failed', 'failed'].includes(t.status)).length,
          running: data.tasks.filter(t => ['running', 'deploying'].includes(t.status)).length,
        }))
        .catch(() => setDevInfo({ pending: 0, running: 0 })); // facultatif : l'avertissement reste affiché
    }
  };
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const archive = async () => {
    const label = project.status === 'active' ? 'archiver' : 'réactiver';
    if (!window.confirm(`Voulez-vous ${label} ce projet ?`)) return;
    setArchiving(true);
    try {
      const { data } = await api.patch(`/projects/${project.id}/archive`);
      setProject(p => ({ ...p, status: data.status }));
    } catch { setNotice('Opération impossible.'); }
    setArchiving(false);
  };

  const resetMemory = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete(`/projects/${project.id}/memory`, {
        params: { deleteMilestones, ...(project.githubRepo && devInfo?.pending && abandonDevs ? { abandonDevs: true } : {}) },
      });
      setProject(p => ({ ...p, context: null, vision: null, visionStatus: null }));
      setModal(null);
      refreshCounts();
      // Nouveau plan : retour au tableau de bord, où BlabIA le propose aussitôt (v5.1)
      if (deleteMilestones) { navigate(`/projects/${project.id}`, { state: { proposePlan: true } }); setBusy(false); return; }
      setNotice(`Mémoire du projet réinitialisée.${data?.abandonedDevs ? ` ${data.abandonedDevs} développement${data.abandonedDevs > 1 ? 's' : ''} en attente abandonné${data.abandonedDevs > 1 ? 's' : ''} sur GitHub.` : ''}`);
    } catch { setNotice('Erreur lors de la réinitialisation.'); }
    setBusy(false);
  };

  const deleteProject = async () => {
    setBusy(true);
    try {
      await api.delete(`/projects/${project.id}`);
      navigate('/dashboard');
    } catch { setNotice('Erreur lors de la suppression.'); setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Identité du projet, réglages par défaut, membres et actions sensibles." />
      {notice && <p role="status" className="mb-4 text-sm font-semibold text-ink-soft bg-white border border-line rounded-lg px-3 py-2">{notice}</p>}

      <div className="space-y-4">
        <IdentitySection project={project} setProject={setProject} canEdit={canManage} />
        <BriefSection project={project} setProject={setProject} canEdit={canManage} />
        <DevDirectorySection project={project} setProject={setProject} canEdit={canManage} />

        {/* Développements depuis BlabIA (v5.1) : configuration sur la page Développements */}
        {isOwner && (
          <div data-tour="settings-dev">
          <Section title="Développement avec Claude Code" subtitle="Lancer les prompts de vos réunions Claude Code directement depuis BlabIA, sans copier-coller : Claude Code travaille dans le dépôt GitHub du projet, avec votre abonnement Claude.">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-soft flex-1">{project.githubRepo ? <>Dépôt : <strong>{project.githubRepo}</strong></> : 'Aucun dépôt GitHub associé.'}</p>
              <Link to="../developpements" relative="path" className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] text-[13px] font-bold bg-white text-ink-soft border border-line hover:bg-canvas">
                <GitPullRequest size={15} aria-hidden="true" /> {project.githubRepo ? 'Gérer' : 'Configurer'}
              </Link>
            </div>
          </Section>
          </div>
        )}

        <MemorySection project={project} canEdit={canManage} memoryOpen={memoryOpen} setMemoryOpen={setMemoryOpen} />

        {canManage && <MembersSection project={project} />}

        {canManage && (
          <section aria-labelledby="danger" className="border border-red-200 rounded-2xl p-5 space-y-3 bg-white">
            <h2 id="danger" className="text-base font-extrabold text-red-700">Zone sensible</h2>
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <p className="text-sm text-ink-soft flex-1 min-w-[220px]">{project.status === 'active' ? 'Archiver le projet : il sort de votre liste active.' : 'Le projet est archivé.'}</p>
              <Button variant="secondary" onClick={archive} disabled={archiving}><Archive size={15} /> {project.status === 'active' ? 'Archiver' : 'Réactiver'}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <p className="text-sm text-ink-soft flex-1 min-w-[220px]">Réinitialiser la mémoire : repartir de zéro avec le même brief (réunions tenues, décisions, actions, vision et conversation avec le bras droit effacées).</p>
              <Button variant="await" onClick={openReset}><RotateCcw size={15} /> Réinitialiser</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <p className="text-sm text-ink-soft flex-1 min-w-[220px]">Supprimer le projet et toutes ses données. Irréversible.</p>
              <Button variant="danger" onClick={() => setModal('delete')}><Trash2 size={15} /> Supprimer</Button>
            </div>
          </section>
        )}
      </div>

      {modal === 'reset' && (
        <ConfirmByName project={project} title="Réinitialiser la mémoire du projet" confirmLabel="Réinitialiser" tone="await"
          busy={busy} onConfirm={resetMemory} onClose={() => setModal(null)}>
          <ul className="list-disc pl-5 text-sm text-ink-soft space-y-1">
            <li>Effacer la mémoire et le registre des décisions</li>
            <li>Supprimer les réunions tenues (historique, comptes-rendus, livrables)</li>
            <li>Effacer les actions, les missions, « Votre vision » et la conversation avec le bras droit</li>
            <li>Conserver le brief, les documents de référence, les outils et l’équipe</li>
            <li>{deleteMilestones ? 'Supprimer les réunions du plan' : 'Remettre les réunions du plan à « à tenir »'}</li>
          </ul>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-bold text-ink mb-1">Et le plan des réunions ?</legend>
            <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer">
              <input type="radio" name="reset-plan" checked={deleteMilestones} onChange={() => setDeleteMilestones(true)} className="mt-1 accent-await" />
              <span><strong className="text-ink">Repartir d’un nouveau plan</strong><span className="block text-xs text-ink-faint">BlabIA vous en propose un aussitôt, à partir du brief.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer">
              <input type="radio" name="reset-plan" checked={!deleteMilestones} onChange={() => setDeleteMilestones(false)} className="mt-1 accent-await" />
              <span><strong className="text-ink">Garder le plan actuel</strong><span className="block text-xs text-ink-faint">Ses réunions redeviennent « à tenir ».</span></span>
            </label>
          </fieldset>
          {project.githubRepo && (
            <div className="rounded-xl border border-await-border bg-await-bg px-3.5 py-3 space-y-2">
              <p className="text-sm font-bold text-await flex items-center gap-1.5"><Github size={15} aria-hidden="true" /> Le site lui-même n’est pas réinitialisé</p>
              <ul className="list-disc pl-5 text-xs text-ink-soft space-y-0.5">
                <li>Le code reste dans le dépôt {project.githubRepo} : les prochains développements partiront du site actuel.</li>
                <li>Le site en ligne, sa base de données et les outils mis en place (hébergeur, nom de domaine…) restent en service.</li>
                <li>Les assistants recevront une note : un site existe déjà, ils liront son code avant de décider.</li>
              </ul>
              <p className="text-xs text-ink-muted">Pour repartir d’une page blanche, créez plutôt un nouveau projet « Site web à créer de zéro » : BlabIA lui crée un dépôt neuf.</p>
              {devInfo?.running > 0 && (
                <p className="text-xs font-bold text-await">Un développement est en cours : il continuera sur GitHub. Attendez sa fin ou abandonnez-le depuis Développements.</p>
              )}
              {devInfo?.pending > 0 && (
                <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer">
                  <input type="checkbox" checked={abandonDevs} onChange={e => setAbandonDevs(e.target.checked)} className="mt-1 accent-await" />
                  <span>Abandonner {devInfo.pending === 1 ? 'le développement en attente' : `les ${devInfo.pending} développements en attente`}
                    <span className="block text-xs text-ink-faint">Leurs modifications proposées sont fermées sur GitHub ; sinon elles pourraient entrer en conflit avec les prochains développements.</span></span>
                </label>
              )}
            </div>
          )}
        </ConfirmByName>
      )}
      {modal === 'delete' && (
        <ConfirmByName project={project} title="Supprimer le projet" confirmLabel="Supprimer définitivement" tone="danger"
          busy={busy} onConfirm={deleteProject} onClose={() => setModal(null)}>
          <p className="text-sm text-red-700">Le projet « {project.name} » et toutes ses réunions seront supprimés définitivement.</p>
        </ConfirmByName>
      )}
    </>
  );
}
