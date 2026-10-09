// v5.0 phase 4 : outils — catalogue, « Mes outils » (utilisateur), outils d'un projet.
const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const { CATEGORIES, CATEGORY_LINKS, TOOLS } = require('../services/tools/catalog');
const {
  getUserTools, sanitizeUserTools, getProjectTools, sanitizeProjectTools, monthlyTotal,
} = require('../services/tools/toolsStore');

const router = express.Router();
router.use(authMiddleware);

// GET /api/tools/catalog — catalogue partagé (catégories, outils connus, liens de la carte)
router.get('/tools/catalog', (req, res) => {
  res.json({ categories: CATEGORIES, links: CATEGORY_LINKS, tools: TOOLS });
});

// GET /api/tools/me — « Mes outils »
router.get('/tools/me', async (req, res) => {
  try {
    const tools = await getUserTools(req.user.id);
    if (!tools) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(tools);
  } catch (err) {
    console.error('[tools/me GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/tools/me — remplace la liste complète
router.put('/tools/me', async (req, res) => {
  const tools = sanitizeUserTools(req.body.tools);
  if (!tools) return res.status(400).json({ error: 'tools (tableau) requis' });
  try {
    await db('User').where({ id: req.user.id }).update({ tools: JSON.stringify(tools) });
    res.json(tools);
  } catch (err) {
    console.error('[tools/me PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id/tools — outils du projet + total mensuel estimé
router.get('/projects/:id/tools', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const tools = await getProjectTools(project);
    res.json({ tools, total: monthlyTotal(tools) });
  } catch (err) {
    console.error('[projects/:id/tools GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/projects/:id/tools — remplace la liste complète
router.put('/projects/:id/tools', async (req, res) => {
  const tools = sanitizeProjectTools(req.body.tools);
  if (!tools) return res.status(400).json({ error: 'tools (tableau) requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    await db('Project').where({ id: project.id }).update({ tools: JSON.stringify(tools), updatedAt: new Date() });
    res.json({ tools, total: monthlyTotal(tools) });
  } catch (err) {
    console.error('[projects/:id/tools PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
