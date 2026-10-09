// v5.0 phase 4 : outils — catalogue, « Mes outils » (utilisateur), outils d'un projet.
const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const { CATEGORIES, CATEGORY_LINKS, TOOLS } = require('../services/tools/catalog');
const {
  getUserTools, sanitizeUserTools, getProjectTools, sanitizeProjectTools, monthlyTotal,
} = require('../services/tools/toolsStore');
const { analyzeProjectToolNeeds, applyNeedsAnalysis } = require('../services/tools/toolNeeds');
const { parseJsonField } = require('../utils/parseJsonField');

const router = express.Router();
// Monté sur '/api' : l'authentification est posée route par route, pas via router.use,
// sinon toute requête /api passant par ce routeur (ex. /api/health) exigerait un jeton.

// GET /api/tools/catalog — catalogue partagé (catégories, outils connus, liens de la carte)
router.get('/tools/catalog', authMiddleware, (req, res) => {
  res.json({ categories: CATEGORIES, links: CATEGORY_LINKS, tools: TOOLS });
});

// GET /api/tools/me — « Mes outils »
router.get('/tools/me', authMiddleware, async (req, res) => {
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
router.put('/tools/me', authMiddleware, async (req, res) => {
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
router.get('/projects/:id/tools', authMiddleware, async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const tools = await getProjectTools(project);
    res.json({ tools, total: monthlyTotal(tools), needs: project.toolNeeds ? parseJsonField(project.toolNeeds, []) : null });
  } catch (err) {
    console.error('[projects/:id/tools GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/projects/:id/tools — remplace la liste complète
router.put('/projects/:id/tools', authMiddleware, async (req, res) => {
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

// POST /api/projects/:id/tools/analyze — BlabIA identifie les types d'outils
// nécessaires et pré-remplit avec « Mes outils » (sans écraser les choix existants)
router.post('/projects/:id/tools/analyze', authMiddleware, async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!project.brief && !project.description) {
      return res.status(400).json({ error: 'Ajoutez un brief ou une description au projet pour que BlabIA puisse identifier les outils nécessaires.' });
    }
    const userTools = (await getUserTools(req.user.id)) || [];
    const needsWithTools = await analyzeProjectToolNeeds(project, userTools);
    const current = await getProjectTools(project);
    const { tools: merged, needs } = applyNeedsAnalysis(current, userTools, needsWithTools);
    const tools = sanitizeProjectTools(merged);
    await db('Project').where({ id: project.id }).update({
      tools: JSON.stringify(tools), toolNeeds: JSON.stringify(needs), updatedAt: new Date(),
    });
    res.json({ tools, total: monthlyTotal(tools), needs });
  } catch (err) {
    console.error('[projects/:id/tools/analyze POST]', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'analyse des besoins' });
  }
});

module.exports = router;
