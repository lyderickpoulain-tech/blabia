// v6 : le constructeur. Écrit la première version de l'ouvrage dès le récit (sans question),
// puis chaque version suivante. Un seul appel au modèle fort (models.js, BUILDER_MODEL),
// recherche web permise quand l'ouvrage dépend de faits. Tourne en arrière-plan : la route
// répond aussitôt, l'écran suit l'état (Work.buildStatus) jusqu'à la nouvelle version.
const { randomUUID } = require('crypto');
const db = require('../../utils/db');
const anthropic = require('../anthropic');
const { BUILDER_MODEL, BUILDER_EFFORT } = require('../models');
const { buildWebSearchTool } = require('../webSearchTool');
const { firstVersionPrompt, nextVersionPrompt } = require('../prompts/builderPrompt');
const { parseBuilderOutput, normalize } = require('./builderOutput');
const { getGenre } = require('./genres');

// Un dossier long (liste de 25 jeux avec liens, 10 projets détaillés) dépasse 18 000 jetons de
// sortie, réflexion comprise : coupé, il perdait idées, suppositions et état des phrases (rejeu de
// la phase 3). 32 000 laisse la marge ; une réponse encore coupée n'est jamais enregistrée.
const MAX_TOKENS = 32000;
const MAX_PAUSES = 3;          // relances après pause_turn (recherche longue)
const WEB_SEARCH_MAX_USES = 5;
const STALE_MS = 15 * 60 * 1000; // construction interrompue (redémarrage du serveur) au-delà

class BuildError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// ── Appel au modèle ──────────────────────────────────────────────────────────
async function callBuilder({ system, user }, { model = BUILDER_MODEL } = {}) {
  const started = Date.now();
  let messages = [{ role: 'user', content: user }];
  const texts = [];
  const sources = new Map();
  let response;
  for (let loop = 0; loop <= MAX_PAUSES; loop++) {
    response = await anthropic.messages.create({
      model, max_tokens: MAX_TOKENS, system,
      output_config: { effort: BUILDER_EFFORT },
      tools: [buildWebSearchTool({ maxUses: WEB_SEARCH_MAX_USES })],
      messages,
    }, { timeout: 9 * 60 * 1000 });
    for (const b of response.content || []) {
      if (b.type !== 'text') continue;
      texts.push(b.text);
      for (const c of b.citations || []) {
        if (c.type === 'web_search_result_location' && c.url && !sources.has(c.url)) sources.set(c.url, { url: c.url, title: c.title || c.url });
      }
    }
    if (response.stop_reason !== 'pause_turn') break;
    messages = [...messages, { role: 'assistant', content: response.content }];
  }
  if (response?.stop_reason === 'refusal') throw new BuildError('La version n’a pas pu être écrite pour ce projet.', 422);
  if (response?.stop_reason === 'max_tokens') throw new BuildError('La version était trop longue et a été coupée. Vous pouvez réessayer.', 502);
  return { text: texts.join(''), sources: [...sources.values()].slice(0, 30), model: response?.model || model, durationMs: Date.now() - started, truncated: response?.stop_reason === 'max_tokens' };
}

// ── Lecture de l'état ────────────────────────────────────────────────────────
const workOf = projectId => db('Work').where({ projectId }).first();

function isStale(work) {
  return work?.buildStatus === 'building' && work.buildStartedAt && Date.now() - new Date(work.buildStartedAt).getTime() > STALE_MS;
}

async function ensureWork(projectId) {
  const existing = await workOf(projectId);
  if (existing) return existing;
  const [work] = await db('Work').insert({ id: randomUUID(), projectId, genre: 'dossier' }).onConflict('projectId').ignore().returning('*');
  return work || workOf(projectId);
}

// Réserve la construction (une seule à la fois par projet)
async function claimBuild(work, stage, request = null) {
  const n = await db('Work').where({ id: work.id })
    .andWhere(q => q.whereNot({ buildStatus: 'building' }).orWhere('buildStartedAt', '<', new Date(Date.now() - STALE_MS)))
    .update({ buildStatus: 'building', buildStage: stage, buildError: null, buildStartedAt: new Date(), buildRequest: request ? JSON.stringify(request) : null, updatedAt: new Date() });
  if (!n) throw new BuildError('Une version est déjà en cours d’écriture.', 409);
}

