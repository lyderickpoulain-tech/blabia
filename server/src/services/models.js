// Modèles Claude utilisés par BlabIA — source unique (v5.1).
// Pour changer de modèle : modifier ici, puis ajouter son tarif dans services/pricing.js
// (sinon le coût est calculé au tarif de sa famille, avec un avertissement dans les logs).

// Modèles proposés à l'humain au démarrage d'une réunion (StartMeeting, via GET /api/models)
const MEETING_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet', desc: 'Rapide et économique' },
  { id: 'claude-opus-4-8',   label: 'Opus',   desc: 'Plus puissant, plus lent' },
];

// Modèle par défaut : réunions, comptes rendus, commandes rapides, analyses
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const isMeetingModel = id => MEETING_MODELS.some(m => m.id === id);

module.exports = { MEETING_MODELS, DEFAULT_MODEL, isMeetingModel };
