// Guide de mise en place (v5.1), demandé par l'utilisateur sur la page Outils : comment
// relier pas à pas tout l'écosystème du projet (dépôt GitHub, hébergeur, nom de domaine,
// e-mails…) avec les outils RETENUS. Recherche web pour des menus et adresses à jour.
// Conservé sur le projet (toolsGuide) : relu sans coût, régénéré à la demande.
//
// Fiabilité : le guide s'appuie sur la VRAIE structure du dépôt (services/repoOverview.js :
// dossiers, scripts, variables attendues) — sinon il invente (ex. déployer la racine d'un
// dépôt qui contient client/ et server/). Une discussion sous le guide (toolsGuideChat)
// répond aux questions et aux messages d'erreur ; ces échanges nourrissent le guide suivant.
const { CATEGORIES } = require('./catalog');
const { DEFAULT_MODEL } = require('../models');
const { buildWebSearchTool } = require('../webSearchTool');

const SIMPLE = level => (level ?? 3) <= 2;
const MAX_CHAT = 40;          // messages conservés
const CHAT_IN_PROMPT = 12;    // derniers messages relus

function toolsTextOf(tools) {
  const kept = tools.filter(t => t.status === 'validated');
  return CATEGORIES.map(c => ({ c, names: kept.filter(t => t.category === c.id).map(t => t.name) }))
    .filter(x => x.names.length).map(({ c, names }) => `- ${c.label} (${c.technical}) : ${names.join(', ')}`).join('\n');
}
const chatTextOf = chat => (chat || []).slice(-CHAT_IN_PROMPT)
  .map(m => `${m.role === 'user' ? 'HUMAIN' : 'BLABIA'} : ${String(m.content).slice(0, 1500)}`).join('\n\n');