const setStage = (workId, stage) => db('Work').where({ id: workId }).update({ buildStage: stage, updatedAt: new Date() });

async function fail(workId, err) {
  console.error('[work/build]', err.message);
  const message = err instanceof BuildError ? err.message : 'La version n’a pas pu être écrite. Vous pouvez réessayer.';
  await db('Work').where({ id: workId }).update({ buildStatus: 'failed', buildStage: null, buildError: message, updatedAt: new Date() }).catch(() => {});
}

// ── Enregistrement d'une version ─────────────────────────────────────────────
// asOf (proposition acceptée) : moment où elle a été écrite ; une supposition changée par
// le porteur après ce moment n'y est pas encore appliquée et reste « changée »
const changedSince = (a, asOf) => a.state === 'changed' && !!asOf && !!a.changedAt && new Date(a.changedAt) > asOf;

async function saveVersion(trx, work, parsed, { author, userId, call, ideasById, asOf = null, ideaSource = 'commentaire' }) {
  const number = work.currentVersion + 1;
  const genre = getGenre(work.genre);
  const template = genre.templates[parsed.template] ? parsed.template : (work.template || genre.defaultTemplate);

  // Idées : connues (I3) → présence ; nouvelles → ajoutées, avec les mots du porteur
  const [{ maxIdea }] = await trx('WorkIdea').where({ workId: work.id }).max('displayOrder as maxIdea');
  let ideaOrder = (maxIdea ?? -1) + 1;
  const known = new Map((await trx('WorkIdea').where({ workId: work.id }).select('id', 'text')).map(i => [normalize(i.text), i.id]));
  const presence = [];
  for (const idea of parsed.ideas) {
    let id = idea.ideaId || (idea.ref ? ideasById.get(idea.ref) : known.get(normalize(idea.text)));
    if (!id && idea.text) {
      id = randomUUID();
      await trx('WorkIdea').insert({ id, workId: work.id, text: idea.text, source: author === 'history' ? 'historique' : (number === 1 ? 'recit' : ideaSource), displayOrder: ideaOrder++ });
      known.set(normalize(idea.text), id);
    }
    if (id && !presence.some(p => p.ideaId === id)) presence.push({ ideaId: id, present: idea.present, where: idea.where });
  }

  // Suppositions : la valeur choisie par le porteur fait foi ; une supposition absente de
  // la nouvelle liste est retirée (jamais supprimée)
  const current = await trx('WorkAssumption').where({ workId: work.id }).whereNot({ state: 'retired' });
  const byStatement = new Map(current.map(a => [normalize(a.statement), a]));
  const kept = new Set();
  let order = 0;
  for (const a of parsed.assumptions) {
    const prev = byStatement.get(normalize(a.statement));
    if (prev) {
      kept.add(prev.id);
      const ownerChose = prev.state === 'changed' || prev.state === 'applied';
      await trx('WorkAssumption').where({ id: prev.id }).update({
        value: ownerChose ? prev.value : a.value, state: changedSince(prev, asOf) ? 'changed' : ownerChose ? 'applied' : 'assumed', displayOrder: order++,
      });
    } else {
      await trx('WorkAssumption').insert({ id: randomUUID(), workId: work.id, statement: a.statement, value: a.value, displayOrder: order++ });
    }
  }
  for (const a of current) {
    if (kept.has(a.id)) continue;
    // Choisie par le porteur : jamais perdue ; sinon retirée de l'affichage
    if (a.state === 'changed' || a.state === 'applied') await trx('WorkAssumption').where({ id: a.id }).update({ state: changedSince(a, asOf) ? 'changed' : 'applied', displayOrder: order++ });
    else await trx('WorkAssumption').where({ id: a.id }).update({ state: 'retired' });
  }

  // « Ce sera fini quand… » : la liste de la réponse (première version ; ensuite, elle suit le
  // projet quand le porteur l'a changé), puis l'état de chaque phrase (C1 = sa première phrase).
  // Liste corrigée par le porteur depuis l'écriture de la proposition : la sienne fait foi.
  const before = Array.isArray(work.criteria) ? work.criteria : JSON.parse(work.criteria || '[]');
  const ownerEdited = parsed.baseCriteria && parsed.baseCriteria.join('\n') !== before.map(c => c.text).join('\n');
  const proposed = (parsed.criteria || []).length && !ownerEdited ? parsed.criteria : null;
  const byText = new Map(before.map(c => [c.text, c]));
  const criteria = proposed
    ? proposed.map(text => byText.get(text) || { id: randomUUID(), text, status: 'open' })
    : before;
  const status = new Map();
  if (!ownerEdited) {
    for (const c of parsed.criteriaStatus || []) {
      const id = criteria[Number(String(c.ref).slice(1)) - 1]?.id;
      if (id) status.set(id, { criterionId: id, met: !!c.met, note: c.note || null });
    }
  }
  const updatedCriteria = criteria.map(c => (status.has(c.id)
    ? { ...c, status: status.get(c.id).met ? 'met' : 'open', note: status.get(c.id).note, checkedIn: number }
    : c));

  await trx('WorkVersion').insert({
    id: randomUUID(), workId: work.id, number, genre: work.genre, content: parsed.content,
    author: author === 'history' ? 'builder' : author, changeSummary: parsed.summary || null,
    ideasPresence: JSON.stringify(presence), sources: JSON.stringify(call.sources),
    model: call.model, durationMs: call.durationMs, createdBy: userId || null,
    criteriaStatus: JSON.stringify([...status.values()]), nextSteps: JSON.stringify(parsed.nextSteps || []),
  });

  const workPatch = { currentVersion: number, template, buildStatus: 'idle', buildStage: null, buildError: null, criteria: JSON.stringify(updatedCriteria), updatedAt: new Date() };
  await trx('Work').where({ id: work.id }).update(workPatch);
  return number;
}

