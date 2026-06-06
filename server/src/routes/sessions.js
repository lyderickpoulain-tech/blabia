const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const anthropic = require('../services/anthropic');
const { computeMilestoneStatus } = require('../utils/milestones');

const router = express.Router({ mergeParams: true });
router.use(authMiddleware);

const MODEL = 'claude-sonnet-4-6';

// Questions agents en attente d'une réponse humaine (en mémoire, par sessionId)
const pendingQuestions = new Map();

// ── HELPERS ───────────────────────────────────────────────────────────────────

function extractJson(text) {
  const match = text.trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Pas de JSON dans la réponse');
  return JSON.parse(match[0]);
}

async function getProject(projectId, userId, isAdmin) {
  const query = db('Project').where('Project.id', projectId);
  if (!isAdmin) {
    query.where(function () {
      this.where('Project.userId', userId)
        .orWhereExists(
          db.select(db.raw('1')).from('ProjectMember')
            .where('ProjectMember.projectId', projectId)
            .where('ProjectMember.userId', userId)
        );
    });
  }
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

// Formate la stack technique en lignes lisibles pour les prompts
function formatTechStack(ts) {
  if (!ts || typeof ts !== 'object') return [];
  const LABELS = {
    hebergement: 'Hébergement', bdd: 'Base de données',
    frontend: 'Framework frontend', backend: 'Framework backend',
    auth: 'Authentification', emails: "Envoi d'emails",
    devtools: 'Outils de développement', domaine: 'Domaine'
  };
  const lines = [];
  for (const [key, label] of Object.entries(LABELS)) {
    const selected = ts[key] || [];
    const items = selected.map(item => {
      if (item === 'Autre' && ts[`${key}_autre`]) return ts[`${key}_autre`];
      if (item === 'Autre') return null;
      return item;
    }).filter(Boolean);
    if (items.length > 0) lines.push(`- ${label} : ${items.join(', ')}`);
  }
  return lines;
}

// Extrait les outils suggérés / manquants depuis le summary, puis crée le milestone stack_check
async function extractSuggestedTools(sessionId, summaryText, projectId = null) {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: 'Tu extrais des outils techniques depuis une restitution. Réponds UNIQUEMENT en JSON valide, sans markdown.',
      messages: [{
        role: 'user',
        content: `Analyse cette restitution et extrais :
- "suggestedTools" : les outils/technologies suggérés pour ce projet (noms courts, ex: "Next.js", "Stripe")
- "missingTools" : les outils/fonctionnalités absents ou à mettre en place (ex: "système de paiement", "CDN")

Retourne UNIQUEMENT ce JSON :
{"suggestedTools":[],"missingTools":[]}

Restitution :
${summaryText.substring(0, 3000)}`
      }]
    });

    const match = response.content[0].text.trim().match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]);
    const suggestedTools = Array.isArray(parsed.suggestedTools) ? parsed.suggestedTools : [];
    const missingTools   = Array.isArray(parsed.missingTools)   ? parsed.missingTools   : [];

    await db('Session').where({ id: sessionId }).update({
      suggestedTools: JSON.stringify({ suggestedTools, missingTools })
    });

    // Créer automatiquement un milestone stack_check si c'est la première session avec des outils
    if (projectId && (suggestedTools.length > 0 || missingTools.length > 0)) {
      await createStackCheckIfNeeded(projectId, suggestedTools, missingTools);
    }
  } catch (err) {
    console.error('[extractSuggestedTools]', err.message);
  }
}

