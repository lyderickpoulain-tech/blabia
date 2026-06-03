const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { sendInvitation } = require('../services/email');

const router = express.Router();
router.use(authMiddleware);

const PROJECT_FIELDS = [
  'id', 'name', 'description', 'brief', 'status', 'context', 'techStack', 'createdAt', 'updatedAt', 'userId'
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
  const isAdmin = req.user.role === 'admin';
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
        db.raw(`(SELECT COUNT(*)::int FROM "TodoItem" WHERE "projectId" = "Project"."id" AND status != 'cancelled') AS "todoTotal"`),
        db.raw(`(SELECT COUNT(*)::int FROM "TodoItem" WHERE "projectId" = "Project"."id" AND status = 'done') AS "todoDone"`),
        db.raw(`(SELECT COUNT(*)::int FROM "TodoItem" WHERE "projectId" = "Project"."id" AND status = 'in_progress') AS "todoInProgress"`)
      )
      .leftJoin('Session', 'Session.projectId', 'Project.id')
      .groupBy('Project.id')
      .orderBy('Project.updatedAt', 'desc');

    if (!isAdmin) {
      // Projets dont l'utilisateur est propriétaire OU membre
      query.where(function () {
        this.where('Project.userId', req.user.id)
          .orWhereExists(
            db.select(db.raw('1')).from('ProjectMember')
              .where('ProjectMember.userId', req.user.id)
              .whereRaw('"ProjectMember"."projectId" = "Project"."id"')
          );
      });
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
  const { name, description, objectif, contexte, notes } = req.body;
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
  const isAdmin = req.user.role === 'admin';
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

// PATCH /api/projects/:id — renommer (propriétaire ou admin uniquement)
router.patch('/:id', async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Le nom du projet est requis' });
  }
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }

    const [updated] = await db('Project')
      .where({ id: req.params.id })
      .update({
        name: name.trim(),
        description: description !== undefined ? (description?.trim() || null) : project.description,
        updatedAt: new Date()
      })
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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

// ── Membres du projet ─────────────────────────────────────────────────────────

// GET /api/projects/:id/members
router.get('/:id/members', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
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
        'User.email'
      )
      .where('ProjectMember.projectId', req.params.id)
      .orderBy('ProjectMember.invitedAt', 'asc');

    res.json(members);
  } catch (err) {
    console.error('[projects/:id/members GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/members — inviter par email
router.post('/:id/members', async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email requis' });

  const isAdmin = req.user.role === 'admin';
  try {
    const project = await findProject(req.params.id, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (!isOwnerOrAdmin(project, req.user.id, isAdmin)) {
      return res.status(403).json({ error: 'Action réservée au propriétaire' });
    }
    if (project.userId === email || project.userId === req.user.id) {
      // Ne pas s'inviter soi-même ni inviter le propriétaire
    }

    const normalizedEmail = email.trim().toLowerCase();

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
        member: { ...member, email: existingUser.email }
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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
        this.where('Agent.isDefault', true).orWhere('Agent.userId', req.user.id);
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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
  const isAdmin = req.user.role === 'admin';
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

module.exports = router;