// ── Première version (récit, ou historique d'un projet existant) ─────────────
async function historyOf(projectId) {
  const project = await db('Project').where({ id: projectId }).first();
  const decisions = await db('Decision').where({ projectId, status: 'active' }).orderBy('createdAt').select('statement');
  const sessions = await db('Session').where({ projectId }).whereNotNull('summary').orderBy('createdAt', 'desc').limit(12).select('task', 'summary', 'createdAt');
  const parts = [];
  if (project.vision) parts.push(`CE QUE LE PORTEUR VEUT (sa vision validée) :\n${project.vision}`);
  if (decisions.length) parts.push(`DÉCISIONS EN VIGUEUR :\n${decisions.map(d => `- ${d.statement}`).join('\n')}`);
  let budget = 24000;
  const summaries = [];
  for (const s of sessions) { // les plus récentes d'abord, dans la limite
    const text = `### ${s.task} (${new Date(s.createdAt).toLocaleDateString('fr-FR')})\n${String(s.summary).slice(0, 4000)}`;
    if (text.length > budget) break;
    budget -= text.length;
    summaries.unshift(text);
  }
  if (summaries.length) parts.push(`COMPTES RENDUS DES RÉUNIONS :\n${summaries.join('\n\n')}`);
  return { story: project.brief || project.description || project.name, history: parts.join('\n\n') || null };
}

async function runFirst(work, { projectId, userId, fromHistory, model }) {
  try {
    const project = await db('Project').where({ id: projectId }).first();
    const input = fromHistory ? await historyOf(projectId) : { story: storyOf(project) };
    await setStage(work.id, 'writing');
    const call = await callBuilder(firstVersionPrompt(input), { model });
    const parsed = parseBuilderOutput(call.text);
    if (!parsed.content || parsed.content.length < 80) throw new BuildError('La version reçue était vide. Vous pouvez réessayer.', 502);
    await setStage(work.id, 'saving');
    await db.transaction(async trx => {
      const fresh = await trx('Work').where({ id: work.id }).first();
      await saveVersion(trx, fresh, parsed, { author: fromHistory ? 'history' : 'builder', userId, call, ideasById: new Map() });
      // Nom déduit du récit, seulement s'il n'a pas été choisi (projet créé en une question)
      if (parsed.name && !fromHistory && project.name === 'Mon projet') await trx('Project').where({ id: projectId }).update({ name: parsed.name, updatedAt: new Date() });
    });
  } catch (err) { await fail(work.id, err); }
}