// Crée un milestone stack_check si aucun n'existe encore pour ce projet
async function createStackCheckIfNeeded(projectId, suggestedTools, missingTools) {
  try {
    const [existing] = await db('Milestone').where({ projectId, type: 'stack_check' }).limit(1);
    if (existing) return; // Déjà présent

    const [project] = await db('Project').select(['techStack']).where({ id: projectId }).limit(1);
    const ts = project?.techStack
      ? (typeof project.techStack === 'string' ? JSON.parse(project.techStack) : project.techStack)
      : {};

    const CAT_LABELS = {
      hebergement: 'Hébergement',   bdd: 'Base de données',
      frontend: 'Framework frontend', backend: 'Framework backend',
      auth: 'Authentification',       emails: "Envoi d'emails",
      devtools: 'Outils de dev',      domaine: 'Domaine'
    };

    const items = [];
    const slug = (s) => s.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

    // Outils déjà configurés dans la techStack → checked: true
    for (const [key, cat] of Object.entries(CAT_LABELS)) {
      const selected = Array.isArray(ts[key]) ? ts[key] : [];
      for (const item of selected) {
        const label = item === 'Autre' ? (ts[`${key}_autre`] || null) : item;
        if (!label) continue;
        items.push({ id: `tech-${key}-${slug(label)}`, label, category: cat, checked: true, notes: '' });
      }
    }

    // Outils suggérés par les agents → checked: false
    for (const tool of suggestedTools) {
      if (!items.some(i => i.label.toLowerCase() === tool.toLowerCase())) {
        items.push({ id: `sugg-${slug(tool)}`, label: tool, category: 'Suggéré par les agents', checked: false, notes: '' });
      }
    }

    // Outils manquants identifiés → checked: false
    for (const tool of missingTools) {
      if (!items.some(i => i.label.toLowerCase() === tool.toLowerCase())) {
        items.push({ id: `miss-${slug(tool)}`, label: tool, category: 'À mettre en place', checked: false, notes: '' });
      }
    }

    if (items.length === 0) return;

    const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId });
    await db('Milestone').insert({
      id: randomUUID(), projectId,
      title: 'Vérification de la stack technique',
      description: 'Confirmez que tous les outils nécessaires sont bien configurés pour ce projet.',
      status: 'pending', type: 'stack_check',
      checklistData: JSON.stringify({ items }),
      displayOrder: (maxOrder ?? -1) + 1,
      createdAt: new Date()
    });
    console.log(`[createStackCheckIfNeeded] Milestone stack_check créé — projet ${projectId} (${items.length} items)`);
  } catch (err) {
    console.error('[createStackCheckIfNeeded]', err.message);
  }
}

// ── Timeline helpers ──────────────────────────────────────────────────────────

