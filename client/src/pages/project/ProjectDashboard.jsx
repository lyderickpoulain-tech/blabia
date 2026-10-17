import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, AlertTriangle, ListOrdered, ScrollText, ListChecks, Wrench, History, Send, X, Check, GitPullRequest, Flag, RotateCcw, Inbox } from 'lucide-react';
import api from '../../utils/api';
import { useProject } from '../../components/project/ProjectShell';
import { Button, Card } from '../../components/ui';
import Markdown from '../../components/Markdown';
import GenerateTimelineModal from '../../components/GenerateTimelineModal';
import { totalLabel } from '../../utils/toolsCatalog';
import { formatUSD } from '../../utils/cost';
import { isOverdueAction } from './ProjectActions';
import useMissions from '../../hooks/useMissions';
import { notifyError, notifySuccess } from '../../utils/notify';
import { quickStartMeeting, quickStartError } from '../../utils/quickMeeting';
import { launchPreparation } from '../../utils/preparation';
import SummaryDisplayModal from '../../components/SummaryDisplayModal';
import InboxList from '../../components/assistant/InboxList';

// Tableau de bord du projet (refonte UX v5.1) : où en est le projet, quelle
// est la prochaine étape, qu'est-ce qui attend l'arbitrage de l'humain.

const TYPE_LABEL = { decision: 'Décision', claude_code: 'Claude Code', stack: 'Services' };

const QUICK_COMMANDS = [
  { cmd: '/résumerProjet',     label: 'Résumer le projet' },
  { cmd: '/prochainEtape',     label: 'Prochaine étape' },
  { cmd: '/analyserBloquants', label: 'Analyser les blocages' },
  { cmd: '/décisions',         label: 'Lister les décisions' },
  { cmd: '/ajouterEtapes',     label: 'Ajouter des réunions', placeholder: '/ajouterEtapes ' },
  { cmd: '/rechercher',        label: 'Rechercher sur le web', placeholder: '/rechercher ' },
];

function SummaryCard({ icon: Icon, title, meta, to, linkLabel, tour, children }) {
  return (
    <Card as="section" data-tour={tour} className="p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink flex items-center gap-2"><Icon size={17} className="text-action" aria-hidden="true" />{title}</h2>
        {meta && <span className="text-xs font-semibold text-ink-faint">{meta}</span>}
      </div>
      <div className="flex-1">{children}</div>
      <Link to={to} className="text-sm font-bold inline-flex items-center gap-1">{linkLabel} <ArrowRight size={14} aria-hidden="true" /></Link>
    </Card>
  );
}

