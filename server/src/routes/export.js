const express = require('express');
const authMiddleware = require('../middleware/auth');
const anthropic = require('../services/anthropic');
const db = require('../utils/db');

const router = express.Router();
router.use(authMiddleware);

const MODEL = 'claude-sonnet-4-6';

const CATEGORY_LABELS = {
  hebergement: 'Hébergement',
  bdd: 'Base de données',
  frontend: 'Framework frontend',
  backend: 'Framework backend',
  auth: 'Authentification',
  emails: 'Envoi d\'emails',
  devtools: 'Outils de développement',
  domaine: 'Domaine'
};

function formatTechStack(ts) {
  const lines = [];
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const selected = ts[key] || [];
    if (selected.length === 0) continue;
    const items = selected.map(item => {
      if (item === 'Autre' && ts[`${key}_autre`]) return ts[`${key}_autre`];
      if (item === 'Autre') return null;
      return item;
    }).filter(Boolean);
    if (items.length > 0) lines.push(`- ${label} : ${items.join(', ')}`);
  }
  return lines;
}

// POST /api/export/claude-code — génère un prompt Claude Code depuis une restitution
router.post('/claude-code', async (req, res) => {
  const { summary, projectId } = req.body;
  if (!summary?.trim()) {
    return res.status(400).json({ error: 'La restitution est requise' });
  }

  try {
    // Récupérer l'environnement technique : project.techStack ?? user.techStack
    const [user] = await db('User').select(['techStack']).where({ id: req.user.id }).limit(1);
    const userStack = typeof user?.techStack === 'string'
      ? JSON.parse(user.techStack) : (user?.techStack || {});

    let effectiveStack = userStack;
    let devDirectory = null;
    let projectBrief = null;
    if (projectId) {
      const [project] = await db('Project').select(['techStack', 'devDirectory', 'brief']).where({ id: projectId }).limit(1);
      if (project?.techStack) {
        const projectStack = typeof project.techStack === 'string'
          ? JSON.parse(project.techStack) : project.techStack;
        effectiveStack = projectStack;
      }
      devDirectory  = project?.devDirectory?.trim() || null;
      projectBrief  = project?.brief?.trim()        || null;
    }

    const techStack = effectiveStack;
    const stackLines = formatTechStack(techStack);
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
