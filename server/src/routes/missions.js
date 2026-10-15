const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const { listMissions, monthlyCommitted, KINDS, ACTIVE, LEVELS, LEVEL_IDS, postponeMeetingForMission } = require('../services/missions');
const { kickMissions, setMissionOutcome } = require('../services/missionRunner');

// Missions des agents (v5.1) : liste, validation (plafond), refus, annulation, relance.
const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);
const round2 = n => Math.round(n * 100) / 100;

async function load(req, res) {
  const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
  if (!project) { res.status(404).json({ error: 'Projet introuvable' }); return {}; }
  if (!req.params.mid) return { project };
  const [mission] = await db('AgentMission').where({ id: req.params.mid, projectId: project.id }).limit(1);
  if (!mission) { res.status(404).json({ error: 'Mission introuvable' }); return {}; }
  return { project, mission };
}

// Le budget mensuel du projet permet-il de réserver ce plafond ?
async function checkBudget(project, budgetUSD) {
  const { spent, reserved } = await monthlyCommitted(project.id);
  const left = project.missionsMonthlyBudgetUSD - spent - reserved;
  return left + 1e-9 >= budgetUSD ? null
    : `Budget des missions du mois insuffisant : il reste ${Math.max(0, left).toFixed(2)} $ sur ${project.missionsMonthlyBudgetUSD.toFixed(2)} $ (Paramètres du projet).`;
}

