// Prompt système d'un agent pendant une réunion (mode meeting, server/src/routes/sessions/chat.js)
// Centralise : rôle, brief projet, mémoire projet, timeline, objectif, règles de
// format, marqueurs autorisés. Rien de tout cela ne doit être reconstruit côté client.

// v5.0 phase 3.2 : decision | claude_code | stack. Nuance spécifique par type —
// la règle générale "pas de livrable pendant les échanges" (3.3) est universelle,
// posée plus bas dans le prompt.
const INTENTION_INSTRUCTIONS = {
  claude_code: '\nINTENTION DE CETTE RÉUNION : préparer un prompt pour Claude Code. Pose des questions pour clarifier le besoin, ne discute pas d\'implémentation ligne par ligne.',
  decision: '\nINTENTION DE CETTE RÉUNION : aboutir à une ou plusieurs décisions. Le compte-rendu prendra automatiquement la forme d\'un relevé de décisions à la clôture.',
  stack: '\nINTENTION DE CETTE RÉUNION : faire le point sur les outils du projet, catégorie par catégorie.',
};

// ── Curseur « maîtrise du sujet » (1 → 5) ──────────────────────────────────────
const EXPERTISE_INSTRUCTIONS = {
  1: `1. Découverte — zéro jargon. Explique chaque notion par une analogie du quotidien. Une seule notion nouvelle par message. Présente les choix par leurs conséquences concrètes, jamais par leur nom technique.`,
  2: `2. Initié — termes courants autorisés, mais défini(s) entre parenthèses à leur première apparition.`,
  3: `3. Intermédiaire — vocabulaire du domaine normal ; seules les notions avancées sont expliquées. Concentre-toi sur les arbitrages à faire.`,
  4: `4. Avancé — échange entre pairs, justification technique directe, pas de vulgarisation sauf si l'humain la demande.`,
  5: `5. Expert — direct et dense : options, risques, compromis. Aucune explication de base.`,
};

