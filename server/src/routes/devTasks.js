const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const github = require('../services/github');
const dev = require('../services/devTasks');
const { getProjectTools } = require('../services/tools/toolsStore');
const { requiredCategories, missingTools, describeMissing } = require('../services/devTools');
const { parseJsonField } = require('../utils/parseJsonField');

// Développements lancés depuis BlabIA (v5.1) : dépôt du projet, lancement, suivi,
// mise en ligne, abandon. Lecture : tout membre du projet. Configuration, lancement,
// mise en ligne et abandon : PROPRIÉTAIRE seulement (c'est son abonnement Claude et
// son compte GitHub qui travaillent).
const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

async function load(req, res, { owner = false } = {}) {
  const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return {}; }
  if (owner && project.userId !== req.user.id) {
    res.status(403).json({ error: 'Réservé au propriétaire du projet.' }); return {};
  }
  if (owner && project.isDemo) {
    res.status(403).json({ demo: true, error: 'Projet exemple : pas de développement pendant la visite guidée.' }); return {};
  }
  if (!req.params.devId) return { project };
  const [task] = await db('DevTask').where({ id: req.params.devId, projectId: project.id }).limit(1);
  if (!task) { res.status(404).json({ error: 'Développement introuvable' }); return {}; }
  return { project, task };
}

const fail = (res, where, err) => {
  console.error(`[devTasks ${where}]`, err.message);
  res.status(err.status && err.status < 600 ? (err.status >= 500 ? 502 : err.status) : 500)
    .json({ error: err.status ? err.message : 'Erreur serveur' });
};

// GET /api/projects/:id/github — état du dépôt (connexion, automatisations, secrets)
router.get('/:id/github', async (req, res) => {
  try {
    const { project } = await load(req, res);
    if (!project) return;
    res.json({ ...(await dev.repoStatus(project)), isOwner: project.userId === req.user.id, suggestedRepoName: github.repoSlug(project.name), siteUrl: project.siteUrl || null });
  } catch (err) { fail(res, 'github GET', err); }
});

// PUT /api/projects/:id/github { repo } — choix du dépôt (« propriétaire/nom », ou vide)
router.put('/:id/github', async (req, res) => {
  try {
    const { project } = await load(req, res, { owner: true });
    if (!project) return;
    const repo = String(req.body?.repo || '').trim();
    if (repo && !github.REPO_RE.test(repo)) return res.status(400).json({ error: 'Dépôt invalide (attendu : propriétaire/nom).' });
    if (repo && await db('DevTask').where({ projectId: project.id }).whereIn('status', dev.ACTIVE).first()) {
      return res.status(409).json({ error: 'Un développement est en cours : attendez sa fin pour changer de dépôt.' });
    }
    const [p] = await db('Project').where({ id: project.id }).update({ githubRepo: repo || null }).returning('*');
    res.json(await dev.repoStatus(p));
  } catch (err) { fail(res, 'github PUT', err); }
});

// POST /api/projects/:id/github/create-repo { name?, private? } — projet « à créer de zéro » :
// renvoie l'adresse GitHub vers laquelle envoyer le navigateur. Au retour (routes/github.js),
// BlabIA crée le dépôt avec le jeton de l'utilisateur, le relie au projet et l'équipe.
// Connecte aussi le compte GitHub au passage s'il ne l'était pas.
router.post('/:id/github/create-repo', async (req, res) => {
  try {
    const { project } = await load(req, res, { owner: true });
    if (!project) return;
    if (!github.isConfigured()) return res.status(503).json({ error: 'La connexion GitHub n’est pas configurée sur ce serveur.' });
    if (project.githubRepo) return res.status(409).json({ error: 'Ce projet a déjà un dépôt.' });
    const name = String(req.body?.name || '').trim() || github.repoSlug(project.name);
    if (!github.REPO_NAME_RE.test(name)) return res.status(400).json({ error: 'Nom de dépôt invalide : lettres, chiffres, tirets, points ou soulignés, sans espace.' });
    const state = github.signState(req.user.id, `/projects/${project.id}/developpements`, { a: 'create', p: project.id, n: name, v: req.body?.private === false ? 0 : 1 });
    res.json({ url: github.authorizeUrl(state), name });
  } catch (err) { fail(res, 'create-repo', err); }
});

// PUT /api/projects/:id/site-url { siteUrl } — adresse publique du site (ou vide) : Railway ne
// la transmet pas à GitHub, BlabIA ne peut donc pas la deviner (« Voir le site »)
router.put('/:id/site-url', async (req, res) => {
  try {
    const { project } = await load(req, res, { owner: true });
    if (!project) return;
    let url = String(req.body?.siteUrl || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url) {
      try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error();
        url = u.toString().replace(/\/$/, '');
      } catch { return res.status(400).json({ error: 'Adresse invalide (ex. https://monsite.fr).' }); }
    }
    await db('Project').where({ id: project.id }).update({ siteUrl: url.slice(0, 500) || null });
    res.json({ siteUrl: url || null });
  } catch (err) { fail(res, 'site-url', err); }
});

