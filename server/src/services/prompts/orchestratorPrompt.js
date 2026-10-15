// Prompt de l'orchestrateur : choisit quel agent prend la parole à chaque tour
// d'une réunion (server/src/routes/sessions/chat.js).

const MAX_TURNS = 12;

// v5.0 phase 3.2 : decision | claude_code | stack
const CLOSE_INSTRUCTIONS = {
  claude_code: "Pour une réunion claude_code : considère shouldClose=true si les agents ont fait au moins 2 tours complets ET que les besoins principaux ont été clarifiés. Ne cherche pas la perfection — le prompt sera complété par Claude Code lui-même.",
  decision: "Pour une réunion de prise de décision : considère shouldClose=true dès que les décisions, options écartées et actions ont été couverts. 3 tours suffisent généralement.",
  stack: "Pour une réunion outils : considère shouldClose=true dès que les catégories pertinentes ont été passées en revue.",
};
const DEFAULT_CLOSE_INSTRUCTION = "seulement si l'objectif est clairement atteint ET que les agents ont tourné en rond sur les mêmes points";

const TOUR_NOTES = {
  // minTurn : tours d'agents depuis le début de la réunion (plus par requête)
  claude_code: { minTurn: 8,  text: 'Si les besoins principaux ont été clarifiés, tu DOIS proposer shouldClose=true.' },
  decision:    { minTurn: 6,  text: 'Si les décisions, options écartées et actions ont été couvertes, tu DOIS proposer shouldClose=true.' },
  stack:       { minTurn: 10, text: 'Si les catégories pertinentes ont été passées en revue, tu DOIS proposer shouldClose=true.' },
};

/**
 * Construit le prompt de sélection d'agent pour l'orchestrateur.
 * @param {object} p
 * @param {object} p.session - { task, intention }
 * @param {Array}  p.agentsForSelection - agents candidats pour ce tour
 * @param {string} p.recentMessagesText - derniers échanges formatés
 * @param {string} [p.blockedAgentName] - agent à ne pas sélectionner (a trop parlé)
 * @param {number} [p.blockedAgentCount] - nombre de fois consécutives où il a parlé
 * @param {string} [p.humanPriorityNote]
 * @param {boolean} [p.delegated]
 * @param {number} p.turnCount - tours d'agents depuis le début de la réunion
 * @param {number|null} [p.decisionsLeft] - cartes de décision restantes dans le budget
 */
