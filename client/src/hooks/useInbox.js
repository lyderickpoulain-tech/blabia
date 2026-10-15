import { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';

// « À trancher » du projet (v5.1, 16/10/2026) : ce qui attend l'humain, ce qui tourne sans lui
// (réunion tenue par le bras droit, préparation), et le dernier message du bras droit (son
// retour proactif). Relu toutes les 20 s quand la page est visible, toutes les 8 s quand
// quelque chose tourne, et au retour sur l'onglet.
export default function useInbox(projectId) {
  const [inbox, setInbox] = useState(null);
  const refresh = useCallback(() => {
    if (!projectId) return Promise.resolve();
    return api.get(`/projects/${projectId}/assistant/inbox`).then(({ data }) => setInbox(data)).catch(() => {}); // repli silencieux : simple pastille
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  const busy = (inbox?.running?.length || 0) > 0;
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, busy ? 8000 : 20000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, busy]);

  return { inbox, refresh };
}
