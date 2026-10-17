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
const { appendMemory } = require('../utils/projectMemory');

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
const EVOLVE_TAG = '[EVOLVE:';
const EVOLVE_TYPES = ['decision', 'claude_code', 'stack'];
const MAX_EVOLVE_MEETINGS = 4;

function buildSystem(project, knowledgeText) {
  return `Tu es le bras droit de l'humain sur le projet « ${project.name} » : son interlocuteur principal, en tête-à-tête. Tu connais tout le projet, tu vérifies avant d'affirmer, et tu l'aides à avancer : répondre, faire le point, recommander la prochaine étape, proposer une réunion.

CE QUE TU SAIS DU PROJET :
${knowledgeText}

${POSTURE}

COMMENT TU PARLES : comme un bras droit à l'oral, en vouvoyant l'humain. Désigne une réunion par son TITRE (« la réunion sur le style du site »), jamais par son repère (R2, R4) : les repères sont pour toi. Ne présente comme « à trancher » que ce qui figure dans la liste À TRANCHER ci-dessous : une question réglée par une décision du registre ne se repose pas. La réponse d'abord, en deux à quatre phrases courtes. Une liste seulement si on te demande un inventaire (par exemple la liste retenue). Pas de titre, pas d'émoji, pas de formule de politesse.

SOURCES : à la toute fin de ta réponse, une ligne [SOURCES:["Réunion « Titre », 9 oct.","Registre : …","Document « … »"]] avec une à trois sources réellement utilisées, en étiquettes courtes. Aucune ligne si ta réponse ne s'appuie pas sur le projet.
RÉUNION : si la meilleure suite est une réunion du plan À VENIR, ajoute à la fin [MEETING:R6] (son repère dans le plan ci-dessus), une seule. L'humain choisira de la faire préparer par les agents ou de la tenir.
FAIRE ÉVOLUER LE PROJET : quand l'humain veut élargir ou changer son projet (« et si je vendais mes vinyles sur mon site ? », « je vais créer une appli », une nouvelle cible, un nouveau volet), dis en clair ce que ça change, ce que ça coûte et ce qui l'attend, puis ajoute à la fin, sur une ligne :
[EVOLVE:{"summary":"une phrase : ce qui change","brief":"une à deux phrases à ajouter au brief","meetings":[{"title":"titre clair, sans jargon","type":"decision","why":"ce que la réunion tranchera ou produira"}],"after":"R3","technical":true}]
- meetings : 1 à 4 réunions nouvelles, sans doublon avec le plan ; type « decision » (choisir, trancher), « claude_code » (construire ou modifier le site ou l'appli), « stack » (choisir et mettre en place des outils). Une réunion à venir qui couvre déjà le sujet ne se recrée pas : cite-la.
- after : repère de la réunion après laquelle les insérer (null = à la fin du plan) ; respecte l'ordre logique : on décide avant de construire, et ce qui complète le site vient après la réunion qui construit sa base. technical : true seulement si le projet devient un site ou une appli à construire.
- Une seule proposition par réponse, seulement pour une vraie évolution (pas pour une simple question). Elle ne s'applique qu'après l'accord de l'humain (bouton sous ta réponse) : ne dis jamais que c'est fait.
TU NE MODIFIES RIEN toi-même (décisions, actions, plan) : tu proposes, l'humain décide. Une question hors du projet : réponds brièvement si c'est utile, sans rien inventer.`;
}

// Extrait [EVOLVE:{…}] (JSON avec tableaux imbriqués : accolades comptées, chaînes respectées)
function extractEvolve(text) {
  const start = text.indexOf(EVOLVE_TAG);
  if (start < 0) return { json: null, text };
  const open = text.indexOf('{', start);
  if (open < 0) return { json: null, text: text.slice(0, start) };
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return { json: null, text: text.slice(0, start) };
  const close = text.indexOf(']', end);
  const stop = close >= 0 && /^\s*$/.test(text.slice(end + 1, close)) ? close + 1 : end + 1;
  return { json: text.slice(open, end + 1), text: text.slice(0, start) + text.slice(stop) };
}

