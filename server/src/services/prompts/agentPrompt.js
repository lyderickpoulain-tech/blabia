// Prompt système d'un agent pendant une réunion (mode meeting, server/src/routes/sessions/chat.js)
// Centralise : rôle, brief projet, mémoire projet, timeline, objectif, règles de
// format, marqueurs autorisés. Rien de tout cela ne doit être reconstruit côté client.

const { recentMemory } = require('../../utils/projectMemory');

// v5.0 phase 3.2 : decision | claude_code | stack. Nuance spécifique par type —
// la règle générale "pas de livrable pendant les échanges" (3.3) est universelle,
// posée plus bas dans le prompt.
const INTENTION_INSTRUCTIONS = {
  claude_code: '\nINTENTION DE CETTE RÉUNION : préparer un prompt pour Claude Code. Pose des questions pour clarifier le besoin, ne discute pas d\'implémentation ligne par ligne.',
  decision: '\nINTENTION DE CETTE RÉUNION : aboutir à une ou plusieurs décisions. Le compte-rendu prendra automatiquement la forme d\'un relevé de décisions à la clôture.',
  stack: '\nINTENTION DE CETTE RÉUNION : faire le point sur les outils du projet, catégorie par catégorie (grille ci-dessus). Pour chaque catégorie, conclure avec l\'humain : besoin couvert par un outil existant, outil complémentaire nécessaire, ou pas nécessaire pour ce projet. Avance une catégorie à la fois, en commençant par celles qui comptent vraiment pour ce projet.',
};

