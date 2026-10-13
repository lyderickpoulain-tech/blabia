const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const { parseJsonField } = require('../utils/parseJsonField');
const github = require('../services/github');
const railway = require('../services/railway');
const { repoOverview } = require('../services/repoOverview');
const { getProjectTools, sanitizeProjectTools } = require('../services/tools/toolsStore');
const { findCatalogTool } = require('../services/tools/catalog');

// Connecteur Railway (v5.1, services/railway.js) : autorisation en un clic, puis mise en ligne
// du site par BlabIA. Seule la route de retour est publique : Railway y renvoie le navigateur,
// l'utilisateur est reconnu par l'état signé.
const router = express.Router();
const frontend = () => (process.env.NODE_ENV === 'production' ? '' : (process.env.FRONTEND_URL || 'http://localhost:5173'));
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

// GET /api/railway/callback — retour de Railway après l'autorisation
router.get('/railway/callback', async (req, res) => {
  const st = railway.verifyState(req.query.state);
  const back = result => res.redirect(`${frontend()}${st ? `/projects/${st.projectId}/outils` : '/dashboard'}?railway=${result}`);
  if (!st) return back('erreur');
  if (req.query.error || !req.query.code) return back('refus');
  try {
    await railway.connect(req, st.userId, String(req.query.code));
    back('ok');
  } catch (err) {
    console.error('[railway callback]', err.message);
    back('erreur');
  }
});

router.use(authMiddleware);

async function loadOwned(req, res) {
  const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return null; }
  if (project.userId !== req.user.id) { res.status(403).json({ error: 'Réservé au propriétaire du projet.' }); return null; }
  if (project.isDemo) { res.status(403).json({ demo: true, error: 'Projet exemple : pas de mise en ligne pendant la visite guidée.' }); return null; }
  return project;
}

// Structure du dépôt (installation GitHub du propriétaire), ou null
async function overviewOf(project) {
  if (!project.githubRepo || !github.isConfigured()) return null;
  const [owner] = await db('User').where({ id: project.userId }).select('githubInstallationId').limit(1);
  if (!owner?.githubInstallationId) return null;
  return repoOverview(owner.githubInstallationId, project.githubRepo);
}

// Garde-fou : le dépôt est-il DÉJÀ publié par un hébergeur ? (déploiements déclarés à GitHub,
// permission « Deployments » en lecture). Cas réel : le projet BlabIA, hébergé sur Railway à la
// main — « Mettre le site en ligne » aurait créé un second site avec une base vide.
const HOSTS = [[/railway/i, 'Railway'], [/vercel/i, 'Vercel'], [/netlify/i, 'Netlify'], [/render/i, 'Render']];
const DASHBOARD_RE = /^https?:\/\/(?:www\.)?(?:railway\.(?:com|app)\/project|vercel\.com\/|app\.netlify\.com\/|dashboard\.render\.com\/)/i;
async function existingHostOf(project) {
  if (!project.githubRepo || !github.isConfigured()) return null;
  const [owner] = await db('User').where({ id: project.userId }).select('githubInstallationId').limit(1);
  if (!owner?.githubInstallationId) return null;
  try {
    const deps = await github.gh(owner.githubInstallationId, 'GET', `/repos/${project.githubRepo}/deployments?per_page=10`) || [];
    if (!deps.length) return null;
    const who = `${deps[0].creator?.login || ''} ${deps[0].environment || ''}`;
    const provider = HOSTS.find(([re]) => re.test(who))?.[1] || null;
    let url = null;
    for (const d of deps.slice(0, 5)) {
      const statuses = await github.gh(owner.githubInstallationId, 'GET', `/repos/${project.githubRepo}/deployments/${d.id}/statuses?per_page=5`) || [];
      const u = statuses.find(s => s.state === 'success' && s.environment_url && !DASHBOARD_RE.test(s.environment_url))?.environment_url;
      if (u && !/\b(api|server|backend)\b/i.test(d.environment || '')) { url = u; break; }
      url = url || u || null;
    }
    return { provider, environment: deps[0].environment || null, url, at: deps[0].created_at || null };
  } catch (err) {
    if (err.status !== 403 && err.status !== 404) console.error('[railway] hébergeur existant :', err.message);
    return null;
  }
}