// Ajoute une entrée à la fin de la timeline (append atomique JSONB)
async function appendTimelineEntry(sessionId, entry) {
  await db.raw(
    `UPDATE "Session" SET timeline = COALESCE(timeline, '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([entry]), sessionId]
  );
}

// Met à jour une entrée existante dans la timeline (lecture + réécriture)
async function patchTimelineEntry(sessionId, entryId, patch) {
  const [session] = await db('Session').select('timeline').where({ id: sessionId }).limit(1);
  let tl = session?.timeline;
  if (!Array.isArray(tl)) { try { tl = JSON.parse(tl || '[]'); } catch { tl = []; } }
  const idx = tl.findIndex(e => e.id === entryId);
  if (idx < 0) return;
  tl[idx] = { ...tl[idx], ...patch };
  await db('Session').where({ id: sessionId }).update({ timeline: JSON.stringify(tl) });
}

// Extrait jalons et tâches depuis le summary pour suggestions plan
async function extractPlanSuggestions(summaryText) {
  const TIMEOUT_MS = 30_000;
  console.log('[extractPlanSuggestions] START — summaryText length:', summaryText?.length ?? 0);
  if (!summaryText || summaryText.trim().length < 50) {
    console.log('[extractPlanSuggestions] SKIP — summaryText trop court');
    return null;
  }
  try {
    const extractPromise = anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: 'Tu extrais jalons et tâches depuis une restitution. Réponds UNIQUEMENT en JSON valide, sans markdown.',
      messages: [{
        role: 'user',
        content: `À partir de cette restitution, extrais le plan d'actions en JSON.
Pour chaque jalon, détermine :
- title : titre court et explicite (max 50 chars)
- description : description détaillée de ce que couvre cette étape
- type : "meeting" (réflexion/décision), "technical" (dev/code/implémentation), "stack_check" (vérification outils), "milestone" (livraison/validation)
- todos : liste de tâches concrètes avec priority (low/medium/high)

Si la restitution ne contient pas de plan d'actions structuré : retourner {"milestones":[],"standalone_todos":[]}.
Ne jamais inventer de jalons si la restitution n'en contient pas.

Retourne UNIQUEMENT ce JSON valide :
{
  "milestones": [
    { "title": "...", "description": "...", "type": "meeting", "todos": [{ "title": "...", "priority": "high" }] }
  ],
  "standalone_todos": [{ "title": "...", "priority": "medium" }]
}

Restitution :
${summaryText.substring(0, 4000)}`
      }]
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('extractPlanSuggestions timeout')), TIMEOUT_MS)
    );

    console.log('[extractPlanSuggestions] API call envoyée, attente réponse…');
    const response = await Promise.race([extractPromise, timeoutPromise]);
    const rawText = response.content[0].text.trim();
    console.log('[extractPlanSuggestions] réponse reçue, longueur:', rawText.length, '— début:', rawText.substring(0, 120));

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('[extractPlanSuggestions] FAIL — aucun JSON trouvé dans la réponse');
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (parseErr) {
      console.error('[extractPlanSuggestions] FAIL — JSON.parse error:', parseErr.message, '— texte:', match[0].substring(0, 200));
      return null;
    }
    const result = {
      milestones:       Array.isArray(parsed.milestones)       ? parsed.milestones       : [],
      standalone_todos: Array.isArray(parsed.standalone_todos) ? parsed.standalone_todos : []
    };
    console.log('[extractPlanSuggestions] OK — milestones:', result.milestones.length, '/ standalone_todos:', result.standalone_todos.length);
    return result;
  } catch (err) {
    console.error('[extractPlanSuggestions] ERREUR:', err.message);
    return null;
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

// Appel Anthropic en streaming avec auto-continuation sur max_tokens (max 3 tours)
async function streamAgent(systemPrompt, userMessage, onChunk, maxTokens = 2048, model = MODEL) {
  const MAX_CONTINUATIONS = 3;
  let fullText = '';
  let messages = [{ role: 'user', content: userMessage }];

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const stream = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true
    });

    let chunkText = '';
    let stopReason = null;

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        chunkText += event.delta.text;
        fullText += event.delta.text;
        onChunk(event.delta.text);
      }
      if (event.type === 'message_delta' && event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason;
      }
    }

    if (stopReason !== 'max_tokens') break;

    if (attempt >= MAX_CONTINUATIONS) {
      console.error(`[streamAgent] max_tokens atteint après ${MAX_CONTINUATIONS} continuations — texte tronqué.`);
      const warning = '\n\n---\n> ⚠️ *La restitution a été interrompue — limite de génération atteinte après 3 continuations automatiques.*';
      fullText += warning;
      onChunk(warning);
      break;
    }

    // Prépare le tour de continuation via multi-turn
    messages = [
      ...messages,
      { role: 'assistant', content: chunkText },
      { role: 'user', content: 'Continue exactement où tu t\'es arrêté, sans répéter ce qui précède.' }
    ];
  }

  return fullText;
}

// ── SOUS-ÉTAPE 1 : Création de session + formation d'équipe ──────────────────

router.post('/', async (req, res) => {
  const {
    task,
    mode = 'realtime',
    parentSessionId = null,
    milestoneId = null,
    model: modelParam,
    fullContext: fullContextParam = false,
    forceNew = false,
    cachedAgents = null
  } = req.body;
  const { projectId } = req.params;
  const isAdmin = req.user.role === 'admin';

  const VALID_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-8'];
  const selectedModel = VALID_MODELS.includes(modelParam) ? modelParam : MODEL;
  const fullContextEnabled = !!fullContextParam;

  if (!task?.trim()) return res.status(400).json({ error: 'La tâche est requise' });
  if (!['realtime', 'summary', 'conversation'].includes(mode)) return res.status(400).json({ error: 'Mode invalide' });

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

    // ── 2.3 : Cache de formation d'équipe ────────────────────────────────────
    if (!forceNew && !cachedAgents) {
      const [cachedSession] = await db('Session')
        .where({ projectId, status: 'complete' })
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

    // ── Agents : ProjectAgent (enabled, ordonnés) ou fallback global ─────────
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

    // Fallback pour les projets sans configuration ProjectAgent
    if (availableAgents.length === 0) {
      availableAgents = await db('Agent')
        .select(['id', 'name', 'role', 'systemPrompt', 'emoji', 'isDefault'])
        .where(function () {
          this.where({ isDefault: true }).orWhere({ userId: req.user.id });
        })
        .orderBy([{ column: 'isDefault', order: 'desc' }, { column: 'createdAt', order: 'asc' }]);
    }

    if (availableAgents.length === 0) {
      return res.status(500).json({ error: 'Aucun agent disponible — base non initialisée' });
    }

    // ── Formation de l'équipe : cache accepté ou Claude ──────────────────────
    let enrichedAgents;
    let teamPlan;

    if (cachedAgents && Array.isArray(cachedAgents) && cachedAgents.length > 0) {
      enrichedAgents = cachedAgents;
      teamPlan = 'Équipe précédente réutilisée.';
    } else {
      const agentsList = availableAgents.map(a => `- ${a.name} (${a.role})`).join('\n');
      const briefBlock = project.brief
        ? `\n\nBrief du projet :\n${project.brief}`
        : '';
      // Contexte tronqué à ~2000 tokens pour la formation d'équipe
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
          content: `Analyse cette tâche et sélectionne une équipe de 3 à 5 agents parmi ceux disponibles ci-dessous. Utilise UNIQUEMENT les noms exacts de la liste.${briefBlock}${contextBlock}

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
        status: 'incomplete',
        mode,
        model: selectedModel,
        fullContext: fullContextEnabled,
        projectId,
        parentSessionId: parentSessionId || null,
        milestoneId:     milestoneId     || null,
        createdAt: now
      })
      .returning(['id', 'task', 'agents', 'exchanges', 'status', 'mode', 'model', 'createdAt', 'projectId', 'parentSessionId', 'milestoneId']);

    await db('Project').where({ id: projectId }).update({ updatedAt: now });

    // Lier le jalon et passer son statut à in_progress
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