// POST /api/projects/:id/github/install — installe ou met à jour les automatisations du dépôt
router.post('/:id/github/install', async (req, res) => {
  try {
    const { project } = await load(req, res, { owner: true });
    if (!project) return;
    const status = await dev.repoStatus(project);
    if (!status.accessible) return res.status(409).json({ error: status.error || 'Choisissez d’abord un dépôt accessible.' });
    await dev.installWorkflows(project);
    res.json(await dev.repoStatus(project));
  } catch (err) {
    // Permission « Workflows » absente ou pas encore acceptée sur l'installation
    if (err.status === 403) err.message = 'GitHub refuse l’écriture des automatisations : l’application BlabIA doit avoir les permissions « Contents » et « Workflows » en lecture et écriture, acceptées sur votre installation (github.com/settings/installations).';
    fail(res, 'install', err);
  }
});

// GET /api/projects/:id/dev-tasks — développements (état relu auprès de GitHub)
// + réunions Claude Code conclues dont le prompt peut être lancé
router.get('/:id/dev-tasks', async (req, res) => {
  try {
    const { project } = await load(req, res);
    if (!project) return;
    const tasks = await dev.listTasks(project);
    const sessions = await db('Session').where({ projectId: project.id }).whereNotNull('deliverable')
      .whereRaw(`"intention"::text LIKE '%claude_code%'`).orderBy('createdAt', 'desc').limit(20)
      .select('id', 'task', 'createdAt', 'requiredTools');
    // Outils manquants, quand ceux dont dépend le développement sont déjà repérés
    const tools = await getProjectTools(project);
    const launchable = sessions.map(({ requiredTools, ...s }) => {
      const cats = parseJsonField(requiredTools, null);
      return { ...s, missingTools: Array.isArray(cats) ? missingTools(cats, tools) : null };
    });
    res.json({ tasks, launchable });
  } catch (err) { fail(res, 'list', err); }
});

// POST /api/projects/:id/dev-tasks { sessionId, prompt? } — lance un développement
router.post('/:id/dev-tasks', async (req, res) => {
  try {
    const { project } = await load(req, res, { owner: true });
    if (!project) return;
    const [session] = await db('Session').where({ id: req.body?.sessionId || null, projectId: project.id }).limit(1);
    if (!session) return res.status(404).json({ error: 'Réunion introuvable' });
    const prompt = String(req.body?.prompt ?? session.deliverable ?? '').trim();
    if (prompt.length < 20) return res.status(400).json({ error: 'Le prompt de développement est vide.' });
    if (await db('DevTask').where({ projectId: project.id }).whereIn('status', dev.ACTIVE).first()) {
      return res.status(409).json({ error: 'Un développement est déjà en cours sur ce projet : un seul à la fois.' });
    }
    // Un code qui se sert d'un outil pas encore choisi ou mis en place ne part pas, sauf
    // confirmation explicite (« Lancer quand même » : force)
    const tools = await getProjectTools(project);
    const missing = missingTools(await requiredCategories(session, tools), tools);
    if (missing.length && req.body?.force !== true) {
      return res.status(409).json({ error: `Outils à mettre en place avant ce développement (Projet › Outils) : ${describeMissing(missing)}.`, missingTools: missing });
    }
    res.status(201).json(await dev.createTask({ project, session, prompt: prompt.slice(0, 60000), userId: req.user.id }));
  } catch (err) { fail(res, 'create', err); }
});

// POST /api/projects/:id/dev-tasks/:devId/deploy — sauvegarde de la base puis fusion
router.post('/:id/dev-tasks/:devId/deploy', async (req, res) => {
  try {
    const { project, task } = await load(req, res, { owner: true });
    if (!task) return;
    if (!['ready', 'deploy_failed'].includes(task.status) || !task.prNumber) return res.status(409).json({ error: 'Ce développement ne peut pas être mis en ligne.' });
    if (await db('DevTask').where({ projectId: project.id, status: 'deploying' }).first()) {
      return res.status(409).json({ error: 'Une mise en ligne est déjà en cours.' });
    }
    res.json(await dev.deployTask(project, task));
  } catch (err) { fail(res, 'deploy', err); }
});

// POST /api/projects/:id/dev-tasks/:devId/abandon — ferme la pull request et la demande
router.post('/:id/dev-tasks/:devId/abandon', async (req, res) => {
  try {
    const { project, task } = await load(req, res, { owner: true });
    if (!task) return;
    if (!['ready', 'failed', 'deploy_failed'].includes(task.status)) return res.status(409).json({ error: 'Ce développement ne peut pas être abandonné maintenant.' });
    res.json(await dev.abandonTask(project, task));
  } catch (err) { fail(res, 'abandon', err); }
});

module.exports = router;
