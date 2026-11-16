// v6 « l'ouvrage d'abord » : création en une question et ouvrage du projet.
// Le cœur v6 n'importe rien du parcours technique (github, devTasks, railway, tools…).
const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const { parseJsonField } = require('../utils/parseJsonField');
const { runWithUsage } = require('../services/usage');
const { createProjectFromStory } = require('../services/projectFactory');
const builder = require('../services/work/builder');
const { getGenre } = require('../services/work/genres');
const review = require('../services/work/review');

const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

const STORY_MIN = 15;
const STORY_MAX = 8000;

const sendError = (res, err, where) => {
  if (err instanceof builder.BuildError || err instanceof review.ReviewError) return res.status(err.status).json({ error: err.message });
  console.error(`[work ${where}]`, err.message);
  return res.status(500).json({ error: 'Erreur serveur' });
};

async function projectOr404(req, res) {
  const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return null; }
  return project;
}

// État complet de l'ouvrage, pour l'écran « Mon projet »
async function serialize(project) {
  const work = await builder.workOf(project.id);
  if (!work) return { exists: false, versionCount: 0 };
  const stale = builder.isStale(work);
  const [current, versions, assumptions, ideas, comments, pending, proposal, openReview] = await Promise.all([
    work.currentVersion ? db('WorkVersion').where({ workId: work.id, number: work.currentVersion }).first() : null,
    db('WorkVersion').where({ workId: work.id }).orderBy('number', 'desc').select('number', 'changeSummary', 'author', 'createdAt'),
    db('WorkAssumption').where({ workId: work.id }).whereNot({ state: 'retired' }).orderBy('displayOrder').select('id', 'statement', 'value', 'state'),
    db('WorkIdea').where({ workId: work.id }).orderBy('displayOrder').select('id', 'text', 'source', 'state'),
    db('WorkComment').where({ workId: work.id }).orderBy('createdAt').select('id', 'versionNumber', 'section', 'content', 'status', 'addressedInVersion', 'createdAt'),
    builder.pendingChanges(work.id),
    builder.openProposal(work.id),
    review.openReviewOf(project.id),
  ]);
  const presence = new Map(parseJsonField(current?.ideasPresence, []).map(p => [p.ideaId, p]));
  return {
    exists: true,
    genre: work.genre,
    template: work.template,
    templateLabel: work.template ? getGenre(work.genre).templates[work.template]?.label || null : null,
    build: { status: stale ? 'failed' : work.buildStatus, stage: stale ? null : work.buildStage, error: stale ? 'L’écriture a été interrompue. Vous pouvez réessayer.' : work.buildError, startedAt: work.buildStartedAt },
    current: current ? { number: current.number, content: current.content, changeSummary: current.changeSummary, sources: parseJsonField(current.sources, []), createdAt: current.createdAt } : null,
    versions,
    assumptions,
    ideas: ideas.map(i => ({ ...i, presence: presence.get(i.id) || null })),
    comments,
    criteria: parseJsonField(work.criteria, []),
    pending,
    // Phase 2 : version suivante proposée, en attente de la réponse du porteur
    proposal: proposal ? {
      id: proposal.id, origin: proposal.origin, number: proposal.baseVersion + 1, baseVersion: proposal.baseVersion,
      content: proposal.content, changeSummary: proposal.changeSummary, sources: parseJsonField(proposal.sources, []),
      sessionId: proposal.sessionId, createdAt: proposal.createdAt,
    } : null,
    openReview: openReview ? { id: openReview.id, task: openReview.task } : null,
  };
}

// POST /api/projects/from-story { story } — création en une seule question, puis la
// première version s'écrit aussitôt, sans question
router.post('/from-story', async (req, res) => {
  if (req.user.role === 'user') return res.status(403).json({ error: 'Votre compte ne permet pas de créer des projets' });
  const story = String(req.body?.story || '').trim();
  if (story.length < STORY_MIN) return res.status(400).json({ error: 'Racontez votre projet en une ou deux phrases au moins.' });
  if (story.length > STORY_MAX) return res.status(400).json({ error: `Votre récit est trop long (${STORY_MAX} caractères au plus).` });
  try {
    const project = await createProjectFromStory(req.user.id, story);
    await runWithUsage({ req, userId: req.user.id, projectId: project.id, kind: 'work/build' },
      () => builder.startFirstVersion(project.id, req.user.id));
    res.status(201).json({ id: project.id });
  } catch (err) { sendError(res, err, 'from-story'); }
});

