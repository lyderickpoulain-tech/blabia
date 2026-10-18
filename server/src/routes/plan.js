const express    = require('express');
const { randomUUID } = require('crypto');
const db         = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { computeMilestoneStatus } = require('../utils/milestones');
const { findProject } = require('../utils/projectHelpers');
const { addWebsitePlan, addRecommendedPack } = require('../services/websiteStarter');
const { addPlanTemplate } = require('../services/planTemplates');
const { validBeforeMilestone } = require('../services/actions');

const router = express.Router();
router.use(authMiddleware);

// v5.0 phase 3.2 : decision | claude_code | stack (remplace l'ancien éventail
// synthesis/memory/timeline_steps/stack_check/milestone/meeting/technical)
const MILESTONE_TYPES = ['decision', 'claude_code', 'stack'];

// ── GET /api/projects/:id/plan — jalons + tâches ─────────────────────────────

router.get('/:id/plan', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [milestones, todos] = await Promise.all([
      db('Milestone')
        .select([
          'id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'createdAt', 'createdBy', 'agenda'
        ])
        .where({ projectId: req.params.id })
        .orderBy('displayOrder', 'asc'),

      db('TodoItem')
        .select([
          'id', 'milestoneId', 'title', 'description', 'status', 'priority',
          'dueDate', 'displayOrder', 'source', 'sessionId', 'createdAt', 'createdBy'
        ])
        .where({ projectId: req.params.id })
        .orderBy([{ column: 'milestoneId', order: 'asc', nulls: 'last' }, { column: 'displayOrder', order: 'asc' }])
    ]);

    // Sessions liées aux jalons — une par jalon (la plus récente)
    let milestoneSessions = {};
    if (milestones.length > 0) {
      const linkedSessions = await db('Session')
        .select(['id', 'milestoneId', 'status', 'mode', 'hasCode', 'codeStatus', 'task', 'summary', 'createdAt'])
        .whereIn('milestoneId', milestones.map(m => m.id))
        .orderBy('createdAt', 'desc');
      for (const s of linkedSessions) {
        if (!milestoneSessions[s.milestoneId]) milestoneSessions[s.milestoneId] = s;
      }
    }

    // Actions à mener avant chaque réunion (ouvertes) : la réunion ne se tient pas sans elles
    const blocking = milestones.length ? await db('TodoItem').whereIn('beforeMilestoneId', milestones.map(m => m.id))
      .whereIn('status', ['todo', 'in_progress']).orderBy('displayOrder', 'asc').select('id', 'title', 'beforeMilestoneId') : [];
    for (const m of milestones) m.blockingActions = blocking.filter(b => b.beforeMilestoneId === m.id).map(({ id, title }) => ({ id, title }));

    res.json({ milestones, todos, milestoneSessions, devDirectory: project.devDirectory || null });
  } catch (err) {
    console.error('[plan GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// JALONS (Milestone)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/projects/:id/milestones
router.post('/:id/milestones', async (req, res) => {
  const { title, description, dueDate, displayOrder, type, afterMilestoneId, appendToMilestoneId } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    // v5.1 (test « Gérard ») : travail à ajouter à une réunion DÉJÀ prévue (pas de doublon au plan)
    if (appendToMilestoneId) {
      const [target] = await db('Milestone').where({ id: String(appendToMilestoneId), projectId: req.params.id }).whereNot('status', 'done').limit(1);
      if (target) {
        const addition = description?.trim() || title.trim();
        const [updated] = await db('Milestone').where({ id: target.id })
          .update({ description: [target.description, addition].filter(Boolean).join('\n\n') })
          .returning(['id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'createdAt', 'createdBy']);
        return res.status(200).json({ ...updated, appended: true });
      }
    }

    // Calculer le displayOrder si non fourni ; « juste après » une réunion du plan (v5.1)
    let order = displayOrder;
    if ((order === undefined || order === null) && afterMilestoneId) {
      const [after] = await db('Milestone').where({ id: String(afterMilestoneId), projectId: req.params.id }).select('displayOrder').limit(1);
      if (after) {
        order = after.displayOrder + 1;
        await db('Milestone').where({ projectId: req.params.id }).where('displayOrder', '>=', order).increment('displayOrder', 1);
      }
    }
    if (order === undefined || order === null) {
      const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId: req.params.id });
      order = (maxOrder ?? -1) + 1;
    }

    const [milestone] = await db('Milestone')
      .insert({
        id:          randomUUID(),
        projectId:   req.params.id,
        title:       title.trim(),
        description: description?.trim() || null,
        dueDate:     dueDate || null,
        status:      'pending',
        type:        MILESTONE_TYPES.includes(type) ? type : 'decision',
        displayOrder: order,
        createdAt:   new Date(),
        createdBy:   req.user.id
      })
      .returning(['id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'createdAt', 'createdBy']);

    res.status(201).json(milestone);
  } catch (err) {
    console.error('[milestones POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/milestones/reorder  ← AVANT /:mid pour éviter le conflit
router.patch('/:id/milestones/reorder', async (req, res) => {
  const { order } = req.body; // [milestoneId, ...]
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order (tableau) requis' });
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    await Promise.all(
      order.map((milestoneId, i) =>
        db('Milestone').where({ id: milestoneId, projectId: req.params.id }).update({ displayOrder: i })
      )
    );
    res.json({ message: 'Ordre mis à jour' });
  } catch (err) {
    console.error('[milestones/reorder PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/milestones/:mid
router.patch('/:id/milestones/:mid', async (req, res) => {
  const { title, description, dueDate, status, type, displayOrder } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [existing] = await db('Milestone').where({ id: req.params.mid, projectId: req.params.id }).limit(1);
    if (!existing) return res.status(404).json({ error: 'Jalon introuvable' });

    const updates = {};
    if (title?.trim()        !== undefined) updates.title        = title.trim();
    if (description          !== undefined) updates.description  = description?.trim() || null;
    if (dueDate              !== undefined) updates.dueDate      = dueDate || null;
    if (status               !== undefined) updates.status       = status;
    if (type                 !== undefined) updates.type         = MILESTONE_TYPES.includes(type) ? type : 'decision';
    if (displayOrder         !== undefined) updates.displayOrder = displayOrder;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification' });

    const [updated] = await db('Milestone')
      .where({ id: req.params.mid })
      .update(updates)
      .returning(['id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'createdAt', 'createdBy']);

    res.json(updated);
  } catch (err) {
    console.error('[milestones/:mid PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id/milestones/:mid — jalon unique (breadcrumb, panel)
router.get('/:id/milestones/:mid', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [milestone] = await db('Milestone')
      .select(['id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'agenda'])
      .where({ id: req.params.mid, projectId: req.params.id })
      .limit(1);
    if (!milestone) return res.status(404).json({ error: 'Jalon introuvable' });

    res.json({
      ...milestone,
      // Actions à mener avant cette réunion, encore ouvertes (elle ne peut pas se tenir)
      blockingActions: await require('../services/actions').blockingActions(milestone.id, req.params.id),
    });
  } catch (err) {
    console.error('[milestones/:mid GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/milestones/:mid
router.delete('/:id/milestones/:mid', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  const { id: projectId, mid: milestoneId } = req.params;
  console.log('[milestones DELETE] projectId:', projectId, 'milestoneId:', milestoneId, 'userId:', req.user.id);
  try {
    const project = await findProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [deleted] = await db('Milestone')
      .where({ id: milestoneId, projectId })
      .delete()
      .returning(['id']);
    if (!deleted) return res.status(404).json({ error: 'Jalon introuvable' });

    res.json({ message: 'Jalon supprimé' });
  } catch (err) {
    console.error('[milestones/:mid DELETE] ERREUR:', err.message, '| code:', err.code, '| detail:', err.detail);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TÂCHES (TodoItem)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/projects/:id/todos
router.post('/:id/todos', async (req, res) => {
  const { title, description, milestoneId, priority = 'medium', dueDate, source = 'manual', sessionId, beforeMilestoneId } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    // Calculer le displayOrder dans le groupe (même milestoneId)
    const [{ maxOrder }] = await db('TodoItem')
      .max('displayOrder as maxOrder')
      .where({ projectId: req.params.id })
      .where(function () {
        if (milestoneId) this.where({ milestoneId });
        else this.whereNull('milestoneId');
      });

    const before = await validBeforeMilestone(req.params.id, beforeMilestoneId);
    if (before === undefined) return res.status(400).json({ error: 'Réunion inconnue ou déjà tenue.' });
    const [todo] = await db('TodoItem')
      .insert({
        id:          randomUUID(),
        projectId:   req.params.id,
        milestoneId: milestoneId || null,
        beforeMilestoneId: before,
        title:       title.trim(),
        description: description?.trim() || null,
        status:      'todo',
        priority,
        dueDate:     dueDate || null,
        displayOrder: (maxOrder ?? -1) + 1,
        source,
        sessionId:   sessionId || null,
        createdAt:   new Date(),
        createdBy:   req.user.id
      })
      .returning([
        'id', 'milestoneId', 'title', 'description', 'status', 'priority',
        'dueDate', 'displayOrder', 'source', 'sessionId', 'createdAt', 'createdBy', 'beforeMilestoneId'
      ]);

    // Auto-statut du jalon si la tâche lui est rattachée
    if (milestoneId) {
      try {
        const autoStatus = await computeMilestoneStatus(milestoneId);
        if (autoStatus) await db('Milestone').where({ id: milestoneId }).update({ status: autoStatus });
      } catch (err) { console.error('[plan] recalcul du statut de la réunion :', err.message); }
    }

    res.status(201).json(todo);
  } catch (err) {
    console.error('[todos POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/todos/reorder  ← AVANT /:tid
router.patch('/:id/todos/reorder', async (req, res) => {
  const { order } = req.body; // [todoId, ...]
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order (tableau) requis' });
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    await Promise.all(
      order.map((todoId, i) =>
        db('TodoItem').where({ id: todoId, projectId: req.params.id }).update({ displayOrder: i })
      )
    );
    res.json({ message: 'Ordre mis à jour' });
  } catch (err) {
    console.error('[todos/reorder PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/todos/:tid
router.patch('/:id/todos/:tid', async (req, res) => {
  const { title, description, status, priority, dueDate, milestoneId, displayOrder, beforeMilestoneId } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [existing] = await db('TodoItem').where({ id: req.params.tid, projectId: req.params.id }).limit(1);
    if (!existing) return res.status(404).json({ error: 'Tâche introuvable' });

    const updates = {};
    if (title?.trim()    !== undefined) updates.title        = title.trim();
    if (description      !== undefined) updates.description  = description?.trim() || null;
    if (status           !== undefined) updates.status       = status;
    if (priority         !== undefined) updates.priority     = priority;
    if (dueDate          !== undefined) updates.dueDate      = dueDate || null;
    if (milestoneId      !== undefined) updates.milestoneId  = milestoneId || null;
    if (displayOrder     !== undefined) updates.displayOrder = displayOrder;
    if (beforeMilestoneId !== undefined) {
      const before = await validBeforeMilestone(req.params.id, beforeMilestoneId);
      if (before === undefined) return res.status(400).json({ error: 'Réunion inconnue ou déjà tenue.' });
      updates.beforeMilestoneId = before;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification' });

    const [updated] = await db('TodoItem')
      .where({ id: req.params.tid })
      .update(updates)
      .returning([
        'id', 'milestoneId', 'title', 'description', 'status', 'priority',
        'dueDate', 'displayOrder', 'source', 'sessionId', 'createdAt', 'createdBy', 'beforeMilestoneId'
      ]);

    // Auto-calcul du statut du jalon si le statut de la tâche a changé
    const affectedMilestoneId = updated.milestoneId || existing.milestoneId;
    if (updates.status !== undefined && affectedMilestoneId) {
      try {
        const autoStatus = await computeMilestoneStatus(affectedMilestoneId);
        if (autoStatus) await db('Milestone').where({ id: affectedMilestoneId }).update({ status: autoStatus });
      } catch (err) { console.error('[plan] recalcul du statut de la réunion :', err.message); }
    }
    // Si la tâche a changé de jalon, recalculer aussi l'ancien jalon
    if (updates.milestoneId !== undefined && existing.milestoneId && existing.milestoneId !== updates.milestoneId) {
      try {
        const oldStatus = await computeMilestoneStatus(existing.milestoneId);
        if (oldStatus) await db('Milestone').where({ id: existing.milestoneId }).update({ status: oldStatus });
      } catch (err) { console.error('[plan] recalcul du statut de la réunion :', err.message); }
    }

    res.json(updated);
  } catch (err) {
    console.error('[todos/:tid PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/todos/:tid
router.delete('/:id/todos/:tid', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [existing] = await db('TodoItem').where({ id: req.params.tid, projectId: req.params.id }).limit(1);
    if (!existing) return res.status(404).json({ error: 'Tâche introuvable' });

    await db('TodoItem').where({ id: req.params.tid }).delete();

    // Recalculer le statut du jalon après suppression
    if (existing.milestoneId) {
      try {
        const autoStatus = await computeMilestoneStatus(existing.milestoneId);
        if (autoStatus !== null) await db('Milestone').where({ id: existing.milestoneId }).update({ status: autoStatus });
      } catch (err) { console.error('[plan] recalcul du statut de la réunion :', err.message); }
    }

    res.json({ message: 'Tâche supprimée' });
  } catch (err) {
    console.error('[todos/:tid DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/projects/:id/plan/website — plan type d'un site web à créer de zéro ──
// (décisions → outils → construction ; services/websiteStarter.js). Propriétaire seulement.
router.post('/:id/plan/website', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, false);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.userId !== req.user.id) return res.status(403).json({ error: 'Action réservée au propriétaire' });
    const created = await addWebsitePlan(project.id, req.user.id);
    // v5.1 (F4) : « J'ai déjà mes outils » → pas de pack BlabIA, ses outils habituels servent
    const pack = req.body?.pack === false ? [] : await addRecommendedPack(project);
    res.status(201).json({ created, pack });
  } catch (err) {
    console.error('[plan/website POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/projects/:id/plan/template { kind, express } — plan type hors technique (v5.1, F4)
router.post('/:id/plan/template', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, false);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.userId !== req.user.id) return res.status(403).json({ error: 'Action réservée au propriétaire' });
    const created = await addPlanTemplate(project.id, req.user.id, { kind: String(req.body?.kind || ''), express: req.body?.express === true });
    res.status(201).json({ created });
  } catch (err) {
    console.error('[plan/template POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/projects/:id/plan/bulk — lot de jalons+todos depuis suggestion session ──

router.post('/:id/plan/bulk', async (req, res) => {
  const { milestones = [], standalone_todos = [], sessionId, sourceSessionId } = req.body;
  console.log('[plan/bulk] reçu — projectId:', req.params.id, '| milestones:', milestones.length, JSON.stringify(milestones.map(m => m.title)));
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    // Base displayOrder pour les nouveaux jalons
    const [{ maxMO }] = await db('Milestone').max('displayOrder as maxMO').where({ projectId: req.params.id });
    let milestoneOrder = (maxMO ?? -1) + 1;

    let milestonesCreated = 0;
    let todosCreated = 0;

    // Charger les titres existants pour déduplication (LOWER+TRIM)
    const existingMilestones = await db('Milestone')
      .select('id', 'title')
      .where({ projectId: req.params.id });
    const existingTitlesMap = {};
    for (const em of existingMilestones) {
      existingTitlesMap[em.title.toLowerCase().trim()] = em.id;
    }

    for (const mData of milestones) {
      if (!mData.title?.trim()) continue;
      const titleKey = mData.title.trim().toLowerCase();
      let milestoneId;

      // Déduplication : si un jalon avec ce titre existe déjà, mettre à jour la description
      if (existingTitlesMap[titleKey]) {
        milestoneId = existingTitlesMap[titleKey];
        if (mData.description?.trim()) {
          await db('Milestone').where({ id: milestoneId })
            .update({ description: mData.description.trim() });
        }
      } else {
        const [milestone] = await db('Milestone')
          .insert({
            id: randomUUID(), projectId: req.params.id,
            title: mData.title.trim(), description: mData.description?.trim() || null,
            status: 'pending',
            type: MILESTONE_TYPES.includes(mData.type) ? mData.type : 'decision',
            displayOrder: milestoneOrder++,
            createdFromSessionId: sourceSessionId || null,
            createdAt: new Date(), createdBy: req.user.id
          })
          .returning(['id']);
        milestoneId = milestone.id;
        milestonesCreated++;
        existingTitlesMap[titleKey] = milestoneId;
      }

      const milestone = { id: milestoneId };

      const mTodos = Array.isArray(mData.todos) ? mData.todos : [];
      for (let i = 0; i < mTodos.length; i++) {
        const t = mTodos[i];
        if (!t.title?.trim()) continue;
        await db('TodoItem').insert({
          id: randomUUID(), projectId: req.params.id,
          milestoneId: milestone.id, title: t.title.trim(),
          priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
          status: 'todo', displayOrder: i, source: 'session',
          sessionId: sessionId || null, createdAt: new Date(), createdBy: req.user.id
        });
        todosCreated++;
      }
    }

    // Tâches autonomes (sans jalon)
    const [{ maxTO }] = await db('TodoItem').max('displayOrder as maxTO')
      .where({ projectId: req.params.id }).whereNull('milestoneId');
    let todoOrder = (maxTO ?? -1) + 1;

    for (const t of standalone_todos) {
      if (!t.title?.trim()) continue;
      await db('TodoItem').insert({
        id: randomUUID(), projectId: req.params.id,
        milestoneId: null, title: t.title.trim(),
        priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
        status: 'todo', displayOrder: todoOrder++, source: 'session',
        sessionId: sessionId || null, createdAt: new Date(), createdBy: req.user.id
      });
      todosCreated++;
    }

    res.status(201).json({ milestones: milestonesCreated, todos: todosCreated });
  } catch (err) {
    console.error('[plan/bulk POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
