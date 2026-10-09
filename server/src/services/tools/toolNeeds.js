// v5.0 phase 4 : BlabIA analyse les types d'outils nécessaires au projet, puis
// pré-remplit les outils du projet avec « Mes outils » (modifiables ensuite).
// - outil adapté      → pré-rempli, validé
// - outil pas adapté  → pré-rempli, statut "suggéré" + avertissement (besoin réel)
// - aucun outil       → avertissement porté par le besoin (affiché dans la catégorie)
const { randomUUID } = require('crypto');
const anthropic = require('../anthropic');
const { CATEGORIES, CATEGORY_IDS, findCatalogTool, normalize } = require('./catalog');
const { recentMemory } = require('../../utils/projectMemory');

const MODEL = 'claude-sonnet-4-6';
const FITS = ['ok', 'unsuited', 'none'];

function buildAnalysisPrompt(project, userTools) {
  const simple = (project.expertiseLevel ?? 3) <= 2;
  const cats = CATEGORIES.map(c => `- ${c.id} : ${c.label} (${c.technical}) — ${c.explanation}`).join('\n');
  const mine = userTools.length
    ? userTools.map(t => `- id=${t.id} : ${t.name} (catégorie ${t.category})`).join('\n')
    : '(aucun outil déclaré)';
  return {
    system: 'Tu es un conseiller en outils numériques. Tu réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour.',
    user: `Projet : ${project.name}
${project.description ? `Description : ${project.description}\n` : ''}${project.brief ? `Brief :\n${project.brief}\n` : ''}${project.context ? `Mémoire du projet :\n${recentMemory(project.context, 2000)}\n` : ''}
Catégories d'outils possibles :
${cats}

Outils déjà possédés par l'utilisateur (« Mes outils ») :
${mine}

Tâche : liste UNIQUEMENT les catégories réellement nécessaires à ce projet (pas de catégorie « au cas où »). Pour chacune :
- "need" : le besoin concret du projet dans cette catégorie, en une phrase${simple ? ' très simple, sans jargon' : ''}.
- "userToolId" : l'id du meilleur outil de l'utilisateur dans cette catégorie, ou null s'il n'en a pas.
- "fit" : "ok" si cet outil convient, "unsuited" s'il ne convient pas à ce projet, "none" si l'utilisateur n'a pas d'outil.
- "warning" : si "unsuited", pourquoi l'outil ne convient pas et ce qu'il faudrait ; si "none", pourquoi il faut un outil ici ; sinon null.
- "examples" : 1 à 3 noms d'outils adaptés si fit vaut "unsuited" ou "none", sinon [].

Format :
{"needs":[{"category":"<id>","need":"...","userToolId":"<id>|null","fit":"ok|unsuited|none","warning":"...|null","examples":["..."]}]}`,
  };
}

function parseAnalysis(text, userTools) {
  const match = String(text).replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Réponse d\'analyse illisible');
  const raw = JSON.parse(match[0]);
  const ids = new Set(userTools.map(t => t.id));
  const seen = new Set();
  return (Array.isArray(raw.needs) ? raw.needs : [])
    .filter(n => n && CATEGORY_IDS.has(n.category) && !seen.has(n.category) && seen.add(n.category))
    .map(n => {
      const userToolId = ids.has(n.userToolId) ? n.userToolId : null;
      let fit = FITS.includes(n.fit) ? n.fit : 'ok';
      if (!userToolId) fit = 'none';
      return {
        category: n.category,
        need: String(n.need || '').slice(0, 300),
        userToolId,
        fit,
        warning: fit === 'ok' ? null : String(n.warning || '').slice(0, 500) || null,
        examples: (Array.isArray(n.examples) ? n.examples : []).slice(0, 3).map(e => String(e).slice(0, 60)),
      };
    });
}

// Applique l'analyse sans écraser les choix de l'humain : une catégorie qui a déjà
// un outil (non refusé) n'est pas re-remplie ; seul l'avertissement de l'outil
// recommandé est rafraîchi. Fonction pure (testée).
function applyNeedsAnalysis(projectTools, userTools, needs) {
  const tools = projectTools.map(t => ({ ...t }));
  const keyOf = t => t.catalogId || normalize(t.name);
  for (const n of needs) {
    const userTool = userTools.find(t => t.id === n.userToolId) || null;
    const inCategory = tools.filter(t => t.category === n.category && t.status !== 'refused');
    if (inCategory.length > 0) {
      if (userTool) {
        const same = inCategory.find(t => keyOf(t) === keyOf(userTool));
        if (same) same.warning = n.fit === 'unsuited' ? n.warning : null;
      }
      continue;
    }
    if (!userTool) continue;
    tools.push({
      id: randomUUID(),
      catalogId: userTool.catalogId && findCatalogTool(userTool.catalogId) ? userTool.catalogId : null,
      name: userTool.name,
      category: n.category,
      origin: 'mine',
      status: n.fit === 'unsuited' ? 'suggested' : 'validated',
      need: n.need, why: '',
      cost: userTool.cost || null,
      priceSource: null,
      sessionId: null,
      warning: n.fit === 'unsuited' ? n.warning : null,
    });
  }
  // Besoins stockés (sans userToolId, propre à l'analyse)
  const storedNeeds = needs.map(({ userToolId, ...rest }) => rest);
  return { tools, needs: storedNeeds };
}

async function analyzeProjectToolNeeds(project, userTools) {
  const prompt = buildAnalysisPrompt(project, userTools);
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return parseAnalysis(text, userTools);
}

module.exports = { analyzeProjectToolNeeds, applyNeedsAnalysis, parseAnalysis, buildAnalysisPrompt };
