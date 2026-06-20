import { useState } from 'react';
import DecisionCard from '../DecisionCard';
import AgentScopeSelector from './AgentScopeSelector';

// ── Constantes locales ────────────────────────────────────────────────────────

const MILESTONE_TYPES = [
  { id: 'meeting',    icon: '🤝', label: 'Réunion'     },
  { id: 'technical',  icon: '⚙️', label: 'Technique'   },
  { id: 'milestone',  icon: '🎯', label: 'Jalon'       },
  { id: 'stack_check',icon: '🔧', label: 'Stack check' },
  { id: 'synthesis',  icon: '📄', label: 'Synthèse'    },
  { id: 'claude_code',icon: '💻', label: 'Claude Code' },
];

const POSITION_OPTIONS = [
  { id: 'end',   label: 'À la fin de la timeline' },
  { id: 'after', label: 'Après l\'étape en cours' },
];

// ── SuggestionAgentCard ───────────────────────────────────────────────────────

function SuggestionAgentCard({ suggestion, idx, onInvite, onDismiss, onCreateAndInvite }) {
  const [form,  setForm]  = useState(suggestion.createForm || { name: suggestion.name, role: suggestion.role, systemPrompt: '' });
  const [scope, setScope] = useState('project');

  if (suggestion.invited) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          ✅ {suggestion.name} a rejoint la réunion
        </span>
      </div>
    );
  }

  return (
    <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-amber-800">
            💡 {suggestion.reason || 'Suggestion d\'agent'}
          </p>
          <p className="text-sm font-medium text-gray-800 mt-0.5">
            {suggestion.name}
            {suggestion.role && <span className="text-xs text-gray-500 font-normal ml-1">— {suggestion.role}</span>}
          </p>
        </div>
        <button onClick={() => onDismiss(idx)} className="text-gray-300 hover:text-gray-500 text-xs shrink-0 mt-0.5">✕</button>
      </div>

      {suggestion.showCreate ? (
        <div className="space-y-1.5">
          <input
            type="text" placeholder="Nom" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          <input
            type="text" placeholder="Rôle" value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          <textarea
            placeholder="Prompt système (optionnel)" value={form.systemPrompt}
            onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
            rows={2} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
          />
          <AgentScopeSelector scope={scope} onChange={setScope} size="xs" />
          <div className="flex gap-2">
            <button
              onClick={() => onCreateAndInvite(idx, form, scope)}
              disabled={!form.name.trim() || suggestion.inviting}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
            >
              {suggestion.inviting ? 'Création…' : 'Créer et inviter'}
            </button>
            <button onClick={() => onDismiss(idx)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => onInvite(idx)}
            disabled={suggestion.inviting}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
          >
            {suggestion.inviting ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '+ Inviter'}
          </button>
          <button onClick={() => onDismiss(idx)} className="border border-amber-300 text-amber-700 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-amber-100">
            Ignorer
          </button>
        </div>
      )}
    </div>
  );
}

// ── SuggestionStepCard ────────────────────────────────────────────────────────

