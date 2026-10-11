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
// Niveaux de mission (v5.1, 11/10/2026) : l'humain choisit une profondeur, pas un montant.
// Chaque niveau fixe le plafond de coût (réservé sur le budget mensuel), le nombre d'étapes,
// les recherches et lectures web, et le modèle.
const LEVELS = {
  light:    { label: 'Légère',      hint: 'quelques recherches, réponse courte',             budget: 0.25, maxSteps: 5,  searches: 3,  fetches: 2,  model: 'claude-sonnet-5-5' },
  standard: { label: 'Standard',    hint: 'recherche et lectures ciblées',                     budget: 0.6,  maxSteps: 10, searches: 5,  fetches: 6,  model: 'claude-sonnet-5-5' },
  deep:     { label: 'Approfondie', hint: 'beaucoup plus de sources, modèle le plus puissant', budget: 2.0,  maxSteps: 16, searches: 10, fetches: 10, model: 'claude-opus-5-5' },
};
const LEVEL_IDS = Object.keys(LEVELS);
const levelOf = id => (LEVELS[id] ? id : 'standard');
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
    status: 'proposed', level: 'standard', budgetUSD: LEVELS.standard.budget,
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

module.exports = { KINDS, KIND_LABEL, DEFAULT_BUDGET, MAX_BUDGET, LEVELS, LEVEL_IDS, levelOf, MAX_PER_MEETING, ACTIVE, monthStart, monthlyCommitted, proposeMission, listMissions, formatMissionsForPrompt };
