// v6 phase 2 : la réunion améliore l'ouvrage. Une réunion de revue porte sur la version en
// cours : elle s'ouvre sur l'avis du porteur (texte libre), deux ou trois assistants
// réagissent chacun depuis son regard, le porteur répond, et ainsi de suite ; quand il
// termine, le constructeur écrit la version suivante (une proposition qu'il accepte,
// corrige ou refuse — services/work/builder.js).
//
// BlabIA choisit les assistants (selon le genre de dossier), le modèle et l'absence de
// recherche web : rien de cela n'est montré. Pas de carte de décision, pas d'orchestrateur :
// chaque assistant parle une fois par tour de table, le porteur a la main entre deux tours.
// Les échanges tournent en arrière-plan ; l'écran relit l'état (GET) jusqu'à la fin du tour.
const { randomUUID } = require('crypto');
const db = require('../../utils/db');
const anthropic = require('../anthropic');
const { DEFAULT_MODEL } = require('../models');
const { buildReviewSystem, openingText } = require('../prompts/reviewPrompt');
const builder = require('./builder');
const { templateOf } = require('./genres');

const MAX_AGENTS = 3;
const MAX_TOKENS = 700;
const MAX_TEXT = 4000;
const ANIMATION = 'Animation';

// Tour de table en cours, par réunion : { agentName, error } (un seul serveur)
const rounds = new Map();

class ReviewError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const json = (v, fallback) => (v == null ? fallback : typeof v === 'string' ? JSON.parse(v) : v);
const versionLabel = n => (n === 1 ? 'la première version' : `la version ${n}`);

async function append(sessionId, message) {
  await db.raw(`UPDATE "Session" SET messages = COALESCE(messages, '[]'::jsonb) || ?::jsonb WHERE id = ?`, [JSON.stringify([message]), sessionId]);
}

// Les assistants qui relisent ce genre de dossier (genres.js, reviewers), parmi ceux du projet
async function reviewers(projectId, work) {
  let rows = await db('ProjectAgent').join('Agent', 'Agent.id', 'ProjectAgent.agentId')
    .where({ 'ProjectAgent.projectId': projectId, 'ProjectAgent.enabled': true })
    .orderBy('ProjectAgent.displayOrder').select('Agent.id', 'Agent.name', 'Agent.role', 'Agent.emoji', 'Agent.systemPrompt');
  if (!rows.length) rows = await db('Agent').where({ isDefault: true }).orderBy('createdAt').select('id', 'name', 'role', 'emoji', 'systemPrompt');
  const wanted = templateOf(work.genre, work.template).reviewers || [];
  const picked = wanted.map(n => rows.find(r => r.name === n)).filter(Boolean);
  for (const r of rows) if (picked.length < MAX_AGENTS && !picked.includes(r)) picked.push(r);
  return picked.slice(0, MAX_AGENTS);
}

const isReview = session => session?.reviewOfVersion != null;
const openReviewOf = projectId => db('Session').where({ projectId, status: 'open' }).whereNotNull('reviewOfVersion').orderBy('createdAt', 'desc').first();

