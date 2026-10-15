// Réunion tenue par le bras droit à la place de l'humain (v5.1, 16/10/2026, étape 2).
// L'humain confie une réunion avec un CADRE : ce que le bras droit peut trancher, ce qui lui
// est réservé. La réunion tourne sur le serveur (routes/sessions/chat.js, `delegate`) ; chaque
// carte de décision d'un agent est soit tranchée par le bras droit (avec sa raison), soit mise
// de côté pour l'humain — la réunion continue. À la fin : une note de retour dans la
// conversation du bras droit (AssistantMessage), et un e-mail si demandé.
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const anthropic = require('./anthropic');
const { DEFAULT_MODEL } = require('./models');
const { parseJsonField } = require('../utils/parseJsonField');
const { projectObjective } = require('../utils/projectObjective');

const DEFAULT_CAN_DECIDE = [
  'Les détails d’organisation et de mise en forme',
  'Entre deux options équivalentes, au même coût',
];
const DEFAULT_RESERVED = [
  'Le budget',
  'Les choix finaux et structurants',
  'Tout ce qui sort du brief',
];
const BRAS_DROIT = 'Bras droit';

const cleanList = (v, fallback) => {
  const list = (Array.isArray(v) ? v : []).map(x => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 8);
  return list.length ? list : fallback;
};

// Cadre reçu du client → objet stocké sur Session.delegation
function sanitizeDelegation(input, userId) {
  if (!input || typeof input !== 'object') return null;
  return {
    by: userId,
    canDecide: cleanList(input.canDecide, DEFAULT_CAN_DECIDE),
    reserved: cleanList(input.reserved, DEFAULT_RESERVED),
    notifyEmail: input.notifyEmail !== false,
    stopOnBlock: input.stopOnBlock !== false,
    status: 'pending', // pending → running → done | stopped | failed
    createdAt: new Date().toISOString(),
  };
}

// Consigne pour les agents (bloc commun : fixe pour la réunion)
function delegationSection(delegation) {
  if (!delegation) return '';
  return `
RÉUNION TENUE PAR LE BRAS DROIT, EN L'ABSENCE DE L'HUMAIN : le bras droit de l'humain anime et répond à vos cartes de décision dans le cadre fixé par l'humain.
Il peut trancher : ${delegation.canDecide.join(' ; ')}.
Réservé à l'humain : ${delegation.reserved.join(' ; ')}.
Posez vos cartes normalement : le bras droit y répond, ou les met de côté pour l'humain, et la réunion continue. Une question mise de côté ne se repose pas : avancez sur le reste. Ne vous adressez pas à l'humain comme s'il était là.
`;
}

const lineOf = m => (m.role === 'human' ? `Humain : ${m.content}`
  : m.type === 'decision_answer' || m.type === 'animator' ? `[${m.content}]`
  : m.role === 'agent' ? `${m.agentName} : ${m.content}` : null);

function parseJson(text) {
  const t = String(text || '');
  const i = t.indexOf('{'); const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
}