// v5.0 phase 4.3 : section propre aux réunions de type stack
function buildToolReviewSection({ toolCategories, userToolsText, toolSuggestionsText, webSearchEnabled }) {
  const grid = toolCategories.map(c => `- ${c.label} (${c.technical})`).join('\n');
  const priceRule = webSearchEnabled
    ? 'Les prix DOIVENT venir d\'une recherche web : renseigne "priceSource" avec l\'URL de la page de tarifs consultée.'
    : 'Recherche web indisponible : donne une estimation prudente, mets "priceSource": null — elle sera affichée comme « indicatif, à vérifier ».';
  return `
GRILLE DES CATÉGORIES D'OUTILS :
${grid}

OUTILS PERSONNELS DE L'HUMAIN (« Mes outils », à privilégier s'ils conviennent) :
${userToolsText || '(aucun renseigné)'}
${toolSuggestionsText ? `\nOUTILS DÉJÀ PROPOSÉS DANS CETTE RÉUNION — ne les repropose pas :\n${toolSuggestionsText}\n` : ''}
Quand un outil complémentaire est nécessaire, ajoute EXACTEMENT ce format (JSON valide, une seule ligne, un seul par réponse) :
[NEED_TOOL:{"name":"Nom de l'outil","category":"<id de catégorie : ${toolCategories.map(c => c.id).join('|')}>","need":"Besoin couvert, en une phrase simple","why":"Pourquoi cet outil plutôt qu'un autre","costMin":0,"costMax":25,"freeTier":"Limite gratuite ou null","priceSource":"URL ou null"}]
Montants en euros par mois (fourchette). ${priceRule}
Ne propose pas d'outil quand un outil de l'humain couvre déjà le besoin. L'humain validera chaque outil un par un à la clôture.
`;
}

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
 * @param {string}  [p.projectToolsText] - outils validés du projet, par catégorie (phase 4)
 * @param {object}  [p.toolReview] - réunion stack : { toolCategories, userToolsText, toolSuggestionsText } (phase 4.3)
 * @param {string|null} [p.artifactRequest] - illustration demandée par l'humain pour ce tour (phase 5), null sinon
 * @param {{used:number, max:number}|null} [p.decisionBudget] - cartes de décision déjà posées / budget de la réunion
 * @param {{activeText:string, reopenedText:string}|null} [p.decisionRegistry] - registre des décisions du projet (services/decisions.js)
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
  projectToolsText = '',
  toolReview = null,
  artifactRequest = null,
  decisionBudget = null,
  decisionRegistry = null,
}) {
  // Registre des décisions du projet : ce qui est tranché ne se redemande pas ;
  // ce que l'humain a remis en question est à retraiter en priorité.
  const registrySection = decisionRegistry && (decisionRegistry.activeText || decisionRegistry.reopenedText)
    ? `${decisionRegistry.activeText ? `\nREGISTRE DES DÉCISIONS DU PROJET (déjà tranché — ne le redemande pas, ne le rediscute pas sauf risque majeur signalé en une phrase) :\n${decisionRegistry.activeText}\n` : ''}${decisionRegistry.reopenedText ? `\nDÉCISIONS REMISES EN QUESTION PAR L'HUMAIN (à retraiter si elles concernent cette réunion, en tenant compte de son motif) :\n${decisionRegistry.reopenedText}\n` : ''}`
    : '';
  // Budget de questions de la réunion (mode de questions, cf. services/questionModes.js)
  const remaining = decisionBudget ? Math.max(0, decisionBudget.max - decisionBudget.used) : null;
  const decisionBudgetLine = remaining === null ? ''
    : remaining === 0
      ? `- BUDGET DE QUESTIONS ÉPUISÉ (${decisionBudget.max} cartes déjà posées dans cette réunion) : n'utilise PLUS AUCUNE carte [DECISION]. Tranche par hypothèse explicite ou propose de conclure la réunion.`
      : `- Budget de la réunion : il reste ${remaining} carte${remaining > 1 ? 's' : ''} de décision sur ${decisionBudget.max}. Garde-les pour l'essentiel.`;
  // v5.0 phase 5 : illustration uniquement sur demande de l'humain
  const artifactSection = artifactRequest
    ? `
ILLUSTRATION DEMANDÉE PAR L'HUMAIN : « ${artifactRequest} »
Produis UNE illustration dans ce tour, en choisissant le format le plus adapté :
- un schéma (étapes, flux, organisation, chronologie, relations) → bloc \`\`\`mermaid (syntaxe Mermaid valide, libellés courts entre guillemets si accents ou ponctuation) ;
- une maquette d'écran ou de page → bloc \`\`\`html autonome (styles inline ou balise <style>, aucune ressource externe, aucun script réseau) ;
- un visuel simple → bloc \`\`\`svg autonome (attributs viewBox, width et height).
Juste avant le bloc, donne-lui un titre court sur une ligne : [ARTIFACT_TITLE: Titre]
Accompagne-le d'UNE bulle courte (une phrase) qui dit ce que montre l'illustration. Le bloc ne compte pas dans la limite de mots.
`
    : `
ILLUSTRATIONS : n'inclus JAMAIS de bloc \`\`\`mermaid, \`\`\`html ou \`\`\`svg. Si un schéma ou une maquette aiderait, propose-le en une phrase : l'humain peut le demander avec le bouton « 🎨 Illustrer ».
`;
  const toolsSection = projectToolsText ? `\nOutils retenus pour ce projet :\n${projectToolsText}\n` : '';
  const toolReviewSection = intention[0] === 'stack' && toolReview
    ? buildToolReviewSection({ ...toolReview, webSearchEnabled })
    : '';
  const briefSection    = project.brief   ? `\nBrief du projet :\n${project.brief}\n`                       : '';
  const memorySection   = project.context ? `\nMémoire du projet (réunions les plus récentes — ne redemande pas ce qui y est déjà décidé) :\n${recentMemory(project.context)}\n` : '';
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
${briefSection}${meetingsSection}${toolsSection}${registrySection}${memorySection}${pastCodeSection}${toolReviewSection}
Objectif de cette réunion : ${session.task}
Livrable attendu : ${intentionText}
${reasonLine}
Tu participes à une réunion collaborative avec d'autres agents.
Tu peux rebondir sur ce qu'un autre agent vient de dire ou lui poser une question directement. Les questions à l'humain passent UNIQUEMENT par des cartes de décision (règles plus bas) : ne termine pas tes bulles par une question ouverte à l'humain (« qu'en penses-tu ? », « tu préfères quoi ? »).
Mentionne un agent avec "@NomAgent, ..." pour lui adresser directement ta remarque.
Ne répète PAS ce que les autres agents ont déjà dit.

