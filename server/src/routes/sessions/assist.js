const express        = require('express');
const crypto         = require('crypto');
const db             = require('../../utils/db');
const anthropic      = require('../../services/anthropic');
const { findProject: getProject } = require('../../utils/projectHelpers');
const { parseJsonField } = require('../../utils/parseJsonField');
const { appendMessageEntry } = require('./helpers');
const { DEFAULT_MODEL, ORCHESTRATOR_MODEL, ORCHESTRATOR_PARAMS } = require('../../services/models');
const { KINDS: FEEDBACK_KINDS, saveFeedback } = require('../../services/feedback');

// Outils de la salle de réunion (v5.1, 16/10/2026) :
// - avis de l'humain sur une bulle d'agent (préférences apprises, services/feedback.js) ;
// - « Où en est-on ? » : point de situation en trois lignes, par l'animation ;
// - comptes rendus déclinés : relevé de décisions, synthèse exécutive, procès-verbal.
const router = express.Router({ mergeParams: true });
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

async function load(req, res, columns = ['id', 'task', 'status', 'messages']) {
  const { projectId, sessionId } = req.params;
  const project = await getProject(projectId, req.user.id, isAdminOf(req));
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return {}; }
  const [session] = await db('Session').where({ id: sessionId, projectId }).select(columns).limit(1);
  if (!session) { res.status(404).json({ error: 'Réunion introuvable' }); return {}; }
  return { project, session, messages: parseJsonField(session.messages, []) };
}