// ── SOUS-ÉTAPE 2a : Orchestration des agents (SSE) ───────────────────────────

router.post('/:sessionId/run', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { humanInput } = req.body;
  const isAdmin = req.user.role === 'admin';

  // Valider avant d'ouvrir le SSE
  let session;
  let project = null;
  let projectContext = null;
  let parentExchangesBlock = '';
  let stackLines = [];
  try {
    project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (s.status === 'complete' && !humanInput?.trim()) return res.status(400).json({ error: 'Session déjà terminée' });
    session = s;

    // ── 3 : Stack technique effective (projet surcharge utilisateur) ──────────
    const [userRecord] = await db('User').select(['techStack']).where({ id: req.user.id }).limit(1);
    const userStack = typeof userRecord?.techStack === 'string'
      ? JSON.parse(userRecord.techStack) : (userRecord?.techStack || {});
    const projectStack = project.techStack
      ? (typeof project.techStack === 'string' ? JSON.parse(project.techStack) : project.techStack)
      : null;
    const effectiveStack = projectStack ?? userStack;
    stackLines = formatTechStack(effectiveStack);

    // ── 2.2 : Contexte projet tronqué (~2000 tokens) sauf si fullContext ──────
    const CONTEXT_MAX_CHARS = 8000;
    const rawContext = project.context || null;
    projectContext = rawContext
      ? (session.fullContext ? rawContext : rawContext.substring(0, CONTEXT_MAX_CHARS))
      : null;

    if (session.parentSessionId) {
      const [parentSession] = await db('Session').where({ id: session.parentSessionId }).limit(1);
      if (parentSession) {
        const parentExchanges = typeof parentSession.exchanges === 'string'
          ? JSON.parse(parentSession.exchanges)
          : parentSession.exchanges;
        // ── 2.2 : 3 derniers tours sauf fullContext ──────────────────────────
        const relevant = parentExchanges.filter(e => e.type === 'agent' || e.type === 'human');
        const sliced = session.fullContext ? relevant : relevant.slice(-6);
        const formatted = sliced
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
    clearInterval(heartbeatInterval);
    const pending = pendingQuestions.get(sessionId);
    if (pending) pending.reject(new Error('Client déconnecté'));
  });

  send('connected', { sessionId });

  // Keep-alive toutes les 15s — empêche le proxy Railway de couper les connexions longues (Opus)
  const heartbeatInterval = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeatInterval); }
  }, 15000);

  const isConversation = session.mode === 'conversation';
  const isAdditionalPrompt = session.status === 'complete' && !!humanInput?.trim();
  const agents = typeof session.agents === 'string' ? JSON.parse(session.agents) : session.agents;
  const exchanges = typeof session.exchanges === 'string' ? JSON.parse(session.exchanges) : session.exchanges;

  // Numéro du tour courant (nb d'interventions humaines déjà enregistrées + 1)
  const turnNumber = isConversation
    ? exchanges.filter(e => e.type === 'human').length + 1
    : null;

  // Calcul du tour pour prompt additionnel (tour 1 = run initial)
  const existingSummaryCount = isAdditionalPrompt
    ? (exchanges.some(e => e.type === 'summary')
        ? exchanges.filter(e => e.type === 'summary').length
        : (session.summary ? 1 : 0))
    : 0;
  const additionalTurnNumber = isAdditionalPrompt ? existingSummaryCount + 1 : null;

  if (isAdditionalPrompt) {
    await db('Session').where({ id: sessionId }).update({ status: 'in_progress' });
  }

  // IDs des entrées timeline en cours pour ce run
  const tlIds = { agents: {}, synthesis: null, question: null };
  let isFirstAgent = true;

  try {
    // Injecter l'intervention humaine avant le tour d'agents (mode conversation tour ≥ 2)
    if (isConversation && humanInput?.trim()) {
      exchanges.push({
        type: 'human',
        agent: 'Utilisateur',
        content: humanInput.trim(),
        turn: turnNumber - 1,
        createdAt: new Date().toISOString()
      });
    }

    // Prompt additionnel sur session déjà complète
    if (isAdditionalPrompt) {
      exchanges.push({
        type: 'human',
        agent: 'Utilisateur',
        content: humanInput.trim(),
        turn: additionalTurnNumber,
        createdAt: new Date().toISOString()
      });
    }

    // Contexte : dernière synthèse connue, pour enrichir le prompt des agents
    const previousSynthesisForAgents = isAdditionalPrompt
      ? (exchanges.filter(e => e.type === 'summary').pop()?.content || session.summary || '')
      : '';

    // ── Tour de chaque agent ────────────────────────────────────────────────
    for (const agent of agents) {
      send('agent_start', { name: agent.name, role: agent.role });

      // Timeline : formation d'équipe (une seule fois) + tour agent
      if (isFirstAgent) {
        isFirstAgent = false;
        await appendTimelineEntry(sessionId, {
          id: randomUUID(), type: 'team_formation', label: 'Formation de l\'équipe',
          status: 'done', timestamp: new Date().toISOString(), meta: {}
        }).catch(() => {});
      }
      const agentTlId = randomUUID();
      tlIds.agents[agent.name] = agentTlId;
      await appendTimelineEntry(sessionId, {
        id: agentTlId, type: 'agent_turn', label: `${agent.name} — ${agent.role}`,
        status: 'in_progress', timestamp: new Date().toISOString(), meta: { agentName: agent.name }
      }).catch(() => {});

      // Contexte cumulé des échanges agent/humain précédents
      const contextParts = exchanges
        .filter(e => e.type === 'agent' || e.type === 'human')
        .map(e => e.type === 'agent'
          ? `${e.agent} : ${e.content}`
          : `Utilisateur : ${e.content}`);

      const synthBlock = previousSynthesisForAgents
        ? `\n\nRestitution précédente de la session :\n${previousSynthesisForAgents.substring(0, 2000)}${previousSynthesisForAgents.length > 2000 ? '\n[…]' : ''}\n`
        : '';

      const userMessage = contextParts.length === 0
        ? `Tâche : ${session.task}${synthBlock}`
        : `Tâche : ${session.task}${synthBlock}\n\nÉchanges précédents :\n${contextParts.join('\n\n')}\n\nC'est maintenant ton tour de contribuer.`;

      const briefSection = project.brief
        ? `\nBrief du projet :\n${project.brief}\n`
        : '';

      const contextSection = projectContext
        ? `\nContexte des sessions précédentes de ce projet :\n${projectContext}\n`
        : '';

      const systemPromptBase = agent.systemPrompt
        || `Tu es ${agent.name}, un agent IA spécialisé. ${agent.role}.`;

      const conversationNote = isConversation
        ? '\nCette session est une conversation continue : l\'utilisateur peut intervenir entre les tours. Sois attentif à ses interventions précédentes.'
        : '';

      const stackSection = stackLines.length > 0
        ? `\n\nStack technique du projet :\n${stackLines.join('\n')}\nAdapte tes recommandations à cet environnement.`
        : '';

      const systemPrompt =
        `${systemPromptBase}
Ton rôle spécifique dans cette session : ${agent.role}.${briefSection}${contextSection}${parentExchangesBlock}${stackSection}${conversationNote}
Réponds en français, de façon concise et structurée. Apporte une contribution distincte et complémentaire des agents précédents.
Si et seulement si tu as besoin d'une information cruciale de l'utilisateur pour avancer, pose exactement UNE question en terminant ton message par [QUESTION: ta question précise]. Sinon, ne pose aucune question.
Si tu identifies qu'un expert avec une compétence très spécifique manquante serait utile pour cette tâche, tu peux le suggérer en ajoutant à la toute fin de ton message : [SUGGEST_AGENT: {"name": "NomAgent", "role": "Description courte", "systemPrompt": "Prompt système complet"}]. Un seul agent suggéré maximum, uniquement si vraiment nécessaire.`;

      const fullText = await streamAgent(systemPrompt, userMessage, (chunk) => {
        send('chunk', { agent: agent.name, text: chunk });
      }, 2048, session.model || MODEL);

      // Détecter une question et/ou une suggestion d'agent
      const questionMatch = fullText.match(/\[QUESTION:\s*([\s\S]*?)\]/);
      let suggestedAgentData = null;
      const suggestMatch = fullText.match(/\[SUGGEST_AGENT:\s*(\{[\s\S]*?\})\]/);
      if (suggestMatch) {
        try { suggestedAgentData = JSON.parse(suggestMatch[1]); } catch {}
      }
      const agentContent = fullText
        .replace(/\[QUESTION:[\s\S]*?\]/, '')
        .replace(/\[SUGGEST_AGENT:[\s\S]*?\]/, '')
        .trim();

      const agentExchange = {
        type: 'agent',
        agent: agent.name,
        content: agentContent,
        createdAt: new Date().toISOString()
      };
      if (isConversation) agentExchange.turn = turnNumber;
      else if (isAdditionalPrompt) agentExchange.turn = additionalTurnNumber;
      exchanges.push(agentExchange);
      send('agent_done', { name: agent.name, content: agentContent });
      if (tlIds.agents[agent.name]) {
        await patchTimelineEntry(sessionId, tlIds.agents[agent.name], { status: 'done' }).catch(() => {});
      }

      if (suggestedAgentData?.name && suggestedAgentData?.role) {
        send('suggest_agent', {
          name: suggestedAgentData.name,
          role: suggestedAgentData.role,
          systemPrompt: suggestedAgentData.systemPrompt || `Tu es ${suggestedAgentData.name}. ${suggestedAgentData.role}.`,
          emoji: suggestedAgentData.emoji || '🤖'
        });
      }

      if (questionMatch) {
        const question = questionMatch[1].trim();
        send('question', { agent: agent.name, question });

        // Timeline : question posée
        const questionTlId = randomUUID();
        tlIds.question = questionTlId;
        await appendTimelineEntry(sessionId, {
          id: questionTlId, type: 'question',
          label: `${agent.name} — Question`,
          status: 'in_progress', timestamp: new Date().toISOString(),
          meta: { agentName: agent.name, question: question.substring(0, 150) }
        }).catch(() => {});

        try {
          const humanAnswer = await waitForAnswer(sessionId);
          const answerExchange = {
            type: 'human',
            agent: 'Utilisateur',
            content: humanAnswer,
            createdAt: new Date().toISOString()
          };
          if (isConversation) answerExchange.turn = turnNumber;
          exchanges.push(answerExchange);
          send('answer_received', { answer: humanAnswer });

          // Timeline : réponse reçue
          if (tlIds.question) {
            await patchTimelineEntry(sessionId, tlIds.question, {
              status: 'done', meta: { agentName: agent.name, question: question.substring(0, 150), answer: humanAnswer.substring(0, 100) }
            }).catch(() => {});
            tlIds.question = null;
          }
        } catch (timeoutErr) {
          send('error', { message: timeoutErr.message });
          await saveSession(sessionId, exchanges, null, 'interrupted');
          return res.end();
        }
      }
    }

    if (isConversation) {
      // ── Mode conversation : fin du tour, attente de l'intervention humaine ─
      await saveSession(sessionId, exchanges, null, 'incomplete');
      await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
      send('turn_complete', { sessionId, turn: turnNumber });
      res.end();
    } else {
      // ── Modes realtime/summary : synthèse finale automatique ────────────────
      send('summary_start', {});

      // Timeline : synthèse démarrée
      const synthTlId = randomUUID();
      tlIds.synthesis = synthTlId;
      await appendTimelineEntry(sessionId, {
        id: synthTlId, type: 'synthesis', label: 'Synthèse finale',
        status: 'in_progress', timestamp: new Date().toISOString(), meta: {}
      }).catch(() => {});

      const contextFull = exchanges
        .filter(e => e.type === 'agent' || e.type === 'human')
        .map(e => e.type === 'agent'
          ? `**${e.agent}** : ${e.content}`
          : `**Utilisateur** : ${e.content}`)
        .join('\n\n');

      const synthesisTask = isAdditionalPrompt
        ? `${session.task}\n\nPrompt complémentaire : ${humanInput.trim()}`
        : session.task;

      const summaryRaw = await streamAgent(
        'Tu es un Synthésiseur expert. Tu rédiges une restitution finale claire, bien structurée (titres, listes), avec des recommandations concrètes et actionnables. Tu réponds en français.\nSi et seulement si la restitution implique une implémentation technique concrète (code, développement, configuration à effectuer), ajoute le marqueur exact [HAS_CODE] à la toute fin de ton texte, sur une nouvelle ligne.',
        `Tâche originale : ${synthesisTask}\n\nContributions des agents :\n${contextFull}\n\nRédige une restitution finale structurée qui synthétise tout et donne des recommandations concrètes.`,
        (chunk) => send('summary_chunk', { text: chunk }),
        8192,
        session.model || MODEL
      );

      // Détecter et retirer le marqueur [HAS_CODE]
      let summaryHasCode = false;
      let summaryText = summaryRaw;
      if (summaryRaw.includes('[HAS_CODE]')) {
        summaryHasCode = true;
        summaryText = summaryRaw.replace(/\[HAS_CODE\]/g, '').trim();
      }
      if (summaryHasCode) {
        await db('Session').where({ id: sessionId }).update({ hasCode: true });
        send('has_code', { value: true });
      }

      // Stocker la synthèse dans les exchanges pour le fil multi-tours
      const summaryTurn = isAdditionalPrompt ? additionalTurnNumber : 1;
      exchanges.push({
        type: 'summary',
        content: summaryText,
        turn: summaryTurn,
        createdAt: new Date().toISOString()
      });

      send('summary_done', { summary: summaryText });

      await saveSession(sessionId, exchanges, summaryText, 'complete');
      await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
      updateProjectContext(projectId, session.task, summaryText);
      extractSuggestedTools(sessionId, summaryText, projectId);

      // Mise à jour du statut du jalon lié
      if (session.milestoneId) {
        try {
          // hasCode → in_progress (en attente implémentation), sinon done
          await db('Milestone').where({ id: session.milestoneId }).update({
            status: summaryHasCode ? 'in_progress' : 'done'
          });
        } catch {}
      }

      send('complete', { sessionId });

      // Extraction jalons/tâches pour suggestions plan
      console.log('[sessions/run] début extraction plan — sessionId:', sessionId, '— summaryText length:', summaryText?.length ?? 0);
      try {
        const planSuggestions = await extractPlanSuggestions(summaryText);
        console.log('[sessions/run] extractPlanSuggestions retour:', planSuggestions === null ? 'null' : `${planSuggestions.milestones?.length ?? 0} jalons`);
        if (planSuggestions && (planSuggestions.milestones.length > 0 || planSuggestions.standalone_todos.length > 0)) {
          try {
            await db('Session').where({ id: sessionId }).update({ planSuggestions: JSON.stringify(planSuggestions) });
            console.log('[sessions/run] planSuggestions sauvegardé en DB ✓');
          } catch (dbErr) {
            console.error('[sessions/run] ERREUR DB update planSuggestions:', dbErr.message);
          }
          send('plan_suggestions', planSuggestions);
        } else {
          console.log('[sessions/run] plan vide ou null — pas de sauvegarde');
        }
      } catch (err) {
        console.error('[sessions/run] erreur extraction plan:', err.message);
      }

      res.end();
    }

  } catch (err) {
    console.error('[sessions/run] modèle=%s mode=%s erreur=%s', session.model, session.mode, err.message);
    try {
      send('error', { message: `Erreur d'orchestration : ${err.message}` });
      await saveSession(sessionId, exchanges, null, 'interrupted');
    } catch {}
    res.end();
  } finally {
    clearInterval(heartbeatInterval);
    pendingQuestions.delete(sessionId);
  }
});

