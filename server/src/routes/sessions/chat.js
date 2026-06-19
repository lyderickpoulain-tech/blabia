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
  streamAgent,
  appendMessageEntry,
  appendPendingStepSuggestion,
} = require('./helpers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = express.Router({ mergeParams: true });

const MAX_TURNS       = 12;
const MAX_CONSECUTIVE = 2;

// ── loadMessages ──────────────────────────────────────────────────────────────

async function loadMessages(sessionId) {
  const [s] = await db('Session').select('messages').where({ id: sessionId }).limit(1);
  const m = s?.messages;
  if (Array.isArray(m)) return m;
  try { return JSON.parse(m || '[]'); } catch { return []; }
}

// ── orchestrate ───────────────────────────────────────────────────────────────

async function orchestrate({ session, project, messages, activeAgents,
  lastAgentId, consecutiveCount, humanMessage, resumeAfterDecision, delegated = false, turnCount = 0 }) {

  if (activeAgents.length === 1) {
    return { agentId: activeAgents[0].id, reason: '', shouldClose: false };
  }

  if (resumeAfterDecision) {
    const lastDecision = [...messages].reverse().find(m => m.type === 'decision');
    if (lastDecision) {
      const agent = activeAgents.find(a => a.name === lastDecision.agentName);
      if (agent) return { agentId: agent.id, reason: 'Reprend après sa question', shouldClose: false };
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
  const { message: humanMessage, agentIds, attachments: rawAttachments, resume, delegated } = req.body;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  const hasText        = !!humanMessage?.trim();
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

    let currentMessages = (() => {
      const m = freshSession.messages;
      if (Array.isArray(m)) return m;
      try { return JSON.parse(m || '[]'); } catch { return []; }
    })();

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

    const TL_EMOJI = { done: '✅', in_progress: '🔵', blocked: '🔴', pending: '⚪' };
    const timelineText = projectMilestones.length > 0
      ? projectMilestones.filter(m => m.status !== 'done').slice(0, 5).map(m => `${TL_EMOJI[m.status] || '⚪'} ${m.title}`).join('\n')
      : '';

    const intentionText = Array.isArray(intention) && intention.length > 0
      ? intention.join(', ')
      : 'non défini';

    const briefSection    = project.brief
      ? `\nBrief du projet :\n${project.brief}\n`   : '';
    const timelineSection = timelineText
      ? `\nÉtat de la timeline :\n${timelineText}\n` : '';
    const memorySection   = project.context
      ? `\nMémoire du projet :\n${project.context.substring(0, 1500)}\n` : '';

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

      send('agent_start', { agentName: agent.name, agentRole: agent.role, reason: next.reason || '' });

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

      let processedText = agentFullText;
      if (/\[DECISION:/.test(agentFullText)) {
        if ((decisionCountPerAgent[agent.name] || 0) >= 1) {
          processedText = agentFullText.replace(/\[DECISION:\{[\s\S]*?\}\]/gs, '').trim();
        }
        decisionCountPerAgent[agent.name] = (decisionCountPerAgent[agent.name] || 0) + 1;
      }

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
        const parts   = suggestAgtMatch[1].split(',').map(p => p.trim());
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
