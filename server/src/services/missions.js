// Missions des agents (v5.1) — table AgentMission.
// Un agent propose en réunion ([MISSION:{...}], services/markers.js) un travail
// approfondi qui dépasse la réunion : recherche, analyse, rédaction. L'humain la
// valide (plafond affiché) ; un sous-agent la mène en arrière-plan
// (services/missionRunner.js) ; le rapport rejoint les documents du projet.
const db = require('../utils/db');

const KINDS = ['research', 'analysis', 'writing'];
const KIND_LABEL = { research: 'Recherche', analysis: 'Analyse', writing: 'Rédaction' };
// Plafond par défaut d'une mission (USD), selon sa nature
const DEFAULT_BUDGET = { research: 0.6, analysis: 0.4, writing: 0.3 };
const MAX_BUDGET = 3;
const MAX_PER_MEETING = 2;
const ACTIVE = ['queued', 'running'];

const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

// Dépense du mois pour les missions du projet : coût réel + plafonds des missions en attente
async function monthlyCommitted(projectId, now = new Date()) {
  const [spent] = await db('AgentMission').where({ projectId }).where('approvedAt', '>=', monthStart(now))
    .whereNotIn('status', ACTIVE).sum('costUSD as s');
  const [reserved] = await db('AgentMission').where({ projectId }).whereIn('status', ACTIVE).sum('budgetUSD as s');
  return { spent: Number(spent?.s) || 0, reserved: Number(reserved?.s) || 0 };
}

async function proposeMission({ projectId, sessionId, agentName, proposal }) {
  if (sessionId) {
    const [{ n }] = await db('AgentMission').where({ sessionId }).count('* as n');
    if (Number(n) >= MAX_PER_MEETING) return null; // plafond par réunion
  }
  const kind = KINDS.includes(proposal.kind) ? proposal.kind : 'research';
  const [m] = await db('AgentMission').insert({
    projectId, sessionId: sessionId || null, agentName, kind,
    title: proposal.title, objective: proposal.objective, deliverable: proposal.deliverable || null,
    status: 'proposed', budgetUSD: DEFAULT_BUDGET[kind],
  }).returning('*');
  return m;
}

async function listMissions(projectId, { sessionId } = {}) {
  const q = db('AgentMission as m').leftJoin('Session as s', 's.id', 'm.sessionId')
    .where('m.projectId', projectId).select('m.*', 's.task as sessionTask').orderBy('m.createdAt', 'desc');
  if (sessionId) q.where('m.sessionId', sessionId);
  return q;
}

// Texte pour le prompt des agents (bloc commun de la réunion)
function formatMissionsForPrompt(missions) {
  const label = { queued: 'en attente', running: 'en cours', done: 'terminée', failed: 'échouée' };
  return missions
    .filter(m => label[m.status])
    .slice(0, 10)
    .map(m => `- [${label[m.status]}] ${m.title} (${m.agentName})${m.status === 'done' ? ` — rapport dans les documents : « Mission — ${m.title} »` : ''}`)
    .join('\n');
}

module.exports = { KINDS, KIND_LABEL, DEFAULT_BUDGET, MAX_BUDGET, MAX_PER_MEETING, ACTIVE, monthStart, monthlyCommitted, proposeMission, listMissions, formatMissionsForPrompt };
