const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const anthropic = require('../services/anthropic');

const router = express.Router({ mergeParams: true });
router.use(authMiddleware);

const MODEL = 'claude-sonnet-4-6';
const AGENTS_LIST = ['Analyste', 'Créatif', 'Critique', 'Expert', 'Synthésiseur', 'Chercheur', 'Stratège', 'Rédacteur'];

// Questions agents en attente d'une réponse humaine (en mémoire, par sessionId)
const pendingQuestions = new Map();

// ── HELPERS ───────────────────────────────────────────────────────────────────

function extractJson(text) {
  const match = text.trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Pas de JSON dans la réponse');
  return JSON.parse(match[0]);
}

async function getProject(projectId, userId, isAdmin) {
  const query = db('Project').where({ id: projectId });
  if (!isAdmin) query.andWhere({ userId });
  const [project] = await query.limit(1);
  return project;
}

async function saveSession(sessionId, exchanges, summary, status) {
  await db('Session').where({ id: sessionId }).update({
    exchanges: JSON.stringify(exchanges),
    summary: summary || null,
    status
  });
}

// Génère un digest 200-300 mots et l'ajoute à project.context (max ~3000 tokens)
async function updateProjectContext(projectId, task, summaryText) {
  try {
    const digestResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: 'Tu es un assistant qui crée des résumés concis pour une mémoire de projet. Réponds uniquement avec le résumé, sans introduction.',
      messages: [{
        role: 'user',
        content: `Crée un résumé de 200 à 300 mots de cette session pour la mémoire du projet. Inclus : la tâche demandée, les points clés abordés et les recommandations principales.\n\nTâche : ${task}\n\nRestitution finale :\n${summaryText.substring(0, 4000)}`
      }]
    });

    const digest = digestResponse.content[0].text.trim();
    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const entry = `[Session du ${date}]\n${digest}`;

    const [project] = await db('Project').select('context').where({ id: projectId }).limit(1);
    const current = project?.context || '';
    const separator = current ? '\n---\n' : '';
    let newContext = current + separator + entry;

    // Limiter à ~10 000 caractères (≈ 3000 tokens) — supprimer les plus anciennes
    const MAX_CHARS = 10000;
    if (newContext.length > MAX_CHARS) {
      const parts = newContext.split('\n---\n');
      while (parts.length > 1 && parts.join('\n---\n').length > MAX_CHARS) {
        parts.shift();
      }
      newContext = parts.join('\n---\n');
    }

    await db('Project').where({ id: projectId }).update({ context: newContext });
  } catch (err) {
    console.error('[updateProjectContext]', err.message);
  }
}

function waitForAnswer(sessionId, timeoutMs = 300_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingQuestions.delete(sessionId);
      reject(new Error('Timeout : pas de réponse dans les 5 minutes'));
    }, timeoutMs);

    pendingQuestions.set(sessionId, {
      resolve(answer) { clearTimeout(timer); pendingQuestions.delete(sessionId); resolve(answer); },
      reject(err)    { clearTimeout(timer); pendingQuestions.delete(sessionId); reject(err); }
    });
  });
}

// Appel Anthropic en streaming — retourne le texte complet
async function streamAgent(systemPrompt, userMessage, onChunk, maxTokens = 2048) {
  const stream = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    stream: true
  });

  let fullText = '';
  let stopReason = null;

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      fullText += event.delta.text;
      onChunk(event.delta.text);
    }
    // Détecter une troncature silencieuse (limite de tokens atteinte)
    if (event.type === 'message_delta' && event.delta?.stop_reason) {
      stopReason = event.delta.stop_reason;
    }
  }

  if (stopReason === 'max_tokens') {
    console.warn(`[streamAgent] Réponse tronquée — max_tokens (${maxTokens}) atteint. Augmenter la limite si nécessaire.`);
  }

  return fullText;
}

// ── SOUS-ÉTAPE 1 : Création de session + formation d'équipe ──────────────────

