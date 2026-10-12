import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Guide de mise en place : recherche web fiabilisée (API Anthropic simulée)
const require = createRequire(import.meta.url);
const {
  runWithWebSearch, needsOverwriteConfirmation, draftExpired, checkStatusOf, DRAFT_TTL_MS, GUIDE_MAX_SEARCHES, CHAT_MAX_SEARCHES,
} = require('../tools/setupGuide');
const { buildWebSearchTool } = require('../webSearchTool');

const searchBlocks = (n, ok = true, id = 'a') => Array.from({ length: n }, (_, i) => [
  { type: 'server_tool_use', id: `srv_${id}${i}`, name: 'web_search', input: { query: `q${i}` } },
  {
    type: 'web_search_tool_result', tool_use_id: `srv_${id}${i}`,
    content: ok ? [{ type: 'web_search_result', url: `https://ex.fr/${id}${i}`, title: `Page ${id}${i}` }] : { type: 'web_search_tool_result_error', error_code: 'unavailable' },
  },
]).flat();
const reply = (content, { stop = 'end_turn', searches = 0 } = {}) => ({
  model: 'claude-sonnet-5-5', stop_reason: stop, content,
  usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: searches } },
});
const text = (t, citations) => ({ type: 'text', text: t, ...(citations ? { citations } : {}) });

async function run(replies, opts = {}) {
  const calls = [];
  const queue = [...replies];
  const create = async p => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const r = queue.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  const out = await runWithWebSearch({ budget: 8, system: 'S', user: 'U', maxTokens: 100, create, ...opts });
  return { ...out, calls };
}

describe('définition partagée de l\'outil web', () => {
  it('reprend le réglage de référence et n\'envoie jamais max_uses: 0', () => {
    expect(buildWebSearchTool({ maxUses: 8 })).toEqual({
      type: 'web_search_20260318', name: 'web_search', max_uses: 8, allowed_callers: ['direct'],
      user_location: { type: 'approximate', country: 'FR', timezone: 'Europe/Paris' },
    });
    expect(buildWebSearchTool({ maxUses: 0 })).toBeNull();
    expect(GUIDE_MAX_SEARCHES).toBe(8);
    expect(CHAT_MAX_SEARCHES).toBe(3);
  });
});

