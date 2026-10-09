import { useState } from 'react';

export default function MeetingInputBar({
  onIllustrate,
  pendingDecisionsCount = 0,
  isClosed,
  session,
  currentIntention,
  handleReopen,
  setShowDeliverable,
  sendError,
  fileInputRef,
  processFiles,
  attachments,
  setAttachments,
  showMentionDropdown,
  mentionSuggestions,
  mentionSelectedIdx,
  handleSelectMention,
  activeAgents,
  agentColors,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  isDragging,
  isStreaming,
  pendingDecisionId,
  inputText,
  handleInputChange,
  handleKeyDown,
  handleSend,
  handleTextareaFocus,
  setShowCloseModal,
}) {
  // v5.0 phase 5 : demande d'illustration (bouton 🎨)
  const [showIllustrate, setShowIllustrate] = useState(false);
  const [illustrateText, setIllustrateText] = useState('');
  const submitIllustrate = () => {
    const request = illustrateText.trim();
    if (!request) return;
    onIllustrate?.(request);
    setIllustrateText('');
    setShowIllustrate(false);
  };

  function agentColor(name) {
    const idx = activeAgents.findIndex(a => a.name === name);
    return agentColors[(idx >= 0 ? idx : 0) % agentColors.length];
  }

  return (
    <div className="shrink-0 border-t border-gray-100 p-3 space-y-2 relative">
      {isClosed ? (
        <div className="space-y-2 py-1 px-1">
          <div className="flex items-center justify-between gap-3">
            <p className={`text-sm font-medium ${session.status === 'accepted' ? 'text-green-600' : 'text-gray-400'}`}>
              {session.status === 'accepted' ? '✅ Réunion acceptée' : '🚫 Réunion abandonnée'}
            </p>
            <button
              onClick={handleReopen}
              className="shrink-0 text-xs font-medium text-blabia-blue hover:text-blabia-blue border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
            >
              🔁 Reprendre
            </button>
          </div>
          {session.status === 'accepted' && (
            <div className="flex gap-2">
              {session.summary && (
                <button
                  onClick={() => setShowDeliverable('summary')}
                  className="flex-1 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-semibold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  📋 Voir le compte-rendu
                </button>
              )}
              {currentIntention === 'claude_code' && session.deliverable && (
                <button
                  onClick={() => setShowDeliverable('deliverable')}
                  className="flex-1 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-semibold py-2 rounded-xl transition flex items-center justify-center gap-1.5"
                >
                  💻 Voir le prompt
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {sendError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <span>⚠️</span> {sendError}
            </p>
          )}

          {/* Input fichier caché */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.docx,.xlsx,.csv,text/*,application/json"
            className="hidden"
            onChange={e => { processFiles(e.target.files); e.target.value = ''; }}
          />

          {/* Bande de prévisualisation des pièces jointes */}
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((a, i) => (
                <div key={i} className="relative group">
                  {a.isImage ? (
                    <img src={a.dataUrl} alt={a.name} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  ) : (
                    <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-700 max-w-[140px]">
                      <span>{a.isPdf ? '📕' : a.name?.toLowerCase().endsWith('.docx') ? '📘' : a.name?.toLowerCase().endsWith('.xlsx') || a.name?.toLowerCase().endsWith('.csv') ? '📗' : '📄'}</span>
                      <span className="truncate">{a.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Dropdown @mention */}
          {showMentionDropdown && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20 py-1">
              {mentionSuggestions.map((agent, i) => (
                <button
                  key={agent.id || agent.name}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); handleSelectMention(agent); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition text-left ${
                    i === mentionSelectedIdx ? 'bg-blue-50 text-blabia-blue' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${agentColor(agent.name).avatar}`}>
                    {agent.name?.[0]?.toUpperCase()}
                  </span>
                  <span className="font-medium">@{agent.name}</span>
                  <span className="text-xs text-gray-400 truncate">{agent.role}</span>
                </button>
              ))}
            </div>
          )}

          {showIllustrate && (
            <div className="flex flex-wrap items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl p-2">
              <span className="text-sm">🎨</span>
              <input
                autoFocus
                value={illustrateText}
                onChange={e => setIllustrateText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitIllustrate(); if (e.key === 'Escape') setShowIllustrate(false); }}
                placeholder="Que veux-tu voir ? (ex. le parcours d'un client, la maquette de l'accueil…)"
                className="flex-1 min-w-[200px] text-sm border border-purple-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-300"
              />
              <button
                onClick={submitIllustrate}
                disabled={!illustrateText.trim() || isStreaming || !!pendingDecisionId}
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                Illustrer
              </button>
              <button onClick={() => setShowIllustrate(false)} className="text-xs text-gray-400 hover:text-gray-600">Annuler</button>
            </div>
          )}

          {/* Zone drag + saisie */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex items-end gap-2 rounded-xl transition-colors ${isDragging ? 'ring-2 ring-blue-400 bg-blue-50 p-1' : ''}`}
          >
            {/* Bouton 📎 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || !!pendingDecisionId || attachments.length >= 3}
              title={attachments.length >= 3 ? 'Maximum 3 fichiers atteint' : 'Joindre une image, PDF, Word, Excel ou texte'}
              className="shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-blabia-blue hover:bg-blue-50 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              📎
            </button>
            {/* Bouton 🎨 Illustrer */}
            <button
              type="button"
              onClick={() => setShowIllustrate(s => !s)}
              disabled={isStreaming || !!pendingDecisionId}
              title="Illustrer : demander un schéma, une maquette ou un visuel"
              className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed ${
                showIllustrate ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
              }`}
            >
              🎨
            </button>
            <textarea
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleTextareaFocus}
              placeholder={
                isStreaming || pendingDecisionId
                  ? '✍️ Tape pour interrompre et envoyer…'
                  : 'Tape ton message… (Ctrl+Entrée pour envoyer)'
              }
              rows={2}
              className="flex-1 resize-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
            />
            <button
              onClick={handleSend}
              disabled={!isStreaming && !pendingDecisionId && !inputText.trim() && attachments.length === 0}
              title={isStreaming ? 'Envoyer (interrompt les agents en cours)' : pendingDecisionId ? 'Envoyer (annule la décision en attente)' : undefined}
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white transition disabled:opacity-40 disabled:cursor-not-allowed ${
                isStreaming ? 'bg-blabia-orange hover:bg-blabia-orange' : 'bg-blabia-blue hover:bg-blabia-blue'
              }`}
            >
              ▶
            </button>
          </div>

          {/* Bouton Clore la réunion */}
          <button
            onClick={() => {
              // Décisions encore sans réponse (dont celles de la préparation) : confirmer avant de clore
              if (pendingDecisionsCount > 0 && !window.confirm(
                `${pendingDecisionsCount} décision${pendingDecisionsCount > 1 ? 's sont' : ' est'} encore sans réponse. Les agents attendent vos arbitrages pour avancer. Clore la réunion quand même ?`
              )) return;
              setShowCloseModal(true);
            }}
            disabled={isStreaming || !!pendingDecisionId}
            className="w-full text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 py-2 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🏁 Clore la réunion
          </button>
        </>
      )}
    </div>
  );
}
