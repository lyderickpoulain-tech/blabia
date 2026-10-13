const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const anthropic      = require('../../services/anthropic');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { getProjectTools, formatProjectToolsForPrompt } = require('../../services/tools/toolsStore');
const { extractMeetingDecisions, listDecisions, formatRegistryForPrompt } = require('../../services/decisions');
const { listActions, formatActionsForPrompt, dropExistingActions, parseActionChanges } = require('../../services/actions');
const { requiredCategories, missingTools } = require('../../services/devTools');
const { agendaDecisions, formatAgendaForPrompt } = require('../../services/agenda');
const { SETUP_CATEGORIES } = require('../../services/tools/catalog');
const { CATEGORIES: TOOL_CATEGORIES } = require('../../services/tools/catalog');

// Livrable d'une réunion stack : la liste des outils proposés (Markdown), validée
// outil par outil par l'humain à la clôture (POST /:sessionId/tools/apply).
function buildToolsDeliverable(tools) {
  if (tools.length === 0) return '## Outils proposés\n\nAucun outil complémentaire proposé : les outils actuels couvrent les besoins discutés.';
  const euros = n => `${n} €`;
  const lines = tools.map(t => {
    const cat = TOOL_CATEGORIES.find(c => c.id === t.category);
    const c = t.cost;
    const cost = !c ? 'coût non renseigné'
      : c.type === 'free' ? 'gratuit'
      : `${euros(c.monthlyMin ?? 0)} à ${euros(c.monthlyMax ?? c.monthlyMin ?? 0)}/mois${c.freeTier ? ` (gratuit jusqu'à : ${c.freeTier})` : ''}`;
    const source = t.priceSource ? `[source](${t.priceSource})` : 'indicatif, à vérifier';
    return `- **${t.name}** — ${cat ? cat.label : t.category}\n  - Besoin : ${t.need || '—'}\n  - Pourquoi : ${t.why || '—'}\n  - Coût : ${cost} — ${source}`;
  });
  return `## Outils proposés\n\n${lines.join('\n')}`;
}
const { MODEL, updateProjectContext } = require('./helpers');
const {
  buildSummaryPrompt,
  buildClaudeCodePrompt,
} = require('../../services/prompts/deliverablePrompts');
const { parseJsonField } = require('../../utils/parseJsonField');

// Réunions proposées à la conclusion à partir de ce qui n'est pas une action
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
function buildMeetingProposals(triage, meetingType) {
  const out = [];
  if (triage.toDecide.length) {
    out.push({ key: 'decide', type: 'decision',
      title: cut(`Trancher : ${triage.toDecide[0].replace(/\?$/, '')}${triage.toDecide.length > 1 ? ` (+${triage.toDecide.length - 1})` : ''}`, 120),
      description: `Questions restées ouvertes :\n${triage.toDecide.map(q => `- ${q}`).join('\n')}` });
  }
  // Réunion Claude Code : le travail de code est déjà dans son prompt
  if (triage.codeTasks.length && meetingType !== 'claude_code') {
    out.push({ key: 'code', type: 'claude_code',
      title: cut(`Développer : ${triage.codeTasks[0].title}${triage.codeTasks.length > 1 ? ` (+${triage.codeTasks.length - 1})` : ''}`, 120),
      description: `À réaliser par Claude Code :\n${triage.codeTasks.map(t => `- ${t.title}${t.detail ? ` — ${t.detail}` : ''}`).join('\n')}` });
  }
  return out;
}

// Outils cités comme « à mettre en place » : déjà prêts (écartés), retenus mais pas encore
// mis en place, ou pas encore choisis dans la page Outils
function toolSetupsStatus(setups, tools) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return setups.map(s => {
    const match = tools.find(t => t.status === 'validated' && (norm(t.name).includes(norm(s.tool)) || norm(s.tool).includes(norm(t.name))));
    if (match && (match.setupDone || !SETUP_CATEGORIES.has(match.category))) return null;
    return { tool: match?.name || s.tool, category: match?.category || null, status: match ? 'not_setup' : 'not_chosen' };
  }).filter(Boolean);
}

const router = express.Router({ mergeParams: true });

// ── POST /suggest-agents — Suggestion d'agents pour une réunion ───────────────

