// Préparation d'une réunion par les agents, SANS l'humain (v5.1, 15/10/2026).
// Lancée, elle tourne sur le serveur même si l'humain quitte la page (routes/sessions/chat.js
// ne l'interrompt plus à la déconnexion) : il retourne au tableau de bord et revient quand
// les conclusions sont prêtes.
// - « en cours » : suivi en mémoire (une préparation interrompue par un redémarrage du
//   serveur n'apparaît plus comme en cours ; la réunion reste ouverte, on peut la reprendre) ;
// - « prête » : la synthèse de préparation existe et personne n'est encore venu (aucun
//   message humain ni réponse à une carte après elle).

const running = new Map(); // sessionId → { projectId, startedAt, controller }

const start = (sessionId, projectId, controller = null) => running.set(sessionId, { projectId, startedAt: new Date(), controller });
// Arrêt demandé par l'humain (« Arrêter la préparation ») : les échanges déjà faits restent
const stop = sessionId => { const r = running.get(sessionId); if (!r) return false; r.controller?.abort(); running.delete(sessionId); return true; };
const finish = sessionId => running.delete(sessionId);
const isRunning = sessionId => running.has(sessionId);
const runningInProject = projectId => [...running.entries()].filter(([, r]) => r.projectId === projectId).map(([id]) => id);
const runningProjects = () => new Set([...running.values()].map(r => r.projectId));

// SQL : réunion ouverte dont la préparation est prête et pas encore consultée par l'humain.
// `alias` : la table Session dans la requête appelante.
const PREP_READY_SQL = (alias = '"Session"') => `(${alias}.status = 'open' AND COALESCE((
  SELECT MAX(i) FILTER (WHERE m->>'type' = 'prep_summary')
       > COALESCE(MAX(i) FILTER (WHERE m->>'role' = 'human' OR m->>'type' = 'decision_answer'), 0)
  FROM jsonb_array_elements(COALESCE(${alias}.messages, '[]'::jsonb)) WITH ORDINALITY AS e(m, i)
), false))`;

// Même règle en JS (détail d'une réunion)
function prepReady(session, messages) {
  if (session?.status !== 'open') return false;
  let summaryAt = -1, humanAt = -1;
  (messages || []).forEach((m, i) => {
    if (m.type === 'prep_summary') summaryAt = i;
    if (m.role === 'human' || m.type === 'decision_answer') humanAt = i;
  });
  return summaryAt >= 0 && humanAt < summaryAt;
}

module.exports = { start, stop, finish, isRunning, runningInProject, runningProjects, PREP_READY_SQL, prepReady };
