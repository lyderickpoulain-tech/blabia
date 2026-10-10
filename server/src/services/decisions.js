// Registre des décisions du projet (table Decision).
// - À la clôture : extraction des décisions de la réunion (proposées à l'humain,
//   inscrites seulement après sa validation).
// - Pendant les réunions : registre transmis aux agents pour qu'ils ne redemandent
//   pas ce qui est tranché, et retraitent ce que l'humain a remis en question.
const db = require('../utils/db');
const anthropic = require('./anthropic');
const { parseJsonField } = require('../utils/parseJsonField');
const { parseActions, parseTriage } = require('./actions');

const { DEFAULT_MODEL: MODEL } = require('./models');
const ORIGINS  = ['human', 'agents'];
const STATUSES = ['active', 'reopened', 'superseded'];
const MAX_PROPOSALS = 15;
const MAX_IN_PROMPT = 40;

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

function sanitizeDecision(d) {
  if (!d || !clean(d.statement, 500)) return null;
  return {
    statement: clean(d.statement, 500),
    rationale: clean(d.rationale, 1000) || null,
    rejectedOptions: (Array.isArray(d.rejectedOptions) ? d.rejectedOptions : [])
      .map(o => clean(o, 200)).filter(Boolean).slice(0, 6),
    origin: ORIGINS.includes(d.origin) ? d.origin : 'human',
    // v5.1 : relecture du contradicteur — risque d'une décision fragile, sinon null
    vigilance: clean(d.vigilance, 300) || null,
  };
}

// Cartes de décision de la réunion avec la réponse de l'humain (absentes de la
// transcription, qui exclut les messages système)
function decisionCardsText(messages) {
  return messages
    .filter(m => m.type === 'decision')
    .map(m => {
      const answer = m.status === 'answered' ? `réponse de l'humain : « ${m.answer} »`
        : m.status === 'delegated' ? 'l\'humain a délégué la décision aux agents'
        : 'sans réponse';
      return `- ${m.question} (posée par ${m.agentName}) → ${answer}`;
    })
    .join('\n');
}

function buildExtractionPrompt({ task, historyText, cardsText, registryText, actionsText, challenger = false }) {
  return {
    system: 'Tu extrais les décisions et les actions d\'une réunion de projet. Tu réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour.',
    user: `Objectif de la réunion : ${task}

Questions posées à l'humain pendant la réunion :
${cardsText || '(aucune)'}

Transcription :
${historyText}

${registryText ? `Décisions DÉJÀ au registre du projet (ne les répète pas, sauf si la réunion les modifie) :\n${registryText}\n\n` : ''}Liste les décisions RÉELLEMENT prises pendant cette réunion :
- origin "human" : l'humain a tranché (réponse à une question, consigne, refus d'une proposition) ;
- origin "agents" : hypothèse d'un agent que l'humain n'a pas contredite, ou décision déléguée aux agents.
N'inclus pas les idées simplement évoquées, ni les questions restées sans réponse.
Pour chacune : "statement" (la décision en une phrase autonome, compréhensible sans la réunion), "rationale" (pourquoi, une phrase), "rejectedOptions" (options écartées, liste courte, éventuellement vide), "origin".${challenger ? '\nRELECTURE DU CONTRADICTEUR : pour au plus 2 décisions FRAGILES (fort enjeu — argent engagé, difficile à défaire, légal, conditionne la suite — ET justification faible ou alternative non examinée), ajoute "vigilance" : le risque en une phrase et comment le vérifier. Pour toutes les autres, omets ce champ. Dans le doute, omets-le.' : ''}

${actionsText ? `Actions DÉJÀ suivies dans le projet (ne les répète pas, même reformulées) :\n${actionsText}\n\n` : ''}Trie ensuite ce qui reste à faire après la réunion. CHAQUE élément va dans UNE SEULE de ces listes :
- "toDecide" : les DÉCISIONS QUI RESTENT À PRENDRE (« définir », « trancher », « choisir entre », « arbitrer »…) : ce n'est PAS une action. Une question claire par élément.
- "toolSetups" : ce qui consiste à créer un compte, souscrire, configurer ou brancher un OUTIL (hébergeur, nom de domaine, paiement, e-mails, mesure d'audience, base de données…) : cela relève de la page Outils, PAS des actions. "tool" = nom de l'outil, "category" = son type.
- "codeTasks" : ce qui consiste à écrire ou modifier le CODE (installer une police, créer des variables CSS, ajouter une page…) : c'est le travail de Claude Code, PAS de l'humain.
- "actions" : seulement les vraies ACTIONS de l'humain hors de BlabIA, ni décision, ni outil, ni code (contacter, vérifier un point légal, rédiger un contenu, tester avec de vrais utilisateurs, réserver un nom…) : 5 au maximum, les plus importantes, DANS L'ORDRE où les mener. Pas d'action pour les agents, pas d'action vague (« réfléchir à… »). Pour chacune : "title" (verbe à l'infinitif, une ligne), "detail" (précision utile, une phrase, ou vide), "dueInDays" (en jours après la réunion, UNIQUEMENT si une échéance réelle ressort des échanges ; sinon null — l'ordre suffit).
Rien de ce qui est déjà au registre ou déjà suivi ne doit réapparaître. Mieux vaut une liste vide qu'un élément inventé.

Format : {"decisions":[{"statement":"...","rationale":"...","rejectedOptions":["..."],"origin":"human|agents"}],"actions":[{"title":"...","detail":"...","dueInDays":7}],"toDecide":["Question à trancher ?"],"toolSetups":[{"tool":"Stripe","category":"paiement"}],"codeTasks":[{"title":"...","detail":"..."}]}`,
  };
}

