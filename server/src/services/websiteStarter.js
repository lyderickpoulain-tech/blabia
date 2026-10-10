// Projet « site web à créer de zéro » (v5.1) : plan type, dans l'ordre voulu par
// l'utilisateur — d'abord décider (les décisions alimentent ensuite le prompt de Claude
// Code par le registre), puis choisir les outils, enfin construire.
// Le dépôt GitHub est créé par BlabIA (routes/github.js, createProjectRepo).
const { randomUUID } = require('crypto');
const db = require('../utils/db');

const WEBSITE_PLAN = [
  { type: 'decision', title: 'Définir le site : objectif, public et pages',
    description: 'À quoi sert le site, pour qui, ce que le visiteur doit pouvoir faire ; liste des pages et de leur contenu ; fonctionnalités indispensables et celles qui peuvent attendre.' },
  { type: 'decision', title: 'Choisir le style : identité visuelle, ton et contenus',
    description: 'Couleurs, typographie, logo, ambiance ; ton des textes ; qui fournit les textes et les images ; sites qui servent de modèle.' },
  { type: 'stack', title: 'Choisir les outils : hébergement, nom de domaine…',
    description: 'Passer en revue chaque type d’outil nécessaire (hébergement, nom de domaine, e-mails, mesure d’audience…) et renseigner celui qui sera utilisé. Un guide de mise en place pas à pas peut ensuite être demandé sur la page Outils.' },
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

module.exports = { WEBSITE_PLAN, addWebsitePlan };
