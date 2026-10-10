const express = require('express');
const authMiddleware = require('../middleware/auth');
const { MEETING_MODELS, DEFAULT_MODEL } = require('../services/models');

const router = express.Router();
router.use(authMiddleware);

// GET /api/models — modèles proposés au démarrage d'une réunion (services/models.js)
router.get('/', (_req, res) => res.json({ models: MEETING_MODELS, default: DEFAULT_MODEL }));

module.exports = router;