// « Demander l'avis de l'équipe » : une réunion de revue de la version en cours (ou celle
// déjà ouverte, qu'on rejoint)
async function startReview(project, userId) {
  const work = await builder.workOf(project.id);
  if (!work?.currentVersion) throw new ReviewError('La première version n’est pas encore prête.', 409);
  const open = await openReviewOf(project.id);
  if (open) return open.id;
  if (work.buildStatus === 'building' && !builder.isStale(work)) throw new ReviewError('Une version est en cours d’écriture : l’équipe la lira quand elle sera prête.', 409);
  if (await builder.openProposal(work.id)) throw new ReviewError('Une proposition de version attend votre réponse sur « Mon projet ».', 409);
  const agents = await reviewers(project.id, work);
  if (!agents.length) throw new ReviewError('Aucun assistant n’est disponible pour ce projet.', 409);
  const comments = await db('WorkComment').where({ workId: work.id, status: 'open' }).orderBy('createdAt');
  const now = new Date();
  const id = randomUUID();
  await db('Session').insert({
    id, projectId: project.id, task: `Avis de l'équipe sur ${versionLabel(work.currentVersion)}`,
    messages: JSON.stringify([{ id: randomUUID(), role: 'system', type: 'animator', agentName: ANIMATION, content: openingText(work.currentVersion, comments), timestamp: now.toISOString() }]),
    activeAgents: JSON.stringify(agents.map(a => ({ ...a, joinedAt: now.toISOString() }))),
    status: 'open', mode: 'meeting', model: DEFAULT_MODEL, intention: JSON.stringify([]),
    webSearchEnabled: false, questionMode: 'delegate', challengerEnabled: false,
    reviewOfVersion: work.currentVersion, createdAt: now,
  });
  await db('Project').where({ id: project.id }).update({ updatedAt: now });
  return id;
}

// Contexte commun des assistants : relu à chaque tour de table (le porteur a pu changer une
// supposition ou ajouter une remarque entre deux tours)
async function reviewContext(project, session) {
  const work = await builder.workOf(project.id);
  const version = await db('WorkVersion').where({ workId: work.id, number: session.reviewOfVersion }).first();
  const [assumptions, ideaRows, comments] = await Promise.all([
    db('WorkAssumption').where({ workId: work.id }).whereNot({ state: 'retired' }).orderBy('displayOrder'),
    db('WorkIdea').where({ workId: work.id }).orderBy('displayOrder'),
    db('WorkComment').where({ workId: work.id, status: 'open' }).orderBy('createdAt'),
  ]);
  const presence = new Map(json(version.ideasPresence, []).map(p => [p.ideaId, p]));
  return {
    project, version, assumptions, comments,
    story: String(project.brief || project.description || project.name).replace(/^OBJECTIF : /, ''),
    ideas: ideaRows.map(i => ({ ...i, presence: presence.get(i.id) || null })),
    criteria: json(work.criteria, []),
    agents: json(session.activeAgents, []),
  };
}

// Historique de la réunion, un bloc par message, point de cache sur le dernier
function history(messages) {
  const lines = messages.filter(m => m.content && (m.role === 'human' || m.role === 'agent' || m.type === 'animator'))
    .map(m => (m.role === 'human' ? `Le porteur : ${m.content}` : m.role === 'agent' ? `${m.agentName} : ${m.content}` : `Animation : ${m.content}`));
  const blocks = ['RÉUNION EN COURS (du plus ancien au plus récent) :', ...lines.slice(-60)].map(text => ({ type: 'text', text }));
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  return blocks;
}