function context({ project, tools, registryText = '', repoText = '' }) {
  const repo = project.githubRepo
    ? `Dépôt du code : GitHub ${project.githubRepo} (BlabIA y fait travailler Claude Code ; « Mettre en ligne » fusionne les modifications dans la branche principale).`
    : 'Pas encore de dépôt GitHub relié au projet.';
  return `Projet : ${project.name}
${project.description ? `Description : ${project.description}\n` : ''}${project.brief ? `Brief :\n${String(project.brief).slice(0, 1500)}\n` : ''}
${repo}
${repoText ? `\nSTRUCTURE RÉELLE DU DÉPÔT (lue sur GitHub — s'y conformer : dossiers, scripts, noms de variables) :\n${repoText}\n` : ''}
Outils retenus pour le projet :
${toolsTextOf(tools) || '(aucun)'}
${registryText ? `\nDécisions du projet :\n${registryText}\n` : ''}`;
}

function buildGuidePrompt({ project, tools, registryText = '', repoText = '', chat = [] }) {
  const chatText = chatTextOf(chat);
  return {
    system: 'Tu rédiges des guides pas à pas pour des personnes qui ne sont PAS informaticiennes. Français simple, phrases courtes, aucune supposition de connaissance technique. Réponds uniquement par le guide, en Markdown.',
    user: `${context({ project, tools, registryText, repoText })}${chatText ? `\nPROBLÈMES DÉJÀ RENCONTRÉS ET SOLUTIONS (discussion sous le guide précédent — le nouveau guide doit les éviter) :\n${chatText}\n` : ''}
Rédige le GUIDE DE MISE EN PLACE qui relie ces outils entre eux, dans l'ordre où il faut le faire.
- Une section « ## Étape N — <action> » par branchement (ex. créer le compte chez l'hébergeur et y relier le dépôt GitHub pour que chaque mise en ligne publie le site ; acheter le nom de domaine ; faire pointer le domaine vers l'hébergeur ; adresse e-mail ; mesure d'audience…). Seulement ce que les outils retenus demandent.
- Dans chaque étape : étapes numérotées très détaillées — quel site ouvrir (adresse complète), où cliquer (nom exact des menus et boutons, en anglais si l'interface l'est), quoi copier et où le coller, combien ça coûte, combien de temps ça prend (ex. propagation d'un nom de domaine), et comment vérifier que c'est bon.
- Vérifie les menus et les adresses par une recherche web : les interfaces changent. Si un détail reste incertain, dis-le simplement (« le bouton peut s'appeler… »).
- Les secrets (mots de passe, clés) : dis où les ranger, jamais de les envoyer à quelqu'un ni de les écrire dans BlabIA. Une clé secrète (service, API) ne va JAMAIS dans la partie « site » (frontend) : seulement côté serveur.
- Pour l'hébergeur : le relier au dépôt GitHub par son intégration GitHub officielle, pour qu'il publie AUTOMATIQUEMENT chaque fusion dans la branche principale (c'est ce que fait « Mettre en ligne » dans BlabIA) ET qu'il le signale à GitHub (déploiements) : BlabIA affiche alors l'adresse du site. Si l'hébergeur le permet, activer aussi les aperçus des pull requests (ex. « PR Environments » chez Railway, « Preview Deployments » chez Vercel, « Deploy Previews » chez Netlify) : BlabIA montre alors « Voir l'aperçu » avant la mise en ligne.
- Déploiement conforme à la STRUCTURE RÉELLE ci-dessus : un service par partie à déployer, avec son dossier racine (Root Directory) exact, la commande de construction et de démarrage seulement si l'hébergeur ne les détecte pas, et pour CHAQUE service la liste exacte des variables à renseigner (noms ci-dessus) et où trouver leur valeur. Ordre : d'abord la partie dont l'adresse sert à l'autre (ex. le serveur, dont l'adresse va dans une variable du site), puis l'autre. Une partie qui n'est pas encore utile (ex. un serveur qui ne fait rien) peut attendre : dis-le. Les variables lues par le navigateur (ex. préfixe VITE_) doivent être renseignées AVANT la construction.
- Termine par « ## Vérification finale » : comment constater que tout fonctionne de bout en bout.
- Ajoute « ## En cas d'erreur » : les erreurs les plus probables pour cette structure et cet hébergeur, avec leur correction — et rappelle qu'on peut coller un message d'erreur dans la discussion sous ce guide.
- Si une catégorie indispensable manque (ex. aucun hébergeur retenu), commence par un encadré « > À décider d'abord : … ».
${SIMPLE(project.expertiseLevel) ? '- Explique chaque terme technique entre parenthèses la première fois (ex. DNS).' : ''}`,
  };
}

// Question ou message d'erreur posé sous le guide : réponse courte, concrète, pas à pas
function buildGuideChatPrompt({ project, tools, registryText = '', repoText = '', guide = '', chat = [], message }) {
  const chatText = chatTextOf(chat);
  return {
    system: 'Tu aides une personne qui n\'est PAS informaticienne à mettre en place les outils de son projet (hébergement, nom de domaine, e-mails…). Français simple, phrases courtes. Réponds en Markdown, sans introduction.',
    user: `${context({ project, tools, registryText, repoText })}
${guide ? `GUIDE DE MISE EN PLACE QU'ELLE SUIT :\n${String(guide).slice(0, 12000)}\n` : '(pas encore de guide)\n'}
${chatText ? `DISCUSSION JUSQU'ICI :\n${chatText}\n` : ''}
NOUVEAU MESSAGE DE L'HUMAIN (question, ou message d'erreur collé) :
${message}

Réponds :
- Si c'est une erreur : en une phrase, ce qu'elle veut dire ; puis la correction en étapes numérotées très précises (site, menu, bouton, valeur exacte à saisir), en t'appuyant sur la STRUCTURE RÉELLE DU DÉPÔT ; puis comment vérifier que c'est réglé.
- Si la correction demande de modifier le code, dis-le clairement et propose le texte d'une demande à faire à Claude Code dans une réunion Claude Code (BlabIA la réalisera), au lieu de faire modifier des fichiers à la main.
- Si le guide était faux ou incomplet sur ce point, termine par « Correction du guide : … » en une phrase (elle sera reprise au prochain guide).
- Si une information manque pour répondre, pose UNE question précise.
- Vérifie par une recherche web les menus et réglages de l'hébergeur si besoin. Jamais de demande de mot de passe ou de clé : dis où les mettre, pas de les écrire ici.
${SIMPLE(project.expertiseLevel) ? '- Explique chaque terme technique entre parenthèses.' : ''}`,
  };
}

// ── Exécution avec recherche web ───────────────────────────────────────────────
// Plafonds de recherches (deux constantes, faciles à changer) : le guide couvre plusieurs
// services (8 par défaut — 5 serait possible, à confirmer), une réponse de discussion un seul sujet.
const GUIDE_MAX_SEARCHES = 8;
const CHAT_MAX_SEARCHES = 3;
const MAX_RESUMES = 3;          // relances après pause_turn
const MAX_SOURCES = 20;
const NO_MORE_SEARCH = '\n\nTu as épuisé ton budget de recherches web : conclus et rédige maintenant la réponse complète, SANS nouvelle recherche.';

const isUnauthorized = err => err?.status === 403
  || /not.?(enabled|authorized|permitted)|permission|organization/i.test(String(err?.message || ''));

// Sources (url, titre) : résultats de recherche et citations, sans doublons
function collectSources(content, into) {
  const add = (url, title) => { if (url && !into.has(url)) into.set(url, { url, title: title || url }); };
  for (const b of content || []) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(r => r.type === 'web_search_result' && add(r.url, r.title));
    if (b.type === 'text' && Array.isArray(b.citations)) b.citations.forEach(c => c.type === 'web_search_result_location' && add(c.url, c.title));
  }
}

// Appelle Claude avec l'outil web (budget CUMULÉ de recherches) et relance sur pause_turn.
// Résultat : { text, check: { status, searches, sources } } — jamais d'échec silencieux :
// check.status dit si les menus ont réellement été vérifiés en ligne.
async function runWithWebSearch({ budget, system, user, maxTokens, model = DEFAULT_MODEL, label = 'tools/guide', create }) {
  const anthropic = require('../anthropic'); // chargé ici : évite un cycle au démarrage
  const call = create || (p => anthropic.messages.create(p));
  const sources = new Map();
  let messages = [{ role: 'user', content: user }];
  let searches = 0, toolBlocks = 0, successes = 0, toolErrors = 0, resumes = 0;
  let response = null, unauthorized = false;

  for (;;) {
    const remaining = budget - searches;
    // Budget épuisé : l'outil reste déclaré (l'historique contient des blocs server_tool_use ;
    // max_uses: 0 est refusé) avec 1 recherche au plus, et la consigne de conclure sans chercher.
    const exhausted = remaining < 1;
    try {
      response = await call({
        model, max_tokens: maxTokens, messages,
        system: exhausted ? system + NO_MORE_SEARCH : system,
        tools: [buildWebSearchTool({ maxUses: exhausted ? 1 : remaining })],
      });
    } catch (err) {
      if (!isUnauthorized(err)) throw err;
      console.warn(`[${label}] recherche web non autorisée (${err.status || '?'}) : ${err.message}`);
      unauthorized = true;
      break;
    }
    if (response.model && response.model !== model) console.warn(`[${label}] bascule de modèle : ${model} → ${response.model}`);
    searches += response.usage?.server_tool_use?.web_search_requests || 0;
    for (const b of response.content || []) {
      if (b.type === 'server_tool_use' && b.name === 'web_search') toolBlocks++;
      if (b.type === 'web_search_tool_result') {
        if (Array.isArray(b.content)) successes++; else toolErrors++;
      }
    }
    collectSources(response.content, sources);
    if (response.stop_reason !== 'pause_turn' || resumes >= MAX_RESUMES) break;
    resumes++;
    // L'outil n'a pas fini : on renvoie la réponse interrompue (recherches comprises)
    messages = [...messages, { role: 'assistant', content: response.content }];
  }

  if (unauthorized) {
    // Pas d'outil web pour cette organisation : le guide est quand même rédigé, mais non vérifié
    response = await call({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
    searches = 0; toolBlocks = 0; sources.clear();
  }

  let status;
  if (response.stop_reason === 'max_tokens' || response.stop_reason === 'pause_turn') status = 'truncated';
  else if (unauthorized) status = 'unauthorized';
  else if (searches === 0 && toolBlocks === 0) status = 'not_searched';
  else if (successes > 0) status = 'verified';
  else status = 'error';

  const check = { status, searches, sources: [...sources.values()].slice(0, MAX_SOURCES) };
  console.log(`[${label}] recherche web : ${status} — ${searches} recherche(s), ${check.sources.length} source(s), ${resumes} relance(s)${toolErrors ? `, ${toolErrors} erreur(s) de l'outil` : ''}, modèle ${response.model || model}`);
  return { text: require('../anthropic').textOf(response).trim(), check };
}

async function generateSetupGuide(input) {
  const prompt = buildGuidePrompt(input);
  return runWithWebSearch({ budget: GUIDE_MAX_SEARCHES, system: prompt.system, user: prompt.user, maxTokens: 6000, label: 'tools/guide' });
}

async function answerGuideQuestion(input) {
  const prompt = buildGuideChatPrompt(input);
  return runWithWebSearch({ budget: CHAT_MAX_SEARCHES, system: prompt.system, user: prompt.user, maxTokens: 2500, label: 'tools/guide/chat' });
}

// ── Brouillon et étiquette (route POST /tools/guide) ────────────────────────────
// Un guide enregistré sans étiquette (toolsGuideCheck NULL, avant cette version) vaut « à vérifier ».
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const checkStatusOf = check => check?.status || 'unverified';
const isVerified = check => check?.status === 'verified';
// Écraser un guide vérifié par un qui ne l'est pas demande la confirmation de l'humain
const needsOverwriteConfirmation = (previousCheck, nextCheck) => isVerified(previousCheck) && !isVerified(nextCheck);
const draftExpired = (draft, now = Date.now()) => !draft?.generatedAt || now - new Date(draft.generatedAt).getTime() > DRAFT_TTL_MS;

module.exports = {
  buildGuidePrompt, buildGuideChatPrompt, generateSetupGuide, answerGuideQuestion, runWithWebSearch, MAX_CHAT,
  GUIDE_MAX_SEARCHES, CHAT_MAX_SEARCHES, MAX_RESUMES, DRAFT_TTL_MS,
  checkStatusOf, isVerified, needsOverwriteConfirmation, draftExpired,
};