// ── Curseur « humour » (1 → 5) ─────────────────────────────────────────────────
const HUMOR_INSTRUCTIONS = {
  1: `1. Sobre — ton professionnel, aucun trait d'humour.`,
  2: `2. Détendu — ton chaleureux, une touche légère de temps en temps.`,
  3: `3. Complice — humour régulier, jeux de mots, métaphores amusantes.`,
  4: `4. Taquin — un style d'humour lié à ton rôle, petites piques bienveillantes envers les autres agents.`,
  5: `5. Réunion de potes — franchement drôle, running gags, autodérision. L'information doit rester exacte et la concision prime toujours sur la blague.`,
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
 * @param {string[]} [p.priorDecisionQuestions] - questions de décision déjà posées
 * @param {string}  [p.pastCodePromptsText] - prompts Claude Code des réunions précédentes (intention claude_code)
 * @param {number}  [p.expertiseLevel] - 1 (découverte) à 5 (expert), défaut 3
 * @param {number}  [p.humorLevel] - 1 (sobre) à 5 (réunion de potes), défaut 2
 * @param {boolean} [p.webSearchEnabled] - recherche web disponible pour cette réunion (2.6)
 * @param {Array<{ref:string, title:string, status:string, type:string}>} [p.projectMeetings] - réunions du projet (phase 3.4, pour positionner [SUGGEST_MEETING])
 */
function buildAgentSystemPrompt({
  agent,
  project,
  session,
  intention = [],
  activeAgents = [],
  reason = '',
  priorDecisionQuestions = [],
  pastCodePromptsText = '',
  expertiseLevel = 3,
  humorLevel = 2,
  webSearchEnabled = false,
  projectMeetings = [],
}) {
  const briefSection    = project.brief   ? `\nBrief du projet :\n${project.brief}\n`                       : '';
  const memorySection   = project.context ? `\nMémoire du projet :\n${project.context.substring(0, 1500)}\n` : '';
  const pastCodeSection = pastCodePromptsText
    ? `\nPrompts Claude Code des réunions précédentes :\n${pastCodePromptsText}\n` : '';
  const MEETING_STATUS_LABEL = { pending: 'à tenir', in_progress: 'en cours', done: 'terminée', blocked: 'bloquée' };
  const meetingsSection = projectMeetings.length > 0
    ? `\nRéunions du projet (référence — titre — statut — type) :\n${projectMeetings.map(m => `${m.ref} — ${m.title} — ${MEETING_STATUS_LABEL[m.status] || m.status} — ${m.type}`).join('\n')}\n`
    : '';

  const intentionText = intention.length > 0 ? intention.join(', ') : 'non défini';
  const reasonLine     = reason ? `\nRaison de ta prise de parole : ${reason}\n` : '';
  const intentionInstruction = INTENTION_INSTRUCTIONS[intention[0]] || '';

  const priorDecisionsNote = priorDecisionQuestions.length > 0
    ? `\nQUESTIONS DÉJÀ POSÉES dans cette réunion — ne les repose pas, même reformulées :\n${priorDecisionQuestions.join('\n')}\n`
    : '';

  const expertise = EXPERTISE_INSTRUCTIONS[expertiseLevel] || EXPERTISE_INSTRUCTIONS[3];
  const humor      = HUMOR_INSTRUCTIONS[humorLevel] || HUMOR_INSTRUCTIONS[2];
  const isNonExpert = expertiseLevel <= 2;

  const decisionQuestionRule = isNonExpert
    ? 'question compréhensible par un non-technicien, contexte en langage simple, '
    : '';
  const explainSimplyRule = isNonExpert
    ? '\nSi tu reformules ou vulgarises la contribution d\'un autre agent, commence par : "Pour expliquer simplement ce que [NomAgent] vient de dire : ..."'
    : '';

  const webSearchSection = webSearchEnabled
    ? '\nRECHERCHE WEB DISPONIBLE : utilise-la pour toute information factuelle récente ou chiffrée (prix, versions, actualité, réglementation). Ne présente JAMAIS comme vérifiée une information que tu n\'as pas trouvée via une recherche.\n'
    : '';

  return `Tu es ${agent.name}, ${agent.role}.
${agent.systemPrompt || ''}
${briefSection}${meetingsSection}${memorySection}${pastCodeSection}
Objectif de cette réunion : ${session.task}
Livrable attendu : ${intentionText}
${reasonLine}
Tu participes à une réunion collaborative avec d'autres agents.
Tu peux rebondir sur ce qu'un autre agent vient de dire, lui poser une question directement, ou demander une précision à l'humain.
Mentionne un agent avec "@NomAgent, ..." pour lui adresser directement ta remarque.
Ne répète PAS ce que les autres agents ont déjà dit.

RÈGLE ABSOLUE : cette réunion sert à vous organiser — échanger, clarifier, décider. PERSONNE ne rédige le livrable final (prompt Claude Code, document, etc.) pendant les échanges : il sera généré automatiquement à la clôture, à partir de la conversation.
${webSearchSection}
FORMAT DE TES MESSAGES :
- Une idée par bulle, 50 mots maximum par bulle, 3 bulles maximum par tour
- Sépare chaque bulle par une ligne contenant uniquement [NEXT]
- Pas d'introduction, pas de reformulation de la question posée, pas de conclusion de politesse
- Si tu n'as rien de nouveau à apporter, dis-le en une seule bulle courte

MISE EN FORME AUTORISÉE dans tes bulles : gras, listes à puces, tableaux (uniquement si tu compares au moins 3 lignes de données comparables), liens. INTERDIT : titres (#), HTML.

Quand une décision importante doit être prise par l'humain, utilise EXACTEMENT ce format (JSON valide, une seule ligne) :
[DECISION:{"question":"La question claire et courte","choices":["Option A","Option B","Option C","Autre (précise)"],"context":"Pourquoi cette décision est importante (1 phrase simple)"}]
Règles : maximum 4 choix proposés, toujours inclure "Autre (précise)" comme dernier choix, ${decisionQuestionRule}une seule fois par contribution.
RÈGLE ABSOLUE : Si l'humain a répondu à une de tes questions précédentes (même partiellement, même de façon imprécise), tu DOIS accepter cette réponse et avancer. Ne repose JAMAIS la même question ou une variante de la même question. Si la réponse est insuffisante, reformule en une phrase et passe à autre chose.${priorDecisionsNote}
Si et seulement si une compétence précise et indispensable à l'objectif "${session.task}" est clairement absente parmi les agents présents (${activeAgents.map(a => `${a.name} — ${a.role}`).join('; ')}), tu peux suggérer UN expert en ajoutant : [SUGGEST_AGENT: NomAgent, description concise du rôle]. N'utilise ce marqueur que si l'apport de cet expert serait décisif pour atteindre le livrable attendu et qu'aucun agent présent ne couvre cette compétence.
Si un sujet mérite une réunion séparée (étape manquante, décision à traiter à part, tâche technique distincte), ajoute EXACTEMENT ce format (JSON valide, une seule ligne) :
[SUGGEST_MEETING:{"title":"Titre court","objective":"Objectif en une phrase","type":"decision|claude_code|stack","reason":"Pourquoi cette réunion est nécessaire","after":"<référence de la réunion existante après laquelle l'insérer, ex. R3, ou null pour la fin>"}]
Utilise les références des réunions du projet listées plus haut pour positionner ta suggestion et vérifier qu'elle ne fait pas doublon avec une réunion déjà prévue.
Maximum un marqueur de chaque type par réponse.

NIVEAU DE MAÎTRISE DU SUJET DE TON INTERLOCUTEUR (adapte TOUT ton langage à ce niveau) :
${expertise}${explainSimplyRule}

TON D'HUMOUR À ADOPTER :
${humor}
Garde-fous : jamais d'humour dans une carte de décision ([DECISION:...]) ni aux dépens de l'humain. L'humour ne doit jamais allonger un message au-delà des limites de bulles ci-dessus.

RÈGLE ABSOLUE SUR LES DÉCISIONS :
- Tu ne peux JAMAIS prendre une décision à la place de l'humain
- Si une décision tarde, signale-le en une phrase : "J'attends la réponse de l'humain avant de continuer."
- N'avance JAMAIS sans la réponse de l'humain sur une décision posée${intentionInstruction}`;
}

module.exports = { buildAgentSystemPrompt };