// Récit du porteur : le brief sans l'étiquette « OBJECTIF : » de la création v6
const storyOf = project => String(project.brief || project.description || project.name).replace(/^OBJECTIF : /, '');

// ── Version suivante : une PROPOSITION (phase 2) ─────────────────────────────
// Le constructeur écrit la version suivante à partir des suppositions changées, des
// remarques du porteur et, après une réunion, de ce qui s'y est dit. Rien n'est appliqué
// avant que le porteur l'accepte (acceptProposal) : il voit ce qui change, puis accepte,
// corrige ou refuse.
const PROPOSAL_ORIGINS = ['changes', 'review', 'retouch'];
const json = (v, fallback) => (v == null ? fallback : typeof v === 'string' ? JSON.parse(v) : v);

// Transcription d'une réunion de revue pour le constructeur
async function meetingTranscript(sessionId) {
  if (!sessionId) return null;
  const s = await db('Session').where({ id: sessionId }).first('messages');
  const lines = json(s?.messages, []).filter(m => m.content && (m.role === 'human' || m.role === 'agent'))
    .map(m => `${m.role === 'human' ? 'Porteur' : m.agentName} : ${String(m.content).trim()}`);
  return lines.length ? lines.join('\n\n').slice(-30000) : null;
}

async function runProposal(work, { projectId, userId, model, origin, sessionId, corrected }) {
  try {
    const project = await db('Project').where({ id: projectId }).first();
    const current = await db('WorkVersion').where({ workId: work.id, number: work.currentVersion }).first();
    const assumptions = await db('WorkAssumption').where({ workId: work.id }).whereNot({ state: 'retired' }).orderBy('displayOrder');
    const comments = await db('WorkComment').where({ workId: work.id, status: 'open' }).orderBy('createdAt');
    const ideaRows = await db('WorkIdea').where({ workId: work.id, state: 'active' }).orderBy('displayOrder');
    const ideas = ideaRows.map((i, k) => ({ ...i, ref: `I${k + 1}` }));
    const criteria = json(work.criteria, []);
    const meeting = await meetingTranscript(sessionId);
    const startedAt = new Date();
    await setStage(work.id, 'writing');
    const call = await callBuilder(nextVersionPrompt({ story: storyOf(project), current, assumptions, comments, ideas, criteria, meeting, corrected: corrected?.content || null }), { model });
    const parsed = parseBuilderOutput(call.text);
    if (!parsed.content || parsed.content.length < 80) throw new BuildError('La version reçue était vide. Vous pouvez réessayer.', 502);
    await setStage(work.id, 'saving');
    const refs = new Map(ideas.map(i => [i.ref, i.id]));
    const { content, summary, ...rest } = parsed;
    rest.ideas = rest.ideas.map(i => (i.ref && refs.has(i.ref) ? { ...i, ideaId: refs.get(i.ref) } : i));
    rest.asOf = startedAt.toISOString();
    rest.baseCriteria = criteria.map(c => c.text); // la liste au moment de l'écriture
    await db.transaction(async trx => {
      await trx('WorkProposal').insert({
        id: randomUUID(), workId: work.id, baseVersion: work.currentVersion, origin, sessionId: sessionId || null,
        content, changeSummary: summary || null, parsed: JSON.stringify(rest), commentIds: JSON.stringify(comments.map(c => c.id)),
        sources: JSON.stringify(call.sources), model: call.model, durationMs: call.durationMs, createdBy: userId || null,
      });
      await trx('Work').where({ id: work.id }).update({ buildStatus: 'idle', buildStage: null, buildError: null, updatedAt: new Date() });
      if (sessionId && summary) await trx('Session').where({ id: sessionId }).update({ summary: `Ce qui change dans la version proposée :\n${summary}` });
    });
  } catch (err) { await fail(work.id, err); }
}

