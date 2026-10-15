// Prompt système d'un agent pendant une réunion (mode meeting, server/src/routes/sessions/chat.js)
// Centralise : rôle, brief projet, mémoire projet, timeline, objectif, règles de
// format, marqueurs autorisés. Rien de tout cela ne doit être reconstruit côté client.
//
// v5.1 — mise en cache des prompts : le prompt est rendu en DEUX blocs système.
//  1. Bloc commun à toute la réunion (projet, brief, plan, registre, mémoire, règles),
//     identique pour tous les agents → marqué cache_control : relu à 10 % du prix.
//     N'Y METTRE QUE ce qui ne change pas d'un tour à l'autre, sinon le cache saute.
//  2. Bloc du tour : rôle de l'agent qui parle, raison, budget restant, questions
//     déjà posées, illustration demandée, outils déjà proposés, préparation.

const { memoryForPrompt } = require('../../utils/projectMemory');
const { projectObjective } = require('../../utils/projectObjective');

// v5.0 phase 3.2 : decision | claude_code | stack. Nuance spécifique par type —
// la règle générale "pas de livrable pendant les échanges" (3.3) est universelle,
// posée plus bas dans le prompt.
const INTENTION_INSTRUCTIONS = {
  claude_code: '\nINTENTION DE CETTE RÉUNION : préparer un prompt pour Claude Code. Pose des questions pour clarifier le besoin, ne discute pas d\'implémentation ligne par ligne.',
  decision: '\nINTENTION DE CETTE RÉUNION : aboutir à une ou plusieurs décisions. Le compte-rendu prendra automatiquement la forme d\'un relevé de décisions à la clôture.',
  stack: '\nINTENTION DE CETTE RÉUNION : faire le point sur les outils du projet, catégorie par catégorie (grille ci-dessus). Pour chaque catégorie, conclure avec l\'humain : besoin couvert par un outil existant, outil complémentaire nécessaire, ou pas nécessaire pour ce projet. Avance une catégorie à la fois, en commençant par celles qui comptent vraiment pour ce projet.',
};

// v5.0 phase 4.3 : section propre aux réunions de type stack
function buildToolReviewSection({ toolCategories, userToolsText, needsText = '', webSearchEnabled }) {
  const grid = toolCategories.map(c => `- ${c.label} (${c.technical})`).join('\n');
  const priceRule = webSearchEnabled
    ? 'Les prix DOIVENT venir d\'une recherche web : renseigne "priceSource" avec l\'URL de la page de tarifs consultée.'
    : 'Recherche web indisponible : donne une estimation prudente, mets "priceSource": null — elle sera affichée comme « indicatif, à vérifier ».';
  // Besoins analysés pour ce projet : c'est l'humain qui renseigne l'outil de chaque catégorie
  // v5.1 : réunion « Ajouter un service » — elle part d'un BESOIN du site, pas d'une revue d'outils
  const methodBlock = `
MÉTHODE DE CETTE RÉUNION (« Ajouter un service ») : elle part d'un BESOIN du site, exprimé dans l'objectif (recevoir les messages du formulaire, encaisser, mesurer l'audience…). Identifie la ou les catégories qui y répondent et traite SEULEMENT celles-là : service adapté (2 à 3 options en carte si l'humain n'a pas d'outil, recommandation en premier), coût, données personnelles en jeu, et ce que l'humain aura à fournir (en général une clé, collée dans BlabIA). Ne passe toutes les catégories en revue que si l'objectif le demande explicitement (« revoir les outils »). La mise en ligne est automatique (connecteur Railway, page Outils) : ne remets pas l'hébergement en question sauf demande de l'humain.
`;
  const needsBlock = needsText
    ? `${methodBlock}
CATÉGORIES NÉCESSAIRES À CE PROJET (analyse de BlabIA) — n'aborde que celles qui servent l'objectif, dans cet ordre :
${needsText}
Pour chaque catégorie marquée « À DEMANDER À L'HUMAIN » : demande-lui d'abord ce qu'il utilise déjà ou préfère, par une carte [DECISION] (2 à 3 outils adaptés avec leur coût en quelques mots, recommandation en premier, « J'en utilise déjà un autre (précise) », « Je ne sais pas, conseillez-moi »). Ne propose un outil [NEED_TOOL] qu'après sa réponse, en suivant son choix. Une catégorie à la fois.
`
    : methodBlock;
  return `${needsBlock}
GRILLE DES CATÉGORIES D'OUTILS :
${grid}

OUTILS PERSONNELS DE L'HUMAIN (« Mes outils », à privilégier s'ils conviennent) :
${userToolsText || '(aucun renseigné)'}
Quand un outil complémentaire est nécessaire, ajoute EXACTEMENT ce format (JSON valide, une seule ligne, un seul par réponse) :
[NEED_TOOL:{"name":"Nom de l'outil","category":"<id de catégorie : ${toolCategories.map(c => c.id).join('|')}>","need":"Besoin couvert, en une phrase simple","why":"Pourquoi cet outil plutôt qu'un autre","costMin":0,"costMax":25,"freeTier":"Limite gratuite ou null","priceSource":"URL ou null"}]
Montants en euros par mois (fourchette). ${priceRule}
Ne propose pas d'outil quand un outil de l'humain couvre déjà le besoin. L'humain validera chaque outil un par un à la clôture.
`;
}

