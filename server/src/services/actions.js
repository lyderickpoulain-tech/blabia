// Actions entre les réunions (v5.1) — table TodoItem, sans jalon (milestoneId NULL :
// les actions ne pilotent pas le statut des réunions du plan).
// - À la conclusion : BlabIA propose les actions à mener (même appel que l'extraction
//   des décisions, services/decisions.js), l'humain les garde ou les retire.
// - Entre les réunions : l'humain les coche et les ordonne (page Projet › Actions) ;
//   l'ordre (displayOrder) prime, l'échéance est facultative.
// - À la réunion suivante : transmises aux agents, qui ouvrent par un point d'avancement.
const db = require('../utils/db');

const MAX_PROPOSALS = 8;
const MAX_ACTION_PROPOSALS = 5; // proposées à la conclusion : les plus importantes seulement
const MAX_IN_PROMPT = 20;
const OPEN = ['todo', 'in_progress'];

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

// Échéance relative (jours après la réunion) → date AAAA-MM-JJ
function dueDateFrom(days, from = new Date()) {
  if (days === null || days === undefined || days === '') return null; // Number(null) vaudrait 0 : « aujourd'hui »
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0 || n > 365) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

function sanitizeAction(a, from) {
  if (!a || !clean(a.title, 300)) return null;
  return {
    title: clean(a.title, 300),
    description: clean(a.detail ?? a.description, 1000) || null,
    dueDate: a.dueDate ? clean(a.dueDate, 10) : dueDateFrom(a.dueInDays, from),
  };
}

// Actions proposées dans la réponse JSON de l'extraction de fin de réunion
function parseActions(raw, from) {
  const seen = new Set();
  return (Array.isArray(raw?.actions) ? raw.actions : [])
    .map(a => sanitizeAction(a, from))
    .filter(a => a && !seen.has(a.title.toLowerCase()) && seen.add(a.title.toLowerCase()))
    .slice(0, MAX_ACTION_PROPOSALS);
}

// Mots significatifs d'un intitulé (sans accents ni mots courts)
const wordsOf = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9@]+/).filter(w => w.length > 3));
function sameAction(a, b) {
  const w1 = wordsOf(a), w2 = wordsOf(b);
  if (!w1.size || !w2.size) return false;
  const common = [...w1].filter(w => w2.has(w)).length;
  return common / Math.min(w1.size, w2.size) >= 0.75;
}
// Écarte les propositions qui reprennent une action déjà ouverte (même reformulée)
function dropExistingActions(proposals, existing) {
  const open = existing.filter(e => OPEN.includes(e.status));
  return proposals.filter(p => !open.some(e => sameAction(p.title, e.title)));
}

// Ce qui n'est pas une action (extraction de fin de réunion) : décisions encore à prendre,
// outils à mettre en place (page Outils), travail de code (réunion Claude Code)
function parseTriage(raw) {
  const list = v => (Array.isArray(v) ? v : []);
  return {
    toDecide: list(raw?.toDecide).map(q => clean(typeof q === 'string' ? q : q?.question, 300)).filter(Boolean).slice(0, 6),
    toolSetups: list(raw?.toolSetups).map(t => ({ tool: clean(t?.tool, 100), category: clean(t?.category, 60) })).filter(t => t.tool).slice(0, 8),
    codeTasks: list(raw?.codeTasks).map(t => ({ title: clean(t?.title ?? t, 300), detail: clean(t?.detail, 500) || null })).filter(t => t.title).slice(0, 8),
  };
}

// withCancelled : actions annulées aussi (page Actions, pour les rétablir) ; jamais pour les agents
async function listActions(projectId, { withCancelled = false } = {}) {
  return db('TodoItem as t')
    .leftJoin('Session as s', 's.id', 't.sessionId')
    .where('t.projectId', projectId)
    .modify(q => { if (!withCancelled) q.whereNot('t.status', 'cancelled'); })
    .select('t.id', 't.title', 't.description', 't.status', 't.dueDate', 't.displayOrder', 't.source', 't.sessionId', 't.createdAt', 's.task as sessionTask')
    // À faire : dans l'ordre choisi par l'humain ; faites : les plus récentes d'abord
    .orderByRaw(`CASE WHEN t.status IN ('todo','in_progress') THEN 0 ELSE 1 END,
      CASE WHEN t.status IN ('todo','in_progress') THEN t."displayOrder" END ASC,
      t."createdAt" DESC`);
}

const fmtDay = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const isOverdue = (a, now = new Date()) =>
  OPEN.includes(a.status) && a.dueDate && new Date(a.dueDate) < new Date(now.toISOString().slice(0, 10));

