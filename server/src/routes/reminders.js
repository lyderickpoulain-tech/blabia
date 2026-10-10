const express = require('express');
const { runReminders } = require('../services/reminders');

// POST /api/reminders/run — déclenchement externe (cron) si le serveur est mis en
// veille. Désactivé tant que CRON_SECRET n'est pas défini ; en-tête x-cron-secret.
const router = express.Router();
router.post('/run', async (req, res) => {
  if (!process.env.CRON_SECRET || req.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  try {
    res.json(await runReminders());
  } catch (err) {
    console.error('[reminders/run]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
module.exports = router;