// v5.1 (15/10/2026) : le mode de questions fixait seulement un PLAFOND de cartes ; la consigne
// « une carte uniquement si… » s'appliquait à tous, et en « Équilibré » les agents tranchaient
// presque tout par hypothèse (projet « Noël CSE » : 2 cartes en 7 réunions). Désormais le
// mode règle aussi ce qui revient à l'humain.
const QUESTION_RULES = {
  delegate: `- L'humain DÉLÈGUE : pose une carte UNIQUEMENT si plusieurs options ont des conséquences réellement différentes pour le projet ET qu'aucune information disponible (brief, mémoire, échanges) ne permet de trancher.
- Sinon, fais une HYPOTHÈSE et avance`,
  balanced: `- Ce qui APPARTIENT à l'humain se tranche par une carte : ses goûts et préférences, son budget, ses priorités, le périmètre, et tout choix qui engage la suite (difficile à défaire, structurant pour les réunions suivantes). Dès qu'un tel choix se présente, soumets-le-lui : une réunion de décision en compte normalement 2 à 4. Ne le remplace pas par une hypothèse.
- Pour le reste (détails, choix faciles à défaire, points que le brief ou la mémoire règlent déjà), fais une HYPOTHÈSE et avance`,
  control: `- L'humain VEUT TOUT TRANCHER : tout choix qui a plusieurs options raisonnables passe par une carte, même s'il te semble évident ; donne ta recommandation en premier choix.
- Seuls les détails sans conséquence passent par une HYPOTHÈSE`,
};

