import { useState, useEffect } from 'react';
import api from '../utils/api';
import SummaryDisplayModal from './SummaryDisplayModal';
import MeetingSuggestionCard from './meeting/MeetingSuggestionCard';
import MeetingPlanModal, { buildMergedPlan } from './meeting/MeetingPlanModal';
import { costLabel } from '../utils/toolsCatalog';

const TYPE_META = {
  decision:    { icon: '🤝', label: 'Décision' },
  claude_code: { icon: '💻', label: 'Claude Code' },
  stack:       { icon: '🔧', label: 'Outils' },
};

const STEPS = ['generating', 'review', 'suggestions'];

// v5.0 phase 3.3 : bouton unique "Conclure la réunion" — génération automatique
// à l'ouverture, puis assistant en 3 étapes : relecture CR + livrable → revue
// des réunions suggérées → validation (statut accepté, CR en mémoire, livrable enregistré).
export default function MeetingCloseModal({ session, initialSuggestions, meetingRefs, initialToolSuggestions, projectId, onClose, onClosed }) {
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
  // Réunion stack : outils proposés + décision par outil { [id]: 'validated' | 'refused' }
  const [toolSuggestions, setToolSuggestions] = useState(Array.isArray(initialToolSuggestions) ? initialToolSuggestions : []);
  const [toolDecisions, setToolDecisions]     = useState({});
  const [showPlan, setShowPlan] = useState(false);

  const [applying,       setApplying]       = useState(false);
  const [applyError,     setApplyError]     = useState('');
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
      if (Array.isArray(data.toolSuggestions)) setToolSuggestions(data.toolSuggestions);
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
    setApplyError('');
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}`, {
        summary,
        ...(meetingType === 'claude_code' ? { deliverable } : {}),
      });

      // Réunion stack : outils reportés dans les outils du projet avec la décision prise
      if (meetingType === 'stack' && toolSuggestions.length > 0) {
        await api.post(`/projects/${projectId}/sessions/${session.id}/tools/apply`, {
          decisions: Object.entries(toolDecisions).map(([id, status]) => ({ id, status })),
        });
      }

      // Suggestions gardées pas encore matérialisées → ajoutées au plan à leur
      // position "after". État relu côté serveur : celles déjà ajoutées via
      // "Voir le plan des réunions" portent un milestoneId et sont ignorées.
      const [{ data: fresh }, { data: plan }] = await Promise.all([
        api.get(`/projects/${projectId}/sessions/${session.id}`),
        api.get(`/projects/${projectId}/plan`),
      ]);
      const toAdd = (fresh.pendingMeetingSuggestions || []).filter(s => s.status === 'kept' && !s.milestoneId);
      if (toAdd.length > 0) {
        const order = buildMergedPlan(plan.milestones || [], toAdd)
          .map(it => it.kind === 'milestone' ? { milestoneId: it.key } : { suggestionId: it.key });
        await api.post(`/projects/${projectId}/sessions/${session.id}/meeting-plan/validate`, { order });
      }

      await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'accepted' });
      onClosed?.('accepted');
    } catch (err) {
      setApplyError(err.response?.data?.error || 'Erreur lors de la validation');
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

              {/* Livrable stack : outils proposés, validés un par un (phase 4.3) */}
              {meetingType === 'stack' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧰</span>
                    <span className="text-sm font-semibold text-gray-700">Outils proposés ({toolSuggestions.length})</span>
                  </div>
                  {toolSuggestions.length === 0 && (
                    <p className="text-xs text-gray-400">Aucun outil complémentaire proposé : vos outils actuels couvrent les besoins discutés.</p>
                  )}
                  {toolSuggestions.map(t => {
                    const decision = toolDecisions[t.id];
                    return (
                      <div key={t.id} className={`border rounded-xl p-3 space-y-1 ${
                        decision === 'validated' ? 'border-green-300 bg-green-50'
                          : decision === 'refused' ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
                      }`}>
                        <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                        {t.need && <p className="text-xs text-gray-700"><span className="text-gray-400">Besoin :</span> {t.need}</p>}
                        {t.why && <p className="text-xs text-gray-600"><span className="text-gray-400">Pourquoi :</span> {t.why}</p>}
                        <p className="text-xs text-gray-500">
                          💶 {costLabel(t.cost)}{t.cost?.freeTier && ` · gratuit jusqu'à : ${t.cost.freeTier}`}
                          {t.priceSource
                            ? <> · <a href={t.priceSource} target="_blank" rel="noopener noreferrer" className="text-blabia-blue hover:underline">source</a></>
                            : <span className="text-amber-600"> · indicatif, à vérifier</span>}
                        </p>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setToolDecisions(d => ({ ...d, [t.id]: 'validated' }))}
                            className={`text-xs px-3 py-1 rounded-lg border ${decision === 'validated' ? 'bg-green-600 border-green-600 text-white' : 'border-green-300 text-green-700 hover:bg-green-50'}`}>
                            ✓ Valider
                          </button>
                          <button onClick={() => setToolDecisions(d => ({ ...d, [t.id]: 'refused' }))}
                            className={`text-xs px-3 py-1 rounded-lg border ${decision === 'refused' ? 'bg-gray-600 border-gray-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                            ✕ Refuser
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {toolSuggestions.some(t => !toolDecisions[t.id]) && (
                    <p className="text-xs text-amber-600">Les outils sans décision restent « suggérés » dans les outils du projet.</p>
                  )}
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
                      meetingRefs={meetingRefs}
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
          {applyError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {applyError}</p>
          )}
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
