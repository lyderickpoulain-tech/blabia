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

const withSources = res => {
  const sources = res.webSearch?.sources || [];
  return `${res.text.trim()}${sources.length ? `\n\n---\nSources consultées : ${sources.slice(0, 8).map(s => `[${s.title || s.url}](${s.url})`).join(' · ')}` : ''}`;
};

async function generateSetupGuide(input) {
  const { callAgent } = require('../../routes/sessions/helpers'); // chargé ici : évite un cycle au démarrage
  const prompt = buildGuidePrompt(input);
  return withSources(await callAgent(prompt.system, prompt.user, 6000, DEFAULT_MODEL, null, true));
}

async function answerGuideQuestion(input) {
  const { callAgent } = require('../../routes/sessions/helpers');
  const prompt = buildGuideChatPrompt(input);
  return withSources(await callAgent(prompt.system, prompt.user, 2500, DEFAULT_MODEL, null, true));
}

module.exports = { buildGuidePrompt, buildGuideChatPrompt, generateSetupGuide, answerGuideQuestion, MAX_CHAT };
