// Outils dont dépend un développement (v5.1) : un code qui se sert d'un outil (paiement,
// e-mails, base de données, mesure d'audience…) ne doit pas être lancé tant que cet outil
// n'est pas choisi ET « mis en place » (compte créé, branché — case cochée sur la page Outils).
// Repérés par le modèle léger à partir du prompt de la réunion Claude Code, une fois,
// conservés sur la réunion (Session.requiredTools). Le lancement est bloqué, sauf
// confirmation explicite de l'humain (« Lancer quand même »).
const anthropic = require('./anthropic');
const db = require('../utils/db');
const { ORCHESTRATOR_MODEL, ORCHESTRATOR_PARAMS } = require('./models');
const { CATEGORIES, SETUP_CATEGORIES } = require('./tools/catalog');
const { parseJsonField } = require('../utils/parseJsonField');

const SETUP_CATS = CATEGORIES.filter(c => SETUP_CATEGORIES.has(c.id));

function buildRequiredToolsPrompt(prompt, tools) {
  const kept = tools.filter(t => t.status === 'validated');
  return {
    system: 'Tu repères les services externes dont un développement a besoin pour fonctionner. Réponds UNIQUEMENT en JSON valide, sans texte autour.',
    user: `Prompt de développement :\n${String(prompt).slice(0, 12000)}

Types de services externes possibles :
${SETUP_CATS.map(c => `- ${c.id} : ${c.label} (${c.technical})`).join('\n')}

Outils retenus pour le projet :
${kept.map(t => `- ${t.name} (${t.category})`).join('\n') || '(aucun)'}

Donne les types de services que ce développement UTILISE vraiment pour fonctionner (il les appelle, s'y connecte, en lit les clés), pas ceux simplement évoqués ni ceux du reste du projet. L'hébergement n'est nécessaire que si le développement concerne la mise en ligne elle-même.
Format : {"categories":["payment"]}`,
  };
}

async function detectRequiredCategories(prompt, tools) {
  const p = buildRequiredToolsPrompt(prompt, tools);
  const res = await anthropic.messages.create({
    model: ORCHESTRATOR_MODEL, max_tokens: 200, ...ORCHESTRATOR_PARAMS,
    system: p.system, messages: [{ role: 'user', content: p.user }],
  });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const raw = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
  return [...new Set((Array.isArray(raw.categories) ? raw.categories : []).filter(c => SETUP_CATEGORIES.has(c)))];
}

// Catégories nécessaires à un développement : calculées une fois par réunion
async function requiredCategories(session, tools) {
  const stored = parseJsonField(session.requiredTools, null);
  if (Array.isArray(stored)) return stored;
  if (!String(session.deliverable || '').trim()) return [];
  let cats = [];
  try {
    cats = await detectRequiredCategories(session.deliverable, tools);
  } catch (err) {
    console.error('[devTools] repérage des outils :', err.message);
    return []; // non conservé : nouvel essai plus tard ; ne bloque pas
  }
  await db('Session').where({ id: session.id }).update({ requiredTools: JSON.stringify(cats) });
  return cats;
}

// Outils manquants : catégorie sans outil retenu, ou outil retenu pas encore mis en place
function missingTools(categories, tools) {
  return categories.map(id => {
    const cat = CATEGORIES.find(c => c.id === id);
    const kept = tools.filter(t => t.category === id && t.status === 'validated');
    if (!kept.length) return { category: id, label: cat?.label || id, tool: null, reason: 'not_chosen' };
    if (!kept.some(t => t.setupDone)) return { category: id, label: cat?.label || id, tool: kept.map(t => t.name).join(', '), reason: 'not_setup' };
    return null;
  }).filter(Boolean);
}

const describeMissing = missing => missing.map(m => (m.reason === 'not_chosen'
  ? `${m.label} : aucun outil choisi`
  : `${m.tool} (${m.label}) : pas encore mis en place`)).join(' ; ');

module.exports = { buildRequiredToolsPrompt, requiredCategories, missingTools, describeMissing };
