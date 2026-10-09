const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const anthropic      = require('../../services/anthropic');
const { findProject: getProject } = require('../../utils/projectHelpers');
const multer  = require('multer');
const mammoth = require('mammoth');
const XLSX    = require('xlsx');
const {
  MODEL,
  areSimilar,
  callAgent,
  appendMessageEntry,
  appendPendingMeetingSuggestion,
} = require('./helpers');
const { buildAgentSystemPrompt } = require('../../services/prompts/agentPrompt');
const { buildOrchestratorPrompt, MAX_TURNS } = require('../../services/prompts/orchestratorPrompt');
const { parseAgentOutput, detectArtifactRequest } = require('../../services/markers');
const { decisionBudgetFor } = require('../../services/questionModes');
const { parseJsonField } = require('../../utils/parseJsonField');
const { CATEGORIES: TOOL_CATEGORIES } = require('../../services/tools/catalog');
const {
  getProjectTools, getUserTools, formatProjectToolsForPrompt, formatUserToolsForPrompt,
  toolSuggestionFromMarker, appendToolSuggestion,
} = require('../../services/tools/toolsStore');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router({ mergeParams: true });

const MAX_CONSECUTIVE = 2;
const countDecisions = (messages) => messages.filter(m => m.type === 'decision').length;
// Tours d'agents depuis le début de la réunion (un tour = un turnId, plusieurs bulles)
const countAgentTurns = (messages) => new Set(messages.filter(m => m.role === 'agent').map(m => m.turnId || m.id)).size;

// ── Garde-fou 3.3 : repère un message qui rédige déjà le livrable claude_code
// (bloc de code de plus de 15 lignes, ou texte qui ressemble à un prompt complet)
// pendant les échanges, alors que le livrable ne doit être produit qu'à la clôture.
function looksLikeDeliverable(text) {
  const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
  if (codeBlocks.some(b => b.split('\n').length > 15)) return true;
  return /^(voici le prompt|prompt claude code|objectif\s*:|tâche\s*:)/i.test(text.trim());
}

// ── loadMessages ──────────────────────────────────────────────────────────────

async function loadMessages(sessionId) {
  const [s] = await db('Session').select('messages').where({ id: sessionId }).limit(1);
  return parseJsonField(s?.messages, []);
}

// ── orchestrate ───────────────────────────────────────────────────────────────

