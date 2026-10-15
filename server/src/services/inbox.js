// « À trancher » (v5.1, 16/10/2026) : tout ce qui attend l'humain sur un projet, en un seul
// endroit — questions des agents dans toutes les réunions ouvertes (y compris celles gardées
// par le bras droit), notes de retour du bras droit, réunions préparées, comptes rendus de
// mission, missions proposées, décisions remises en question, actions en retard,
// développements à relire. Sert la page « À trancher », la pastille du menu, le bras droit
// (qui en parle quand on l'interroge) et son retour proactif (dernier message).
const db = require('../utils/db');
const { parseJsonField } = require('../utils/parseJsonField');
const { prepReady, isRunning, kindOf } = require('./preparation');
const { OPEN, isOverdue } = require('./actions');

const OPEN_CARD = ['pending', 'deferred'];

function questionsOf(session, userId) {
  const messages = parseJsonField(session.messages, []);
  return messages.filter(m => m.type === 'decision' && (
    OPEN_CARD.includes(m.status)
    || (m.status === 'awaiting_human' && (m.assignedTo ? m.assignedTo === userId : m.assignedBy !== userId))
  )).map(m => ({
    kind: 'question', id: `q-${m.id}`, sessionId: session.id, sessionTask: session.task, messageId: m.id,
    question: m.question, choices: m.choices || [], context: m.context || null, agentName: m.agentName,
    reserved: !!m.reservedForHuman, contestedAnswer: m.contestedAnswer || null, deferred: m.status === 'deferred',
    assignedByName: m.status === 'awaiting_human' ? (m.assignedByName || null) : null,
    reason: m.delegateReason || null,
  }));
}

async function buildInbox(project, userId) {
  const items = [];
  const running = [];
  const sessions = await db('Session').where({ projectId: project.id, status: 'open' })
    .select('id', 'task', 'messages', 'delegation', 'createdAt').orderBy('createdAt', 'asc');
  for (const s of sessions) {
    if (isRunning(s.id)) {
      running.push({ sessionId: s.id, task: s.task, kind: kindOf(s.id) });
      continue; // réunion en cours sans l'humain : ses questions arrivent à la fin
    }
    const d = parseJsonField(s.delegation, null);
    if (d && ['done', 'stopped'].includes(d.status) && !d.reviewed && d.by === userId) {
      items.push({ kind: 'delegation_note', id: `d-${s.id}`, sessionId: s.id, sessionTask: s.task,
        headline: d.note?.headline || '', decidedCount: d.note?.decided?.length || 0, takenOver: !!d.note?.takenOver });
    }
    if (prepReady(s, parseJsonField(s.messages, []))) {
      items.push({ kind: 'prep_ready', id: `p-${s.id}`, sessionId: s.id, sessionTask: s.task });
    }
    items.push(...questionsOf(s, userId));
  }

  const missions = await db('AgentMission').where({ projectId: project.id })
    .where(q => q.where('status', 'proposed').orWhere(q2 => q2.where('status', 'done').whereNull('outcome')))
    .select('id', 'title', 'agentName', 'status', 'report').orderBy('createdAt', 'asc');
  for (const m of missions) {
    items.push(m.status === 'done'
      ? { kind: 'mission_report', id: `m-${m.id}`, missionId: m.id, title: m.title, agentName: m.agentName, report: m.report }
      : { kind: 'mission_proposed', id: `m-${m.id}`, missionId: m.id, title: m.title, agentName: m.agentName });
  }

  const reopened = await db('Decision').where({ projectId: project.id, status: 'reopened' }).select('id', 'statement');
  for (const r of reopened) items.push({ kind: 'decision_reopened', id: `r-${r.id}`, decisionId: r.id, statement: r.statement });

  const actions = await db('TodoItem').where({ projectId: project.id }).whereIn('status', OPEN).select('id', 'title', 'status', 'dueDate');
  const late = actions.filter(a => isOverdue(a));
  if (late.length) items.push({ kind: 'actions_late', id: 'late', count: late.length, titles: late.slice(0, 3).map(a => a.title) });

  const dev = await db('DevTask').where({ projectId: project.id }).whereIn('status', ['ready', 'deploy_failed']).select('id', 'title', 'status').catch(() => []);
  for (const t of dev) items.push({ kind: 'dev', id: `v-${t.id}`, devTaskId: t.id, title: t.title, status: t.status });

  const [last] = await db('AssistantMessage').where({ projectId: project.id, userId, role: 'assistant' })
    .orderBy('createdAt', 'desc').select('id', 'content', 'proposal', 'createdAt').limit(1);
  const lastAssistant = last ? { id: last.id, content: last.content, createdAt: last.createdAt, report: parseJsonField(last.proposal, null)?.kind === 'delegation_report' ? parseJsonField(last.proposal, null) : null } : null;

  return { items, running, lastAssistant, count: items.length };
}

// Pour le bras droit : les questions qui attendent l'humain (il en parle quand on l'interroge)
function inboxForPrompt(inbox) {
  const qs = inbox.items.filter(i => i.kind === 'question');
  const others = inbox.items.filter(i => i.kind !== 'question');
  if (!qs.length && !others.length) return '';
  const label = {
    delegation_note: i => `Note de retour du bras droit à lire : réunion « ${i.sessionTask} »`,
    prep_ready: i => `Réunion préparée par les agents, conclusions prêtes : « ${i.sessionTask} »`,
    mission_report: i => `Compte rendu de mission à intégrer ou non : « ${i.title} » (${i.agentName})`,
    mission_proposed: i => `Mission proposée à valider : « ${i.title} » (${i.agentName})`,
    decision_reopened: i => `Décision remise en question : ${i.statement}`,
    actions_late: i => `${i.count} action(s) en retard : ${i.titles.join(' ; ')}`,
    dev: i => `Développement « ${i.title} » : ${i.status === 'ready' ? 'à relire' : 'mise en ligne échouée'}`,
  };
  return `À TRANCHER PAR L'HUMAIN (sa page « À trancher ») :
${qs.map(q => `- Question de ${q.agentName}, réunion « ${q.sessionTask} » : ${q.question}${q.choices.length ? ` (choix : ${q.choices.join(' | ')})` : ''}${q.reserved ? ' — gardée pour lui par le bras droit' : ''}`).join('\n')}${qs.length && others.length ? '\n' : ''}${others.map(i => `- ${label[i.kind](i)}`).join('\n')}`;
}

module.exports = { buildInbox, inboxForPrompt };
