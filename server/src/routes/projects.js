const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { sendInvitation } = require('../services/email');
const anthropic = require('../services/anthropic');

const router = express.Router();
router.use(authMiddleware);

const PROJECT_FIELDS = [
  'id', 'name', 'description', 'brief', 'devDirectory', 'status', 'context', 'techStack', 'hasTechnicalStack', 'createdAt', 'updatedAt', 'userId'
];

// Trouve un projet accessible : propriétaire OU membre OU admin
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

// Vérifie que l'utilisateur est propriétaire ou admin (pas collaborateur)
function isOwnerOrAdmin(project, userId, isAdmin) {
  return isAdmin || project.userId === userId;
}

// GET /api/projects
router.get('/', async (req, res) => {
  const userRole = req.user.role;
  const isPrivileged = userRole === 'admin' || userRole === 'supervisor';
  try {
    let query = db('Project')
      .select(
        'Project.id',
        'Project.name',
        'Project.description',
        'Project.status',
        'Project.createdAt',
        'Project.updatedAt',
        'Project.userId',
        db.raw('COUNT(DISTINCT "Session"."id")::int AS "sessionCount"'),
        db.raw(`(SELECT COUNT(*)::int FROM "Session" WHERE "projectId" = "Project"."id" AND status = 'open') AS "openSessionCount"`),
        db.raw(`(SELECT COUNT(*)::int FROM "TodoItem" WHERE "projectId" = "Project"."id" AND status != 'cancelled') AS "todoTotal"`),
        db.raw(`(SELECT COUNT(*)::int FROM "TodoItem" WHERE "projectId" = "Project"."id" AND status = 'done') AS "todoDone"`),
        db.raw(`(SELECT COUNT(*)::int FROM "TodoItem" WHERE "projectId" = "Project"."id" AND status = 'in_progress') AS "todoInProgress"`)
      )
      .leftJoin('Session', 'Session.projectId', 'Project.id')
      .groupBy('Project.id')
      .orderBy('Project.updatedAt', 'desc');

    if (!isPrivileged) {
      if (userRole === 'user') {
        // Les 'user' voient uniquement les projets où ils sont membres explicites
        query.whereExists(
          db.select(db.raw('1')).from('ProjectMember')
            .where('ProjectMember.userId', req.user.id)
            .whereRaw('"ProjectMember"."projectId" = "Project"."id"')
        );
      } else {
        // member et autres : projets dont l'utilisateur est propriétaire OU membre
        query.where(function () {
          this.where('Project.userId', req.user.id)
            .orWhereExists(
              db.select(db.raw('1')).from('ProjectMember')
                .where('ProjectMember.userId', req.user.id)
                .whereRaw('"ProjectMember"."projectId" = "Project"."id"')
            );
        });
      }
    }

    const projects = await query;
    res.json(projects);
  } catch (err) {
    console.error('[projects GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects
router.post('/', async (req, res) => {
  if (req.user.role === 'user') {
    return res.status(403).json({ error: 'Votre compte ne permet pas de créer des projets' });
  }
  const { name, description, objectif, contexte, notes, hasTechnicalStack } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Le nom du projet est requis' });
  }

  const briefParts = [];
  if (objectif?.trim()) briefParts.push(`OBJECTIF : ${objectif.trim()}`);
  if (contexte?.trim()) briefParts.push(`CONTEXTE : ${contexte.trim()}`);
  if (notes?.trim())    briefParts.push(`NOTES : ${notes.trim()}`);
  const brief = briefParts.length > 0 ? briefParts.join('\n\n') : null;

  const now = new Date();
  try {
    const [project] = await db('Project')
      .insert({
        id: randomUUID(),
        name: name.trim(),
        description: description?.trim() || null,
        brief,
        status: 'active',
        hasTechnicalStack: hasTechnicalStack === true,
        userId: req.user.id,
        createdAt: now,
        updatedAt: now
      })
      .returning(PROJECT_FIELDS);

    // ── Auto-initialiser ProjectAgent avec tous les agents par défaut ──────
    const defaultAgents = await db('Agent')
      .select(['id'])
      .where({ isDefault: true })
      .orderBy('createdAt', 'asc');

    if (defaultAgents.length > 0) {
      await db('ProjectAgent').insert(
        defaultAgents.map((a, i) => ({
          id: randomUUID(),
          projectId: project.id,
          agentId: a.id,
          enabled: true,
          displayOrder: i,
          source: 'manual'
        }))
      );
    }

    res.status(201).json({ ...project, sessionCount: 0 });
  } catch (err) {
    console.error('[projects POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [{ count }] = await db('Session')
      .count('id as count')
      .where({ projectId: req.params.id });

    res.json({ ...project, sessionCount: parseInt(count) });
  } catch (err) {
    console.error('[projects/:id GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id/stats — tokens cumulés et coût estimé
router.get('/:id/stats', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const result = await db.raw(`
      SELECT
        COUNT(*)::int AS "sessionCount",
        COALESCE(SUM(CAST("tokensUsed"->>'input'  AS BIGINT)), 0)::bigint AS "totalInput",
        COALESCE(SUM(CAST("tokensUsed"->>'output' AS BIGINT)), 0)::bigint AS "totalOutput",
        COALESCE(SUM(CAST("tokensUsed"->>'total'  AS BIGINT)), 0)::bigint AS "totalTokens"
      FROM "Session"
      WHERE "projectId" = ? AND "tokensUsed" IS NOT NULL AND "tokensUsed" != '{}'::jsonb
    `, [req.params.id]);

    const row         = result.rows[0];
    const totalInput  = parseInt(row.totalInput)  || 0;
    const totalOutput = parseInt(row.totalOutput) || 0;
    const estimatedCost = (totalInput * 3 + totalOutput * 15) / 1_000_000;

    res.json({
      sessionCount:   parseInt(row.sessionCount) || 0,
      totalTokens:    parseInt(row.totalTokens)  || 0,
      totalInput,
      totalOutput,
      estimatedCost,
    });
  } catch (err) {
    console.error('[projects/:id/stats GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id — mettre à jour les champs du projet (propriétaire ou admin)
router.patch('/:id', async (req, res) => {
  const { name, description, devDirectory, hasTechnicalStack } = req.body;
  if (name !== undefined && !name?.trim()) {
    return res.status(400).json({ error: 'Le nom du projet est requis' });
  }
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }

    const updates = { updatedAt: new Date() };
    if (name !== undefined)             updates.name               = name.trim();
    if (description !== undefined)      updates.description        = description?.trim() || null;
    if (devDirectory !== undefined)     updates.devDirectory       = devDirectory?.trim() || null;
    if (hasTechnicalStack !== undefined) updates.hasTechnicalStack = Boolean(hasTechnicalStack);

    const [updated] = await db('Project')
      .where({ id: req.params.id })
      .update(updates)
      .returning(PROJECT_FIELDS);
    res.json(updated);
  } catch (err) {
    console.error('[projects/:id PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/brief — mettre à jour le brief structuré (propriétaire ou admin)
router.patch('/:id/brief', async (req, res) => {
  const { objectif, contexte, notes } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }

    const briefParts = [];
    if (objectif?.trim()) briefParts.push(`OBJECTIF : ${objectif.trim()}`);
    if (contexte?.trim()) briefParts.push(`CONTEXTE : ${contexte.trim()}`);
    if (notes?.trim())    briefParts.push(`NOTES : ${notes.trim()}`);
    const brief = briefParts.length > 0 ? briefParts.join('\n\n') : null;

    const [updated] = await db('Project')
      .where({ id: req.params.id })
      .update({ brief, updatedAt: new Date() })
      .returning(PROJECT_FIELDS);
    res.json(updated);
  } catch (err) {
    console.error('[projects/:id/brief PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/archive — basculer active ↔ archived (propriétaire ou admin)
router.patch('/:id/archive', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }

    const newStatus = project.status === 'active' ? 'archived' : 'active';
    const [updated] = await db('Project')
      .where({ id: req.params.id })
      .update({ status: newStatus, updatedAt: new Date() })
      .returning(PROJECT_FIELDS);
    res.json(updated);
  } catch (err) {
    console.error('[projects/:id/archive PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id — suppression définitive (propriétaire ou admin uniquement)
router.delete('/:id', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Seul le propriétaire peut supprimer ce projet' });
    }

    await db('Session').where({ projectId: req.params.id }).update({ parentSessionId: null });
    await db('Session').where({ projectId: req.params.id }).delete();
    await db('Project').where({ id: req.params.id }).delete();

    res.json({ message: 'Projet supprimé' });
  } catch (err) {
    console.error('[projects/:id DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/tech-stack — sauvegarder la stack technique du projet
router.patch('/:id/tech-stack', async (req, res) => {
  const { techStack } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    await db('Project').where({ id: req.params.id }).update({
      techStack: techStack !== undefined ? JSON.stringify(techStack) : null,
      updatedAt: new Date()
    });
    res.json({ message: 'Stack sauvegardée' });
  } catch (err) {
    console.error('[projects/:id/tech-stack PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/context — ajouter un souvenir à la mémoire projet
router.patch('/:id/context', async (req, res) => {
  const { memory, sessionTitle } = req.body;
  if (!memory?.trim()) return res.status(400).json({ error: 'Souvenir requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const entry = `[${date}${sessionTitle ? ` — ${sessionTitle}` : ''}]\n${memory.trim()}`;
    const current = project.context || '';
    const separator = current ? '\n---\n' : '';
    let newContext = current + separator + entry;
    const MAX_CHARS = 10000;
    if (newContext.length > MAX_CHARS) {
      const parts = newContext.split('\n---\n');
      while (parts.length > 1 && parts.join('\n---\n').length > MAX_CHARS) parts.shift();
      newContext = parts.join('\n---\n');
    }
    await db('Project').where({ id: req.params.id }).update({ context: newContext, updatedAt: new Date() });
    res.json({ message: 'Souvenir ajouté' });
  } catch (err) {
    console.error('[projects/:id/context PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/context — réinitialiser la mémoire (admin uniquement)
router.delete('/:id/context', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Action réservée aux administrateurs' });
  }
  try {
    const project = await findProject(req.params.id, req.user.id, true);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    await db('Project').where({ id: req.params.id }).update({ context: null, updatedAt: new Date() });
    res.json({ message: 'Mémoire réinitialisée' });
  } catch (err) {
    console.error('[projects/:id/context DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/memory — réinitialisation complète (contexte + sessions + jalons)
router.delete('/:id/memory', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire ou à un administrateur' });
    }

    // Effacer project.context
    await db('Project').where({ id: req.params.id }).update({ context: null, updatedAt: new Date() });

    // Vider messages + summary de toutes les sessions du projet
    await db('Session').where({ projectId: req.params.id }).update({
      messages: JSON.stringify([]),
      summary: null,
      planSuggestions: null,
      tokensUsed: 0,
      hasCode: false,
      codeStatus: null,
      status: 'open',
      updatedAt: new Date()
    });

    // Remettre tous les jalons à pending
    await db('Milestone').where({ projectId: req.params.id }).update({
      status: 'pending',
      updatedAt: new Date()
    });

    res.json({ message: 'Mémoire du projet réinitialisée' });
  } catch (err) {
    console.error('[projects/:id/memory DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Membres du projet ─────────────────────────────────────────────────────────

// GET /api/projects/:id/members
router.get('/:id/members', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const members = await db('ProjectMember')
      .join('User', 'User.id', 'ProjectMember.userId')
      .select(
        'ProjectMember.id',
        'ProjectMember.userId',
        'ProjectMember.role',
        'ProjectMember.invitedAt',
        'User.email',
        'User.username'
      )
      .where('ProjectMember.projectId', req.params.id)
      .orderBy('ProjectMember.invitedAt', 'asc');

    res.json(members);
  } catch (err) {
    console.error('[projects/:id/members GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/members — inviter par email ou @pseudo
router.post('/:id/members', async (req, res) => {
  const { email: rawEmail, username: rawUsername } = req.body;
  const rawInput = rawEmail || rawUsername;
  if (!rawInput?.trim()) return res.status(400).json({ error: 'Email ou pseudo requis' });

  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }

    // Résoudre @pseudo en email
    let normalizedEmail;
    const input = rawInput.trim();
    if (input.startsWith('@')) {
      const [resolved] = await db('User').where({ username: input.slice(1) }).limit(1);
      if (!resolved) return res.status(404).json({ error: 'Pseudo introuvable' });
      normalizedEmail = resolved.email;
    } else {
      normalizedEmail = input.toLowerCase();
    }

    // Cas 1 : utilisateur existant → ajout direct comme membre
    const [existingUser] = await db('User').where({ email: normalizedEmail }).limit(1);
    if (existingUser) {
      if (existingUser.id === project.userId) {
        return res.status(400).json({ error: 'Cet utilisateur est déjà propriétaire du projet' });
      }

      const [alreadyMember] = await db('ProjectMember')
        .where({ projectId: req.params.id, userId: existingUser.id })
        .limit(1);
      if (alreadyMember) {
        return res.status(400).json({ error: 'Cet utilisateur est déjà membre du projet' });
      }

      const [member] = await db('ProjectMember')
        .insert({
          id: randomUUID(),
          projectId: req.params.id,
          userId: existingUser.id,
          role: 'collaborator',
          invitedAt: new Date()
        })
        .returning(['id', 'userId', 'role', 'invitedAt']);

      return res.status(201).json({
        type: 'added',
        member: { ...member, email: existingUser.email, username: existingUser.username || null }
      });
    }

    // Cas 2 : email inconnu → invitation globale BlabIA avec lien vers ce projet
    const [pendingInvite] = await db('Invitation')
      .where({ email: normalizedEmail, used: false })
      .limit(1);
    if (pendingInvite) {
      return res.status(400).json({ error: 'Une invitation est déjà en attente pour cet email' });
    }

    const token = randomUUID();
    await db('Invitation').insert({
      id: randomUUID(),
      email: normalizedEmail,
      token,
      used: false,
      createdBy: req.user.email,
      projectId: req.params.id
    });

    await sendInvitation(normalizedEmail, token, req.user.email, project.name);

    res.status(201).json({ type: 'invited', email: normalizedEmail });
  } catch (err) {
    console.error('[projects/:id/members POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/members/:uid — retirer un membre
router.delete('/:id/members/:uid', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }

    const deleted = await db('ProjectMember')
      .where({ projectId: req.params.id, userId: req.params.uid })
      .delete();

    if (!deleted) return res.status(404).json({ error: 'Membre introuvable' });
    res.json({ message: 'Membre retiré' });
  } catch (err) {
    console.error('[projects/:id/members/:uid DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Agents par projet ─────────────────────────────────────────────────────────

// GET /api/projects/:id/agents — tous les agents avec leur statut dans ce projet
router.get('/:id/agents', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const agents = await db('Agent')
      .select(
        'Agent.id', 'Agent.name', 'Agent.role', 'Agent.emoji', 'Agent.isDefault', 'Agent.systemPrompt',
        'ProjectAgent.id as projectAgentId',
        'ProjectAgent.enabled',
        'ProjectAgent.displayOrder',
        'ProjectAgent.source'
      )
      .leftJoin('ProjectAgent', function () {
        this.on('ProjectAgent.agentId', '=', 'Agent.id')
            .andOn('ProjectAgent.projectId', '=', db.raw('?', [req.params.id]));
      })
      .where(function () {
        // Agents défaut toujours visibles + agents personnels uniquement si rattachés à CE projet
        this.where('Agent.isDefault', true).orWhereNotNull('ProjectAgent.id');
      })
      .orderByRaw('"ProjectAgent"."displayOrder" ASC NULLS LAST, "Agent"."isDefault" DESC, "Agent"."createdAt" ASC');

    res.json(agents);
  } catch (err) {
    console.error('[projects/:id/agents GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/agents — ajouter un agent au projet
router.post('/:id/agents', async (req, res) => {
  const { agentId, source = 'manual' } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [agent] = await db('Agent').where({ id: agentId }).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent introuvable' });

    // displayOrder = position après le dernier agent actif
    const [{ maxOrder }] = await db('ProjectAgent')
      .max('displayOrder as maxOrder')
      .where({ projectId: req.params.id });

    const [pa] = await db('ProjectAgent')
      .insert({
        id: randomUUID(),
        projectId: req.params.id,
        agentId,
        enabled: true,
        displayOrder: (maxOrder ?? -1) + 1,
        source
      })
      .onConflict(['projectId', 'agentId'])
      .merge({ enabled: true, source })
      .returning(['id', 'projectId', 'agentId', 'enabled', 'displayOrder', 'source']);

    res.status(201).json(pa);
  } catch (err) {
    console.error('[projects/:id/agents POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/agents/reorder — réordonner les agents actifs
router.patch('/:id/agents/reorder', async (req, res) => {
  const { order } = req.body; // tableau d'agentId dans l'ordre souhaité
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order (tableau) requis' });
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    await Promise.all(
      order.map((agentId, i) =>
        db('ProjectAgent')
          .where({ projectId: req.params.id, agentId })
          .update({ displayOrder: i })
      )
    );
    res.json({ message: 'Ordre mis à jour' });
  } catch (err) {
    console.error('[projects/:id/agents/reorder PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/agents/:agentId — toggle enabled
router.patch('/:id/agents/:agentId', async (req, res) => {
  const { enabled } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [existing] = await db('ProjectAgent')
      .where({ projectId: req.params.id, agentId: req.params.agentId })
      .limit(1);

    if (!existing) {
      // Créer l'entrée si elle n'existe pas (agent non encore dans le projet)
      const [{ maxOrder }] = await db('ProjectAgent')
        .max('displayOrder as maxOrder')
        .where({ projectId: req.params.id });
      await db('ProjectAgent').insert({
        id: randomUUID(),
        projectId: req.params.id,
        agentId: req.params.agentId,
        enabled: enabled ?? true,
        displayOrder: (maxOrder ?? -1) + 1,
        source: 'manual'
      });
    } else {
      await db('ProjectAgent')
        .where({ projectId: req.params.id, agentId: req.params.agentId })
        .update({ enabled: enabled ?? !existing.enabled });
    }

    res.json({ message: 'Mis à jour' });
  } catch (err) {
    console.error('[projects/:id/agents/:agentId PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/agents/:agentId — retirer un agent du projet
router.delete('/:id/agents/:agentId', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    await db('ProjectAgent')
      .where({ projectId: req.params.id, agentId: req.params.agentId })
      .delete();

    res.json({ message: 'Agent retiré du projet' });
  } catch (err) {
    console.error('[projects/:id/agents/:agentId DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/generate-timeline — génère une timeline depuis le brief
router.post('/:id/generate-timeline', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!project.brief) return res.status(400).json({ error: 'Brief manquant — définissez un brief avant de générer une timeline' });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: 'Tu es un expert en gestion de projet. Tu génères des timelines spécifiques et actionnables. Réponds UNIQUEMENT en JSON valide, sans backticks ni markdown.',
      messages: [{
        role: 'user',
        content: `Tu es un expert en gestion de projet. Analyse ce brief et génère une timeline adaptée à la COMPLEXITÉ RÉELLE du projet décrit.

Brief du projet :
${project.brief}

RÈGLE IMPORTANTE : calibre le nombre d'étapes selon la complexité :
- Projet simple (page web, démo, document unique) : 3 à 4 étapes
- Projet moyen (application simple, campagne marketing) : 4 à 6 étapes
- Projet complexe (logiciel complet, plateforme multi-fonctions) : 6 à 10 étapes

Ne surcharge JAMAIS un projet simple avec trop d'étapes.
Chaque étape doit être directement actionnelle pour CE projet spécifique.
Évite les étapes génériques qui pourraient s'appliquer à n'importe quel projet.

Pour chaque étape :
- title : titre court et spécifique (max 50 chars)
- description : ce que cette étape accomplit concrètement (1-2 phrases)
- type : "synthesis" (réflexion/décision/compte-rendu) | "memory" (structurer des informations clés) | "claude_code" (développement/implémentation technique) | "timeline_steps" (définir les prochaines étapes) | "stack_check" (vérification outils/environnement) | "milestone" (livraison/validation externe)
- estimatedOrder : ordre chronologique

Retourne UNIQUEMENT du JSON valide sans markdown :
{"steps":[{"title":"...","description":"...","type":"synthesis","estimatedOrder":1}]}`
      }]
    });

    const rawText = response.content[0].text.trim()
      .replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Réponse invalide du modèle' });
    const parsed = JSON.parse(match[0]);
    res.json({ steps: parsed.steps || [] });
  } catch (err) {
    console.error('[generate-timeline]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id/meeting-context
router.get('/:id/meeting-context', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const pastCodePrompts = await db('Session')
      .select(['task', 'summary'])
      .where({ projectId: req.params.id, status: 'accepted', hasCode: true })
      .whereNotNull('summary')
      .orderBy('createdAt', 'desc')
      .limit(3);

    res.json({
      brief:           project.brief   || '',
      context:         project.context || '',
      pastCodePrompts: pastCodePrompts.map(s => ({ task: s.task, summary: s.summary })),
    });
  } catch (err) {
    console.error('[projects/:id/meeting-context]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/quick-command — prompt rapide sans réunion
router.post('/:id/quick-command', async (req, res) => {
  const { input } = req.body;
  if (!input?.trim()) return res.status(400).json({ error: 'Input requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const isCommand = input.startsWith('/');
    const command = isCommand ? input.split(' ')[0].toLowerCase() : null;
    const args = isCommand ? input.slice((command || '').length).trim() : null;

    // /aide — répondre sans appel Claude
    if (command === '/aide') {
      const help = `# Commandes disponibles

**Commandes prédéfinies :**
- \`/ajouterEtapes [description]\` — Génère et ajoute des étapes dans la timeline
- \`/résumerProjet\` — État actuel du projet, avancement, points clés
- \`/résumerRéunion [nom ou numéro]\` — Résume une réunion spécifique
- \`/décisions\` — Toutes les décisions prises dans les réunions
- \`/prochainEtape\` — Identifie et explique la prochaine étape à traiter
- \`/analyserBloquants\` — Étapes bloquées et solutions proposées
- \`/exporterTimeline\` — Timeline en texte structuré, copiable
- \`/aide\` — Cette aide

**Question libre :** Pose n'importe quelle question sur le projet sans préfixe.`;
      return res.json({ type: 'command', command: '/aide', result: help });
    }

    const milestones = await db('Milestone').where({ projectId: req.params.id }).orderBy('displayOrder');
    const sessions   = await db('Session')
      .where({ projectId: req.params.id, status: 'accepted' })
      .select('id', 'task', 'summary', 'intention', 'createdAt', 'milestoneId');

    const systemPrompt = `Tu es l'assistant du projet "${project.name}".
Brief : ${project.brief || 'non défini'}
Timeline : ${milestones.length > 0 ? milestones.map(m => `- ${m.title} (${m.status})`).join('\n') : 'aucune étape'}
Réunions acceptées : ${sessions.length > 0 ? sessions.map(s => `- ${s.task}`).join('\n') : 'aucune'}
Mémoire projet : ${project.context?.slice(0, 1000) || 'aucune'}

IMPORTANT : Ta réponse N'EST PAS stockée dans la mémoire du projet. C'est une réponse ponctuelle.`;

    let userPrompt;
    let isAddSteps = false;

    switch (command) {
      case '/ajouteretapes':
        isAddSteps = true;
        userPrompt = `Génère ${args || 'des étapes pertinentes'} pour ce projet.
Retourne UNIQUEMENT un JSON valide sans markdown ni backticks :
{"milestones": [{"title": "...", "type": "summary|claude_code|stack_check"}]}
Limite à 5 étapes maximum. Titres courts et actionnables (max 50 chars).`;
        break;
      case '/résumerprojet':
        userPrompt = "Fais un résumé de l'état actuel du projet : avancement, points clés, prochaines priorités.";
        break;
      case '/résumerréunion':
        userPrompt = args
          ? `Résume la réunion "${args}" en points clés et décisions.`
          : "Résume la dernière réunion en points clés et décisions.";
        break;
      case '/décisions':
        userPrompt = "Liste toutes les décisions formelles prises dans les réunions de ce projet.";
        break;
      case '/prochainetape':
        userPrompt = "Quelle est la prochaine étape à traiter ? Explique pourquoi et comment la démarrer.";
        break;
      case '/analyserbloquants':
        userPrompt = "Identifie les étapes bloquées ou en retard et propose des solutions concrètes.";
        break;
      case '/exportertimeline':
        userPrompt = "Exporte la timeline en texte structuré et lisible, avec les statuts.";
        break;
      default:
        userPrompt = input;
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const resultText = response.content[0].text;

    if (isAddSteps) {
      try {
        const raw = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('JSON introuvable');
        const parsed = JSON.parse(match[0]);
        const stepsToCreate = (parsed.milestones || []).slice(0, 5);

        const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId: req.params.id });
        let order = (maxOrder ?? -1) + 1;

        const created = [];
        for (const step of stepsToCreate) {
          if (!step.title?.trim()) continue;
          const [milestone] = await db('Milestone')
            .insert({
              id:           randomUUID(),
              projectId:    req.params.id,
              title:        step.title.trim(),
              description:  step.description?.trim() || null,
              status:       'pending',
              type:         ['summary', 'claude_code', 'stack_check'].includes(step.type) ? step.type : 'summary',
              displayOrder: order++,
              createdAt:    new Date(),
              createdBy:    req.user.id
            })
            .returning(['id', 'title', 'type', 'status', 'displayOrder']);
          created.push(milestone);
        }

        return res.json({
          type: 'command',
          command: '/ajouterEtapes',
          result: `${created.length} étape${created.length !== 1 ? 's' : ''} ajoutée${created.length !== 1 ? 's' : ''} à la timeline.`,
          milestonesCreated: created
        });
      } catch {
        return res.json({
          type: 'command',
          command: '/ajouterEtapes',
          result: resultText,
          milestonesCreated: []
        });
      }
    }

    res.json({
      type: isCommand ? 'command' : 'question',
      command,
      result: resultText
    });
  } catch (err) {
    console.error('[projects/:id/quick-command POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/suggest-stack — suggestion de stack via Claude (boîte à outils prioritaire)
router.post('/:id/suggest-stack', async (req, res) => {
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const { toolboxSummary = {} } = req.body;
    const owned      = (toolboxSummary.owned      || []).join(', ') || 'aucun';
    const planned    = (toolboxSummary.planned    || []).join(', ') || 'aucun';
    const evaluating = (toolboxSummary.evaluating || []).join(', ') || 'aucun';

    const userPrompt = `Analyse ce projet et suggère la stack technique la plus adaptée.

Brief du projet : ${project.brief || 'Non défini'}
Description : ${project.description || 'Non définie'}

Boîte à outils de l'utilisateur :
- Outils possédés : ${owned}
- Outils prévus : ${planned}
- Outils en évaluation : ${evaluating}

Règles :
1. Priorise TOUJOURS les outils déjà possédés — ne propose pas d'alternative si l'outil possédé convient
2. Suggère un outil supplémentaire SEULEMENT s'il manque quelque chose d'essentiel
3. Explique brièvement pourquoi chaque outil est adapté (1-2 phrases)
4. Si la boîte à outils couvre bien le projet, dis-le explicitement

Format de réponse (Markdown) :
## Stack recommandée
[Liste des outils recommandés avec courte justification]

## Outils manquants (si nécessaire)
[SEULEMENT si un outil essentiel manque dans la boîte à outils — sinon omets cette section]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: 'Tu es un expert en architecture logicielle. Tes réponses sont concises et directes.',
      messages: [{ role: 'user', content: userPrompt }]
    });

    res.json({ suggestion: response.content[0].text });
  } catch (err) {
    console.error('[projects/:id/suggest-stack POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
