const express = require('express');
const db      = require('../../utils/db');
const { findProject: getProject } = require('../../utils/projectHelpers');

const router = express.Router({ mergeParams: true });

// ── POST /:sessionId/close — Fermeture sans synthèse (mode conversation) ───────

router.post('/:sessionId/close', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) return res.status(400).json({ error: 'Session déjà close' });
    if (s.mode !== 'conversation') return res.status(400).json({ error: 'Réservé au mode conversation' });

    await db('Session').where({ id: sessionId }).update({ status: 'open', summary: null });
    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });

    res.json({ message: 'Conversation terminée' });
  } catch (err) {
    console.error('[sessions/close]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/reopen — Réouverture d'une réunion terminée ──────────────

router.post('/:sessionId/reopen', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (s.status === 'open') return res.json(s);
    await db('Session').where({ id: sessionId }).update({ status: 'open' });
    const [updated] = await db('Session').where({ id: sessionId }).limit(1);
    res.json(updated);
  } catch (err) {
    console.error('[sessions/:id/reopen POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/reset — Réinitialisation d'une réunion ──────────────────

router.post('/:sessionId/reset', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    await db('Session').where({ id: sessionId }).update({
      messages: JSON.stringify([]),
      status: 'open',
      summary: null,
      planSuggestions: null,
      tokensUsed: JSON.stringify({ input: 0, output: 0, total: 0 }),
      hasCode: false,
      codeStatus: null
    });

    let followingCount = 0;
    let newContext = project.context || '';

    if (session.milestoneId) {
      const [milestone] = await db('Milestone').where({ id: session.milestoneId }).limit(1);
      if (milestone) {
        const followingMilestones = await db('Milestone')
          .where({ projectId })
          .where('displayOrder', '>', milestone.displayOrder);
        const followingMilestoneIds = followingMilestones.map(m => m.id);

        let followingSessionIds = [sessionId];
        if (followingMilestoneIds.length > 0) {
          const followingSessions = await db('Session')
            .whereIn('milestoneId', followingMilestoneIds)
            .where({ projectId });
          followingSessionIds = [sessionId, ...followingSessions.map(s => s.id)];
          followingCount = followingSessions.length;
        }

        for (const sid of followingSessionIds) {
          const regex = new RegExp(
            `(?:^|\\n---\\n)\\[SESSION:${sid}[^\\]]*\\][\\s\\S]*?(?=\\n---\\n|$)`,
            'g'
          );
          newContext = newContext.replace(regex, '');
        }
        newContext = newContext.replace(/^---\n/gm, '').replace(/\n---\n---\n/g, '\n---\n').trim();

        await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
      }
    } else {
      const regex = new RegExp(
        `(?:^|\\n---\\n)\\[SESSION:${sessionId}[^\\]]*\\][\\s\\S]*?(?=\\n---\\n|$)`,
        'g'
      );
      newContext = newContext.replace(regex, '').replace(/^---\n/gm, '').replace(/\n---\n---\n/g, '\n---\n').trim();
      await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
    }

    res.json({ message: 'Réunion réinitialisée', followingCount });
  } catch (err) {
    console.error('[sessions/:id/reset POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
