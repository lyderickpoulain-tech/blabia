import DecisionCard from '../DecisionCard';

// ── Panneau latéral décisions ─────────────────────────────────────────────────

export function MeetingDecisionPanel({
  showDecisions,
  setShowDecisions,
  decisions,
  pendingDecisions,
  answeredDecisions,
  delegatedDecisions,
  isClosed,
  panelExpandedDecisionId,
  setPanelExpandedDecisionId,
  setPendingDecisionId,
  handleAnswerDecision,
  handleDeferDecision,
}) {
  if (!showDecisions) return null;

  return (
    <div className="w-[280px] shrink-0 flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">
          📌 Décisions ({decisions.length})
        </h2>
        <button
          onClick={() => setShowDecisions(false)}
          className="text-gray-400 hover:text-gray-600 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {decisions.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-6">Aucune décision formelle dans cette réunion.</p>
        ) : (
          <>
            {/* ⏸ À traiter */}
            {pendingDecisions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-blabia-orange uppercase tracking-wide px-1">
                  ⏸ À traiter ({pendingDecisions.length})
                </p>
                {pendingDecisions.map(d => (
                  <div key={d.id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                    {panelExpandedDecisionId === d.id ? (
                      <DecisionCard
                        message={d}
                        onAnswer={async (id, ans) => {
                          await handleAnswerDecision(id, ans);
                          setPanelExpandedDecisionId(null);
                        }}
                        onDefer={async (id) => {
                          await handleDeferDecision(id);
                          setPanelExpandedDecisionId(null);
                        }}
                      />
                    ) : (
                      <>
                        {d.agentName && (
                          <p className="text-[10px] text-blabia-orange font-semibold">{d.agentName}</p>
                        )}
                        <p className="text-xs text-orange-900 leading-snug">{d.question}</p>
                        {!isClosed && (
                          <button
                            onClick={() => {
                              setPanelExpandedDecisionId(d.id);
                              setPendingDecisionId(d.id);
                            }}
                            className="text-xs text-orange-700 font-semibold hover:underline"
                          >
                            Répondre maintenant →
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ✅ Actées */}
            {answeredDecisions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide px-1">
                  ✅ Actées ({answeredDecisions.length})
                </p>
                {answeredDecisions.map(d => (
                  <div key={d.id} className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
                    {d.agentName && (
                      <p className="text-[10px] text-green-700 font-semibold">{d.agentName}</p>
                    )}
                    <p className="text-xs text-gray-600 italic leading-snug">{d.question}</p>
                    <p className="text-xs font-semibold text-green-700">→ {d.answer}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 💬 En débat */}
            {delegatedDecisions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-blabia-blue uppercase tracking-wide px-1">
                  💬 En débat ({delegatedDecisions.length})
                </p>
                {delegatedDecisions.map(d => (
                  <div key={d.id} className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
                    {d.agentName && (
                      <p className="text-[10px] text-blabia-blue font-semibold">{d.agentName}</p>
                    )}
                    <p className="text-xs text-gray-600 italic leading-snug">{d.question}</p>
                    <p className="text-xs text-blue-500">Débat en cours entre les agents…</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Bannières suggest_close (orchestrateur) ───────────────────────────────────

export function MeetingSuggestCloseBanner({
  suggestClose,
  setSuggestClose,
  isClosed,
  currentIntention,
  setShowCloseModal,
}) {
  if (!suggestClose || isClosed) return null;

  if (currentIntention === 'claude_code') {
    return (
      <div className="shrink-0 mx-3 mt-2 mb-1 bg-blabia-blue-light border border-blabia-blue rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-blabia-blue text-base shrink-0 mt-0.5">✅</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blabia-blue">
              Les agents estiment que les besoins sont clarifiés.
            </p>
            {suggestClose.reason && (
              <p className="text-xs text-gray-600 mt-0.5 leading-snug">
                Points couverts : {suggestClose.reason}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCloseModal(true); setSuggestClose(null); }}
            className="flex-1 text-xs font-semibold bg-blabia-blue hover:bg-blabia-blue-dark text-white px-3 py-2 rounded-lg transition"
          >
            🚀 Générer le prompt et clore
          </button>
          <button
            onClick={() => setSuggestClose(null)}
            className="text-xs font-medium text-blabia-blue hover:text-blabia-blue-dark border border-blabia-blue hover:bg-white px-3 py-2 rounded-lg transition"
          >
            Continuer les échanges
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 mx-3 mt-2 mb-1 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
      <span className="text-green-600 text-base shrink-0 mt-0.5">✅</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-green-800">
          Les agents estiment que l'objectif est atteint.
        </p>
        {suggestClose.reason && (
          <p className="text-xs text-green-600 mt-0.5 leading-snug">{suggestClose.reason}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => { setShowCloseModal(true); setSuggestClose(null); }}
          className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition"
        >
          🏁 Clore
        </button>
        <button
          onClick={() => setSuggestClose(null)}
          className="text-xs font-medium text-green-700 hover:text-green-900 border border-green-200 hover:bg-green-100 px-3 py-1.5 rounded-lg transition"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
