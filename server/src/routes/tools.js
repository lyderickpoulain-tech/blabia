// v5.0 phase 4 : outils — catalogue, « Mes outils » (utilisateur), outils d'un projet.
const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const { CATEGORIES, CATEGORY_LINKS, TOOLS } = require('../services/tools/catalog');
const {
  getUserTools, sanitizeUserTools, getProjectTools, sanitizeProjectTools, monthlyTotal,
} = require('../services/tools/toolsStore');
const { analyzeAndSaveNeeds } = require('../services/tools/toolNeeds');
const { parseJsonField } = require('../utils/parseJsonField');
const { generateSetupGuide, answerGuideQuestion, MAX_CHAT } = require('../services/tools/setupGuide');
const { projectRepoText } = require('../services/repoOverview');
const { listDecisions, formatRegistryForPrompt } = require('../services/decisions');

// Réunion « outils » (type stack) : déjà tenue ? sinon, celle prévue au plan. Sert à la
// suggérer avant tout développement (démarrage d'une réunion Claude Code, Développements).
async function toolsMeetingStatus(projectId) {
  const done = await db('Session').where({ projectId, status: 'accepted' })
    .whereRaw(`"intention"::text LIKE '%stack%'`).first('id');
  if (done) return { done: true, planned: null };
  const planned = await db('Milestone').where({ projectId, type: 'stack' }).whereNot({ status: 'done' })
    .orderBy('displayOrder', 'asc').first('id', 'title');
  return { done: false, planned: planned || null };
}

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
    res.json({
      tools, total: monthlyTotal(tools), needs: project.toolNeeds ? parseJsonField(project.toolNeeds, []) : null,
      toolsMeeting: await toolsMeetingStatus(project.id),
      guide: project.toolsGuide ? { text: project.toolsGuide, at: project.toolsGuideAt } : null,
      guideChat: parseJsonField(project.toolsGuideChat, []),
    });
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

// POST /api/projects/:id/tools/guide — guide pas à pas pour relier les outils retenus
// (demandé par l'utilisateur ; conservé sur le projet, régénéré à chaque demande)
router.post('/projects/:id/tools/guide', authMiddleware, async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.isDemo) return res.status(403).json({ demo: true, error: 'Projet exemple : pas de guide pendant la visite guidée.' });
    const tools = await getProjectTools(project);
    if (!tools.some(t => t.status === 'validated')) {
      return res.status(400).json({ error: 'Retenez d’abord les outils du projet (réunion « outils » ou ci-dessous) : le guide explique comment les relier.' });
    }
    const registryText = formatRegistryForPrompt(await listDecisions(project.id)).activeText;
    const repoText = await projectRepoText(project); // structure réelle du dépôt
    const text = await generateSetupGuide({ project, tools, registryText, repoText, chat: parseJsonField(project.toolsGuideChat, []) });
    const at = new Date();
    await db('Project').where({ id: project.id }).update({ toolsGuide: text, toolsGuideAt: at });
    res.json({ text, at });
  } catch (err) {
    console.error('[projects/:id/tools/guide POST]', err.message);
    res.status(500).json({ error: 'Le guide n’a pas pu être rédigé. Réessayez dans un instant.' });
  }
});

// POST /api/projects/:id/tools/guide/chat { message } — question ou message d'erreur posé
// sous le guide ; réponse appuyée sur le guide, la structure du dépôt et la recherche web.
// La discussion est conservée et nourrit le guide suivant.
router.post('/projects/:id/tools/guide/chat', authMiddleware, async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 6000);
  if (!message) return res.status(400).json({ error: 'Message vide' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.isDemo) return res.status(403).json({ demo: true, error: 'Projet exemple : pas de discussion pendant la visite guidée.' });
    const chat = parseJsonField(project.toolsGuideChat, []);
    const [tools, decisions, repoText] = await Promise.all([getProjectTools(project), listDecisions(project.id), projectRepoText(project)]);
    const answer = await answerGuideQuestion({
      project, tools, registryText: formatRegistryForPrompt(decisions).activeText, repoText,
      guide: project.toolsGuide || '', chat, message,
    });
    const now = new Date().toISOString();
    const next = [...chat, { role: 'user', content: message, at: now }, { role: 'assistant', content: answer, at: now }].slice(-MAX_CHAT);
    await db('Project').where({ id: project.id }).update({ toolsGuideChat: JSON.stringify(next) });
    res.json({ chat: next });
  } catch (err) {
    console.error('[projects/:id/tools/guide/chat POST]', err.message);
    res.status(500).json({ error: 'Pas de réponse pour l’instant. Réessayez dans un instant.' });
  }
});

// DELETE /api/projects/:id/tools/guide/chat — efface la discussion
router.delete('/projects/:id/tools/guide/chat', authMiddleware, async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    await db('Project').where({ id: project.id }).update({ toolsGuideChat: JSON.stringify([]) });
    res.json({ chat: [] });
  } catch (err) {
    console.error('[projects/:id/tools/guide/chat DELETE]', err.message);
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
    const { tools, needs } = await analyzeAndSaveNeeds(project, userTools);
    res.json({ tools, total: monthlyTotal(tools), needs });
  } catch (err) {
    console.error('[projects/:id/tools/analyze POST]', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'analyse des besoins' });
  }
});

module.exports = router;