const failure = (res, err, where) => {
  if (err instanceof railway.RailwayError) {
    // Jamais 401 : le client BlabIA déconnecterait l'utilisateur (accès Railway ≠ session BlabIA)
    const status = { auth: 409, github: 409, empty: 409, domain: 400 }[err.kind] || 502;
    return res.status(status).json({ error: err.message, kind: err.kind });
  }
  console.error(`[railway ${where}]`, err.message);
  res.status(500).json({ error: 'Erreur serveur' });
};

// POST /api/projects/:id/railway/connect — adresse d'autorisation chez Railway
router.post('/projects/:id/railway/connect', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    if (!railway.isConfigured()) return res.status(503).json({ error: 'Le connecteur Railway n’est pas encore configuré sur ce serveur BlabIA.' });
    res.json({ url: railway.authorizeUrl(req, railway.signState(req.user.id, project.id)) });
  } catch (err) { failure(res, err, 'connect'); }
});

// GET /api/projects/:id/railway — connexion, plan de mise en ligne (d'après le dépôt), état enregistré
router.get('/projects/:id/railway', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [owner] = await db('User').where({ id: project.userId }).select('railwayConnectedAt', 'railwayEmail', 'railwayRefreshToken').limit(1);
    const setup = parseJsonField(project.railwaySetup, null);
    let plan = null;
    let existingHost = null;
    if (!setup?.services?.length) {
      try { const o = await overviewOf(project); plan = o ? railway.buildPlan(o, project) : null; } catch (err) { console.error('[railway plan]', err.message); }
      existingHost = await existingHostOf(project);
    }
    res.json({
      configured: railway.isConfigured(),
      isOwner: project.userId === req.user.id,
      repo: project.githubRepo || null,
      connected: !!owner?.railwayRefreshToken,
      email: owner?.railwayEmail || null,
      plan, setup, existingHost,
    });
  } catch (err) { failure(res, err, 'GET'); }
});

// POST /api/projects/:id/railway/setup — mise en ligne par BlabIA (reprise possible)
router.post('/projects/:id/railway/setup', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    if (!project.githubRepo) return res.status(409).json({ error: 'Reliez d’abord un dépôt GitHub au projet (Développements).' });
    const overview = await overviewOf(project);
    if (!overview) return res.status(409).json({ error: 'Le dépôt GitHub du projet n’est pas lisible par BlabIA.' });
    // Déjà publié ailleurs : un second site (et une base vide) seulement sur confirmation explicite
    if (!parseJsonField(project.railwaySetup, null)?.services?.length && req.body?.confirmExisting !== true) {
      const existing = await existingHostOf(project);
      if (existing) return res.status(409).json({ kind: 'existing', existingHost: existing,
        error: `Ce dépôt est déjà publié${existing.provider ? ` par ${existing.provider}` : ' par un hébergeur'} : « Mettre le site en ligne » créerait un second site, avec une base de données vide.` });
    }
    const save = async st => db('Project').where({ id: project.id }).update({ railwaySetup: JSON.stringify(st) });
    const state = await railway.setup({ userId: req.user.id, project: { ...project, railwaySetup: parseJsonField(project.railwaySetup, null) }, overview, save });
    await save(state);
    // Hébergeur (et base, si Railway) marqués « mis en place » ; adresse du site renseignée
    const tools = await getProjectTools(project);
    const next = tools.map(t => (/railway/i.test(t.name) && t.status === 'validated' ? { ...t, setupDone: true } : t));
    await db('Project').where({ id: project.id }).update({ tools: JSON.stringify(next), ...(state.siteUrl && !project.siteUrl ? { siteUrl: state.siteUrl } : {}) });
    res.json({ setup: state });
  } catch (err) { failure(res, err, 'setup'); }
});

// GET /api/projects/:id/railway/status — dernier déploiement de chaque service
router.get('/projects/:id/railway/status', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    const setup = parseJsonField(project.railwaySetup, null);
    if (!setup?.services?.length) return res.json({ services: [] });
    res.json({ services: await railway.status({ userId: req.user.id, setupState: setup }) });
  } catch (err) { failure(res, err, 'status'); }
});