async function orchestrate({ session, project, messages, activeAgents,
  lastAgentId, consecutiveCount, humanMessage, resumeAfterDecision, delegated = false,
  artifactRequested = false, decisionBudget }) {

  if (activeAgents.length === 1) {
    return { agentId: activeAgents[0].id, reason: '', shouldClose: false };
  }

  // Après une réponse de l'humain, c'est un AUTRE agent qui reprend : celui qui a
  // posé la question enchaînait sinon sur une question de précision.
  let askingAgentId = null;
  let resumeNote = '';
  if (resumeAfterDecision) {
    const lastDecision = [...messages].reverse().find(m => m.type === 'decision');
    const asker = lastDecision && activeAgents.find(a => a.name === lastDecision.agentName);
    if (asker) {
      askingAgentId = asker.id;
      resumeNote = `\n↪️ L'humain vient de répondre à la question de ${asker.name}. Choisis l'agent qui fera AVANCER le sujet en tenant compte de cette réponse (pas une nouvelle question).\n`;
    }
  }

  if (humanMessage) {
    for (const agent of activeAgents) {
      if (humanMessage.toLowerCase().includes(`@${agent.name.toLowerCase()}`)) {
        return { agentId: agent.id, reason: 'Mentionné directement', shouldClose: false };
      }
    }
  }

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
  if (askingAgentId) excludedAgentIds.add(askingAgentId);
  const candidateAgents    = activeAgents.filter(a => !excludedAgentIds.has(a.id));
  const agentsForSelection = candidateAgents.length > 0 ? candidateAgents : activeAgents;

  const agentList      = agentsForSelection.map((a, i) => `${i + 1}. ${a.name} (${a.role})`).join('\n');
  const recentMessages = messages.slice(-6).map(m =>
    `[${m.agentName || m.role}]: ${(m.content || '').slice(0, 200)}`
  ).join('\n');
  const blockedAgent = consecutiveCount >= MAX_CONSECUTIVE
    ? agentsForSelection.find(a => a.id === lastAgentId)?.name
    : null;

  const lastMsg     = messages[messages.length - 1];
  const lastIsHuman = lastMsg?.role === 'human';
  const humanPriorityNote = (lastIsHuman
    ? `\n⚠️ PRIORITÉ ABSOLUE : Le dernier message dans l'historique est un message humain ("${(lastMsg.content || '').slice(0, 120)}"). L'agent le plus pertinent pour répondre directement à CE message doit prendre la parole en premier.\n`
    : '')
    + (artifactRequested
      ? `\n🎨 L'humain demande une ILLUSTRATION (schéma, maquette ou visuel) : choisis l'agent le plus compétent pour la produire sur ce sujet. Ne propose pas shouldClose.\n`
      : '')
    + resumeNote;

  // Tours comptés sur toute la réunion : le compteur de la requête repart à 0
  // après chaque réponse de l'humain, la suggestion de clôture ne se déclenchait jamais.
  const prompt = buildOrchestratorPrompt({
    session,
    agentsForSelection,
    recentMessagesText: recentMessages,
    blockedAgentName: blockedAgent,
    blockedAgentCount: consecutiveCount,
    humanPriorityNote,
    delegated,
    turnCount: countAgentTurns(messages),
    decisionsLeft: Math.max(0, decisionBudget - countDecisions(messages)),
  });

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
    const lastIdx = agentsForSelection.findIndex(a => a.id === lastAgentId);
    const nextIdx = (lastIdx + 1) % agentsForSelection.length;
    return { agentId: agentsForSelection[nextIdx].id, reason: '', shouldClose: false, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

// ── POST /:sessionId/extract-file — Extraction texte docx/xlsx/csv ────────────

router.post('/:sessionId/extract-file', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  const { mimetype, buffer, originalname } = req.file;
  try {
    let extractedText = '';
    if (mimetype.includes('wordprocessingml') || originalname.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value || '';
    } else if (mimetype.includes('spreadsheetml') || originalname.toLowerCase().endsWith('.xlsx')) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      workbook.SheetNames.forEach(name => {
        extractedText += `\n--- Feuille : ${name} ---\n`;
        extractedText += XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      });
    } else if (originalname.toLowerCase().endsWith('.csv') || mimetype === 'text/csv') {
      extractedText = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Format non supporté. Utilisez .docx, .xlsx ou .csv' });
    }
    res.json({ text: extractedText.trim().slice(0, 10000), filename: originalname });
  } catch (err) {
    console.error('[extract-file]', err.message);
    res.status(500).json({ error: "Erreur lors de l'extraction du fichier" });
  }
});

// ── POST /:sessionId/chat — Moteur de conversation SSE (mode meeting) ─────────

