// Préparation d'une réunion par les agents, sans l'humain (v5.1, 15/10/2026).
// Le serveur la mène seul : on ouvre le flux le temps qu'elle démarre, puis on se
// déconnecte — l'humain retourne à ses projets et revient quand les conclusions sont prêtes.
import api from './api';

export async function launchPreparation(projectId, sessionId) {
  const res = await fetch(`/api/projects/${projectId}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '', resume: true, prepare: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'La préparation n’a pas pu être lancée.');
  }
  const reader = res.body?.getReader();
  if (reader) {
    await reader.read().catch(() => {}); // « connected » : la préparation tourne sur le serveur
    reader.cancel().catch(() => {});      // on se déconnecte ; elle continue sans nous
  }
}

export const stopPreparation = (projectId, sessionId) => api.post(`/projects/${projectId}/sessions/${sessionId}/prepare/stop`);
