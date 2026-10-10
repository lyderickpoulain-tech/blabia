const express = require('express');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const { listMissions, monthlyCommitted, MAX_BUDGET } = require('../services/missions');
const { kickMissions } = require('../services/missionRunner');

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
    res.json({ missions, budget: { monthlyUSD: project.missionsMonthlyBudgetUSD, spentUSD: round2(spent), reservedUSD: round2(reserved) } });
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
    const wanted = Number(req.body?.budgetUSD);
    const budgetUSD = round2(Math.min(MAX_BUDGET, Math.max(0.1, Number.isFinite(wanted) ? wanted : mission.budgetUSD)));
    const refusal = await checkBudget(project, budgetUSD);
    if (refusal) return res.status(409).json({ error: refusal });
    const [m] = await db('AgentMission').where({ id: mission.id }).update({
      status: 'queued', budgetUSD, approvedAt: new Date(), approvedBy: req.user.id, error: null,
    }).returning('*');
    kickMissions();
    res.json(m);
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

module.exports = router;
