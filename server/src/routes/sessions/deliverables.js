const express        = require('express');
const { randomUUID } = require('crypto');
const db             = require('../../utils/db');
const anthropic      = require('../../services/anthropic');
const { findProject: getProject, formatTechStack } = require('../../utils/projectHelpers');
const { MODEL } = require('./helpers');

const router = express.Router({ mergeParams: true });

// ── POST /suggest-agents — Suggestion d'agents pour une réunion ───────────────

router.post('/suggest-agents', async (req, res) => {
  const { projectId } = req.params;
  const { task, milestoneType } = req.body;
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
Objectif de la réunion : "${task.trim()}"${milestoneType ? `\nType d'étape : ${milestoneType}` : ''}

Agents disponibles pour CE projet :
${agentsList}

1. Sélectionne 2 à 4 agents parmi la liste ci-dessus qui sont DIRECTEMENT utiles. Ne sélectionne pas un agent simplement parce qu'il existe.
2. Si une compétence importante manque pour cet objectif et qu'aucun agent existant ne la couvre, suggère la création d'UN SEUL nouvel agent spécialisé avec un nom et un rôle précis. Sinon, mets null.

Retourne UNIQUEMENT ce JSON :
{"existingSelected":[{"name":"NomExact","reason":"Courte raison (10 mots max)"}],"newAgentSuggestion":{"name":"NomAgent","role":"Rôle précis en une phrase","reason":"Pourquoi ce profil est nécessaire pour cet objectif"} ou null}`
      }]
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const text = response.content[0].text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
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
    res.json({ memory: response.content[0].text.trim() });
  } catch (err) {
    console.error('[generate-memory]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── POST /:sessionId/generate-deliverable — Génération de livrable ────────────

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
      const devDir    = project.devDirectory?.trim() || null;
      const stackLines = formatTechStack(project.techStack);

      const decisions = messages.filter(m => m.pinned || m.type === 'decision');

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

module.exports = router;