// ── Mode conversation : synthèse manuelle (SSE) ──────────────────────────────

router.post('/:sessionId/synthesize', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = req.user.role === 'admin';

  let session;
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (s.status === 'complete') return res.status(400).json({ error: 'Session déjà terminée' });
    if (s.mode !== 'conversation') return res.status(400).json({ error: 'Réservé au mode conversation' });
    session = s;
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  if (req.socket) req.socket.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };

  // Keep-alive toutes les 15s — synthèse Opus peut dépasser le timeout Railway
  const synthHeartbeat = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { clearInterval(synthHeartbeat); }
  }, 15000);
  req.on('close', () => clearInterval(synthHeartbeat));

  const exchanges = typeof session.exchanges === 'string' ? JSON.parse(session.exchanges) : session.exchanges;

  try {
    send('summary_start', {});

    const contextFull = exchanges
      .filter(e => e.type === 'agent' || e.type === 'human')
      .map(e => e.type === 'agent'
        ? `**${e.agent}** : ${e.content}`
        : `**Utilisateur** : ${e.content}`)
      .join('\n\n');

    const summaryRawConv = await streamAgent(
      'Tu es un Synthésiseur expert. Tu rédiges une restitution finale claire, bien structurée (titres, listes), avec des recommandations concrètes et actionnables. Tu réponds en français.\nSi et seulement si la restitution implique une implémentation technique concrète (code, développement, configuration à effectuer), ajoute le marqueur exact [HAS_CODE] à la toute fin de ton texte, sur une nouvelle ligne.',
      `Tâche originale : ${session.task}\n\nConversation complète :\n${contextFull}\n\nRédige une restitution finale structurée qui synthétise tout et donne des recommandations concrètes.`,
      (chunk) => send('summary_chunk', { text: chunk }),
      8192,
      session.model || MODEL
    );

    let convHasCode = false;
    let summaryText = summaryRawConv;
    if (summaryRawConv.includes('[HAS_CODE]')) {
      convHasCode = true;
      summaryText = summaryRawConv.replace(/\[HAS_CODE\]/g, '').trim();
    }
    if (convHasCode) {
      await db('Session').where({ id: sessionId }).update({ hasCode: true });
      send('has_code', { value: true });
    }

    const conversationSummaryTurn = exchanges.filter(e => e.type === 'summary').length + 1;
    exchanges.push({
      type: 'summary',
      content: summaryText,
      turn: conversationSummaryTurn,
      createdAt: new Date().toISOString()
    });

    send('summary_done', { summary: summaryText });

    await saveSession(sessionId, exchanges, summaryText, 'complete');
    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
    updateProjectContext(projectId, session.task, summaryText);
    extractSuggestedTools(sessionId, summaryText, projectId);

    // Mise à jour du statut du jalon lié (mode conversation)
    if (session.milestoneId) {
      try {
        await db('Milestone').where({ id: session.milestoneId }).update({
          status: convHasCode ? 'in_progress' : 'done'
        });
      } catch {}
    }

    // Suggestions plan (synthesize)
    console.log('[sessions/synthesize] début extraction plan — sessionId:', sessionId);
    try {
      const planSuggestions = await extractPlanSuggestions(summaryText);
      console.log('[sessions/synthesize] extractPlanSuggestions retour:', planSuggestions === null ? 'null' : `${planSuggestions.milestones?.length ?? 0} jalons`);
      if (planSuggestions && (planSuggestions.milestones.length > 0 || planSuggestions.standalone_todos.length > 0)) {
        try {
          await db('Session').where({ id: sessionId }).update({ planSuggestions: JSON.stringify(planSuggestions) });
          console.log('[sessions/synthesize] planSuggestions sauvegardé en DB ✓');
        } catch (dbErr) {
          console.error('[sessions/synthesize] ERREUR DB update planSuggestions:', dbErr.message);
        }
        send('plan_suggestions', planSuggestions);
      }
    } catch (err) {
      console.error('[sessions/synthesize] erreur extraction plan:', err.message);
    }

    clearInterval(synthHeartbeat);
    res.end();
  } catch (err) {
    console.error('[sessions/synthesize]', err.message);
    try { send('error', { message: `Erreur de synthèse : ${err.message}` }); } catch {}
    clearInterval(synthHeartbeat);
    res.end();
  }
});

