import { useState, useEffect } from 'react';
import api from '../utils/api';
import SummaryDisplayModal from './SummaryDisplayModal';

const DELIVERABLE_META = {
  summary:        { icon: '📋', label: 'Compte-rendu',      editable: false, code: false, list: false },
  synthesis:      { icon: '📋', label: 'Compte-rendu',      editable: false, code: false, list: false },
  memory:         { icon: '📋', label: 'Compte-rendu',      editable: true,  code: false, list: false },
  meeting:        { icon: '📋', label: 'Compte-rendu',      editable: false, code: false, list: false },
  claude_code:    { icon: '💻', label: 'Prompt Claude Code', editable: false, code: true,  list: false },
  timeline_steps: { icon: '📅', label: 'Étapes timeline',   editable: false, code: false, list: true  },
};

export default function MeetingCloseModal({ session, projectId, onClose, onClosed }) {
  const intention = Array.isArray(session.intention) && session.intention.length > 0
    ? session.intention[0]
    : 'summary';
  const meta = DELIVERABLE_META[intention] || DELIVERABLE_META.summary;

  const [generating,     setGenerating]     = useState(false);
  const [generated,      setGenerated]      = useState(false);
  const [content,        setContent]        = useState(null);
  const [editedContent,  setEditedContent]  = useState('');
  const [genError,       setGenError]       = useState('');
  const [addingToPlan,   setAddingToPlan]   = useState(false);
  const [addedToPlan,    setAddedToPlan]    = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [openedInCC,     setOpenedInCC]     = useState(false);
  const [applying,        setApplying]        = useState(false);
  const [abandonConfirm,  setAbandonConfirm]  = useState(false);
  const [abandoning,      setAbandoning]      = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  // Étapes suggérées hors-contexte (intention != timeline_steps)
  const rawPending = Array.isArray(session.pendingStepSuggestions) ? session.pendingStepSuggestions : [];
  const [pendingSteps,   setPendingSteps]   = useState(rawPending);
  const [addingStepIdx,  setAddingStepIdx]  = useState(null);
  const [addedStepIdxs,  setAddedStepIdxs] = useState(new Set());

  // Génération automatique à l'ouverture
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const { data } = await api.post(
        `/projects/${projectId}/sessions/${session.id}/generate-deliverable`,
        { deliverableType: intention }
      );
      setContent(data.content);
      setEditedContent(typeof data.content === 'string' ? data.content : '');
      setGenerated(true);
    } catch (err) {
      setGenError(err.response?.data?.error || 'Erreur lors de la génération du livrable');
    }
    setGenerating(false);
  };

  const handleCopy = () => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleOpenInCC = () => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setOpenedInCC(true);
      setTimeout(() => setOpenedInCC(false), 5000);
    });
  };

  const handleAddToPlan = async () => {
    if (addingToPlan || !content) return;
    setAddingToPlan(true);
    try {
      await api.post(`/projects/${projectId}/plan/bulk`, {
        milestones:       content.milestones       || [],
        standalone_todos: content.standalone_todos || [],
        sessionId:        session.id,
        sourceSessionId:  session.id
      });
      setAddedToPlan(true);
    } catch {}
    setAddingToPlan(false);
  };

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      // Pour 'memory' : sauvegarder le contenu édité dans project.context
      if (intention === 'memory' && editedContent.trim()) {
        await api.patch(`/projects/${projectId}/context`, {
          memory:       editedContent.trim(),
          sessionTitle: session.task
        });
      }
      await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'accepted' });
      onClosed?.('accepted');
    } catch {
      setApplying(false);
    }
  };

  const handleAbandon = async () => {
    if (abandoning) return;
    setAbandoning(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'abandoned' });
      onClosed?.('abandoned');
    } catch {
      setAbandoning(false);
    }
  };

  const handleAddPendingStep = async (step, idx) => {
    if (addingStepIdx !== null || addedStepIdxs.has(idx)) return;
    setAddingStepIdx(idx);
    try {
      await api.post(`/projects/${projectId}/milestones`, { title: step.title, type: step.type || 'summary' });
      setAddedStepIdxs(prev => new Set([...prev, idx]));
    } catch {}
    setAddingStepIdx(null);
  };

  const handleDismissPendingStep = (idx) => {
    setPendingSteps(prev => prev.filter((_, i) => i !== idx));
    setAddedStepIdxs(prev => { const next = new Set(prev); next.delete(idx); return next; });
  };

  const handleAddAllPendingSteps = async () => {
    const toAdd = pendingSteps.filter((_, i) => !addedStepIdxs.has(i));
    for (let i = 0; i < toAdd.length; i++) {
      const step = toAdd[i];
      const origIdx = pendingSteps.indexOf(step);
      try {
        await api.post(`/projects/${projectId}/milestones`, { title: step.title, type: step.type || 'summary' });
        setAddedStepIdxs(prev => new Set([...prev, origIdx]));
      } catch {}
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">🏁 Clore la réunion</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{session.task}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Décisions — EN PREMIER */}
          {(() => {
            const allDecisions = (Array.isArray(session.messages) ? session.messages : [])
              .filter(m => m.type === 'decision');
            const deferred = allDecisions.filter(m => m.status === 'deferred' || m.status === 'pending');
            const answered = allDecisions.filter(m => m.status === 'answered');
            if (allDecisions.length === 0) return null;
            return (
              <div className="space-y-2">
                {deferred.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                      ⏸ À traiter ({deferred.length})
                    </h3>
                    <ul className="space-y-1.5">
                      {deferred.map((m, i) => (
                        <li key={m.id || i} className="text-sm text-orange-900 flex items-start gap-2">
                          <span className="text-orange-400 shrink-0 mt-0.5 font-bold">·</span>
                          <span className="leading-snug">{m.question}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {answered.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                      ✅ Actées ({answered.length})
                    </h3>
                    <ul className="space-y-1.5">
                      {answered.map((m, i) => (
                        <li key={m.id || i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-green-500 shrink-0 mt-0.5 font-bold">·</span>
                          <span className="leading-snug">
                            <span className="text-gray-600">{m.question}</span>
                            {m.answer && (
                              <span className="font-semibold text-green-700"> → {m.answer}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Étapes suggérées hors-contexte */}
          {pendingSteps.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-semibold text-blabia-blue uppercase tracking-wide">
                💡 Nouvelles étapes suggérées ({pendingSteps.length})
              </h3>
              <ul className="space-y-2">
                {pendingSteps.map((step, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-gray-800 leading-snug">{step.title}</span>
                    {addedStepIdxs.has(idx) ? (
                      <span className="text-xs text-green-600 font-medium shrink-0">✓ Ajoutée</span>
                    ) : (
                      <button
                        onClick={() => handleAddPendingStep(step, idx)}
                        disabled={addingStepIdx !== null}
                        className="text-xs text-blabia-blue hover:text-blue-800 border border-blue-300 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition disabled:opacity-50 shrink-0"
                      >
                        {addingStepIdx === idx ? '…' : 'Ajouter'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDismissPendingStep(idx)}
                      className="text-gray-400 hover:text-gray-600 text-xs px-1 shrink-0"
                      title="Ignorer"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddAllPendingSteps}
                  disabled={addingStepIdx !== null || pendingSteps.every((_, i) => addedStepIdxs.has(i))}
                  className="flex-1 text-xs text-blabia-blue border border-blue-300 hover:bg-blue-100 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  Tout ajouter à la timeline
                </button>
                <button
                  onClick={() => setPendingSteps([])}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition"
                >
                  Tout ignorer
                </button>
              </div>
            </div>
          )}

          {/* Tokens consommés */}
          {(() => {
            const tu = session.tokensUsed;
            if (!tu || !tu.total) return null;
            return (
              <p className="text-xs text-gray-400">
                🔢 Tokens consommés : {tu.total.toLocaleString('fr-FR')}
                <span className="ml-1 text-gray-300">(input : {tu.input.toLocaleString('fr-FR')} · output : {tu.output.toLocaleString('fr-FR')})</span>
              </p>
            );
          })()}

          {/* Badge livrable + statut */}
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.icon}</span>
            <span className="text-sm font-semibold text-gray-700">{meta.label}</span>
            {generated && (
              <span className="ml-auto text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                ✓ Généré
              </span>
            )}
          </div>

          {/* Génération en cours */}
          {generating && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Génération en cours…</span>
            </div>
          )}

          {/* Erreur */}
          {genError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-red-700">⚠️ {genError}</p>
              <button onClick={generate} disabled={generating} className="text-xs text-red-600 underline hover:no-underline">
                Réessayer
              </button>
            </div>
          )}

          {/* Livrable généré */}
          {generated && content !== null && (
            <>
              {/* memory → textarea éditable */}
              {meta.editable && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-400">
                    Vous pouvez modifier ce souvenir avant de l'enregistrer dans la mémoire projet.
                  </p>
                  <textarea
                    value={editedContent}
                    onChange={e => setEditedContent(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none text-gray-700 leading-relaxed"
                  />
                </div>
              )}

              {/* claude_code → code block + copier */}
              {meta.code && (
                <div className="space-y-3">
                  <pre className="bg-gray-900 text-green-300 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
                  </pre>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex-1 flex items-center justify-center gap-2 bg-blabia-blue hover:bg-blabia-blue-dark text-white font-semibold py-2.5 rounded-xl text-sm transition"
                    >
                      {copied ? '✓ Copié !' : '📋 Copier le prompt'}
                    </button>
                    <button
                      onClick={handleOpenInCC}
                      className="flex-1 flex items-center justify-center gap-2 border border-blabia-blue text-blabia-blue hover:bg-blabia-blue-light font-semibold py-2.5 rounded-xl text-sm transition"
                    >
                      💻 Ouvrir dans Claude Code
                    </button>
                  </div>
                  {openedInCC && (
                    <p className="text-xs text-center text-blabia-blue bg-blabia-blue-light rounded-lg py-2 px-3">
                      ✅ Prompt copié — colle-le dans Claude Code
                    </p>
                  )}
                </div>
              )}

              {/* timeline_steps → liste jalons + option ajout */}
              {meta.list && typeof content === 'object' && (
                <div className="space-y-3">
                  {(content.milestones || []).length > 0 ? (
                    <ul className="space-y-2">
                      {content.milestones.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-blue-400 font-bold mt-0.5 shrink-0">·</span>
                          <div>
                            <span className="font-medium text-gray-800">{m.title}</span>
                            {m.description && (
                              <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                            )}
                            {(m.todos || []).length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {m.todos.map((t, j) => (
                                  <li key={j} className="text-xs text-gray-500 flex items-center gap-1">
                                    <span>→</span> {t.title}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400">Aucune étape extraite.</p>
                  )}

                  {(content.standalone_todos || []).length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500">Tâches autonomes :</p>
                      {content.standalone_todos.map((t, i) => (
                        <p key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                          <span className="text-gray-300">·</span> {t.title}
                        </p>
                      ))}
                    </div>
                  )}

                  {!addedToPlan ? (
                    <button
                      onClick={handleAddToPlan}
                      disabled={addingToPlan || (content.milestones || []).length === 0}
                      className="w-full border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blabia-blue text-sm font-medium py-2 rounded-xl transition disabled:opacity-50"
                    >
                      {addingToPlan ? 'Ajout…' : '+ Ajouter à la timeline'}
                    </button>
                  ) : (
                    <p className="text-xs text-green-600 text-center">✓ Étapes ajoutées à la timeline</p>
                  )}
                </div>
              )}

              {/* synthesis → aperçu + bouton plein écran */}
              {!meta.editable && !meta.code && !meta.list && (
                <div className="space-y-2">
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-32 overflow-hidden relative">
                    {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
                    <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-gray-50 to-transparent rounded-b-xl" />
                  </div>
                  <button
                    onClick={() => setShowFullContent(true)}
                    className="w-full text-xs text-blabia-blue hover:text-blabia-blue font-medium py-1.5 rounded-lg border border-blue-100 hover:bg-blue-50 transition"
                  >
                    Lire le compte-rendu complet →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 p-4 space-y-2">
          {!abandonConfirm ? (
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={applying || generating || (!generated && !genError)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {applying
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : '✅ Appliquer et clore'}
              </button>
              <button
                onClick={() => setAbandonConfirm(true)}
                disabled={applying || abandoning}
                className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-medium py-2.5 px-4 rounded-xl text-sm transition disabled:opacity-50"
                title="Abandonner la réunion"
              >
                🚫
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center space-y-1">
                <p className="text-sm font-semibold text-red-700">🚫 Abandonner cette réunion ?</p>
                <p className="text-xs text-red-600">Cette action est définitive. Aucun livrable ne sera généré.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAbandonConfirm(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAbandon}
                  disabled={abandoning}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
                >
                  {abandoning ? '…' : '🚫 Confirmer l\'abandon'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>

    {showFullContent && (
      <SummaryDisplayModal
        title={session.task}
        date={session.createdAt
          ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          : undefined}
        content={content}
        onClose={() => setShowFullContent(false)}
      />
    )}
    </>
  );
}