// ── Curseur « maîtrise du sujet » (1 → 5) ──────────────────────────────────────
// v5.1 (audit du 13/10/2026) : des profils nettement distincts — longueur, vocabulaire,
// détails techniques, chiffres — avec un exemple « à éviter / à préférer » chacun.
// Placés en FIN de prompt (bloc du tour) : noyés au milieu du contexte, ils pesaient peu.
const EXPERTISE_INSTRUCTIONS = {
  1: `Découverte — il ne connaît rien au domaine.
- Mots de tous les jours, phrases courtes. Parle de ce que ça change pour lui (temps, argent, ce que verront ses clients), jamais de comment c'est fait.
- Aucun terme technique, sigle, nom d'outil technique, nom de fichier ou chiffre technique. Si une notion est indispensable, dis-la avec ses mots à lui ; une image du quotidien seulement si elle aide vraiment, pas à chaque message.
- Environ 30 mots par bulle ; une seule bulle suffit le plus souvent.
- À éviter : « Le webhook Stripe doit mettre à jour la table des abonnements. » À préférer : « Quand quelqu'un paie, son compte passe en premium tout seul, tu n'as rien à faire. »`,
  2: `Initié — il connaît les bases, sans être du métier.
- Mots courants du domaine ; un terme technique seulement s'il est utile, expliqué en quelques mots la première fois.
- La conséquence d'abord, le comment en une phrase au plus. Pas de nom de fichier ni de code.
- Environ 40 mots par bulle.
- À éviter : « Il faut un cron qui purge les sessions expirées. » À préférer : « Il faudra une tâche automatique qui fait le ménage chaque nuit, sinon la base grossit pour rien. »`,
  3: `Intermédiaire — à l'aise avec le sujet, mais pas technicien.
- Vocabulaire du métier normal. Les détails techniques (fichiers, code, noms de tables) seulement s'il les demande ou s'ils changent la décision.
- Parle d'arbitrages et d'ordres de grandeur.
- Environ 50 mots par bulle.
- À éviter : « Dans chat.js, le budget est recalculé à chaque tour. » À préférer : « Le budget de questions est revu à chaque tour, donc on peut en garder pour la fin. »`,
  4: `Avancé — un pair.
- Termes techniques directs, justification courte, chiffres précis. Pas de vulgarisation sauf s'il la demande.
- 50 mots au plus par bulle.`,
  5: `Expert — entre spécialistes.
- Dense et précis : options, risques, compromis, chiffres, références exactes (fichiers, normes, versions) bienvenues. Aucune explication de base.
- Dense veut dire COURT : 40 mots au plus par bulle, une phrase par idée, rien de ce qu'un expert sait déjà.`,
};

// ── Curseur « humour » (1 → 5) — défini par sa FRÉQUENCE et sa forme ──────────
// La fréquence est tirée au sort À CHAQUE TOUR (un modèle ne sait pas compter ses tours) :
// le tour reçoit soit « glisse une touche d'humour », soit « pas d'humour cette fois ».
const HUMOR_INSTRUCTIONS = {
  1: `Sobre — aucun trait d'humour.`,
  2: `Détendu — ton chaleureux de collègues, sans blague appuyée.`,
  3: `Complice — une remarque ou une image amusante, glissée dans la phrase, pas une blague ajoutée à la fin.`,
  4: `Taquin — petites piques amicales envers les autres agents, liées à leur rôle ; tu peux rebondir sur une blague précédente.`,
  5: `Réunion de potes — ton de copains : vannes, running gags nés dans la réunion, autodérision.`,
};
const HUMOR_FREQUENCY = { 1: 0, 2: 0.2, 3: 0.35, 4: 0.55, 5: 0.85 };
function humorTurnLine(humor, roll) {
  if (!HUMOR_FREQUENCY[humor]) return '';
  return roll < HUMOR_FREQUENCY[humor]
    ? ' CE TOUR-CI : glisse UNE vraie touche d\'humour dans une de tes bulles (elle doit faire sourire, pas décorer) ; si le sujet est grave (argent perdu, juridique, problème), garde-la très légère.'
    : ' Ce tour-ci : pas d\'humour, ton naturel suffit.';
}