// Proposition d'évolution validée : bornes, types connus, repère « after » vérifié
function parseEvolution(json, milestones) {
  let raw;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const clip = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const meetings = (Array.isArray(raw.meetings) ? raw.meetings : [])
    .map(m => ({ title: clip(m?.title, 120), type: EVOLVE_TYPES.includes(m?.type) ? m.type : 'decision', why: clip(m?.why, 300) }))
    .filter(m => m.title).slice(0, MAX_EVOLVE_MEETINGS);
  const brief = clip(raw.brief, 600);
  if (!meetings.length && !brief) return null;
  let after = null;
  const ref = /^R(\d{1,3})$/i.exec(String(raw.after || '').trim());
  if (ref && milestones[Number(ref[1]) - 1]) {
    const ms = milestones[Number(ref[1]) - 1];
    after = { ref: `R${Number(ref[1])}`, milestoneId: ms.id, title: ms.title };
  }
  return { kind: 'evolution', status: 'pending', summary: clip(raw.summary, 300), brief: brief || null, meetings, after, technical: raw.technical === true };
}

function parseReply(text, milestones) {
  const evo = extractEvolve(text);
  text = evo.text;
  const evolution = evo.json ? parseEvolution(evo.json, milestones) : null;
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
  if (evolution) proposal = evolution; // l'évolution prime : une seule carte par réponse
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
      model: DEFAULT_MODEL, max_tokens: 1200, // 900 + la ligne [EVOLVE:…] éventuelle
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

// POST /api/projects/:id/assistant/:messageId/evolution { accept } — l'humain accepte ou écarte
// une évolution proposée par le bras droit (v5.1, étape C du test « Gérard ») : ajout au brief,
// réunions insérées dans le plan, projet devenu « site ou appli », trace dans la mémoire
router.post('/:id/assistant/:messageId/evolution', async (req, res) => {
  const accept = req.body?.accept === true;
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [msg] = await db('AssistantMessage').where({ id: req.params.messageId, projectId: project.id, userId: req.user.id, role: 'assistant' }).limit(1);
    const proposal = msg ? parseJsonField(msg.proposal, null) : null;
    if (proposal?.kind !== 'evolution') return res.status(404).json({ error: 'Proposition introuvable' });
    if (proposal.status !== 'pending') return res.status(409).json({ error: 'Cette proposition a déjà été traitée.' });
    if (accept && project.userId !== req.user.id && !isAdminOf(req)) {
      return res.status(403).json({ error: 'Seul le porteur du projet peut le faire évoluer.' });
    }

    const result = { status: accept ? 'applied' : 'declined', decidedAt: new Date().toISOString() };
    if (accept) {
      const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      await db.transaction(async trx => {
        const updates = { updatedAt: new Date() };
        if (proposal.brief) updates.brief = [project.brief, `ÉVOLUTION (${date}) : ${proposal.brief}`].filter(Boolean).join('\n\n');
        if (proposal.technical) updates.hasTechnicalStack = true;
        await trx('Project').where({ id: project.id }).update(updates);

        // Réunions : juste après la réunion désignée si elle existe encore, sinon à la fin du plan
        let order = null;
        if (proposal.after?.milestoneId && proposal.meetings.length) {
          const [after] = await trx('Milestone').where({ id: proposal.after.milestoneId, projectId: project.id }).select('displayOrder').limit(1);
          if (after) {
            order = after.displayOrder + 1;
            await trx('Milestone').where({ projectId: project.id }).where('displayOrder', '>=', order).increment('displayOrder', proposal.meetings.length);
          }
        }
        if (order === null) {
          const [{ maxOrder }] = await trx('Milestone').max('displayOrder as maxOrder').where({ projectId: project.id });
          order = (maxOrder ?? -1) + 1;
        }
        result.milestoneIds = [];
        for (const [i, m] of proposal.meetings.entries()) {
          const id = randomUUID();
          await trx('Milestone').insert({
            id, projectId: project.id, title: m.title, description: m.why || null, status: 'pending',
            type: m.type, displayOrder: order + i, createdAt: new Date(), createdBy: req.user.id,
          });
          result.milestoneIds.push(id);
        }
        await trx('AssistantMessage').where({ id: msg.id }).update({ proposal: JSON.stringify({ ...proposal, ...result }) });
      });
      const lines = [proposal.summary || proposal.brief, ...proposal.meetings.map(m => `- Réunion ajoutée : « ${m.title} »`)].filter(Boolean);
      await appendMemory(project.id, `[${date} — Évolution du projet, acceptée avec le bras droit]\n${lines.join('\n')}`)
        .catch(err => console.error('[assistant evolution memory]', err.message));
    } else {
      await db('AssistantMessage').where({ id: msg.id }).update({ proposal: JSON.stringify({ ...proposal, ...result }) });
    }
    const [updated] = await db('AssistantMessage').where({ id: msg.id }).limit(1);
    res.json({ message: shape(updated) });
  } catch (err) {
    console.error('[assistant evolution]', err.message);
    res.status(500).json({ error: 'L’évolution n’a pas pu être appliquée.' });
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
module.exports.extractEvolve = extractEvolve;
