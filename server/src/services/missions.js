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
const MAX_PER_MEETING = 1; // v5.1 : une mission reporte la réunion — une seule par réunion
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
    .filter(m => label[m.status] && m.outcome !== 'discarded')
    .slice(0, 10)
    .map(m => `- [${label[m.status]}] ${m.title} (${m.agentName})${m.status === 'done' ? (m.outcome === 'integrated' ? ` — rapport dans les documents : « Mission — ${m.title} »` : ' — rapport pas encore validé par l\'humain') : ''}`)
    .join('\n');
}

// ── Mission validée pendant une réunion : la réunion est REPORTÉE (v5.1) ─────
// Pas de mission qui tourne pendant qu'on continue à débattre : la réunion passe en
// « postponed » ; une réunion « Reprendre : … » est insérée juste après dans le plan
// (après la réunion du plan d'origine, sinon en tête des réunions à venir) ; une action
// « Mission … » (source « mission ») doit être faite avant elle — elle est cochée seule
// quand le rapport est prêt (services/missionRunner.js), ce qui débloque la reprise.
const shortTask = t => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > 80 ? `${s.slice(0, 80).replace(/\s+\S*$/, '')}…` : s; };
async function postponeMeetingForMission({ mission, userId }) {
  const [session] = await db('Session').where({ id: mission.sessionId, projectId: mission.projectId }).limit(1);
  if (!session || session.status !== 'open') return null;
  const projectId = mission.projectId;
  const milestones = await db('Milestone').where({ projectId }).orderBy('displayOrder', 'asc').select('id', 'status', 'displayOrder');
  const origin = session.milestoneId ? milestones.find(m => m.id === session.milestoneId) : null;
  // Position : juste après la réunion d'origine, sinon avant la première réunion à venir
  const firstUpcoming = milestones.find(m => m.status !== 'done' && m.id !== origin?.id);
  const at = origin ? origin.displayOrder + 1 : (firstUpcoming ? firstUpcoming.displayOrder : (milestones.at(-1)?.displayOrder ?? -1) + 1);
  await db('Milestone').where({ projectId }).where('displayOrder', '>=', at).increment('displayOrder', 1);
  const date = new Date().toLocaleDateString('fr-FR');
  const intention = (() => { try { return JSON.parse(session.intention || '[]'); } catch { return Array.isArray(session.intention) ? session.intention : []; } })();
  const [milestone] = await db('Milestone').insert({
    id: require('crypto').randomUUID(), projectId, type: ['decision', 'claude_code', 'stack'].includes(intention[0]) ? intention[0] : 'decision',
    title: `Reprendre : ${shortTask(session.task)}`,
    description: `Réunion reportée le ${date} en attendant la mission « ${mission.title} » (${mission.agentName}). À trancher avec son rapport : ${session.task}`,
    status: 'pending', displayOrder: at, createdFromSessionId: session.id, createdAt: new Date(), createdBy: userId,
  }).returning(['id', 'title']);
  const [{ maxOrder }] = await db('TodoItem').max('displayOrder as maxOrder').where({ projectId }).whereNull('milestoneId');
  const [todo] = await db('TodoItem').insert({
    id: require('crypto').randomUUID(), projectId, milestoneId: null, beforeMilestoneId: milestone.id,
    title: `Mission « ${mission.title} » (${mission.agentName})`,
    description: 'Menée par un agent ; cochée automatiquement quand le rapport est prêt.',
    status: 'in_progress', priority: 'medium', displayOrder: (maxOrder ?? -1) + 1,
    source: 'mission', sessionId: session.id, createdAt: new Date(), createdBy: userId,
  }).returning(['id']);
  await db('AgentMission').where({ id: mission.id }).update({ todoId: todo.id });
  await db('Session').where({ id: session.id }).update({ status: 'postponed' });
  if (origin) await db('Milestone').where({ id: origin.id }).update({ status: 'done' }); // tenue, suite au plan
  return { milestoneId: milestone.id, milestoneTitle: milestone.title, todoId: todo.id };
}

// Réunion qui REPREND une réunion reportée : objectif, décisions et fin des échanges de la
// réunion d'origine, pour les agents (le rapport de mission arrive par l'action liée)
const RESUME_CHARS = 6000;
async function resumeTextFor(milestoneId) {
  if (!milestoneId) return '';
  const [m] = await db('Milestone').where({ id: milestoneId }).select('createdFromSessionId').limit(1);
  if (!m?.createdFromSessionId) return '';
  const [origin] = await db('Session').where({ id: m.createdFromSessionId, status: 'postponed' }).select('task', 'messages', 'createdAt').limit(1);
  if (!origin) return '';
  const msgs = (() => { try { return typeof origin.messages === 'string' ? JSON.parse(origin.messages) : (origin.messages || []); } catch { return []; } })();
  const decided = msgs.filter(x => x.type === 'decision' && x.status === 'answered').map(x => `- ${x.question} → ${x.answer}`).join('\n');
  const talk = msgs.filter(x => x.role === 'human' || x.role === 'agent')
    .map(x => `${x.role === 'human' ? 'Participant' : x.agentName} : ${x.content}`).join('\n\n');
  return `Réunion d'origine (${new Date(origin.createdAt).toLocaleDateString('fr-FR')}) : « ${origin.task} »
${decided ? `Décisions déjà prises dans cette réunion :\n${decided}\n` : ''}Fin des échanges de la réunion d'origine :
${talk.length > RESUME_CHARS ? `…${talk.slice(-RESUME_CHARS)}` : talk || '(aucun échange)'}`;
}

module.exports = { KINDS, KIND_LABEL, DEFAULT_BUDGET, MAX_BUDGET, LEVELS, LEVEL_IDS, levelOf, MAX_PER_MEETING, ACTIVE, monthStart, monthlyCommitted, proposeMission, listMissions, formatMissionsForPrompt, postponeMeetingForMission, resumeTextFor };
