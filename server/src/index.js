const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const path    = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app    = express();
const PORT   = process.env.PORT || 3001;   // Railway injecte toujours PORT ; 3001 = fallback local uniquement
const isProd = process.env.NODE_ENV === 'production';

// En production, le frontend est servi depuis le même serveur → pas de restriction CORS
// En développement, on autorise uniquement Vite (5173)
app.use(cors({
  origin: isProd ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true
}));

app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',                       require('./routes/auth'));
app.use('/api/admin',                      require('./routes/admin'));
app.use('/api/projects',                   require('./routes/projects'));
app.use('/api/projects/:projectId/sessions', require('./routes/sessions'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'BlabIA server en ligne', timestamp: new Date() });
});

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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`BlabIA server démarré sur le port ${PORT} (mode: ${isProd ? 'production' : 'développement'})`);
});

module.exports = app;
