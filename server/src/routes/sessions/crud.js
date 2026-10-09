const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { MODEL } = require('./helpers');
const { isQuestionMode, decisionBudgetFor } = require('../../services/questionModes');
const { parseJsonField } = require('../../utils/parseJsonField');

const router = express.Router({ mergeParams: true });

// ── POST / — Création d'une réunion (v3.0, agents sélectionnés en amont) ──────

router.post('/', async (req, res) => {
  const {
    task,
    milestoneId = null,
    model: modelParam,
    fullContext: fullContextParam = false,
    intention = [],
    activeAgents: activeAgentsParam = null,
    webSearchEnabled: webSearchEnabledParam = false,
    expertiseLevel: expertiseLevelParam,
    humorLevel: humorLevelParam,
    questionMode: questionModeParam,
  } = req.body;
  const { projectId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const VALID_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8'];
  const selectedModel = VALID_MODELS.includes(modelParam) ? modelParam : MODEL;
  const fullContextEnabled = !!fullContextParam;
  const clampLevel = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };
  const expertiseLevel = clampLevel(expertiseLevelParam);
  const humorLevel     = clampLevel(humorLevelParam);
  const questionMode   = isQuestionMode(questionModeParam) ? questionModeParam : null;

  if (!task?.trim()) return res.status(400).json({ error: 'La tâche est requise' });
  if (!Array.isArray(activeAgentsParam) || activeAgentsParam.length === 0) {
    return res.status(400).json({ error: 'Au moins un agent est requis pour démarrer une réunion' });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.status === 'archived') return res.status(400).json({ error: 'Ce projet est archivé' });

    const now = new Date();
    const agentsWithJoin = activeAgentsParam.map(a => ({ ...a, joinedAt: now.toISOString() }));
    const [session] = await db('Session')
      .insert({
        id: randomUUID(),
        task: task.trim(),
        agents: JSON.stringify(agentsWithJoin),
        exchanges: JSON.stringify([]),
        messages: JSON.stringify([]),
        activeAgents: JSON.stringify(agentsWithJoin),
        summary: null,
        status: 'open',
        mode: 'meeting',
        model: selectedModel,
        fullContext: fullContextEnabled,
        intention: JSON.stringify(Array.isArray(intention) ? intention : []),
        webSearchEnabled: webSearchEnabledParam === true,
        expertiseLevel,
        humorLevel,
        questionMode,
        projectId,
        milestoneId: milestoneId || null,
        createdAt: now
      })
      .returning(['id', 'task', 'status', 'mode', 'model', 'createdAt', 'projectId', 'milestoneId', 'webSearchEnabled', 'expertiseLevel', 'humorLevel', 'questionMode']);
    await db('Project').where({ id: projectId }).update({ updatedAt: now });
    if (milestoneId) {
      try { await db('Milestone').where({ id: milestoneId, projectId }).update({ status: 'in_progress' }); } catch {}
    }
    res.status(201).json({
      session: { ...session, activeAgents: agentsWithJoin, messages: [] },
      plan: 'Réunion démarrée.'
    });
  } catch (err) {
    console.error('[sessions POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET / — Liste des sessions ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { projectId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const sessions = await db('Session')
      .select(
        'id', 'task', 'status', 'mode', 'createdAt', 'parentSessionId',
        'hasCode', 'codeStatus', 'suggestedTools',
        db.raw('jsonb_array_length(agents) as "agentCount"')
      )
      .where({ projectId })
      .whereIn('status', ['open', 'accepted', 'abandoned'])
      .orderBy('createdAt', 'desc');

    res.json(sessions);
  } catch (err) {
    console.error('[sessions GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── GET /:sessionId — Détail d'une session ────────────────────────────────────

router.get('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const [{ count: planCount }] = await db('Milestone')
      .count('id as count')
      .where({ createdFromSessionId: sessionId });

    res.json({
      ...session,
      agents:          parseJsonField(session.agents, []),
      exchanges:       parseJsonField(session.exchanges, []),
      timeline:        parseJsonField(session.timeline, []),
      planSuggestions: parseJsonField(session.planSuggestions, null),
      intention:       parseJsonField(session.intention, []),
      messages:        parseJsonField(session.messages, []),
      activeAgents:    parseJsonField(session.activeAgents, []),
      pendingMeetingSuggestions: parseJsonField(session.pendingMeetingSuggestions, []),
      pendingToolSuggestions: parseJsonField(session.pendingToolSuggestions, []).filter(t => t && t.name),
      decisionBudget: decisionBudgetFor(session, project),
      projectQuestionMode: project.questionMode,
      planAlreadyAdded: parseInt(planCount || 0) > 0,
    });
  } catch (err) {
    console.error('[sessions/:id GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── DELETE /:sessionId — Suppression ──────────────────────────────────────────

router.delete('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    await db('Session').where({ parentSessionId: sessionId }).update({ parentSessionId: null });
    await db('Session').where({ id: sessionId }).delete();

    res.json({ message: 'Session supprimée' });
  } catch (err) {
    console.error('[sessions/:id DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PATCH /:sessionId — Mise à jour tâche / intention / curseurs ──────────────

router.patch('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  const { task, intention, expertiseLevel, humorLevel, questionMode, summary, deliverable } = req.body;

  if ([task, intention, expertiseLevel, humorLevel, questionMode, summary, deliverable].every(v => v === undefined)) {
    return res.status(400).json({ error: 'Champ requis : task, intention, expertiseLevel, humorLevel, questionMode, summary ou deliverable' });
  }
  const clampLevel = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  };

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(session.status)) {
      return res.status(400).json({ error: 'Session déjà close' });
    }

    const updates = {};
    if (task !== undefined)      updates.task      = task.trim();
    if (intention !== undefined) updates.intention = JSON.stringify(Array.isArray(intention) ? intention : [intention]);
    if (expertiseLevel !== undefined) updates.expertiseLevel = clampLevel(expertiseLevel);
    if (humorLevel !== undefined)     updates.humorLevel     = clampLevel(humorLevel);
    if (questionMode !== undefined)   updates.questionMode   = isQuestionMode(questionMode) ? questionMode : null;
    // Édition du CR / livrable à la relecture, avant validation (3.3)
    if (summary !== undefined)     updates.summary     = summary;
    if (deliverable !== undefined) updates.deliverable = deliverable;

    await db('Session').where({ id: sessionId }).update(updates);
    const [updated] = await db('Session').where({ id: sessionId }).limit(1);
    return res.json({
      id: updated.id, task: updated.task, intention: updated.intention,
      expertiseLevel: updated.expertiseLevel, humorLevel: updated.humorLevel, questionMode: updated.questionMode,
      decisionBudget: decisionBudgetFor(updated, project),
      summary: updated.summary, deliverable: updated.deliverable,
    });
  } catch (err) {
    console.error('[sessions/patch]', err.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── PATCH /:sessionId/status — accepted / abandoned ───────────────────────────

router.patch('/:sessionId/status', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { status } = req.body;
  if (!['accepted', 'abandoned'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide (accepted | abandoned)' });
  }
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) {
      return res.status(400).json({ error: 'Session déjà close' });
    }
    await db('Session').where({ id: sessionId }).update({ status });

    if (status === 'accepted' && s.milestoneId && (s.summary || s.planSuggestions)) {
      await db('Milestone').where({ id: s.milestoneId }).update({ status: 'done' });
    }

    res.json({ status });
  } catch (err) {
    console.error('[sessions/:id/status PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
