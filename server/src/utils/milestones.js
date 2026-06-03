const db = require('./db');

/**
 * Calcule le statut automatique d'un jalon depuis ses todos.
 *   - Si un todo est lié à une session avec codeStatus='not_generated' → 'blocked'
 *   - Tous done/cancelled → 'done'
 *   - Au moins un in_progress → 'in_progress'
 *   - Sinon → 'pending'
 *   - Aucun todo → null (pas de calcul automatique)
 */
async function computeMilestoneStatus(milestoneId) {
  const todos = await db('TodoItem')
    .select('TodoItem.status', 'TodoItem.sessionId', 'Session.codeStatus')
    .leftJoin('Session', 'Session.id', 'TodoItem.sessionId')
    .where('TodoItem.milestoneId', milestoneId);

  if (todos.length === 0) return null;

  if (todos.some(t => t.sessionId && t.codeStatus === 'not_generated')) return 'blocked';

  const active = todos.filter(t => t.status !== 'cancelled');
  if (active.length === 0)                            return 'done';
  if (active.every(t => t.status === 'done'))         return 'done';
  if (active.some(t => t.status === 'in_progress'))   return 'in_progress';
  return 'pending';
}

module.exports = { computeMilestoneStatus };
