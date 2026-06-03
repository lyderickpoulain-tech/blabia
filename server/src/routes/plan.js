const express    = require('express');
const { randomUUID } = require('crypto');
const db         = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { computeMilestoneStatus } = require('../utils/milestones');

const router = express.Router();
router.use(authMiddleware);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function findProject(id, userId, isAdmin) {
  const query = db('Project').where('Project.id', id);
  if (!isAdmin) {
    query.where(function () {
      this.where('Project.userId', userId)
        .orWhereExists(
          db.select(db.raw('1')).from('ProjectMember')
            .where('ProjectMember.projectId', id)
            .where('ProjectMember.userId', userId)
        );
    });
  }
  const [project] = await query.limit(1);
  return project;
}

// ── GET /api/projects/:id/plan — jalons + tâches ─────────────────────────────

router.get('/:id/plan', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [milestones, todos] = await Promise.all([
      db('Milestone')
        .select([
          'id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'createdAt', 'createdBy'
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
        .select(['id', 'milestoneId', 'status', 'hasCode', 'codeStatus', 'task', 'summary'])
        .whereIn('milestoneId', milestones.map(m => m.id))
        .orderBy('createdAt', 'desc');
      for (const s of linkedSessions) {
        if (!milestoneSessions[s.milestoneId]) milestoneSessions[s.milestoneId] = s;
      }
    }

    res.json({ milestones, todos, milestoneSessions });
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
  const { title, description, dueDate, displayOrder, type } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' });
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    // Calculer le displayOrder si non fourni
    let order = displayOrder;
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
        type:        ['meeting', 'technical', 'stack_check', 'milestone'].includes(type) ? type : 'meeting',
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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
    if (type                 !== undefined) updates.type         = ['meeting', 'technical', 'stack_check', 'milestone'].includes(type) ? type : 'meeting';
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
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [milestone] = await db('Milestone')
      .select(['id', 'title', 'description', 'dueDate', 'status', 'type', 'displayOrder', 'checklistData'])
      .where({ id: req.params.mid, projectId: req.params.id })
      .limit(1);
    if (!milestone) return res.status(404).json({ error: 'Jalon introuvable' });
    res.json(milestone);
  } catch (err) {
    console.error('[milestones/:mid GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/milestones/:mid/checklist — mise à jour de la checklist stack_check
router.patch('/:id/milestones/:mid/checklist', async (req, res) => {
  const { items, finalStatus } = req.body;
  const isAdmin = req.user.role === 'admin';
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items (tableau) requis' });

  const VALID_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [milestone] = await db('Milestone').where({ id: req.params.mid, projectId: req.params.id }).limit(1);
    if (!milestone) return res.status(404).json({ error: 'Jalon introuvable' });

    // Calcul automatique du statut sauf si forcé
    let newStatus;
    if (finalStatus && VALID_STATUSES.includes(finalStatus)) {
      newStatus = finalStatus;
    } else {
      const checkedCount = items.filter(i => i.checked).length;
      if (checkedCount === items.length && items.length > 0) newStatus = 'done';
      else if (checkedCount > 0) newStatus = 'in_progress';
      else newStatus = 'pending';
    }

    const [updated] = await db('Milestone')
      .where({ id: req.params.mid })
      .update({ checklistData: JSON.stringify({ items }), status: newStatus })
      .returning(['id', 'title', 'status', 'type', 'checklistData']);

    res.json(updated);
  } catch (err) {
    console.error('[milestones/:mid/checklist PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/milestones/:mid
router.delete('/:id/milestones/:mid', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const deleted = await db('Milestone')
      .where({ id: req.params.mid, projectId: req.params.id })
      .delete();
    if (!deleted) return res.status(404).json({ error: 'Jalon introuvable' });

    res.json({ message: 'Jalon supprimé' });
  } catch (err) {
    console.error('[milestones/:mid DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TÂCHES (TodoItem)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/projects/:id/todos
router.post('/:id/todos', async (req, res) => {
  const { title, description, milestoneId, priority = 'medium', dueDate, source = 'manual', sessionId } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' });
  const isAdmin = req.user.role === 'admin';
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

    const [todo] = await db('TodoItem')
      .insert({
        id:          randomUUID(),
        projectId:   req.params.id,
        milestoneId: milestoneId || null,
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
        'dueDate', 'displayOrder', 'source', 'sessionId', 'createdAt', 'createdBy'
      ]);

    // Auto-statut du jalon si la tâche lui est rattachée
    if (milestoneId) {
      try {
        const autoStatus = await computeMilestoneStatus(milestoneId);
        if (autoStatus) await db('Milestone').where({ id: milestoneId }).update({ status: autoStatus });
      } catch {}
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
  const isAdmin = req.user.role === 'admin';
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
  const { title, description, status, priority, dueDate, milestoneId, displayOrder } = req.body;
  const isAdmin = req.user.role === 'admin';
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

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification' });

    const [updated] = await db('TodoItem')
      .where({ id: req.params.tid })
      .update(updates)
      .returning([
        'id', 'milestoneId', 'title', 'description', 'status', 'priority',
        'dueDate', 'displayOrder', 'source', 'sessionId', 'createdAt', 'createdBy'
      ]);

    // Auto-calcul du statut du jalon si le statut de la tâche a changé
    const affectedMilestoneId = updated.milestoneId || existing.milestoneId;
    if (updates.status !== undefined && affectedMilestoneId) {
      try {
        const autoStatus = await computeMilestoneStatus(affectedMilestoneId);
        if (autoStatus) await db('Milestone').where({ id: affectedMilestoneId }).update({ status: autoStatus });
      } catch {}
    }
    // Si la tâche a changé de jalon, recalculer aussi l'ancien jalon
    if (updates.milestoneId !== undefined && existing.milestoneId && existing.milestoneId !== updates.milestoneId) {
      try {
        const oldStatus = await computeMilestoneStatus(existing.milestoneId);
        if (oldStatus) await db('Milestone').where({ id: existing.milestoneId }).update({ status: oldStatus });
      } catch {}
    }

    res.json(updated);
  } catch (err) {
    console.error('[todos/:tid PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/todos/:tid
router.delete('/:id/todos/:tid', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
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
      } catch {}
    }

    res.json({ message: 'Tâche supprimée' });
  } catch (err) {
    console.error('[todos/:tid DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /api/projects/:id/plan/bulk — lot de jalons+todos depuis suggestion session ──

router.post('/:id/plan/bulk', async (req, res) => {
  const { milestones = [], standalone_todos = [], sessionId, sourceSessionId } = req.body;
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    // Base displayOrder pour les nouveaux jalons
    const [{ maxMO }] = await db('Milestone').max('displayOrder as maxMO').where({ projectId: req.params.id });
    let milestoneOrder = (maxMO ?? -1) + 1;

    let milestonesCreated = 0;
    let todosCreated = 0;

    for (const mData of milestones) {
      if (!mData.title?.trim()) continue;
      const VALID_TYPES = ['meeting', 'technical', 'stack_check', 'milestone'];
      const [milestone] = await db('Milestone')
        .insert({
          id: randomUUID(), projectId: req.params.id,
          title: mData.title.trim(), description: mData.description?.trim() || null,
          status: 'pending',
          type: VALID_TYPES.includes(mData.type) ? mData.type : 'meeting',
          displayOrder: milestoneOrder++,
          createdFromSessionId: sourceSessionId || null,
          createdAt: new Date(), createdBy: req.user.id
        })
        .returning(['id']);
      milestonesCreated++;

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