router.post('/', async (req, res) => {
  const { task, mode = 'realtime', parentSessionId = null } = req.body;
  const { projectId } = req.params;
  const isAdmin = req.user.role === 'admin';

  if (!task?.trim()) return res.status(400).json({ error: 'La tâche est requise' });
  if (!['realtime', 'summary'].includes(mode)) return res.status(400).json({ error: 'Mode invalide' });

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.status === 'archived') return res.status(400).json({ error: 'Ce projet est archivé' });

    if (parentSessionId) {
      const [parent] = await db('Session').where({ id: parentSessionId, projectId }).limit(1);
      if (!parent || parent.status !== 'complete') {
        return res.status(400).json({ error: 'Session parente invalide ou non terminée' });
      }
    }

    const contextBlock = project.context
      ? `\n\nContexte des sessions précédentes de ce projet :\n${project.context}`
      : '';

    const teamResponse = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: 'Tu es un coordinateur d\'agents IA. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans explication.',
      messages: [{
        role: 'user',
        content: `Analyse cette tâche et sélectionne une équipe de 3 à 5 agents parmi : ${AGENTS_LIST.join(', ')}.${contextBlock}

Retourne EXACTEMENT ce format JSON :
{"agents":[{"name":"NomAgent","role":"Rôle précis de cet agent pour cette tâche"}],"plan":"Une phrase décrivant l'approche collaborative"}

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

    const now = new Date();
    const initialExchanges = [{ type: 'plan', content: teamData.plan, createdAt: now.toISOString() }];

    const [session] = await db('Session')
      .insert({
        id: randomUUID(),
        task: task.trim(),
        agents: JSON.stringify(teamData.agents),
        exchanges: JSON.stringify(initialExchanges),
        summary: null,
        status: 'incomplete',
        mode,
        projectId,
        parentSessionId: parentSessionId || null,
        createdAt: now
      })
      .returning(['id', 'task', 'agents', 'exchanges', 'status', 'mode', 'createdAt', 'projectId', 'parentSessionId']);

    await db('Project').where({ id: projectId }).update({ updatedAt: now });

    res.status(201).json({
      session: {
        ...session,
        agents: typeof session.agents === 'string' ? JSON.parse(session.agents) : session.agents,
        exchanges: initialExchanges
      },
      plan: teamData.plan
    });
  } catch (err) {
    console.error('[sessions POST]', err.message);
    res.status(err.status ? 502 : 500).json({ error: err.status ? `API Anthropic : ${err.message}` : 'Erreur serveur' });
  }
});

// ── SOUS-ÉTAPE 2a : Orchestration des agents (SSE) ───────────────────────────

router.post('/:sessionId/run', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = req.user.role === 'admin';

  // Valider avant d'ouvrir le SSE
  let session;
  let projectContext = null;
  let parentExchangesBlock = '';
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    projectContext = project.context || null;

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (s.status === 'complete') return res.status(400).json({ error: 'Session déjà terminée' });
    session = s;

    if (session.parentSessionId) {
      const [parentSession] = await db('Session').where({ id: session.parentSessionId }).limit(1);
      if (parentSession) {
        const parentExchanges = typeof parentSession.exchanges === 'string'
          ? JSON.parse(parentSession.exchanges)
          : parentSession.exchanges;
        const formatted = parentExchanges
          .filter(e => e.type === 'agent' || e.type === 'human')
          .map(e => e.type === 'agent'
            ? `${e.agent} : ${e.content}`
            : `Utilisateur : ${e.content}`)
          .join('\n\n');
        if (formatted) {
          parentExchangesBlock = `\nSuite de la session précédente. Voici ce qui a été échangé :\n${formatted}\n\nNouveau prompt de l'utilisateur : ${session.task}\n`;
        }
      }
    }
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // Ouvrir la connexion SSE
  if (req.socket) req.socket.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };

  // Nettoyage si le client se déconnecte
  req.on('close', () => {
    const pending = pendingQuestions.get(sessionId);
    if (pending) pending.reject(new Error('Client déconnecté'));
  });

  send('connected', { sessionId });

  const agents = typeof session.agents === 'string' ? JSON.parse(session.agents) : session.agents;
  const exchanges = typeof session.exchanges === 'string' ? JSON.parse(session.exchanges) : session.exchanges;

  try {
    // ── Tour de chaque agent ────────────────────────────────────────────────
    for (const agent of agents) {
      send('agent_start', { name: agent.name, role: agent.role });

      // Contexte cumulé des échanges agent/humain précédents
      const contextParts = exchanges
        .filter(e => e.type === 'agent' || e.type === 'human')
        .map(e => e.type === 'agent'
          ? `${e.agent} : ${e.content}`
          : `Utilisateur : ${e.content}`);

      const userMessage = contextParts.length === 0
        ? `Tâche : ${session.task}`
        : `Tâche : ${session.task}\n\nÉchanges précédents :\n${contextParts.join('\n\n')}\n\nC'est maintenant ton tour de contribuer.`;

      const contextSection = projectContext
        ? `\nContexte des sessions précédentes de ce projet :\n${projectContext}\n`
        : '';

      const systemPrompt =
        `Tu es ${agent.name}, un agent IA spécialisé. Ton rôle dans cette session : ${agent.role}.${contextSection}${parentExchangesBlock}
Réponds en français, de façon concise et structurée. Apporte une contribution distincte et complémentaire des agents précédents.
Si et seulement si tu as besoin d'une information cruciale de l'utilisateur pour avancer, pose exactement UNE question en terminant ton message par [QUESTION: ta question précise]. Sinon, ne pose aucune question.`;

      const fullText = await streamAgent(systemPrompt, userMessage, (chunk) => {
        send('chunk', { agent: agent.name, text: chunk });
      });

      // Détecter une question dans la réponse
      const questionMatch = fullText.match(/\[QUESTION:\s*([\s\S]*?)\]/);
      const agentContent = fullText.replace(/\[QUESTION:[\s\S]*?\]/, '').trim();

      exchanges.push({
        type: 'agent',
        agent: agent.name,
        content: agentContent,
        createdAt: new Date().toISOString()
      });
      send('agent_done', { name: agent.name, content: agentContent });

      if (questionMatch) {
        const question = questionMatch[1].trim();
        send('question', { agent: agent.name, question });

        try {
          const humanAnswer = await waitForAnswer(sessionId);
          exchanges.push({
            type: 'human',
            agent: 'Utilisateur',
            content: humanAnswer,
            createdAt: new Date().toISOString()
          });
          send('answer_received', { answer: humanAnswer });
        } catch (timeoutErr) {
          send('error', { message: timeoutErr.message });
          await saveSession(sessionId, exchanges, null, 'interrupted');
          return res.end();
        }
      }
    }

    // ── Synthèse finale ─────────────────────────────────────────────────────
    send('summary_start', {});

    const contextFull = exchanges
      .filter(e => e.type === 'agent' || e.type === 'human')
      .map(e => e.type === 'agent'
        ? `**${e.agent}** : ${e.content}`
        : `**Utilisateur** : ${e.content}`)
      .join('\n\n');

    const summaryText = await streamAgent(
      'Tu es un Synthésiseur expert. Tu rédiges une restitution finale claire, bien structurée (titres, listes), avec des recommandations concrètes et actionnables. Tu réponds en français.',
      `Tâche originale : ${session.task}\n\nContributions des agents :\n${contextFull}\n\nRédige une restitution finale structurée qui synthétise tout et donne des recommandations concrètes.`,
      (chunk) => send('summary_chunk', { text: chunk }),
      8192   // La synthèse agrège plusieurs agents — 2048 tronquait le texte en milieu de phrase
    );

    send('summary_done', { summary: summaryText });

    // ── Sauvegarde en base ──────────────────────────────────────────────────
    await saveSession(sessionId, exchanges, summaryText, 'complete');
    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });

    // Mise à jour de la mémoire projet en arrière-plan (non bloquant)
    updateProjectContext(projectId, session.task, summaryText);

    send('complete', { sessionId });
    res.end();

  } catch (err) {
    console.error('[sessions/run]', err.message);
    try {
      send('error', { message: `Erreur d'orchestration : ${err.message}` });
      await saveSession(sessionId, exchanges, null, 'interrupted');
    } catch {}
    res.end();
  } finally {
    pendingQuestions.delete(sessionId);
  }
});

