const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const anthropic      = require('../../services/anthropic');
const { findProject: getProject, formatTechStack } = require('../../utils/projectHelpers');
const { MODEL } = require('./helpers');

const router = express.Router({ mergeParams: true });

function extractJson(text) {
  const match = text.trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Pas de JSON dans la réponse');
  return JSON.parse(match[0]);
}

// ── POST / — Création de session + formation d'équipe ─────────────────────────

router.post('/', async (req, res) => {
  const {
    task,
    mode = 'realtime',
    parentSessionId = null,
    milestoneId = null,
    model: modelParam,
    fullContext: fullContextParam = false,
    forceNew = false,
    cachedAgents = null,
    selectedAgents = null,
    intention = [],
    activeAgents: activeAgentsParam = null,
    webSearchEnabled: webSearchEnabledParam = false
  } = req.body;
  const { projectId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const VALID_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8'];
  const selectedModel = VALID_MODELS.includes(modelParam) ? modelParam : MODEL;
  const fullContextEnabled = !!fullContextParam;

  if (!task?.trim()) return res.status(400).json({ error: 'La tâche est requise' });
  if (!['realtime', 'summary', 'conversation', 'meeting'].includes(mode)) return res.status(400).json({ error: 'Mode invalide' });

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.status === 'archived') return res.status(400).json({ error: 'Ce projet est archivé' });

    if (parentSessionId) {
      const [parent] = await db('Session').where({ id: parentSessionId, projectId }).limit(1);
      if (!parent || !['open', 'accepted'].includes(parent.status)) {
        return res.status(400).json({ error: 'Session parente invalide ou non terminée' });
      }
    }

    // ── Mode meeting v3.0 : création directe sans formation d'équipe ──────────
    if (mode === 'meeting') {
      if (!Array.isArray(activeAgentsParam) || activeAgentsParam.length === 0) {
        return res.status(400).json({ error: 'Au moins un agent est requis pour démarrer une réunion' });
      }
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
          projectId,
          milestoneId: milestoneId || null,
          createdAt: now
        })
        .returning(['id', 'task', 'status', 'mode', 'model', 'createdAt', 'projectId', 'milestoneId', 'webSearchEnabled']);
      await db('Project').where({ id: projectId }).update({ updatedAt: now });
      if (milestoneId) {
        try { await db('Milestone').where({ id: milestoneId, projectId }).update({ status: 'in_progress' }); } catch {}
      }
      return res.status(201).json({
        session: { ...session, activeAgents: agentsWithJoin, messages: [] },
        plan: 'Réunion démarrée.'
      });
    }

    // ── Cache de formation d'équipe ───────────────────────────────────────────
    if (!forceNew && !cachedAgents) {
      const [cachedSession] = await db('Session')
        .whereIn('status', ['open', 'accepted'])
        .whereRaw('LOWER(TRIM("task")) = LOWER(TRIM(?))', [task.trim()])
        .orderBy('createdAt', 'desc')
        .limit(1);

      if (cachedSession) {
        const cachedAgentsList = typeof cachedSession.agents === 'string'
          ? JSON.parse(cachedSession.agents)
          : cachedSession.agents;
        return res.json({
          cached: true,
          agents: cachedAgentsList,
          plan: 'Équipe précédente réutilisée — même tâche détectée.'
        });
      }
    }

    // ── Agents : ProjectAgent (enabled, ordonnés) ou fallback global ──────────
    let availableAgents = await db('Agent')
      .select(
        'Agent.id', 'Agent.name', 'Agent.role', 'Agent.systemPrompt', 'Agent.emoji', 'Agent.isDefault'
      )
      .join('ProjectAgent', function () {
        this.on('ProjectAgent.agentId', '=', 'Agent.id')
            .andOn('ProjectAgent.projectId', '=', db.raw('?', [projectId]));
      })
      .where('ProjectAgent.enabled', true)
      .orderBy('ProjectAgent.displayOrder', 'asc');

    if (availableAgents.length === 0) {
      availableAgents = await db('Agent')
        .select(['id', 'name', 'role', 'systemPrompt', 'emoji', 'isDefault'])
        .where({ isDefault: true })
        .orderBy('createdAt', 'asc');
    }

    if (availableAgents.length === 0) {
      return res.status(500).json({ error: 'Aucun agent disponible — base non initialisée' });
    }

    // ── Formation de l'équipe : cache accepté ou Claude ───────────────────────
    let enrichedAgents;
    let teamPlan;

    if (selectedAgents && Array.isArray(selectedAgents) && selectedAgents.length > 0) {
      enrichedAgents = selectedAgents;
      teamPlan = 'Équipe sélectionnée manuellement.';
    } else if (cachedAgents && Array.isArray(cachedAgents) && cachedAgents.length > 0) {
      enrichedAgents = cachedAgents;
      teamPlan = 'Équipe précédente réutilisée.';
    } else {
      const agentsList = availableAgents.map(a => `- ${a.name} (${a.role})`).join('\n');
      const briefBlock = project.brief
        ? `\n\nBrief du projet :\n${project.brief}`
        : '';

      const projectMilestones = await db('Milestone')
        .select('title', 'type', 'status')
        .where({ projectId })
        .orderBy('displayOrder', 'asc');
      const STATUS_EMOJI = { done: '✅', in_progress: '🔵', blocked: '🔴', pending: '⚪' };
      const tlLines = projectMilestones.map(m => `${STATUS_EMOJI[m.status] || '⚪'} ${m.title}`);
      const timelineBlock = tlLines.length > 0
        ? `\n\nÉtat de la timeline du projet :\n${tlLines.join('\n')}\nTiens compte des étapes déjà terminées pour ne pas les proposer à nouveau. Concentre-toi sur les étapes en cours ou bloquées.`
        : '';

      const ctxForTeam = project.context
        ? project.context.substring(0, 8000)
        : '';
      const contextBlock = ctxForTeam
        ? `\n\nContexte des sessions précédentes de ce projet :\n${ctxForTeam}`
        : '';

      const teamResponse = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 1024,
        system: 'Tu es un coordinateur d\'agents IA. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans explication.',
        messages: [{
          role: 'user',
          content: `Analyse cette tâche et sélectionne une équipe de 3 à 5 agents parmi ceux disponibles ci-dessous. Utilise UNIQUEMENT les noms exacts de la liste.${briefBlock}${timelineBlock}${contextBlock}

Agents disponibles :
${agentsList}

Retourne EXACTEMENT ce format JSON :
{"agents":[{"name":"NomExact","role":"Rôle précis de cet agent pour cette tâche spécifique"}],"plan":"Une phrase décrivant l'approche collaborative"}

Tâche : ${task.trim()}`
        }]
      });

      let teamData;
      try {
        teamData = extractJson(teamResponse.content[0].text);
        if (!Array.isArray(teamData.agents) || teamData.agents.length < 2) throw new Error('Structure invalide');
      } catch {
        return res.status(500).json({ error: "Erreur formation d'équipe — réessayez" });
      }

      const agentMap = {};
      availableAgents.forEach(a => { agentMap[a.name.toLowerCase()] = a; });
      enrichedAgents = teamData.agents.map(selected => {
        const dbAgent = agentMap[selected.name.toLowerCase()];
        return {
          name: selected.name,
          role: selected.role,
          systemPrompt: dbAgent?.systemPrompt || `Tu es ${selected.name}, un agent IA spécialisé. ${selected.role}.`,
          emoji: dbAgent?.emoji || '🤖'
        };
      });
      teamPlan = teamData.plan;
    }

    const now = new Date();
    const initialExchanges = [{ type: 'plan', content: teamPlan, createdAt: now.toISOString() }];

    const [session] = await db('Session')
      .insert({
        id: randomUUID(),
        task: task.trim(),
        agents: JSON.stringify(enrichedAgents),
        exchanges: JSON.stringify(initialExchanges),
        summary: null,
        status: 'open',
        mode,
        model: selectedModel,
        fullContext: fullContextEnabled,
        intention: JSON.stringify(Array.isArray(intention) ? intention : []),
        projectId,
        parentSessionId: parentSessionId || null,
        milestoneId:     milestoneId     || null,
        createdAt: now
      })
      .returning(['id', 'task', 'agents', 'exchanges', 'status', 'mode', 'model', 'createdAt', 'projectId', 'parentSessionId', 'milestoneId']);

    await db('Project').where({ id: projectId }).update({ updatedAt: now });

    if (milestoneId) {
      try {
        await db('Milestone').where({ id: milestoneId, projectId }).update({ status: 'in_progress' });
      } catch {}
    }

    res.status(201).json({
      session: {
        ...session,
        agents: typeof session.agents === 'string' ? JSON.parse(session.agents) : session.agents,
        exchanges: initialExchanges
      },
      plan: teamPlan
    });
  } catch (err) {
    console.error('[sessions POST]', err.message);
    res.status(err.status ? 502 : 500).json({ error: err.status ? `API Anthropic : ${err.message}` : 'Erreur serveur' });
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

    const parseJson = (v, fallback) => {
      if (Array.isArray(v) || (v && typeof v === 'object')) return v;
      try { return JSON.parse(v || fallback); } catch { return JSON.parse(fallback); }
    };

    const [{ count: planCount }] = await db('Milestone')
      .count('id as count')
      .where({ createdFromSessionId: sessionId });

    res.json({
      ...session,
      agents:          parseJson(session.agents, '[]'),
      exchanges:       parseJson(session.exchanges, '[]'),
      timeline:        parseJson(session.timeline, '[]'),
      planSuggestions: parseJson(session.planSuggestions, 'null'),
      intention:       parseJson(session.intention, '[]'),
      messages:        parseJson(session.messages, '[]'),
      activeAgents:    parseJson(session.activeAgents, '[]'),
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

// ── PATCH /:sessionId — Mise à jour tâche / intention ─────────────────────────

router.patch('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  const { task, intention } = req.body;

  if (task === undefined && intention === undefined) {
    return res.status(400).json({ error: 'Champ requis : task ou intention' });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(session.status)) {
      return res.status(400).json({ error: 'Session déjà close' });
    }

    const updates = { updatedAt: new Date() };
    if (task !== undefined)      updates.task      = task.trim();
    if (intention !== undefined) updates.intention = JSON.stringify(Array.isArray(intention) ? intention : [intention]);

    await db('Session').where({ id: sessionId }).update(updates);
    const [updated] = await db('Session').where({ id: sessionId }).limit(1);
    return res.json({ id: updated.id, task: updated.task, intention: updated.intention });
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
