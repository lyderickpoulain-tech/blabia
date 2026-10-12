const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { appendMessageEntry } = require('./helpers');
const { parseJsonField } = require('../../utils/parseJsonField');

const router = express.Router({ mergeParams: true });

// ── POST /:sessionId/add-agent — Ajout d'un agent à une réunion en cours ──────

router.post('/:sessionId/add-agent', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { agentId } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  if (!agentId) return res.status(400).json({ error: 'agentId requis' });

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(session.status)) {
      return res.status(400).json({ error: 'Session déjà close' });
    }

    const [agent] = await db('Agent').where({ id: agentId }).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent introuvable' });

    const currentActiveAgents = parseJsonField(session.activeAgents, []);

    if (currentActiveAgents.some(a => a.id === agentId)) {
      return res.status(409).json({ error: 'Cet agent est déjà dans la réunion' });
    }

    const joinedAt = new Date().toISOString();
    const newAgent = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      emoji: agent.emoji || '🤖',
      joinedAt
    };

    await db.raw(
      `UPDATE "Session" SET "activeAgents" = COALESCE("activeAgents", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
      [JSON.stringify([newAgent]), sessionId]
    );

    await appendMessageEntry(sessionId, {
      id: randomUUID(),
      role: 'system',
      agentName: null,
      content: `${agent.name} a rejoint la réunion.`,
      timestamp: joinedAt,
      type: 'message',
      pinned: false
    });

    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });

    res.json({ agent: newAgent });
  } catch (err) {
    console.error('[sessions/add-agent]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
