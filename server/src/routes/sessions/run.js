const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const anthropic      = require('../../services/anthropic');
const { findProject: getProject, formatTechStack } = require('../../utils/projectHelpers');
const {
  MODEL, streamAgent,
  updateProjectContext,
  appendTimelineEntry, patchTimelineEntry,
  appendPendingStepSuggestion,
} = require('./helpers');

const router = express.Router({ mergeParams: true });

// Questions agents en attente d'une réponse humaine (en mémoire, par sessionId)
const pendingQuestions = new Map();

function saveSession(sessionId, exchanges, summary, status) {
  return db('Session').where({ id: sessionId }).update({
    exchanges: JSON.stringify(exchanges),
    summary: summary || null,
    status
  });
}

// ── extractSuggestedTools ─────────────────────────────────────────────────────

async function createStackCheckIfNeeded(projectId, suggestedTools, missingTools) {
  try {
    const [existing] = await db('Milestone').where({ projectId, type: 'stack_check' }).limit(1);
    if (existing) return;

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

    for (const [key, cat] of Object.entries(CAT_LABELS)) {
      const selected = Array.isArray(ts[key]) ? ts[key] : [];
      for (const item of selected) {
        const label = item === 'Autre' ? (ts[`${key}_autre`] || null) : item;
        if (!label) continue;
        items.push({ id: `tech-${key}-${slug(label)}`, label, category: cat, checked: true, notes: '' });
      }
    }
    for (const tool of suggestedTools) {
      if (!items.some(i => i.label.toLowerCase() === tool.toLowerCase())) {
        items.push({ id: `sugg-${slug(tool)}`, label: tool, category: 'Suggéré par les agents', checked: false, notes: '' });
      }
    }
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

    if (projectId && (suggestedTools.length > 0 || missingTools.length > 0)) {
      await createStackCheckIfNeeded(projectId, suggestedTools, missingTools);
    }
  } catch (err) {
    console.error('[extractSuggestedTools]', err.message);
  }
}

// ── extractPlanSuggestions ────────────────────────────────────────────────────

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

// ── waitForAnswer ─────────────────────────────────────────────────────────────

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

// ── buildToolboxSection ───────────────────────────────────────────────────────

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

// ── appendPendingToolSuggestion ───────────────────────────────────────────────

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

// ── POST /:sessionId/run — Orchestration agents (SSE, mode legacy) ────────────

router.post('/:sessionId/run', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { humanInput } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  let session;
  let project = null;
  let projectContext = null;
  let parentExchangesBlock = '';
  let stackLines = [];
  let projectMilestonesRun = [];
  let userToolbox = {};
  try {
    project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [s] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    if (['accepted', 'abandoned'].includes(s.status)) return res.status(400).json({ error: 'Session déjà close' });
    session = s;

    projectMilestonesRun = await db('Milestone')
      .select('title', 'type', 'status', 'description')
      .where({ projectId })
      .orderBy('displayOrder', 'asc');

    const [userRecord] = await db('User').select(['techStack', 'toolbox']).where({ id: req.user.id }).limit(1);
    const userStack = typeof userRecord?.techStack === 'string'
      ? JSON.parse(userRecord.techStack) : (userRecord?.techStack || {});
    const projectStack = project.techStack
      ? (typeof project.techStack === 'string' ? JSON.parse(project.techStack) : project.techStack)
      : null;
    const effectiveStack = projectStack ?? userStack;
    stackLines = formatTechStack(effectiveStack);
    userToolbox = typeof userRecord?.toolbox === 'string'
      ? JSON.parse(userRecord.toolbox || '{}') : (userRecord?.toolbox || {});

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

  if (req.socket) req.socket.setNoDelay(true);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    const pending = pendingQuestions.get(sessionId);
    if (pending) pending.reject(new Error('Client déconnecté'));
  });

  send('connected', { sessionId });

  const heartbeatInterval = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch { clearInterval(heartbeatInterval); }
  }, 15000);

  const isConversation = session.mode === 'conversation';
  const isAdditionalPrompt = !!session.summary && !!humanInput?.trim();
  const agents = typeof session.agents === 'string' ? JSON.parse(session.agents) : session.agents;
  const exchanges = typeof session.exchanges === 'string' ? JSON.parse(session.exchanges) : session.exchanges;

  const turnNumber = isConversation
    ? exchanges.filter(e => e.type === 'human').length + 1
    : null;

  const existingSummaryCount = isAdditionalPrompt
    ? (exchanges.some(e => e.type === 'summary')
        ? exchanges.filter(e => e.type === 'summary').length
        : (session.summary ? 1 : 0))
    : 0;
  const additionalTurnNumber = isAdditionalPrompt ? existingSummaryCount + 1 : null;

  const tlIds = { agents: {}, synthesis: null, question: null };
  let isFirstAgent = true;

  try {
    if (isConversation && humanInput?.trim()) {
      exchanges.push({
        type: 'human',
        agent: 'Utilisateur',
        content: humanInput.trim(),
        turn: turnNumber - 1,
        createdAt: new Date().toISOString()
      });
    }

    if (isAdditionalPrompt) {
      exchanges.push({
        type: 'human',
        agent: 'Utilisateur',
        content: humanInput.trim(),
        turn: additionalTurnNumber,
        createdAt: new Date().toISOString()
      });
    }

    const previousSynthesisForAgents = isAdditionalPrompt
      ? (exchanges.filter(e => e.type === 'summary').pop()?.content || session.summary || '')
      : '';

    for (const agent of agents) {
      send('agent_start', { name: agent.name, role: agent.role });

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
        800, session.model || MODEL, null, session.webSearchEnabled === true
      );

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
      await saveSession(sessionId, exchanges, null, 'open');
      await db('Project').where({ id: projectId }).update({ updatedAt: new Date() });
      send('turn_complete', { sessionId, turn: turnNumber });
      res.end();
    } else {
      send('summary_start', {});

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

      if (session.milestoneId) {
        try {
          await db('Milestone').where({ id: session.milestoneId }).update({
            status: summaryHasCode ? 'in_progress' : 'done'
          });
        } catch {}
      }

      send('complete', { sessionId });

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

// ── POST /:sessionId/synthesize — Synthèse manuelle (mode conversation SSE) ───

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

    if (session.milestoneId) {
      try {
        await db('Milestone').where({ id: session.milestoneId }).update({
          status: convHasCode ? 'in_progress' : 'done'
        });
      } catch {}
    }

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

// ── POST /:sessionId/answer — Réponse humaine à une question agent ─────────────

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

// Exporter pendingQuestions n'est pas nécessaire — /answer et /run sont dans ce même fichier.

module.exports = router;