router.post('/suggest-agents', async (req, res) => {
  const { projectId } = req.params;
  const { task, milestoneType, milestoneId } = req.body;
  if (!task?.trim()) return res.status(400).json({ error: 'Tâche requise' });
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

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
    // Ordre du jour (décisions à retraiter, sujets parfois sans lien) : chaque point couvert
    const agenda = await agendaDecisions(milestoneId ? (await db('Milestone').where({ id: milestoneId, projectId }).first('id'))?.id : null);
    const agendaBlock = agenda.length
      ? `\nOrdre du jour (décisions remises en question à retraiter, sujets possiblement sans lien entre eux) :\n${formatAgendaForPrompt(agenda)}\nRÈGLE : chaque point de l'ordre du jour doit être couvert par AU MOINS UN agent réellement compétent sur son sujet ; 2 à 5 agents au total ; dans "reason", cite le ou les points couverts.`
      : '';

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 10_000)
    );
    const apiPromise = anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: 'Tu sélectionnes des agents IA pertinents pour une réunion. Réponds UNIQUEMENT en JSON valide, sans commentaires.',
      messages: [{
        role: 'user',
        content: `Tu dois suggérer des agents pertinents pour cette réunion spécifique.

Projet : "${project.name}"
Brief : "${project.brief?.trim() || 'non défini'}"
Objectif de la réunion : "${task.trim()}"${milestoneType ? `\nType d'étape : ${milestoneType}` : ''}${agendaBlock}

Agents disponibles pour CE projet :
${agentsList}

1. Sélectionne 2 à ${agenda.length ? 5 : 4} agents parmi la liste ci-dessus qui sont DIRECTEMENT utiles. Ne sélectionne pas un agent simplement parce qu'il existe.
2. Si une compétence importante manque pour cet objectif et qu'aucun agent existant ne la couvre, suggère la création d'UN SEUL nouvel agent spécialisé avec un nom et un rôle précis. Sinon, mets null.

Retourne UNIQUEMENT ce JSON :
{"existingSelected":[{"name":"NomExact","reason":"Courte raison (10 mots max)"}],"newAgentSuggestion":{"name":"NomAgent","role":"Rôle précis en une phrase","reason":"Pourquoi ce profil est nécessaire pour cet objectif"} ou null}`
      }]
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const text = anthropic.textOf(response).trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    const agentMap = {};
    agents.forEach(a => { agentMap[a.name.toLowerCase()] = a; });

    const existingSelected = (parsed.existingSelected || []).map(s => {
      const a = agentMap[(s.name || '').toLowerCase()];
      return a ? { agentId: a.id, agentName: a.name, emoji: a.emoji, reason: s.reason } : null;
    }).filter(Boolean);

    res.json({ existingSelected, newAgentSuggestion: parsed.newAgentSuggestion || null });
  } catch {
    try {
      const fallback = await db('Agent').select('id', 'name', 'emoji').where({ isDefault: true }).limit(2);
      res.json({
        existingSelected: fallback.map(a => ({ agentId: a.id, agentName: a.name, emoji: a.emoji, reason: 'Agent par défaut' })),
        newAgentSuggestion: null
      });
    } catch (e) {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// ── POST /:sessionId/generate-memory — Génération du souvenir projet ──────────

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
    res.json({ memory: anthropic.textOf(response).trim() });
  } catch (err) {
    console.error('[generate-memory]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/generate-deliverable — CR + livrable à la clôture (3.3) ──
// Le type n'est plus choisi par le client : il vient de session.intention.
// Toute réunion produit un compte-rendu ; seules claude_code (et plus tard
// stack, phase 4) produisent en plus un livrable typé dans Session.deliverable.

router.post('/:sessionId/generate-deliverable', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);

  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const [session] = await db('Session').where({ id: sessionId, projectId }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });

    const messages = parseJsonField(session.messages, []);
    if (messages.length === 0) {
      return res.status(400).json({ error: 'Aucun message dans cette réunion' });
    }

    const meetingIntention = parseJsonField(session.intention, []);
    const meetingType = ['decision', 'claude_code', 'stack'].includes(meetingIntention[0]) ? meetingIntention[0] : 'decision';

    const historyText = messages
      .filter(m => m.role !== 'system')
      .map(m => m.role === 'human'
        ? `Participant : ${m.content}`
        : `${m.agentName} : ${m.content}${m.artifact ? ` [Illustration produite : « ${m.artifact.title} »]` : ''}`)
      .join('\n\n');

    // Cache : la transcription est placée UNE fois en tête des consignes système (point de
    // cache), puis relue par le compte rendu, l'extraction et le prompt Claude Code au lieu
    // d'être payée 2 à 3 fois. Préchauffage (max_tokens 0) avant les appels en parallèle :
    // sinon, lancés ensemble, aucun ne relit ce que l'autre est en train d'écrire.
    const transcriptBlock = { type: 'text', cache_control: { type: 'ephemeral' },
      text: `TRANSCRIPTION DE LA RÉUNION « ${session.task} » (référence pour les consignes qui suivent) :\n\n${historyText}` };
    const withTranscript = sys => [transcriptBlock, { type: 'text', text: sys }];
    const TRANSCRIPT_REF = '(la transcription complète figure en tête des consignes, bloc « TRANSCRIPTION DE LA RÉUNION »)';
    await anthropic.messages.create({ model: MODEL, max_tokens: 0, system: [transcriptBlock], messages: [{ role: 'user', content: '.' }] })
      .catch(err => console.error('[generate-deliverable] préchauffage du cache :', err.message));

    const sessionContext = `Objectif de la réunion : ${session.task}\n\nTranscription :\n${TRANSCRIPT_REF}`;
    const expertiseLevel = session.expertiseLevel ?? project.expertiseLevel ?? 3;

    // ── Compte-rendu (toujours généré) + décisions proposées au registre, en
    // parallèle. Les décisions ne sont PAS inscrites ici : l'humain les valide
    // dans la fenêtre de clôture (POST /:sessionId/decisions). Un échec de
    // l'extraction ne bloque pas la clôture.
    const summaryPrompt = buildSummaryPrompt(sessionContext, expertiseLevel, meetingType);
    const existingActions = await listActions(projectId);
    const actionsText = formatActionsForPrompt(existingActions);
    // Réunions à venir du plan (repères R1, R2… comme sur la page Plan) : une action proposée
    // peut être « à faire avant » l'une d'elles, qui ne se tiendra pas sans elle
    const planMilestones = await db('Milestone').where({ projectId }).orderBy('displayOrder', 'asc').select('id', 'title', 'status');
    const refToMilestone = Object.fromEntries(planMilestones.map((m, i) => [`R${i + 1}`, m]));
    const meetingsText = planMilestones.map((m, i) => (m.status === 'done' || m.id === session.milestoneId ? null : `R${i + 1} « ${m.title} »`)).filter(Boolean).join('\n');
    const [summaryResponse, extraction] = await Promise.all([
      anthropic.messages.create({
        model: MODEL, max_tokens: 4000,
        system: withTranscript(summaryPrompt.system),
        messages: [{ role: 'user', content: summaryPrompt.user }]
      }),
      extractMeetingDecisions({ session, messages, historyText: TRANSCRIPT_REF, systemPrefix: [transcriptBlock], projectId, actionsText, meetingsText,
        challenger: (session.challengerEnabled ?? project.challengerEnabled) !== false })
        .catch(err => { console.error('[generate-deliverable] extraction décisions :', err.message); return null; }),
    ]);
    let summary = anthropic.textOf(summaryResponse).trim();
    // null = extraction indisponible (la fenêtre de clôture le signale)
    const decisionProposals = extraction ? extraction.decisions : null;
    // Actions : seulement les vraies actions de l'humain, sans reprise d'une action déjà ouverte
    const actionProposals   = extraction ? dropExistingActions(extraction.actions, existingActions).map(a => {
      const m = a.beforeRef && refToMilestone[a.beforeRef];
      return { ...a, beforeMilestoneId: m && m.status !== 'done' ? m.id : null, beforeMilestoneTitle: m && m.status !== 'done' ? m.title : null };
    }) : null;
    // Actions déjà suivies que la réunion précise, rend inutiles ou montre faites (appliqué si l'humain accepte)
    const actionChanges     = extraction ? parseActionChanges({ actionChanges: extraction.actionChanges }, existingActions) : [];
    // Ce qui n'est pas une action (v5.1) : décisions à prendre → réunion de décision proposée ;
    // travail de code → réunion Claude Code proposée ; outils → page Outils
    const triage = extraction?.triage || { toDecide: [], toolSetups: [], codeTasks: [] };
    const meetingProposals = buildMeetingProposals(triage, meetingType);

    // Sources web citées pendant la réunion (dédupliquées), agrégées en fin de CR
    const citedSources = new Map();
    for (const m of messages) {
      for (const s of (m.webSearch?.sources || [])) {
        if (s.url && !citedSources.has(s.url)) citedSources.set(s.url, s);
      }
    }
    if (citedSources.size > 0) {
      const lines = [...citedSources.values()].map(s => `- [${s.title || s.url}](${s.url})`);
      summary += `\n\n## Sources web consultées\n${lines.join('\n')}`;
    }

    // Illustrations produites pendant la réunion (phase 5) — titres seulement
    const ARTIFACT_KIND = { mermaid: 'schéma', html: 'maquette', svg: 'visuel' };
    const artifacts = messages.filter(m => m.artifact?.title);
    if (artifacts.length > 0) {
      const lines = artifacts.map(m => `- ${m.artifact.title} (${ARTIFACT_KIND[m.artifact.kind] || m.artifact.kind}, par ${m.agentName})`);
      summary += `\n\n## Illustrations produites\n${lines.join('\n')}`;
    }

    // ── Livrable typé : prompt (claude_code) ou liste d'outils proposés (stack) ──
    let deliverable = null;
    let toolSuggestions = [];
    if (meetingType === 'stack') {
      toolSuggestions = parseJsonField(session.pendingToolSuggestions, []).filter(t => t && t.name);
      deliverable = buildToolsDeliverable(toolSuggestions);
    }
    if (meetingType === 'claude_code') {
      const devDirectory = project.devDirectory?.trim() || null;
      const stackLines = formatProjectToolsForPrompt(await getProjectTools(project)).split('\n').filter(Boolean);
      const decisions = messages.filter(m => m.pinned || m.type === 'decision');
      const registryText = formatRegistryForPrompt(await listDecisions(projectId)).activeText;
      const codePrompt = buildClaudeCodePrompt({
        session, brief: project.brief, devDirectory, githubRepo: project.githubRepo || null, stackLines, decisions, registryText, historyText: TRANSCRIPT_REF
      });
      // 12 000 jetons : à 4 000, le prompt était tronqué (complet : ~7 000) ; effort « medium »,
      // le plus pertinent pour ce livrable dans l'étude Claude 5 du 11/10/2026
      const deliverableResponse = await anthropic.messages.create({
        model: MODEL, max_tokens: 12000, output_config: { effort: 'medium' },
        system: withTranscript(codePrompt.system),
        messages: [{ role: 'user', content: codePrompt.user }]
      });
      deliverable = anthropic.textOf(deliverableResponse).trim();
    }

    await db('Session').where({ id: sessionId }).update({
      summary,
      deliverable,
      ...(meetingType === 'claude_code' ? { hasCode: true } : {}),
    });
    await updateProjectContext(projectId, sessionId, session.task, summary);

    // Outils à mettre en place (page Outils) et, pour un développement, outils dont il dépend
    const projectTools = await getProjectTools(project);
    const toolSetups = toolSetupsStatus(triage.toolSetups, projectTools);
    let devMissingTools = [];
    if (meetingType === 'claude_code' && deliverable) {
      await db('Session').where({ id: sessionId }).update({ requiredTools: null });
      devMissingTools = missingTools(await requiredCategories({ ...session, deliverable, requiredTools: null }, projectTools), projectTools);
    }

    const payload = { meetingType, summary, deliverable, toolSuggestions, decisionProposals, actionProposals, actionChanges, meetingProposals, toolSetups, devMissingTools };
    // Conclusion conservée tant qu'elle n'est pas validée : l'humain peut fermer la fenêtre
    // (vérifier un outil, une action…) et la retrouver telle quelle, sans tout régénérer
    await db('Session').where({ id: sessionId }).update({
      closureDraft: JSON.stringify({ generatedAt: new Date().toISOString(), messageCount: messages.length, data: payload, edits: null }),
    });
    return res.json(payload);
  } catch (err) {
    console.error('[sessions/generate-deliverable]', err.message);
    res.status(500).json({ error: `Erreur lors de la génération : ${err.message}` });
  }
});

