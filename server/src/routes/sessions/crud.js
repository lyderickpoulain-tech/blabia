const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { MODEL } = require('./helpers');
const { isMeetingModel } = require('../../services/models');
const { isQuestionMode, decisionBudgetFor } = require('../../services/questionModes');
const { parseJsonField } = require('../../utils/parseJsonField');
const { withoutSession } = require('../../utils/projectMemory');

const router = express.Router({ mergeParams: true });

// ── POST / — Création d'une réunion (v3.0, agents sélectionnés en amont) ──────

router.post('/', async (req, res) => {
  const {
    task,
    milestoneId = null,
    todoId: todoIdParam = null, // réunion ouverte depuis une action (« Traiter en réunion »)
    model: modelParam,
    fullContext: fullContextParam = false,
    intention = [],
    activeAgents: activeAgentsParam = null,
    webSearchEnabled: webSearchEnabledParam = false,
    expertiseLevel: expertiseLevelParam,
    humorLevel: humorLevelParam,
    questionMode: questionModeParam,
    challengerEnabled: challengerParam,
  } = req.body;
  const { projectId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const selectedModel = isMeetingModel(modelParam) ? modelParam : MODEL;
  // Action d'origine : seulement une action ouverte de ce projet
  const todoId = todoIdParam && (await db('TodoItem').where({ id: String(todoIdParam), projectId: req.params.projectId })
    .whereIn('status', ['todo', 'in_progress']).first('id'))?.id || null;
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
        // agents / exchanges (DEPRECATED) : plus écrits, valeur par défaut '[]' en base
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
        // Contradicteur : false = désactivé pour cette réunion, sinon hérite du projet
        challengerEnabled: challengerParam === false ? false : null,
        projectId,
        milestoneId: milestoneId || null,
        todoId: todoId || null,
        createdAt: now
      })
      .returning(['id', 'task', 'status', 'mode', 'model', 'createdAt', 'projectId', 'milestoneId', 'webSearchEnabled', 'expertiseLevel', 'humorLevel', 'questionMode']);
    await db('Project').where({ id: projectId }).update({ updatedAt: now });
    if (milestoneId) {
      try { await db('Milestone').where({ id: milestoneId, projectId }).update({ status: 'in_progress' }); } catch (err) { console.error('[sessions] statut de la réunion du plan :', err.message); }
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
      agents:          undefined, // DEPRECATED, plus renvoyé (activeAgents)
      exchanges:       undefined, // DEPRECATED, plus renvoyé (messages)
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

// Supprimer une réunion = l'effacer aussi de ce que les agents retiennent : son compte rendu
// dans la mémoire du projet, les décisions qu'elle a inscrites au registre, les actions
// qu'elle a créées. Restent : développements lancés (historique), rapports de mission,
// coût de l'IA. Réservé au propriétaire (ou administrateur). Refusé si son développement
// est en cours. GET …/deletion : ce qui partira, pour la confirmation.
async function deletionScope(projectId, sessionId) {
  const [decisions, actions, activeDev] = await Promise.all([
    db('Decision').where({ projectId, sessionId }).count('* as n').first(),
    db('TodoItem').where({ projectId, sessionId }).whereNull('milestoneId').count('* as n').first(),
    db('DevTask').where({ projectId, sessionId }).whereIn('status', ['running', 'deploying']).first('id'),
  ]);
  return { decisions: Number(decisions.n), actions: Number(actions.n), devRunning: !!activeDev };
}

async function loadForDeletion(req, res) {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  const project = await getProject(projectId, req.user.id, isAdmin);
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return {}; }
  if (project.userId !== req.user.id && !isAdmin) { res.status(403).json({ error: 'Seul le propriétaire du projet peut supprimer une réunion.' }); return {}; }
  const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
  if (!session) { res.status(404).json({ error: 'Réunion introuvable' }); return {}; }
  return { project, session };
}

router.get('/:sessionId/deletion', async (req, res) => {
  try {
    const { session } = await loadForDeletion(req, res);
    if (!session) return;
    res.json(await deletionScope(req.params.projectId, session.id));
  } catch (err) {
    console.error('[sessions/:id/deletion GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  try {
    const { project, session } = await loadForDeletion(req, res);
    if (!session) return;
    const scope = await deletionScope(projectId, sessionId);
    if (scope.devRunning) return res.status(409).json({ error: 'Le développement de cette réunion est en cours : attendez qu’il se termine.' });

    let alreadyConsolidated = false; // compte rendu déjà fondu dans la synthèse du projet
    await db.transaction(async trx => {
      await trx('Decision').where({ projectId, sessionId }).delete();
      await trx('TodoItem').where({ projectId, sessionId }).whereNull('milestoneId').delete();
      const [p] = await trx('Project').where({ id: projectId }).select('context').forUpdate();
      const context = withoutSession(p?.context, sessionId);
      if (context !== null) await trx('Project').where({ id: projectId }).update({ context, updatedAt: new Date() });
      else alreadyConsolidated = session.status === 'accepted';
      await trx('Session').where({ parentSessionId: sessionId }).update({ parentSessionId: null });
      await trx('Session').where({ id: sessionId }).delete();
      // Étape du plan traitée par cette réunion seule : de nouveau « à tenir »
      if (session.milestoneId && !(await trx('Session').where({ milestoneId: session.milestoneId }).first('id'))) {
        await trx('Milestone').where({ id: session.milestoneId, projectId }).update({ status: 'pending' });
      }
    });
    if (alreadyConsolidated) {
      const label = `${session.task} (${new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })})`;
      setImmediate(() => require('../../services/memory').forgetInSummary(projectId, label).catch(err => console.error('[sessions DELETE] synthèse :', err.message)));
    }
    res.json({ deleted: true, ...scope, project: project.id });
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
    if (deliverable !== undefined) {
      updates.deliverable = deliverable;
      updates.requiredTools = null; // prompt modifié : outils dont dépend le développement à repérer de nouveau (services/devTools.js)
    }

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
    // Réunion ouverte depuis une action : l'action est traitée quand la réunion est conclue
    if (status === 'accepted' && s.todoId) {
      await db('TodoItem').where({ id: s.todoId, projectId }).whereIn('status', ['todo', 'in_progress']).update({ status: 'done' });
    }

    res.json({ status });
  } catch (err) {
    console.error('[sessions/:id/status PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