// ── SOUS-ÉTAPE 2b : Réponse humaine à une question agent ─────────────────────

router.post('/:sessionId/answer', async (req, res) => {
  const { sessionId } = req.params;
  const { answer } = req.body;

  if (!answer?.trim()) return res.status(400).json({ error: 'Réponse requise' });

  const pending = pendingQuestions.get(sessionId);
  if (!pending) {
    return res.status(404).json({ error: 'Aucune question en attente pour cette session' });
  }

  pending.resolve(answer.trim());
  res.json({ message: 'Réponse transmise aux agents' });
});

// ── Liste et détail des sessions ─────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { projectId } = req.params;
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const sessions = await db('Session')
      .select(
        'id', 'task', 'status', 'mode', 'createdAt', 'parentSessionId',
        db.raw('jsonb_array_length(agents) as "agentCount"')
      )
      .where({ projectId })
      .whereIn('status', ['complete', 'interrupted'])
      .orderBy('createdAt', 'desc');

    res.json(sessions);
  } catch (err) {
    console.error('[sessions GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    res.json({
      ...session,
      agents: typeof session.agents === 'string' ? JSON.parse(session.agents) : session.agents,
      exchanges: typeof session.exchanges === 'string' ? JSON.parse(session.exchanges) : session.exchanges
    });
  } catch (err) {
    console.error('[sessions/:id GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
