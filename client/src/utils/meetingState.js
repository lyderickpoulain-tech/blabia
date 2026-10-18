// État d'une réunion, lu dans ses messages (v5.1, 18/10/2026) — même calcul que le serveur
// (server/src/services/meetingState.js) : la barre d'état de la salle dit toujours ce qui suit.
const OPEN_CARD = new Set(['pending', 'awaiting_human', 'deferred']);

export function openCards(messages = []) {
  return messages.filter(m => m.type === 'decision' && OPEN_CARD.has(m.status || 'pending'));
}

export function meetingState(messages = []) {
  const pending = openCards(messages);
  let lastAgent = -1, lastHuman = -1, lastAnswer = -1, lastClose = -1, closeReason = '';
  messages.forEach((m, i) => {
    if (m.type === 'close_suggestion') { lastClose = i; closeReason = m.content || ''; }
    else if (m.type === 'decision_answer') { if (m.kind !== 'vigilance_dismissed') lastAnswer = i; } // un point de vigilance écarté ne relance rien
    else if (m.role === 'human') lastHuman = i;
    else if (m.role === 'agent') lastAgent = i;
  });
  const answersReady = lastAnswer > Math.max(lastAgent, lastClose);
  const closeSuggested = lastClose >= 0 && lastClose > Math.max(lastHuman, lastAnswer);
  const state = pending.length ? 'question'
    : answersReady ? 'answers_ready'
      : closeSuggested ? 'ready_to_close'
        : messages.length ? 'idle' : 'empty';
  return { state, pending, pendingCount: pending.length, closeSuggested, closeReason: closeSuggested ? closeReason : '' };
}
