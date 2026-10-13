const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const { appendMemory } = require('../../utils/projectMemory');
const { computeMilestoneStatus } = require('../../utils/milestones');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { appendTimelineEntry, patchTimelineEntry } = require('./helpers');
const { parseJsonField } = require('../../utils/parseJsonField');

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

    const messages = parseJsonField(session.messages, []);

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

// ── POST /:sessionId/vigilance — Réponse à un point de vigilance (contradicteur) ──
// accepted : les agents intègrent la remarque ; dismissed : le sujet est clos,
// le contradicteur n'y revient plus (services/challenger.js).

router.post('/:sessionId/vigilance', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { messageId, status } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  if (!messageId || !['accepted', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'messageId et status (accepted | dismissed) requis' });
  }
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const messages = parseJsonField(session.messages, []);
    const idx = messages.findIndex(m => m.id === messageId && m.vigilance);
    if (idx < 0) return res.status(404).json({ error: 'Point de vigilance introuvable' });
    if (messages[idx].vigilance.status !== 'open') {
      return res.status(409).json({ error: 'Ce point de vigilance a déjà reçu une réponse' });
    }

    messages[idx] = { ...messages[idx], vigilance: { ...messages[idx].vigilance, status, answeredAt: new Date().toISOString() } };
    const target = messages[idx].vigilance.target || '';
    // Message technique pour les agents (masqué dans le fil, comme les réponses aux questions)
    const systemMessage = {
      id: randomUUID(), role: 'system', type: 'decision_answer', timestamp: new Date().toISOString(),
      content: status === 'accepted'
        ? `📌 Point de vigilance pris en compte par l'humain : « ${target} ». Les agents intègrent cette remarque dans la suite.`
        : `📌 Point de vigilance écarté par l'humain : « ${target} ». Le sujet est clos, n'y revenez pas.`,
    };
    messages.push(systemMessage);
    await db('Session').where({ id: sessionId }).update({ messages: JSON.stringify(messages) });
    res.json({ message: messages[idx], systemMessage });
  } catch (err) {
    console.error('[sessions/vigilance]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Participants humains de la réunion : propriétaire et membres du projet ───
// (invitation acceptée ; les invitations en attente ne comptent pas)
const displayName = u => u?.username || String(u?.email || '').split('@')[0] || 'quelqu’un';
async function participantsOf(project) {
  const [owner] = await db('User').where({ id: project.userId }).select('id', 'username', 'email').limit(1);
  const members = await db('ProjectMember as m').join('User as u', 'u.id', 'm.userId')
    .where('m.projectId', project.id).select('u.id', 'u.username', 'u.email').orderBy('m.invitedAt', 'asc');
  return [owner, ...members.filter(m => m.id !== owner?.id)].filter(Boolean)
    .map(u => ({ userId: u.id, name: displayName(u), email: u.email }));
}

// GET /:sessionId/participants — personnes à qui confier une question (sans l'e-mail)
router.get('/:sessionId/participants', async (req, res) => {
  const { projectId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    res.json((await participantsOf(project)).map(({ userId, name }) => ({ userId, name, isYou: userId === req.user.id })));
  } catch (err) {
    console.error('[sessions/participants]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/assign-decision — Question confiée à un autre humain ────
// { messageId, userId } : « Laisser répondre @… » ; { messageId, userId: null } : « Laisser
// répondre quelqu'un » (un autre participant, au choix) ; { messageId, cancel: true } : la
// personne qui l'avait confiée la reprend. La réunion attend sa réponse ; e-mail envoyé.
router.post('/:sessionId/assign-decision', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { messageId, userId = null, cancel = false } = req.body || {};
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  if (!messageId) return res.status(400).json({ error: 'messageId requis' });
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    const messages = parseJsonField(session.messages, []);
    const idx = messages.findIndex(m => m.id === messageId && m.type === 'decision');
    if (idx < 0) return res.status(404).json({ error: 'Question introuvable' });
    const msg = messages[idx];
    if (!['pending', 'deferred', 'awaiting_human', undefined].includes(msg.status)) return res.status(409).json({ error: 'Cette question a déjà reçu une réponse.' });

    if (cancel) {
      if (msg.status !== 'awaiting_human') return res.status(409).json({ error: 'Cette question n’est confiée à personne.' });
      const { assignedTo: _a, assignedToName: _b, assignedBy: _c, assignedByName: _d, assignedAt: _e, ...rest } = msg;
      messages[idx] = { ...rest, status: 'pending' };
    } else {
      const people = await participantsOf(project);
      const others = people.filter(p => p.userId !== req.user.id);
      if (!others.length) return res.status(409).json({ error: 'Personne d’autre ne participe à ce projet.' });
      const target = userId ? others.find(p => p.userId === userId) : null;
      if (userId && !target) return res.status(400).json({ error: 'Cette personne ne participe pas au projet.' });
      const me = people.find(p => p.userId === req.user.id);
      const askerName = me?.name || displayName(await db('User').where({ id: req.user.id }).first('username', 'email'));
      messages[idx] = {
        ...msg, status: 'awaiting_human',
        assignedTo: target?.userId || null, assignedToName: target?.name || null,
        assignedBy: req.user.id, assignedByName: askerName, assignedAt: new Date().toISOString(),
      };
      const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/projects/${projectId}/meeting/${sessionId}`;
      const { sendQuestionRequest } = require('../../services/email');
      for (const p of (target ? [target] : others)) {
        sendQuestionRequest(p.email, { askerName, agentName: msg.agentName, question: msg.question, meetingTitle: session.task, link })
          .catch(err => console.error('[assign-decision] e-mail :', err.message)); // l'envoi ne bloque pas la réunion
      }
    }
    await db('Session').where({ id: sessionId }).update({ messages: JSON.stringify(messages) });
    res.json({ message: messages[idx] });
  } catch (err) {
    console.error('[sessions/assign-decision]', err.message);
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

    const messages = parseJsonField(session.messages, []);

    const idx = messages.findIndex(m => m.id === messageId && m.type === 'decision');
    if (idx < 0) return res.status(404).json({ error: 'Décision introuvable' });

    // Question confiée à une personne précise : elle seule répond (ou celle qui la lui a confiée)
    const asked = messages[idx];
    if (asked.status === 'awaiting_human' && asked.assignedTo && ![asked.assignedTo, asked.assignedBy].includes(req.user.id)) {
      return res.status(403).json({ error: `Cette question attend la réponse de ${asked.assignedToName || 'quelqu’un d’autre'}.` });
    }
    const people = await participantsOf(project);
    const answeredByName = people.find(p => p.userId === req.user.id)?.name || null;

    const now = new Date().toISOString();
    messages[idx] = {
      ...messages[idx],
      status,
      answer:     status === 'answered' ? answer.trim() : (status === 'delegated' ? 'delegated' : null),
      answeredAt: (status === 'answered' || status === 'delegated') ? now : null,
      // Projet à plusieurs : qui a répondu (affiché sur la question, transmis aux agents)
      ...(people.length > 1 && (status === 'answered' || status === 'delegated') ? { answeredBy: req.user.id, answeredByName } : {}),
    };

    let systemMessage = null;
    if (status === 'answered') {
      systemMessage = {
        id:        randomUUID(),
        role:      'system',
        type:      'decision_answer',
        content:   `📌 Décision${messages[idx].answeredByName ? ` (réponse de ${messages[idx].answeredByName})` : ''} : ${messages[idx].question} → ${answer.trim()}`,
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
      } catch (err) { console.error('[decisions] recalcul du statut de la réunion :', err.message); }
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

    await appendMemory(projectId, entry); // services/memory.js : consolidation, rien n'est perdu

    const implEntry = {
      id: `impl-${randomUUID()}`,
      type: 'implementation',
      label: status === 'implemented' ? 'Code implémenté et commité' : 'Code non généré',
      status: status === 'implemented' ? 'done' : 'blocked',
      timestamp: new Date().toISOString(),
      meta: { codeStatus: status }
    };
    await appendTimelineEntry(sessionId, implEntry).catch(err => console.error('[decisions] historique de la réunion :', err.message));

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
