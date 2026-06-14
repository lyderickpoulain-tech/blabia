import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ProjectLayout, { useProjectPanel } from '../components/ProjectLayout';
import api from '../utils/api';

// ── Palette agent (initiale + couleur de bulle) ───────────────────────────────

const AGENT_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-800',   avatar: 'bg-blue-500'   },
  { bg: 'bg-purple-100', text: 'text-purple-800',  avatar: 'bg-purple-500' },
  { bg: 'bg-green-100',  text: 'text-green-800',   avatar: 'bg-green-500'  },
  { bg: 'bg-rose-100',   text: 'text-rose-800',    avatar: 'bg-rose-500'   },
  { bg: 'bg-amber-100',  text: 'text-amber-800',   avatar: 'bg-amber-500'  },
  { bg: 'bg-cyan-100',   text: 'text-cyan-800',    avatar: 'bg-cyan-500'   },
];

function agentColor(name, activeAgents) {
  const idx = activeAgents.findIndex(a => a.name === name);
  return AGENT_COLORS[(idx >= 0 ? idx : 0) % AGENT_COLORS.length];
}

// ── Statut badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  open:      { label: 'En cours',   cls: 'bg-blue-100 text-blue-700'   },
  accepted:  { label: 'Acceptée',   cls: 'bg-green-100 text-green-700'  },
  abandoned: { label: 'Abandonnée', cls: 'bg-gray-100 text-gray-500'    },
};

// ── ConversationFeed ──────────────────────────────────────────────────────────

