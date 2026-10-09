// v5.0 phase 4 : accès au catalogue d'outils servi par le serveur
// (server/src/services/tools/catalog.js, seule source de vérité).
import { useEffect, useState } from 'react';
import api from './api';

let cache = null;
let pending = null;

function loadCatalog() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = api.get('/tools/catalog')
      .then(({ data }) => { cache = data; return data; })
      .finally(() => { pending = null; });
  }
  return pending;
}

export function useToolsCatalog() {
  const [catalog, setCatalog] = useState(cache);
  const [error, setError] = useState('');
  useEffect(() => {
    if (cache) return;
    loadCatalog().then(setCatalog).catch(() => setError('Catalogue d\'outils indisponible'));
  }, []);
  return { catalog, error };
}

export const USER_STATUS = {
  using:   { label: "J'utilise",     cls: 'bg-green-100 text-green-700 border-green-200' },
  account: { label: "J'ai un compte", cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  to_try:  { label: 'À essayer',      cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export const PROJECT_STATUS = {
  suggested: { label: 'Suggéré', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  validated: { label: 'Validé',  cls: 'bg-green-100 text-green-700 border-green-200' },
  refused:   { label: 'Refusé',  cls: 'bg-gray-100 text-gray-500 border-gray-200' },
};

export const COST_TYPES = {
  free:         'Gratuit',
  freemium:     'Freemium',
  subscription: 'Abonnement',
  usage:        "À l'usage",
};

const euros = (n) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;

// "Gratuit" | "Freemium — 0 à 25 €/mois" | "Abonnement 9 €/mois"
export function costLabel(cost) {
  if (!cost) return 'Coût non renseigné';
  const type = COST_TYPES[cost.type] || 'Coût';
  if (cost.type === 'free') return type;
  const { monthlyMin: min, monthlyMax: max } = cost;
  if (min == null && max == null) return type;
  if (max == null || min === max) return `${type} — ${euros(min ?? max)}/mois`;
  return `${type} — ${euros(min ?? 0)} à ${euros(max)}/mois`;
}

export function totalLabel({ min, max }) {
  if (!min && !max) return '0 €/mois';
  return min === max ? `${euros(min)}/mois` : `${euros(min)} à ${euros(max)}/mois`;
}