router.post('/:sessionId/chat', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { message: humanMessage, agentIds, attachments: rawAttachments, resume, delegated, artifactRequest } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const hasText        = !!humanMessage?.trim();
  // Illustration (phase 5) : bouton « 🎨 Illustrer » (artifactRequest=true) ou demande
  // explicite dans le message. Ne vaut que pour le premier agent qui répond.
  const wantsArtifact  = hasText && (artifactRequest === true || detectArtifactRequest(humanMessage));
  const artifactText   = wantsArtifact
    ? humanMessage.trim().replace(/^\s*(\/illustrer|🎨\s*Illustration demandée\s*:)\s*/i, '').slice(0, 500) || 'une illustration utile à la réunion'
    : null;
  const hasAttachments = Array.isArray(rawAttachments) && rawAttachments.length > 0;
  console.log(`[chat] session=${sessionId} resume=${!!resume} hasText=${hasText} hasAtt=${hasAttachments}`);
  if (!hasText && !hasAttachments && !resume) {
    return res.status(400).json({ error: 'Message ou pièce jointe requise' });
  }

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

    const storedAgents = parseJsonField(s.activeAgents, []);

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
      .select('id', 'title', 'status', 'type')
      .where({ projectId })
      .orderBy('displayOrder', 'asc');
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
    if (hasText || hasAttachments) {
      const attachmentRefs = hasAttachments
        ? rawAttachments.map(a => ({ name: a.name, type: a.type, isImage: !!a.isImage, isPdf: !!a.isPdf }))
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

    const [freshSession] = await db('Session')
      .select('messages', 'task', 'intention')
      .where({ id: sessionId })
      .limit(1);

    let currentMessages = parseJsonField(freshSession.messages, []);

    if (resume) {
      await new Promise(resolve => setTimeout(resolve, 200));
      currentMessages = await loadMessages(sessionId);
      const lastMsg = currentMessages[currentMessages.length - 1];
      console.log('[resume] dernier message:', lastMsg?.type, lastMsg?.content?.slice(0, 50));
    }

    const intention = parseJsonField(freshSession.intention, []);

    // Surcharge réunion > défaut projet (2.4 / 2.5)
    const expertiseLevel = session.expertiseLevel ?? project.expertiseLevel ?? 3;
    const humorLevel     = session.humorLevel     ?? project.humorLevel     ?? 2;
    // Mode de questions (réunion > projet) : budget de cartes de décision
    const decisionBudget = decisionBudgetFor(session, project);

    // Réunions du projet avec référence courte (R1, R2…) — positionnement des
    // suggestions [SUGGEST_MEETING] et dédoublonnage (phase 3.4).
    const projectMeetings = projectMilestones.map((m, i) => ({
      ref: `R${i + 1}`, id: m.id, title: m.title, status: m.status, type: m.type,
    }));

    let pastCodePromptsText = '';
    if (intention[0] === 'claude_code') {
      const pastCodeSessions = await db('Session')
        .select(['task', 'summary'])
        .where({ projectId, status: 'accepted', hasCode: true })
        .whereNotNull('summary')
        .orderBy('createdAt', 'desc')
        .limit(3);
      pastCodePromptsText = pastCodeSessions
        .map((s, i) => `Réunion précédente ${i + 1} — ${s.task} :\n${s.summary}`)
        .join('\n\n');
    }

    // Outils (phase 4) : outils validés du projet pour toutes les réunions ;
    // grille + « Mes outils » + outils déjà proposés pour les réunions de type stack.
    const projectToolsText = formatProjectToolsForPrompt(await getProjectTools(project));
    let toolReview = null;
    if (intention[0] === 'stack') {
      const userTools = (await getUserTools(req.user.id)) || [];
      toolReview = {
        toolCategories: TOOL_CATEGORIES,
        userToolsText: formatUserToolsForPrompt(userTools),
        suggested: parseJsonField(session.pendingToolSuggestions, []).map(t => t.name || t.label).filter(Boolean),
      };
    }

    const resumeAfterDecision = !!resume;
    let turnCount        = 0;
    let lastAgentId      = null;
    let consecutiveCount = 0;
    let conversationDone = false;
    let decisionEmitted  = false;
    let turnInputTokens  = 0;
    let turnOutputTokens = 0;

    while (turnCount < MAX_TURNS && !conversationDone && !abortController.signal.aborted) {

      // Recharger depuis la DB à chaque début de tour — garantit que l'historique
      // est à jour même si le rechargement de fin de tour précédent était caduc.
      currentMessages = await loadMessages(sessionId);
      console.log(`[chat turn=${turnCount}] msgs=${currentMessages.length} session=${sessionId}`);

      const next = await orchestrate({
        session, project, messages: currentMessages, activeAgents,
        lastAgentId, consecutiveCount,
        humanMessage:         hasText ? humanMessage : null,
        resumeAfterDecision:  turnCount === 0 && resumeAfterDecision,
        delegated:            turnCount === 0 && !!delegated,
        artifactRequested:    turnCount === 0 && wantsArtifact,
        decisionBudget,
      });
      const turnArtifact = turnCount === 0 && wantsArtifact ? artifactText : null;

      turnInputTokens  += next.usage?.inputTokens  || 0;
      turnOutputTokens += next.usage?.outputTokens || 0;

      if (next.shouldClose && !turnArtifact) {
        send('suggest_close', { reason: next.reason });
        conversationDone = true;
        break;
      }

      const agent = activeAgents.find(a => a.id === next.agentId);
      if (!agent) break;
      if (abortController.signal.aborted) break;

      send('agent_typing', { agentName: agent.name, agentEmoji: agent.emoji, agentRole: agent.role, reason: next.reason || '' });

      const historyLines = currentMessages
        .slice(-10)
        .filter(m => m.role !== 'system' || m.type === 'decision_answer')
        .map(m => {
          if (m.role === 'human')                                  return `Participant : ${m.content}`;
          if (m.role === 'system' && m.type === 'decision_answer') return `[${m.content}]`;
          return `${m.agentName} : ${m.content}${m.artifact ? ` [Illustration produite : « ${m.artifact.title} »]` : ''}`;
        });
      const historyText  = historyLines.join('\n\n');

      // Questions de décision déjà soulevées dans cette réunion — injectées pour éviter les doublons
      const priorDecisionQuestions = currentMessages
        .filter(m => m.type === 'decision' && m.question)
        .map(m => `- "${m.question}" (${m.agentName})`);

      const systemPrompt = buildAgentSystemPrompt({
        agent, project, session, intention, activeAgents,
        reason: next.reason || '',
        projectMeetings,
        priorDecisionQuestions,
        decisionBudget: { used: countDecisions(currentMessages), max: decisionBudget },
        pastCodePromptsText,
        expertiseLevel,
        humorLevel,
        webSearchEnabled: session.webSearchEnabled === true,
        projectToolsText,
        artifactRequest: turnArtifact,
        toolReview: toolReview && {
          ...toolReview,
          toolSuggestionsText: toolReview.suggested.map(n => `- ${n}`).join('\n'),
        },
      });

      const baseText = historyText
        ? `Historique de la réunion :\n${historyText}\n\nC'est maintenant ton tour de contribuer.`
        : `Objectif : ${session.task}\n\nC'est le début de la réunion. Donne ta première contribution.`;

      let userMessage;
      if (hasAttachments && turnCount === 0) {
        try {
          const contentBlocks = [{ type: 'text', text: baseText }];
          for (const att of rawAttachments) {
            if (att.isPdf && att.base64) {
              const data = att.base64.replace(/^data:[^;]+;base64,/, '');
              contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
            } else if (att.isImage && att.base64 && att.mediaType) {
              const data = att.base64.replace(/^data:[^;]+;base64,/, '');
              contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data } });
            } else if (att.extractedText) {
              contentBlocks.push({ type: 'text', text: `[Fichier joint : ${att.name}]\n${att.extractedText}` });
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

      let agentFullText;
      let agentUsage = { inputTokens: 0, outputTokens: 0 };
      let agentWebSearch = null;
      try {
        // Tour avec illustration demandée : marge de tokens pour le code (phase 5)
        const agentResult = await callAgent(
          systemPrompt, userMessage, turnArtifact ? 4000 : 600, session.model || MODEL, abortController.signal,
          session.webSearchEnabled === true
        );
        agentFullText   = agentResult.text;
        agentUsage      = agentResult.usage;
        agentWebSearch  = agentResult.webSearch;

        // Garde-fou 3.3 : relance unique si l'agent rédige déjà le livrable
        // (pas sur un tour d'illustration, dont le bloc de code est attendu)
        if (intention[0] === 'claude_code' && !turnArtifact && looksLikeDeliverable(agentFullText)) {
          const retryMessage = Array.isArray(userMessage)
            ? [...userMessage, { type: 'text', text: 'Reformule sans rédiger le livrable : pose plutôt une question pour clarifier le besoin.' }]
            : `${userMessage}\n\nReformule sans rédiger le livrable : pose plutôt une question pour clarifier le besoin.`;
          const retryResult = await callAgent(
            systemPrompt, retryMessage, 600, session.model || MODEL, abortController.signal,
            session.webSearchEnabled === true
          );
          agentFullText  = retryResult.text;
          agentUsage     = { inputTokens: agentUsage.inputTokens + retryResult.usage.inputTokens, outputTokens: agentUsage.outputTokens + retryResult.usage.outputTokens };
          agentWebSearch = retryResult.webSearch || agentWebSearch;
        }
      } catch (agentErr) {
        if (abortController.signal.aborted || agentErr.name === 'AbortError') {
          // Appel non streamé interrompu avant d'aboutir : rien à enregistrer,
          // il n'y a pas de texte partiel (cf. phase 2.1).
          res.end();
          return;
        }
        throw agentErr;
      }

      turnInputTokens  += agentUsage.inputTokens  || 0;
      turnOutputTokens += agentUsage.outputTokens || 0;

      const parsed = parseAgentOutput(agentFullText);
      // Cartes de décision : regroupées (jusqu'à 3 par message) et plafonnées par le
      // budget de la réunion. Au-delà, les cartes sont ignorées (le texte reste
      // nettoyé des marqueurs) : l'agent a pour consigne de trancher par hypothèse.
      const budgetLeft = Math.max(0, decisionBudget - countDecisions(currentMessages));
      const decisions  = parsed.decisions.slice(0, budgetLeft);

      // Découpage en bulles (séparateur [NEXT], cf. phase 2.2) — même turnId,
      // un message distinct par bulle, affichées l'une après l'autre côté client.
      // Les sources web (si recherche réellement effectuée) sont rattachées à
      // la première bulle du tour.
      const turnId = randomUUID();
      const hasWebSearchSources = agentWebSearch?.sources?.length > 0;
      // Illustration gardée seulement si demandée pour ce tour ; sinon le bloc a
      // déjà été retiré du texte par parseAgentOutput et est ignoré (phase 5).
      const artifact = turnArtifact ? parsed.artifact : null;
      const bubbles = parsed.bubbles.length > 0 || !artifact ? parsed.bubbles : [`🎨 ${artifact.title}`];
      const agentMessages = bubbles.map((bubbleContent, i) => ({
        id:        randomUUID(),
        role:      'agent',
        agentName: agent.name,
        turnId,
        ...(i === 0 && next.reason ? { reason: next.reason } : {}),
        ...(i === 0 && hasWebSearchSources ? { webSearch: { queries: agentWebSearch.queries, sources: agentWebSearch.sources } } : {}),
        content:   bubbleContent,
        timestamp: new Date().toISOString(),
        type:      'message',
        pinned:    false,
        ...(artifact && i === bubbles.length - 1 ? { artifact } : {}),
      }));
      for (const m of agentMessages) await appendMessageEntry(sessionId, m);

      if (agentMessages.length > 0) {
        send('agent_message', { agentName: agent.name, messages: agentMessages });
      }

      for (const decision of decisions) {
        const decisionMsg = {
          id:         randomUUID(),
          role:       'system',
          type:       'decision',
          question:   decision.question,
          choices:    decision.choices,
          context:    decision.context,
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
          decisionsLeft: Math.max(0, budgetLeft - decisions.length),
        });
        decisionEmitted = true;
      }

      if (decisionEmitted) { conversationDone = true; break; }

      if (parsed.suggestedAgent) {
        send('suggest_agent', { ...parsed.suggestedAgent, reason: `Suggéré par ${agent.name}` });
      }

      if (parsed.suggestedMeeting) {
        const suggestion = {
          id:        randomUUID(),
          title:     parsed.suggestedMeeting.title,
          objective: parsed.suggestedMeeting.objective,
          type:      parsed.suggestedMeeting.type,
          reason:    parsed.suggestedMeeting.reason,
          after:     parsed.suggestedMeeting.after,
          status:    'pending',
          agentName: agent.name,
          timestamp: new Date().toISOString(),
        };
        const stored = await appendPendingMeetingSuggestion(sessionId, suggestion);
        // Rien n'est créé côté Milestone à ce stade — juste affiché dans le
        // panneau "Réunions suggérées" (3.4). stored=false si doublon ou limite atteinte.
        // Nesté sous "suggestion" : le champ suggestion.type (decision|claude_code|stack)
        // entrerait sinon en collision avec le type d'événement SSE lui-même.
        if (stored) send('suggest_meeting', { suggestion });
      }

      // Outil complémentaire proposé (réunion de type stack uniquement, phase 4.3) :
      // stocké sur la réunion, validé un par un par l'humain à la clôture.
      if (parsed.neededTool && toolReview) {
        const tool = toolSuggestionFromMarker(parsed.neededTool, agent.name);
        if (await appendToolSuggestion(sessionId, tool)) {
          toolReview.suggested.push(tool.name);
          send('suggest_tool', { tool });
        }
      }

      consecutiveCount = next.agentId === lastAgentId ? consecutiveCount + 1 : 1;
      lastAgentId      = next.agentId;
      turnCount++;
      currentMessages  = await loadMessages(sessionId);
    }

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