router.get('/:id/work', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    res.json(await serialize(project));
  } catch (err) { sendError(res, err, 'GET'); }
});

router.get('/:id/work/versions/:n', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    const work = await builder.workOf(project.id);
    const v = work && await db('WorkVersion').where({ workId: work.id, number: Number.parseInt(req.params.n, 10) || 0 }).first();
    if (!v) return res.status(404).json({ error: 'Version introuvable' });
    res.json({ number: v.number, content: v.content, changeSummary: v.changeSummary, sources: parseJsonField(v.sources, []), createdAt: v.createdAt });
  } catch (err) { sendError(res, err, 'GET version'); }
});

// Première version : projet créé en une question (nouvel essai), ou projet existant
// (« Créer mon projet à partir de l'historique » : récit, décisions, comptes rendus)
router.post('/:id/work/first', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    const [{ n }] = await db('Session').where({ projectId: project.id }).count('* as n');
    const fromHistory = req.body?.fromHistory === true || Number(n) > 0;
    await builder.startFirstVersion(project.id, req.user.id, { fromHistory });
    res.status(202).json(await serialize(project));
  } catch (err) { sendError(res, err, 'first'); }
});

// Version suivante : suppositions changées et commentaires pris en compte
router.post('/:id/work/next', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    await builder.startNextVersion(project.id, req.user.id);
    res.status(202).json(await serialize(project));
  } catch (err) { sendError(res, err, 'next'); }
});

// « Réessayer » après un échec : la même écriture (première version ou proposition)
router.post('/:id/work/retry', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    await builder.retryBuild(project.id, req.user.id);
    res.status(202).json(await serialize(project));
  } catch (err) { sendError(res, err, 'retry'); }
});

// Retouche, sans réunion : le porteur écrit ce qu'il veut changer, le bras droit la fait
// (une proposition de version suivante)
router.post('/:id/work/retouch', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    const text = String(req.body?.text || '').trim().slice(0, 3000);
    if (!text) return res.status(400).json({ error: 'Écrivez ce que vous voulez changer.' });
    await builder.startRetouch(project.id, req.user.id, text);
    res.status(202).json(await serialize(project));
  } catch (err) { sendError(res, err, 'retouch'); }
});

// Réponse du porteur à une proposition : accept (elle devient la version suivante), refuse
// (rien ne change), correct { text } (réécrite avec sa correction)
router.post('/:id/work/proposals/:pid/:answer', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    const { pid, answer } = req.params;
    if (answer === 'accept') await builder.acceptProposal(project.id, pid, req.user.id);
    else if (answer === 'refuse') await builder.refuseProposal(project.id, pid);
    else if (answer === 'correct') {
      if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
      const text = String(req.body?.text || '').trim().slice(0, 3000);
      if (!text) return res.status(400).json({ error: 'Écrivez ce qu’il faut corriger.' });
      await builder.correctProposal(project.id, pid, req.user.id, text);
    } else return res.status(404).json({ error: 'Réponse inconnue' });
    res.json(await serialize(project));
  } catch (err) { sendError(res, err, 'proposal'); }
});

// ── Réunion de revue (phase 2) ───────────────────────────────────────────────
// « Demander l'avis de l'équipe » : ouvre la réunion (ou rejoint celle qui est ouverte)
router.post('/:id/work/review', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple : créez votre projet pour réunir l’équipe.' });
    const sessionId = await review.startReview(project, req.user.id);
    res.status(201).json({ sessionId });
  } catch (err) { sendError(res, err, 'review'); }
});

router.get('/:id/sessions/:sid/review', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    res.json(await review.reviewState(project, req.params.sid));
  } catch (err) { sendError(res, err, 'review GET'); }
});

// Le porteur parle (text vide : il écoute l'équipe d'abord) ; l'équipe répond en arrière-plan
router.post('/:id/sessions/:sid/review/message', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    await review.speak(project, req.params.sid, req.user.id, req.body?.text);
    res.status(202).json(await review.reviewState(project, req.params.sid));
  } catch (err) { sendError(res, err, 'review message'); }
});

