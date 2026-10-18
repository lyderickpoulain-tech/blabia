import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { notifyError, notifySuccess } from '../utils/notify';

// Missions des assistants d'un projet (ou d'une réunion) : chargement, actions, et
// actualisation automatique tant qu'une mission est en attente ou en cours.
export default function useMissions(projectId, { sessionId } = {}) {
  const [missions, setMissions] = useState([]);
  const [budget, setBudget] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data } = await api.get(`/projects/${projectId}/missions`, { params: sessionId ? { sessionId } : {} });
      setMissions(data.missions);
      setBudget(data.budget);
    } catch (err) { notifyError(err, 'Impossible de charger les missions.'); }
    setLoaded(true);
  }, [projectId, sessionId]);

  useEffect(() => { load(); }, [load]);

  // Suivi automatique des missions qui tournent
  const active = missions.some(m => m.status === 'queued' || m.status === 'running');
  useEffect(() => {
    if (!active) return;
    timer.current = setInterval(load, 8000);
    return () => clearInterval(timer.current);
  }, [active, load]);

  // Mission annoncée pendant la réunion (événement du flux)
  const addMission = useCallback(m => setMissions(prev => prev.some(x => x.id === m.id) ? prev : [m, ...prev]), []);

  const call = useCallback(async (mission, action, body, okMessage) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/missions/${mission.id}/${action}`, body || {});
      setMissions(prev => prev.map(m => m.id === mission.id ? { ...m, ...data } : m));
      if (okMessage && !data?.postponed) notifySuccess(okMessage);
      load();
      return data;
    } catch (err) { notifyError(err, 'L’action sur la mission a échoué.'); return null; }
  }, [projectId, load]);

  return {
    missions, budget, loaded, reload: load, addMission,
    approve: (m, level) => call(m, 'approve', { level }, 'Mission lancée : le rapport arrivera dans les documents du projet.'),
    reject:  m => call(m, 'reject'),
    cancel:  m => call(m, 'cancel'),
    // v5.1 : compte rendu prêt — intégré au projet ou non ; la mission disparaît ensuite
    integrate: m => call(m, 'outcome', { outcome: 'integrated' }, 'Compte rendu intégré au projet : les assistants s’en serviront.'),
    discard:   m => call(m, 'outcome', { outcome: 'discarded' }, 'Compte rendu écarté : il n’est pas intégré au projet.'),
  };
}