// POST /api/projects/:id/railway/variables { serviceId, name, value } — clé d'un service tiers,
// transmise à Railway et jamais conservée par BlabIA (seul son NOM est noté « fourni »)
router.post('/projects/:id/railway/variables', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    const setup = parseJsonField(project.railwaySetup, null);
    const { serviceId, name, value } = req.body || {};
    const svc = setup?.services?.find(s => s.id === serviceId);
    if (!svc || !svc.missing.includes(name)) return res.status(400).json({ error: 'Variable inconnue pour ce service.' });
    if (!String(value || '').trim()) return res.status(400).json({ error: 'Valeur vide.' });
    await railway.setVariable({ userId: req.user.id, setupState: setup, serviceId, name, value: String(value).trim() });
    svc.provided = [...new Set([...(svc.provided || []), name])];
    await db('Project').where({ id: project.id }).update({ railwaySetup: JSON.stringify(setup) });
    res.json({ setup });
  } catch (err) { failure(res, err, 'variables'); }
});

// POST /api/projects/:id/railway/domain { domain } — nom de domaine du site (le site de test
// garde son adresse Railway) : enregistrements DNS à poser chez le registraire (OVH…)
router.post('/projects/:id/railway/domain', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    const setup = parseJsonField(project.railwaySetup, null);
    if (!setup?.services?.length) return res.status(409).json({ error: 'Mettez d’abord le site en ligne.' });
    setup.customDomain = await railway.addCustomDomain({ userId: req.user.id, setupState: setup, domain: req.body?.domain });
    await db('Project').where({ id: project.id }).update({ railwaySetup: JSON.stringify(setup) });
    res.json({ setup });
  } catch (err) { failure(res, err, 'domain'); }
});

// POST /api/projects/:id/railway/domain/check — DNS posés ? site joignable ? (adresse du site mise à jour)
router.post('/projects/:id/railway/domain/check', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    const setup = parseJsonField(project.railwaySetup, null);
    if (!setup?.customDomain) return res.status(409).json({ error: 'Aucun nom de domaine en cours.' });
    setup.customDomain.check = await railway.checkCustomDomain(setup.customDomain);
    const update = { railwaySetup: JSON.stringify(setup) };
    if (setup.customDomain.check.live) update.siteUrl = `https://${setup.customDomain.domain}`;
    await db('Project').where({ id: project.id }).update(update);
    res.json({ setup });
  } catch (err) { failure(res, err, 'domain/check'); }
});

// POST /api/projects/:id/railway/already-hosted — le site est déjà en ligne (mis en place à la
// main) : hébergeur marqué « mis en place » et adresse du site reprise des déploiements
router.post('/projects/:id/railway/already-hosted', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    const existing = await existingHostOf(project);
    const tools = await getProjectTools(project);
    const hostRe = existing?.provider ? new RegExp(existing.provider, 'i') : null;
    let next = tools.map(t => (t.category === 'hosting' && t.status === 'validated' && (!hostRe || hostRe.test(t.name)) ? { ...t, setupDone: true } : t));
    // Aucun hébergeur retenu : celui qui publie déjà le dépôt est ajouté, « mis en place »
    const known = existing?.provider && findCatalogTool(existing.provider.toLowerCase());
    if (known && !next.some(t => t.category === 'hosting' && t.status === 'validated')) {
      next = sanitizeProjectTools([...next, { catalogId: known.id, name: known.name, category: known.category, status: 'validated', origin: 'mine', cost: known.cost, setupDone: true, why: 'Déjà en ligne chez cet hébergeur (déploiements du dépôt).' }]);
    }
    await db('Project').where({ id: project.id }).update({ tools: JSON.stringify(next), ...(existing?.url && !project.siteUrl ? { siteUrl: existing.url } : {}) });
    res.json({ existingHost: existing, siteUrl: project.siteUrl || existing?.url || null });
  } catch (err) { failure(res, err, 'already-hosted'); }
});

// DELETE /api/projects/:id/railway/connection — retire l'accès de BlabIA au compte Railway
router.delete('/projects/:id/railway/connection', async (req, res) => {
  try {
    const project = await loadOwned(req, res);
    if (!project) return;
    await railway.disconnect(req.user.id);
    res.json({ connected: false });
  } catch (err) { failure(res, err, 'disconnect'); }
});

module.exports = router;