// Le porteur termine la réunion : la version suivante s'écrit (proposition)
router.post('/:id/sessions/:sid/review/conclude', async (req, res) => {
  try {
    const project = await projectOr404(req, res); if (!project) return;
    if (project.isDemo) return res.status(400).json({ error: 'Indisponible sur le projet exemple.' });
    await review.conclude(project, req.params.sid, req.user.id);
    res.status(202).json(await serialize(project));
  } catch (err) { sendError(res, err, 'review conclude'); }
});

async function workOr404(req, res) {
  const project = await projectOr404(req, res); if (!project) return null;
  const work = await builder.workOf(project.id);
  if (!work) { res.status(404).json({ error: 'Ce projet n’a pas encore de version.' }); return null; }
  return { project, work };
}

// Changer une supposition : jamais bloquant ; la version suivante l'appliquera
router.patch('/:id/work/assumptions/:aid', async (req, res) => {
  try {
    const ctx = await workOr404(req, res); if (!ctx) return;
    const value = String(req.body?.value || '').trim().slice(0, 500);
    if (!value) return res.status(400).json({ error: 'Indiquez ce qu’il faut retenir.' });
    const n = await db('WorkAssumption').where({ id: req.params.aid, workId: ctx.work.id }).whereNot({ state: 'retired' })
      .update({ value, state: 'changed', changedAt: new Date() });
    if (!n) return res.status(404).json({ error: 'Supposition introuvable' });
    res.json(await serialize(ctx.project));
  } catch (err) { sendError(res, err, 'assumption'); }
});

// Commenter une partie de l'ouvrage (ou l'ensemble)
router.post('/:id/work/comments', async (req, res) => {
  try {
    const ctx = await workOr404(req, res); if (!ctx) return;
    const content = String(req.body?.content || '').trim().slice(0, 3000);
    if (!content) return res.status(400).json({ error: 'Votre commentaire est vide.' });
    if (!ctx.work.currentVersion) return res.status(409).json({ error: 'La première version n’est pas encore prête.' });
    const { randomUUID } = require('crypto');
    await db('WorkComment').insert({
      id: randomUUID(), workId: ctx.work.id, versionNumber: ctx.work.currentVersion,
      section: req.body?.section ? String(req.body.section).slice(0, 200) : null, content, userId: req.user.id,
    });
    res.status(201).json(await serialize(ctx.project));
  } catch (err) { sendError(res, err, 'comment'); }
});

router.delete('/:id/work/comments/:cid', async (req, res) => {
  try {
    const ctx = await workOr404(req, res); if (!ctx) return;
    const n = await db('WorkComment').where({ id: req.params.cid, workId: ctx.work.id, status: 'open' }).del();
    if (!n) return res.status(404).json({ error: 'Commentaire introuvable ou déjà pris en compte' });
    res.json(await serialize(ctx.project));
  } catch (err) { sendError(res, err, 'comment delete'); }
});

// « Ce sera fini quand… » : le porteur corrige la liste
router.put('/:id/work/criteria', async (req, res) => {
  try {
    const ctx = await workOr404(req, res); if (!ctx) return;
    const { randomUUID } = require('crypto');
    const previous = new Map(parseJsonField(ctx.work.criteria, []).map(c => [c.text, c]));
    const texts = (Array.isArray(req.body?.criteria) ? req.body.criteria : []).map(t => String(t || '').trim().slice(0, 300)).filter(Boolean).slice(0, 8);
    const criteria = texts.map(text => previous.get(text) || { id: randomUUID(), text, status: 'open' });
    await db('Work').where({ id: ctx.work.id }).update({ criteria: JSON.stringify(criteria), updatedAt: new Date() });
    res.json(await serialize(ctx.project));
  } catch (err) { sendError(res, err, 'criteria'); }
});

// Une idée n'est mise de côté (ou reprise) que par le porteur
router.patch('/:id/work/ideas/:iid', async (req, res) => {
  try {
    const ctx = await workOr404(req, res); if (!ctx) return;
    const state = req.body?.state === 'set_aside' ? 'set_aside' : 'active';
    const n = await db('WorkIdea').where({ id: req.params.iid, workId: ctx.work.id }).update({ state });
    if (!n) return res.status(404).json({ error: 'Idée introuvable' });
    res.json(await serialize(ctx.project));
  } catch (err) { sendError(res, err, 'idea'); }
});

module.exports = router;
module.exports.serialize = serialize;
