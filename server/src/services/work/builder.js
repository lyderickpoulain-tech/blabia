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

const MAX_TOKENS = 16000;
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
async function claimBuild(work, stage) {
  const n = await db('Work').where({ id: work.id })
    .andWhere(q => q.whereNot({ buildStatus: 'building' }).orWhere('buildStartedAt', '<', new Date(Date.now() - STALE_MS)))
    .update({ buildStatus: 'building', buildStage: stage, buildError: null, buildStartedAt: new Date(), updatedAt: new Date() });
  if (!n) throw new BuildError('Une version est déjà en cours d’écriture.', 409);
}

const setStage = (workId, stage) => db('Work').where({ id: workId }).update({ buildStage: stage, updatedAt: new Date() });

async function fail(workId, err) {
  console.error('[work/build]', err.message);
  const message = err instanceof BuildError ? err.message : 'La version n’a pas pu être écrite. Vous pouvez réessayer.';
  await db('Work').where({ id: workId }).update({ buildStatus: 'failed', buildStage: null, buildError: message, updatedAt: new Date() }).catch(() => {});
}

// ── Enregistrement d'une version ─────────────────────────────────────────────
async function saveVersion(trx, work, parsed, { author, userId, call, ideasById }) {
  const number = work.currentVersion + 1;
  const genre = getGenre(work.genre);
  const template = genre.templates[parsed.template] ? parsed.template : (work.template || genre.defaultTemplate);

  // Idées : connues (I3) → présence ; nouvelles → ajoutées, avec les mots du porteur
  const [{ maxIdea }] = await trx('WorkIdea').where({ workId: work.id }).max('displayOrder as maxIdea');
  let ideaOrder = (maxIdea ?? -1) + 1;
  const known = new Map((await trx('WorkIdea').where({ workId: work.id }).select('id', 'text')).map(i => [normalize(i.text), i.id]));
  const presence = [];
  for (const idea of parsed.ideas) {
    let id = idea.ref ? ideasById.get(idea.ref) : known.get(normalize(idea.text));
    if (!id && idea.text) {
      id = randomUUID();
      await trx('WorkIdea').insert({ id, workId: work.id, text: idea.text, source: author === 'history' ? 'historique' : (number === 1 ? 'recit' : 'commentaire'), displayOrder: ideaOrder++ });
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
        value: ownerChose ? prev.value : a.value, state: ownerChose ? 'applied' : 'assumed', displayOrder: order++,
      });
    } else {
      await trx('WorkAssumption').insert({ id: randomUUID(), workId: work.id, statement: a.statement, value: a.value, displayOrder: order++ });
    }
  }
  for (const a of current) {
    if (kept.has(a.id)) continue;
    // Choisie par le porteur : jamais perdue ; sinon retirée de l'affichage
    if (a.state === 'changed' || a.state === 'applied') await trx('WorkAssumption').where({ id: a.id }).update({ state: 'applied', displayOrder: order++ });
    else await trx('WorkAssumption').where({ id: a.id }).update({ state: 'retired' });
  }

  await trx('WorkVersion').insert({
    id: randomUUID(), workId: work.id, number, genre: work.genre, content: parsed.content,
    author: author === 'history' ? 'builder' : author, changeSummary: parsed.summary || null,
    ideasPresence: JSON.stringify(presence), sources: JSON.stringify(call.sources),
    model: call.model, durationMs: call.durationMs, createdBy: userId || null,
  });

  const workPatch = { currentVersion: number, template, buildStatus: 'idle', buildStage: null, buildError: null, updatedAt: new Date() };
  if (number === 1 && parsed.criteria.length) {
    workPatch.criteria = JSON.stringify(parsed.criteria.map(text => ({ id: randomUUID(), text, status: 'open' })));
  }
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

// ── Version suivante : suppositions changées et commentaires du porteur ──────
async function runNext(work, { projectId, userId, model }) {
  try {
    const project = await db('Project').where({ id: projectId }).first();
    const current = await db('WorkVersion').where({ workId: work.id, number: work.currentVersion }).first();
    const assumptions = await db('WorkAssumption').where({ workId: work.id }).whereNot({ state: 'retired' }).orderBy('displayOrder');
    const comments = await db('WorkComment').where({ workId: work.id, status: 'open' }).orderBy('createdAt');
    const ideaRows = await db('WorkIdea').where({ workId: work.id, state: 'active' }).orderBy('displayOrder');
    const ideas = ideaRows.map((i, k) => ({ ...i, ref: `I${k + 1}` }));
    const criteria = Array.isArray(work.criteria) ? work.criteria : JSON.parse(work.criteria || '[]');
    await setStage(work.id, 'writing');
    const call = await callBuilder(nextVersionPrompt({ story: storyOf(project), current, assumptions, comments, ideas, criteria }), { model });
    const parsed = parseBuilderOutput(call.text);
    if (!parsed.content || parsed.content.length < 80) throw new BuildError('La version reçue était vide. Vous pouvez réessayer.', 502);
    await setStage(work.id, 'saving');
    await db.transaction(async trx => {
      const fresh = await trx('Work').where({ id: work.id }).first();
      const number = await saveVersion(trx, fresh, parsed, { author: 'builder', userId, call, ideasById: new Map(ideas.map(i => [i.ref, i.id])) });
      if (comments.length) await trx('WorkComment').whereIn('id', comments.map(c => c.id)).update({ status: 'addressed', addressedInVersion: number });
    });
  } catch (err) { await fail(work.id, err); }
}

// ── Points d'entrée (les routes n'attendent pas la fin) ──────────────────────
// wait: true (tests, scripts de mesure) : attend la fin de la construction
async function startFirstVersion(projectId, userId, { fromHistory = false, model, wait = false } = {}) {
  const work = await ensureWork(projectId);
  if (work.currentVersion > 0) throw new BuildError('Ce projet a déjà sa première version.', 409);
  await claimBuild(work, 'reading');
  const job = runFirst(work, { projectId, userId, fromHistory, model });
  if (wait) await job;
  return work.id;
}

async function startNextVersion(projectId, userId, { model, wait = false } = {}) {
  const work = await workOf(projectId);
  if (!work || work.currentVersion < 1) throw new BuildError('Ce projet n’a pas encore de première version.', 409);
  const pending = await pendingChanges(work.id);
  if (!pending.assumptions && !pending.comments) throw new BuildError('Rien à changer : modifiez une supposition ou commentez une partie d’abord.', 400);
  await claimBuild(work, 'reading');
  const job = runNext(work, { projectId, userId, model });
  if (wait) await job;
  return work.id;
}

async function pendingChanges(workId) {
  const [{ a }] = await db('WorkAssumption').where({ workId, state: 'changed' }).count('* as a');
  const [{ c }] = await db('WorkComment').where({ workId, status: 'open' }).count('* as c');
  return { assumptions: Number(a), comments: Number(c) };
}

module.exports = { startFirstVersion, startNextVersion, pendingChanges, workOf, isStale, callBuilder, BuildError, STALE_MS };