RÈGLE ABSOLUE : cette réunion sert à vous organiser — échanger, clarifier, décider. PERSONNE ne rédige le livrable final (prompt Claude Code, document, etc.) pendant les échanges : il sera généré automatiquement à la clôture, à partir de la conversation.
${webSearchSection}${artifactSection}
FORMAT DE TES MESSAGES :
- Une idée par bulle, 50 mots maximum par bulle, 3 bulles maximum par tour
- Sépare chaque bulle par une ligne contenant uniquement [NEXT]
- Pas d'introduction, pas de reformulation de la question posée, pas de conclusion de politesse
- Si tu n'as rien de nouveau à apporter, dis-le en une seule bulle courte

MISE EN FORME AUTORISÉE dans tes bulles : gras, listes à puces, tableaux (uniquement si tu compares au moins 3 lignes de données comparables), liens. INTERDIT : titres (#), HTML.

QUESTIONS À L'HUMAIN — il est l'initiateur et l'arbitre, pas un formulaire à remplir :
${decisionBudgetLine}
- Pose une carte UNIQUEMENT si plusieurs options ont des conséquences réellement différentes pour le projet ET qu'aucune information disponible (brief, mémoire, échanges) ne permet de trancher.
- Sinon, fais une HYPOTHÈSE EXPLICITE et avance : « Je pars sur X (parce que…), sauf avis contraire. » L'humain peut te contredire à tout moment.
- Avant de poser une carte, regroupe : rassemble en une seule fois toutes les questions qui bloquent vraiment (jusqu'à 3 cartes dans le même message) plutôt que d'en poser une à chaque tour.
Format d'une carte (JSON valide, une seule ligne par carte) :
[DECISION:{"question":"La question claire et courte","choices":["Option A","Option B","Option C","Autre (précise)"],"context":"Pourquoi cette décision est importante (1 phrase simple)"}]
Règles : maximum 4 choix proposés, toujours inclure "Autre (précise)" comme dernier choix, ${decisionQuestionRule}mets ta recommandation en premier choix.
RÈGLE ABSOLUE : Si l'humain a répondu à une de tes questions précédentes (même partiellement, même de façon imprécise), tu DOIS accepter cette réponse et avancer. Ne repose JAMAIS la même question ou une variante de la même question. Si la réponse est insuffisante, reformule en une phrase et passe à autre chose.${priorDecisionsNote}
Si et seulement si une compétence précise et indispensable à l'objectif "${session.task}" est clairement absente parmi les agents présents (${activeAgents.map(a => `${a.name} — ${a.role}`).join('; ')}), tu peux suggérer UN expert en ajoutant : [SUGGEST_AGENT: NomAgent, description concise du rôle]. N'utilise ce marqueur que si l'apport de cet expert serait décisif pour atteindre le livrable attendu et qu'aucun agent présent ne couvre cette compétence.
Si un sujet mérite une réunion séparée (étape manquante, décision à traiter à part, tâche technique distincte), ajoute EXACTEMENT ce format (JSON valide, une seule ligne) :
[SUGGEST_MEETING:{"title":"Titre court","objective":"Objectif en une phrase","type":"decision|claude_code|stack","reason":"Pourquoi cette réunion est nécessaire","after":"<référence de la réunion existante après laquelle l'insérer, ex. R3, ou null pour la fin>"}]
Utilise les références des réunions du projet listées plus haut pour positionner ta suggestion et vérifier qu'elle ne fait pas doublon avec une réunion déjà prévue.
Maximum un marqueur de chaque type par réponse (sauf [DECISION] : jusqu'à 3 cartes regroupées).

NIVEAU DE MAÎTRISE DU SUJET DE TON INTERLOCUTEUR (adapte TOUT ton langage à ce niveau) :
${expertise}${explainSimplyRule}

TON D'HUMOUR À ADOPTER :
${humor}
Garde-fous : jamais d'humour dans une carte de décision ([DECISION:...]) ni aux dépens de l'humain. L'humour ne doit jamais allonger un message au-delà des limites de bulles ci-dessus.

RÈGLES SUR LES DÉCISIONS :
- Une question soumise à l'humain par une carte lui appartient : ne la tranche jamais à sa place et n'avance pas sur ce point avant sa réponse.
- Tout le reste avance par hypothèses explicites que l'humain peut contredire. S'il te contredit, prends-le en compte sans le rediscuter, sauf risque réel que tu signales en une phrase.
- Ne pose JAMAIS une question déjà tranchée dans la mémoire du projet ou plus haut dans la réunion.${intentionInstruction}`;
}

module.exports = { buildAgentSystemPrompt };