function AskBlabIA({ projectId, onDone }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e?.preventDefault();
    const v = input.trim();
    if (!v || loading) return;
    setLoading(true); setResult(null);
    try {
      const { data } = await api.post(`/projects/${projectId}/quick-command`, { input: v });
      setResult(data);
    } catch (err) {
      setResult({ type: 'error', result: err.response?.data?.error || 'La commande a échoué.' });
    }
    setLoading(false);
    onDone?.(); // le coût du projet a changé
  };

  return (
    <Card as="section" data-tour="pd-ask" className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink flex items-center gap-2"><Sparkles size={17} className="text-ai" aria-hidden="true" />Demander à BlabIA</h2>
        {/* v5.1 : une question ponctuelle ici ; une vraie conversation avec le bras droit */}
        <Link to="bras-droit" className="text-[13px] font-bold">Discuter avec votre bras droit</Link>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="ask" className="sr-only">Votre question ou commande</label>
        <input id="ask" value={input} onChange={e => setInput(e.target.value)} disabled={loading}
          placeholder="Une question sur le projet, ou une commande ci-dessous"
          className="flex-1 min-w-0 h-11 text-sm border border-line rounded-[10px] px-3 outline-none focus:ring-2 focus:ring-action-border" />
        <Button type="submit" variant="primary" disabled={loading || !input.trim()} aria-label="Envoyer">
          {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_COMMANDS.map(c => (
          <button key={c.cmd} type="button" onClick={() => setInput(c.placeholder || c.cmd)}
            className="h-8 px-3 rounded-full border border-line bg-white text-xs font-semibold text-ink-muted hover:border-ai-border hover:text-ai">
            {c.label}
          </button>
        ))}
      </div>
      {result && (
        <div className="border border-ai-border bg-ai-bg rounded-xl p-4 relative">
          <button type="button" onClick={() => setResult(null)} aria-label="Fermer le résultat"
            className="absolute top-2 right-2 w-9 h-9 inline-flex items-center justify-center rounded-lg text-ink-faint hover:text-ink"><X size={16} /></button>
          <div className="max-h-96 overflow-y-auto pr-8"><Markdown size="synthesis">{result.result}</Markdown></div>
          {result.milestonesCreated?.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-ok">
              {result.milestonesCreated.length} réunion{result.milestonesCreated.length > 1 ? 's ajoutées' : ' ajoutée'} au plan. <Link to="reunions">Voir le plan</Link>
            </p>
          )}
          {result.sources?.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {result.sources.map((s, i) => <li key={i} className="text-xs truncate"><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a></li>)}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ProjectDashboard() {
  const { project, counts, inbox, refreshInbox } = useProject();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);         // { milestones, milestoneSessions }
  // v5.1 (15/10/2026) : récapitulatif du projet, une fois le plan terminé
  const [recap, setRecap] = useState(null);       // { content, createdAt } | null
  const [recapBusy, setRecapBusy] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  useEffect(() => { api.get(`/projects/${project.id}/recap`).then(({ data }) => setRecap(data)).catch(() => {}); }, [project.id]);
  const makeRecap = async () => {
    if (recapBusy) return;
    setRecapBusy(true);
    try {
      const { data } = await api.post(`/projects/${project.id}/recap`);
      setRecap(data);
      setShowRecap(true);
    } catch (err) { notifyError(err, 'Le récapitulatif n’a pas pu être rédigé.'); }
    setRecapBusy(false);
  };
  const [sessions, setSessions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [tools, setTools] = useState(null);       // { tools, total }
  const [stats, setStats] = useState(null);       // coût réel de l'IA (/stats)
  const [actions, setActions] = useState([]);     // actions entre les réunions
  const { missions } = useMissions(project.id);   // missions des agents (proposées → point d'attention)
  const [showGenerate, setShowGenerate] = useState(false);
  const [devTasks, setDevTasks] = useState(null); // développements Claude Code (si un dépôt GitHub est relié)

  const loadStats = () => api.get(`/projects/${project.id}/stats`).then(({ data }) => setStats(data)).catch(err => notifyError(err, 'Coût de l’IA indisponible.'));
  const loadPlan = () => api.get(`/projects/${project.id}/plan`).then(({ data }) => setPlan(data)).catch(() => setPlan({ milestones: [], milestoneSessions: {} }));
  useEffect(() => {
    loadPlan();
    loadStats();
    api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(err => notifyError(err, 'Impossible de charger les réunions.'));
    api.get(`/projects/${project.id}/decisions`).then(({ data }) => setDecisions(data)).catch(err => notifyError(err, 'Impossible de charger les décisions.'));
    api.get(`/projects/${project.id}/actions`).then(({ data }) => setActions(data)).catch(err => notifyError(err, 'Impossible de charger les actions.'));
    api.get(`/projects/${project.id}/tools`).then(({ data }) => setTools(data)).catch(err => notifyError(err, 'Impossible de charger les outils.'));
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Développements : état relu auprès de GitHub ; suivi toutes les 30 s tant que Claude Code travaille
  const devActive = !!devTasks?.some(t => ['running', 'deploying'].includes(t.status));
  useEffect(() => {
    if (!project.githubRepo) return undefined;
    const load = () => api.get(`/projects/${project.id}/dev-tasks`).then(({ data }) => setDevTasks(data.tasks))
      .catch(err => notifyError(err, 'Impossible de charger les développements.'));
    if (devTasks === null) load();
    if (!devActive) return undefined;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [project.id, project.githubRepo, devActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const milestones = [...(plan?.milestones || [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const done = milestones.filter(m => m.status === 'done').length;
  const nextIdx = milestones.findIndex(m => m.status !== 'done');
  const next = nextIdx >= 0 ? milestones[nextIdx] : null;
  const nextSession = next ? plan?.milestoneSessions?.[next.id] : null;
  const upcoming = milestones.filter(m => m.status !== 'done').slice(0, 3);
  // v5.1 : réunions confiées au bras droit — en cours, ou note de retour à lire
  const delegatedRunning = sessions.filter(s => s.status === 'open' && s.prepRunning && s.runKind === 'delegate');
  const delegatedDone = sessions.filter(s => s.status === 'open' && s.delegation && ['done', 'stopped'].includes(s.delegation.status) && !s.delegation.reviewed);
  const openSessions = sessions.filter(s => s.status === 'open' && !s.prepReady && !s.prepRunning && !s.delegation && (!nextSession || s.id !== nextSession.id));
  const preparedSessions = sessions.filter(s => s.status === 'open' && s.prepReady);   // v5.1 : conclusions prêtes
  const preparingSessions = sessions.filter(s => s.status === 'open' && s.prepRunning && s.runKind !== 'delegate'); // v5.1 : agents au travail
  const activeDecisions = decisions.filter(d => d.status === 'active');
  const validatedTools = (tools?.tools || []).filter(t => t.status === 'validated');
  const pastSessions = sessions.filter(s => s.status === 'accepted').slice(0, 2);
  const openActions = actions.filter(a => a.status !== 'done');
  const lateActions = openActions.filter(isOverdueAction);
  const proposedMissions = missions.filter(m => m.status === 'proposed');
  const reportsToReview = missions.filter(m => m.status === 'done' && !m.outcome); // v5.1 : intégrer ou non
  const devOf = status => (devTasks || []).filter(t => t.status === status);
  const devCurrent = (devTasks || []).find(t => ['running', 'deploying', 'ready'].includes(t.status));
  const devLastDeployed = devOf('deployed')[0];

  // v5.1 (test « Gérard ») : un clic suffit — la réunion est créée avec les assistants proposés ;
  // « Personnaliser » ouvre l'ancienne page de réglages
  const [starting, setStarting] = useState(null);
  const customize = () => navigate(`/projects/${project.id}/meeting/new`, {
    state: { milestoneId: next.id, milestoneTitle: next.title, milestoneType: next.type },
  });
  const startMeeting = async (prepare) => {
    if (starting) return;
    setStarting(prepare ? 'prepare' : 'start');
    try {
      const s = await quickStartMeeting(project, next, { prepare });
      if (prepare) {
        await launchPreparation(project.id, s.id);
        notifySuccess(`Les assistants préparent « ${next.title} ». Votre bras droit vous préviendra quand leurs conclusions seront prêtes.`);
        refreshInbox?.();
        setStarting(null);
        return;
      }
      navigate(`/projects/${project.id}/meeting/${s.id}`, { state: { autoStart: true } });
    } catch (err) { notifyError(err, quickStartError(err)); setStarting(null); }
  };

  // v5.1 (16/10/2026) : ce qui attend l'humain est dans « À trancher » (InboxList) ; ne restent
  // ici que les points qui n'y sont pas (outils, développement en échec, réunion restée ouverte)
  const attention = [
    ...devOf('failed').slice(0, 1).map(t => ({ text: `Le développement « ${t.title} » n’a pas abouti.`, to: 'developpements', cta: 'Voir' })),
    counts.toolsAttention > 0 && { text: `${counts.toolsAttention} point${counts.toolsAttention > 1 ? 's' : ''} d'attention sur les outils du projet.`, to: 'outils', cta: 'Revoir' },
    ...openSessions.slice(0, 3).map(s => ({ text: `Réunion restée ouverte : « ${s.task} ».`, to: `/projects/${project.id}/meeting/${s.id}`, cta: 'Rejoindre' })),
    // v5.1 : votre clé API Anthropic ne fonctionne plus, BlabIA a pris le relais
    ['invalid', 'no_credit'].includes(stats?.ownerKeyStatus) && { text: stats.ownerKeyStatus === 'no_credit' ? 'Votre compte Anthropic n’a plus de crédit : BlabIA a pris le relais pour l’IA.' : 'Anthropic refuse votre clé API : BlabIA a pris le relais pour l’IA.', to: '/profile', cta: 'Voir' },
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{project.name}</h1>
        {project.description && <p className="text-[15px] text-ink-muted mt-1">{project.description}</p>}
        {project.status === 'archived' && <p className="text-sm font-bold text-ink-faint mt-1">Projet archivé</p>}
      </div>

      {/* Prochaine étape */}
      <Card as="section" data-tour="pd-next" aria-labelledby="next-title" className="p-5 border-action-border flex flex-wrap items-center gap-5">
        {plan === null ? (
          <div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" />
        ) : next ? (
          <>
            <div className="flex-1 min-w-[260px] space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-action">Prochaine étape · réunion {nextIdx + 1} sur {milestones.length}</p>
              <h2 id="next-title" className="text-xl font-extrabold text-ink">{next.title}</h2>
              <p className="text-sm text-ink-muted">{TYPE_LABEL[next.type] || 'Réunion'}{next.description ? ` · ${next.description}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {nextSession?.status === 'open' ? (
                <Link to={`/projects/${project.id}/meeting/${nextSession.id}`} className="h-11 px-5 inline-flex items-center gap-2 rounded-[10px] bg-action text-white text-sm font-bold hover:bg-action-dark">
                  Reprendre la réunion <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ) : project.status === 'active' && (
                <>
                  <Button variant="ghost" onClick={customize} title="Choisir les assistants, le type de réunion, les réglages">Personnaliser</Button>
                  <Button variant="secondary" onClick={() => startMeeting(true)} disabled={!!starting} className="text-ai border-ai-border">
                    <Sparkles size={16} /> {starting === 'prepare' ? 'Lancement…' : 'Les assistants la préparent'}
                  </Button>
                  <Button variant="primary" onClick={() => startMeeting(false)} disabled={!!starting}>{starting === 'start' ? 'Ouverture…' : 'Démarrer la réunion'} <ArrowRight size={16} /></Button>
                </>
              )}
            </div>
          </>
        ) : milestones.length > 0 && !project.isDemo ? (
          // Plan terminé : récapitulatif de tout le projet, qui répond aux objectifs de départ
          <>
            <div className="flex-1 min-w-[260px] space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-ok">Plan terminé · {milestones.length} réunion{milestones.length > 1 ? 's tenues' : ' tenue'}</p>
              <h2 id="next-title" className="text-xl font-extrabold text-ink">{recap ? 'Le récapitulatif du projet est prêt' : 'Faites le récapitulatif du projet'}</h2>
              <p className="text-sm text-ink-muted">
                {recap
                  ? `Rédigé le ${new Date(recap.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : résultat, réponse aux objectifs de départ, décisions clés et ce qui reste à faire. Il est aussi dans les documents du projet.`
                  : 'Un bilan bref de tout le projet : le résultat obtenu et, point par point, la réponse aux objectifs de départ.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {recap ? (
                <>
                  <Button variant="primary" onClick={() => setShowRecap(true)}><Flag size={16} aria-hidden="true" /> Voir le récapitulatif</Button>
                  <Button variant="ghost" onClick={makeRecap} disabled={recapBusy} title="Rédiger à nouveau, avec les dernières réunions">
                    <RotateCcw size={16} aria-hidden="true" /> {recapBusy ? 'Rédaction…' : 'Régénérer'}
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={makeRecap} disabled={recapBusy}><Flag size={16} aria-hidden="true" /> {recapBusy ? 'Rédaction en cours…' : 'Faire le récapitulatif'}</Button>
              )}
              {project.brief && <Button variant="secondary" onClick={() => setShowGenerate(true)}><Sparkles size={16} aria-hidden="true" /> Prévoir une suite</Button>}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 min-w-[260px] space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-action">Prochaine étape</p>
              <h2 id="next-title" className="text-xl font-extrabold text-ink">{milestones.length ? 'Toutes les réunions du plan sont tenues' : 'Construire le plan des réunions'}</h2>
              <p className="text-sm text-ink-muted">
                {project.brief ? 'BlabIA peut proposer une suite de réunions à partir du brief.' : 'Commencez par écrire le brief du projet : il guide les agents et le plan.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {project.brief
                ? <Button variant="primary" onClick={() => setShowGenerate(true)}><Sparkles size={16} /> Proposer un plan</Button>
                : <Link to="parametres" className="h-11 px-5 inline-flex items-center rounded-[10px] bg-action text-white text-sm font-bold hover:bg-action-dark">Écrire le brief</Link>}
              <Link to={`/projects/${project.id}/meeting/new`} className="h-11 px-4 inline-flex items-center rounded-[10px] border border-line bg-white text-sm font-bold text-ink-soft hover:bg-canvas">Réunion libre</Link>
            </div>
          </>
        )}
      </Card>

      {showRecap && recap && (
        <SummaryDisplayModal title={`Récapitulatif — ${project.name}`} date={new Date(recap.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          content={recap.content} onClose={() => setShowRecap(false)} />
      )}

      {/* À trancher (v5.1) : les 3 premiers éléments, réponse possible ici même */}
      {(inbox?.count > 0 || inbox?.running?.length > 0 || attention.length > 0) && (
        <section data-tour="pd-attention" aria-labelledby="att-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="att-title" className="text-base font-extrabold text-ink flex items-center gap-2"><Inbox size={17} className="text-await" aria-hidden="true" />À trancher{inbox?.count ? ` · ${inbox.count}` : ''}</h2>
            {inbox?.count > 0 && <Link to="a-trancher" className="text-sm font-bold">Tout voir</Link>}
          </div>
          <InboxList project={project} inbox={inbox} onChanged={refreshInbox} limit={3} compact />
          {attention.length > 0 && (
            <ul className="space-y-1.5 bg-white border border-line rounded-2xl p-4">
              {attention.map((a, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-between">
                  <span className="text-sm text-ink-soft flex-1 min-w-[240px] flex items-center gap-2"><AlertTriangle size={15} className="text-await shrink-0" aria-hidden="true" />{a.text}</span>
                  <Link to={a.to} className="text-sm font-bold text-await">{a.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard icon={ListOrdered} title="Plan" meta={milestones.length ? `${done} sur ${milestones.length} tenues` : null} to="reunions" linkLabel="Voir le plan">
          {milestones.length > 0 && (
            <div className="h-2 bg-muted-light rounded-full overflow-hidden mb-3"><div className="h-full bg-ok" style={{ width: `${Math.round((done / milestones.length) * 100)}%` }} /></div>
          )}
          {upcoming.length === 0 ? <p className="text-sm text-ink-faint">Aucune réunion à venir.</p> : (
            <ol className="space-y-1.5">
              {upcoming.map(m => (
                <li key={m.id} className="flex items-center gap-2.5 text-sm">
                  <span className="w-6 h-6 rounded-md bg-muted-light text-ink-muted text-xs font-extrabold inline-flex items-center justify-center shrink-0">{milestones.indexOf(m) + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-ink-soft">{m.title}</span>
                  <span className="text-xs text-ink-faint shrink-0">{TYPE_LABEL[m.type] || ''}</span>
                </li>
              ))}
            </ol>
          )}
        </SummaryCard>

        <SummaryCard icon={ScrollText} title="Décisions" meta={`${activeDecisions.length} en vigueur${counts.decisionsReopened ? ` · ${counts.decisionsReopened} à revoir` : ''}`} to="decisions" linkLabel="Ouvrir le registre">
          {activeDecisions.length === 0 ? <p className="text-sm text-ink-faint">Aucune décision pour l'instant. Elles s'ajoutent à la conclusion des réunions.</p> : (
            <ul className="space-y-1.5">
              {activeDecisions.slice(0, 3).map(d => (
                <li key={d.id} className="flex gap-2 items-start text-sm">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-ok shrink-0" aria-hidden="true" />
                  <span className="text-ink-soft">{d.statement}</span>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard tour="pd-actions" icon={ListChecks} title="Actions" meta={openActions.length ? `${openActions.length} à faire${lateActions.length ? ` · ${lateActions.length} en retard` : ''}` : null} to="actions" linkLabel="Voir les actions">
          {openActions.length === 0 ? <p className="text-sm text-ink-faint">Aucune action en cours. Elles sont proposées à la conclusion des réunions.</p> : (
            <ul className="space-y-1.5">
              {openActions.slice(0, 3).map(a => (
                <li key={a.id} className="flex gap-2 items-start text-sm">
                  <span className={`mt-0.5 w-4 h-4 rounded border-2 shrink-0 ${isOverdueAction(a) ? 'border-await' : 'border-ink-faint'}`} aria-hidden="true" />
                  <span className="flex-1 min-w-0 text-ink-soft">{a.title}</span>
                  {a.dueDate && (
                    <span className={`text-xs shrink-0 ${isOverdueAction(a) ? 'text-await font-bold' : 'text-ink-faint'}`}>
                      {new Date(a.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>

        {(project.hasTechnicalStack || project.githubRepo || (tools?.tools || []).some(t => ['validated', 'suggested'].includes(t.status))) && <SummaryCard icon={Wrench} title="Outils" meta={tools ? `${validatedTools.length} retenu${validatedTools.length > 1 ? 's' : ''}` : null} to="outils" linkLabel="Voir les outils">
          {tools && (
            <div className="space-y-1">
              <p className="text-xs text-ink-faint">Coût mensuel estimé</p>
              <p className="text-2xl font-extrabold text-ink">{totalLabel(tools.total || { min: 0, max: 0 })}</p>
              {counts.toolsAttention > 0 && <p className="text-sm text-await font-semibold">{counts.toolsAttention} point{counts.toolsAttention > 1 ? 's' : ''} d'attention</p>}
            </div>
          )}
        </SummaryCard>}

        {project.githubRepo && (
          <SummaryCard icon={GitPullRequest} title="Développements" meta={project.githubRepo} to="developpements" linkLabel="Voir les développements">
            {devTasks === null ? <p className="text-sm text-ink-faint">Chargement…</p> : devCurrent ? (
              <div className="space-y-1">
                <p className={`text-sm font-extrabold inline-flex items-center gap-1.5 ${devCurrent.status === 'ready' ? 'text-await' : 'text-ai'}`}>
                  {devCurrent.status !== 'ready' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />}
                  {devCurrent.status === 'running' ? 'Claude Code travaille…' : devCurrent.status === 'deploying' ? 'Mise en ligne en cours…' : 'Prêt à relire'}
                </p>
                <p className="text-sm text-ink-soft">{devCurrent.title}</p>
              </div>
            ) : devLastDeployed ? (
              <div className="space-y-1">
                <p className="text-xs text-ink-faint">Dernier mis en ligne · {new Date(devLastDeployed.finishedAt || devLastDeployed.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>
                <p className="text-sm text-ink-soft">{devLastDeployed.title}</p>
              </div>
            ) : <p className="text-sm text-ink-faint">Aucun développement en cours. Ils se lancent à la conclusion des réunions Claude Code.</p>}
          </SummaryCard>
        )}

        <SummaryCard tour="pd-history" icon={History} title="Historique" meta={`${sessions.length} réunion${sessions.length !== 1 ? 's' : ''}`} to="historique" linkLabel="Voir l'historique">
          {stats && (
            <div className="mb-3" title={stats.legacyCostUSD > 0 ? `${formatUSD(stats.realCostUSD)} réels + ${formatUSD(stats.legacyCostUSD)} estimés avant le suivi` : 'Calculé à partir des tokens exacts de chaque appel'}>
              <p className="text-xs text-ink-faint">Coût de l'IA</p>
              <p className="text-2xl font-extrabold text-ink">{formatUSD(stats.realCostUSD + stats.legacyCostUSD)}</p>
            </div>
          )}
          {pastSessions.length === 0 ? <p className="text-sm text-ink-faint">Aucune réunion conclue pour l'instant.</p> : (
            <ul className="space-y-2">
              {pastSessions.map(s => (
                <li key={s.id}>
                  <Link to={`/projects/${project.id}/meeting/${s.id}`} className="text-sm font-bold text-ink hover:text-action">{s.task}</Link>
                  <p className="text-xs text-ink-faint">{new Date(s.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</p>
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>
      </div>

      <AskBlabIA projectId={project.id} onDone={loadStats} />

      {showGenerate && (
        <GenerateTimelineModal project={project} existingCount={0}
          onClose={() => setShowGenerate(false)}
          onAdded={() => { setShowGenerate(false); loadPlan(); }} />
      )}
    </div>
  );
}