// GET /api/projects/:id/missions[?sessionId=] — missions + budget du mois
router.get('/:id/missions', async (req, res) => {
  try {
    const { project } = await load(req, res);
    if (!project) return;
    const missions = await listMissions(project.id, { sessionId: req.query.sessionId || undefined });
    const { spent, reserved } = await monthlyCommitted(project.id);
    res.json({ missions, budget: { monthlyUSD: project.missionsMonthlyBudgetUSD, spentUSD: round2(spent), reservedUSD: round2(reserved) },
      levels: LEVEL_IDS.map(id => ({ id, label: LEVELS[id].label, hint: LEVELS[id].hint, budgetUSD: LEVELS[id].budget })) });
  } catch (err) {
    console.error('[missions GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/missions/:mid/approve { budgetUSD? } — lancement (proposée ou échouée)
router.post('/:id/missions/:mid/approve', async (req, res) => {
  try {
    const { project, mission } = await load(req, res);
    if (!mission) return;
    if (project.isDemo) return res.status(403).json({ demo: true, error: 'Projet exemple : les missions ne sont pas lancées pendant la visite guidée.' });
    if (!['proposed', 'failed'].includes(mission.status)) return res.status(409).json({ error: 'Cette mission ne peut plus être lancée.' });
    const level = LEVEL_IDS.includes(req.body?.level) ? req.body.level : (mission.level || 'standard');
    const budgetUSD = LEVELS[level].budget;
    const refusal = await checkBudget(project, budgetUSD);
    if (refusal) return res.status(409).json({ error: refusal });
    const [m] = await db('AgentMission').where({ id: mission.id }).update({
      status: 'queued', level, budgetUSD, approvedAt: new Date(), approvedBy: req.user.id, error: null,
    }).returning('*');
    // Proposée en réunion (réunion encore ouverte) : la réunion est reportée jusqu'au rapport
    const postponed = mission.sessionId && !mission.todoId ? await postponeMeetingForMission({ mission: m, userId: req.user.id }) : null;
    kickMissions();
    res.json({ ...m, ...(postponed ? { todoId: postponed.todoId, postponed } : {}) });
  } catch (err) {
    console.error('[missions approve]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/missions/:mid/reject — mission proposée écartée
router.post('/:id/missions/:mid/reject', async (req, res) => {
  try {
    const { mission } = await load(req, res);
    if (!mission) return;
    if (mission.status !== 'proposed') return res.status(409).json({ error: 'Seule une mission proposée peut être écartée.' });
    const [m] = await db('AgentMission').where({ id: mission.id }).update({ status: 'rejected', finishedAt: new Date() }).returning('*');
    res.json(m);
  } catch (err) {
    console.error('[missions reject]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/missions/:mid/outcome { outcome: 'integrated'|'discarded' } — v5.1 :
// le rapport prêt est intégré au projet (document, mémoire, action cochée) ou écarté
router.post('/:id/missions/:mid/outcome', async (req, res) => {
  try {
    const { mission } = await load(req, res);
    if (!mission) return;
    const outcome = req.body?.outcome;
    if (!['integrated', 'discarded'].includes(outcome)) return res.status(400).json({ error: 'Choix attendu : integrated ou discarded.' });
    if (mission.status !== 'done') return res.status(409).json({ error: 'Le rapport de cette mission n’est pas prêt.' });
    if (mission.outcome) return res.status(409).json({ error: 'Ce compte rendu a déjà été traité.' });
    res.json(await setMissionOutcome(mission, outcome));
  } catch (err) {
    console.error('[missions outcome]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/missions/:mid/cancel — mission en attente annulée
router.post('/:id/missions/:mid/cancel', async (req, res) => {
  try {
    const { mission } = await load(req, res);
    if (!mission) return;
    if (mission.status !== 'queued') return res.status(409).json({ error: 'Seule une mission en attente peut être annulée.' });
    const [m] = await db('AgentMission').where({ id: mission.id, status: 'queued' }).update({ status: 'cancelled', finishedAt: new Date() }).returning('*');
    if (!m) return res.status(409).json({ error: 'La mission vient de démarrer : elle ne peut plus être annulée.' });
    res.json(m);
  } catch (err) {
    console.error('[missions cancel]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/actions/:tid/mission { agentName, kind, objective, deliverable?, budgetUSD? }
// Confier une action à un agent : la mission part aussitôt (validée par ce clic), avec son
// plafond ; l'action passe « en cours » et le rapport rejoint les documents du projet.
router.post('/:id/actions/:tid/mission', async (req, res) => {
  try {
    const { project } = await load(req, res);
    if (!project) return;
    if (project.isDemo) return res.status(403).json({ demo: true, error: 'Projet exemple : les missions ne sont pas lancées pendant la visite guidée.' });
    const [action] = await db('TodoItem').where({ id: req.params.tid, projectId: project.id }).whereNull('milestoneId').limit(1);
    if (!action) return res.status(404).json({ error: 'Action introuvable' });
    if (!['todo', 'in_progress'].includes(action.status)) return res.status(409).json({ error: 'Cette action est déjà faite ou annulée.' });
    if (await db('AgentMission').where({ todoId: action.id }).whereIn('status', ACTIVE).first('id')) {
      return res.status(409).json({ error: 'Une mission est déjà en cours pour cette action.' });
    }
    // Agent du projet (agents par défaut ou ajoutés au projet)
    const agentName = String(req.body?.agentName || '').trim();
    const [agent] = await db('Agent').leftJoin('ProjectAgent', function () {
      this.on('ProjectAgent.agentId', '=', 'Agent.id').andOn('ProjectAgent.projectId', '=', db.raw('?', [project.id]));
    }).where('Agent.name', agentName).where(function () { this.where('Agent.isDefault', true).orWhereNotNull('ProjectAgent.id'); })
      .select('Agent.name').limit(1);
    if (!agent) return res.status(400).json({ error: 'Choisissez un agent du projet.' });
    const kind = KINDS.includes(req.body?.kind) ? req.body.kind : 'research';
    const objective = String(req.body?.objective || '').trim().slice(0, 4000) || [action.title, action.description].filter(Boolean).join('\n');
    const level = LEVEL_IDS.includes(req.body?.level) ? req.body.level : 'standard';
    const budgetUSD = LEVELS[level].budget;
    const refusal = await checkBudget(project, budgetUSD);
    if (refusal) return res.status(409).json({ error: refusal });
    const now = new Date();
    const [m] = await db('AgentMission').insert({
      projectId: project.id, sessionId: action.sessionId || null, todoId: action.id, agentName: agent.name, kind,
      title: action.title.slice(0, 200), objective, deliverable: String(req.body?.deliverable || '').trim().slice(0, 1000) || null,
      status: 'queued', level, budgetUSD, approvedAt: now, approvedBy: req.user.id,
    }).returning('*');
    await db('TodoItem').where({ id: action.id }).update({ status: 'in_progress' });
    kickMissions();
    res.status(201).json(m);
  } catch (err) {
    console.error('[actions mission POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
