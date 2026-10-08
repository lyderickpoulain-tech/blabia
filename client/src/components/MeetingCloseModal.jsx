import { useState, useEffect } from 'react';
import api from '../utils/api';
import SummaryDisplayModal from './SummaryDisplayModal';
import MeetingSuggestionCard from './meeting/MeetingSuggestionCard';
import MeetingPlanModal from './meeting/MeetingPlanModal';

const TYPE_META = {
  decision:    { icon: '🤝', label: 'Décision' },
  claude_code: { icon: '💻', label: 'Claude Code' },
  stack:       { icon: '🔧', label: 'Outils' },
};

const STEPS = ['generating', 'review', 'suggestions'];

// v5.0 phase 3.3 : bouton unique "Conclure la réunion" — génération automatique
// à l'ouverture, puis assistant en 3 étapes : relecture CR + livrable → revue
// des réunions suggérées → validation (statut accepté, CR en mémoire, livrable enregistré).
export default function MeetingCloseModal({ session, initialSuggestions, projectId, onClose, onClosed }) {
  const [step, setStep] = useState('generating');
  const [meetingType, setMeetingType] = useState(null);
  const [summary, setSummary]         = useState('');
  const [deliverable, setDeliverable] = useState(null);
  const [genError, setGenError]       = useState('');
  const [copied, setCopied]           = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  const [suggestions, setSuggestions] = useState(
    Array.isArray(initialSuggestions) ? initialSuggestions
      : (Array.isArray(session.pendingMeetingSuggestions) ? session.pendingMeetingSuggestions : [])
  );
  const [suggestionBusyId, setSuggestionBusyId] = useState(null);
  const [showPlan, setShowPlan] = useState(false);

  const [applying,       setApplying]       = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [abandoning,     setAbandoning]     = useState(false);

  const meta = TYPE_META[meetingType] || TYPE_META.decision;

  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    setStep('generating');
    setGenError('');
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${session.id}/generate-deliverable`, {});
      setMeetingType(data.meetingType);
      setSummary(data.summary || '');
      setDeliverable(data.deliverable || null);
      setStep('review');
    } catch (err) {
      setGenError(err.response?.data?.error || 'Erreur lors de la génération du compte-rendu');
      setStep('review');
    }
  };

  const handleCopyDeliverable = () => {
    navigator.clipboard.writeText(deliverable || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Suggestions de réunions (3.4) ─────────────────────────────────────────
  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const keptSuggestions    = suggestions.filter(s => s.status === 'kept');

  const patchSuggestion = async (id, body) => {
    setSuggestionBusyId(id);
    try {
      const { data } = await api.patch(`/projects/${projectId}/sessions/${session.id}/meeting-suggestions/${id}`, body);
      setSuggestions(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    } catch {}
    setSuggestionBusyId(null);
  };
  const handleKeepSuggestion    = (id) => patchSuggestion(id, { status: 'kept' });
  const handleDiscardSuggestion = (id) => patchSuggestion(id, { status: 'discarded' });
  const handleSaveSuggestion    = (id, fields) => patchSuggestion(id, fields);

  // ── Validation finale ──────────────────────────────────────────────────────
  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}`, {
        summary,
        ...(meetingType === 'claude_code' ? { deliverable } : {}),
      });
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

  const stepIndex = STEPS.indexOf(step);

  return (
    <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">🏁 Conclure la réunion</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{session.task}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* Fil des étapes */}
        {step !== 'generating' && (
          <div className="flex items-center gap-1.5 px-5 py-2 border-b border-gray-50 shrink-0 text-[10px] text-gray-400">
            <span className={step === 'review' ? 'font-semibold text-blabia-blue' : ''}>1. Relecture</span>
            <span>→</span>
            <span className={step === 'suggestions' ? 'font-semibold text-blabia-blue' : ''}>2. Réunions suggérées</span>
          </div>
        )}

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {step === 'generating' && (
            <div className="flex items-center gap-3 py-10 justify-center">
              <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-400">Génération du compte-rendu{meetingType === 'claude_code' ? ' et du prompt' : ''}…</span>
            </div>
          )}

          {genError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-red-700">⚠️ {genError}</p>
              <button onClick={generate} className="text-xs text-red-600 underline hover:no-underline">Réessayer</button>
            </div>
          )}

          {step === 'review' && !genError && (
            <>
              {/* Décisions */}
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
                        <h3 className="text-xs font-semibold text-orange-700 uppercase tracking-wide">⏸ À traiter ({deferred.length})</h3>
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
                        <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide">✅ Actées ({answered.length})</h3>
                        <ul className="space-y-1.5">
                          {answered.map((m, i) => (
                            <li key={m.id || i} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="text-green-500 shrink-0 mt-0.5 font-bold">·</span>
                              <span className="leading-snug">
                                <span className="text-gray-600">{m.question}</span>
                                {m.answer && <span className="font-semibold text-green-700"> → {m.answer}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Compte-rendu (toujours, éditable) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <span className="text-sm font-semibold text-gray-700">Compte-rendu</span>
                </div>
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none text-gray-700 leading-relaxed"
                />
                <button
                  onClick={() => setShowFullContent(true)}
                  className="text-xs text-blabia-blue hover:text-blabia-blue font-medium"
                >
                  Lire en plein écran →
                </button>
              </div>

              {/* Livrable claude_code (éditable) */}
              {meetingType === 'claude_code' && deliverable !== null && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💻</span>
                    <span className="text-sm font-semibold text-gray-700">Prompt Claude Code</span>
                  </div>
                  <textarea
                    value={deliverable}
                    onChange={e => setDeliverable(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2.5 bg-gray-900 text-green-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-400 resize-none leading-relaxed"
                  />
                  <button
                    onClick={handleCopyDeliverable}
                    className="w-full flex items-center justify-center gap-2 bg-blabia-blue hover:bg-blabia-blue-dark text-white font-semibold py-2 rounded-xl text-sm transition"
                  >
                    {copied ? '✓ Copié !' : '📋 Copier le prompt'}
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'suggestions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  💡 Réunions suggérées {suggestions.length > 0 ? `(${suggestions.length})` : ''}
                </h3>
                <button onClick={() => setShowPlan(true)} className="text-xs text-blabia-blue hover:underline font-medium">
                  📅 Voir le plan des réunions
                </button>
              </div>
              {suggestions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Aucune réunion suggérée pendant cette réunion.</p>
              ) : (
                <div className="space-y-2 -mx-4">
                  {suggestions.map(s => (
                    <MeetingSuggestionCard
                      key={s.id}
                      suggestion={s}
                      busy={suggestionBusyId === s.id}
                      onKeep={handleKeepSuggestion}
                      onDiscard={handleDiscardSuggestion}
                      onSave={handleSaveSuggestion}
                    />
                  ))}
                </div>
              )}
              {pendingSuggestions.length > 0 && (
                <p className="text-xs text-amber-600 text-center">
                  {pendingSuggestions.length} suggestion{pendingSuggestions.length > 1 ? 's' : ''} encore en attente de décision.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 p-4 space-y-2">
          {!abandonConfirm ? (
            <div className="flex gap-2">
              {step === 'review' && (
                <button
                  onClick={() => setStep('suggestions')}
                  disabled={!!genError}
                  className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
                >
                  Suivant →
                </button>
              )}
              {step === 'suggestions' && (
                <>
                  <button
                    onClick={() => setStep('review')}
                    className="border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium py-2.5 px-4 rounded-xl text-sm transition"
                  >
                    ← Retour
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {applying
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : '✅ Valider'}
                  </button>
                </>
              )}
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
                <button onClick={() => setAbandonConfirm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button onClick={handleAbandon} disabled={abandoning} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                  {abandoning ? '…' : "🚫 Confirmer l'abandon"}
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
        date={session.createdAt ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : undefined}
        content={summary}
        onClose={() => setShowFullContent(false)}
      />
    )}

    {showPlan && (
      <MeetingPlanModal
        projectId={projectId}
        sessionId={session.id}
        keptSuggestions={keptSuggestions}
        onClose={() => setShowPlan(false)}
        onValidated={() => setShowPlan(false)}
      />
    )}
    </>
  );
}
