import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Circle, AlertTriangle, ExternalLink, Rocket, Play, Github, RefreshCw, ShieldCheck, Database, ChevronDown, ChevronRight, X,
} from 'lucide-react';
import api from '../../utils/api';
import { notifyError, notifySuccess } from '../../utils/notify';
import { startGitHubConnect, useGitHubReturn } from '../../utils/github';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Button, Badge, Card } from '../../components/ui';

// Développements lancés depuis BlabIA (v5.1) : Claude Code travaille dans GitHub
// (abonnement Claude de l'utilisateur), propose une pull request ; « Mettre en ligne »
// sauvegarde la base (si déclarée) puis fusionne. Rien ne part en ligne sans clic.

const STATUS = {
  running:       { label: 'Claude Code travaille…', tone: 'ai' },
  ready:         { label: 'Prêt à relire',          tone: 'await' },
  failed:        { label: 'Échec',                  tone: 'muted' },
  deploying:     { label: 'Mise en ligne…',         tone: 'action' },
  deployed:      { label: 'En ligne',               tone: 'ok' },
  deploy_failed: { label: 'Mise en ligne échouée',  tone: 'await' },
  abandoned:     { label: 'Abandonné',              tone: 'muted' },
};
const POLLING = ['running', 'deploying'];
const fmtDate = d => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Step({ done, warn, title, children }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0 ${done ? 'bg-ok-light text-ok' : warn ? 'bg-await-light text-await' : 'bg-muted-light text-ink-faint'}`}>
        {done ? <Check size={14} strokeWidth={3} aria-label="Fait" /> : warn ? <AlertTriangle size={13} aria-label="À corriger" /> : <Circle size={10} aria-label="À faire" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-ink">{title}</p>
        {children && <div className="text-xs text-ink-muted mt-1 space-y-2">{children}</div>}
      </div>
    </li>
  );
}

const Code = ({ children }) => <code className="px-1.5 py-0.5 rounded bg-canvas border border-line text-[11px] font-mono text-ink break-all">{children}</code>;

// Configuration pas à pas : compte, dépôt, automatisations, abonnement Claude, sauvegarde
function Setup({ project, status, onChange }) {
  const [repos, setRepos] = useState(null);
  const [repo, setRepo] = useState(status.repo || '');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!status.connected || !status.isOwner) return;
    api.get('/github/repos').then(({ data }) => setRepos(data)).catch(err => notifyError(err, 'Impossible de lister vos dépôts GitHub.'));
  }, [status.connected, status.isOwner]);

  const act = async (key, fn) => {
    setBusy(key);
    try { onChange((await fn()).data); } catch (err) { notifyError(err, 'Opération impossible.'); } finally { setBusy(''); }
  };
  const saveRepo = () => act('repo', () => api.put(`/projects/${project.id}/github`, { repo }));
  const install = () => act('install', () => api.post(`/projects/${project.id}/github/install`));
  const recheck = () => act('check', () => api.get(`/projects/${project.id}/github`));

  if (!status.appConfigured) {
    return <Card className="p-5 text-sm text-ink-muted">La connexion GitHub n’est pas encore configurée sur ce serveur BlabIA (réglage de l’administrateur).</Card>;
  }
  if (!status.isOwner) {
    return <Card className="p-5 text-sm text-ink-muted">Seul le propriétaire du projet configure le dépôt et lance les développements (son abonnement Claude et son compte GitHub sont utilisés).</Card>;
  }
  const secretsUrl = status.repo ? `https://github.com/${status.repo}/settings/secrets/actions` : null;
  const backupPartial = status.secrets.db && !status.secrets.backupPassword;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-extrabold text-ink">Configuration</h2>
        <Button size="sm" variant="ghost" onClick={recheck} disabled={!!busy}><RefreshCw size={14} aria-hidden="true" /> Vérifier</Button>
      </div>
      <ol className="space-y-4">
        <Step done={status.connected} title={status.connected ? `Compte GitHub connecté : ${status.githubLogin}` : 'Connecter votre compte GitHub'}>
          {!status.connected && <>
            <p>GitHub vous demandera d’autoriser BlabIA puis de choisir les dépôts auxquels il a accès.</p>
            <Button size="sm" variant="primary" onClick={() => startGitHubConnect(`/projects/${project.id}/developpements`)}><Github size={15} aria-hidden="true" /> Connecter GitHub</Button>
          </>}
        </Step>

        <Step done={status.accessible} warn={!!status.error} title="Choisir le dépôt du projet">
          {status.connected && <>
            {status.error && <p className="text-await font-bold">{status.error}</p>}
            <div className="flex flex-wrap gap-2">
              <select value={repo} onChange={e => setRepo(e.target.value)} aria-label="Dépôt GitHub"
                className="h-9 min-w-[220px] px-2.5 border border-line rounded-[10px] text-sm text-ink bg-white">
                <option value="">— Aucun dépôt —</option>
                {(repos || []).map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}{r.private ? '' : ' (public)'}</option>)}
                {repo && repos && !repos.some(r => r.fullName === repo) && <option value={repo}>{repo}</option>}
              </select>
              <Button size="sm" onClick={saveRepo} disabled={busy === 'repo' || repo === (status.repo || '')}>Enregistrer</Button>
            </div>
            <p>Le dépôt n’apparaît pas ? Ajoutez-le à l’application BlabIA sur GitHub{status.manageUrl ? <> (<a className="underline" href={status.manageUrl} target="_blank" rel="noreferrer">gérer l’accès</a>)</> : null}, puis « Vérifier ».</p>
          </>}
        </Step>

        <Step done={status.workflows.current} title="Installer les automatisations dans le dépôt">
          {status.accessible && !status.workflows.current && <>
            <p>BlabIA ajoute deux fichiers dans <Code>.github/workflows</Code> : l’un lance Claude Code, l’autre met en ligne (sauvegarde puis fusion). Ils ne se déclenchent que depuis BlabIA.</p>
            <Button size="sm" variant="primary" onClick={install} disabled={busy === 'install'}>{busy === 'install' ? 'Installation…' : status.workflows.installed ? 'Mettre à jour' : 'Installer'}</Button>
          </>}
        </Step>

        <Step done={status.secrets.claude} title="Ranger votre abonnement Claude dans le dépôt">
          {status.accessible && !status.secrets.claude && <>
            <p>Claude Code travaille avec <strong>votre abonnement</strong>. Son jeton reste dans les secrets du dépôt : BlabIA ne le voit jamais.</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Dans le terminal de VS Code : <Code>npm install -g @anthropic-ai/claude-code</Code> (une seule fois), puis <Code>claude setup-token</Code> et suivez les instructions.</li>
              <li>Copiez le jeton affiché (il commence par <Code>sk-ant-oat</Code>).</li>
              <li>Sur GitHub, <a className="underline font-bold" href={`${secretsUrl}/new`} target="_blank" rel="noreferrer">ajoutez un secret</a> nommé <Code>CLAUDE_CODE_OAUTH_TOKEN</Code> et collez-y le jeton.</li>
              <li>Revenez ici et cliquez sur « Vérifier ».</li>
            </ol>
          </>}
        </Step>

        <Step done={status.secrets.db && status.secrets.backupPassword} warn={backupPartial} title="Sauvegarde de la base avant chaque mise en ligne (si le projet a une base de données)">
          {status.accessible && <>
            {backupPartial
              ? <p className="text-await font-bold">Le secret <Code>BLABIA_BACKUP_PASSWORD</Code> manque : sans lui, aucune mise en ligne n’est possible.</p>
              : !status.secrets.db && <p>Facultatif. Sans base déclarée, la mise en ligne fusionne directement.</p>}
            {!(status.secrets.db && status.secrets.backupPassword) && <>
              <p>Deux secrets dans <a className="underline" href={secretsUrl} target="_blank" rel="noreferrer">les secrets du dépôt</a> : <Code>BLABIA_DB_URL</Code> (adresse publique de la base de prod) et <Code>BLABIA_BACKUP_PASSWORD</Code> (mot de passe de chiffrement, à garder précieusement : il sert à restaurer).</p>
              <p>La sauvegarde est chiffrée puis conservée 90 jours sur GitHub ; si elle échoue, rien n’est mis en ligne.</p>
            </>}
          </>}
        </Step>
      </ol>
      {status.ready && <p className="mt-4 text-sm font-bold text-ok inline-flex items-center gap-1.5"><ShieldCheck size={16} aria-hidden="true" /> Le dépôt est prêt.</p>}
    </Card>
  );
}

