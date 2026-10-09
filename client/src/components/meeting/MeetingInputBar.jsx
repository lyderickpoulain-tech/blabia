import { useState, useEffect } from 'react';
import { Paperclip, Image as ImageIcon, ArrowRight, X, RotateCcw, FileText, Code2 } from 'lucide-react';
import { Button, IconButton } from '../ui';

// Barre de saisie compacte (refonte UX v5.1) : une ligne qui s'agrandit avec le
// texte, pièces jointes, @mentions, demande d'illustration. « Conclure » est
// dans l'en-tête de la réunion.
export default function MeetingInputBar({
  isClosed, session, currentIntention, handleReopen, setShowDeliverable,
  sendError, fileInputRef, processFiles, attachments, setAttachments,
  showMentionDropdown, mentionSuggestions, mentionSelectedIdx, handleSelectMention,
  activeAgents, agentColors,
  handleDragOver, handleDragLeave, handleDrop, isDragging,
  isStreaming, pendingDecisionId,
  inputText, handleInputChange, handleKeyDown, handleSend, handleTextareaFocus,
  onIllustrate, inputRef,
}) {
  const [showIllustrate, setShowIllustrate] = useState(false);
  const [illustrateText, setIllustrateText] = useState('');

  // Hauteur automatique : 1 à 5 lignes
  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputText, inputRef]);

  const submitIllustrate = () => {
    const request = illustrateText.trim();
    if (!request) return;
    onIllustrate?.(request);
    setIllustrateText('');
    setShowIllustrate(false);
  };

  const agentColor = (name) => {
    const idx = activeAgents.findIndex(a => a.name === name);
    return agentColors[(idx >= 0 ? idx : 0) % agentColors.length];
  };

  if (isClosed) {
    return (
      <div className="shrink-0 bg-white border-t border-line px-4 py-2">
        <div className="max-w-[820px] mx-auto flex flex-wrap items-center gap-2">
          <p className={`text-sm font-bold flex-1 ${session.status === 'accepted' ? 'text-ok' : 'text-ink-faint'}`}>
            {session.status === 'accepted' ? 'Réunion conclue' : 'Réunion abandonnée'}
          </p>
          {session.status === 'accepted' && session.summary && (
            <Button size="sm" variant="secondary" onClick={() => setShowDeliverable('summary')}><FileText size={15} /> Compte-rendu</Button>
          )}
          {session.status === 'accepted' && currentIntention === 'claude_code' && session.deliverable && (
            <Button size="sm" variant="secondary" onClick={() => setShowDeliverable('deliverable')}><Code2 size={15} /> Prompt</Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleReopen}><RotateCcw size={15} /> Reprendre</Button>
        </div>
      </div>
    );
  }

  const blocked = isStreaming || !!pendingDecisionId;

  return (
    <div className="shrink-0 bg-white border-t border-line px-4 py-2 relative">
      <div className="max-w-[820px] mx-auto space-y-1.5">
        {sendError && <p role="alert" className="text-xs font-semibold text-red-700">{sendError}</p>}

        <input ref={fileInputRef} type="file" multiple className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.docx,.xlsx,.csv,text/*,application/json"
          onChange={e => { processFiles(e.target.files); e.target.value = ''; }} />

        {attachments.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 h-8 pl-2 pr-1 rounded-lg bg-muted-light text-xs text-ink-soft max-w-[180px]">
                {a.isImage
                  ? <img src={a.dataUrl} alt="" className="w-6 h-6 rounded object-cover" />
                  : <FileText size={14} aria-hidden="true" />}
                <span className="truncate">{a.name}</span>
                <button type="button" aria-label={`Retirer ${a.name}`} onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  className="w-6 h-6 inline-flex items-center justify-center rounded text-ink-faint hover:text-ink"><X size={13} /></button>
              </span>
            ))}
          </div>
        )}

        {showMentionDropdown && mentionSuggestions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-1 max-w-[820px] mx-auto bg-white border border-line rounded-xl shadow-lg overflow-hidden z-20 py-1">
            {mentionSuggestions.map((agent, i) => (
              <button key={agent.id || agent.name} type="button"
                onMouseDown={e => { e.preventDefault(); handleSelectMention(agent); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${i === mentionSelectedIdx ? 'bg-action-light text-action' : 'text-ink-soft hover:bg-canvas'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${agentColor(agent.name).avatar}`}>
                  {agent.name?.[0]?.toUpperCase()}
                </span>
                <span className="font-bold">@{agent.name}</span>
                <span className="text-xs text-ink-faint truncate">{agent.role}</span>
              </button>
            ))}
          </div>
        )}

        {showIllustrate && (
          <div className="flex flex-wrap items-center gap-1.5 bg-ai-bg border border-ai-border rounded-[10px] p-1.5">
            <ImageIcon size={16} className="text-ai ml-1" aria-hidden="true" />
            <input autoFocus value={illustrateText} onChange={e => setIllustrateText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitIllustrate(); if (e.key === 'Escape') setShowIllustrate(false); }}
              aria-label="Que voulez-vous voir ?"
              placeholder="Que voulez-vous voir ? (le parcours d'un client, la maquette de l'accueil…)"
              className="flex-1 min-w-[200px] h-9 text-sm border border-ai-border bg-white rounded-lg px-3 outline-none focus:ring-2 focus:ring-ai-border" />
            <button type="button" onClick={submitIllustrate} disabled={!illustrateText.trim() || blocked}
              className="h-9 px-3 rounded-lg bg-ai text-white text-[13px] font-bold disabled:opacity-40">Illustrer</button>
            <button type="button" onClick={() => setShowIllustrate(false)} className="h-9 px-2 text-[13px] font-semibold text-ink-muted">Annuler</button>
          </div>
        )}

        <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          className={`flex items-end gap-1 rounded-[12px] border bg-white transition ${isDragging ? 'border-action ring-2 ring-action-border' : 'border-line focus-within:border-action-border'}`}>
          <label htmlFor="meeting-input" className="sr-only">Votre message</label>
          <textarea
            id="meeting-input"
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleTextareaFocus}
            placeholder={blocked ? 'Écrivez pour interrompre les agents…' : 'Écrivez à l’équipe… (@nom pour s’adresser à un agent · Ctrl+Entrée pour envoyer)'}
            className="flex-1 min-w-0 resize-none bg-transparent px-3 py-[11px] text-sm leading-[1.45] text-ink outline-none max-h-[120px]"
          />
          <IconButton label={attachments.length >= 3 ? 'Maximum 3 fichiers' : 'Joindre un fichier (image, PDF, Word, Excel, texte)'}
            onClick={() => fileInputRef.current?.click()} disabled={blocked || attachments.length >= 3}>
            <Paperclip size={18} />
          </IconButton>
          <IconButton label="Demander une illustration (schéma, maquette, visuel)" active={showIllustrate}
            onClick={() => setShowIllustrate(s => !s)} disabled={blocked} className="text-ai">
            <ImageIcon size={18} />
          </IconButton>
          <button type="button" onClick={handleSend} aria-label={isStreaming ? 'Envoyer (interrompt les agents)' : 'Envoyer'}
            title={isStreaming ? 'Envoyer (interrompt les agents)' : 'Envoyer'}
            disabled={!isStreaming && !pendingDecisionId && !inputText.trim() && attachments.length === 0}
            className={`w-11 h-11 m-0 shrink-0 rounded-[10px] inline-flex items-center justify-center text-white transition disabled:opacity-40 ${isStreaming ? 'bg-await' : 'bg-action hover:bg-action-dark'}`}>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
