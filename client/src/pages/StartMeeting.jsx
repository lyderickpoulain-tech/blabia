import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Handshake, Code2, Wrench, Sparkles, Check, Plus, X, Lightbulb, ChevronDown, Globe, Play, Coffee } from 'lucide-react';
import { useProject, PageHeader } from '../components/project/ProjectShell';
import { Button, Card } from '../components/ui';
import api from '../utils/api';
import QuestionModePicker from '../components/QuestionModePicker';
import ChallengerToggle from '../components/ChallengerToggle';
import LevelSlider, { EXPERTISE_LABELS, HUMOR_LABELS, HUMOR_ICONS } from '../components/LevelSlider';
import { notifyError } from '../utils/notify';
import ToolsMeetingHint from '../components/project/ToolsMeetingHint';

// v5.0 : decision | claude_code | stack (phase 4)
const DELIVERABLES = [
  { id: 'decision',    icon: Handshake, label: 'Prise de décision', desc: 'Relevé de décisions structuré, mémorisé dans le projet' },
  { id: 'claude_code', icon: Code2,     label: 'Claude Code',       desc: 'Prompt prêt pour le développement' },
  { id: 'stack',       icon: Wrench,    label: 'Outils',            desc: 'Revue des outils du projet, catégorie par catégorie, avec coûts' },
];

// Rétrocompat : anciennes valeurs de Milestone.type encore rencontrées (avant migration)
const MT_MAP = {
  decision: 'decision', synthesis: 'decision', summary: 'decision', meeting: 'decision',
  memory: 'decision', timeline_steps: 'decision', milestone: 'decision',
  claude_code: 'claude_code', technical: 'claude_code',
  stack: 'stack', stack_check: 'stack',
};

// Modèles proposés : source unique côté serveur (services/models.js, GET /api/models)

const inputCls = 'w-full px-3.5 py-2.5 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition';

