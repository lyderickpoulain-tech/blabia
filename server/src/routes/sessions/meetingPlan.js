// v5.0 phase 3.4 : suggestions de réunions (Garder / Modifier / Écarter) et
// validation transactionnelle du « Plan des réunions ».
const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { parseJsonField } = require('../../utils/parseJsonField');

const router = express.Router({ mergeParams: true });

const VALID_TYPES = ['decision', 'claude_code', 'stack'];

// ── PATCH /:sessionId/meeting-suggestions/:suggestionId — Garder/Modifier/Écarter

router.patch('/:sessionId/meeting-suggestions/:suggestionId', async (req, res) => {
  const { projectId, sessionId, suggestionId } = req.params;
  const { status, title, type, objective } = req.body;
  if (status !== undefined && !['pending', 'kept', 'discarded'].includes(status)) {
    return res.status(400).json({ error: 'status invalide — valeurs acceptées : pending, kept, discarded' });
  }
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const suggestions = parseJsonField(session.pendingMeetingSuggestions, []);
    const idx = suggestions.findIndex(s => s.id === suggestionId);
    if (idx < 0) return res.status(404).json({ error: 'Suggestion introuvable' });

    if (status !== undefined)    suggestions[idx].status = status;
    if (title !== undefined)     suggestions[idx].title = title.trim();
    if (objective !== undefined) suggestions[idx].objective = objective.trim();
    if (type !== undefined && VALID_TYPES.includes(type)) suggestions[idx].type = type;

    await db('Session').where({ id: sessionId }).update({ pendingMeetingSuggestions: JSON.stringify(suggestions) });
    res.json(suggestions[idx]);
  } catch (err) {
    console.error('[meeting-suggestions PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/meeting-plan/validate — Création + réordonnancement transactionnel

router.post('/:sessionId/meeting-plan/validate', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { order } = req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order requis — liste de { milestoneId } ou { suggestionId }' });
  }
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const suggestions = parseJsonField(session.pendingMeetingSuggestions, []);

    const finalIds = await db.transaction(async trx => {
      const ids = [];
      for (const item of order) {
        if (item.milestoneId) {
          ids.push(item.milestoneId);
          continue;
        }
        if (!item.suggestionId) continue;
        const sIdx = suggestions.findIndex(s => s.id === item.suggestionId);
        if (sIdx < 0 || suggestions[sIdx].status !== 'kept') continue;

        // Idempotent : une suggestion déjà matérialisée en Milestone n'est pas recréée
        if (suggestions[sIdx].milestoneId) {
          ids.push(suggestions[sIdx].milestoneId);
          continue;
        }

        const sug = suggestions[sIdx];
        const [created] = await trx('Milestone')
          .insert({
            id: randomUUID(),
            projectId,
            title: sug.title,
            description: sug.objective || null,
            status: 'pending',
            type: VALID_TYPES.includes(sug.type) ? sug.type : 'decision',
            createdFromSessionId: sessionId,
            createdBy: req.user.id,
            createdAt: new Date(),
            displayOrder: 0,
          })
          .returning(['id']);
        suggestions[sIdx].milestoneId = created.id;
        ids.push(created.id);
      }

      // Séquentiel : une transaction knex partage une seule connexion, des updates
      // lancés en parallèle (Promise.all) déclenchent un warning pg "already executing a query".
      for (let i = 0; i < ids.length; i++) {
        await trx('Milestone').where({ id: ids[i], projectId }).update({ displayOrder: i * 10 });
      }
      await trx('Session').where({ id: sessionId }).update({ pendingMeetingSuggestions: JSON.stringify(suggestions) });

      return ids;
    });

    const milestones = await db('Milestone')
      .whereIn('id', finalIds)
      .andWhere({ projectId })
      .orderBy('displayOrder', 'asc');
    res.json({ milestones });
  } catch (err) {
    console.error('[meeting-plan/validate POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
