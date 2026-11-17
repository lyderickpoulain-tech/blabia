const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const path    = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app    = express();
const PORT   = process.env.PORT || 3001;   // Railway injecte toujours PORT ; 3001 = fallback local uniquement
const isProd = process.env.NODE_ENV === 'production';

// Contrôle de sécurité du 18/11/2026 (feuille de route, § 7) :
// - derrière le proxy de Railway, l'adresse du visiteur est dans X-Forwarded-For : sans ce
//   réglage, les limites de tentatives de connexion comptaient tous les visiteurs ensemble ;
// - le serveur ne dit plus quel logiciel il utilise ;
// - en production, le site est servi par ce même serveur : aucune autre origine n'est autorisée
//   à l'appeler (avant : toutes les origines étaient acceptées) ;
// - en-têtes de protection du navigateur (le site ne s'affiche pas dans le cadre d'un autre site,
//   type de fichier respecté, pas de caméra ni de micro, connexion chiffrée imposée).
if (isProd) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    ...(isProd ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  });
  next();
});
app.use(cors({
  origin: isProd ? false : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Coût réel de l'IA : rattache les appels Anthropic de la requête au projet / à la réunion
app.use(require('./services/usage').usageMiddleware);
// Projet exemple de la visite guidée : routes IA refusées (aucun coût)
app.use(require('./services/usage').demoGuard);

// ── Routes publiques (avant tout routeur : aucune authentification) ──────────
// Healthcheck Railway : doit répondre 200 sans jeton, sinon le déploiement échoue.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'BlabIA server en ligne', timestamp: new Date() });
});

// Endpoint de warm-up — répond < 10ms pour éliminer le cold start Railway.
// Pour supprimer le cold start définitivement, passer au plan Railway Hobby (5€/mois).
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',                         require('./routes/auth'));
app.use('/api/admin',                        require('./routes/admin'));
app.use('/api/agents',                       require('./routes/agents'));
app.use('/api/export',                       require('./routes/export'));
app.use('/api/users',                        require('./routes/users'));
app.use('/api/models',                       require('./routes/models'));
app.use('/api/projects',                     require('./routes/work')); // v6 : ouvrage, création en une question
app.use('/api',                              require('./routes/site')); // BlabIA + : construction du site, aperçu
app.use('/api/projects',                     require('./routes/projects'));
app.use('/api/projects/:projectId/sessions', require('./routes/sessions'));
app.use('/api/projects',                     require('./routes/plan'));
app.use('/api/projects',                     require('./routes/decisionRegistry'));
app.use('/api/projects',                     require('./routes/actions'));
app.use('/api/projects',                     require('./routes/documents'));
app.use('/api/projects',                     require('./routes/missions'));
app.use('/api/projects',                     require('./routes/recap'));
app.use('/api/projects',                     require('./routes/assistant')); // v5.1 : bras droit
app.use('/api/projects',                     require('./routes/exports'));
app.use('/api/projects',                     require('./routes/devTasks'));
app.use('/api/github',                       require('./routes/github'));
app.use('/api/reminders',                    require('./routes/reminders'));
app.use('/api',                              require('./routes/tools'));
app.use('/api',                              require('./routes/railway'));

// ── Production : servir le build Vite ────────────────────────────────────────
if (isProd) {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));

  // Toutes les routes non-API renvoient index.html (SPA routing)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Route non trouvée' });
    } else {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// '0.0.0.0' est indispensable dans Docker : sans ça, Node écoute uniquement
// sur 127.0.0.1 et le healthcheck Railway (externe au container) ne répond pas.
// Démarré seulement quand le fichier est lancé (node / nodemon / Railway) : les tests
// d'intégration importent l'application sans ouvrir de port ni lancer les rappels.
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BlabIA server démarré sur le port ${PORT} (mode: ${isProd ? 'production' : 'développement'})`);
    // v6 : clés API et jetons enregistrés chiffrés par une clé dédiée (utils/secretBox.js)
    if (isProd && !process.env.SECRETS_ENCRYPTION_KEY) console.warn('[secretBox] SECRETS_ENCRYPTION_KEY absente : secrets encore chiffrés avec JWT_SECRET (illisibles si ce secret change).');
    // Rappels hebdomadaires des actions (services/reminders.js) : vérification horaire
    require('./services/reminders').startReminderScheduler();
    // v6 : veille mensuelle des outils (agent programmé, production seulement)
    require('./services/veille').startVeille();
    // Missions des agents en attente : reprise au démarrage puis toutes les 5 minutes
    if (process.env.REMINDERS_DISABLED !== '1') {
      const { processMissions } = require('./services/missionRunner');
      const tick = () => processMissions().catch(err => console.error('[missions]', err.message));
      setTimeout(tick, 30 * 1000);
      setInterval(tick, 5 * 60 * 1000).unref?.();
    }
  });
}

module.exports = app;