const openProposal = workId => db('WorkProposal').where({ workId, status: 'proposed' }).orderBy('createdAt', 'desc').first();

// Le porteur garde la proposition : elle devient la version suivante (suppositions, idées et
// remarques appliquées à ce moment-là)
async function acceptProposal(projectId, proposalId, userId) {
  const work = await workOf(projectId);
  const proposal = work && await db('WorkProposal').where({ id: proposalId, workId: work.id }).first();
  if (!proposal) throw new BuildError('Proposition introuvable.', 404);
  if (proposal.status !== 'proposed') throw new BuildError('Cette proposition a déjà reçu votre réponse.', 409);
  const parsed = json(proposal.parsed, {});
  const commentIds = json(proposal.commentIds, []);
  return db.transaction(async trx => {
    const fresh = await trx('Work').where({ id: work.id }).forUpdate().first();
    if (fresh.currentVersion !== proposal.baseVersion) throw new BuildError('Le projet a changé depuis cette proposition.', 409);
    const number = await saveVersion(trx, fresh, { ...parsed, content: proposal.content, summary: proposal.changeSummary }, {
      author: 'builder', userId,
      call: { sources: json(proposal.sources, []), model: proposal.model, durationMs: proposal.durationMs },
      ideasById: new Map(),
      asOf: parsed.asOf ? new Date(parsed.asOf) : null,
      ideaSource: proposal.origin === 'review' ? 'reunion' : 'commentaire',
    });
    if (commentIds.length) await trx('WorkComment').whereIn('id', commentIds).where({ status: 'open' }).update({ status: 'addressed', addressedInVersion: number });
    await trx('WorkProposal').where({ id: proposal.id }).update({ status: 'accepted', acceptedVersion: number, decidedAt: new Date() });
    if (proposal.sessionId) await trx('Session').where({ id: proposal.sessionId }).update({ summary: `Version ${number} acceptée. Ce qui a changé :\n${proposal.changeSummary || ''}`.trim() });
    return number;
  });
}

// Le porteur refuse : rien n'est appliqué ; ses remarques restent en attente
async function refuseProposal(projectId, proposalId) {
  const work = await workOf(projectId);
  const proposal = work && await db('WorkProposal').where({ id: proposalId, workId: work.id, status: 'proposed' }).first();
  if (!proposal) throw new BuildError('Proposition introuvable ou déjà traitée.', 404);
  await db('WorkProposal').where({ id: proposal.id }).update({ status: 'refused', decidedAt: new Date() });
  if (proposal.sessionId) await db('Session').where({ id: proposal.sessionId }).update({ summary: `Version proposée, refusée par le porteur.\n${proposal.changeSummary || ''}`.trim() });
}

// ── Points d'entrée (les routes n'attendent pas la fin) ──────────────────────
// wait: true (tests, scripts de mesure) : attend la fin de la construction
async function startFirstVersion(projectId, userId, { fromHistory = false, model, wait = false } = {}) {
  const work = await ensureWork(projectId);
  if (work.currentVersion > 0) throw new BuildError('Ce projet a déjà sa première version.', 409);
  await claimBuild(work, 'reading', { kind: 'first', fromHistory });
  const job = runFirst(work, { projectId, userId, fromHistory, model });
  if (wait) await job;
  return work.id;
}

// Version suivante proposée. origin : changes (suppositions, remarques), review (réunion),
// retouch (le porteur écrit ce qu'il veut changer). Une seule proposition ouverte à la fois.
async function startProposal(projectId, userId, { origin = 'changes', sessionId = null, corrected = null, model, wait = false } = {}) {
  if (!PROPOSAL_ORIGINS.includes(origin)) throw new BuildError('Origine inconnue.', 400);
  const work = await workOf(projectId);
  if (!work || work.currentVersion < 1) throw new BuildError('Ce projet n’a pas encore de première version.', 409);
  if (!corrected && await openProposal(work.id)) throw new BuildError('Une proposition de version attend déjà votre réponse.', 409);
  if (origin !== 'review') {
    const pending = await pendingChanges(work.id);
    if (!pending.assumptions && !pending.comments) throw new BuildError('Rien à changer : modifiez une supposition ou commentez une partie d’abord.', 400);
  }
  await claimBuild(work, 'reading', { kind: 'proposal', origin, sessionId, correctedId: corrected?.id || null });
  const job = runProposal(work, { projectId, userId, model, origin, sessionId, corrected });
  if (wait) await job;
  return work.id;
}

