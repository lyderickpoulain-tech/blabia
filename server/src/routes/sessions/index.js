const express        = require('express');
const authMiddleware = require('../../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(authMiddleware);

// Ordre important : fixed paths (/suggest-agents) avant les wildcards (/:sessionId/...)
router.use(require('./crud'));
router.use(require('./lifecycle'));
router.use(require('./deliverables'));
router.use(require('./agents'));
router.use(require('./decisions'));
router.use(require('./meetingPlan'));
router.use(require('./toolSuggestions'));
router.use(require('./chat'));
router.use(require('./assist')); // v5.1 : avis sur les bulles, « Où en est-on ? », formats de CR

module.exports = router;