// Le bras droit répond à une carte, ou la garde pour l'humain
async function resolveCard({ project, session, delegation, card, messages, registryText = '' }) {
  const tail = messages.map(lineOf).filter(Boolean).slice(-14).join('\n').slice(-8000);
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL, max_tokens: 400,
    system: 'Tu es le bras droit de l\'humain : tu tiens une réunion à sa place, dans le cadre qu\'il a fixé. Tu réponds UNIQUEMENT en JSON valide.',
    messages: [{ role: 'user', content: `Objectif du projet : ${projectObjective(project) || '(non précisé)'}
Objectif de la réunion : ${session.task}
Tu peux trancher : ${delegation.canDecide.join(' ; ')}
Réservé à l'humain : ${delegation.reserved.join(' ; ')}
${registryText ? `Décisions déjà prises par l'humain (registre) :\n${registryText}\n` : ''}
Fin des échanges :
${tail || '(début de réunion)'}

Question posée par ${card.agentName} : ${card.question}
Choix proposés : ${(card.choices || []).join(' | ')}
${card.context ? `Contexte : ${card.context}` : ''}

Règles :
- "reserved": true si la question relève de ce qui est réservé à l'humain, sort du brief, ou engage un choix structurant que ton cadre ne couvre pas. Dans le doute, réserve.
- Sinon, choisis la réponse la plus fidèle au brief, aux décisions de l'humain et à ses préférences (souvent la recommandation, si elle est cohérente) ; "answer" = le texte exact d'un choix, ou une réponse courte.
- "reason" : pourquoi, en une phrase simple, pour l'humain.
- "blocking": true seulement si, sans réponse de l'humain, la réunion ne peut plus avancer sur rien d'autre.
{"reserved": false, "answer": "...", "reason": "...", "blocking": false}` }],
  });
  const out = parseJson(response.content.filter(b => b.type === 'text').map(b => b.text).join('')) || {};
  const answer = String(out.answer || '').trim().slice(0, 300);
  return {
    reserved: out.reserved === true || !answer,
    answer,
    reason: String(out.reason || '').trim().slice(0, 300),
    blocking: out.blocking === true,
  };
}

// Applique la réponse du bras droit sur la carte (même forme qu'une réponse de l'humain)
async function applyCardOutcome(sessionId, cardId, outcome) {
  const [row] = await db('Session').where({ id: sessionId }).select('messages').limit(1);
  const messages = parseJsonField(row?.messages, []);
  const idx = messages.findIndex(m => m.id === cardId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  if (outcome.reserved) {
    messages[idx] = { ...messages[idx], reservedForHuman: true, delegateReason: outcome.reason || null };
    messages.push({ id: randomUUID(), role: 'system', type: 'decision_answer', timestamp: now,
      content: `Question gardée pour l'humain (absent) : ${messages[idx].question} → à trancher plus tard ; avancez sur le reste.` });
  } else {
    messages[idx] = { ...messages[idx], status: 'answered', answer: outcome.answer, answeredAt: now,
      answeredByName: BRAS_DROIT, decidedByDelegate: true, delegateReason: outcome.reason || null };
    messages.push({ id: randomUUID(), role: 'system', type: 'decision_answer', timestamp: now,
      content: `📌 Décision (réponse du bras droit, en l'absence de l'humain) : ${messages[idx].question} → ${outcome.answer}` });
  }
  await db('Session').where({ id: sessionId }).update({ messages: JSON.stringify(messages) });
  return messages[idx];
}

async function setStatus(sessionId, patch) {
  const [row] = await db('Session').where({ id: sessionId }).select('delegation').limit(1);
  const current = parseJsonField(row?.delegation, null);
  if (!current) return null;
  const next = { ...current, ...patch };
  await db('Session').where({ id: sessionId }).update({ delegation: JSON.stringify(next) });
  return next;
}

// Fin de réunion déléguée : note de retour (une phrase de résultat + cartes), dans le fil du
// bras droit de la personne qui a confié la réunion ; e-mail si demandé
async function finishDelegation({ project, sessionId, stoppedOnBlock = false, takenOver = false }) {
  const [s] = await db('Session').where({ id: sessionId }).select('task', 'messages', 'delegation').limit(1);
  const delegation = parseJsonField(s?.delegation, null);
  if (!delegation) return null;
  const messages = parseJsonField(s.messages, []);
  const cards = messages.filter(m => m.type === 'decision');
  const decided = cards.filter(c => c.decidedByDelegate).map(c => ({ id: c.id, question: c.question, answer: c.answer, reason: c.delegateReason }));
  const waiting = cards.filter(c => c.status !== 'answered' && c.status !== 'delegated').map(c => ({ id: c.id, question: c.question, choices: c.choices || [], reason: c.delegateReason || null }));
  const transcript = messages.map(lineOf).filter(Boolean).slice(-40).join('\n').slice(-14000);
  let headline = '';
  try {
    const r = await anthropic.messages.create({
      model: DEFAULT_MODEL, max_tokens: 300,
      system: 'Tu es le bras droit de l\'humain. Tu viens de tenir une réunion à sa place et tu lui rends compte, en français, en le vouvoyant.',
      messages: [{ role: 'user', content: `Réunion : « ${s.task} »\nÉchanges :\n${transcript}\n\nEn deux phrases au plus, sans titre ni liste : le résultat concret de la réunion, puis ce qui reste à faire.${takenOver ? ' Précise que l\'humain a repris la main en cours de réunion.' : stoppedOnBlock ? ' Précise que la réunion s\'est arrêtée sur une question qui lui est réservée.' : ''}` }],
    });
    headline = r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  } catch (err) { console.error('[delegation] note :', err.message); }
  if (!headline) headline = 'La réunion est tenue ; voici ce que j’ai tranché et ce qui vous attend.';

  const note = { headline, decided, waiting, stoppedOnBlock, takenOver, finishedAt: new Date().toISOString() };
  await setStatus(sessionId, { status: stoppedOnBlock || takenOver ? 'stopped' : 'done', note });
  const report = { kind: 'delegation_report', sessionId, meetingTitle: s.task, decided, waiting, stoppedOnBlock, takenOver };
  await db('AssistantMessage').insert({
    id: randomUUID(), projectId: project.id, userId: delegation.by, role: 'assistant',
    content: headline, sources: JSON.stringify([]), proposal: JSON.stringify(report), createdAt: new Date(),
  });
  if (delegation.notifyEmail) {
    try {
      const [user] = await db('User').where({ id: delegation.by }).select('email').limit(1);
      const base = process.env.FRONTEND_URL || 'https://blabia-production.up.railway.app';
      if (user?.email) {
        await require('./email').sendDelegationReport(user.email, {
          meetingTitle: s.task, headline, decidedCount: decided.length, waitingCount: waiting.length,
          link: `${base.replace(/\/$/, '')}/projects/${project.id}/bras-droit`,
        });
      }
    } catch (err) { console.error('[delegation] e-mail :', err.message); }
  }
  return note;
}

module.exports = { DEFAULT_CAN_DECIDE, DEFAULT_RESERVED, BRAS_DROIT, sanitizeDelegation, delegationSection, resolveCard, applyCardOutcome, setStatus, finishDelegation };