const textOf = r => (r?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

// Un tour de table : chaque assistant parle une fois ; celui que le porteur nomme, d'abord
async function runRound(project, sessionId, { humanText = '' } = {}) {
  rounds.set(sessionId, { agentName: null, error: null });
  try {
    const session = await db('Session').where({ id: sessionId }).first();
    const ctx = await reviewContext(project, session);
    const named = ctx.agents.filter(a => humanText.toLowerCase().includes(a.name.toLowerCase()));
    const order = [...named, ...ctx.agents.filter(a => !named.includes(a))];
    for (const agent of order) {
      rounds.set(sessionId, { agentName: agent.name, error: null });
      const fresh = await db('Session').where({ id: sessionId }).first('messages', 'status');
      if (fresh.status !== 'open') break; // terminée entre-temps
      const [common, turn] = buildReviewSystem(ctx, agent);
      const response = await anthropic.messages.create({
        model: session.model || DEFAULT_MODEL, max_tokens: MAX_TOKENS,
        system: [common, ...history(json(fresh.messages, [])), turn],
        messages: [{ role: 'user', content: 'À vous.' }],
      });
      let text = textOf(response);
      if (response.stop_reason === 'max_tokens') text = text.replace(/[^.!?»]*$/, '').trim() || text;
      if (!text) continue;
      await append(sessionId, { id: randomUUID(), role: 'agent', agentName: agent.name, turnId: randomUUID(), content: text, type: 'message', pinned: false, timestamp: new Date().toISOString() });
    }
    rounds.delete(sessionId);
  } catch (err) {
    console.error('[review]', err.message);
    rounds.set(sessionId, { agentName: null, error: 'Un assistant n’a pas pu répondre. Vous pouvez réécrire votre message, ou terminer la réunion.' });
  }
  await db('Project').where({ id: project.id }).update({ updatedAt: new Date() }).catch(() => {});
}

async function sessionOr404(project, sessionId) {
  const session = await db('Session').where({ id: sessionId, projectId: project.id }).first();
  if (!session || !isReview(session)) throw new ReviewError('Réunion introuvable.', 404);
  return session;
}

// Le porteur parle (ou préfère écouter l'équipe d'abord : texte vide), puis tour de table
async function speak(project, sessionId, userId, rawText, { wait = false } = {}) {
  const session = await sessionOr404(project, sessionId);
  if (session.status !== 'open') throw new ReviewError('Cette réunion est terminée.', 409);
  if (rounds.has(sessionId) && !rounds.get(sessionId).error) throw new ReviewError('L’équipe parle encore : attendez la fin de son tour.', 409);
  const text = String(rawText || '').trim().slice(0, MAX_TEXT);
  if (text) await append(sessionId, { id: randomUUID(), role: 'human', agentName: null, userId, content: text, type: 'message', pinned: false, timestamp: new Date().toISOString() });
  const job = runRound(project, sessionId, { humanText: text });
  if (wait) await job;
}

// Le porteur termine : la version suivante s'écrit avec ce qu'il a retenu de la réunion
async function conclude(project, sessionId, userId, { wait = false } = {}) {
  const session = await sessionOr404(project, sessionId);
  if (session.status !== 'open') throw new ReviewError('Cette réunion est déjà terminée.', 409);
  if (rounds.has(sessionId) && !rounds.get(sessionId).error) throw new ReviewError('L’équipe parle encore : attendez la fin de son tour.', 409);
  const said = json(session.messages, []).some(m => m.role === 'human' || m.role === 'agent');
  if (!said) throw new ReviewError('Rien n’a encore été dit dans cette réunion.', 400);
  const work = await builder.workOf(project.id);
  if (work.currentVersion !== session.reviewOfVersion) throw new ReviewError('Le projet a changé de version depuis le début de cette réunion.', 409);
  await builder.startProposal(project.id, userId, { origin: 'review', sessionId, wait: false });
  await db('Session').where({ id: sessionId }).update({ status: 'accepted', summary: 'La version suivante est en cours d’écriture.' });
  rounds.delete(sessionId);
  // Tests et scripts de mesure : attendre la fin de l'écriture (au plus la durée d'une écriture)
  const until = Date.now() + builder.STALE_MS;
  while (wait && Date.now() < until && (await builder.workOf(project.id)).buildStatus === 'building') {
    await new Promise(r => setTimeout(r, 200));
  }
}

// État de la réunion pour l'écran
async function reviewState(project, sessionId) {
  const session = await sessionOr404(project, sessionId);
  const round = rounds.get(sessionId) || null;
  const messages = json(session.messages, []).filter(m => m.role === 'human' || m.role === 'agent' || m.type === 'animator')
    .map(m => ({ id: m.id, role: m.role, agentName: m.agentName, content: m.content, timestamp: m.timestamp }));
  return {
    id: session.id, task: session.task, status: session.status, reviewOfVersion: session.reviewOfVersion,
    summary: session.summary, createdAt: session.createdAt,
    agents: json(session.activeAgents, []).map(a => ({ name: a.name, role: a.role })),
    messages,
    speaking: round && !round.error ? { agentName: round.agentName } : null,
    error: round?.error || null,
  };
}

module.exports = { startReview, speak, conclude, reviewState, isReview, openReviewOf, reviewers, ReviewError, rounds };