// Texte des actions pour le prompt des agents (bloc commun de la réunion) et pour
// l'extraction de fin de réunion. Actions à faire repérées A1, A2… (dans l'ordre de l'humain),
// avec leur précision : la conclusion peut proposer de les préciser, annuler ou cocher.
const DESCRIPTION_IN_PROMPT = 240;
const openActions = actions => actions.filter(a => OPEN.includes(a.status));
function formatActionsForPrompt(actions, now = new Date()) {
  const open = openActions(actions);
  const done = actions.filter(a => a.status === 'done').slice(0, 8);
  const lines = [
    ...open.map((a, i) => `A${i + 1}. [${isOverdue(a, now) ? `EN RETARD, prévue le ${fmtDay(a.dueDate)}` : a.dueDate ? `à faire, pour le ${fmtDay(a.dueDate)}` : 'à faire'}] ${a.title}${a.description ? ` — ${clean(a.description, DESCRIPTION_IN_PROMPT)}` : ''}`),
    ...done.map(a => `- [fait] ${a.title}`),
  ].slice(0, MAX_IN_PROMPT);
  return lines.join('\n');
}

// Changements proposés à la conclusion sur les actions DÉJÀ suivies (repère A1, A2…) :
// update (intitulé et/ou objectif précisés), cancel (devenue inutile), done (déjà faite).
// Rien n'est appliqué sans l'accord de l'humain (fenêtre de conclusion).
const CHANGE_KINDS = ['update', 'cancel', 'done'];
const MAX_ACTION_CHANGES = 6;
function parseActionChanges(raw, actions) {
  const open = openActions(actions);
  const seen = new Set();
  return (Array.isArray(raw?.actionChanges) ? raw.actionChanges : [])
    .map(c => {
      const m = String(c?.ref || '').match(/^A(\d+)$/i);
      const action = m && open[Number(m[1]) - 1];
      if (!action || !CHANGE_KINDS.includes(c.kind) || seen.has(action.id)) return null;
      const reason = clean(c.reason, 300) || null;
      if (c.kind !== 'update') { seen.add(action.id); return { id: action.id, kind: c.kind, currentTitle: action.title, currentDescription: action.description || null, reason }; }
      const title = clean(c.title, 300);
      const description = clean(c.detail ?? c.description, 1000);
      const newTitle = title && title !== action.title ? title : null;
      const newDescription = description && description !== (action.description || '') ? description : null;
      if (!newTitle && !newDescription) return null;
      seen.add(action.id);
      return { id: action.id, kind: 'update', currentTitle: action.title, currentDescription: action.description || null,
        title: newTitle || action.title, description: newDescription || action.description || null, reason };
    })
    .filter(Boolean)
    .slice(0, MAX_ACTION_CHANGES);
}

async function createSessionActions({ projectId, sessionId, userId, actions }) {
  const rows = actions.map(a => sanitizeAction(a)).filter(Boolean).slice(0, MAX_PROPOSALS);
  if (rows.length === 0) return [];
  const [{ maxOrder }] = await db('TodoItem').max('displayOrder as maxOrder').where({ projectId }).whereNull('milestoneId');
  const now = new Date();
  return db('TodoItem').insert(rows.map((a, i) => ({
    id: require('crypto').randomUUID(), projectId, milestoneId: null,
    title: a.title, description: a.description, dueDate: a.dueDate || null,
    status: 'todo', priority: 'medium', displayOrder: (maxOrder ?? -1) + 1 + i,
    source: 'session', sessionId: sessionId || null, createdAt: now, createdBy: userId,
  }))).returning(['id', 'title', 'description', 'status', 'dueDate', 'sessionId']);
}

// Réunion ouverte depuis une action (« Traiter en réunion ») : texte pour les agents —
// l'action, puis le rapport COMPLET de la dernière mission terminée qui l'a préparée
// (sinon l'état de la mission en cours ou échouée)
const MISSION_REPORT_CHARS = 15000;
async function actionForPrompt(todoId, projectId) {
  if (!todoId) return '';
  const [a] = await db('TodoItem').where({ id: todoId, projectId }).select('title', 'description').limit(1);
  if (!a) return '';
  const [m] = await db('AgentMission').where({ todoId }).whereNotIn('status', ['rejected', 'cancelled'])
    .orderByRaw(`CASE WHEN status = 'done' THEN 0 ELSE 1 END, "createdAt" DESC`).select('status', 'agentName', 'report', 'error').limit(1);
  const head = `« ${a.title} »${a.description ? ` — ${a.description}` : ''}`;
  if (!m) return head;
  if (m.status === 'done' && m.report) {
    const report = m.report.length > MISSION_REPORT_CHARS ? `${m.report.slice(0, MISSION_REPORT_CHARS)}\n[…rapport tronqué ; version complète dans les documents du projet]` : m.report;
    return `${head}\nRAPPORT DE LA MISSION MENÉE POUR ${m.agentName} SUR CETTE ACTION (travail déjà fait : pars de là, ne le refais pas ; dis ce qui reste à trancher ou à faire) :\n${report}`;
  }
  return `${head}\n(Une mission confiée à ${m.agentName} sur cette action est ${m.status === 'failed' ? 'en échec' : 'encore en cours'} : son rapport n'est pas disponible.)`;
}

module.exports = { actionForPrompt, OPEN, dueDateFrom, sanitizeAction, parseActions, parseActionChanges, parseTriage, dropExistingActions, sameAction, listActions, isOverdue, formatActionsForPrompt, createSessionActions };
