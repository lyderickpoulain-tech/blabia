// v5.0 phase 4.3 : outils proposés pendant une réunion de type stack ([NEED_TOOL]),
// validés un par un par l'humain à la clôture puis reportés dans Project.tools.
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../../utils/db');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { parseJsonField } = require('../../utils/parseJsonField');
const { normalize } = require('../../services/tools/catalog');
const { getProjectTools, sanitizeProjectTools, sanitizeCost } = require('../../services/tools/toolsStore');

const router = express.Router({ mergeParams: true });

// POST /:sessionId/tools/apply — { decisions: [{ id, status: validated|refused, cost? }] }
// Les outils sans décision sont reportés au projet avec le statut "suggéré".
router.post('/:sessionId/tools/apply', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const decisions = Array.isArray(req.body.decisions) ? req.body.decisions : [];
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const suggestions = parseJsonField(session.pendingToolSuggestions, []).filter(t => t && t.name);
    const byId = Object.fromEntries(decisions.map(d => [d.id, d]));
    const tools = await getProjectTools(project);
    const keyOf = t => t.catalogId || normalize(t.name);

    for (const s of suggestions) {
      const d = byId[s.id];
      const status = ['validated', 'refused'].includes(d?.status) ? d.status : 'suggested';
      const entry = {
        catalogId: s.catalogId || null,
        name: s.name,
        category: s.category,
        origin: 'complementary',
        status,
        need: s.need || '',
        why: s.why || '',
        cost: d?.cost ? sanitizeCost(d.cost) : (s.cost || null),
        priceSource: s.priceSource || null,
        sessionId,
      };
      const idx = tools.findIndex(t => keyOf(t) === keyOf(entry));
      if (idx >= 0) {
        // Outil déjà présent : on met à jour le statut, sans dégrader un outil "à moi" validé
        if (tools[idx].origin === 'mine') continue;
        tools[idx] = { ...tools[idx], ...entry, id: tools[idx].id };
      } else {
        tools.push({ id: randomUUID(), ...entry });
      }
    }

    const clean = sanitizeProjectTools(tools);
    await db('Project').where({ id: projectId }).update({ tools: JSON.stringify(clean), updatedAt: new Date() });
    res.json({ tools: clean });
  } catch (err) {
    console.error('[sessions/tools/apply]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
