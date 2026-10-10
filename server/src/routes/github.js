const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const github = require('../services/github');
const dev = require('../services/devTasks');

// Connexion du compte GitHub de l'utilisateur (v5.1, développements).
// Seule la route de retour (callback) est publique : GitHub y renvoie le navigateur ;
// l'utilisateur y est reconnu par l'état signé, jamais par un paramètre de l'URL.
const router = express.Router();
const frontend = () => (process.env.NODE_ENV === 'production' ? '' : (process.env.FRONTEND_URL || 'http://localhost:5173'));
const back = (ret, result) => `${frontend()}${github.safeReturn(ret)}?github=${result}`;
const canCreate = req => req.user.role !== 'user';

// GET /api/github/callback — retour de GitHub (autorisation ou installation de l'application)
router.get('/callback', async (req, res) => {
  const state = github.verifyState(req.query.state);
  if (!state) return res.redirect(back(null, 'erreur'));
  if (!req.query.code) return res.redirect(back(state.ret, 'annule'));
  try {
    const conn = await github.resolveConnection(String(req.query.code));
    // Application pas encore installée sur ce compte : page d'installation, qui revient ici
    if (!conn.installationId) return res.redirect(github.installUrl(github.signState(state.userId, state.ret, state.extra)));
    await db('User').where({ id: state.userId }).update({ githubInstallationId: conn.installationId, githubLogin: conn.login });
    if (state.extra?.a === 'create') return res.redirect(back(state.ret, await createProjectRepo(state, conn)));
    res.redirect(back(state.ret, 'ok'));
  } catch (err) {
    console.error('[github callback]', err.message);
    res.redirect(back(state.ret, 'erreur'));
  }
});

// Projet « à créer de zéro » : BlabIA crée le dépôt sur le compte de l'utilisateur, l'ouvre à
// l'application, le relie au projet et y installe les automatisations. Renvoie le résultat
// affiché au retour (utils/github.js côté client).
async function createProjectRepo(state, conn) {
  const { p: projectId, n: name, v: isPrivate } = state.extra;
  const [project] = await db('Project').where({ id: projectId, userId: state.userId }).limit(1);
  if (!project || project.githubRepo || !github.REPO_NAME_RE.test(String(name || ''))) return 'depot-erreur';
  let repo;
  try {
    repo = await github.createRepo(conn.userToken, { name, description: project.description || project.name, isPrivate: !!isPrivate });
  } catch (err) {
    console.error('[github création dépôt]', err.status, err.message);
    // Permission « Administration » absente ou pas encore acceptée sur l'installation
    return err.status === 403 || err.status === 404 ? 'depot-permission' : err.status === 422 ? 'depot-nom' : 'depot-erreur';
  }
  if (!conn.allRepos) {
    await github.addRepoToInstallation(conn.userToken, conn.installationId, repo.id)
      .catch(err => console.error('[github ajout du dépôt à l’installation]', err.status, err.message));
  }
  const [linked] = await db('Project').where({ id: project.id }).update({ githubRepo: repo.full_name, updatedAt: new Date() }).returning('*');
  try {
    await dev.installWorkflows(linked);
  } catch (err) {
    // Rattrapable depuis la page Développements (« Installer »)
    console.error('[github automatisations du nouveau dépôt]', err.status, err.message);
  }
  return 'depot-cree';
}

router.use(authMiddleware);

// GET /api/github — état de la connexion de l'utilisateur
router.get('/', async (req, res) => {
  try {
    const [u] = await db('User').where({ id: req.user.id }).select('githubInstallationId', 'githubLogin').limit(1);
    const slug = github.config().slug;
    res.json({
      configured: github.isConfigured(), connected: !!u?.githubInstallationId, login: u?.githubLogin || null,
      manageUrl: slug ? `https://github.com/apps/${slug}/installations/new` : null,
    });
  } catch (err) {
    console.error('[github GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/github/connect { returnTo } — adresse GitHub vers laquelle envoyer le navigateur
router.post('/connect', (req, res) => {
  if (!canCreate(req)) return res.status(403).json({ error: 'Réservé aux comptes qui créent des projets.' });
  if (!github.isConfigured()) return res.status(503).json({ error: 'La connexion GitHub n’est pas configurée sur ce serveur.' });
  res.json({ url: github.authorizeUrl(github.signState(req.user.id, req.body?.returnTo)) });
});

// DELETE /api/github — oublie la connexion (l'application reste installée sur GitHub)
router.delete('/', async (req, res) => {
  try {
    await db('User').where({ id: req.user.id }).update({ githubInstallationId: null, githubLogin: null });
    res.json({ ok: true });
  } catch (err) {
    console.error('[github DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/github/repos — dépôts accessibles à l'application BlabIA
router.get('/repos', async (req, res) => {
  try {
    const [u] = await db('User').where({ id: req.user.id }).select('githubInstallationId').limit(1);
    if (!u?.githubInstallationId || !github.isConfigured()) return res.status(409).json({ error: 'Compte GitHub non connecté.' });
    res.json(await github.listRepos(u.githubInstallationId));
  } catch (err) {
    console.error('[github repos]', err.message);
    res.status(502).json({ error: `GitHub : ${err.message}` });
  }
});

module.exports = router;
