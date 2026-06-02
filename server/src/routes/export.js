const express = require('express');
const authMiddleware = require('../middleware/auth');
const anthropic = require('../services/anthropic');

const router = express.Router();
router.use(authMiddleware);

const MODEL = 'claude-sonnet-4-6';

// POST /api/export/claude-code — génère un prompt Claude Code depuis une restitution
router.post('/claude-code', async (req, res) => {
  const { summary } = req.body;
  if (!summary?.trim()) {
    return res.status(400).json({ error: 'La restitution est requise' });
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Tu es un expert en prompting pour Claude Code.
À partir de cette restitution d'agents IA, génère un prompt optimisé pour Claude Code qui permettra d'implémenter techniquement les décisions prises.

Restitution :
${summary.trim()}

Le prompt doit :
- Commencer par le contexte du projet
- Lister les tâches techniques à implémenter dans l'ordre
- Préciser la stack technique si mentionnée
- Demander une validation étape par étape
- Être en français`
      }]
    });

    res.json({ prompt: response.content[0].text.trim() });
  } catch (err) {
    console.error('[export/claude-code]', err.message);
    res.status(502).json({ error: 'Erreur lors de la génération du prompt' });
  }
});

module.exports = router;