// ── Mode conversation : fermeture sans synthèse ──────────────────────────────

router.post('/:sessionId/close', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = req.user.role === 'admin';

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (s.status === 'complete') return res.status(400).json({ error: 'Session déjà terminée' });
    if (s.mode !== 'conversation') return res.status(400).json({ error: 'Réservé au mode conversation' });

    await db('Session').where({ id: sessionId }).update({ status: 'complete', summary: null });
    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });

    res.json({ message: 'Conversation terminée' });
  } catch (err) {
    console.error('[sessions/close]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
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
        'hasCode', 'codeStatus', 'suggestedTools',
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
      planAlreadyAdded: parseInt(planCount || 0) > 0,
    });
  } catch (err) {
    console.error('[sessions/:id GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Suppression d'une session ─────────────────────────────────────────────────

router.delete('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = req.user.role === 'admin';
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    // Orphelinage : les sessions de continuation ne sont pas supprimées (SET NULL)
    await db('Session').where({ parentSessionId: sessionId }).update({ parentSessionId: null });

    await db('Session').where({ id: sessionId }).delete();

    res.json({ message: 'Session supprimée' });
  } catch (err) {
    console.error('[sessions/:id DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Statut d'implémentation du code exporté ───────────────────────────────────

router.patch('/:sessionId/code-status', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { status } = req.body;
  const isAdmin = req.user.role === 'admin';

  if (!['implemented', 'not_generated'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide — valeurs acceptées : implemented, not_generated' });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    await db('Session').where({ id: sessionId }).update({ codeStatus: status });

    // Mettre à jour le statut du jalon lié à cette session
    if (session.milestoneId) {
      try {
        await db('Milestone').where({ id: session.milestoneId }).update({
          status: status === 'implemented' ? 'done' : 'blocked'
        });
      } catch {}
    }

    // Si code non généré, recalculer les jalons liés aux todos de cette session
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

    // Injecter une entrée dans la mémoire du projet
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

    // Ajouter une entrée implementation dans la timeline
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

// ── Enregistrement manuel d'un événement dans la timeline ────────────────────

router.post('/:sessionId/timeline-event', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { type, label, status, meta, entryId, patch } = req.body;
  const isAdmin = req.user.role === 'admin';

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
