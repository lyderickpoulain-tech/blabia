// v5.1 (réunion « WorldOfMetal », 17/10/2026) : tours d'affilée du dernier agent, comptés sur
// l'historique. Le compteur de la requête repartait à zéro à chaque relance (après une carte,
// une reprise…) : un agent a pu parler cinq fois de suite en répondant à ses propres hypothèses.
// Un tour = un turnId (plusieurs bulles) ; l'animation et les réponses aux cartes ne coupent pas
// la série, un message de l'humain ou d'un autre agent oui.
function agentStreak(messages) {
  let name = null;
  const turns = new Set();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'human') break;
    if (m.type === 'animator' || m.type === 'decision_answer' || !m.agentName) continue;
    if (name && m.agentName !== name) break;
    name = m.agentName;
    turns.add(m.turnId || `${m.type}:${i}`);
  }
  return { name, turns: turns.size };
}

module.exports = { agentStreak };
