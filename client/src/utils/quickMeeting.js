// Entrer dans une réunion du plan en un clic (v5.1, 17/10/2026, test « Gérard ») : plus de
// formulaire intermédiaire — les assistants proposés pour l'objectif, le modèle et la recherche
// web recommandés ; la page « Nouvelle réunion » reste accessible via « Personnaliser ».
import api from './api';

// delegation : cadre de la réunion confiée au bras droit ({} = cadre par défaut, v5.1 F2)
export async function quickStartMeeting(project, milestone, { prepare = false, delegation = null } = {}) {
  const milestoneId = milestone.milestoneId || milestone.id;
  const [{ data: agents }, sugg] = await Promise.all([
    api.get(`/projects/${project.id}/agents`),
    api.post(`/projects/${project.id}/sessions/suggest-agents`, { task: milestone.title, milestoneType: milestone.type, milestoneId })
      .then(r => r.data).catch(() => ({})),
  ]);
  const byId = Object.fromEntries(agents.map(a => [a.agentId || a.id, a]));
  let ids = (sugg.existingSelected || []).map(s => s.agentId).filter(id => byId[id]).slice(0, 4);
  if (ids.length < (prepare || delegation ? 2 : 1)) ids = [...new Set([...ids, ...agents.map(a => a.agentId || a.id)])].slice(0, 3);
  const activeAgents = ids.map(id => byId[id]).map(a => ({
    id: a.agentId || a.id, name: a.name, role: a.role, systemPrompt: a.systemPrompt || `Tu es ${a.name}. ${a.role}.`, emoji: a.emoji || '',
  }));
  const { data } = await api.post(`/projects/${project.id}/sessions`, {
    task: milestone.title, intention: [milestone.type || 'decision'], activeAgents, mode: 'meeting', milestoneId,
    ...(sugg.recommended?.model ? { model: sugg.recommended.model } : {}),
    webSearchEnabled: sugg.recommended?.webSearch === true,
    ...(delegation ? { delegation } : {}),
  });
  return data.session;
}

// Message lisible quand la réunion ne peut pas se tenir (actions à mener avant)
export function quickStartError(err) {
  const blocking = err.response?.data?.blockingActions;
  if (blocking?.length) return `Cette réunion attend d’abord : ${blocking.map(b => `« ${b.title} »`).join(', ')} (Décisions et actions).`;
  return err.response?.data?.error || 'La réunion n’a pas pu démarrer.';
}