describe('guide : statut de la vérification en ligne', () => {
  it('verified : au moins une recherche réussie, sources sans doublons (résultats + citations)', async () => {
    const cites = [
      { type: 'web_search_result_location', url: 'https://ex.fr/a0', title: 'Page a0' },
      { type: 'web_search_result_location', url: 'https://cite.fr', title: 'Cité' },
    ];
    const r = await run([reply([...searchBlocks(2), text('Guide', cites)], { searches: 2 })]);
    expect(r.text).toBe('Guide');
    expect(r.check.status).toBe('verified');
    expect(r.check.searches).toBe(2);
    expect(r.check.sources.map(s => s.url)).toEqual(['https://ex.fr/a0', 'https://ex.fr/a1', 'https://cite.fr']);
    expect(r.calls[0].tools[0]).toMatchObject({ type: 'web_search_20260318', max_uses: 8, allowed_callers: ['direct'] });
  });

  it('not_searched : aucune recherche effectuée', async () => {
    const r = await run([reply([text('Guide')])]);
    expect(r.check).toMatchObject({ status: 'not_searched', searches: 0, sources: [] });
  });

  it('error : l\'outil de recherche renvoie une erreur', async () => {
    const r = await run([reply([...searchBlocks(1, false), text('Guide')], { searches: 1 })]);
    expect(r.check.status).toBe('error');
  });

  it('unauthorized : 403 → le guide est regénéré SANS l\'outil', async () => {
    const err = Object.assign(new Error('web search is not enabled for this organization'), { status: 403 });
    const r = await run([err, reply([text('Guide sans web')])]);
    expect(r.check).toMatchObject({ status: 'unauthorized', searches: 0 });
    expect(r.text).toBe('Guide sans web');
    expect(r.calls).toHaveLength(2);
    expect(r.calls[1].tools).toBeUndefined();
  });

  it('une autre erreur de l\'API remonte (pas d\'échec silencieux)', async () => {
    await expect(run([Object.assign(new Error('boom'), { status: 500 })])).rejects.toThrow('boom');
  });

  it('truncated : max_tokens l\'emporte même avec des sources', async () => {
    const r = await run([reply([...searchBlocks(1), text('Guide coupé')], { stop: 'max_tokens', searches: 1 })]);
    expect(r.check.status).toBe('truncated');
    expect(r.check.sources).toHaveLength(1);
  });

  it('pause_turn encore présent après 3 relances → truncated (4 appels au total)', async () => {
    const paused = i => reply(searchBlocks(1, true, `p${i}`), { stop: 'pause_turn', searches: 1 });
    const r = await run([paused(0), paused(1), paused(2), paused(3)]);
    expect(r.calls).toHaveLength(4);
    expect(r.check.status).toBe('truncated');
    expect(r.check.searches).toBe(4);
  });

  it('budget cumulé : pause_turn (5 recherches) puis end_turn (3) → 8, relance avec max_uses 3', async () => {
    const first = reply(searchBlocks(5), { stop: 'pause_turn', searches: 5 });
    const second = reply([...searchBlocks(3, true, 'b'), text('Guide final')], { searches: 3 });
    const r = await run([first, second]);
    expect(r.check.searches).toBe(8);
    expect(r.check.status).toBe('verified');
    expect(r.text).toBe('Guide final');
    expect(r.calls[0].tools[0].max_uses).toBe(8);
    expect(r.calls[1].tools[0].max_uses).toBe(3);
    // la relance renvoie le contenu interrompu (recherches comprises) pour ne pas les refaire
    expect(r.calls[1].messages[1]).toMatchObject({ role: 'assistant' });
    expect(r.calls[1].messages[1].content.filter(b => b.type === 'server_tool_use')).toHaveLength(5);
  });

  it('budget épuisé : l\'outil reste déclaré (jamais max_uses: 0) et la consigne « conclure » est ajoutée', async () => {
    const first = reply(searchBlocks(3), { stop: 'pause_turn', searches: 3 });
    const r = await run([first, reply([text('Fin')])], { budget: 3 });
    expect(r.calls[1].tools[0].max_uses).toBe(1);
    expect(r.calls[1].system).toContain('SANS nouvelle recherche');
    expect(r.calls[0].system).toBe('S');
  });
});

describe('guide : étiquette, remplacement et brouillon', () => {
  it('un guide sans étiquette (NULL) vaut « à vérifier »', () => {
    expect(checkStatusOf(null)).toBe('unverified');
    expect(checkStatusOf({ status: 'verified' })).toBe('verified');
  });
  it('demande confirmation seulement si un guide vérifié serait remplacé par un non vérifié', () => {
    expect(needsOverwriteConfirmation({ status: 'verified' }, { status: 'not_searched' })).toBe(true);
    expect(needsOverwriteConfirmation({ status: 'verified' }, { status: 'truncated' })).toBe(true);
    expect(needsOverwriteConfirmation({ status: 'verified' }, { status: 'verified' })).toBe(false);
    expect(needsOverwriteConfirmation(null, { status: 'not_searched' })).toBe(false);
    expect(needsOverwriteConfirmation({ status: 'error' }, { status: 'verified' })).toBe(false);
  });
  it('le brouillon expire au bout de 24 h', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(draftExpired({ generatedAt: new Date(now - DRAFT_TTL_MS + 60000).toISOString() }, now)).toBe(false);
    expect(draftExpired({ generatedAt: new Date(now - DRAFT_TTL_MS - 60000).toISOString() }, now)).toBe(true);
    expect(draftExpired(null, now)).toBe(true);
  });
});