function SuggestionStepCard({ suggestion, idx, onAdd, onDismiss }) {
  const [form, setForm] = useState({
    title:    suggestion.title || '',
    type:     suggestion.type || 'meeting',
    position: 'end',
  });

  if (suggestion.added) {
    return (
      <div className="flex justify-center mx-4">
        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          ✅ Étape ajoutée à la timeline
        </span>
      </div>
    );
  }

  return (
    <div className="mx-4 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-blabia-blue">📅 Étape timeline suggérée</p>
        <button onClick={() => onDismiss(idx)} className="text-gray-300 hover:text-gray-500 text-xs shrink-0">✕</button>
      </div>

      {/* Titre éditable */}
      <input
        type="text"
        value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        placeholder="Titre de l'étape"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      />

      {/* Sélecteur de type (6 boutons) */}
      <div className="grid grid-cols-3 gap-1">
        {MILESTONE_TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setForm(p => ({ ...p, type: t.id }))}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition ${
              form.type === t.id
                ? 'bg-blabia-blue text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            <span>{t.icon}</span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Sélecteur de position */}
      <div className="flex gap-1.5">
        {POSITION_OPTIONS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setForm(f => ({ ...f, position: p.id }))}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition ${
              form.position === p.id
                ? 'bg-blabia-blue text-white border-blabia-blue'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onAdd(idx, form)}
          disabled={!form.title.trim() || suggestion.adding}
          className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {suggestion.adding
            ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : '+ Ajouter à la timeline'}
        </button>
        <button
          onClick={() => onDismiss(idx)}
          className="border border-blue-300 text-blabia-blue text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-blue-100"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}

// ── ConversationFeed ──────────────────────────────────────────────────────────

export default function ConversationFeed({
  messages, activeAgents, streamingAgent, streamingText, streamingReason,
  agentSuggestions, onInviteSuggested, onDismissSuggestion, onCreateAndInvite,
  stepSuggestions, onAddStep, onDismissStep,
  session, project, onAutoLaunch, isClosed,
  pendingDecisionId, onAnswerDecision, onDeferDecision, onDelegateDecision,
  agentColors, deliverableTypes,
}) {
  function agentColor(name) {
    const idx = activeAgents.findIndex(a => a.name === name);
    return agentColors[(idx >= 0 ? idx : 0) % agentColors.length];
  }

  if (messages.length === 0 && !streamingAgent) {
    const intentionKey0 = Array.isArray(session?.intention) ? session.intention[0]
      : (() => { try { const p = JSON.parse(session?.intention || '[]'); return p[0] || 'synthesis'; } catch { return 'synthesis'; } })();
    const intentionMeta0 = deliverableTypes.find(d => d.id === intentionKey0) || deliverableTypes[0];
    const modelLabel = session?.model?.includes('opus') ? 'Claude Opus'
      : session?.model?.includes('haiku') ? 'Claude Haiku'
      : 'Claude Sonnet';

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-8">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">🎙 Réunion prête à démarrer</h3>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0 pt-0.5">Objectif</span>
              <span className="text-xs text-gray-700 font-medium leading-snug">{session?.task}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0">Livrable</span>
              <span className="text-xs text-gray-700">{intentionMeta0.icon} {intentionMeta0.label}</span>
            </div>
            {activeAgents.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0 pt-0.5">Agents</span>
                <div className="flex flex-wrap gap-1">
                  {activeAgents.map(a => (
                    <span key={a.id} className="text-xs bg-blabia-blue-light text-blabia-blue px-2 py-0.5 rounded-full font-medium">{a.name}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0">Modèle</span>
              <span className="text-xs text-gray-700">{modelLabel}</span>
            </div>
          </div>

          {!isClosed && (
            <div className="space-y-2 pt-1">
              <button
                onClick={onAutoLaunch}
                disabled={!session || !project}
                className="w-full flex items-center justify-center gap-2 bg-blabia-blue hover:bg-blabia-blue-dark text-white font-semibold py-3 px-4 rounded-xl transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🎙 Lancer automatiquement
              </button>
              <p className="text-xs text-gray-400 text-center">— ou tape ton premier message —</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      {messages.map((msg) => {
        // Décision structurée v3.2
        if (msg.role === 'system' && msg.type === 'decision') {
          return (
            <DecisionCard
              key={msg.id}
              message={msg}
              onAnswer={onAnswerDecision}
              onDefer={onDeferDecision}
              onDelegate={onDelegateDecision}
              disabled={!!pendingDecisionId && pendingDecisionId !== msg.id}
            />
          );
        }

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
          const hasAttachments = msg.attachments?.length > 0;
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[75%] space-y-1.5">
                {/* Pièces jointes */}
                {hasAttachments && (
                  <div className="flex gap-2 flex-wrap justify-end">
                    {msg.attachments.map((a, i) => {
                      const fileIcon = a.isPdf ? '📕'
                        : a.isImage ? '🖼️'
                        : (a.name?.toLowerCase().endsWith('.docx')) ? '📘'
                        : (a.name?.toLowerCase().endsWith('.xlsx') || a.name?.toLowerCase().endsWith('.csv')) ? '📗'
                        : '📄';
                      return a.isImage && a.dataUrl ? (
                        <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer" title={a.name}>
                          <img src={a.dataUrl} alt={a.name} className="w-20 h-20 rounded-xl object-cover border border-blue-200 hover:opacity-90 transition cursor-zoom-in" />
                        </a>
                      ) : (
                        <div key={i} className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs text-blue-800 max-w-[160px]">
                          <span>{fileIcon}</span>
                          <span className="truncate">{a.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${
                  msg.pinned
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-blabia-blue text-white'
                }`}>
                  {msg.content || <span className="opacity-60 italic">— fichier joint —</span>}
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
          const color = agentColor(msg.agentName);
          const agent = activeAgents.find(a => a.name === msg.agentName);
          const isDecision = msg.type === 'decision' || msg.pinned;

          return (
            <div key={msg.id} className="flex items-start gap-3 group">
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${color.avatar} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}>
                {agent?.emoji || msg.agentName?.[0] || '?'}
              </div>
              <div className="max-w-[75%]">
                <p className={`text-xs font-semibold ${msg.reason ? 'mb-0.5' : 'mb-1'} ${color.text}`}>{msg.agentName}</p>
                {msg.reason && (
                  <p className={`text-xs italic mb-1 ${/vulgarise|reformule/i.test(msg.reason) ? 'text-blue-400' : 'text-gray-400'}`}>↳ {msg.reason}</p>
                )}
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
                  isDecision
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : `${color.bg} ${color.text}`
                }`}>
                  {msg.content}
                </div>
                {msg.sources?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {msg.sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate">
                        🌐 <span className="truncate">{s.title || s.url}</span>
                      </a>
                    ))}
                  </div>
                )}
                {msg.interrupted ? (
                  <p className="text-xs text-blabia-orange mt-1 flex items-center gap-1">
                    ⚠️ Interrompu
                  </p>
                ) : isDecision ? (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    📌 Décision
                  </p>
                ) : null}
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Streaming en cours */}
      {streamingAgent && (
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full ${agentColor(streamingAgent).avatar} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}>
            {activeAgents.find(a => a.name === streamingAgent)?.emoji || streamingAgent?.[0] || '?'}
          </div>
          <div className="max-w-[75%]">
            <p className={`text-xs font-semibold ${streamingReason ? 'mb-0.5' : 'mb-1'} ${agentColor(streamingAgent).text} flex items-center gap-1.5`}>
              {streamingAgent}
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </p>
            {streamingReason && (
              <p className="text-xs italic text-gray-400 mb-1">↳ {streamingReason}</p>
            )}
            <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${agentColor(streamingAgent).bg} ${agentColor(streamingAgent).text}`}>
              {streamingText || <span className="opacity-50">Rédaction…</span>}
            </div>
          </div>
        </div>
      )}

      {/* Cartes suggestion agent (non-bloquantes) */}
      {agentSuggestions?.filter(s => !s.dismissed).map((s, i) => (
        <SuggestionAgentCard
          key={i} suggestion={s} idx={i}
          onInvite={onInviteSuggested}
          onDismiss={onDismissSuggestion}
          onCreateAndInvite={onCreateAndInvite}
        />
      ))}

      {/* Cartes suggestion étape timeline (non-bloquantes) */}
      {stepSuggestions?.filter(s => !s.dismissed).map((s, i) => (
        <SuggestionStepCard
          key={i} suggestion={s} idx={i}
          onAdd={onAddStep}
          onDismiss={onDismissStep}
        />
      ))}

    </div>
  );
}
