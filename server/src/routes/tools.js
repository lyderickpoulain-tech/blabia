// v5.0 phase 4 : outils — catalogue, « Mes outils » (utilisateur), outils d'un projet.
const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const { CATEGORIES, CATEGORY_LINKS, TOOLS, SETUP_CATEGORIES } = require('../services/tools/catalog');
const {
  getUserTools, sanitizeUserTools, getProjectTools, sanitizeProjectTools, monthlyTotal,
} = require('../services/tools/toolsStore');
const { analyzeAndSaveNeeds } = require('../services/tools/toolNeeds');
const { parseJsonField } = require('../utils/parseJsonField');
const {
  generateSetupGuide, answerGuideQuestion, MAX_CHAT, needsOverwriteConfirmation, checkStatusOf, draftExpired,
} = require('../services/tools/setupGuide');
const { projectRepoText } = require('../services/repoOverview');
const { addRecommendedPack, RECOMMENDED_PACK } = require('../services/websiteStarter');
const { listDecisions, formatRegistryForPrompt } = require('../services/decisions');

// Réunion « outils » (type stack) : déjà tenue ? sinon, celle prévue au plan. Sert à la
// suggérer avant tout développement (démarrage d'une réunion Claude Code, Développements).
// Les outils sont « choisis » si une réunion « outils » a été conclue OU si les catégories
// nécessaires pour construire et publier (zones main et delivery du catalogue : interface,
// serveur, données, code, dépôt, hébergement, domaine) ont un outil validé — qu'il ait été
// renseigné en réunion ou sur la page Outils. Les autres catégories ne bloquent pas.
const BUILD_ZONES = ['main', 'delivery'];
function missingBuildTools(tools, needs) {
  const validated = tools.filter(t => t.status === 'validated');
  if (!validated.length) return null; // rien de choisi
  if (!needs) return [];
  return needs
    .map(n => CATEGORIES.find(c => c.id === n.category))
    .filter(c => c && BUILD_ZONES.includes(c.zone) && !validated.some(t => t.category === c.id))
    .map(c => c.label);
}
// Pack recommandé proposé d'un clic à un débutant (v5.1) : ce qu'il fait et ce qu'il coûte
function packOffer() {
  const items = RECOMMENDED_PACK.map(id => TOOLS.find(t => t.id === id)).filter(Boolean);
  return {
    tools: items.map(t => ({ name: t.name, role: t.role })),
    monthlyMin: items.reduce((n, t) => n + (t.cost?.monthlyMin || 0), 0),
    monthlyMax: items.reduce((n, t) => n + (t.cost?.monthlyMax || 0), 0),
  };
}

async function toolsMeetingStatus(project, tools, needs) {
  const meeting = await db('Session').where({ projectId: project.id, status: 'accepted' })
    .whereRaw(`"intention"::text LIKE '%stack%'`).first('id');
  // v5.1 (« WorldOfMetal ») : une réunion « outils » ouvrait un projet sans brief ni réunion
  // tenue — les agents choisissaient un hébergement sans savoir ce que fait le site
  const framed = !!String(project.brief || '').trim()
    || !!(await db('Session').where({ projectId: project.id, status: 'accepted' }).first('id'));
  const simple = (project.expertiseLevel ?? 3) <= 2;
  const missing = missingBuildTools(tools, needs);
  // Pack recommandé (mise en ligne automatique par Railway) : pas de réunion « outils » à exiger
  // avant de développer ; les choix techniques du code reviennent à Claude Code
  const autoHosting = tools.some(t => t.status === 'validated' && t.category === 'hosting' && /railway/i.test(t.name));
  if (meeting || autoHosting || (missing && !missing.length)) return { done: true, planned: null, missing: [] };
  const planned = await db('Milestone').where({ projectId: project.id, type: 'stack' }).whereNot({ status: 'done' })
    .orderBy('displayOrder', 'asc').first('id', 'title');
  return { done: false, planned: planned || null, missing: missing || [], framingFirst: !framed, simple, pack: simple ? packOffer() : null };
}

const router = express.Router();
// Monté sur '/api' : l'authentification est posée route par route, pas via router.use,
// sinon toute requête /api passant par ce routeur (ex. /api/health) exigerait un jeton.

