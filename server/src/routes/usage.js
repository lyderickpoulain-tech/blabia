const express = require('express');
const authMiddleware = require('../middleware/auth');
const { monthSpend } = require('../services/usageReports');

const router = express.Router();
router.use(authMiddleware);

// GET /api/usage/month — dépense IA du mois : facturée par Anthropic (organisation
// entière, si ANTHROPIC_ADMIN_KEY est configurée) et calculée par BlabIA.
// Réservé aux administrateurs : c'est la facture du compte, tous utilisateurs confondus.
router.get('/month', async (req, res) => {
  if (!['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Réservé aux administrateurs' });
  }
  try {
    res.json(await monthSpend({ refresh: req.query.refresh === '1' }));
  } catch (err) {
    console.error('[usage/month GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
