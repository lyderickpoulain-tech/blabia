import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from './api';
import { notifyError, notifySuccess } from './notify';

// Connexion GitHub (v5.1, développements) : le serveur renvoie l'adresse GitHub
// (autorisation, puis installation de l'application BlabIA si besoin) ; GitHub revient
// ensuite sur `returnTo` avec ?github=ok | annule | erreur.
export async function startGitHubConnect(returnTo) {
  try {
    const { data } = await api.post('/github/connect', { returnTo });
    window.location.assign(data.url);
  } catch (err) {
    notifyError(err, 'La connexion à GitHub n’a pas pu démarrer.');
  }
}

const RESULTS = {
  ok: ['ok', 'Compte GitHub connecté.'],
  annule: ['error', 'Connexion GitHub annulée.'],
  erreur: ['error', 'La connexion GitHub a échoué. Réessayez ; si le problème persiste, réinstallez l’application BlabIA sur GitHub.'],
};

// Au retour de GitHub : message puis nettoyage de l'adresse
export function useGitHubReturn(onReturn) {
  const [params, setParams] = useSearchParams();
  const result = params.get('github');
  useEffect(() => {
    if (!result || !RESULTS[result]) return;
    const [tone, message] = RESULTS[result];
    if (tone === 'ok') notifySuccess(message); else notifyError(null, message);
    const next = new URLSearchParams(params);
    next.delete('github');
    setParams(next, { replace: true });
    onReturn?.(result);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
}
