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
  claude_code: { minTurn: 4, text: 'Si les besoins principaux ont été clarifiés, tu DOIS proposer shouldClose=true.' },
  decision:    { minTurn: 3, text: 'Si les décisions, options écartées et actions ont été couvertes, tu DOIS proposer shouldClose=true.' },
  stack:       { minTurn: 4, text: 'Si les catégories pertinentes ont été passées en revue, tu DOIS proposer shouldClose=true.' },
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
 * @param {number} p.turnCount
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
}) {
  const intentionKey = Array.isArray(session.intention) ? session.intention[0] : '';
  const agentList = agentsForSelection.map((a, i) => `${i + 1}. ${a.name} (${a.role})`).join('\n');

  const tourNoteCfg = TOUR_NOTES[intentionKey];
  const tourNote = tourNoteCfg && turnCount >= tourNoteCfg.minTurn
    ? `\n🚨 IMPORTANT : Cette réunion ${intentionKey} est au tour ${turnCount}. ${tourNoteCfg.text}`
    : '';

  const closeInstruction = CLOSE_INSTRUCTIONS[intentionKey] || DEFAULT_CLOSE_INSTRUCTION;

  return `Tu es l'orchestrateur d'une réunion IA.

Objectif de la réunion : "${session.task}"
Livrable attendu : ${intentionKey || 'compte-rendu'}
Tour actuel : ${turnCount} / ${MAX_TURNS}${tourNote}

Agents disponibles :
${agentList}

${blockedAgentName ? `⚠️ ${blockedAgentName} a déjà parlé ${blockedAgentCount} fois de suite. Ne le sélectionne PAS.` : ''}
${humanPriorityNote}
Si la dernière contribution contient beaucoup de jargon technique ou est difficile à comprendre pour un non-expert, donne la priorité à un agent qui peut reformuler ou vulgariser ce qui vient d'être dit.
${delegated ? `⚡ L'humain a délégué une décision aux agents. Les agents doivent débattre entre eux, argumenter leurs positions et converger vers une recommandation claire. L'agent le plus pertinent propose une conclusion en dernier.\n` : ''}Derniers échanges :
${recentMessagesText || '(début de réunion)'}

Décide maintenant :
1. Quel agent doit prendre la parole ? (numéro de 1 à ${agentsForSelection.length})
2. Pourquoi ? (1 phrase courte)
3. La réunion doit-elle se clore ? (oui/non) — ${closeInstruction}

Réponds UNIQUEMENT avec ce JSON :
{"agentIndex": 1, "reason": "...", "shouldClose": false}`;
}

module.exports = { buildOrchestratorPrompt, MAX_TURNS };
