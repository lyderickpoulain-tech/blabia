// Création d'un projet : partagée par la création v5.1 (POST /api/projects) et la création
// v6 en une question (POST /api/projects/from-story, routes/work.js).
const { randomUUID } = require('crypto');
const db = require('../utils/db');

// Tous les assistants par défaut rejoignent le projet
async function attachDefaultAgents(projectId) {
  const defaultAgents = await db('Agent').select(['id']).where({ isDefault: true }).orderBy('createdAt', 'asc');
  if (!defaultAgents.length) return;
  await db('ProjectAgent').insert(defaultAgents.map((a, i) => ({
    id: randomUUID(), projectId, agentId: a.id, enabled: true, displayOrder: i, source: 'manual',
  })));
}

// v6 : projet créé à partir du seul récit. Nom provisoire (le constructeur le remplace) ;
// réglages des réunions v5.1 au plus simple, jamais montrés hors mode avancé : langage
// simple, sans humour, le moins de questions possible, sans contradicteur.
async function createProjectFromStory(userId, story) {
  const now = new Date();
  const [project] = await db('Project').insert({
    id: randomUUID(),
    name: 'Mon projet',
    description: story.slice(0, 2000),
    brief: `OBJECTIF : ${story}`,
    status: 'active',
    hasTechnicalStack: false,
    expertiseLevel: 2,
    humorLevel: 1,
    questionMode: 'delegate',
    challengerEnabled: false,
    userId,
    createdAt: now,
    updatedAt: now,
  }).returning(['id', 'name', 'userId']);
  await attachDefaultAgents(project.id);
  return project;
}

module.exports = { attachDefaultAgents, createProjectFromStory };