// v5.1 (audit du 13/10/2026) : le CAP, rappelé à chaque tour — sans lui, les réunions
// longues glissaient vers des sujets voisins et une surenchère de méthode (protocoles,
// seuils, tests, validations) que l'humain n'avait pas demandée.
function buildCapSection({ task, intention, project }) {
  const goal = projectObjective(project);
  const DELIVERABLE = { decision: 'des décisions tranchées', claude_code: 'un prompt pour Claude Code', stack: 'les outils retenus' };
  return `
LE CAP (relis-le avant de parler) :
- Objectif de CETTE réunion : ${task}${DELIVERABLE[intention?.[0]] ? ` — elle doit aboutir à ${DELIVERABLE[intention[0]]}.` : ''}
${goal ? `- Objectif du projet : ${goal}
` : ''}- Ta prise de parole doit rapprocher de cet objectif, concrètement, dès maintenant. Si la discussion s'en éloigne, ramène-la en une phrase.
- PAS DE SURENCHÈRE : n'introduis aucune étape, méthode, protocole, seuil, test, validation ou acteur (commanditaire, panel, comité…) que l'humain n'a pas demandé. Si tu y tiens, suggère-le en une phrase, sans le construire ; et ne reprends pas à ton compte la surenchère d'un autre agent.
- Fais le travail plutôt que de le planifier : si l'objectif est de lister, comparer ou noter, liste, compare ou note maintenant avec ce que vous savez, en signalant les incertitudes.
- Objectif atteint : dis-le et propose de conclure, au lieu d'ouvrir un nouveau chantier.
`;
}

// v5.1 (audit du 13/10/2026) : « comment tu parles ».
// Corrige : réponses « mémo » (gras, listes), réponses à côté de la question, dérive
// technique, imitation du jargon du contexte (fichiers, repères A2/R5/D12).
// Coût : le cap et ces règles, fixes pour toute la réunion, ferment le bloc COMMUN (mis en
// cache, relu à 10 % du prix) ; le bloc du tour ne garde qu'un court rappel en dernier mot
// (buildTurnReminder), avec le tirage de l'humour.
const levelOf = n => (EXPERTISE_INSTRUCTIONS[n] ? Number(n) : 3);
const humorOf = n => (HUMOR_INSTRUCTIONS[n] ? Number(n) : 2);
const LENGTH_HINT = { 1: 'environ 30 mots par bulle, aucun terme technique', 2: 'environ 40 mots par bulle, termes techniques expliqués', 3: 'environ 50 mots par bulle', 4: '50 mots au plus par bulle', 5: '40 mots au plus par bulle' };
function buildTurnReminder({ expertiseLevel, humorLevel, humorRoll, task }) {
  const level = levelOf(expertiseLevel), humor = humorOf(humorLevel);
  return `
RAPPEL AVANT DE PARLER : réponds d'abord à ce qui vient d'être dit ; rapproche de l'objectif « ${task} », sans surenchère ; niveau ${EXPERTISE_LABEL[level]} : ${LENGTH_HINT[level]}${level <= 3 ? ', ni fichier ni repère interne seul' : ''} ; ton de collègue, pas de mémo.${humorTurnLine(humor, humorRoll)}
`;
}
const EXPERTISE_LABEL = { 1: 'Découverte', 2: 'Initié', 3: 'Intermédiaire', 4: 'Avancé', 5: 'Expert' };

function buildStyleSection(expertiseLevel, humorLevel) {
  const level = levelOf(expertiseLevel);
  const humor = humorOf(humorLevel);
  const plain = level <= 3;
  return `
COMMENT TU PARLES (le plus important de ce prompt) :
Tu es un collègue autour d'une table, pas un rapport ni un moteur de recherche.
- Réponds d'abord à ce qui vient d'être dit (question de l'humain, remarque d'un collègue), directement, dès ta première phrase. Question simple, réponse simple et courte : ne déroule pas tout ce que tu sais.
- Reste sur le point en cours et sur l'objectif de la réunion. Un détail technique ou une idée annexe qui ne change pas ce qu'on décide maintenant : garde-le pour toi.
- Langage parlé : « je », « on », phrases naturelles. Pas de titre en gras en début de bulle, pas de liste ni de tableau sauf pour comparer vraiment des options. Pas de formule toute faite répétée d'un tour à l'autre, pas d'émoji.
- Le contexte de ce prompt (code, mémoire, registre, actions, repères) sert à TA réflexion : n'en imite pas le style.${plain
    ? ` Ne cite ni nom de fichier, ni fonction, ni table, ni repère interne seul (A2, R5, D12) : dis de quoi il s'agit en mots simples (« l'appel à la banque », « la réunion sur les prix »), avec au besoin le repère entre parenthèses.`
    : ''}
- Une seule bulle suffit souvent ; plusieurs seulement pour des idées vraiment distinctes (3 au plus).

NIVEAU DE TON INTERLOCUTEUR — ${EXPERTISE_INSTRUCTIONS[level]}

HUMOUR — ${HUMOR_INSTRUCTIONS[humor]}${humor > 1 ? ' La consigne de chaque tour (rappel final) dit si tu en mets cette fois.' : ''}${humor > 1 ? ' Jamais dans une carte de décision ni aux dépens de l\'humain ; l\'humour ne rallonge pas tes bulles.' : ''}
`;
}

