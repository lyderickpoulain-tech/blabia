const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const { listActions, createSessionActions } = require('../services/actions');

// Actions entre les réunions (v5.1). Cocher, modifier, supprimer : routes
// /projects/:id/todos existantes (plan.js), les actions étant des TodoItem.
const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

// GET /api/projects/:id/actions — à faire (échéance la plus proche d'abord), puis faites
router.get('/:id/actions', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const actions = await listActions(req.params.id);
    // Dernière mission confiée à un agent depuis chaque action (page Actions)
    const missions = actions.length
      ? await db('AgentMission').whereIn('todoId', actions.map(a => a.id)).whereNotIn('status', ['rejected', 'cancelled'])
        .orderBy('createdAt', 'desc').select('id', 'todoId', 'status', 'agentName', 'title', 'costUSD', 'budgetUSD', 'documentId', 'error')
      : [];
    const byTodo = {};
    for (const m of missions) if (!byTodo[m.todoId]) byTodo[m.todoId] = m;
    res.json(actions.map(a => ({ ...a, mission: byTodo[a.id] || null })));
  } catch (err) {
    console.error('[actions GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/actions/from-session — actions gardées par l'humain à la conclusion
router.post('/:id/actions/from-session', async (req, res) => {
  const { sessionId, actions } = req.body;
  if (!Array.isArray(actions)) return res.status(400).json({ error: 'actions (tableau) requis' });
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (sessionId) {
      const [s] = await db('Session').where({ id: sessionId, projectId: req.params.id }).select('id').limit(1);
      if (!s) return res.status(404).json({ error: 'Réunion introuvable' });
    }
    const created = await createSessionActions({ projectId: req.params.id, sessionId, userId: req.user.id, actions });
    res.status(201).json(created);
  } catch (err) {
    console.error('[actions/from-session POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
