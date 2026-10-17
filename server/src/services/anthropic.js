const Anthropic = require('@anthropic-ai/sdk');
const { recordUsage, currentContext } = require('./usage');
const userKeys = require('./userKeys');
const { currentModel, THINKING_MODELS, DEFAULT_EFFORT, THINKING_HEADROOM } = require('./models');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[anthropic] ANTHROPIC_API_KEY manquante — les appels API échoueront');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' });

// Bascule automatique quand un filtre de sécurité d'un modèle Claude 5 décline la demande :
// l'API relance la même requête sur un autre modèle, dans le même appel
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Adaptation au modèle (migration Claude 5, services/models.js) — un seul endroit, pour tous
// les appels présents et futurs :
// - ancien identifiant (réunion créée avant la migration) → son successeur ;
// - Claude 5 : effort par défaut, marge de réflexion ajoutée à max_tokens, réflexion
//   « désactivée » retirée (refusée par ces modèles), bascule en cas de refus.
function adaptForModel(params) {
  const model = currentModel(params.model);
  const p = { ...params, model };
  if (THINKING_MODELS.has(model)) {
    if (!p.output_config?.effort) p.output_config = { ...(p.output_config || {}), effort: DEFAULT_EFFORT };
    if (p.thinking?.type === 'disabled') delete p.thinking;
    if (p.max_tokens > 0) {
      p.max_tokens += THINKING_HEADROOM;
      if (p.fallbacks === undefined) p.fallbacks = 'default';
    }
  }
  return p;
}

// Coût réel (v5.1) : toute réponse est journalisée dans UsageLog (services/usage.js).
// Point de passage unique : aucun appel, présent ou futur, n'échappe au décompte.
// « Apportez votre clé API » (v5.1, services/userKeys.js) : la clé du propriétaire du projet
// d'abord, s'il en a une ; si Anthropic la refuse (clé révoquée, crédit épuisé, limite de débit,
// modèle absent de son compte), la clé de BlabIA prend le relais pour cet appel.
const create = client.messages.create.bind(client.messages);
const done = (response, p, billedTo) => {
  if (response?.usage) recordUsage(response.model || p.model, response.usage, { billedTo }); // sans attendre
  if (response?.stop_reason === 'refusal') console.warn(`[anthropic] demande déclinée (${response.stop_details?.category || 'sans catégorie'}) — ${p.model}`);
  return response;
};
client.messages.create = async (params, options) => {
  const p = adaptForModel(params);
  const opts = p.fallbacks ? { ...(options || {}), headers: { ...(options?.headers || {}), 'anthropic-beta': FALLBACK_BETA } } : options;
  const own = await userKeys.resolve(currentContext()).catch(err => { console.error('[anthropic] clé du porteur :', err.message); return null; });
  if (own) {
    try {
      return done(await userKeys.clientFor(own.apiKey).messages.create(p, opts), p, 'user');
    } catch (err) {
      const verdict = userKeys.classify(err);
      if (!verdict || options?.signal?.aborted) throw err;
      console.warn(`[anthropic] clé du porteur refusée (${verdict}) : relais par la clé BlabIA`);
      userKeys.markKey(own.userId, verdict, err?.error?.error?.message || err?.message).catch(() => {});
    }
  }
  return done(await create(p, opts), p, 'blabia');
};

// Texte d'une réponse : seulement les blocs « text » (avec la réflexion des modèles Claude 5,
// le premier bloc n'est plus forcément le texte)
const textOf = response => (response?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

module.exports = client;
module.exports.textOf = textOf;
module.exports.adaptForModel = adaptForModel;
