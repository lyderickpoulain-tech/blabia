import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../utils/api';

// ── Palette agents ─────────────────────────────────────────────────────────────
const PALETTE = {
  Analyste:     { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   dot: 'bg-blue-500',   light: 'bg-blue-100' },
  Créatif:      { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-500', light: 'bg-purple-100' },
  Critique:     { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-blabia-orange', light: 'bg-orange-100' },
  Expert:       { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  dot: 'bg-green-500',  light: 'bg-green-100' },
  Synthésiseur: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', dot: 'bg-indigo-500', light: 'bg-indigo-100' },
  Chercheur:    { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-800',   dot: 'bg-cyan-500',   light: 'bg-cyan-100' },
  Stratège:     { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-800',   dot: 'bg-rose-500',   light: 'bg-rose-100' },
  Rédacteur:    { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-800',   dot: 'bg-pink-500',   light: 'bg-pink-100' },
};
const DEFAULT_P = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400', light: 'bg-gray-100' };
const col = (name) => PALETTE[name] || DEFAULT_P;

// ── Composants Markdown optimisés lecture ──────────────────────────────────────
const MD = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-gray-900 mb-4 mt-8 first:mt-0">{children}</h1>,
  h2: ({ children }) => (
    <h2 className="text-lg font-bold text-gray-800 mb-3 mt-7 pb-2 border-b border-gray-200">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-base font-semibold text-gray-800 mb-2 mt-5">{children}</h3>,
  p:  ({ children }) => <p className="text-gray-700 mb-4 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 space-y-1.5 list-none">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 space-y-1.5 list-decimal list-inside text-gray-700">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2.5 text-gray-700 leading-relaxed">
      <span className="text-blue-400 font-bold mt-1 shrink-0 text-xs">▸</span>
      <span>{children}</span>
    </li>
  ),
  strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em:         ({ children }) => <em className="italic text-gray-600">{children}</em>,
  hr:         () => <hr className="my-6 border-gray-200" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-300 pl-5 py-1 my-4 text-gray-600 italic bg-blue-50 rounded-r-lg">
      {children}
    </blockquote>
  ),
  code: ({ inline, children }) => inline
    ? <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
    : <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-sm font-mono mb-4"><code>{children}</code></pre>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-6 rounded-xl border border-gray-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-left font-semibold text-gray-700 px-4 py-3 bg-gray-50 border-b border-gray-200">{children}</th>
  ),
  td: ({ children }) => <td className="px-4 py-3 border-b border-gray-100 text-gray-700 last:border-0">{children}</td>,
};

// ── Bouton Copier le lien ──────────────────────────────────────────────────────
function CopyButton() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const input = document.createElement('input');
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const iconCheck = (
    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  );
  const iconLink = (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border transition-all min-h-[40px] ${
        copied
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-white border-gray-300 text-gray-600 hover:border-blue-300 hover:text-blabia-blue'
      }`}
    >
      {copied ? iconCheck : iconLink}
      <span className="hidden sm:inline">{copied ? 'Lien copié !' : 'Copier le lien'}</span>
    </button>
  );
}

// ── Chip agent complet (nom + rôle) ───────────────────────────────────────────
function AgentCard({ agent }) {
  const p = col(agent.name);
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${p.bg} ${p.border}`}>
      <div className={`w-10 h-10 rounded-full ${p.dot} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
        {agent.name[0]}
      </div>
      <div className="min-w-0">
        <p className={`font-semibold text-sm ${p.text}`}>{agent.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{agent.role}</p>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function SummaryView() {
  const { id: projectId, sid: sessionId } = useParams();
  const [project, setProject] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/projects/${projectId}`),
      api.get(`/projects/${projectId}/sessions/${sessionId}`)
    ])
      .then(([pRes, sRes]) => { setProject(pRes.data); setSession(sRes.data); })
      .catch(() => setFetchError('Impossible de charger ce compte-rendu.'))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  const agents  = Array.isArray(session?.agents) ? session.agents : [];
  const hasContent = session?.status === 'complete' && session?.summary;
  const date = session?.createdAt
    ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-white">
      {/* ── Barre supérieure ────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition shrink-0"
          >
            ← Retour au projet
          </Link>
          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-center">
            <span className="text-sm font-bold text-blabia-blue shrink-0">BlabIA</span>
            {project && (
              <>
                <span className="text-xs text-gray-300 shrink-0">·</span>
                <span className="text-sm text-gray-500 truncate">{project.name}</span>
              </>
            )}
          </div>
          <div className="shrink-0">
            <CopyButton />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        {/* ── Chargement ──────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blabia-blue" />
          </div>
        )}

        {/* ── Erreur ──────────────────────────────────────────────────────── */}
        {!loading && fetchError && (
          <div className="text-center py-24">
            <p className="text-gray-500 mb-4">{fetchError}</p>
            <Link to={`/projects/${projectId}`} className="text-blabia-blue hover:text-blabia-blue text-sm font-medium">
              ← Retour au projet
            </Link>
          </div>
        )}

        {/* ── Contenu ─────────────────────────────────────────────────────── */}
        {!loading && !fetchError && project && session && (
          <>
            {/* En-tête */}
            <div className="pt-10 pb-8">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-semibold text-blabia-blue uppercase tracking-widest">
                  Compte-rendu
                </span>
                {session.status !== 'complete' && (
                  <span className="text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                    Interrompue
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug mb-3">
                {session.task}
              </h1>

              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {project.name}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {date}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {agents.length} agent{agents.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="border-t border-gray-100 mb-8" />

            {/* Agents mobilisés */}
            {agents.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
                  Agents mobilisés
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {agents.map((agent, i) => <AgentCard key={i} agent={agent} />)}
                </div>
              </section>
            )}

            <div className="border-t border-gray-100 mb-8" />

            {/* Restitution finale ou message */}
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">
                Restitution finale
              </h2>

              {hasContent ? (
                (() => {
                  const summaryExchanges = Array.isArray(session.exchanges)
                    ? session.exchanges
                        .filter(e => e.type === 'summary')
                        .sort((a, b) => (a.turn || 1) - (b.turn || 1))
                    : [];
                  const allSummaries = summaryExchanges.length > 0
                    ? summaryExchanges
                    : [{ content: session.summary, turn: 1 }];

                  return allSummaries.map((s, idx) => (
                    <div key={idx}>
                      {idx > 0 && (
                        <div className="flex items-center gap-3 py-6 my-2">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4">
                            Tour {s.turn || idx + 1}
                          </span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}
                      <article className="prose-summary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{s.content}</ReactMarkdown>
                      </article>
                    </div>
                  ));
                })()
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-gray-200">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="font-medium text-gray-700 mb-1">Aucun compte-rendu disponible</p>
                  <p className="text-sm text-gray-400">
                    {session.status === 'interrupted'
                      ? 'Cette réunion a été interrompue avant d\'être finalisée.'
                      : 'La restitution de cette réunion n\'est pas disponible.'}
                  </p>
                </div>
              )}
            </section>

            {/* Pied de page */}
            <div className="border-t border-gray-100 mt-12 pt-6 flex items-center justify-between">
              <Link
                to={`/projects/${projectId}`}
                className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition"
              >
                ← Retour au projet
              </Link>
              <span className="text-xs text-gray-300">Généré avec BlabIA</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
