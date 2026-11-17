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

// Adresse au nom du porteur : { hostname } (ex. www.petrin-sonore.fr), ou la retirer
router.post('/projects/:id/site/domain', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.userId !== req.user.id && !isAdminOf(req)) return res.status(403).json({ error: 'Seul le propriétaire du projet peut choisir son adresse.' });
    await publisher.attachDomain(project.id, req.body?.hostname);
    res.json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'domain'); }
});

router.delete('/projects/:id/site/domain', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.userId !== req.user.id && !isAdminOf(req)) return res.status(403).json({ error: 'Seul le propriétaire du projet peut retirer son adresse.' });
    await publisher.detachDomain(project.id);
    res.json(await stateOf(project.id));
  } catch (err) { sendError(res, err, 'domain delete'); }
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

// Chemin C : « Télécharger mon site » — tout le site dans un fichier .zip, prêt à déposer chez
// l'hébergeur de son choix, avec un mode d'emploi (le porteur n'est jamais prisonnier de BlabIA)
const LISEZMOI = name => `${name} — votre site, prêt à mettre en ligne
${'='.repeat(Math.min(60, name.length + 34))}

Ce dossier contient tout votre site : des pages (.html), le style (.css) et les images.
Il n'a besoin de rien d'autre : pas de base de données, pas d'installation.

Pour le mettre en ligne chez l'hébergeur de votre choix, déposez TOUS ces fichiers, tels quels,
à la racine de votre espace (le fichier index.html doit être au premier niveau) :

- Hébergement web OVHcloud, Gandi, o2switch… : dans l'espace client, « Gestionnaire de fichiers »
  (ou un logiciel de transfert comme FileZilla), dossier « www » ou « public_html ».
- Cloudflare Pages : « Workers et Pages » > « Créer » > « Pages » > « Charger des ressources »,
  puis glissez ce dossier.
- Netlify : « Add new site » > « Deploy manually », puis glissez ce dossier.

Votre adresse (par exemple www.mon-site.fr) se règle ensuite chez l'hébergeur.
Avant de publier, complétez la page des mentions légales (votre nom, votre adresse, l'hébergeur).

Fichier préparé par BlabIA le ${new Date().toLocaleDateString('fr-FR')}.
`;

router.get('/projects/:id/site/download', authMiddleware, async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    const files = await site.readyFiles(project.id);
    if (!files) return res.status(404).json({ error: 'Votre site n’est pas encore construit.' });
    const JSZip = require('jszip');
    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.content);
    zip.file('LISEZMOI.txt', LISEZMOI(project.name));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const name = `${publisher.slugify(project.name)}-site`;
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}.zip"` });
    res.send(buffer);
  } catch (err) { sendError(res, err, 'download'); }
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
