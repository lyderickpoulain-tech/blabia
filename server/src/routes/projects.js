const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const PROJECT_FIELDS = [
  'id', 'name', 'description', 'status', 'createdAt', 'updatedAt', 'userId'
];

async function findProject(id, userId, isAdmin) {
  const query = db('Project').where({ id });
  if (!isAdmin) query.andWhere({ userId });
  const [project] = await query.limit(1);
  return project;
}

// GET /api/projects
router.get('/', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    let query = db('Project')
      .select(
        'Project.id',
        'Project.name',
        'Project.description',
        'Project.status',
        'Project.createdAt',
        'Project.updatedAt',
        'Project.userId',
        db.raw('COUNT(DISTINCT "Session"."id")::int AS "sessionCount"')
      )
      .leftJoin('Session', 'Session.projectId', 'Project.id')
      .groupBy('Project.id')
      .orderBy('Project.updatedAt', 'desc');

    if (!isAdmin) query.andWhere('Project.userId', req.user.id);

    const projects = await query;
    res.json(projects);
  } catch (err) {
    console.error('[projects GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Le nom du projet est requis' });
  }
  const now = new Date();
  try {
    const [project] = await db('Project')
      .insert({
        id: randomUUID(),
        name: name.trim(),
        description: description?.trim() || null,
        status: 'active',
        userId: req.user.id,
        createdAt: now,
        updatedAt: now
      })
      .returning(PROJECT_FIELDS);
    res.status(201).json({ ...project, sessionCount: 0 });
  } catch (err) {
    console.error('[projects POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [{ count }] = await db('Session')
      .count('id as count')
      .where({ projectId: req.params.id });

    res.json({ ...project, sessionCount: parseInt(count) });
  } catch (err) {
    console.error('[projects/:id GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id — renommer
router.patch('/:id', async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Le nom du projet est requis' });
  }
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [updated] = await db('Project')
      .where({ id: req.params.id })
      .update({
        name: name.trim(),
        description: description !== undefined ? (description?.trim() || null) : project.description,
        updatedAt: new Date()
      })
      .returning(PROJECT_FIELDS);
    res.json(updated);
  } catch (err) {
    console.error('[projects/:id PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/archive — basculer active ↔ archived
router.patch('/:id/archive', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const newStatus = project.status === 'active' ? 'archived' : 'active';
    const [updated] = await db('Project')
      .where({ id: req.params.id })
      .update({ status: newStatus, updatedAt: new Date() })
      .returning(PROJECT_FIELDS);
    res.json(updated);
  } catch (err) {
    console.error('[projects/:id/archive PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
