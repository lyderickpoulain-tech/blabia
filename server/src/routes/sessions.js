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

const TECH_STACK_LABELS = {
  hebergement: 'Hébergement',
  bdd:         'Base de données',
  frontend:    'Framework frontend',
  backend:     'Framework backend',
  auth:        'Authentification',
  emails:      'Envoi d\'emails',
  devtools:    'Outils de développement',
  domaine:     'Domaine',
};

function formatTechStackForPrompt(raw) {
  const ts = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  const lines = [];
  for (const [key, label] of Object.entries(TECH_STACK_LABELS)) {
    const selected = ts[key] || [];
    if (selected.length === 0) continue;
    const items = selected.map(item => {
      if (item === 'Autre' && ts[`${key}_autre`]) return ts[`${key}_autre`];
      if (item === 'Autre') return null;
      return item;
    }).filter(Boolean);
    if (items.length > 0) lines.push(`- ${label} : ${items.join(', ')}`);
  }
  return lines;
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
async function updateProjectContext(projectId, sessionId, task, summaryText) {
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
    const entry = `[SESSION:${sessionId} | ${date}]\n${digest}`;

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

// Ajoute un message dans session.messages (append atomique JSONB)
async function appendMessageEntry(sessionId, message) {
  await db.raw(
    `UPDATE "Session" SET messages = COALESCE(messages, '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([message]), sessionId]
  );
}

// Stocke silencieusement une suggestion d'étape hors-contexte (intention != timeline_steps)
async function appendPendingStepSuggestion(sessionId, suggestion) {
  const [row] = await db('Session').select('pendingStepSuggestions').where({ id: sessionId });
  const existing = (() => {
    const raw = row?.pendingStepSuggestions;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  })();
  if (existing.length >= 5) return;
  const isDuplicate = existing.some(s => areSimilar(s.title || '', suggestion.title || '', 0.5));
  if (isDuplicate) return;
  await db.raw(
    `UPDATE "Session" SET "pendingStepSuggestions" = COALESCE("pendingStepSuggestions", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([suggestion]), sessionId]
  );
}

// Stocke silencieusement une suggestion d'outil manquant [NEED_TOOL]
async function appendPendingToolSuggestion(sessionId, toolData) {
  const [row] = await db('Session').select('pendingToolSuggestions').where({ id: sessionId });
  const existing = (() => {
    const raw = row?.pendingToolSuggestions;
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  })();
  if (existing.length >= 10) return;
  if (existing.some(t => t.id === toolData.id)) return;
  await db.raw(
    `UPDATE "Session" SET "pendingToolSuggestions" = COALESCE("pendingToolSuggestions", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([toolData]), sessionId]
  );
}

const TOOLBOX_CAT_LABELS = {
  hosting: 'Hébergement', database: 'Base de données', frontend: 'Frontend',
  backend: 'Backend', auth: 'Authentification', emails: 'Emails',
  devtools: 'Outils dev', domain: 'Domaine'
};

function buildToolboxSection(toolbox) {
  const STATUS = { owned: 'Possédé', planned: 'Prévu', evaluating: 'En évaluation' };
  const lines = Object.entries(TOOLBOX_CAT_LABELS).map(([catId, catLabel]) => {
    const sel = toolbox[catId]?.selected;
    if (!sel) return null;
    const status = STATUS[toolbox[catId]?.status] || 'Possédé';
    const customs = toolbox[`_custom_${catId}`] || [];
    const custom = customs.find(t => t.id === sel);
    const label = custom?.name || sel;
    return `- ${catLabel} : ${label} (${status})`;
  }).filter(Boolean);
  return lines.length > 0
    ? `\n\nBoîte à outils de l'utilisateur :\n${lines.join('\n')}\nCes outils sont déjà disponibles — tiens-en compte dans tes recommandations.`
    : '';
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
async function extractPlanSuggestions(summaryText, sessionId = '?') {
  const TIMEOUT_MS = 30_000;
  console.log('[extractPlan] démarrage pour session', sessionId, '— longueur summary:', summaryText?.length ?? 0);
  if (!summaryText || summaryText.trim().length < 50) {
    console.log('[extractPlan] SKIP — summary trop court');
    return null;
  }
  try {
    const extractPromise = anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: 'Tu extrais jalons et tâches depuis une restitution. Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.',
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

Retourne UNIQUEMENT ce JSON valide, sans backticks :
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
      setTimeout(() => reject(new Error('timeout 30s')), TIMEOUT_MS)
    );

    console.log('[extractPlan] appel Anthropic envoyé…');
    const response = await Promise.race([extractPromise, timeoutPromise]);
    const rawText = response.content[0].text.trim();
    console.log('[extractPlan] résultat brut:', rawText.substring(0, 300));

    // Nettoyage backticks markdown éventuels
    const clean = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      console.log('[extractPlan] FAIL — aucun objet JSON détecté dans:', clean.substring(0, 200));
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (parseErr) {
      console.error('[extractPlan] FAIL — JSON.parse:', parseErr.message, '— texte:', match[0].substring(0, 200));
      return null;
    }
    const result = {
      milestones:       Array.isArray(parsed.milestones)       ? parsed.milestones       : [],
      standalone_todos: Array.isArray(parsed.standalone_todos) ? parsed.standalone_todos : []
    };
    console.log('[extractPlan] parsed:', JSON.stringify({ milestones: result.milestones.length, standalone_todos: result.standalone_todos.length }));
    console.log('[extractPlan] sauvegarde en DB…');
    return result;
  } catch (err) {
    console.error('[extractPlan] ERREUR:', err.message, err.stack);
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

// Appel Anthropic en streaming avec auto-continuation sur max_tokens (max 5 tours)
// Retourne { text, usage: { inputTokens, outputTokens } }
async function streamAgent(systemPrompt, userMessage, onChunk, maxTokens = 1500, model = MODEL, signal = null, webSearch = false) {
  const MAX_CONTINUATIONS = 5;
  let fullText = '';
  let messages = [{ role: 'user', content: userMessage }];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  const sources = [];

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const apiParams = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true
    };
    if (webSearch) {
      apiParams.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const stream = await anthropic.messages.create(apiParams, signal ? { signal } : undefined);

    let chunkText = '';
    let stopReason = null;

    for await (const event of stream) {
      if (signal?.aborted) break;
      if (event.type === 'message_start' && event.message?.usage) {
        totalInputTokens += event.message.usage.input_tokens || 0;
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        chunkText += event.delta.text;
        fullText += event.delta.text;
        onChunk(event.delta.text);
      }
      if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage) totalOutputTokens += event.usage.output_tokens || 0;
      }
      // Extraction des sources web depuis le bloc résultat outil
      if (webSearch && event.type === 'content_block_start') {
        const cb = event.content_block;
        if (cb?.type === 'web_search_tool_result' && Array.isArray(cb.content)) {
          for (const result of cb.content) {
            if (result.type === 'web_search_result' && result.url) {
              if (!sources.some(s => s.url === result.url)) {
                sources.push({ url: result.url, title: result.title || result.url });
              }
            }
          }
        }
      }
    }

    if (signal?.aborted) break;
    if (stopReason !== 'max_tokens') break;

    if (attempt >= MAX_CONTINUATIONS) {
      const truncated = fullText.replace(/[^.!?]*$/, '').trim();
      if (truncated && truncated.length < fullText.length) {
        const delta = truncated.length - fullText.length;
        fullText = truncated;
        onChunk('\0'.repeat(Math.abs(delta)));
      }
      const note = '\n\n*[Synthèse condensée]*';
      fullText += note;
      onChunk(note);
      break;
    }

    messages = [
      ...messages,
      { role: 'assistant', content: chunkText },
      { role: 'user', content: 'Continue exactement où tu t\'es arrêté, sans répéter ce qui précède.' }
    ];
  }

  return { text: fullText, usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }, sources };
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

    // ── 2.3 : Cache de formation d'équipe ────────────────────────────────────
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

    // Fallback : agents défaut uniquement si aucun agent rattaché au projet
    if (availableAgents.length === 0) {
      availableAgents = await db('Agent')
        .select(['id', 'name', 'role', 'systemPrompt', 'emoji', 'isDefault'])
        .where({ isDefault: true })
        .orderBy('createdAt', 'asc');
    }

    if (availableAgents.length === 0) {
      return res.status(500).json({ error: 'Aucun agent disponible — base non initialisée' });
    }

    // ── Formation de l'équipe : cache accepté ou Claude ──────────────────────
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

      // Timeline du projet pour le coordinateur
      const projectMilestones = await db('Milestone')
        .select('title', 'type', 'status')
        .where({ projectId })
        .orderBy('displayOrder', 'asc');
      const STATUS_EMOJI = { done: '✅', in_progress: '🔵', blocked: '🔴', pending: '⚪' };
      const tlLines = projectMilestones.map(m => `${STATUS_EMOJI[m.status] || '⚪'} ${m.title}`);
      const timelineBlock = tlLines.length > 0
        ? `\n\nÉtat de la timeline du projet :\n${tlLines.join('\n')}\nTiens compte des étapes déjà terminées pour ne pas les proposer à nouveau. Concentre-toi sur les étapes en cours ou bloquées.`
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
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  // Valider avant d'ouvrir le SSE
  let session;
  let project = null;
  let projectContext = null;
  let parentExchangesBlock = '';
  let stackLines = [];
  let projectMilestonesRun = [];
  try {
    project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) return res.status(400).json({ error: 'Session déjà close' });
    session = s;

    // ── Timeline du projet (mémoire active) ─────────────────────────────────
    projectMilestonesRun = await db('Milestone')
      .select('title', 'type', 'status', 'description')
      .where({ projectId })
      .orderBy('displayOrder', 'asc');

    // ── 3 : Stack technique effective (projet surcharge utilisateur) ──────────
    const [userRecord] = await db('User').select(['techStack', 'toolbox']).where({ id: req.user.id }).limit(1);
    const userStack = typeof userRecord?.techStack === 'string'
      ? JSON.parse(userRecord.techStack) : (userRecord?.techStack || {});
    const projectStack = project.techStack
      ? (typeof project.techStack === 'string' ? JSON.parse(project.techStack) : project.techStack)
      : null;
    const effectiveStack = projectStack ?? userStack;
    stackLines = formatTechStack(effectiveStack);
    const userToolbox = typeof userRecord?.toolbox === 'string'
      ? JSON.parse(userRecord.toolbox || '{}') : (userRecord?.toolbox || {});
    const webSearchEnabled = session.webSearchEnabled === true;

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
  const isAdditionalPrompt = !!session.summary && !!humanInput?.trim();
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
    // session reste 'open' pendant le relaunch
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

      const TL_EMOJI = { done: '✅', in_progress: '🔵', blocked: '🔴', pending: '⚪' };
      const tlForAgents = projectMilestonesRun.length > 0
        ? (() => {
            const all = projectMilestonesRun;
            const list = all.length > 8 ? all.filter(m => m.status !== 'pending') : all;
            if (list.length === 0) return null;
            return list.map(m => `${TL_EMOJI[m.status] || '⚪'} ${m.title}`).join('\n');
          })()
        : null;
      const timelineSection = tlForAgents
        ? `\nÉtat de la timeline du projet :\n${tlForAgents}\n`
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
      const toolboxSection = project.hasTechnicalStack
        ? buildToolboxSection(userToolbox)
        : '';

      const intentionGuard0 = (() => {
        const i = session.intention;
        const arr = Array.isArray(i) ? i : (typeof i === 'string' ? (() => { try { return JSON.parse(i || '[]'); } catch { return []; } })() : []);
        return arr[0] || '';
      })();
      const intentionInstruction0 = intentionGuard0 === 'claude_code'
        ? '\nINTENTION DE CETTE SESSION : Préparer un prompt pour Claude Code.\nTu NE dois PAS résumer, structurer ou rédiger le prompt Claude Code pendant la réunion. Tu NE dois PAS faire de récapitulatif. Pose uniquement des questions pour clarifier les besoins. Le prompt sera généré automatiquement à la clôture. Si tu es tenté de faire un récap, pose une question à la place.'
        : intentionGuard0 === 'summary'
        ? '\nINTENTION DE CETTE SESSION : Produire un compte-rendu à la clôture.\n- Tu NE dois PAS rédiger le compte-rendu pendant les échanges\n- Contribue, apporte tes analyses et suggestions\n- Le compte-rendu sera généré automatiquement à la clôture'
        : intentionGuard0 === 'timeline_steps'
        ? '\nINTENTION DE CETTE SESSION : Identifier des étapes pour la timeline.\n- Tu NE dois PAS lister les étapes finales toi-même\n- Utilise [SUGGEST_STEP: titre] pour signaler une étape au fil des échanges\n- Le plan final sera consolidé à la clôture'
        : '';

      const needToolInstruction = project.hasTechnicalStack
        ? `\nSi tu identifies UN outil technique clairement manquant dans la boîte à outils et qui serait vraiment utile pour ce projet, signale-le DISCRÈTEMENT à la toute fin de ton message : [NEED_TOOL: {"id": "docker", "label": "Docker", "category": "devtools", "required": true, "reason": "Explication en 1 phrase"}]. Un seul outil maximum, uniquement si vraiment nécessaire. required=true si indispensable pour le projet, false si optionnel.`
        : '';

      const systemPrompt =
        `${systemPromptBase}
Ton rôle spécifique dans cette session : ${agent.role}.${briefSection}${timelineSection}${contextSection}${parentExchangesBlock}${stackSection}${toolboxSection}${conversationNote}
Réponds en français, de façon concise et structurée. Apporte une contribution distincte et complémentaire des agents précédents.
Contraintes de réponse : maximum 250 mots, va à l'essentiel avec des points clés, évite les introductions et conclusions génériques.
Si et seulement si tu as besoin d'une information cruciale de l'utilisateur pour avancer, pose exactement UNE question en terminant ton message par [QUESTION: ta question précise]. Sinon, ne pose aucune question.
Si tu identifies qu'un expert avec une compétence très spécifique manquante serait utile pour cette tâche, tu peux le suggérer en ajoutant à la toute fin de ton message : [SUGGEST_AGENT: {"name": "NomAgent", "role": "Description courte", "systemPrompt": "Prompt système complet"}]. Un seul agent suggéré maximum, uniquement si vraiment nécessaire.
Si tu identifies une étape future importante et concrète pour ce projet (action à mener après cette session), tu peux la signaler avec : [SUGGEST_STEP: titre de l'étape]. Une seule suggestion par contribution.${needToolInstruction}
RÈGLE DE COMMUNICATION :
- Adapte ton langage à un interlocuteur qui n'est PAS expert dans ton domaine
- Évite le jargon technique et les acronymes non expliqués
- Si tu dois utiliser un terme technique, explique-le en une phrase simple
- Préfère des exemples concrets aux abstractions
- Tes contributions doivent être compréhensibles par quelqu'un qui découvre le sujet
Si tu reformules ou vulgarises la contribution d'un autre agent, commence par : "Pour expliquer simplement ce que [NomAgent] vient de dire : ..."
RÈGLE ABSOLUE SUR LES DÉCISIONS :
- Tu ne peux JAMAIS prendre une décision à la place de l'humain
- Si une décision tarde, signale-le en une phrase : "J'attends la réponse de l'humain avant de continuer."
- N'avance JAMAIS sans la réponse de l'humain sur une décision posée${intentionInstruction0}`;

      const { text: fullText, sources: agentSources = [] } = await streamAgent(
        systemPrompt, userMessage,
        (chunk) => { send('chunk', { agent: agent.name, text: chunk }); },
        800, session.model || MODEL, null, webSearchEnabled
      );

      // Détecter question, suggestion agent, suggestion étape, outil manquant
      const questionMatch = fullText.match(/\[QUESTION:\s*([\s\S]*?)\]/);
      let suggestedAgentData = null;
      const suggestMatch = fullText.match(/\[SUGGEST_AGENT:\s*(\{[\s\S]*?\})\]/);
      if (suggestMatch) {
        try { suggestedAgentData = JSON.parse(suggestMatch[1]); } catch {}
      }
      const stepMatch = fullText.match(/\[SUGGEST_STEP:\s*([\s\S]*?)\]/);
      const suggestedStepTitle = stepMatch ? stepMatch[1].trim() : null;

      let needToolData = null;
      const needToolMatch = fullText.match(/\[NEED_TOOL:\s*(\{[\s\S]*?\})\]/);
      if (needToolMatch) {
        try { needToolData = JSON.parse(needToolMatch[1]); } catch {}
      }

      const agentContent = fullText
        .replace(/\[QUESTION:[\s\S]*?\]/, '')
        .replace(/\[SUGGEST_AGENT:[\s\S]*?\]/, '')
        .replace(/\[SUGGEST_STEP:[\s\S]*?\]/, '')
        .replace(/\[NEED_TOOL:[\s\S]*?\]/, '')
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
      if (agentSources.length > 0) {
        send('sources', { agentName: agent.name, sources: agentSources });
      }
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
      if (suggestedStepTitle) {
        const sessionIntention = Array.isArray(session.intention) ? session.intention : [];
        if (sessionIntention.includes('timeline_steps')) {
          send('suggest_step', { title: suggestedStepTitle, agentName: agent.name });
        } else {
          await appendPendingStepSuggestion(sessionId, {
            title: suggestedStepTitle,
            type: 'summary',
            agentName: agent.name,
            timestamp: new Date().toISOString()
          });
        }
      }

      if (needToolData?.id && needToolData?.label && project.hasTechnicalStack) {
        await appendPendingToolSuggestion(sessionId, {
          id: needToolData.id,
          label: needToolData.label,
          category: needToolData.category || 'devtools',
          required: needToolData.required === true,
          reason: needToolData.reason || '',
          agentName: agent.name,
          timestamp: new Date().toISOString()
        }).catch(() => {});
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
          await saveSession(sessionId, exchanges, null, 'open');
          return res.end();
        }
      }
    }

    if (isConversation) {
      // ── Mode conversation : fin du tour, attente de l'intervention humaine ─
      await saveSession(sessionId, exchanges, null, 'open');
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

      const { text: summaryRaw } = await streamAgent(
        'Tu es un Synthésiseur expert. Tu rédiges une restitution finale claire, bien structurée (titres ##, listes), avec des recommandations concrètes et actionnables. Tu réponds en français.\nContraintes de synthèse : maximum 600 mots, structure claire avec titres de section (##), privilégie les points actionnables aux développements théoriques.\nSi et seulement si la restitution implique une implémentation technique concrète (code, développement, configuration à effectuer), ajoute le marqueur exact [HAS_CODE] à la toute fin de ton texte, sur une nouvelle ligne.',
        `Tâche originale : ${synthesisTask}\n\nContributions des agents :\n${contextFull}\n\nRédige une restitution finale structurée qui synthétise tout et donne des recommandations concrètes.`,
        (chunk) => send('summary_chunk', { text: chunk }),
        2000,
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

      await saveSession(sessionId, exchanges, summaryText, 'open');
      await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
      updateProjectContext(projectId, sessionId, session.task, summaryText);
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
      try {
        const planSuggestions = await extractPlanSuggestions(summaryText, sessionId);
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
      await saveSession(sessionId, exchanges, null, 'open');
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
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  let session;
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) return res.status(400).json({ error: 'Session déjà close' });
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

    const { text: summaryRawConv } = await streamAgent(
      'Tu es un Synthésiseur expert. Tu rédiges une restitution finale claire, bien structurée (titres, listes), avec des recommandations concrètes et actionnables. Tu réponds en français.\nSi et seulement si la restitution implique une implémentation technique concrète (code, développement, configuration à effectuer), ajoute le marqueur exact [HAS_CODE] à la toute fin de ton texte, sur une nouvelle ligne.',
      `Tâche originale : ${session.task}\n\nConversation complète :\n${contextFull}\n\nRédige une restitution finale structurée qui synthétise tout et donne des recommandations concrètes.`,
      (chunk) => send('summary_chunk', { text: chunk }),
      2000,
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

    await saveSession(sessionId, exchanges, summaryText, 'open');
    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
    updateProjectContext(projectId, sessionId, session.task, summaryText);
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
    try {
      const planSuggestions = await extractPlanSuggestions(summaryText, sessionId);
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
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) return res.status(400).json({ error: 'Session déjà close' });
    if (s.mode !== 'conversation') return res.status(400).json({ error: 'Réservé au mode conversation' });

    await db('Session').where({ id: sessionId }).update({ status: 'open', summary: null });
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

// ── PATCH tâche ou intention de session ──────────────────────────────────────

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

// ── PATCH statut session (accepted / abandoned) ───────────────────────────────

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

    // Évolution 5 : passer le milestone lié en "done" quand la session est acceptée
    if (status === 'accepted' && s.milestoneId && (s.summary || s.planSuggestions)) {
      await db('Milestone').where({ id: s.milestoneId }).update({ status: 'done' });
    }

    res.json({ status });
  } catch (err) {
    console.error('[sessions/:id/status PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Réouvrir une réunion terminée ────────────────────────────────────────────

router.post('/:sessionId/reopen', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (s.status === 'open') return res.json(s);
    await db('Session').where({ id: sessionId }).update({ status: 'open' });
    const [updated] = await db('Session').where({ id: sessionId }).limit(1);
    res.json(updated);
  } catch (err) {
    console.error('[sessions/:id/reopen POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Réinitialiser une réunion ─────────────────────────────────────────────────

router.post('/:sessionId/reset', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    // Réinitialiser la session
    await db('Session').where({ id: sessionId }).update({
      messages: JSON.stringify([]),
      status: 'open',
      summary: null,
      planSuggestions: null,
      tokensUsed: 0,
      hasCode: false,
      codeStatus: null,
      updatedAt: new Date()
    });

    // Trouver les sessions suivantes via leur jalon (displayOrder supérieur)
    let followingCount = 0;
    let newContext = project.context || '';

    if (session.milestoneId) {
      const [milestone] = await db('Milestone').where({ id: session.milestoneId }).limit(1);
      if (milestone) {
        // Récupérer les jalons suivants (displayOrder strictement supérieur)
        const followingMilestones = await db('Milestone')
          .where({ projectId })
          .where('displayOrder', '>', milestone.displayOrder);
        const followingMilestoneIds = followingMilestones.map(m => m.id);

        // Sessions liées aux jalons suivants
        let followingSessionIds = [sessionId];
        if (followingMilestoneIds.length > 0) {
          const followingSessions = await db('Session')
            .whereIn('milestoneId', followingMilestoneIds)
            .where({ projectId });
          followingSessionIds = [sessionId, ...followingSessions.map(s => s.id)];
          followingCount = followingSessions.length;
        }

        // Supprimer les blocs SESSION:uuid correspondants de project.context
        for (const sid of followingSessionIds) {
          const regex = new RegExp(
            `(?:^|\\n---\\n)\\[SESSION:${sid}[^\\]]*\\][\\s\\S]*?(?=\\n---\\n|$)`,
            'g'
          );
          newContext = newContext.replace(regex, '');
        }
        // Nettoyer les séparateurs orphelins
        newContext = newContext.replace(/^---\n/gm, '').replace(/\n---\n---\n/g, '\n---\n').trim();

        await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
      }
    } else {
      // Pas de jalon lié : supprimer uniquement la contribution de cette session
      const regex = new RegExp(
        `(?:^|\\n---\\n)\\[SESSION:${sessionId}[^\\]]*\\][\\s\\S]*?(?=\\n---\\n|$)`,
        'g'
      );
      newContext = newContext.replace(regex, '').replace(/^---\n/gm, '').replace(/\n---\n---\n/g, '\n---\n').trim();
      await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
    }

    res.json({ message: 'Réunion réinitialisée', followingCount });
  } catch (err) {
    console.error('[sessions/:id/reset POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/sessions/:sessionId/pending-tool — supprimer une suggestion d'outil résolue
router.patch('/:sessionId/pending-tool', async (req, res) => {
  const { sessionId } = req.params;
  const { toolId } = req.body;
  if (!toolId) return res.status(400).json({ error: 'toolId requis' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const [session] = await db('Session').select(['id', 'pendingToolSuggestions', 'projectId']).where({ id: sessionId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    const project = await getProject(session.projectId, req.user.id, isAdmin);
    if (!project) return res.status(403).json({ error: 'Accès refusé' });

    const existing = (() => {
      const raw = session.pendingToolSuggestions;
      if (Array.isArray(raw)) return raw;
      try { return JSON.parse(raw || '[]'); } catch { return []; }
    })();
    await db('Session').where({ id: sessionId }).update({
      pendingToolSuggestions: JSON.stringify(existing.filter(t => t.id !== toolId))
    });
    res.json({ message: 'Suggestion supprimée' });
  } catch (err) {
    console.error('[sessions/:id/pending-tool PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Génération du souvenir projet (Évolution 3) ───────────────────────────────

router.post('/:sessionId/generate-memory', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    const summary = s.summary || '';
    if (!summary) return res.status(400).json({ error: 'Aucune restitution disponible' });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: 'Tu génères des souvenirs concis pour alimenter la mémoire d\'un projet IA. Réponds directement en français, sans introduction.',
      messages: [{
        role: 'user',
        content: `À partir de cette session (tâche : "${s.task}"), génère un souvenir concis (max 200 mots) pour les agents des prochaines sessions.
Format : points clés, décisions prises, éléments importants à retenir.

Restitution :
${summary.substring(0, 3000)}`
      }]
    });
    res.json({ memory: response.content[0].text.trim() });
  } catch (err) {
    console.error('[generate-memory]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Suggestion d'agents (Évolution 2) ────────────────────────────────────────

router.post('/suggest-agents', async (req, res) => {
  const { projectId } = req.params;
  const { task, milestoneType } = req.body;
  if (!task?.trim()) return res.status(400).json({ error: 'Tâche requise' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    // Agents défaut + agents personnels rattachés à CE projet uniquement
    const agents = await db('Agent')
      .select('Agent.id', 'Agent.name', 'Agent.role', 'Agent.emoji')
      .leftJoin('ProjectAgent', function () {
        this.on('ProjectAgent.agentId', '=', 'Agent.id')
            .andOn('ProjectAgent.projectId', '=', db.raw('?', [projectId]));
      })
      .where(function () {
        this.where('Agent.isDefault', true).orWhereNotNull('ProjectAgent.id');
      })
      .orderByRaw('"Agent"."isDefault" DESC, "Agent"."createdAt" ASC');

    const agentsList = agents.map(a => `- ${a.name} : ${a.role}`).join('\n');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 10_000)
    );
    const apiPromise = anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: 'Tu sélectionnes des agents IA pertinents pour une réunion. Réponds UNIQUEMENT en JSON valide.',
      messages: [{
        role: 'user',
        content: `Tu dois suggérer des agents pertinents pour cette réunion spécifique.

Projet : "${project.name}"
Brief : "${project.brief?.trim() || 'non défini'}"
Objectif de la réunion : "${task.trim()}"${milestoneType ? `\nType d'étape : ${milestoneType}` : ''}

Agents disponibles pour CE projet :
${agentsList}

Sélectionne 2 à 4 agents parmi la liste ci-dessus qui sont DIRECTEMENT utiles pour atteindre l'objectif de cette réunion.
Ne sélectionne PAS un agent simplement parce qu'il existe.
Retourne UNIQUEMENT ce JSON :
{"suggestions":[{"name":"NomExact","reason":"Courte raison (10 mots max)"}]}`
      }]
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const text = response.content[0].text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    const agentMap = {};
    agents.forEach(a => { agentMap[a.name.toLowerCase()] = a; });

    const result = (parsed.suggestions || []).map(s => {
      const a = agentMap[s.name.toLowerCase()];
      return a ? { agentId: a.id, agentName: a.name, emoji: a.emoji, reason: s.reason } : null;
    }).filter(Boolean);

    res.json(result);
  } catch {
    // Fallback : 2 premiers agents défaut
    try {
      const fallback = await db('Agent').select('id', 'name', 'emoji').where({ isDefault: true }).limit(2);
      res.json(fallback.map(a => ({ agentId: a.id, agentName: a.name, emoji: a.emoji, reason: 'Agent par défaut' })));
    } catch (e) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// ── Liste et détail des sessions ─────────────────────────────────────────────

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

// ── Suppression d'une session ─────────────────────────────────────────────────

router.delete('/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
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

// ── v3.0 : Évolution 2.2 — POST /:sessionId/add-agent ───────────────────────

router.post('/:sessionId/add-agent', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { agentId } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  if (!agentId) return res.status(400).json({ error: 'agentId requis' });

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(session.status)) {
      return res.status(400).json({ error: 'Session déjà close' });
    }

    // Récupérer l'agent depuis la DB
    const [agent] = await db('Agent').where({ id: agentId }).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent introuvable' });

    // Vérifier l'absence de doublon dans activeAgents
    const currentActiveAgents = (() => {
      const a = session.activeAgents;
      if (Array.isArray(a)) return a;
      try { return JSON.parse(a || '[]'); } catch { return []; }
    })();

    if (currentActiveAgents.some(a => a.id === agentId)) {
      return res.status(409).json({ error: 'Cet agent est déjà dans la réunion' });
    }

    const joinedAt = new Date().toISOString();
    const newAgent = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      emoji: agent.emoji || '🤖',
      joinedAt
    };

    // Ajouter à activeAgents (append atomique JSONB)
    await db.raw(
      `UPDATE "Session" SET "activeAgents" = COALESCE("activeAgents", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
      [JSON.stringify([newAgent]), sessionId]
    );

    // Message système dans le fil de conversation
    await appendMessageEntry(sessionId, {
      id: randomUUID(),
      role: 'system',
      agentName: null,
      content: `${agent.emoji || '🤖'} ${agent.name} a rejoint la réunion.`,
      timestamp: joinedAt,
      type: 'message',
      pinned: false
    });

    await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });

    res.json({ agent: newAgent });
  } catch (err) {
    console.error('[sessions/add-agent]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── v3.0 : Évolution 2.3 — POST /:sessionId/pin-message ─────────────────────

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

    // Charger session.messages et trouver le message ciblé
    const messages = (() => {
      const m = session.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 0) return res.status(404).json({ error: 'Message introuvable' });

    // Mettre à jour pinned + type, réécrire le tableau
    messages[idx] = { ...messages[idx], pinned: true, type };
    await db('Session').where({ id: sessionId }).update({ messages: JSON.stringify(messages) });

    let milestone = null;

    // Si step_suggestion : créer un milestone dans la timeline du projet
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

// ── v3.2 : Évolution 3 — POST /:sessionId/answer-decision ───────────────────

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

    const messages = (() => {
      const m = session.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

    const idx = messages.findIndex(m => m.id === messageId && m.type === 'decision');
    if (idx < 0) return res.status(404).json({ error: 'Décision introuvable' });

    const now = new Date().toISOString();
    messages[idx] = {
      ...messages[idx],
      status,
      answer:     status === 'answered' ? answer.trim() : (status === 'delegated' ? 'delegated' : null),
      answeredAt: (status === 'answered' || status === 'delegated') ? now : null,
    };

    // Si answered ou delegated : injecter un message système dans l'historique agents
    let systemMessage = null;
    if (status === 'answered') {
      systemMessage = {
        id:        randomUUID(),
        role:      'system',
        type:      'decision_answer',
        content:   `📌 Décision : ${messages[idx].question} → ${answer.trim()}`,
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

// ── v3.0 : Évolution 2.4 — POST /:sessionId/generate-deliverable ─────────────

router.post('/:sessionId/generate-deliverable', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { deliverableType } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const VALID_TYPES = ['synthesis', 'memory', 'summary', 'claude_code', 'timeline_steps'];
  if (!VALID_TYPES.includes(deliverableType)) {
    return res.status(400).json({
      error: 'deliverableType invalide — valeurs acceptées : summary, synthesis, memory, claude_code, timeline_steps'
    });
  }

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    // Charger et formater l'historique de la réunion
    const messages = (() => {
      const m = session.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

    if (messages.length === 0) {
      return res.status(400).json({ error: 'Aucun message dans cette réunion' });
    }

    const historyText = messages
      .filter(m => m.role !== 'system')
      .map(m => m.role === 'human'
        ? `Participant : ${m.content}`
        : `${m.agentName} : ${m.content}`)
      .join('\n\n');

    const sessionContext = `Objectif de la réunion : ${session.task}\n\nTranscription :\n${historyText}`;

    // ── Génération selon le type ──────────────────────────────────────────────

    // ── Compte-rendu : synthesis (legacy) | memory (legacy) | summary (v3.3) ──
    if (['synthesis', 'memory', 'summary'].includes(deliverableType)) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: 'Tu es un expert en synthèse de réunion d\'entreprise. Tu rédiges des comptes-rendus clairs et structurés. Réponds uniquement en français, sans introduction ni conclusion génériques.',
        messages: [{
          role: 'user',
          content: `Génère un compte-rendu structuré de cette réunion.\n\nFormat :\n## Objectif\n## Points discutés\n## Décisions prises\n## Actions à mener\n\nMax 600 mots.\n\n${sessionContext}`
        }]
      });
      const content = response.content[0].text.trim();
      await db('Session').where({ id: sessionId }).update({ summary: content });

      // Auto-injection dans project.context pour summary (et memory legacy)
      if (deliverableType === 'summary' || deliverableType === 'memory') {
        const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const entry = `[SESSION:${sessionId} | ${date} — ${session.task}]\n${content}`;
        const current = project.context || '';
        let newContext = (current ? current + '\n---\n' : '') + entry;
        const MAX_CHARS = 10000;
        if (newContext.length > MAX_CHARS) {
          const parts = newContext.split('\n---\n');
          while (parts.length > 1 && parts.join('\n---\n').length > MAX_CHARS) parts.shift();
          newContext = parts.join('\n---\n');
        }
        await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
      }

      return res.json({ deliverableType, content });
    }

    if (deliverableType === 'claude_code') {
      // Contexte projet
      const devDir   = project.devDirectory?.trim() || null;
      const stackLines = formatTechStackForPrompt(project.techStack);

      // Décisions épinglées pendant la réunion
      const decisions = messages.filter(m => m.pinned || m.type === 'decision');

      // Sections injectées dans le prompt LLM
      const briefSection = project.brief?.trim()
        ? `Brief du projet :\n${project.brief.trim()}\n\n`
        : '';
      const stackSection = stackLines.length > 0
        ? `Stack technique :\n${stackLines.join('\n')}\n\n`
        : '';
      const decisionsSection = decisions.length > 0
        ? `Décisions prises pendant la réunion (contraintes obligatoires) :\n${decisions.map((m, i) => `${i + 1}. ${m.content}`).join('\n')}\n\n`
        : '';
      const cdInstruction = devDir
        ? `- Commencer IMPÉRATIVEMENT par la ligne : cd "${devDir}"`
        : '- Préciser que l\'utilisateur doit naviguer manuellement vers son répertoire de projet';

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: 'Tu es un expert en rédaction de prompts techniques pour Claude Code. Tu génères des prompts précis, calibrés et directement utilisables. Réponds uniquement en français.',
        messages: [{
          role: 'user',
          content:
`${briefSection}Objectif de la réunion : ${session.task}

${stackSection}${decisionsSection}Génère un prompt Claude Code prêt à être copié dans Claude Code.

Le prompt généré doit :
${cdInstruction}
- Calibrer sa complexité sur l'objectif réel (ne pas over-engineer : chaque tâche doit servir directement "${session.task}")
- Lister les tâches concrètes à implémenter dans l'ordre logique (numérotées)
- Préciser les fichiers ou composants concernés si identifiés dans la réunion
- Intégrer les décisions prises comme contraintes non négociables
- Demander une validation étape par étape avant de passer à la suivante
- Être rédigé en français

Conversation de la réunion :
${historyText}`
        }]
      });
      const content = response.content[0].text.trim();
      await db('Session').where({ id: sessionId }).update({ summary: content, hasCode: true });
      return res.json({ deliverableType, content });
    }

    if (deliverableType === 'timeline_steps') {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: 'Tu extrais des jalons et tâches actionnables depuis une réunion. Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.',
        messages: [{
          role: 'user',
          content: `Extrais les étapes actionnables de cette réunion sous forme de jalons et tâches.\n\nRetourne UNIQUEMENT ce JSON :\n{\n  "milestones": [\n    { "title": "...", "description": "...", "type": "meeting", "todos": [{ "title": "...", "priority": "high" }] }\n  ],\n  "standalone_todos": [{ "title": "...", "priority": "medium" }]\n}\n\n${sessionContext}`
        }]
      });

      const raw = response.content[0].text.trim()
        .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Réponse JSON invalide depuis Claude');
      const parsed = JSON.parse(match[0]);
      const content = {
        milestones:       Array.isArray(parsed.milestones)       ? parsed.milestones       : [],
        standalone_todos: Array.isArray(parsed.standalone_todos) ? parsed.standalone_todos : []
      };
      await db('Session').where({ id: sessionId }).update({ planSuggestions: JSON.stringify(content) });
      return res.json({ deliverableType, content });
    }

  } catch (err) {
    console.error('[sessions/generate-deliverable]', err.message);
    res.status(500).json({ error: `Erreur lors de la génération : ${err.message}` });
  }
});

// ── v3.4 : Orchestrateur IA ───────────────────────────────────────────────────

const MAX_TURNS       = 12; // max de contributions par échange humain
const MAX_CONSECUTIVE = 2;  // max de contributions consécutives du même agent

async function loadMessages(sessionId) {
  const [s] = await db('Session').select('messages').where({ id: sessionId }).limit(1);
  const m = s?.messages;
  if (Array.isArray(m)) return m;
  try { return JSON.parse(m || '[]'); } catch { return []; }
}

function areSimilar(q1, q2, threshold = 0.6) {
  const words1 = new Set(q1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(q2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 && intersection.length / union.size > threshold;
}

async function orchestrate({ session, project, messages, activeAgents,
  lastAgentId, consecutiveCount, humanMessage, resumeAfterDecision, delegated = false, turnCount = 0 }) {

  // Cas 1 : agent unique — pas besoin d'orchestrer
  if (activeAgents.length === 1) {
    return { agentId: activeAgents[0].id, reason: '', shouldClose: false };
  }

  // Cas 2 : reprise après décision → l'agent qui a posé la question reprend
  if (resumeAfterDecision) {
    const lastDecision = [...messages].reverse().find(m => m.type === 'decision');
    if (lastDecision) {
      const agent = activeAgents.find(a => a.name === lastDecision.agentName);
      if (agent) return { agentId: agent.id, reason: 'Reprend après sa question', shouldClose: false };
    }
  }

  // Cas 3 : @mention explicite dans le message humain
  if (humanMessage) {
    for (const agent of activeAgents) {
      if (humanMessage.toLowerCase().includes(`@${agent.name.toLowerCase()}`)) {
        return { agentId: agent.id, reason: 'Mentionné directement', shouldClose: false };
      }
    }
  }

  // Cas 4 : appel Claude pour décider dynamiquement
  // Exclure les agents avec questions répétitives
  const excludedAgentIds = new Set();
  for (const agent of activeAgents) {
    const recentDecisions = messages
      .filter(m => m.type === 'decision' && m.agentName === agent.name)
      .slice(-3);
    if (recentDecisions.length >= 2) {
      const lastQ = recentDecisions[recentDecisions.length - 1].question;
      const prevQ = recentDecisions[recentDecisions.length - 2].question;
      if (areSimilar(lastQ, prevQ)) excludedAgentIds.add(agent.id);
    }
  }
  const candidateAgents  = activeAgents.filter(a => !excludedAgentIds.has(a.id));
  const agentsForSelection = candidateAgents.length > 0 ? candidateAgents : activeAgents;

  const agentList = agentsForSelection.map((a, i) => `${i + 1}. ${a.name} (${a.role})`).join('\n');
  const recentMessages = messages.slice(-6).map(m =>
    `[${m.agentName || m.role}]: ${(m.content || '').slice(0, 200)}`
  ).join('\n');
  const blockedAgent = consecutiveCount >= MAX_CONSECUTIVE
    ? agentsForSelection.find(a => a.id === lastAgentId)?.name
    : null;

  const lastMsg      = messages[messages.length - 1];
  const lastIsHuman  = lastMsg?.role === 'human';
  const humanPriorityNote = lastIsHuman
    ? `\n⚠️ PRIORITÉ ABSOLUE : Le dernier message dans l'historique est un message humain ("${(lastMsg.content || '').slice(0, 120)}"). L'agent le plus pertinent pour répondre directement à CE message doit prendre la parole en premier.\n`
    : '';

  const intentionKey = Array.isArray(session.intention) ? session.intention[0] : '';
  const tourNote =
    (turnCount >= 4 && intentionKey === 'claude_code')
      ? `\n🚨 IMPORTANT : Cette réunion claude_code est au tour ${turnCount}. Si les besoins principaux ont été clarifiés, tu DOIS proposer shouldClose=true.`
    : (turnCount >= 3 && intentionKey === 'summary')
      ? `\n🚨 IMPORTANT : Cette réunion compte-rendu est au tour ${turnCount}. Si les points clés, décisions et actions ont été couverts, tu DOIS proposer shouldClose=true.`
    : (turnCount >= 4 && intentionKey === 'timeline_steps')
      ? `\n🚨 IMPORTANT : Cette réunion timeline_steps est au tour ${turnCount}. Si les étapes ont été identifiées et structurées, tu DOIS proposer shouldClose=true.`
    : '';

  const closeInstruction =
    intentionKey === 'claude_code'
      ? "Pour une réunion claude_code : considère shouldClose=true si les agents ont fait au moins 2 tours complets ET que les besoins principaux ont été clarifiés. Ne cherche pas la perfection — le prompt sera complété par Claude Code lui-même."
    : intentionKey === 'summary'
      ? "Pour un compte-rendu : considère shouldClose=true dès que les points clés, décisions et actions ont été couverts. 3 tours suffisent généralement."
    : intentionKey === 'timeline_steps'
      ? "Pour une réunion timeline_steps : considère shouldClose=true dès que les étapes principales ont été identifiées et structurées. 4 tours suffisent généralement."
    : "seulement si l'objectif est clairement atteint ET que les agents ont tourné en rond sur les mêmes points";

  const prompt = `Tu es l'orchestrateur d'une réunion IA.

Objectif de la réunion : "${session.task}"
Livrable attendu : ${intentionKey || 'compte-rendu'}
Tour actuel : ${turnCount} / ${MAX_TURNS}${tourNote}

Agents disponibles :
${agentList}

${blockedAgent ? `⚠️ ${blockedAgent} a déjà parlé ${consecutiveCount} fois de suite. Ne le sélectionne PAS.` : ''}
${humanPriorityNote}
Si la dernière contribution contient beaucoup de jargon technique ou est difficile à comprendre pour un non-expert, donne la priorité à un agent qui peut reformuler ou vulgariser ce qui vient d'être dit.
${delegated ? `⚡ L'humain a délégué une décision aux agents. Les agents doivent débattre entre eux, argumenter leurs positions et converger vers une recommandation claire. L'agent le plus pertinent propose une conclusion en dernier.\n` : ''}Derniers échanges :
${recentMessages || '(début de réunion)'}

Décide maintenant :
1. Quel agent doit prendre la parole ? (numéro de 1 à ${agentsForSelection.length})
2. Pourquoi ? (1 phrase courte)
3. La réunion doit-elle se clore ? (oui/non) — ${closeInstruction}

Réponds UNIQUEMENT avec ce JSON :
{"agentIndex": 1, "reason": "...", "shouldClose": false}`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });
    const text  = response.content[0].text.trim();
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    const dec   = JSON.parse(match?.[0] || clean);
    const idx   = Math.max(0, Math.min((dec.agentIndex ?? 1) - 1, agentsForSelection.length - 1));
    return {
      agentId:     agentsForSelection[idx].id,
      reason:      dec.reason      || '',
      shouldClose: dec.shouldClose === true,
      usage: {
        inputTokens:  response.usage?.input_tokens  || 0,
        outputTokens: response.usage?.output_tokens || 0,
      },
    };
  } catch {
    // Fallback round-robin si l'orchestrateur échoue
    const lastIdx  = agentsForSelection.findIndex(a => a.id === lastAgentId);
    const nextIdx  = (lastIdx + 1) % agentsForSelection.length;
    return { agentId: agentsForSelection[nextIdx].id, reason: '', shouldClose: false, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

// ── v3.0 : Évolution 2.1 — POST /:sessionId/chat (moteur de conversation SSE) ──

router.post('/:sessionId/chat', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { message: humanMessage, agentIds, attachments: rawAttachments, resume, delegated } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const hasText        = !!humanMessage?.trim();
  const hasAttachments = Array.isArray(rawAttachments) && rawAttachments.length > 0;
  console.log(`[chat] session=${sessionId} resume=${!!resume} hasText=${hasText} hasAtt=${hasAttachments}`);
  // resume:true = reprise après décision actée, message vide autorisé
  if (!hasText && !hasAttachments && !resume) {
    return res.status(400).json({ error: 'Message ou pièce jointe requise' });
  }

  // ── Validation pré-SSE ────────────────────────────────────────────────────
  let session, project, activeAgents, projectMilestones;
  try {
    project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) {
      return res.status(400).json({ error: 'Session déjà close' });
    }
    session = s;

    // Résoudre les agents actifs : agentIds (filtre optionnel) sinon session.activeAgents
    const storedAgents = (() => {
      const a = s.activeAgents;
      if (Array.isArray(a)) return a;
      try { return JSON.parse(a || '[]'); } catch { return []; }
    })();

    if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
      const agentMap = {};
      storedAgents.forEach(a => { agentMap[a.id] = a; });
      activeAgents = agentIds.map(id => agentMap[id]).filter(Boolean);
    } else {
      activeAgents = storedAgents;
    }

    if (activeAgents.length === 0) {
      return res.status(400).json({ error: 'Aucun agent actif dans cette réunion' });
    }

    projectMilestones = await db('Milestone')
      .select('title', 'status')
      .where({ projectId })
      .orderBy('displayOrder', 'asc');
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  // ── Ouvrir la connexion SSE ───────────────────────────────────────────────
  if (req.socket) req.socket.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };

  const heartbeatInterval = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeatInterval); }
  }, 15000);

  const abortController = new AbortController();
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    abortController.abort();
  });

  send('connected', { sessionId });

  try {
    // 1. Sauvegarder le message humain (skip si resume silencieux sans contenu)
    if (hasText || hasAttachments) {
      const attachmentRefs = hasAttachments
        ? rawAttachments.map(a => ({ name: a.name, type: a.type, isImage: a.isImage }))
        : undefined;
      const humanMsg = {
        id:        randomUUID(),
        role:      'human',
        agentName: null,
        content:   hasText
          ? humanMessage.trim()
          : `[${rawAttachments.map(a => a.name).join(', ')}]`,
        timestamp: new Date().toISOString(),
        type:      'message',
        pinned:    false,
        ...(attachmentRefs ? { attachments: attachmentRefs } : {}),
      };
      await appendMessageEntry(sessionId, humanMsg);
    }

    // Recharger depuis la DB : inclut le message humain qu'on vient d'ajouter ET
    // le message agent interrompu sauvegardé par l'AbortError catch du tour précédent.
    // Ce rechargement doit impérativement précéder le premier appel à orchestrate().
    const [freshSession] = await db('Session')
      .select('messages', 'task', 'intention')
      .where({ id: sessionId })
      .limit(1);

    let currentMessages = (() => {
      const m = freshSession.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

    // Fix v3.7 : si resume, attendre 200ms que le decision_answer soit bien persisté en base
    if (resume) {
      await new Promise(resolve => setTimeout(resolve, 200));
      currentMessages = await loadMessages(sessionId);
      const lastMsg = currentMessages[currentMessages.length - 1];
      console.log('[resume] dernier message:', lastMsg?.type, lastMsg?.content?.slice(0, 50));
    }

    const intention = (() => {
      const i = freshSession.intention;
      if (Array.isArray(i)) return i;
      try { return JSON.parse(i || '[]'); } catch { return []; }
    })();

    // Résumé de la timeline pour le contexte agent
    const TL_EMOJI = { done: '✅', in_progress: '🔵', blocked: '🔴', pending: '⚪' };
    const timelineText = projectMilestones.length > 0
      ? projectMilestones.filter(m => m.status !== 'done').slice(0, 5).map(m => `${TL_EMOJI[m.status] || '⚪'} ${m.title}`).join('\n')
      : '';

    const intentionText = Array.isArray(intention) && intention.length > 0
      ? intention.join(', ')
      : 'non défini';

    // Contexte projet immuable sur toute la durée du tour
    const briefSection    = project.brief
      ? `\nBrief du projet :\n${project.brief}\n`   : '';
    const timelineSection = timelineText
      ? `\nÉtat de la timeline :\n${timelineText}\n` : '';
    const memorySection   = project.context
      ? `\nMémoire du projet :\n${project.context.substring(0, 1500)}\n` : '';

    // 2. Boucle orchestrée v3.4
    const resumeAfterDecision = !!resume;
    let turnCount        = 0;
    let lastAgentId      = null;
    let consecutiveCount = 0;
    let conversationDone = false;
    let decisionEmitted  = false;
    const decisionCountPerAgent = {};
    let turnInputTokens  = 0;
    let turnOutputTokens = 0;

    while (turnCount < MAX_TURNS && !conversationDone && !abortController.signal.aborted) {

      // 2a. Orchestrateur décide qui parle
      const next = await orchestrate({
        session, project, messages: currentMessages, activeAgents,
        lastAgentId, consecutiveCount,
        humanMessage:         hasText ? humanMessage : null,
        resumeAfterDecision:  turnCount === 0 && resumeAfterDecision,
        delegated:            turnCount === 0 && !!delegated,
        turnCount,
      });

      turnInputTokens  += next.usage?.inputTokens  || 0;
      turnOutputTokens += next.usage?.outputTokens || 0;

      if (next.shouldClose) {
        send('suggest_close', { reason: next.reason });
        conversationDone = true;
        break;
      }

      const agent = activeAgents.find(a => a.id === next.agentId);
      if (!agent) break;
      if (abortController.signal.aborted) break;

      // 2b. L'agent prend la parole
      send('agent_start', { agentName: agent.name, agentRole: agent.role, reason: next.reason || '' });

      // Historique reconstruit depuis les messages courants (mis à jour à chaque tour)
      const historyLines = currentMessages
        .slice(-10)
        .filter(m => m.role !== 'system' || m.type === 'decision_answer')
        .map(m => {
          if (m.role === 'human')                                  return `Participant : ${m.content}`;
          if (m.role === 'system' && m.type === 'decision_answer') return `[${m.content}]`;
          return `${m.agentName} : ${m.content}`;
        });
      const historyText  = historyLines.join('\n\n');
      const reasonLine   = next.reason ? `\nRaison de ta prise de parole : ${next.reason}\n` : '';

      const intentionInstruction = intention[0] === 'claude_code'
        ? '\nINTENTION DE CETTE RÉUNION : Préparer un prompt pour Claude Code.\nTu NE dois PAS résumer, structurer ou rédiger le prompt Claude Code pendant la réunion. Tu NE dois PAS faire de récapitulatif. Pose uniquement des questions pour clarifier les besoins. Le prompt sera généré automatiquement à la clôture. Si tu es tenté de faire un récap, pose une question à la place.'
        : intention[0] === 'summary'
        ? '\nINTENTION DE CETTE RÉUNION : Produire un compte-rendu à la clôture.\n- Tu NE dois PAS rédiger le compte-rendu pendant les échanges\n- Contribue à la conversation, apporte tes analyses et suggestions\n- Le compte-rendu sera généré automatiquement à la clôture'
        : intention[0] === 'timeline_steps'
        ? '\nINTENTION DE CETTE RÉUNION : Identifier des étapes pour la timeline.\n- Tu NE dois PAS lister les étapes finales toi-même\n- Utilise [SUGGEST_STEP: titre] pour signaler une étape au fil des échanges\n- Le plan final sera consolidé à la clôture'
        : '';

      const systemPrompt =
`Tu es ${agent.name}, ${agent.role}.
${agent.systemPrompt || ''}
${briefSection}${timelineSection}${memorySection}
Objectif de cette réunion : ${session.task}
Livrable attendu : ${intentionText}
${reasonLine}
Tu participes à une réunion collaborative avec d'autres agents.
Tu peux rebondir sur ce qu'un autre agent vient de dire, lui poser une question directement, ou demander une précision à l'humain.
Mentionne un agent avec "@NomAgent, ..." pour lui adresser directement ta remarque.
Ne répète PAS ce que les autres agents ont déjà dit.
Sois concis (100 mots max par contribution). Si tu n'as rien de nouveau à apporter, dis-le en 1 phrase.
Quand une décision importante doit être prise par l'humain, utilise EXACTEMENT ce format (JSON valide, une seule ligne) :
[DECISION:{"question":"La question claire et courte","choices":["Option A","Option B","Option C","Autre (précise)"],"context":"Pourquoi cette décision est importante (1 phrase simple)"}]
Règles : maximum 4 choix proposés, toujours inclure "Autre (précise)" comme dernier choix, question compréhensible par un non-technicien, contexte en langage simple, une seule fois par contribution.
RÈGLE ABSOLUE : Si l'humain a répondu à une de tes questions précédentes (même partiellement, même de façon imprécise), tu DOIS accepter cette réponse et avancer. Ne repose JAMAIS la même question ou une variante de la même question. Si la réponse est insuffisante, reformule en une phrase et passe à autre chose.
Si et seulement si une compétence précise et indispensable à l'objectif "${session.task}" est clairement absente parmi les agents présents (${activeAgents.map(a => `${a.name} — ${a.role}`).join('; ')}), tu peux suggérer UN expert en ajoutant : [SUGGEST_AGENT: NomAgent, description concise du rôle]. N'utilise ce marqueur que si l'apport de cet expert serait décisif pour atteindre le livrable attendu et qu'aucun agent présent ne couvre cette compétence.
Si une étape concrète doit être ajoutée à la timeline, ajoute : [SUGGEST_STEP: titre de l'étape].
Maximum un marqueur de chaque type par réponse.
RÈGLE DE COMMUNICATION :
- Adapte ton langage à un interlocuteur qui n'est PAS expert dans ton domaine
- Évite le jargon technique et les acronymes non expliqués
- Si tu dois utiliser un terme technique, explique-le en une phrase simple
- Préfère des exemples concrets aux abstractions
Si tu reformules ou vulgarises la contribution d'un autre agent, commence par : "Pour expliquer simplement ce que [NomAgent] vient de dire : ..."
RÈGLE ABSOLUE SUR LES DÉCISIONS :
- Tu ne peux JAMAIS prendre une décision à la place de l'humain
- Si une décision tarde, signale-le en une phrase : "J'attends la réponse de l'humain avant de continuer."
- N'avance JAMAIS sans la réponse de l'humain sur une décision posée${intentionInstruction}`;

      const baseText = historyText
        ? `Historique de la réunion :\n${historyText}\n\nC'est maintenant ton tour de contribuer.`
        : `Objectif : ${session.task}\n\nC'est le début de la réunion. Donne ta première contribution.`;

      // Pièces jointes uniquement au premier tour
      let userMessage;
      if (hasAttachments && turnCount === 0) {
        try {
          const contentBlocks = [{ type: 'text', text: baseText }];
          for (const att of rawAttachments) {
            if (att.isImage && att.base64 && att.mediaType) {
              const data = att.base64.replace(/^data:[^;]+;base64,/, '');
              contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data } });
            } else if (!att.isImage && att.text) {
              contentBlocks.push({ type: 'text', text: `[Fichier texte joint : ${att.name}]\n${att.text}` });
            }
          }
          userMessage = contentBlocks;
        } catch (attErr) {
          console.error('[sessions] erreur construction pièces jointes:', attErr.message);
          send('error', { message: 'Erreur lors du traitement des pièces jointes.' });
          userMessage = baseText;
        }
      } else {
        userMessage = baseText;
      }

      let partialAgentText = '';
      let agentFullText;
      let agentUsage = { inputTokens: 0, outputTokens: 0 };
      try {
        const agentResult = await streamAgent(systemPrompt, userMessage, (chunk) => {
          partialAgentText += chunk;
          send('chunk', { agentName: agent.name, text: chunk });
        }, 2048, MODEL, abortController.signal);
        agentFullText = agentResult.text;
        agentUsage    = agentResult.usage;
      } catch (agentErr) {
        if (abortController.signal.aborted || agentErr.name === 'AbortError') {
          if (partialAgentText.trim()) {
            const partialMsg = {
              id: randomUUID(), role: 'agent', agentName: agent.name,
              content: partialAgentText.trim(), timestamp: new Date().toISOString(),
              type: 'message', pinned: false, interrupted: true,
            };
            await appendMessageEntry(sessionId, partialMsg).catch(() => {});
          }
          res.end();
          return;
        }
        throw agentErr;
      }

      turnInputTokens  += agentUsage.inputTokens  || 0;
      turnOutputTokens += agentUsage.outputTokens || 0;

      // Anti-boucle : limite d'une seule décision par agent par tour humain
      let processedText = agentFullText;
      if (/\[DECISION:/.test(agentFullText)) {
        if ((decisionCountPerAgent[agent.name] || 0) >= 1) {
          processedText = agentFullText.replace(/\[DECISION:\{[\s\S]*?\}\]/gs, '').trim();
        }
        decisionCountPerAgent[agent.name] = (decisionCountPerAgent[agent.name] || 0) + 1;
      }

      // Détecter les marqueurs spéciaux
      const decisionMatch   = processedText.match(/\[DECISION:(\{[\s\S]*?\})\]/);
      const suggestAgtMatch = processedText.match(/\[SUGGEST_AGENT:\s*([\s\S]*?)\]/);
      const suggestStpMatch = processedText.match(/\[SUGGEST_STEP:\s*([\s\S]*?)\]/);

      const agentContent = processedText
        .replace(/\[DECISION:[\s\S]*?\]/g, '')
        .replace(/\[SUGGEST_AGENT:[\s\S]*?\]/g, '')
        .replace(/\[SUGGEST_STEP:[\s\S]*?\]/g, '')
        .trim();

      const agentMsg = {
        id:        randomUUID(),
        role:      'agent',
        agentName: agent.name,
        ...(next.reason ? { reason: next.reason } : {}),
        content:   agentContent,
        timestamp: new Date().toISOString(),
        type:      'message',
        pinned:    false,
      };
      await appendMessageEntry(sessionId, agentMsg);

      send('agent_done', { agentName: agent.name, messageId: agentMsg.id });

      // Décision structurée
      if (decisionMatch) {
        let decisionData = null;
        try { decisionData = JSON.parse(decisionMatch[1]); } catch {}
        if (decisionData?.question) {
          const decisionMsg = {
            id:         randomUUID(),
            role:       'system',
            type:       'decision',
            question:   decisionData.question,
            choices:    Array.isArray(decisionData.choices) ? decisionData.choices : [],
            context:    decisionData.context || '',
            status:     'pending',
            answer:     null,
            answeredAt: null,
            agentName:  agent.name,
            timestamp:  new Date().toISOString(),
          };
          await appendMessageEntry(sessionId, decisionMsg);
          send('decision', {
            messageId: decisionMsg.id,
            question:  decisionMsg.question,
            choices:   decisionMsg.choices,
            context:   decisionMsg.context,
            agentName: agent.name,
          });
          decisionEmitted = true;
        }
      }

      if (decisionEmitted) { conversationDone = true; break; }

      if (suggestAgtMatch) {
        const parts = suggestAgtMatch[1].split(',').map(p => p.trim());
        const sugName = parts[0] || '';
        const sugRole = parts.slice(1).join(', ') || '';
        if (sugName) send('suggest_agent', { name: sugName, role: sugRole, reason: `Suggéré par ${agent.name}` });
      }

      if (suggestStpMatch) {
        const stepTitle = suggestStpMatch[1].trim();
        if (stepTitle) {
          const meetingIntention = Array.isArray(session.intention) ? session.intention : [];
          if (meetingIntention.includes('timeline_steps')) {
            send('suggest_step', { title: stepTitle, type: 'summary' });
          } else {
            await appendPendingStepSuggestion(sessionId, {
              title: stepTitle,
              type: 'summary',
              agentName: agent.name,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // 2c. Mettre à jour les compteurs et recharger l'historique
      consecutiveCount = next.agentId === lastAgentId ? consecutiveCount + 1 : 1;
      lastAgentId      = next.agentId;
      turnCount++;
      currentMessages  = await loadMessages(sessionId);
    }

    // 3. Fin du tour : màj tokens DB + timestamp projet + signal turn_complete
    try {
      const [sessionRow] = await db('Session').select('tokensUsed').where({ id: sessionId }).limit(1);
      const existing = sessionRow?.tokensUsed || { input: 0, output: 0, total: 0 };
      const updatedTokens = {
        input:  (existing.input  || 0) + turnInputTokens,
        output: (existing.output || 0) + turnOutputTokens,
        total:  (existing.total  || 0) + turnInputTokens + turnOutputTokens,
      };
      await db('Session').where({ id: sessionId }).update({ tokensUsed: JSON.stringify(updatedTokens) });
      await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
      send('turn_complete', { sessionId, pendingDecision: decisionEmitted, tokensUsed: updatedTokens });
    } catch {
      await db('Project').where({ id: projectId }).update({ updatedAt: new Date() }).catch(() => {});
      send('turn_complete', { sessionId, pendingDecision: decisionEmitted });
    }
    res.end();

  } catch (err) {
    if (abortController.signal.aborted || err.name === 'AbortError') {
      res.end();
      return;
    }
    console.error('[sessions/chat]', err.message, err.stack);
    try { send('error', { message: `Erreur : ${err.message}` }); } catch {}
    res.end();
  } finally {
    clearInterval(heartbeatInterval);
  }
});

module.exports = router;