// POST /:sessionId/feedback { messageId, kind: off_topic|too_technical|too_long|good|null }
router.post('/:sessionId/feedback', async (req, res) => {
  try {
    const { project, session, messages } = await load(req, res);
    if (!session) return;
    const { messageId, kind = null } = req.body || {};
    if (kind !== null && !FEEDBACK_KINDS.includes(kind)) return res.status(400).json({ error: 'Avis inconnu.' });
    const message = messages.find(m => m.id === messageId && m.role === 'agent');
    if (!message) return res.status(404).json({ error: 'Bulle introuvable.' });
    const saved = await saveFeedback({ userId: req.user.id, projectId: project.id, sessionId: session.id, message, kind });
    res.json({ messageId, kind: saved?.kind || null });
  } catch (err) {
    console.error('[sessions feedback]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /:sessionId/feedback — mes avis dans cette réunion { messageId: kind }
router.get('/:sessionId/feedback', async (req, res) => {
  try {
    const { session } = await load(req, res, ['id']);
    if (!session) return;
    const rows = await db('AgentFeedback').where({ userId: req.user.id, sessionId: session.id }).select('messageId', 'kind');
    res.json(Object.fromEntries(rows.map(r => [r.messageId, r.kind])));
  } catch (err) {
    console.error('[sessions feedback GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /:sessionId/where — « Où en est-on ? » (modèle léger, quelques centimes au plus)
const lineOf = m => (m.role === 'human' ? `Participant : ${m.content}`
  : m.type === 'decision' ? `[Question à l'humain] ${m.question} → ${m.status === 'answered' ? m.answer : 'sans réponse'}`
  : m.type === 'animator' ? `Animation : ${m.content}`
  : m.role === 'agent' ? `${m.agentName} : ${m.content}` : null);
router.post('/:sessionId/where', async (req, res) => {
  try {
    const { session, messages } = await load(req, res);
    if (!session) return;
    const talk = messages.map(lineOf).filter(Boolean);
    if (talk.length < 2) return res.status(409).json({ error: 'La réunion vient de commencer : rien à résumer encore.' });
    const transcript = talk.slice(-60).join('\n').slice(-30000);
    const response = await anthropic.messages.create({
      model: ORCHESTRATOR_MODEL, ...ORCHESTRATOR_PARAMS, max_tokens: 400,
      system: 'Tu es l\'animateur d\'une réunion de travail. Tu fais le point pour l\'humain, en français, sans jargon.',
      messages: [{ role: 'user', content: `Objectif de la réunion : ${session.task}\n\nÉchanges :\n${transcript}\n\nFais le point en TROIS lignes exactement, sans titre ni gras :\nOù on en est : …\nAcquis : …\nReste à trancher : …` }],
    });
    const content = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const message = { id: crypto.randomUUID(), role: 'system', type: 'animator', agentName: 'Animation', kind: 'where', content, timestamp: new Date().toISOString() };
    await appendMessageEntry(session.id, message);
    res.json({ message });
  } catch (err) {
    console.error('[sessions where]', err.message);
    res.status(500).json({ error: 'Le point de situation n’a pas pu être fait.' });
  }
});

// ── Comptes rendus déclinés ───────────────────────────────────────────────────
const FORMATS = {
  decisions: {
    label: 'Relevé de décisions',
    rules: `Un RELEVÉ DE DÉCISIONS, 15 lignes au plus :
## Décisions
- une ligne par décision, autonome et précise
## Actions
| Action | Qui | Pour quand |
## Points en suspens
- ce qui reste à trancher (ou « Aucun »)`,
  },
  executive: {
    label: 'Synthèse exécutive',
    rules: `Une SYNTHÈSE EXÉCUTIVE pour un décideur pressé, 5 lignes au plus, sans titre :
1. l'objectif de la réunion ; 2. le résultat ; 3. les décisions clés ; 4. le risque ou point d'attention principal ; 5. la prochaine étape.`,
  },
  pv: {
    label: 'Procès-verbal',
    rules: `Un PROCÈS-VERBAL formel, au passé, ton neutre :
**Date** · **Objet** · **Participants** (humains et agents)
## Ordre du jour
## Délibérations
(résumé des positions exprimées, point par point)
## Décisions adoptées
## Actions décidées
## Clôture
(heure non connue : ne pas l'inventer ; prochaine réunion si elle est connue)`,
  },
};
const hashOf = s => crypto.createHash('sha1').update(String(s || '')).digest('hex');

// POST /:sessionId/summary-format { format } — généré une fois, conservé tant que le CR ne change pas
router.post('/:sessionId/summary-format', async (req, res) => {
  try {
    const { session, messages } = await load(req, res, ['id', 'task', 'status', 'messages', 'summary', 'summaryFormats', 'createdAt', 'activeAgents']);
    if (!session) return;
    const format = FORMATS[req.body?.format] ? req.body.format : null;
    if (!format) return res.status(400).json({ error: 'Format inconnu.' });
    if (session.status !== 'accepted' || !session.summary) return res.status(409).json({ error: 'La réunion n’est pas conclue : pas encore de compte rendu.' });
    const source = hashOf(session.summary);
    const stored = parseJsonField(session.summaryFormats, null);
    if (stored?.source === source && stored.formats?.[format]) return res.json({ format, content: stored.formats[format], cached: true });

    const cards = messages.filter(m => m.type === 'decision').map(m => `- ${m.question} → ${m.status === 'answered' ? m.answer : m.status === 'delegated' ? 'déléguée aux agents' : 'sans réponse'}`).join('\n');
    const humans = [...new Set(messages.filter(m => m.role === 'human' || m.answeredByName).map(m => m.answeredByName || m.authorName).filter(Boolean))];
    const agents = parseJsonField(session.activeAgents, []).map(a => `${a.name} (${a.role})`);
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL, max_tokens: 1800,
      system: 'Tu mets en forme le compte rendu d\'une réunion de projet. Français, Markdown simple. Tu n\'ajoutes AUCUNE information absente des sources.',
      messages: [{ role: 'user', content: `Réunion : « ${session.task} », le ${new Date(session.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
Participants : ${[...(humans.length ? humans : ['le porteur du projet']), ...agents].join(', ')}

Questions soumises à l'humain :
${cards || '(aucune)'}

Compte rendu complet :
${session.summary}

Rédige ${FORMATS[format].rules}` }],
    });
    const content = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!content) return res.status(502).json({ error: 'La mise en forme a échoué : réessayez.' });
    const formats = { ...(stored?.source === source ? stored.formats : {}), [format]: content };
    await db('Session').where({ id: session.id }).update({ summaryFormats: JSON.stringify({ source, formats }) });
    res.json({ format, content, cached: false });
  } catch (err) {
    console.error('[sessions summary-format]', err.message);
    res.status(500).json({ error: 'La mise en forme a échoué.' });
  }
});

module.exports = router;
module.exports.FORMATS = FORMATS;