// Section numérotée du formulaire
function Step({ n, title, hint, aside, children }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-7 h-7 shrink-0 rounded-full bg-action-light text-action text-sm font-extrabold inline-flex items-center justify-center">{n}</span>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-ink leading-7">{title}</h2>
            {hint && <p className="text-xs text-ink-faint">{hint}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

// Carte sélectionnable : fond clair + texte coloré + coche (lisible, cf. retours v5.1)
function ChoiceCard({ active, onClick, children, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`relative text-left rounded-xl border-2 transition ${
        active ? 'border-action bg-action-light' : 'border-line bg-white hover:border-action-border'
      } ${className}`}>
      {active && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-action text-white inline-flex items-center justify-center">
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </span>
      )}
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative inline-flex w-11 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-action' : 'bg-line'}`}>
      <span className={`inline-block w-4 h-4 mt-1 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function AgentScopeSelector({ scope, onChange }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-bold text-ink-muted mb-1">Disponibilité</legend>
      {[
        { value: 'project', label: 'Pour ce projet uniquement', desc: null },
        { value: 'global',  label: 'Enregistrer dans BlabIA',   desc: 'Disponible dans tous vos projets' },
      ].map(opt => (
        <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
          <input type="radio" value={opt.value} checked={scope === opt.value} onChange={() => onChange(opt.value)}
            className="mt-0.5 shrink-0 accent-action" />
          <span>
            <span className="text-xs font-semibold text-ink-soft">{opt.label}</span>
            {opt.desc && <span className="block text-[11px] text-ink-faint leading-tight">{opt.desc}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export default function StartMeeting() {
  const { id: projectId } = useParams();
  const { project } = useProject();
  const location = useLocation();
  const navigate  = useNavigate();

  // Pré-remplissage depuis le plan (location.state)
  const milestoneId    = location.state?.milestoneId    || null;
  const milestoneTitle = location.state?.milestoneTitle || '';
  const milestoneType  = location.state?.milestoneType  || null;

  const [task, setTask]               = useState(milestoneTitle);
  const [deliverable, setDeliverable] = useState(() => MT_MAP[milestoneType] || 'decision');

  const [availableAgents,    setAvailableAgents]    = useState([]);
  const [selectedAgentIds,   setSelectedAgentIds]   = useState(new Set());
  const [agentsLoading,      setAgentsLoading]      = useState(true);
  const [suggestingAgents,   setSuggestingAgents]   = useState(false);
  const [suggestionReasons,  setSuggestionReasons]  = useState({});
  const [newAgentSuggestion, setNewAgentSuggestion] = useState(null);
  const [suggestedScope,     setSuggestedScope]     = useState('project');
  const [creatingSuggested,  setCreatingSuggested]  = useState(false);
  const [newAgentForm,       setNewAgentForm]       = useState({ open: false, name: '', role: '', systemPrompt: '', scope: 'project' });
  const [creatingAgent,      setCreatingAgent]      = useState(false);
  const [models,            setModels]            = useState([]);
  const [model,             setModel]             = useState(null); // null = défaut du serveur
  const [webSearchEnabled,  setWebSearchEnabled]  = useState(false);
  const [autoPrepare,       setAutoPrepare]       = useState(!!location.state?.autoPrepare);
  const [expertiseLevel,    setExpertiseLevel]    = useState(project?.expertiseLevel || 3);
  const [humorLevel,        setHumorLevel]        = useState(project?.humorLevel || 2);
  const [questionMode,      setQuestionMode]      = useState(project?.questionMode || 'balanced');
  const [showAdvanced,      setShowAdvanced]      = useState(false);
  const [challenger,        setChallenger]        = useState(project?.challengerEnabled !== false);
  const [starting,          setStarting]          = useState(false);
  const [error,             setError]             = useState('');

  // Chargement initial des agents du projet
  useEffect(() => {
    setAgentsLoading(true);
    api.get(`/projects/${projectId}/agents`)
      .then(({ data }) => {
        const enabled = data.filter(a => a.enabled !== false);
        setAvailableAgents(enabled);
        setSelectedAgentIds(new Set(enabled.slice(0, 2).map(a => a.agentId || a.id)));
      })
      .catch(err => notifyError(err, 'Impossible de charger les agents du projet.'))
      .finally(() => setAgentsLoading(false));
  }, [projectId]);

  useEffect(() => {
    api.get('/models')
      .then(({ data }) => { setModels(data.models || []); setModel(m => m || data.default); })
      .catch(() => {}); // liste des modèles : à défaut, le serveur applique le modèle par défaut
  }, []);

  // Auto-suggestion si pré-rempli depuis le plan — y compris quand on arrive ici depuis cette
  // même page (encadré « choisissez d'abord les outils ») : on reprend alors objectif et livrable
  const firstRender = useRef(true);
  useEffect(() => {
    if (!firstRender.current && milestoneTitle) {
      setTask(milestoneTitle);
      setDeliverable(MT_MAP[milestoneType] || 'decision');
    }
    firstRender.current = false;
    if (!milestoneTitle) return;
    handleSuggestAgents(milestoneTitle, milestoneType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const handleSuggestAgents = async (taskValue = task, milType = null) => {
    if (!taskValue.trim() || suggestingAgents) return;
    setSuggestingAgents(true);
    setNewAgentSuggestion(null);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/suggest-agents`, {
        task: taskValue,
        ...(milType ? { milestoneType: milType } : {})
      });
      const selected = data.existingSelected || [];
      if (selected.length > 0) {
        setSelectedAgentIds(new Set(selected.map(s => s.agentId)));
        setSuggestionReasons(selected.reduce((acc, s) => ({ ...acc, [s.agentId]: s.reason }), {}));
      }
      if (data.newAgentSuggestion) {
        setNewAgentSuggestion(data.newAgentSuggestion);
        setSuggestedScope('project');
      }
    } catch (err) { notifyError(err, 'La suggestion d’agents a échoué.'); }
    setSuggestingAgents(false);
  };

  const handleCreateSuggestedAgent = async () => {
    if (!newAgentSuggestion || creatingSuggested) return;
    setCreatingSuggested(true);
    try {
      const { data: agent } = await api.post('/agents', {
        name:         newAgentSuggestion.name.trim(),
        role:         newAgentSuggestion.role.trim(),
        systemPrompt: `Tu es ${newAgentSuggestion.name}. ${newAgentSuggestion.role}.`,
        isDefault:    suggestedScope === 'global'
      });
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'suggested' });
      setAvailableAgents(prev => [...prev, { ...agent, agentId: agent.id, enabled: true }]);
      setSelectedAgentIds(prev => new Set([...prev, agent.id]));
      setSuggestionReasons(prev => ({ ...prev, [agent.id]: newAgentSuggestion.reason }));
      setNewAgentSuggestion(null);
    } catch (err) { notifyError(err, 'L’agent suggéré n’a pas pu être créé.'); }
    setCreatingSuggested(false);
  };

  const toggleAgent = (id) => {
    setSelectedAgentIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleCreateAgent = async () => {
    if (!newAgentForm.name.trim() || creatingAgent) return;
    setCreatingAgent(true);
    try {
      const { data: agent } = await api.post('/agents', {
        name:         newAgentForm.name.trim(),
        role:         newAgentForm.role.trim(),
        systemPrompt: newAgentForm.systemPrompt.trim(),
        isDefault:    newAgentForm.scope === 'global'
      });
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'manual' });
      setAvailableAgents(prev => [...prev, { ...agent, agentId: agent.id, enabled: true }]);
      setSelectedAgentIds(prev => new Set([...prev, agent.id]));
      setNewAgentForm({ open: false, name: '', role: '', systemPrompt: '', scope: 'project' });
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la création de l\'agent');
    }
    setCreatingAgent(false);
  };

  const handleStart = async () => {
    if (!task.trim() || selectedAgentIds.size === 0 || starting) return;
    setError('');
    setStarting(true);
    try {
      const activeAgents = availableAgents
        .filter(a => selectedAgentIds.has(a.agentId || a.id))
        .map(a => ({
          id:           a.agentId || a.id,
          name:         a.name,
          role:         a.role,
          systemPrompt: a.systemPrompt || `Tu es ${a.name}. ${a.role}.`,
          emoji:        a.emoji || '🤖'
        }));

      const { data } = await api.post(`/projects/${projectId}/sessions`, {
        task:             task.trim(),
        intention:        [deliverable],
        activeAgents,
        mode:             'meeting',
        ...(model ? { model } : {}),
        webSearchEnabled: webSearchEnabled === true,
        expertiseLevel,
        humorLevel,
        questionMode,
        ...(challenger ? {} : { challengerEnabled: false }), // sinon : réglage du projet
        ...(milestoneId ? { milestoneId } : {})
      });

      // La salle de réunion lance la préparation dès l'ouverture (si au moins 2 agents)
      navigate(`/projects/${projectId}/meeting/${data.session.id}`, { state: { autoPrepare: autoPrepare && activeAgents.length >= 2 } });
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du démarrage de la réunion');
      setStarting(false);
    }
  };

  const canStart = task.trim().length > 0 && selectedAgentIds.size >= 1 && !starting;
  const prepPossible = selectedAgentIds.size >= 2;
  const modelLabel = models.find(m => m.id === model)?.label || 'Modèle par défaut';

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nouvelle réunion"
        subtitle={milestoneTitle ? `Étape du plan : ${milestoneTitle}` : 'Fixez l’objectif, choisissez les agents, puis lancez.'}
      />

      <div className="space-y-4">

        {/* ── 1. Objectif ─────────────────────────────────────────────────── */}
        <Step n={1} title="Objectif" hint="Que doit permettre cette réunion ?">
          <textarea
            value={task}
            onChange={e => setTask(e.target.value)}
            rows={3}
            aria-label="Objectif de la réunion"
            placeholder="Ex : Définir les fonctionnalités principales du site…"
            className={`${inputCls} resize-none`}
            autoFocus
          />
        </Step>

        {/* ── 2. Livrable ─────────────────────────────────────────────────── */}
        <Step n={2} title="Livrable attendu" hint="Ce que BlabIA produira à la clôture.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {DELIVERABLES.map(d => {
              const active = deliverable === d.id;
              return (
                <ChoiceCard key={d.id} active={active} onClick={() => setDeliverable(d.id)} className="p-4">
                  <d.icon size={22} className={active ? 'text-action' : 'text-ink-muted'} aria-hidden="true" />
                  <p className={`mt-2 text-sm font-extrabold ${active ? 'text-action' : 'text-ink'}`}>{d.label}</p>
                  <p className="text-xs text-ink-muted leading-snug mt-0.5 pr-4">{d.desc}</p>
                </ChoiceCard>
              );
            })}
          </div>
          {deliverable === 'claude_code' && <div className="mt-3"><ToolsMeetingHint projectId={projectId} /></div>}
        </Step>

        {/* ── 3. Agents invités ───────────────────────────────────────────── */}
        <Step n={3} title="Agents invités"
          hint={`${selectedAgentIds.size} sélectionné${selectedAgentIds.size > 1 ? 's' : ''} · 1 minimum, 2 pour la préparation`}
          aside={
            <Button size="sm" variant="secondary" onClick={() => handleSuggestAgents()}
              disabled={suggestingAgents || !task.trim()}
              title={!task.trim() ? 'Renseignez d’abord l’objectif' : undefined}
              className="text-ai border-ai-border bg-ai-bg hover:bg-ai-light">
              {suggestingAgents
                ? <><span className="w-3.5 h-3.5 border-2 border-ai border-t-transparent rounded-full animate-spin" /> Suggestion…</>
                : <><Sparkles size={15} aria-hidden="true" /> Suggérer</>}
            </Button>
          }>
          {agentsLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableAgents.map(a => {
                  const id     = a.agentId || a.id;
                  const active = selectedAgentIds.has(id);
                  return (
                    <ChoiceCard key={id} active={active} onClick={() => toggleAgent(id)} className="flex items-start gap-3 px-3.5 py-3">
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${active ? 'bg-white' : 'bg-canvas'}`}>
                        {a.emoji || a.name?.[0] || '?'}
                      </span>
                      <span className="flex-1 min-w-0 pr-5">
                        <span className={`block text-sm font-extrabold truncate ${active ? 'text-action' : 'text-ink'}`}>{a.name}</span>
                        <span className="block text-xs text-ink-muted truncate">{a.role}</span>
                        {active && suggestionReasons[id] && (
                          <span className="block text-[11px] text-ai mt-1 leading-snug">{suggestionReasons[id]}</span>
                        )}
                      </span>
                    </ChoiceCard>
                  );
                })}
              </div>

              {/* Agent suggéré (compétence manquante) */}
              {newAgentSuggestion && (
                <div className="border border-ai-border bg-ai-bg rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Lightbulb size={18} className="text-ai shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-extrabold text-ai uppercase tracking-wider mb-1">Compétence manquante</p>
                      <p className="text-sm font-extrabold text-ink">{newAgentSuggestion.name}</p>
                      <p className="text-xs text-ink-muted mt-0.5 leading-snug">{newAgentSuggestion.role}</p>
                      {newAgentSuggestion.reason && (
                        <p className="text-xs text-ink-soft mt-1.5">{newAgentSuggestion.reason}</p>
                      )}
                    </div>
                  </div>
                  <AgentScopeSelector scope={suggestedScope} onChange={setSuggestedScope} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" className="flex-1" onClick={handleCreateSuggestedAgent} disabled={creatingSuggested}>
                      {creatingSuggested ? 'Création…' : <><Plus size={15} aria-hidden="true" /> Créer et inviter</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNewAgentSuggestion(null)}>Ignorer</Button>
                  </div>
                </div>
              )}

              {/* Créer un agent */}
              {newAgentForm.open ? (
                <div className="border border-line bg-canvas rounded-xl p-4 space-y-2">
                  <input autoFocus type="text" placeholder="Nom de l'agent" aria-label="Nom de l'agent" value={newAgentForm.name}
                    onChange={e => setNewAgentForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
                  <input type="text" placeholder="Rôle / spécialité" aria-label="Rôle" value={newAgentForm.role}
                    onChange={e => setNewAgentForm(p => ({ ...p, role: e.target.value }))} className={inputCls} />
                  <textarea placeholder="Instructions (optionnel)" aria-label="Instructions" value={newAgentForm.systemPrompt} rows={2}
                    onChange={e => setNewAgentForm(p => ({ ...p, systemPrompt: e.target.value }))} className={`${inputCls} resize-none`} />
                  <AgentScopeSelector scope={newAgentForm.scope} onChange={scope => setNewAgentForm(p => ({ ...p, scope }))} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" className="flex-1" onClick={handleCreateAgent}
                      disabled={!newAgentForm.name.trim() || creatingAgent}>
                      {creatingAgent ? 'Création…' : 'Créer et inviter'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNewAgentForm(p => ({ ...p, open: false }))} aria-label="Annuler">
                      <X size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setNewAgentForm(p => ({ ...p, open: true }))}
                  className="w-full h-11 inline-flex items-center justify-center gap-1.5 border-2 border-dashed border-line hover:border-action-border rounded-xl text-sm font-semibold text-ink-faint hover:text-action transition">
                  <Plus size={16} aria-hidden="true" /> Créer un agent
                </button>
              )}
            </div>
          )}
        </Step>

        {/* ── 4. Déroulé ──────────────────────────────────────────────────── */}
        <Step n={4} title="Déroulé" hint="Votre place dans la réunion.">
          <div className="space-y-4">
            <label className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${
              autoPrepare && prepPossible ? 'border-ai-border bg-ai-bg' : 'border-line'
            } ${prepPossible ? 'cursor-pointer' : 'opacity-60'}`}>
              <Coffee size={20} className={`shrink-0 mt-0.5 ${autoPrepare && prepPossible ? 'text-ai' : 'text-ink-muted'}`} aria-hidden="true" />
              <span className="flex-1">
                <span className="block text-sm font-extrabold text-ink">Préparer avant mon arrivée</span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  Les agents débattent d'abord entre eux ; vous arrivez sur un briefing avec les seules décisions qui vous reviennent.
                  {!prepPossible && ' Invitez au moins 2 agents.'}
                </span>
              </span>
              <input type="checkbox" checked={autoPrepare && prepPossible} disabled={!prepPossible}
                onChange={e => setAutoPrepare(e.target.checked)} className="mt-1 w-5 h-5 shrink-0 accent-action" />
            </label>
            <QuestionModePicker value={questionMode} onChange={setQuestionMode} />
            <ChallengerToggle checked={challenger} onChange={setChallenger}
              hint={project?.challengerEnabled === false
                ? 'Désactivé dans les paramètres du projet.'
                : 'Pour cette réunion : point de vigilance seulement sur les choix à fort enjeu (2 au plus). Décochez pour une réunion sans contradicteur.'}
              disabled={project?.challengerEnabled === false} />
          </div>
        </Step>

        {/* ── Réglages avancés (repliés) ─────────────────────────────────── */}
        <Card>
          <button type="button" onClick={() => setShowAdvanced(v => !v)} aria-expanded={showAdvanced}
            className="w-full flex items-center justify-between gap-3 px-5 h-14 text-left">
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-ink">Réglages avancés</span>
              {!showAdvanced && (
                <span className="block text-xs text-ink-faint truncate">
                  {modelLabel} · {EXPERTISE_LABELS[expertiseLevel - 1]} · humour {HUMOR_LABELS[humorLevel - 1].toLowerCase()} · recherche web {webSearchEnabled ? 'activée' : 'désactivée'}
                </span>
              )}
            </span>
            <ChevronDown size={18} className={`text-ink-muted shrink-0 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {showAdvanced && (
            <div className="px-5 pb-5 space-y-5 border-t border-line pt-4">
              <div>
                <p className="text-sm font-bold text-ink-soft mb-2">Modèle IA</p>
                <div className="grid grid-cols-2 gap-2">
                  {models.map(m => (
                    <ChoiceCard key={m.id} active={model === m.id} onClick={() => setModel(m.id)} className="px-4 py-3">
                      <p className={`text-sm font-extrabold ${model === m.id ? 'text-action' : 'text-ink'}`}>{m.label}</p>
                      <p className="text-xs text-ink-muted mt-0.5">{m.desc}</p>
                    </ChoiceCard>
                  ))}
                </div>
              </div>

              <LevelSlider label="Maîtrise du sujet de l'interlocuteur" value={expertiseLevel}
                onChange={setExpertiseLevel} labels={EXPERTISE_LABELS} />
              <LevelSlider label="Humour" value={humorLevel} onChange={setHumorLevel}
                labels={HUMOR_LABELS} icons={HUMOR_ICONS} />

              <div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <Globe size={18} className="text-ink-muted shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold text-ink-soft">Recherche web</p>
                      <p className="text-xs text-ink-faint mt-0.5">Les agents pourront chercher des informations en temps réel.</p>
                    </div>
                  </div>
                  <Toggle checked={webSearchEnabled} onChange={setWebSearchEnabled} label="Recherche web" />
                </div>
                {webSearchEnabled && (
                  <p className="text-xs text-await bg-await-bg border border-await-border rounded-[10px] px-3 py-2 mt-3">
                    Chaque recherche est facturée en plus par Anthropic. À activer seulement si les agents ont besoin d'informations récentes.
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ── Lancement ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          {!canStart && !starting && (
            <p className="text-xs text-ink-faint">
              {!task.trim() ? 'Renseignez l’objectif pour lancer.' : 'Invitez au moins un agent.'}
            </p>
          )}
          <Button variant="primary" onClick={handleStart} disabled={!canStart} className="min-w-[220px]">
            {starting
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Démarrage…</>
              : <><Play size={16} aria-hidden="true" /> {autoPrepare && prepPossible ? 'Lancer la préparation' : 'Démarrer la réunion'}</>}
          </Button>
        </div>

      </div>
    </div>
  );
}
