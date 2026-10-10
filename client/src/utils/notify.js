// Notifications (v5.1) : remplacent les erreurs avalées en silence (`catch {}`),
// qui ont déjà masqué un vrai bug. Usage : catch (err) { notifyError(err, 'Message') }.
// Affichées par <Toaster /> (monté une fois dans App).

const listeners = new Set();
let nextId = 1;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(toast) {
  const t = { id: nextId++, ...toast };
  listeners.forEach(fn => fn(t));
}

// Message lisible : celui du serveur s'il y en a un, sinon le message par défaut
export function errorMessage(err, fallback = 'Une erreur est survenue.') {
  if (err?.response?.data?.error) return err.response.data.error;
  if (err && !err.response && err.request) return 'Connexion au serveur impossible. Vérifiez votre connexion puis réessayez.';
  return fallback;
}

export function notifyError(err, fallback) {
  // 401 : l'intercepteur d'api.js renvoie déjà vers la connexion
  if (err?.response?.status === 401) return;
  emit({ tone: 'error', message: errorMessage(err, fallback) });
  if (err && import.meta.env.DEV) console.error('[notifyError]', fallback, err);
}

export function notifySuccess(message) {
  emit({ tone: 'ok', message });
}
