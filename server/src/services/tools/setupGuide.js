// Guide de mise en place (v5.1), demandé par l'utilisateur sur la page Outils : comment
// relier pas à pas tout l'écosystème du projet (dépôt GitHub, hébergeur, nom de domaine,
// e-mails…) avec les outils RETENUS. Recherche web pour des menus et adresses à jour.
// Conservé sur le projet (toolsGuide) : relu sans coût, régénéré à la demande.
const { CATEGORIES } = require('./catalog');
const { DEFAULT_MODEL } = require('../models');

const SIMPLE = level => (level ?? 3) <= 2;

function buildGuidePrompt({ project, tools, registryText = '' }) {
  const kept = tools.filter(t => t.status === 'validated');
  const byCat = CATEGORIES.map(c => ({ c, names: kept.filter(t => t.category === c.id).map(t => t.name) })).filter(x => x.names.length);
  const toolsText = byCat.map(({ c, names }) => `- ${c.label} (${c.technical}) : ${names.join(', ')}`).join('\n');
  const repo = project.githubRepo
    ? `Dépôt du code : GitHub ${project.githubRepo} (déjà créé ; BlabIA y fait travailler Claude Code et « Mettre en ligne » fusionne les modifications dans la branche principale).`
    : 'Pas encore de dépôt GitHub relié au projet.';
  return {
    system: 'Tu rédiges des guides pas à pas pour des personnes qui ne sont PAS informaticiennes. Français simple, phrases courtes, aucune supposition de connaissance technique. Réponds uniquement par le guide, en Markdown.',
    user: `Projet : ${project.name}
${project.description ? `Description : ${project.description}\n` : ''}${project.brief ? `Brief :\n${String(project.brief).slice(0, 1500)}\n` : ''}
${repo}

Outils retenus pour le projet :
${toolsText}
${registryText ? `\nDécisions du projet :\n${registryText}\n` : ''}
Rédige le GUIDE DE MISE EN PLACE qui relie ces outils entre eux, dans l'ordre où il faut le faire.
- Une section « ## Étape N — <action> » par branchement (ex. créer le compte chez l'hébergeur et y relier le dépôt GitHub pour que chaque mise en ligne publie le site ; acheter le nom de domaine ; faire pointer le domaine vers l'hébergeur ; adresse e-mail ; mesure d'audience…). Seulement ce que les outils retenus demandent.
- Dans chaque étape : étapes numérotées très détaillées — quel site ouvrir (adresse complète), où cliquer (nom exact des menus et boutons, en anglais si l'interface l'est), quoi copier et où le coller, combien ça coûte, combien de temps ça prend (ex. propagation d'un nom de domaine), et comment vérifier que c'est bon.
- Vérifie les menus et les adresses par une recherche web : les interfaces changent. Si un détail reste incertain, dis-le simplement (« le bouton peut s'appeler… »).
- Les secrets (mots de passe, clés) : dis où les ranger, jamais de les envoyer à quelqu'un ni de les écrire dans BlabIA.
- Termine par « ## Vérification finale » : comment constater que tout fonctionne de bout en bout.
- Si une catégorie indispensable manque (ex. aucun hébergeur retenu), commence par un encadré « > À décider d'abord : … ».
${SIMPLE(project.expertiseLevel) ? '- Explique chaque terme technique entre parenthèses la première fois (ex. DNS).' : ''}`,
  };
}

async function generateSetupGuide({ project, tools, registryText }) {
  const { callAgent } = require('../../routes/sessions/helpers'); // chargé ici : évite un cycle au démarrage
  const prompt = buildGuidePrompt({ project, tools, registryText });
  const res = await callAgent(prompt.system, prompt.user, 6000, DEFAULT_MODEL, null, true);
  const sources = res.webSearch?.sources || [];
  const sourcesText = sources.length ? `\n\n---\nSources consultées : ${sources.slice(0, 8).map(s => `[${s.title || s.url}](${s.url})`).join(' · ')}` : '';
  return `${res.text.trim()}${sourcesText}`;
}

module.exports = { buildGuidePrompt, generateSetupGuide };
