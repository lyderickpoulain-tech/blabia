// Fonctions et constantes partagées entre les sous-routers sessions/
const db         = require('../../utils/db');
const anthropic  = require('../../services/anthropic');
const { parseJsonField } = require('../../utils/parseJsonField');

const { DEFAULT_MODEL: MODEL } = require('../../services/models');

// ── Similarité lexicale (Jaccard) ─────────────────────────────────────────────

function areSimilar(q1, q2, threshold = 0.6) {
  const words1 = new Set(q1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(q2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 && intersection.length / union.size > threshold;
}

// ── Mémoire projet ────────────────────────────────────────────────────────────
// Ajoute le compte-rendu d'une session à la mémoire cumulée du projet
// (rotation des entrées les plus anciennes au-delà de MAX_CHARS).

async function updateProjectContext(projectId, sessionId, task, content) {
  try {
    const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const entry = `[SESSION:${sessionId} | ${date} — ${task}]\n${content}`;

    const [project] = await db('Project').select('context').where({ id: projectId }).limit(1);
    const current = project?.context || '';
    let newContext = (current ? current + '\n---\n' : '') + entry;

    const MAX_CHARS = 10000;
    if (newContext.length > MAX_CHARS) {
      const parts = newContext.split('\n---\n');
      while (parts.length > 1 && parts.join('\n---\n').length > MAX_CHARS) {
        parts.shift();
      }
      newContext = parts.join('\n---\n');
    }

    await db('Project').where({ id: projectId }).update({ context: newContext, updatedAt: new Date() });
  } catch (err) {
    console.error('[updateProjectContext]', err.message);
  }
}

// ── Timeline ──────────────────────────────────────────────────────────────────

async function appendTimelineEntry(sessionId, entry) {
  await db.raw(
    `UPDATE "Session" SET timeline = COALESCE(timeline, '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([entry]), sessionId]
  );
}

async function patchTimelineEntry(sessionId, entryId, patch) {
  const [session] = await db('Session').select('timeline').where({ id: sessionId }).limit(1);
  const tl = parseJsonField(session?.timeline, []);
  const idx = tl.findIndex(e => e.id === entryId);
  if (idx < 0) return;
  tl[idx] = { ...tl[idx], ...patch };
  await db('Session').where({ id: sessionId }).update({ timeline: JSON.stringify(tl) });
}

// ── Messages ──────────────────────────────────────────────────────────────────

async function appendMessageEntry(sessionId, message) {
  await db.raw(
    `UPDATE "Session" SET messages = COALESCE(messages, '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([message]), sessionId]
  );
}

// v5.0 phase 3.4 : remplace appendPendingStepSuggestion. Max 5 suggestions en
// attente par réunion, dédoublonnage par similarité de titre. Retourne true si
// la suggestion a bien été stockée (false = doublon ou limite atteinte).
async function appendPendingMeetingSuggestion(sessionId, suggestion) {
  const [row] = await db('Session').select('pendingMeetingSuggestions').where({ id: sessionId });
  const existing = parseJsonField(row?.pendingMeetingSuggestions, []);
  if (existing.length >= 5) return false;
  const isDuplicate = existing.some(s => s.status === 'pending' && areSimilar(s.title || '', suggestion.title || '', 0.5));
  if (isDuplicate) return false;
  await db.raw(
    `UPDATE "Session" SET "pendingMeetingSuggestions" = COALESCE("pendingMeetingSuggestions", '[]'::jsonb) || ?::jsonb WHERE id = ?`,
    [JSON.stringify([suggestion]), sessionId]
  );
  return true;
}

// ── Appel Anthropic non streamé ────────────────────────────────────────────────
// v5.0 phase 2 : remplace streamAgent. Un seul appel, pas de boucle de relance —
// si stop_reason === 'max_tokens', on coupe proprement à la dernière phrase
// complète plutôt que de redemander une suite (cf. règle "messages courts").
//
// Recherche web (2.6) : outil serveur web_search_20260318, user_location France
// approximative. pause_turn (recherche longue) : on renvoie la réponse assistant
// telle quelle pour laisser l'outil terminer, jusqu'à 3 boucles. Seules les
// sources réellement citées (TextBlock.citations, type web_search_result_location)
// sont remontées — pas tous les résultats de recherche bruts.
//
// allowed_callers: ['direct'] est nécessaire — testé en conditions réelles : sans
// cette restriction, le modèle route parfois la recherche via exécution de code
// (il écrit du Python qui appelle web_search() dans un bac à sable), et dans ce
// cas l'API n'attache JAMAIS de citations aux blocs texte (le modèle lit une
// sortie de code imprimée, il ne cite pas directement un résultat de recherche).
// Forcer l'appel direct restaure des citations fiables.

const WEB_SEARCH_MAX_USES    = 3;
const WEB_SEARCH_MAX_PAUSES  = 3;
const WEB_SEARCH_USER_LOCATION = { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' };

async function callAgent(systemPrompt, userMessage, maxTokens = 600, model = MODEL, signal = null, webSearch = false) {
  let messages = [{ role: 'user', content: userMessage }];
  let totalInputTokens = 0, totalOutputTokens = 0, totalWebSearchRequests = 0;
  const queries = [];
  const sourcesByUrl = new Map();
  let response;

  for (let loop = 0; loop <= WEB_SEARCH_MAX_PAUSES; loop++) {
    const apiParams = { model, max_tokens: maxTokens, system: systemPrompt, messages };
    if (webSearch) {
      apiParams.tools = [{
        type: 'web_search_20260318',
        name: 'web_search',
        max_uses: WEB_SEARCH_MAX_USES,
        allowed_callers: ['direct'],
        user_location: WEB_SEARCH_USER_LOCATION,
      }];
    }

    response = await anthropic.messages.create(apiParams, signal ? { signal } : undefined);

    totalInputTokens  += response.usage?.input_tokens  || 0;
    totalOutputTokens += response.usage?.output_tokens || 0;
    totalWebSearchRequests += response.usage?.server_tool_use?.web_search_requests || 0;

    for (const block of response.content) {
      if (block.type === 'server_tool_use' && block.name === 'web_search' && block.input?.query) {
        queries.push(block.input.query);
        console.log(`[web_search] "${block.input.query}"`);
      }
      if (block.type === 'text' && Array.isArray(block.citations)) {
        for (const c of block.citations) {
          if (c.type === 'web_search_result_location' && c.url && !sourcesByUrl.has(c.url)) {
            sourcesByUrl.set(c.url, { url: c.url, title: c.title || c.url, citedText: c.cited_text || '' });
          }
        }
      }
    }

    if (response.stop_reason !== 'pause_turn') break;
    // Laisse l'outil terminer : on renvoie la réponse assistant telle quelle,
    // sans nouveau message utilisateur.
    messages = [...messages, { role: 'assistant', content: response.content }];
  }

  let text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  if (response.stop_reason === 'max_tokens') {
    const truncated = text.replace(/[^.!?]*$/, '').trim();
    if (truncated) text = truncated;
  }

  return {
    text,
    stopReason: response.stop_reason,
    usage: {
      inputTokens:  totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    webSearch: webSearch
      ? { queries, sources: [...sourcesByUrl.values()], requests: totalWebSearchRequests }
      : null,
  };
}

module.exports = {
  MODEL,
  areSimilar,
  updateProjectContext,
  appendTimelineEntry,
  patchTimelineEntry,
  appendMessageEntry,
  appendPendingMeetingSuggestion,
  callAgent,
};
