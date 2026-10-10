// Contradicteur (v5.1) : avocat du diable SÉLECTIF. Ce n'est pas un agent de la
// réunion mais une fonction : l'orchestrateur (déjà appelé à chaque tour) décide
// s'il doit intervenir, uniquement sur un sujet à fort enjeu que personne n'a
// challengé. Au plus MAX_CHALLENGES interventions par réunion, jamais pendant la
// préparation, jamais deux fois de suite. L'humain répond « J'en tiens compte » ou
// « Écarter » (route /vigilance) ; un point écarté n'est plus jamais soulevé.

const MAX_CHALLENGES = 2;

const CHALLENGER = {
  id: 'challenger',
  name: 'Contradicteur',
  role: 'avocat du diable : challenge les choix à fort enjeu que personne n\'a remis en cause',
  emoji: '🧐',
  systemPrompt: '',
};

const isVigilance = m => m.role === 'agent' && !!m.vigilance;
const vigilanceMessages = messages => messages.filter(isVigilance);

function challengesLeft(messages) {
  return Math.max(0, MAX_CHALLENGES - vigilanceMessages(messages).length);
}

// Le contradicteur peut-il intervenir à ce tour ?
function challengerAvailable({ enabled, messages, preparing }) {
  if (!enabled || preparing || challengesLeft(messages) === 0) return false;
  const lastAgent = [...messages].reverse().find(m => m.role === 'agent');
  return lastAgent?.agentName !== CHALLENGER.name; // jamais deux fois de suite
}

const STATUS_LABEL = { open: 'sans réponse de l\'humain', accepted: 'pris en compte par l\'humain', dismissed: 'ÉCARTÉ par l\'humain — ne plus y revenir' };

// Points déjà soulevés dans cette réunion (pour ne jamais les répéter)
function priorVigilanceText(messages) {
  return vigilanceMessages(messages)
    .map(m => `- « ${m.vigilance.target || m.content.slice(0, 120)} » (${STATUS_LABEL[m.vigilance.status] || ''})`)
    .join('\n');
}

// Section ajoutée au prompt de l'orchestrateur
function buildOrchestratorChallengeSection({ left, priorText }) {
  return `
CONTRADICTEUR DISPONIBLE (encore ${left} intervention${left > 1 ? 's' : ''} possible${left > 1 ? 's' : ''} dans cette réunion).
Mets "challenge": true UNIQUEMENT si les DEUX conditions sont réunies :
1. un sujet STRUCTURANT est en train d'être tranché : il engage de l'argent, est difficile à défaire, touche au légal ou à la sécurité, ou conditionne la suite du projet ;
2. personne ne l'a vraiment challengé : consensus rapide entre agents, hypothèse « sauf avis contraire » posée sur un point lourd, ou recommandation présentée comme évidente sans alternative sérieuse.
Jamais sur un choix mineur ou facile à changer, ni sur ce que l'humain a tranché explicitement, ni sur ce qu'un agent vient déjà de critiquer.${priorText ? `\nDéjà soulevé dans cette réunion (ne pas y revenir) :\n${priorText}` : ''}
Dans le doute : "challenge": false. Si true, "challengeTarget" = le choix visé, en une phrase.
`;
}

// Consigne du tour du contradicteur (bloc du tour : le bloc commun reste en cache)
function buildChallengerTurnSection({ target, priorText }) {
  return `
TU INTERVIENS COMME CONTRADICTEUR, rarement et à bon escient. Choix visé : « ${target} ».
Ton rôle : éviter une erreur coûteuse, pas freiner la réunion. Reste factuel et bienveillant.
Écris UNE SEULE bulle, commençant exactement par « **Point de vigilance** : », qui contient :
- l'hypothèse ou le choix que tu challenges ;
- ce qui pourrait le rendre faux, et la conséquence concrète si c'est le cas ;
- un moyen simple de vérifier, ou une alternative sérieuse.
Pas de question à l'humain dans la bulle. Une carte [DECISION] UNIQUEMENT si le risque est sérieux et que seul l'humain peut trancher.
Si l'humain a tranché ce point explicitement, signale le risque en une phrase et respecte son choix.${priorText ? `\nDéjà soulevé (ne le répète pas) :\n${priorText}` : ''}
`;
}

module.exports = {
  MAX_CHALLENGES, CHALLENGER, isVigilance, vigilanceMessages, challengesLeft,
  challengerAvailable, priorVigilanceText, buildOrchestratorChallengeSection, buildChallengerTurnSection,
};