function TaskCard({ task, status, isOwner, onAction, busy }) {
  const [showFiles, setShowFiles] = useState(false);
  const st = STATUS[task.status] || STATUS.failed;
  const files = Array.isArray(task.files) ? task.files : [];
  const add = files.reduce((s, f) => s + (f.additions || 0), 0);
  const del = files.reduce((s, f) => s + (f.deletions || 0), 0);
  const canDeploy = isOwner && ['ready', 'deploy_failed'].includes(task.status) && task.prNumber;
  const canAbandon = isOwner && ['ready', 'failed', 'deploy_failed'].includes(task.status);

  return (
    <Card className="p-5" data-tour="dev-task">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-ink break-words">{task.title}</h3>
          <p className="text-xs text-ink-faint mt-0.5">Lancé le {fmtDate(task.createdAt)} · {task.repo}</p>
        </div>
        <Badge tone={st.tone}>{POLLING.includes(task.status) && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />}{st.label}</Badge>
      </div>

      {task.status === 'running' && <p className="text-sm text-ink-muted mt-3">Claude Code lit la demande, modifie le code et lance les tests. Comptez de 5 à 30 minutes ; cette page se met à jour toute seule.</p>}
      {task.status === 'deploying' && <p className="text-sm text-ink-muted mt-3">Sauvegarde de la base puis fusion en cours. L’hébergeur redéploie ensuite le site (quelques minutes).</p>}
      {task.status === 'deployed' && <p className="text-sm text-ok font-bold mt-3">Fusionné : l’hébergeur redéploie le site. Vérifiez ce que le résumé indique.</p>}
      {task.error && <p className="text-sm text-await font-bold mt-3 whitespace-pre-wrap">{task.error}</p>}

      {task.summary && (
        <div className="mt-3 rounded-xl bg-ai-bg border border-ai-border p-3.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai mb-1">Ce que Claude Code a fait</p>
          <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{task.summary}</p>
        </div>
      )}

      {task.touchesDatabase && !['deployed', 'abandoned'].includes(task.status) && (
        <p className={`mt-3 text-sm font-bold inline-flex items-start gap-1.5 ${status?.secrets?.db ? 'text-ink-soft' : 'text-await'}`}>
          <Database size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          {status?.secrets?.db
            ? 'Ce développement modifie la base de données : elle sera sauvegardée juste avant la mise en ligne.'
            : 'Ce développement modifie la base de données et aucune sauvegarde n’est configurée (étape 5).'}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-3">
          <button className="text-xs font-bold text-ink-muted inline-flex items-center gap-1 hover:text-ink" onClick={() => setShowFiles(v => !v)} aria-expanded={showFiles}>
            {showFiles ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            {files.length} fichier{files.length > 1 ? 's' : ''} modifié{files.length > 1 ? 's' : ''} · <span className="text-ok">+{add}</span> <span className="text-red-700">−{del}</span>
          </button>
          {showFiles && (
            <ul className="mt-2 space-y-0.5">
              {files.map(f => <li key={f.filename} className="text-xs font-mono text-ink-soft break-all">{f.filename} <span className="text-ok">+{f.additions}</span> <span className="text-red-700">−{f.deletions}</span></li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-line">
        {canDeploy && (
          <Button size="sm" variant="primary" disabled={busy} onClick={() => onAction(task, 'deploy')}>
            <Rocket size={15} aria-hidden="true" /> {task.status === 'deploy_failed' ? 'Réessayer la mise en ligne' : 'Mettre en ligne'}
          </Button>
        )}
        {canAbandon && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(task, 'abandon')}><X size={15} aria-hidden="true" /> Abandonner</Button>}
        <span className="flex-1" />
        {task.prUrl && <a className="text-xs font-bold text-action inline-flex items-center gap-1" href={task.prUrl} target="_blank" rel="noreferrer">Modifications <ExternalLink size={12} aria-hidden="true" /></a>}
        {task.runUrl && <a className="text-xs font-bold text-ink-muted inline-flex items-center gap-1" href={task.runUrl} target="_blank" rel="noreferrer">Journal <ExternalLink size={12} aria-hidden="true" /></a>}
        {task.issueUrl && <a className="text-xs font-bold text-ink-muted inline-flex items-center gap-1" href={task.issueUrl} target="_blank" rel="noreferrer">Demande <ExternalLink size={12} aria-hidden="true" /></a>}
      </div>
    </Card>
  );
}

export default function ProjectDev() {
  const { project, reloadProject } = useProject();
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const loadStatus = useCallback(() => api.get(`/projects/${project.id}/github`).then(({ data }) => setStatus(data))
    .catch(err => notifyError(err, 'Impossible de lire l’état du dépôt.')), [project.id]);
  const loadTasks = useCallback(() => api.get(`/projects/${project.id}/dev-tasks`).then(({ data }) => setData(data))
    .catch(err => notifyError(err, 'Impossible de charger les développements.')), [project.id]);

  useEffect(() => { loadStatus(); loadTasks(); }, [loadStatus, loadTasks]);
  useGitHubReturn(() => loadStatus());

  // Suivi automatique tant qu'un développement ou une mise en ligne est en cours
  const polling = !!data?.tasks.some(t => POLLING.includes(t.status));
  useEffect(() => {
    if (!polling) return undefined;
    const t = setInterval(loadTasks, 20000);
    return () => clearInterval(t);
  }, [polling, loadTasks]);

  const onStatusChange = s => {
    setStatus(prev => ({ ...prev, ...s }));
    if ((s.repo || null) !== (project.githubRepo || null)) reloadProject(); // entrée « Développements » de la navigation
  };

  const launch = async session => {
    if (!confirm(`Lancer le développement « ${session.task} » ?\n\nClaude Code va travailler sur ${status.repo} avec votre abonnement Claude, puis proposer ses modifications. Rien ne sera mis en ligne sans votre accord.`)) return;
    setBusy(true);
    try {
      await api.post(`/projects/${project.id}/dev-tasks`, { sessionId: session.id });
      notifySuccess('Développement lancé : Claude Code est au travail.');
      await loadTasks();
    } catch (err) { notifyError(err, 'Le développement n’a pas pu être lancé.'); } finally { setBusy(false); }
  };

  const onAction = async (task, action) => {
    const msg = action === 'deploy'
      ? `Mettre en ligne « ${task.title} » ?\n\n${status?.secrets?.db ? 'La base de données sera d’abord sauvegardée (chiffrée). ' : ''}Les modifications seront fusionnées et le site redéployé.`
      : `Abandonner « ${task.title} » ? Les modifications proposées seront fermées sur GitHub.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await api.post(`/projects/${project.id}/dev-tasks/${task.id}/${action}`);
      await loadTasks();
    } catch (err) { notifyError(err, 'Opération impossible.'); } finally { setBusy(false); }
  };

  if (!status || !data) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>;

  const active = data.tasks.some(t => ['running', 'deploying'].includes(t.status));
  // Dernier développement de chaque réunion : en cours ou réussi → plus proposé ; échoué ou abandonné → « Relancer »
  const lastTask = new Map();
  data.tasks.forEach(t => { if (!lastTask.has(t.sessionId)) lastTask.set(t.sessionId, t); }); // tâches du plus récent au plus ancien
  const retry = s => ['failed', 'abandoned'].includes(lastTask.get(s.id)?.status);
  const toLaunch = data.launchable.filter(s => !lastTask.has(s.id) || retry(s));
  const setupVisible = !status.ready || showSetup;

  return (
    <div className="space-y-4">
      <PageHeader title="Développements" subtitle={<>
        Claude Code réalise les prompts de vos réunions directement dans le dépôt GitHub du projet. Rien n’est mis en ligne sans votre clic.
        {status.repo && (
          <a className="mt-1 text-xs font-bold text-action flex items-center gap-1.5" href={`https://github.com/${status.repo}`} target="_blank" rel="noopener noreferrer">
            <Github size={13} aria-hidden="true" /> Voir le dépôt sur GitHub
          </a>
        )}
      </>}>
        {status.ready && status.isOwner && (
          <Button size="sm" variant="ghost" onClick={() => setShowSetup(v => !v)}>{showSetup ? 'Masquer la configuration' : 'Configuration'}</Button>
        )}
      </PageHeader>

      {setupVisible && <Setup project={project} status={status} onChange={onStatusChange} />}

      {status.ready && status.isOwner && (
        <Card className="p-5" data-tour="dev-launch">
          <h2 className="text-base font-extrabold text-ink">Lancer un développement</h2>
          <p className="text-xs text-ink-muted mt-0.5 mb-3">Prompts rédigés à la fin de vos réunions Claude Code. Un développement à la fois.</p>
          {toLaunch.length === 0 ? (
            <p className="text-sm text-ink-muted">{data.launchable.length ? 'Tous les prompts de vos réunions Claude Code ont été lancés.' : 'Aucune réunion Claude Code conclue pour l’instant.'} <Link className="underline" to={`/projects/${project.id}/meeting/new`}>Démarrer une réunion</Link></p>
          ) : (
            <ul className="divide-y divide-line">
              {toLaunch.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-bold text-ink">{s.task}</p>
                    <p className="text-xs text-ink-faint">Réunion du {fmtDate(s.createdAt)}{retry(s) ? ` · ${STATUS[lastTask.get(s.id).status].label.toLowerCase()}` : ''}</p>
                  </div>
                  <Button size="sm" variant={retry(s) ? 'secondary' : 'primary'} disabled={busy || active} onClick={() => launch(s)}
                    title={active ? 'Un développement est déjà en cours' : undefined}>
                    <Play size={14} aria-hidden="true" /> {retry(s) ? 'Relancer' : 'Lancer'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {data.tasks.map(t => <TaskCard key={t.id} task={t} status={status} isOwner={status.isOwner} onAction={onAction} busy={busy} />)}
    </div>
  );
}
