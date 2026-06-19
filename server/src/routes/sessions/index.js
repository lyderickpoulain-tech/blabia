const express        = require('express');
const authMiddleware = require('../../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(authMiddleware);

// Ordre important : fixed paths (/suggest-agents) avant les wildcards (/:sessionId/...)
router.use(require('./crud'));
router.use(require('./run'));
router.use(require('./lifecycle'));
router.use(require('./deliverables'));
router.use(require('./agents'));
router.use(require('./decisions'));
router.use(require('./chat'));

module.exports = router;
