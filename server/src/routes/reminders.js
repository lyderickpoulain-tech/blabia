const express = require('express');
const { timingSafeEqual } = require('crypto');
const { runReminders } = require('../services/reminders');

// POST /api/reminders/run — déclenchement externe (cron-job.org, cron Railway…) si le
// serveur est mis en veille. En-tête x-cron-secret = variable CRON_SECRET.
// 503 : CRON_SECRET absent du serveur (déclenchement désactivé) ; 403 : secret différent.
// Espaces en début/fin ignorés des deux côtés (copier-coller).
const router = express.Router();

function sameSecret(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

router.post('/run', async (req, res) => {
  const expected = (process.env.CRON_SECRET || '').trim();
  if (!expected) return res.status(503).json({ error: 'Déclenchement désactivé : CRON_SECRET n’est pas défini sur le serveur.' });
  if (!sameSecret((req.get('x-cron-secret') || '').trim(), expected)) {
    return res.status(403).json({ error: 'Secret incorrect (en-tête x-cron-secret).' });
  }
  try {
    res.json(await runReminders());
  } catch (err) {
    console.error('[reminders/run]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
module.exports = router;
