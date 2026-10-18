// État d'une réunion, lu dans ses messages (v5.1, 18/10/2026 — constats sur « WorldOfMetal ») :
// des questions attendaient l'humain alors que l'animation disait « on clôt » ; des réunions
// s'arrêtaient sans que rien ne dise quoi faire ; une réponse ne relançait rien.
// Même calcul côté client (client/src/utils/meetingState.js).
//   question       : au moins une carte attend l'humain
//   answers_ready  : l'humain a répondu depuis le dernier tour des agents (la réunion peut reprendre)
//   ready_to_close : les agents proposent de conclure, rien n'attend l'humain
//   idle           : les échanges sont en pause ; à l'humain d'écrire, relancer ou conclure
//   empty          : rien n'a encore été dit
const OPEN_CARD = new Set(['pending', 'awaiting_human', 'deferred']);

function openCards(messages = []) {
  return messages.filter(m => m.type === 'decision' && OPEN_CARD.has(m.status || 'pending'));
}

function meetingState(messages = []) {
  const pending = openCards(messages);
  let lastAgent = -1, lastHuman = -1, lastAnswer = -1, lastClose = -1, closeReason = '';
  messages.forEach((m, i) => {
    if (m.type === 'close_suggestion') { lastClose = i; closeReason = m.content || ''; }
    else if (m.type === 'decision_answer') lastAnswer = i;
    else if (m.role === 'human') lastHuman = i;
    else if (m.role === 'agent') lastAgent = i;
  });
  const answersReady = lastAnswer > Math.max(lastAgent, lastClose);
  const closeSuggested = lastClose >= 0 && lastClose > Math.max(lastHuman, lastAnswer);
  const state = pending.length ? 'question'
    : answersReady ? 'answers_ready'
      : closeSuggested ? 'ready_to_close'
        : messages.length ? 'idle' : 'empty';
  return { state, pendingCount: pending.length, closeSuggested, closeReason: closeSuggested ? closeReason : '' };
}

module.exports = { meetingState, openCards };
