// Définition UNIQUE de l'outil de recherche web Anthropic : réunions, missions, commande
// /rechercher, guide de mise en place et sa discussion, script check-web-search.js.
//
// - allowed_callers: ['direct'] est indispensable : sans lui, le modèle route parfois la
//   recherche via exécution de code et l'API n'attache alors jamais de citations (testé).
// - localisation France approximative.
// - jamais de max_uses: 0 (refusé par l'API) : sans recherche permise, pas d'outil du tout.
const WEB_SEARCH_TOOL_TYPE = 'web_search_20260318';
const WEB_SEARCH_USER_LOCATION = { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' };

function buildWebSearchTool({ maxUses } = {}) {
  const n = Math.floor(Number(maxUses));
  if (!(n >= 1)) return null;
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: 'web_search',
    max_uses: n,
    allowed_callers: ['direct'],
    user_location: { ...WEB_SEARCH_USER_LOCATION },
  };
}

module.exports = { buildWebSearchTool, WEB_SEARCH_TOOL_TYPE };
