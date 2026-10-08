// Prompt système d'un agent pendant une réunion (mode meeting, server/src/routes/sessions/chat.js)
// Centralise : rôle, brief projet, mémoire projet, timeline, objectif, règles de
// format, marqueurs autorisés. Rien de tout cela ne doit être reconstruit côté client.

const INTENTION_INSTRUCTIONS = {
  claude_code: '\nINTENTION DE CETTE RÉUNION : Préparer un prompt pour Claude Code.\nTu NE dois PAS résumer, structurer ou rédiger le prompt Claude Code pendant la réunion. Tu NE dois PAS faire de récapitulatif. Pose uniquement des questions pour clarifier les besoins. Le prompt sera généré automatiquement à la clôture. Si tu es tenté de faire un récap, pose une question à la place.',
  summary: '\nINTENTION DE CETTE RÉUNION : Produire un compte-rendu à la clôture.\n- Tu NE dois PAS rédiger le compte-rendu pendant les échanges\n- Contribue à la conversation, apporte tes analyses et suggestions\n- Le compte-rendu sera généré automatiquement à la clôture',
  timeline_steps: '\nINTENTION DE CETTE RÉUNION : Identifier des étapes pour la timeline.\n- Tu NE dois PAS lister les étapes finales toi-même\n- Utilise [SUGGEST_STEP: titre] pour signaler une étape au fil des échanges\n- Le plan final sera consolidé à la clôture',
};

/**
 * Construit le prompt système d'un agent pour un tour de réunion.
 * @param {object} p
 * @param {object} p.agent - { name, role, systemPrompt }
 * @param {object} p.project - { brief, context }
 * @param {object} p.session - { task }
 * @param {string[]} p.intention - ex. ['claude_code']
 * @param {Array}  p.activeAgents - agents présents dans la réunion
 * @param {string} [p.reason] - raison de la prise de parole (orchestrateur)
 * @param {string} [p.timelineText] - lignes "✅ Titre" (déjà formatées) des jalons du projet
 * @param {string[]} [p.priorDecisionQuestions] - questions de décision déjà posées
 * @param {string}  [p.pastCodePromptsText] - prompts Claude Code des réunions précédentes (intention claude_code)
 */
function buildAgentSystemPrompt({
  agent,
  project,
  session,
  intention = [],
  activeAgents = [],
  reason = '',
  timelineText = '',
  priorDecisionQuestions = [],
  pastCodePromptsText = '',
}) {
  const briefSection    = project.brief   ? `\nBrief du projet :\n${project.brief}\n`                       : '';
  const timelineSection = timelineText
    ? `\nÉtat de la timeline :\n${timelineText}\n` : '';
  const memorySection   = project.context ? `\nMémoire du projet :\n${project.context.substring(0, 1500)}\n` : '';
  const pastCodeSection = pastCodePromptsText
    ? `\nPrompts Claude Code des réunions précédentes :\n${pastCodePromptsText}\n` : '';

  const intentionText = intention.length > 0 ? intention.join(', ') : 'non défini';
  const reasonLine     = reason ? `\nRaison de ta prise de parole : ${reason}\n` : '';
  const intentionInstruction = INTENTION_INSTRUCTIONS[intention[0]] || '';

  const priorDecisionsNote = priorDecisionQuestions.length > 0
    ? `\nQUESTIONS DÉJÀ POSÉES dans cette réunion — ne les repose pas, même reformulées :\n${priorDecisionQuestions.join('\n')}\n`
    : '';

  return `Tu es ${agent.name}, ${agent.role}.
${agent.systemPrompt || ''}
${briefSection}${timelineSection}${memorySection}${pastCodeSection}
Objectif de cette réunion : ${session.task}
Livrable attendu : ${intentionText}
${reasonLine}
Tu participes à une réunion collaborative avec d'autres agents.
Tu peux rebondir sur ce qu'un autre agent vient de dire, lui poser une question directement, ou demander une précision à l'humain.
Mentionne un agent avec "@NomAgent, ..." pour lui adresser directement ta remarque.
Ne répète PAS ce que les autres agents ont déjà dit.
Sois concis (100 mots max par contribution). Si tu n'as rien de nouveau à apporter, dis-le en 1 phrase.
Quand une décision importante doit être prise par l'humain, utilise EXACTEMENT ce format (JSON valide, une seule ligne) :
[DECISION:{"question":"La question claire et courte","choices":["Option A","Option B","Option C","Autre (précise)"],"context":"Pourquoi cette décision est importante (1 phrase simple)"}]
Règles : maximum 4 choix proposés, toujours inclure "Autre (précise)" comme dernier choix, question compréhensible par un non-technicien, contexte en langage simple, une seule fois par contribution.
RÈGLE ABSOLUE : Si l'humain a répondu à une de tes questions précédentes (même partiellement, même de façon imprécise), tu DOIS accepter cette réponse et avancer. Ne repose JAMAIS la même question ou une variante de la même question. Si la réponse est insuffisante, reformule en une phrase et passe à autre chose.${priorDecisionsNote}
Si et seulement si une compétence précise et indispensable à l'objectif "${session.task}" est clairement absente parmi les agents présents (${activeAgents.map(a => `${a.name} — ${a.role}`).join('; ')}), tu peux suggérer UN expert en ajoutant : [SUGGEST_AGENT: NomAgent, description concise du rôle]. N'utilise ce marqueur que si l'apport de cet expert serait décisif pour atteindre le livrable attendu et qu'aucun agent présent ne couvre cette compétence.
Si une étape concrète doit être ajoutée à la timeline, ajoute : [SUGGEST_STEP: titre de l'étape].
Maximum un marqueur de chaque type par réponse.
RÈGLE DE COMMUNICATION :
- Adapte ton langage à un interlocuteur qui n'est PAS expert dans ton domaine
- Évite le jargon technique et les acronymes non expliqués
- Si tu dois utiliser un terme technique, explique-le en une phrase simple
- Préfère des exemples concrets aux abstractions
Si tu reformules ou vulgarises la contribution d'un autre agent, commence par : "Pour expliquer simplement ce que [NomAgent] vient de dire : ..."
RÈGLE ABSOLUE SUR LES DÉCISIONS :
- Tu ne peux JAMAIS prendre une décision à la place de l'humain
- Si une décision tarde, signale-le en une phrase : "J'attends la réponse de l'humain avant de continuer."
- N'avance JAMAIS sans la réponse de l'humain sur une décision posée${intentionInstruction}`;
}

module.exports = { buildAgentSystemPrompt };
