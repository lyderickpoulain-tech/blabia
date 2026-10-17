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
  using:   { label: "J'utilise",     cls: 'bg-ok-light text-ok border-ok-border' },
  account: { label: "J'ai un compte", cls: 'bg-action-light text-action border-action-border' },
  to_try:  { label: 'À essayer',      cls: 'bg-muted-light text-ink-soft border-line' },
};

export const PROJECT_STATUS = {
  suggested: { label: 'Suggéré', cls: 'bg-await-light text-await border-await-border' },
  validated: { label: 'Validé',  cls: 'bg-ok-light text-ok border-ok-border' },
  refused:   { label: 'Refusé',  cls: 'bg-muted-light text-ink-muted border-line' },
};

export const COST_TYPES = {
  free:         'Gratuit',
  freemium:     'Gratuit au départ',
  subscription: 'Abonnement',
  usage:        'Selon l’utilisation',
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

// Points d'attention des outils d'un projet : besoins non couverts, outils
// signalés comme pas adaptés, outils suggérés en attente de décision.
export function attentionCount(tools = [], needs = []) {
  const active = (tools || []).filter(t => t.status === 'validated' || t.status === 'suggested');
  const missing = (needs || []).filter(n => !active.some(t => t.category === n.category)).length;
  const flagged = active.filter(t => t.warning || t.status === 'suggested').length;
  return missing + flagged;
}

export function totalLabel({ min, max }) {
  if (!min && !max) return '0 €/mois';
  return min === max ? `${euros(min)}/mois` : `${euros(min)} à ${euros(max)}/mois`;
}
