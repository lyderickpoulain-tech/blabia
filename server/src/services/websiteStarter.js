// Projet « site web à créer de zéro » (v5.1) : plan type, dans l'ordre voulu par
// l'utilisateur — d'abord décider (les décisions alimentent ensuite le prompt de Claude
// Code par le registre), puis construire. Pas de réunion « outils » au départ : le pack
// recommandé (Railway, GitHub, Claude Code) est posé d'office et la mise en ligne est
// automatique (connecteur Railway) ; une réunion « Ajouter un service » vient plus tard,
// quand le site a besoin d'une nouvelle capacité (e-mails, paiement, audience…).
// Le dépôt GitHub est créé par BlabIA (routes/github.js, createProjectRepo).
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const { findCatalogTool } = require('./tools/catalog');
const { getProjectTools, sanitizeProjectTools } = require('./tools/toolsStore');

const WEBSITE_PLAN = [
  { type: 'decision', title: 'Définir le site : objectif, public et pages',
    description: 'À quoi sert le site, pour qui, ce que le visiteur doit pouvoir faire ; liste des pages et de leur contenu ; fonctionnalités indispensables et celles qui peuvent attendre.' },
  { type: 'decision', title: 'Choisir le style : identité visuelle, ton et contenus',
    description: 'Couleurs, typographie, logo, ambiance ; ton des textes ; qui fournit les textes et les images ; sites qui servent de modèle.' },
  { type: 'claude_code', title: 'Construire la première version du site',
    description: 'Claude Code construit le site à partir des décisions prises et des outils retenus, puis vous le relisez avant de le mettre en ligne.' },
];

// Ajoute les réunions du plan type à la fin du plan (sans doublon de titre).
// Renvoie les réunions créées.
async function addWebsitePlan(projectId, userId) {
  const existing = new Set((await db('Milestone').where({ projectId }).select('title')).map(m => m.title.trim().toLowerCase()));
  const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId });
  let order = (maxOrder ?? -1) + 1;
  const rows = WEBSITE_PLAN.filter(m => !existing.has(m.title.toLowerCase())).map(m => ({
    id: randomUUID(), projectId, title: m.title, description: m.description, type: m.type,
    status: 'pending', displayOrder: order++, createdAt: new Date(), createdBy: userId,
  }));
  if (!rows.length) return [];
  return db('Milestone').insert(rows).returning(['id', 'title', 'type', 'status', 'displayOrder']);
}

// Pack recommandé : posé dans les catégories encore vides (un outil déjà choisi est respecté)
const RECOMMENDED_PACK = ['railway', 'github', 'claude-code'];
async function addRecommendedPack(project) {
  const tools = await getProjectTools(project);
  const added = [];
  for (const id of RECOMMENDED_PACK) {
    const c = findCatalogTool(id);
    if (!c || tools.some(t => t.category === c.category && ['validated', 'suggested'].includes(t.status))) continue;
    added.push({ catalogId: c.id, name: c.name, category: c.category, origin: 'mine', status: 'validated', cost: c.cost,
      why: c.id === 'railway' ? 'Pack recommandé par BlabIA : mise en ligne automatique (page Outils), avec une adresse de test gratuite.' : 'Pack recommandé par BlabIA.' });
  }
  if (added.length) await db('Project').where({ id: project.id }).update({ tools: JSON.stringify(sanitizeProjectTools([...tools, ...added])) });
  return added.map(t => t.name);
}

module.exports = { WEBSITE_PLAN, addWebsitePlan, addRecommendedPack, RECOMMENDED_PACK };