function ConversationFeed({ messages, activeAgents, streamingAgent, streamingText }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  if (messages.length === 0 && !streamingAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
        <span className="text-3xl">☕</span>
        <p>La réunion vient de commencer.</p>
        <p className="text-xs text-gray-300">Envoie ton premier message pour lancer les échanges.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      {messages.map((msg) => {
        if (msg.role === 'system') {
          return (
            <div key={msg.id} className="flex justify-center">
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                {msg.content}
              </span>
            </div>
          );
        }

        if (msg.role === 'human') {
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[75%]">
                <div className={`px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${
                  msg.pinned
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-blue-600 text-white'
                }`}>
                  {msg.content}
                </div>
                {msg.pinned && (
                  <p className="text-xs text-amber-600 text-right mt-1 flex items-center justify-end gap-1">
                    📌 Décision
                  </p>
                )}
              </div>
            </div>
          );
        }

        if (msg.role === 'agent') {
          const color = agentColor(msg.agentName, activeAgents);
          const agent = activeAgents.find(a => a.name === msg.agentName);
          const isDecision = msg.type === 'decision' || msg.pinned;

          return (
            <div key={msg.id} className="flex items-start gap-3">
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${color.avatar} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}>
                {agent?.emoji || msg.agentName?.[0] || '?'}
              </div>
              <div className="max-w-[75%]">
                <p className={`text-xs font-semibold mb-1 ${color.text}`}>{msg.agentName}</p>
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
                  isDecision
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : `${color.bg} ${color.text}`
                }`}>
                  {msg.content}
                </div>
                {isDecision && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    📌 Décision
                  </p>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Streaming en cours */}
      {streamingAgent && (
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full ${agentColor(streamingAgent, activeAgents).avatar} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}>
            {activeAgents.find(a => a.name === streamingAgent)?.emoji || streamingAgent?.[0] || '?'}
          </div>
          <div className="max-w-[75%]">
            <p className={`text-xs font-semibold mb-1 ${agentColor(streamingAgent, activeAgents).text} flex items-center gap-1.5`}>
              {streamingAgent}
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </p>
            <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${agentColor(streamingAgent, activeAgents).bg} ${agentColor(streamingAgent, activeAgents).text}`}>
              {streamingText || <span className="opacity-50">Rédaction…</span>}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// ── MeetingRoom ───────────────────────────────────────────────────────────────

export default function MeetingRoom() {
  const { id: projectId, sid: sessionId } = useParams();
  const navigate = useNavigate();
  const { refreshPanel } = useProjectPanel();

  const [session,      setSession]      = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');

  // États streaming (remplis aux sous-étapes suivantes)
  const [streamingAgent, setStreamingAgent] = useState(null);
  const [streamingText,  setStreamingText]  = useState('');
  const [isStreaming,    setIsStreaming]     = useState(false);

  // Chargement initial de la session
  useEffect(() => {
    setLoading(true);
    api.get(`/projects/${projectId}/sessions/${sessionId}`)
      .then(({ data }) => {
        setSession(data);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setActiveAgents(Array.isArray(data.activeAgents) ? data.activeAgents : []);
      })
      .catch(() => setLoadError('Session introuvable ou accès refusé.'))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  const isClosed = session?.status === 'accepted' || session?.status === 'abandoned';
  const badge    = STATUS_BADGE[session?.status] || STATUS_BADGE.open;

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ProjectLayout projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProjectLayout>
    );
  }

  if (loadError || !session) {
    return (
      <ProjectLayout projectId={projectId}>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
          <p className="text-sm">{loadError || 'Session introuvable.'}</p>
          <Link to={`/projects/${projectId}`} className="text-sm text-blue-600 hover:underline">
            ← Retour au projet
          </Link>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout projectId={projectId}>
      {/*
        Structure flex colonne qui remplit l'espace disponible dans le main
        (100vh - header ~53px - py-6 top/bottom ~48px)
      */}
      <div
        className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
        style={{ height: 'calc(100vh - 10rem)' }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-100 px-4 py-3 space-y-2">
          {/* Ligne 1 : retour + titre + statut */}
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${projectId}`}
              className="text-gray-400 hover:text-gray-600 transition text-sm shrink-0"
            >
              ←
            </Link>
            <p className="text-sm font-semibold text-gray-800 truncate flex-1" title={session.task}>
              🎯 {session.task}
            </p>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Ligne 2 : chips agents */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeAgents.map((agent, i) => {
              const color = AGENT_COLORS[i % AGENT_COLORS.length];
              return (
                <span
                  key={agent.id || agent.name}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color.bg} ${color.text}`}
                >
                  <span>{agent.emoji || '🤖'}</span>
                  {agent.name}
                </span>
              );
            })}
            {/* Bouton + Agent — placeholder sous-étape 3 */}
            {!isClosed && (
              <button
                disabled
                className="inline-flex items-center gap-1 text-xs text-gray-400 border border-dashed border-gray-300 px-2.5 py-1 rounded-full opacity-50 cursor-not-allowed"
                title="Disponible à la sous-étape 3"
              >
                + Agent
              </button>
            )}
          </div>
        </div>

        {/* ── Fil de conversation ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <ConversationFeed
            messages={messages}
            activeAgents={activeAgents}
            streamingAgent={streamingAgent}
            streamingText={streamingText}
          />
        </div>

        {/* ── Barre de saisie ─────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 p-3 space-y-2">
          {isClosed ? (
            <div className="flex items-center justify-center py-2">
              <p className={`text-sm font-medium ${session.status === 'accepted' ? 'text-green-600' : 'text-gray-400'}`}>
                {session.status === 'accepted' ? '✅ Réunion acceptée' : '🚫 Réunion abandonnée'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <textarea
                  disabled={isStreaming || isClosed}
                  placeholder={isStreaming ? 'Les agents répondent…' : 'Tape ton message… (Ctrl+Entrée pour envoyer)'}
                  rows={2}
                  className="flex-1 resize-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 transition disabled:bg-gray-50 disabled:text-gray-400"
                  readOnly
                />
                <button
                  disabled
                  className="shrink-0 w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white opacity-50 cursor-not-allowed"
                  title="Disponible à la sous-étape 2"
                >
                  ▶
                </button>
              </div>
              {/* Bouton Clore — placeholder sous-étape 5 */}
              <button
                disabled
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 opacity-50 cursor-not-allowed"
                title="Disponible à la sous-étape 5"
              >
                🔴 Clore la réunion
              </button>
            </>
          )}
        </div>

      </div>
    </ProjectLayout>
  );
}
