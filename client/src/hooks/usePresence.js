import { useEffect } from 'react';
import api from '../utils/api';

// Présence sur un projet (v5.1) : signal d'activité chaque minute tant que l'onglet est
// visible (pages du projet et salle de réunion) ; affiché sur la carte du projet.
const EVERY_MS = 60 * 1000;

export default function usePresence(projectId) {
  useEffect(() => {
    if (!projectId) return undefined;
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      api.post(`/projects/${projectId}/presence`).catch(() => {}); // sans gravité : simple indicateur
    };
    ping();
    const t = setInterval(ping, EVERY_MS);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };
  }, [projectId]);
}