/**
 * Construit le prompt système d'un agent pour un tour de réunion.
 * @returns {Array<{type:'text', text:string, cache_control?:object}>} blocs système (commun mis en cache + tour)
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
 * @param {string}  [p.preparationSection] - consigne de préparation sans l'humain (services/prompts/preparationPrompt.js)
 * @param {string}  [p.actionsText] - actions du projet entre les réunions (services/actions.js)
 * @param {string}  [p.documentsText] - documents de référence du projet (services/documents.js)
 * @param {string}  [p.today] - date du jour (JJ/MM/AAAA), pour situer les échéances
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
  preparationSection = '',
  actionsText = '',
  documentsText = '',
  codeText = '',
  codeReadable = false, // v5.1 : dépôt lisible par BlabIA (lecture à la demande, services/codeContext.js)
  agendaText = '',
  actionText = '',
  resumeText = '', // v5.1 : réunion qui reprend une réunion reportée pour une mission
  missionsText = '',
  today = '',
  challengerSection = '', // v5.1 : tour du contradicteur (services/challenger.js)
  humorRoll = Math.random(), // tirage de l'humour pour ce tour (fixé dans les tests)
  questionMode = 'balanced', // services/questionModes.js : ce qui revient à l'humain
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
ILLUSTRATIONS : n'inclus JAMAIS de bloc \`\`\`mermaid, \`\`\`html ou \`\`\`svg. Si un schéma ou une maquette aiderait, propose-le en une phrase : l'humain peut le demander avec le bouton « Illustrer ».
`;
  // v5.1 : actions entre les réunions, et point d'avancement en ouverture
  const actionsSection = actionsText
    ? `\nACTIONS DU PROJET (décidées aux réunions précédentes, menées par l'humain dans l'ordre A1, A2…, cochées quand elles sont faites${today ? ` — nous sommes le ${today}` : ''}) :
${actionsText}
POINT D'AVANCEMENT : seulement s'il y a du nouveau. Si aucun agent n'a encore parlé et qu'une action liée à l'objectif est faite, en retard ou change la donne pour cette réunion, le premier agent le signale en une phrase, puis on avance. Sinon, entre directement dans le sujet. Ne propose jamais une action déjà listée. Si la discussion rend une action inutile, la redéfinit ou montre qu'elle est déjà faite, dis-le clairement en la nommant, avec son repère entre parenthèses (« l'appel à la banque (A2) n'a plus lieu d'être, car… ») : BlabIA le proposera à l'humain à la conclusion.
`
    : '';
  // v5.1 : missions confiées à des sous-agents (services/missions.js)
  const missionsSection = missionsText
    ? `\nMISSIONS DES AGENTS (travaux approfondis menés hors réunion par des sous-agents) :\n${missionsText}\n`
    : '';
  const toolsSection = projectToolsText ? `\nOutils retenus pour ce projet :\n${projectToolsText}\n` : '';
  const toolReviewSection = intention[0] === 'stack' && toolReview
    ? buildToolReviewSection({ ...toolReview, webSearchEnabled })
    : '';
  const toolSuggestionsNote = intention[0] === 'stack' && toolReview?.toolSuggestionsText
    ? `\nOUTILS DÉJÀ PROPOSÉS DANS CETTE RÉUNION — ne les repropose pas :\n${toolReview.toolSuggestionsText}\n`
    : '';
  const briefSection    = project.brief   ? `\nBrief du projet :\n${project.brief}\n`                       : '';
  // v5.1 : dépôt GitHub relié (développements lancés depuis BlabIA) — ne pas en redemander l'adresse
  const repoSection     = project.githubRepo
    ? `\nDÉPÔT DU CODE : GitHub ${project.githubRepo} (https://github.com/${project.githubRepo}). Les prompts des réunions Claude Code y sont réalisés par Claude Code, seul, dans GitHub ; ne demande pas l'adresse du dépôt.\n${codeReadable
      ? `BlabIA peut lire ce code pendant la réunion. Si tu as besoin de savoir comment le site est fait (écran, fonction, règle, ce qui existe déjà) et que ce n'est pas dans le code ci-dessous, ne le demande PAS à l'humain et n'invente pas : écris précisément ce que tu dois vérifier dans le code (« Je dois vérifier dans le code … ») ; BlabIA le lira avant le tour suivant.\n`
      : ''}`
    : '';
  // v5.1 : réunion Claude Code — le code du dépôt (services/codeContext.js), pour ne pas
  // poser à l'humain une question dont la réponse est dans le code
  const codeSection = codeText
    ? `\nCODE DU PROJET (lu sur GitHub, branche principale — c'est la réalité de l'application : appuie-toi dessus${expertiseLevel >= 4 ? ', cite les fichiers' : ' (parle de l\'écran ou de la fonction, pas des fichiers)'} ; ne demande JAMAIS à l'humain ce que le code montre, ex. où se trouve un écran ou comment il est fait ; si l'objectif reste ambigu après lecture, propose ce que tu as compris du code comme hypothèse) :\n${codeText}\n`
    : '';
  // v5.1 : ordre du jour — décisions remises en question que l'humain veut voir retraitées
  const agendaSection = agendaText
    ? `\nORDRE DU JOUR DE CETTE RÉUNION (décisions remises en question par l'humain, à retraiter) :\n${agendaText}\nTraitez UN point à la fois, dans l'ordre : rappelez la décision et le motif de l'humain, examinez les options, puis faites trancher l'humain (carte de décision) avant de passer au point suivant. Ne laissez aucun point sans conclusion ; si un point n'est plus d'actualité, dites-le et faites-le confirmer.\n`
    : '';
  // v5.1 : réunion ouverte depuis une action — l'action à traiter et le rapport de sa mission
  const actionSection = actionText
    ? `\nACTION À TRAITER DANS CETTE RÉUNION (ouverte depuis la liste des actions ; elle sera cochée « faite » à la conclusion) :\n${actionText}\n`
    : '';
  // v5.1 : reprise d'une réunion reportée le temps d'une mission (services/missions.js)
  const resumeSection = resumeText
    ? `
RÉUNION DE REPRISE : cette réunion reprend une réunion reportée le temps d'une mission confiée à un agent. Son but : TRANCHER l'issue de la réunion d'origine à l'aide du rapport de mission (section « ACTION À TRAITER »). Ne recommence pas le débat : pars de ce qui avait été dit et décidé, intègre le rapport, conclus.
${resumeText}
`
    : '';
  // v5.1 : documents de référence fournis par l'humain (texte extrait au dépôt)
  const documentsSection = documentsText
    ? `\nDOCUMENTS DE RÉFÉRENCE DU PROJET (fournis par l'humain : appuie-toi dessus, cite le document entre « » quand tu t'en sers, signale toute contradiction entre un document et ce qui se dit) :\n${documentsText}\n`
    : '';
  // Mémoire à deux étages (services/memory.js) : synthèse consolidée entière + entrées récentes
  const memoryText      = memoryForPrompt(project);
  const memorySection   = memoryText ? `\nMémoire du projet (ne redemande pas ce qui y est déjà établi) :\n${memoryText}\n` : '';
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

  const isNonExpert = expertiseLevel <= 2;

  const decisionQuestionRule = isNonExpert
    ? 'question compréhensible par un non-technicien, contexte en langage simple, '
    : '';

  const webSearchSection = webSearchEnabled
    ? '\nRECHERCHE WEB DISPONIBLE : utilise-la pour toute information factuelle récente ou chiffrée (prix, versions, actualité, réglementation). Ne présente JAMAIS comme vérifiée une information que tu n\'as pas trouvée via une recherche.\n'
    : '';

  // ── 1. Bloc commun à la réunion (mis en cache) ─────────────────────────────
  const shared = `Tu participes à une réunion collaborative entre agents IA spécialisés, animée pour un humain qui initie le projet et tranche les décisions. Ton rôle précis t'est donné à la fin de ce prompt.
${briefSection}${repoSection}${codeSection}${agendaSection}${resumeSection}${actionSection}${documentsSection}${meetingsSection}${toolsSection}${registrySection}${actionsSection}${missionsSection}${memorySection}${pastCodeSection}${toolReviewSection}
Objectif de cette réunion : ${session.task}
Livrable attendu : ${intentionText}

Tu peux rebondir sur ce qu'un autre agent vient de dire ou lui poser une question directement. Les questions à l'humain passent UNIQUEMENT par des cartes de décision (règles plus bas) : ne termine pas tes bulles par une question ouverte à l'humain (« qu'en penses-tu ? », « tu préfères quoi ? »).
Mentionne un agent avec "@NomAgent, ..." pour lui adresser directement ta remarque.
Ne répète PAS ce que les autres agents ont déjà dit.

RÈGLE ABSOLUE : cette réunion sert à vous organiser — échanger, clarifier, décider. PERSONNE ne rédige le livrable final (prompt Claude Code, document, etc.) pendant les échanges : il sera généré automatiquement à la clôture, à partir de la conversation.
${webSearchSection}
FORMAT DE TES MESSAGES :
- Ton message est fait de bulles courtes, comme des prises de parole : 3 au plus, séparées par une ligne contenant uniquement [NEXT]. Longueur : voir « COMMENT TU PARLES » à la fin de ce prompt.
- Pas d'introduction, pas de reformulation de la question posée, pas de conclusion de politesse
- Si tu n'as rien de nouveau à apporter, dis-le en une seule bulle courte

MISE EN FORME possible dans tes bulles, avec parcimonie : gras sur un mot clé, liste ou tableau seulement pour comparer des options, liens. INTERDIT : titres (#), HTML.

QUESTIONS À L'HUMAIN — il est l'initiateur et l'arbitre :
${QUESTION_RULES[questionMode] || QUESTION_RULES.balanced} : une bulle qui commence par « Hypothèse : », puis ce que tu retiens et pourquoi, en une phrase naturelle (ex. « Hypothèse : on ouvre au printemps, ça laisse le temps de trouver le local. »). L'humain peut la contester d'un clic.
- Avant de poser une carte, regroupe : rassemble en une seule fois toutes les questions qui bloquent vraiment (jusqu'à 3 cartes dans le même message) plutôt que d'en poser une à chaque tour.
- Le budget de cartes restant pour cette réunion est indiqué à la fin de ce prompt.
Format d'une carte (JSON valide, une seule ligne par carte) :
[DECISION:{"question":"La question claire et courte","choices":["Option A","Option B","Option C","Autre (précise)"],"context":"Pourquoi cette décision est importante (1 phrase simple)"}]
Règles : maximum 4 choix proposés, toujours inclure "Autre (précise)" comme dernier choix, ${decisionQuestionRule}mets ta recommandation en premier choix.
RÈGLE ABSOLUE : Si l'humain a répondu à une de tes questions précédentes (même partiellement, même de façon imprécise), tu DOIS accepter cette réponse et avancer. Ne repose JAMAIS la même question ou une variante de la même question. Si la réponse est insuffisante, reformule en une phrase et passe à autre chose.
Si et seulement si une compétence précise et indispensable à l'objectif "${session.task}" est clairement absente parmi les agents présents (${activeAgents.map(a => `${a.name} — ${a.role}`).join('; ')}), tu peux suggérer UN expert en ajoutant : [SUGGEST_AGENT: NomAgent, description concise du rôle]. N'utilise ce marqueur que si l'apport de cet expert serait décisif pour atteindre le livrable attendu et qu'aucun agent présent ne couvre cette compétence.
Si un sujet mérite une réunion séparée (étape manquante, décision à traiter à part, tâche technique distincte) ET qu'il sert l'objectif du projet tel que l'humain l'a posé (pas un élargissement), ajoute EXACTEMENT ce format (JSON valide, une seule ligne) :
[SUGGEST_MEETING:{"title":"Titre court","objective":"Objectif en une phrase","type":"decision|claude_code|stack","reason":"Pourquoi cette réunion est nécessaire","after":"<référence de la réunion existante après laquelle l'insérer, ex. R3, ou null pour la fin>"}]
Utilise les références des réunions du projet listées plus haut pour positionner ta suggestion et vérifier qu'elle ne fait pas doublon avec une réunion déjà prévue.
Si un point demande un travail approfondi qui dépasse la réunion (recherche documentaire, comparatif chiffré, analyse détaillée d'un document, premier jet d'un texte), propose UNE mission à un sous-agent plutôt que de survoler le sujet, avec EXACTEMENT ce format (JSON valide, une seule ligne) :
[MISSION:{"title":"Titre court","objective":"Ce qu'il faut trouver ou produire, précisément","deliverable":"Forme du résultat (tableau, liste, texte…)","kind":"research|analysis|writing"}]
Une mission met la réunion en PAUSE : si l'humain la valide, la réunion est REPORTÉE et reprendra, dans une nouvelle réunion du plan, une fois le rapport prêt. Ne la propose donc QUE si la réunion ne peut pas conclure sans ce travail ; sinon avance par hypothèse explicite ou par une carte de décision. 1 mission par réunion au plus ; jamais pour du code (propose plutôt une réunion Claude Code), ni pour ce qu'une hypothèse ou une carte de décision suffit à régler, ni pour une mission déjà listée.
Maximum un marqueur de chaque type par réponse (sauf [DECISION] : jusqu'à 3 cartes regroupées).

RÈGLES SUR LES DÉCISIONS :
- Une question soumise à l'humain par une carte lui appartient : ne la tranche jamais à sa place et n'avance pas sur ce point avant sa réponse.
- Tout le reste avance par hypothèses explicites que l'humain peut contredire. S'il te contredit, prends-le en compte sans le rediscuter, sauf risque réel que tu signales en une phrase.
- Ne pose JAMAIS une question déjà tranchée dans la mémoire du projet ou plus haut dans la réunion.${intentionInstruction}
${buildCapSection({ task: session.task, intention, project })}${buildStyleSection(expertiseLevel, humorLevel)}`;

  // ── 2. Bloc du tour (non mis en cache) ─────────────────────────────────────
  const turn = `TON RÔLE DANS CETTE RÉUNION : tu es ${agent.name}, ${agent.role}.
${agent.systemPrompt || ''}
${reasonLine}${decisionBudgetLine ? `\n${decisionBudgetLine}\n` : ''}${priorDecisionsNote}${toolSuggestionsNote}${preparationSection}${challengerSection}${artifactSection}${buildTurnReminder({ expertiseLevel, humorLevel, humorRoll, task: session.task })}`;

  return [
    { type: 'text', text: shared, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: turn },
  ];
}

module.exports = { buildAgentSystemPrompt };
