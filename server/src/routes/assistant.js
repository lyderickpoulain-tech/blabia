const express = require('express');
const { randomUUID } = require('crypto');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const anthropic = require('../services/anthropic');
const { findProject } = require('../utils/projectHelpers');
const { DEFAULT_MODEL } = require('../services/models');
const { projectKnowledge } = require('../services/projectKnowledge');
const { POSTURE } = require('../services/prompts/posture');
const { parseJsonField } = require('../utils/parseJsonField');
const { buildInbox, inboxForPrompt } = require('../services/inbox');

// Bras droit (v5.1, 16/10/2026, étape 1) : l'interlocuteur principal de l'humain sur un projet,
// en tête-à-tête. Il connaît tout le projet (services/projectKnowledge.js), cite ses sources,
// et propose la prochaine réunion utile. Une conversation par projet et par personne
// (table AssistantMessage). Étape 2 : il pourra tenir une réunion à la place de l'humain.
const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);
const HISTORY = 20;        // derniers messages repris dans la conversation
const MAX_INPUT = 4000;

const SOURCES_RE = /\[SOURCES:\s*(\[[\s\S]*?\])\s*\]/;
const MEETING_RE = /\[MEETING:\s*(R\d{1,3})\s*\]/i;

function buildSystem(project, knowledgeText) {
  return `Tu es le bras droit de l'humain sur le projet « ${project.name} » : son interlocuteur principal, en tête-à-tête. Tu connais tout le projet, tu vérifies avant d'affirmer, et tu l'aides à avancer : répondre, faire le point, recommander la prochaine étape, proposer une réunion.

CE QUE TU SAIS DU PROJET :
${knowledgeText}

${POSTURE}

COMMENT TU PARLES : comme un bras droit à l'oral, en vouvoyant l'humain. Désigne une réunion par son TITRE (« la réunion sur le style du site »), jamais par son repère (R2, R4) : les repères sont pour toi. Ne présente comme « à trancher » que ce qui figure dans la liste À TRANCHER ci-dessous : une question réglée par une décision du registre ne se repose pas. La réponse d'abord, en deux à quatre phrases courtes. Une liste seulement si on te demande un inventaire (par exemple la liste retenue). Pas de titre, pas d'émoji, pas de formule de politesse.

SOURCES : à la toute fin de ta réponse, une ligne [SOURCES:["Réunion « Titre », 9 oct.","Registre : …","Document « … »"]] avec une à trois sources réellement utilisées, en étiquettes courtes. Aucune ligne si ta réponse ne s'appuie pas sur le projet.
RÉUNION : si la meilleure suite est une réunion du plan À VENIR, ajoute à la fin [MEETING:R6] (son repère dans le plan ci-dessus), une seule. L'humain choisira de la faire préparer par les agents ou de la tenir.
TU NE MODIFIES RIEN toi-même (décisions, actions, plan) : tu proposes, l'humain décide. Une question hors du projet : réponds brièvement si c'est utile, sans rien inventer.`;
}

function parseReply(text, milestones) {
  let sources = [];
  const s = text.match(SOURCES_RE);
  if (s) { try { sources = JSON.parse(s[1]).map(x => String(x).slice(0, 120)).filter(Boolean).slice(0, 3); } catch { sources = []; } }
  let proposal = null;
  const m = text.match(MEETING_RE);
  if (m) {
    const idx = Number(m[1].slice(1)) - 1;
    const ms = milestones[idx];
    if (ms && ms.status !== 'done') proposal = { ref: `R${idx + 1}`, milestoneId: ms.id, title: ms.title, type: ms.type };
  }
  const content = text.replace(SOURCES_RE, '').replace(MEETING_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { content, sources, proposal };
}

const shape = r => ({ id: r.id, role: r.role, content: r.content, sources: parseJsonField(r.sources, []), proposal: parseJsonField(r.proposal, null), createdAt: r.createdAt });

// GET /api/projects/:id/assistant/inbox — « À trancher » : ce qui m'attend, ce qui tourne sans
// moi, et le dernier message du bras droit (son retour proactif, v5.1)
router.get('/:id/assistant/inbox', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    res.json(await buildInbox(project, req.user.id));
  } catch (err) {
    console.error('[assistant inbox]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id/assistant — ma conversation avec le bras droit
router.get('/:id/assistant', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const rows = await db('AssistantMessage').where({ projectId: project.id, userId: req.user.id }).orderBy('createdAt', 'asc').limit(200);
    res.json({ messages: rows.map(shape) });
  } catch (err) {
    console.error('[assistant GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/assistant { message }
router.post('/:id/assistant', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message requis' });
  if (message.length > MAX_INPUT) return res.status(400).json({ error: 'Message trop long.' });
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const previous = await db('AssistantMessage').where({ projectId: project.id, userId: req.user.id }).orderBy('createdAt', 'desc').limit(HISTORY);
    const [human] = await db('AssistantMessage').insert({
      id: randomUUID(), projectId: project.id, userId: req.user.id, role: 'human', content: message, createdAt: new Date(),
    }).returning('*');

    const { text: knowledgeText, milestones } = await projectKnowledge(project);
    // Conversation : alternance stricte, en commençant par l'humain
    const turns = [];
    for (const r of previous.reverse()) {
      const role = r.role === 'human' ? 'user' : 'assistant';
      if (!turns.length && role !== 'user') continue;
      if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += `\n\n${r.content}`;
      else turns.push({ role, content: r.content });
    }
    if (turns.length && turns[turns.length - 1].role === 'user') turns[turns.length - 1].content += `\n\n${message}`;
    else turns.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL, max_tokens: 900,
      // Connaissance du projet en cache : relue à 10 % du prix d'un message à l'autre
      // + ce qui attend l'humain, hors cache (change d'un message à l'autre)
      system: [
        { type: 'text', text: buildSystem(project, knowledgeText), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: inboxForPrompt(await buildInbox(project, req.user.id)) || 'Rien n’attend l’humain pour l’instant.' },
      ],
      messages: turns,
    });
    const raw = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const { content, sources, proposal } = parseReply(raw, milestones);
    const [reply] = await db('AssistantMessage').insert({
      id: randomUUID(), projectId: project.id, userId: req.user.id, role: 'assistant',
      content: content || 'Je n’ai pas pu formuler de réponse : reformulez votre question ?',
      sources: JSON.stringify(sources), proposal: proposal ? JSON.stringify(proposal) : null, createdAt: new Date(),
    }).returning('*');
    res.json({ human: shape(human), reply: shape(reply) });
  } catch (err) {
    console.error('[assistant POST]', err.message);
    res.status(500).json({ error: 'Le bras droit n’a pas pu répondre.' });
  }
});

// DELETE /api/projects/:id/assistant — effacer ma conversation (le projet n'est pas touché)
router.delete('/:id/assistant', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    await db('AssistantMessage').where({ projectId: project.id, userId: req.user.id }).del();
    res.json({ cleared: true });
  } catch (err) {
    console.error('[assistant DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.parseReply = parseReply;