function buildOrchestratorPrompt({
  session,
  agentsForSelection,
  recentMessagesText,
  blockedAgentName = null,
  blockedAgentCount = 0,
  humanPriorityNote = '',
  delegated = false,
  turnCount,
  decisionsLeft = null,
  challengeSection = '', // v5.1 : contradicteur disponible (services/challenger.js)
  codeSection = '',      // v5.1 : code du dépôt lisible à la demande (buildOrchestratorCodeSection)
  projectGoal = '',      // v5.1 : objectif du projet (utils/projectObjective.js), pour repérer la dérive
  decisionsAsked = 0,    // v5.1 : cartes déjà soumises à l'humain dans la réunion
  questionMode = 'balanced',
}) {
  const intentionKey = Array.isArray(session.intention) ? session.intention[0] : '';
  const agentList = agentsForSelection.map((a, i) => `${i + 1}. ${a.name} (${a.role})`).join('\n');

  const tourNoteCfg = TOUR_NOTES[intentionKey];
  const tourNote = tourNoteCfg && turnCount >= tourNoteCfg.minTurn
    ? `\n🚨 IMPORTANT : Cette réunion ${intentionKey} est au tour ${turnCount}. ${tourNoteCfg.text}`
    : '';

  const closeInstruction = CLOSE_INSTRUCTIONS[intentionKey] || DEFAULT_CLOSE_INSTRUCTION;
  // v5.1 : en « Équilibré » ou « Je veux tout trancher », l'humain doit être consulté
  const askAfter = { balanced: 4, control: 2 }[questionMode];
  const askNote = askAfter && decisionsAsked === 0 && turnCount >= askAfter && decisionsLeft !== 0
    ? `\nAucune question n'a encore été soumise à l'humain après ${turnCount} tours, alors qu'il veut ${questionMode === 'control' ? 'tout trancher' : 'trancher ce qui lui revient'}. Choisis l'agent le mieux placé pour lui soumettre, par une carte de décision, le choix qui lui appartient dans ce qui vient d'être discuté (préférence, budget, priorité, périmètre), et écris-le dans "reason".`
    : '';

  return `Tu es l'orchestrateur d'une réunion IA.

Objectif de la réunion : "${session.task}"${projectGoal ? `
Objectif du projet : "${projectGoal}"` : ''}
Livrable attendu : ${intentionKey || 'compte-rendu'}
Tours d'agents depuis le début de la réunion : ${turnCount}${tourNote}${askNote}${decisionsLeft === 0
    ? "\n⚠️ Le budget de questions à l'humain est épuisé : privilégie les agents qui concluent, et propose shouldClose=true dès que l'essentiel est couvert."
    : ''}

Agents disponibles :
${agentList}

${blockedAgentName ? `⚠️ ${blockedAgentName} a déjà parlé ${blockedAgentCount} fois de suite. Ne le sélectionne PAS.` : ''}
${humanPriorityNote}
Pertinence d'abord : choisis l'agent dont le rôle répond le mieux au DERNIER message, surtout s'il vient de l'humain. Une question simple ou non technique ne va pas à un agent technique. Préfère des échanges courts qui alternent entre agents à un long exposé.
La raison (« reason ») est transmise à l'agent choisi : écris le point précis auquel il doit réagir (ex. « répondre à la question de l'humain sur le prix »), pas un thème large.
DÉRIVE : les derniers échanges servent-ils encore l'objectif de la réunion ? Ils dérivent s'ils partent vers un sujet voisin, ou s'ils ajoutent des étapes, méthodes, seuils, tests ou validations que l'humain n'a pas demandés. Si oui, "offTrack": true, choisis l'agent le mieux placé pour recentrer et écris dans "reason" sur quoi revenir. Si l'objectif est atteint, propose shouldClose=true plutôt que de laisser la réunion s'étirer.
${delegated ? `⚡ L'humain a délégué une décision aux agents. Les agents doivent débattre entre eux, argumenter leurs positions et converger vers une recommandation claire. L'agent le plus pertinent propose une conclusion en dernier.\n` : ''}Derniers échanges :
${recentMessagesText || '(début de réunion)'}
${challengeSection}${codeSection}
Décide maintenant :
1. Quel agent doit prendre la parole ? (numéro de 1 à ${agentsForSelection.length})
2. Pourquoi ? (1 phrase courte)
3. La réunion doit-elle se clore ? (oui/non) — ${closeInstruction}

ANIMATION : tu es aussi l'animateur VISIBLE de la réunion. Dans "animation", écris UNE phrase courte, dite à voix haute aux participants, SEULEMENT à une transition : ouverture de la réunion (ce qu'on doit produire), recentrage après une digression, point épuisé qu'il faut faire trancher, objectif atteint (proposer de conclure). Ton d'animateur bienveillant et ferme, sans jargon (ex. « On a fait le tour des prix ; Léa, tu proposes une fourchette à valider ? »). Le reste du temps, laisse "animation" vide : la plupart des tours.

Réponds UNIQUEMENT avec ce JSON :
{"agentIndex": 1, "reason": "...", "shouldClose": false, "offTrack": false, "animation": ""${challengeSection ? ', "challenge": false, "challengeTarget": ""' : ''}${codeSection ? ', "codeQuestion": ""' : ''}}`;
}

// v5.1 : projet relié à un dépôt — l'orchestrateur repère une question qui demande de lire
// du code pas encore lu (services/codeContext.js, lookupCode)
function buildOrchestratorCodeSection({ readFiles = [], lastMessageText = '' }) {
  return `
CODE DU PROJET : BlabIA peut lire le code du dépôt GitHub avant le prochain tour.
Fichiers déjà lus par les agents : ${readFiles.length ? readFiles.slice(0, 40).join(', ') : 'aucun'}.
Dernier message en entier : "${String(lastMessageText).slice(0, 1200)}"
Si ce dernier message (de l'humain ou d'un agent) pose une question, émet une hypothèse ou demande une vérification dont la réponse se trouve dans du code PAS ENCORE LU (où se trouve un écran, comment une fonction marche, ce que le site fait déjà, une règle de calcul…), écris dans "codeQuestion" ce qu'il faut chercher dans le code (une phrase précise). Sinon, laisse "codeQuestion" vide. En cas de doute sur un sujet sans lien avec le code (nom, prix, public, ton…), laisse vide.
`;
}

module.exports = { buildOrchestratorPrompt, buildOrchestratorCodeSection, MAX_TURNS };