function parseExtractionJSON(text) {
  const match = String(text).replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function parseExtraction(text) {
  const raw = typeof text === 'string' ? parseExtractionJSON(text) : text;
  if (!raw) return [];
  const seen = new Set();
  return (Array.isArray(raw.decisions) ? raw.decisions : [])
    .map(sanitizeDecision)
    .filter(d => d && !seen.has(d.statement.toLowerCase()) && seen.add(d.statement.toLowerCase()))
    .slice(0, MAX_PROPOSALS);
}

async function listDecisions(projectId) {
  const rows = await db('Decision').where({ projectId }).orderBy('createdAt', 'desc');
  return rows.map(r => ({ ...r, rejectedOptions: parseJsonField(r.rejectedOptions, []) }));
}

// Texte du registre pour les prompts : décisions actives + remises en question
function formatRegistryForPrompt(decisions) {
  const active   = decisions.filter(d => d.status === 'active').slice(0, MAX_IN_PROMPT);
  const reopened = decisions.filter(d => d.status === 'reopened');
  const lines = [];
  for (const d of active) lines.push(`- ${d.statement}${d.origin === 'agents' ? ' (hypothèse validée tacitement)' : ''}`);
  const reopenedLines = reopened.map(d => `- ${d.statement}${d.reopenNote ? ` — motif de l'humain : ${d.reopenNote}` : ''}`);
  return { activeText: lines.join('\n'), reopenedText: reopenedLines.join('\n') };
}

// Décisions proposées au registre + actions proposées (v5.1), en un seul appel
async function extractMeetingDecisions({ session, messages, historyText, projectId, actionsText = '', challenger = false }) {
  const registry = await listDecisions(projectId);
  const prompt = buildExtractionPrompt({
    task: session.task,
    historyText,
    cardsText: decisionCardsText(messages),
    registryText: formatRegistryForPrompt(registry).activeText,
    actionsText,
    challenger,
  });
  const response = await anthropic.messages.create({
    model: MODEL, max_tokens: 2000,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const raw = parseExtractionJSON(text);
  return { decisions: parseExtraction(raw), actions: parseActions(raw), triage: parseTriage(raw) };
}

module.exports = {
  ORIGINS, STATUSES, sanitizeDecision, decisionCardsText, buildExtractionPrompt,
  parseExtraction, parseExtractionJSON, listDecisions, formatRegistryForPrompt, extractMeetingDecisions,
};