// ── Conclusion préparée non validée (brouillon) ─────────────────────────────
// GET : { draft: { generatedAt, data, edits } | null, changedSince } — changedSince : nombre
// de messages ajoutés à la réunion depuis la préparation (régénérer est alors conseillé)
router.get('/:sessionId/closure-draft', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [s] = await db('Session').where({ id: sessionId, projectId }).select('closureDraft', 'messages', 'status').limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    const draft = s.status === 'open' ? parseJsonField(s.closureDraft, null) : null;
    if (!draft?.data) return res.json({ draft: null, changedSince: 0 });
    const changedSince = Math.max(0, parseJsonField(s.messages, []).length - (draft.messageCount || 0));
    res.json({ draft: { generatedAt: draft.generatedAt, data: draft.data, edits: draft.edits || null }, changedSince });
  } catch (err) {
    console.error('[sessions/closure-draft GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT { edits } : modifications de l'humain dans la fenêtre de conclusion (cases, textes)
router.put('/:sessionId/closure-draft', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const isAdmin = ['admin', 'supervisor'].includes(req.user.role);
  try {
    const project = await getProject(projectId, req.user.id, isAdmin);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [s] = await db('Session').where({ id: sessionId, projectId }).select('closureDraft').limit(1);
    if (!s) return res.status(404).json({ error: 'Session introuvable' });
    const draft = parseJsonField(s.closureDraft, null);
    if (!draft?.data) return res.status(409).json({ error: 'Aucune conclusion préparée pour cette réunion.' });
    const edits = req.body?.edits && typeof req.body.edits === 'object' ? req.body.edits : null;
    if (edits && JSON.stringify(edits).length > 500000) return res.status(413).json({ error: 'Modifications trop volumineuses.' });
    await db('Session').where({ id: sessionId }).update({ closureDraft: JSON.stringify({ ...draft, edits }) });
    res.json({ ok: true });
  } catch (err) {
    console.error('[sessions/closure-draft PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
