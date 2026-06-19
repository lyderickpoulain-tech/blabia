const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const { computeMilestoneStatus } = require('../../utils/milestones');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { appendTimelineEntry, patchTimelineEntry } = require('./helpers');

const router = express.Router({ mergeParams: true });

// ── POST /:sessionId/pin-message — Épinglage d'un message ────────────────────

router.post('/:sessionId/pin-message', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { messageId, type } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const VALID_TYPES = ['decision', 'step_suggestion'];
  if (!messageId) return res.status(400).json({ error: 'messageId requis' });
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'type invalide — valeurs acceptées : decision, step_suggestion' });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const messages = (() => {
      const m = session.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 0) return res.status(404).json({ error: 'Message introuvable' });

    messages[idx] = { ...messages[idx], pinned: true, type };
    await db('Session').where({ id: sessionId }).update({ messages: JSON.stringify(messages) });

    let milestone = null;

    if (type === 'step_suggestion') {
      const msgContent = messages[idx].content || '';
      const title = msgContent.length > 80
        ? msgContent.substring(0, 80).trim() + '…'
        : msgContent.trim();

      const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId });
      const [created] = await db('Milestone')
        .insert({
          id: randomUUID(),
          projectId,
          title,
          description: `Étape suggérée par ${messages[idx].agentName || 'un agent'} lors d'une réunion.`,
          status: 'pending',
          type: 'meeting',
          displayOrder: (maxOrder ?? -1) + 1,
          createdFromSessionId: sessionId,
          createdAt: new Date(),
          createdBy: req.user.id
        })
        .returning(['id', 'title', 'description', 'status', 'type', 'displayOrder', 'createdAt']);

      milestone = created;
    }

    res.json({ message: messages[idx], milestone });
  } catch (err) {
    console.error('[sessions/pin-message]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/answer-decision — Réponse à une décision ─────────────────

router.post('/:sessionId/answer-decision', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { messageId, answer, status } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const VALID_STATUSES = ['answered', 'deferred', 'delegated'];
  if (!messageId) return res.status(400).json({ error: 'messageId requis' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status invalide — valeurs acceptées : answered, deferred, delegated' });
  }
  if (status === 'answered' && !answer?.trim()) {
    return res.status(400).json({ error: 'answer requis pour status answered' });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const messages = (() => {
      const m = session.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

    const idx = messages.findIndex(m => m.id === messageId && m.type === 'decision');
    if (idx < 0) return res.status(404).json({ error: 'Décision introuvable' });

    const now = new Date().toISOString();
    messages[idx] = {
      ...messages[idx],
      status,
      answer:     status === 'answered' ? answer.trim() : (status === 'delegated' ? 'delegated' : null),
      answeredAt: (status === 'answered' || status === 'delegated') ? now : null,
    };

    let systemMessage = null;
    if (status === 'answered') {
      systemMessage = {
        id:        randomUUID(),
        role:      'system',
        type:      'decision_answer',
        content:   `📌 Décision : ${messages[idx].question} → ${answer.trim()}`,
        timestamp: now,
      };
      messages.push(systemMessage);
    } else if (status === 'delegated') {
      systemMessage = {
        id:        randomUUID(),
        role:      'system',
        type:      'decision_answer',
        content:   `💬 Décision déléguée : "${messages[idx].question}" → L'humain demande aux agents de débattre et de proposer la meilleure option.`,
        timestamp: now,
      };
      messages.push(systemMessage);
    }

    await db('Session').where({ id: sessionId }).update({ messages: JSON.stringify(messages) });
    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });

    return res.json({ message: messages[idx], systemMessage });
  } catch (err) {
    console.error('[sessions/answer-decision]', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PATCH /:sessionId/code-status — Statut d'implémentation du code ───────────

router.patch('/:sessionId/code-status', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { status } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  if (!['implemented', 'not_generated'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide — valeurs acceptées : implemented, not_generated' });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    await db('Session').where({ id: sessionId }).update({ codeStatus: status });

    if (session.milestoneId) {
      try {
        await db('Milestone').where({ id: session.milestoneId }).update({
          status: status === 'implemented' ? 'done' : 'blocked'
        });
      } catch {}
    }

    if (status === 'not_generated') {
      try {
        const affectedMilestones = await db('TodoItem')
          .select('milestoneId')
          .where({ sessionId })
          .whereNotNull('milestoneId')
          .distinct();
        for (const { milestoneId } of affectedMilestones) {
          const autoStatus = await computeMilestoneStatus(milestoneId);
          if (autoStatus) await db('Milestone').where({ id: milestoneId }).update({ status: autoStatus });
        }
      } catch (err) {
        console.error('[code-status milestone recompute]', err.message);
      }
    }

    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const entry = status === 'implemented'
      ? `[${date}] Code implémenté et commité — session : ${session.task}`
      : `[${date}] Code non généré — à reprendre : ${session.task}`;

    const [proj] = await db('Project').select('context').where({ id: projectId }).limit(1);
    const current = proj?.context || '';
    const separator = current ? '\n---\n' : '';
    let newContext = current + separator + entry;

    const MAX_CHARS = 10000;
    if (newContext.length > MAX_CHARS) {
      const parts = newContext.split('\n---\n');
      while (parts.length > 1 && parts.join('\n---\n').length > MAX_CHARS) parts.shift();
      newContext = parts.join('\n---\n');
    }
    await db('Project').where({ id: projectId }).update({ context: newContext });

    const implEntry = {
      id: `impl-${randomUUID()}`,
      type: 'implementation',
      label: status === 'implemented' ? 'Code implémenté et commité' : 'Code non généré',
      status: status === 'implemented' ? 'done' : 'blocked',
      timestamp: new Date().toISOString(),
      meta: { codeStatus: status }
    };
    await appendTimelineEntry(sessionId, implEntry).catch(() => {});

    res.json({ codeStatus: status });
  } catch (err) {
    console.error('[code-status PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/timeline-event — Enregistrement manuel d'un événement ────

router.post('/:sessionId/timeline-event', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { type, label, status, meta, entryId, patch } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    if (patch && entryId) {
      await patchTimelineEntry(sessionId, entryId, patch);
    } else {
      const entry = {
        id: entryId || randomUUID(),
        type: type || 'custom',
        label: label || '',
        status: status || 'done',
        timestamp: new Date().toISOString(),
        meta: meta || {}
      };
      await appendTimelineEntry(sessionId, entry);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[timeline-event POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
