const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const { listDecisions } = require('../services/decisions');
const { listActions } = require('../services/actions');
const { sessionDocx, registryDocx, attachment } = require('../services/exporters');

// Export Word (v5.1). Le PDF passe par la page d'impression du client.
const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

// GET /api/projects/:id/export/sessions/:sid/word — compte-rendu d'une réunion
router.get('/:id/export/sessions/:sid/word', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').where({ id: req.params.sid, projectId: req.params.id }).limit(1);
    if (!session) return res.status(404).json({ error: 'Réunion introuvable' });
    attachment(res, `Compte-rendu — ${session.task}`, await sessionDocx({ project, session }));
  } catch (err) {
    console.error('[export session word]', err.message);
    res.status(500).json({ error: 'Export impossible' });
  }
});

// GET /api/projects/:id/export/registry/word — registre des décisions + actions
router.get('/:id/export/registry/word', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const sessions = await db('Session').where({ projectId: req.params.id }).select('id', 'task');
    const taskOf = Object.fromEntries(sessions.map(s => [s.id, s.task]));
    const decisions = (await listDecisions(req.params.id)).map(d => ({ ...d, sessionTask: taskOf[d.sessionId] }));
    attachment(res, `Décisions et actions — ${project.name}`, await registryDocx({ project, decisions, actions: await listActions(req.params.id) }));
  } catch (err) {
    console.error('[export registry word]', err.message);
    res.status(500).json({ error: 'Export impossible' });
  }
});

module.exports = router;