// GET /api/tools/catalog — catalogue partagé (catégories, outils connus, liens de la carte)
router.get('/tools/catalog', authMiddleware, (req, res) => {
  res.json({ categories: CATEGORIES, links: CATEGORY_LINKS, tools: TOOLS, setupCategories: [...SETUP_CATEGORIES] });
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
    const needs = project.toolNeeds ? parseJsonField(project.toolNeeds, []) : null;
    res.json({
      tools, total: monthlyTotal(tools), needs,
      toolsMeeting: await toolsMeetingStatus(project, tools, needs),
      guide: project.toolsGuide ? { text: project.toolsGuide, at: project.toolsGuideAt, check: parseJsonField(project.toolsGuideCheck, null) } : null,
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
// POST /api/projects/:id/tools/recommended-pack — les outils recommandés par BlabIA, sans réunion
// (v5.1 : un débutant valide un coût, il ne choisit pas un hébergeur). Propriétaire seulement.
router.post('/projects/:id/tools/recommended-pack', authMiddleware, async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, false);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.userId !== req.user.id) return res.status(403).json({ error: 'Action réservée au propriétaire' });
    res.status(201).json({ added: await addRecommendedPack(project) });
  } catch (err) {
    console.error('[tools/recommended-pack]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/projects/:id/tools/guide', authMiddleware, async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.isDemo) return res.status(403).json({ demo: true, error: 'Projet exemple : pas de guide pendant la visite guidée.' });
    if (req.body?.force === true) { // l'humain accepte de remplacer : on promeut le brouillon, sans nouvel appel à l'IA
      const draft = parseJsonField(project.toolsGuideDraft, null);
      if (!draft?.text) return res.status(404).json({ error: 'Aucun nouveau guide en attente. Régénérez le guide.' });
      if (draftExpired(draft)) {
        await db('Project').where({ id: project.id }).update({ toolsGuideDraft: null });
        return res.status(410).json({ error: 'Le nouveau guide en attente a plus de 24 h : il a été écarté. Régénérez le guide.' });
      }
      const at = new Date(draft.generatedAt);
      await db('Project').where({ id: project.id }).update({
        toolsGuide: draft.text, toolsGuideAt: at, toolsGuideCheck: JSON.stringify(draft.check), toolsGuideDraft: null,
      });
      return res.json({ text: draft.text, at, check: draft.check });
    }
    const tools = await getProjectTools(project);
    if (!tools.some(t => t.status === 'validated')) {
      return res.status(400).json({ error: 'Retenez d’abord les outils du projet (réunion « outils » ou ci-dessous) : le guide explique comment les relier.' });
    }
    const registryText = formatRegistryForPrompt(await listDecisions(project.id)).activeText;
    const repoText = await projectRepoText(project); // structure réelle du dépôt
    const { text, check } = await generateSetupGuide({ project, tools, registryText, repoText, chat: parseJsonField(project.toolsGuideChat, []) });
    const at = new Date();
    const previousCheck = project.toolsGuide ? parseJsonField(project.toolsGuideCheck, null) : null;
    if (project.toolsGuide && needsOverwriteConfirmation(previousCheck, check)) {
      // L'ancien guide était vérifié en ligne, pas le nouveau : il est mis de côté (remplace tout
      // brouillon précédent) et l'humain choisit
      await db('Project').where({ id: project.id }).update({ toolsGuideDraft: JSON.stringify({ text, check, generatedAt: at.toISOString() }) });
      return res.status(409).json({
        needsConfirmation: true,
        error: 'Le nouveau guide n’a pas pu être vérifié en ligne, alors que l’actuel l’était.',
        previous: { status: checkStatusOf(previousCheck) }, next: { status: check.status },
      });
    }
    await db('Project').where({ id: project.id }).update({
      toolsGuide: text, toolsGuideAt: at, toolsGuideCheck: JSON.stringify(check), toolsGuideDraft: null,
    });
    res.json({ text, at, check });
  } catch (err) {
    console.error('[projects/:id/tools/guide POST]', err.message);
    res.status(500).json({ error: 'Le guide n’a pas pu être rédigé. Réessayez dans un instant.' });
  }
});

// DELETE /api/projects/:id/tools/guide/draft — l'humain refuse le nouveau guide : le brouillon
// est supprimé, l'ancien guide reste intact
router.delete('/projects/:id/tools/guide/draft', authMiddleware, async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    await db('Project').where({ id: project.id }).update({ toolsGuideDraft: null });
    res.json({ ok: true });
  } catch (err) {
    console.error('[projects/:id/tools/guide/draft DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
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
    const { text: answer, check } = await answerGuideQuestion({
      project, tools, registryText: formatRegistryForPrompt(decisions).activeText, repoText,
      guide: project.toolsGuide || '', chat, message,
    });
    const now = new Date().toISOString();
    const next = [...chat, { role: 'user', content: message, at: now }, { role: 'assistant', content: answer, at: now, check }].slice(-MAX_CHAT);
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
