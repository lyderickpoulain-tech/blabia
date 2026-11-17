// BlabIA + : le site du projet (construction par un agent, retouches, aperçu).
// Monté à part du cœur v6 (routes/work.js n'en dépend pas).
const express = require('express');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const site = require('../services/plus/siteBuilder');
const publisher = require('../services/plus/sitePublisher');

const router = express.Router();
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

const sendError = (res, err, where) => {
  if (err instanceof site.SiteError || err instanceof publisher.PublishError) return res.status(err.status).json({ error: err.message });
  console.error(`[site ${where}]`, err.message);
  return res.status(500).json({ error: 'Erreur serveur' });
};

// ── Aperçu (sans connexion : le jeton, long et aléatoire, fait office d'accès) ─
// Le site produit est servi dans un bac à sable (en-tête CSP « sandbox ») : origine isolée, il
// ne peut rien lire de BlabIA (ni jeton de connexion ni données), et rien ne sort vers d'autres sites.
const PREVIEW_CSP = [
  'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox',
  "default-src 'self' data:", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self' data:", "connect-src 'none'", "frame-ancestors 'self'", "base-uri 'none'",
].join('; ');

router.get('/apercu/:token/:file?', async (req, res) => {
  try {
    if (!req.params.file && !req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(301, `${req.originalUrl.split('?')[0]}/`);
    const f = await site.previewFile(req.params.token, req.params.file);
    if (!f) return res.status(404).type('text/plain; charset=utf-8').send('Page introuvable.');
    res.set({
      'Content-Type': f.contentType, 'Content-Security-Policy': PREVIEW_CSP,
      'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, max-age=60',
    });
    res.send(f.content);
  } catch (err) { sendError(res, err, 'apercu'); }
});

// ── Projet ───────────────────────────────────────────────────────────────────
async function projectOr404(req, res) {
  const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return null; }
  return project;
}

router.get('/projects/:id/site', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    res.json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'GET'); }
});

// État complet : constructions et mise en ligne
const stateOf = async projectId => ({ ...(await site.siteState(projectId)), publication: await publisher.publicationState(projectId) });

// « Mettre en ligne » (ou mettre à jour le site en ligne) : { slug } facultatif, l'adresse choisie
router.post('/projects/:id/site/publish', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    if (project.userId !== req.user.id && !isAdminOf(req)) return res.status(403).json({ error: 'Seul le propriétaire du projet peut mettre son site en ligne.' });
    await publisher.publish(project.id, req.user.id, { slug: req.body?.slug ? String(req.body.slug) : undefined });
    res.json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'publish'); }
});

// Retirer le site d'Internet
router.post('/projects/:id/site/unpublish', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.userId !== req.user.id && !isAdminOf(req)) return res.status(403).json({ error: 'Seul le propriétaire du projet peut retirer son site.' });
    await publisher.unpublish(project.id);
    res.json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'unpublish'); }
});

// « Construire mon site » (ou reconstruire après des changements du dossier)
router.post('/projects/:id/site/build', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    await site.startBuild(project.id, req.user.id);
    res.status(202).json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'build'); }
});

// Retouche du site : le porteur écrit ce qu'il veut changer
router.post('/projects/:id/site/retouch', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    await site.startRetouch(project.id, req.user.id, req.body?.text);
    res.status(202).json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'retouch'); }
});

module.exports = router;
