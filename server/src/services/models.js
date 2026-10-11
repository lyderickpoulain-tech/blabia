// Modèles Claude utilisés par BlabIA — source unique (v5.1).
// Pour changer de modèle : modifier ici, puis ajouter son tarif dans services/pricing.js
// (sinon le coût est calculé au tarif de sa famille, avec un avertissement dans les logs).
//
// 11/10/2026 : passage à la famille Claude 5 (étude comparative validée par l'utilisateur :
// Sonnet 5.5 au moins aussi pertinent que Sonnet 4.6 et Opus 4.8 sur les tâches de BlabIA,
// pour 25 à 50 % moins cher et 2 à 4 fois plus rapide).

// Modèles proposés à l'humain au démarrage d'une réunion (StartMeeting, via GET /api/models)
const MEETING_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet', desc: 'Rapide et économique (recommandé)' },
  { id: 'claude-opus-5-5',   label: 'Opus',   desc: 'Plus puissant, plus coûteux' },
];

// Modèle par défaut : réunions, comptes rendus, commandes rapides, analyses, missions
const DEFAULT_MODEL = 'claude-sonnet-5-5';

// Anciens identifiants (réunions créées avant la migration, valeurs stockées) → successeurs
const LEGACY_MODELS = { 'claude-sonnet-4-6': 'claude-sonnet-5-5', 'claude-opus-4-8': 'claude-opus-5-5' };
const currentModel = id => LEGACY_MODELS[id] || id;

// Claude 5 (Sonnet 5.5, Opus 5.5) : réflexion adaptative (toujours active sur Opus 5.5),
// facturée et comptée dans max_tokens. Réglage centralisé dans services/anthropic.js :
// effort « low » par défaut (le plus pertinent dans l'étude pour les réunions, comptes rendus
// et extractions), marge ajoutée à max_tokens pour que la réflexion ne tronque pas la réponse.
const THINKING_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);
const DEFAULT_EFFORT = 'low';
const THINKING_HEADROOM = 2000;

// Modèle léger pour l'orchestrateur (choix de l'agent qui parle ensuite, à chaque tour) :
// ~30 fois moins cher que Sonnet. Haiku 5.5 réfléchit par défaut : la réflexion est
// désactivée à l'appel (ORCHESTRATOR_PARAMS), sinon elle consomme tout max_tokens.
const ORCHESTRATOR_MODEL  = 'claude-haiku-5-5';
const ORCHESTRATOR_PARAMS = { thinking: { type: 'disabled' } };

const isMeetingModel = id => MEETING_MODELS.some(m => m.id === id);

module.exports = {
  MEETING_MODELS, DEFAULT_MODEL, ORCHESTRATOR_MODEL, ORCHESTRATOR_PARAMS, isMeetingModel,
  LEGACY_MODELS, currentModel, THINKING_MODELS, DEFAULT_EFFORT, THINKING_HEADROOM,
};
