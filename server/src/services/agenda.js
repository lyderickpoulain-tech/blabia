// Ordre du jour des réunions de décision (v5.1) : les décisions REMISES EN QUESTION que
// l'humain veut voir retraitées. Pas un nouveau type de réunion : une réunion de décision du
// plan (Milestone) porte la liste des décisions à retraiter (Milestone.agenda, ids).
// - « Mettre à l'ordre du jour » : nouvelle réunion dédiée, ou ajout à une réunion de
//   décision déjà prévue (4 points au plus, pour éviter les réunions fourre-tout).
// - Démarrage : la suggestion d'agents couvre chaque point ; pendant la réunion, les agents
//   traitent un point à la fois ; à la conclusion, chaque décision qui retraite un point est
//   proposée « en remplacement » de l'ancienne (qui passe alors « remplacée »).
const db = require('../utils/db');
const { parseJsonField } = require('../utils/parseJsonField');

const MAX_AGENDA = 4;
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

// Décisions de l'ordre du jour d'une réunion du plan, encore à retraiter, dans l'ordre
async function agendaDecisions(milestoneId) {
  if (!milestoneId) return [];
  const [m] = await db('Milestone').where({ id: milestoneId }).select('agenda', 'projectId').limit(1);
  const ids = parseJsonField(m?.agenda, []);
  if (!ids.length) return [];
  const rows = await db('Decision').where({ projectId: m.projectId, status: 'reopened' }).whereIn('id', ids);
  return ids.map(id => rows.find(r => r.id === id)).filter(Boolean);
}

function formatAgendaForPrompt(items) {
  return items.map((d, i) => `${i + 1}. [id=${d.id}] « ${d.statement} »${d.reopenNote ? ` — motif de l'humain : ${d.reopenNote}` : ''}`).join('\n');
}

// Met une décision remise en question à l'ordre du jour : réunion existante (milestoneId)
// ou nouvelle réunion de décision en fin de plan. Renvoie la réunion du plan.
async function addToAgenda({ projectId, decision, milestoneId, userId }) {
  if (milestoneId) {
    const [m] = await db('Milestone').where({ id: milestoneId, projectId }).limit(1);
    if (!m || m.type !== 'decision' || m.status === 'done') throw Object.assign(new Error('Réunion introuvable, ou déjà tenue : choisissez une réunion de décision encore à tenir.'), { status: 400 });
    const agenda = parseJsonField(m.agenda, []);
    if (agenda.includes(decision.id)) return m;
    if (agenda.length >= MAX_AGENDA) throw Object.assign(new Error(`Cette réunion a déjà ${MAX_AGENDA} points à l'ordre du jour : créez-en une nouvelle.`), { status: 409 });
    const [row] = await db('Milestone').where({ id: m.id }).update({ agenda: JSON.stringify([...agenda, decision.id]) }).returning('*');
    return row;
  }
  const [{ maxOrder }] = await db('Milestone').max('displayOrder as maxOrder').where({ projectId });
  const [row] = await db('Milestone').insert({
    projectId, type: 'decision', status: 'pending', displayOrder: (maxOrder ?? -1) + 1, createdBy: userId,
    title: cut(`Retraiter : ${decision.statement}`, 140),
    description: `Décision remise en question : « ${decision.statement} »${decision.reopenNote ? `\nMotif : ${decision.reopenNote}` : ''}`,
    agenda: JSON.stringify([decision.id]),
  }).returning('*');
  return row;
}

// Réunion du plan qui porte chaque décision à l'ordre du jour (pour l'affichage)
async function agendaByDecision(projectId) {
  const rows = await db('Milestone').where({ projectId }).whereNot({ status: 'done' }).whereRaw(`jsonb_array_length("agenda") > 0`).select('id', 'title', 'agenda');
  const out = {};
  for (const m of rows) for (const id of parseJsonField(m.agenda, [])) out[id] = out[id] || { id: m.id, title: m.title };
  return out;
}

module.exports = { MAX_AGENDA, agendaDecisions, formatAgendaForPrompt, addToAgenda, agendaByDecision };