const startNextVersion = (projectId, userId, opts = {}) => startProposal(projectId, userId, { ...opts, origin: 'changes' });

// Le porteur corrige : sa correction devient une remarque, et la proposition est réécrite à
// partir d'elle-même (même origine, même réunion)
async function correctProposal(projectId, proposalId, userId, text, { model, wait = false } = {}) {
  const work = await workOf(projectId);
  const proposal = work && await db('WorkProposal').where({ id: proposalId, workId: work.id, status: 'proposed' }).first();
  if (!proposal) throw new BuildError('Proposition introuvable ou déjà traitée.', 404);
  // Réservée avant tout changement : rien n'est touché si une écriture est déjà en cours
  await claimBuild(work, 'reading', { kind: 'proposal', origin: proposal.origin, sessionId: proposal.sessionId, correctedId: proposal.id });
  await db('WorkComment').insert({ id: randomUUID(), workId: work.id, versionNumber: work.currentVersion, section: null, content: text, userId });
  await db('WorkProposal').where({ id: proposal.id }).update({ status: 'corrected', decidedAt: new Date() });
  const job = runProposal(work, { projectId, userId, model, origin: proposal.origin, sessionId: proposal.sessionId, corrected: proposal });
  if (wait) await job;
  return work.id;
}

// Retouche : le porteur écrit ce qu'il veut changer, sans réunion
async function startRetouch(projectId, userId, text, { model, wait = false } = {}) {
  const work = await workOf(projectId);
  if (!work || work.currentVersion < 1) throw new BuildError('Ce projet n’a pas encore de première version.', 409);
  if (await openProposal(work.id)) throw new BuildError('Une proposition de version attend déjà votre réponse.', 409);
  await claimBuild(work, 'reading', { kind: 'proposal', origin: 'retouch' });
  await db('WorkComment').insert({ id: randomUUID(), workId: work.id, versionNumber: work.currentVersion, section: null, content: text, userId });
  const job = runProposal(work, { projectId, userId, model, origin: 'retouch', sessionId: null, corrected: null });
  if (wait) await job;
  return work.id;
}

// « Réessayer » après un échec : la même écriture, avec les mêmes entrées
async function retryBuild(projectId, userId, { model, wait = false } = {}) {
  const work = await workOf(projectId);
  if (!work || (work.buildStatus !== 'failed' && !isStale(work))) throw new BuildError('Aucune écriture à reprendre.', 409);
  const request = json(work.buildRequest, null) || (work.currentVersion ? { kind: 'proposal', origin: 'changes' } : { kind: 'first' });
  await claimBuild(work, 'reading', request);
  let job;
  if (!work.currentVersion) job = runFirst(work, { projectId, userId, fromHistory: !!request.fromHistory, model });
  else {
    const corrected = request.correctedId ? await db('WorkProposal').where({ id: request.correctedId, workId: work.id }).first() : null;
    job = runProposal(work, { projectId, userId, model, origin: request.origin || 'changes', sessionId: request.sessionId || null, corrected });
  }
  if (wait) await job;
  return work.id;
}

async function pendingChanges(workId) {
  const [{ a }] = await db('WorkAssumption').where({ workId, state: 'changed' }).count('* as a');
  const [{ c }] = await db('WorkComment').where({ workId, status: 'open' }).count('* as c');
  return { assumptions: Number(a), comments: Number(c) };
}

module.exports = {
  startFirstVersion, startNextVersion, startProposal, startRetouch, retryBuild, acceptProposal, refuseProposal, correctProposal,
  openProposal, pendingChanges, workOf, isStale, callBuilder, BuildError, STALE_MS,
};
