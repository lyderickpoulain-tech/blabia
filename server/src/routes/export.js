const express = require('express');
const authMiddleware = require('../middleware/auth');
const anthropic = require('../services/anthropic');
const { findProject } = require('../utils/projectHelpers');
const { getProjectTools, getUserTools, formatProjectToolsForPrompt } = require('../services/tools/toolsStore');

const router = express.Router();
router.use(authMiddleware);

const MODEL = 'claude-sonnet-4-6';

// POST /api/export/claude-code — génère un prompt Claude Code depuis une restitution
router.post('/claude-code', async (req, res) => {
  const { summary, projectId } = req.body;
  if (!summary?.trim()) {
    return res.status(400).json({ error: 'La restitution est requise' });
  }

  try {
    // Outils : ceux du projet (phase 4), sinon « Mes outils » de l'utilisateur
    let stackLines = [];
    let devDirectory = null;
    let projectBrief = null;
    if (projectId) {
      const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
      const project = await findProject(projectId, req.user.id, isAdmin);
      if (!project) return res.status(404).json({ error: 'Projet introuvable' });
      stackLines   = formatProjectToolsForPrompt(await getProjectTools(project)).split('\n').filter(Boolean);
      devDirectory = project.devDirectory?.trim() || null;
      projectBrief = project.brief?.trim()        || null;
    }
    if (stackLines.length === 0) {
      const mine = ((await getUserTools(req.user.id)) || []).filter(t => t.status === 'using');
      stackLines = formatProjectToolsForPrompt(mine.map(t => ({ ...t, status: 'validated' }))).split('\n').filter(Boolean);
    }
    const stackSection = stackLines.length > 0
      ? `\nStack technique du projet :\n${stackLines.join('\n')}\nAdapte toutes tes suggestions à cet environnement. Ne propose pas d'alternatives sauf si l'outil choisi est inadapté à la tâche.\n`
      : '';
    const briefSection = projectBrief
      ? `\nBrief du projet :\n${projectBrief}\n`
      : '';
    const cdInstruction = devDirectory
      ? `- Commencer IMPÉRATIVEMENT par la ligne : cd "${devDirectory}"`
      : '- Préciser que l\'utilisateur doit naviguer manuellement vers son répertoire de projet';

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content:
`Tu es un expert en prompting pour Claude Code.
À partir de cette restitution, génère un prompt optimisé pour Claude Code qui permettra d'implémenter techniquement les décisions prises.
${briefSection}${stackSection}
Restitution :
${summary.trim()}

Le prompt généré doit :
${cdInstruction}
- Calibrer sa complexité sur l'objectif réel décrit dans la restitution (ne pas over-engineer)
- Commencer par le contexte du projet
- Lister les tâches techniques à implémenter dans l'ordre logique (numérotées)
- Préciser la stack technique si mentionnée
- Demander une validation étape par étape
- Être rédigé en français`
      }]
    });

    res.json({ prompt: response.content[0].text.trim() });
  } catch (err) {
    console.error('[export/claude-code]', err.message);
    res.status(502).json({ error: 'Erreur lors de la génération du prompt' });
  }
});

module.exports = router;
