import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Layout from '../components/Layout';
import SessionRunner from '../components/SessionRunner';
import api from '../utils/api';

// Composants Markdown stylés Tailwind
const MD = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mb-3 mt-6 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold text-gray-800 mb-2 mt-5 pb-1 border-b border-gray-100">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-gray-700 mb-3 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 space-y-1 list-none">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 space-y-1 list-decimal list-inside text-sm text-gray-700">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
      <span className="text-blue-400 font-bold mt-0.5 shrink-0">·</span>
      <span>{children}</span>
    </li>
  ),
  strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em:         ({ children }) => <em className="italic text-gray-600">{children}</em>,
  hr:         ()             => <hr className="my-5 border-gray-200" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-200 pl-4 my-3 text-gray-600 italic text-sm">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="text-sm w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left font-semibold text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border border-gray-200 text-gray-700">{children}</td>,
};

// Palette par agent
const AGENT_PALETTE = {
  Analyste:     { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  Créatif:      { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-800',  dot: 'bg-purple-500' },
  Critique:     { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  dot: 'bg-orange-500' },
  Expert:       { bg: 'bg-green-50',   border: 'border-green-200',   text: 'text-green-800',   dot: 'bg-green-500' },
  Synthésiseur: { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-800',  dot: 'bg-indigo-500' },
  Chercheur:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-800',    dot: 'bg-cyan-500' },
  Stratège:     { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    dot: 'bg-rose-500' },
  Rédacteur:    { bg: 'bg-pink-50',    border: 'border-pink-200',    text: 'text-pink-800',    dot: 'bg-pink-500' },
};
const DEFAULT_PALETTE = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', dot: 'bg-gray-400' };

function AgentChip({ agent }) {
  const p = AGENT_PALETTE[agent.name] || DEFAULT_PALETTE;
  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${p.bg} ${p.border} transition`}>
      <div className={`w-9 h-9 rounded-full ${p.dot} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
        {agent.name[0]}
      </div>
      <div className="min-w-0">
        <p className={`font-semibold text-sm ${p.text}`}>{agent.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{agent.role}</p>
      </div>
    </div>
  );
}

function ModeCard({ value, current, label, description, icon, onChange }) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left w-full transition ${
        active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className="text-xl mt-0.5">{icon}</span>
      <div>
        <p className={`font-semibold text-sm ${active ? 'text-blue-700' : 'text-gray-800'}`}>{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>
      </div>
      {active && (
        <div className="ml-auto shrink-0 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center mt-0.5">
          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
        </div>
      )}
    </button>
  );
}

// ── Phases ─────────────────────────────────────────────────────────────────────
// 'input'    → formulaire tâche + mode
// 'forming'  → chargement (appel API formation équipe)
// 'formed'   → agents affichés + bouton Démarrer
// 'running'  → SSE en cours (SessionRunner)
// 'complete' → restitution finale

export default function NewSession() {
  const { id: projectId } = useParams();

  const [phase, setPhase]             = useState('input');
  const [task, setTask]               = useState('');
  const [mode, setMode]               = useState('realtime');
  const [session, setSession]         = useState(null);
  const [plan, setPlan]               = useState('');
  const [error, setError]             = useState('');
  const [finalSummary, setFinalSummary] = useState(null);

  // ── Phase 1 → 2 : formation de l'équipe ──────────────────────────────────
  const handleFormTeam = async () => {
    if (!task.trim()) return;
    setError('');
    setPhase('forming');
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions`, { task: task.trim(), mode });
      setSession(data.session);
      setPlan(data.plan);
      setPhase('formed');
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de la formation de l'équipe");
      setPhase('input');
    }
  };

  // ── Phase 2 → 3 : lancement SSE ─────────────────────────────────────────
  const handleStartRun = () => {
    setPhase('running');
  };

  // ── Phase 3 → 4 : fin de session, restitution ────────────────────────────
  const handleComplete = (summary) => {
    setFinalSummary(summary);
    setPhase('complete');
  };

  // ── Réinitialiser pour une nouvelle session ────────────────────────────────
  const handleNewSession = () => {
    setPhase('input');
    setTask('');
    setMode('realtime');
    setSession(null);
    setPlan('');
    setFinalSummary(null);
    setError('');
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5"
        >
          ← Retour au projet
        </Link>

        {/* ── PHASE INPUT / FORMING ─────────────────────────────────────── */}
        {(phase === 'input' || phase === 'forming') && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h1 className="text-xl font-bold text-gray-900">Nouvelle session</h1>
            <p className="text-gray-500 text-sm mt-1 mb-6">
              Décrivez votre tâche — les agents IA vont collaborer pour vous.
            </p>

            <div className="space-y-5">
              {/* Textarea tâche */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Votre tâche ou idée <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  disabled={phase === 'forming'}
                  rows={5}
                  placeholder="Ex : Rédiger une stratégie de lancement pour notre nouveau produit, en ciblant les 25-40 ans sur LinkedIn et Instagram…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none disabled:bg-gray-50 disabled:text-gray-400"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {task.length} caractère{task.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Sélecteur de mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mode d'affichage
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ModeCard
                    value="realtime"
                    current={mode}
                    label="Temps réel"
                    description="Suivez chaque échange agent par agent au fur et à mesure"
                    icon="⚡"
                    onChange={setMode}
                  />
                  <ModeCard
                    value="summary"
                    current={mode}
                    label="Résumé final"
                    description="Recevez directement la restitution finale synthétisée"
                    icon="📋"
                    onChange={setMode}
                  />
                </div>
              </div>

              {/* Erreur */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                  <span className="mt-0.5">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Bouton lancer */}
              <button
                onClick={handleFormTeam}
                disabled={!task.trim() || phase === 'forming'}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {phase === 'forming' ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Formation de l'équipe en cours…
                  </>
                ) : (
                  'Lancer les agents →'
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── PHASE FORMED : équipe affichée, avant lancement ─────────────── */}
        {phase === 'formed' && session && (
          <div className="space-y-4">
            {/* Résumé tâche */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-green-500">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                </span>
                <span className="text-sm font-semibold text-gray-700">Équipe prête</span>
                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                  session.mode === 'realtime' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {session.mode === 'realtime' ? '⚡ Temps réel' : '📋 Résumé'}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{session.task}</p>
            </div>

            {/* Chips */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-3">
                {session.agents.length} agents mobilisés
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {session.agents.map((agent, i) => (
                  <AgentChip key={i} agent={agent} />
                ))}
              </div>
              {plan && (
                <div className="mt-4 flex items-start gap-2 p-3.5 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="text-blue-400 mt-0.5">🗺</span>
                  <div>
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-0.5">Plan d'action</p>
                    <p className="text-sm text-blue-900 leading-relaxed">{plan}</p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleStartRun}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-sm"
            >
              Démarrer les échanges →
            </button>
          </div>
        )}

        {/* ── PHASE RUNNING : SSE en cours ─────────────────────────────────── */}
        {phase === 'running' && session && (
          <div className="space-y-4">
            {/* Compact task bar */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                session.mode === 'realtime' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {session.mode === 'realtime' ? '⚡ Temps réel' : '📋 Résumé'}
              </span>
              <p className="text-sm text-gray-600 truncate">{session.task}</p>
            </div>
            {/* Orchestration SSE */}
            <SessionRunner
              session={session}
              projectId={projectId}
              onComplete={handleComplete}
              onRetry={() => setPhase('formed')}
            />
          </div>
        )}

        {/* ── PHASE COMPLETE : restitution finale ──────────────────────────── */}
        {phase === 'complete' && session && finalSummary && (
          <div className="space-y-4">

            {/* Barre tâche + badge Sauvegardée */}
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-green-500 shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
              </span>
              <p className="text-sm text-gray-700 truncate flex-1">{session.task}</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full shrink-0">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Sauvegardée
              </span>
            </div>

            {/* Bloc restitution mis en valeur */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

              {/* En-tête gradient */}
              <div className="px-6 py-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-b border-blue-100">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">Restitution finale</p>
                    <h2 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">{session.task}</h2>
                  </div>
                  <span className="text-xs text-blue-500 bg-white border border-blue-200 px-2 py-1 rounded-lg shrink-0 font-medium">
                    {new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Chips agents */}
                <div className="flex flex-wrap gap-1.5">
                  {session.agents.map((agent, i) => {
                    const p = AGENT_PALETTE[agent.name] || DEFAULT_PALETTE;
                    return (
                      <span key={i} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${p.bg} ${p.border} ${p.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                        {agent.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Corps markdown */}
              <div className="px-6 py-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                  {finalSummary}
                </ReactMarkdown>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to={`/projects/${projectId}/session/${session.id}/summary`}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Voir le compte-rendu
              </Link>
              <button
                onClick={handleNewSession}
                className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-3 rounded-xl transition text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nouvelle session
              </button>
            </div>

            <Link
              to={`/projects/${projectId}`}
              className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition py-1"
            >
              ← Retour au projet
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
