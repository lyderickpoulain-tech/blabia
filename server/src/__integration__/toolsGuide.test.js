import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Guide de mise en place (routes /tools/guide) avec une IA SIMULÉE : étiquette de vérification,
// confirmation avant d'écraser un guide vérifié, brouillon (force / refus / expiration),
// coût journalisé à chaque relance, discussion sous le guide.

const require = createRequire(import.meta.url);
const harness = require('./harness');

const searches = (n, id = 'a') => Array.from({ length: n }, (_, i) => [
  { type: 'server_tool_use', id: `srv_${id}${i}`, name: 'web_search', input: { query: `q${i}` } },
  { type: 'web_search_tool_result', tool_use_id: `srv_${id}${i}`, content: [{ type: 'web_search_result', url: `https://ex.fr/${id}${i}`, title: `Page ${id}${i}` }] },
]).flat();
const VERIFIED = { content: [...searches(2), { type: 'text', text: '## Étape 1 — Guide vérifié' }], usage: { server_tool_use: { web_search_requests: 2 } } };
const UNCHECKED = { text: '## Étape 1 — Guide non vérifié' };

describe.skipIf(!harness.enabled)('guide de mise en place (IA simulée)', () => {
  let h, owner, pid;
  const guideUrl = () => `/api/projects/${pid}/tools/guide`;
  const post = body => h.request('POST', guideUrl(), { token: owner.token, body });
  const row = async () => (await h.db('Project').where({ id: pid }))[0];
  let next = UNCHECKED;
  const callsBefore = () => h.ai.calls.length;

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'guide@test.local');
    h.ai.responder = () => next;
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon de thé', objectif: 'Ouvrir un salon de thé.' } })).body.id;
    await h.db('Project').where({ id: pid }).update({
      tools: JSON.stringify([{ id: 't1', name: 'Railway', category: 'hosting', status: 'validated', origin: 'mine' }]),
    });
  });
  afterAll(async () => { await h?.stop(); });

  it('premier guide vérifié : étiquette et sources enregistrées', async () => {
    next = VERIFIED;
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body.check).toMatchObject({ status: 'verified', searches: 2 });
    expect(res.body.check.sources).toHaveLength(2);
    const p = await row();
    expect(p.toolsGuide).toContain('Guide vérifié');
    expect(p.toolsGuideCheck.status).toBe('verified');
  });

  it('409 : un guide non vérifié ne remplace pas un guide vérifié (brouillon conservé)', async () => {
    next = UNCHECKED;
    const res = await post({});
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ needsConfirmation: true, previous: { status: 'verified' }, next: { status: 'not_searched' } });
    const p = await row();
    expect(p.toolsGuide).toContain('Guide vérifié');
    expect(p.toolsGuideDraft.text).toContain('non vérifié');
  });

  it('force: true promeut le brouillon SANS nouvel appel à l\'IA', async () => {
    const before = callsBefore();
    const res = await post({ force: true });
    expect(res.status).toBe(200);
    expect(res.body.check.status).toBe('not_searched');
    expect(callsBefore()).toBe(before);
    const p = await row();
    expect(p.toolsGuide).toContain('non vérifié');
    expect(p.toolsGuideDraft).toBeNull();
  });

  it('force: true sans brouillon : erreur claire', async () => {
    const res = await post({ force: true });
    expect(res.status).toBe(404);
  });

  it('refus : le brouillon est supprimé, l\'ancien guide reste intact', async () => {
    next = VERIFIED;
    await post({});                                   // guide vérifié en place
    next = UNCHECKED;
    expect((await post({})).status).toBe(409);        // brouillon
    const res = await h.request('DELETE', `${guideUrl()}/draft`, { token: owner.token });
    expect(res.status).toBe(200);
    const p = await row();
    expect(p.toolsGuideDraft).toBeNull();
    expect(p.toolsGuide).toContain('Guide vérifié');
    expect(p.toolsGuideCheck.status).toBe('verified');
  });

  it('brouillon expiré (24 h) : refusé et écarté', async () => {
    expect((await post({})).status).toBe(409);
    const p = await row();
    const old = { ...p.toolsGuideDraft, generatedAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString() };
    await h.db('Project').where({ id: pid }).update({ toolsGuideDraft: JSON.stringify(old) });
    const before = callsBefore();
    const res = await post({ force: true });
    expect(res.status).toBe(410);
    expect(callsBefore()).toBe(before);
    const after = await row();
    expect(after.toolsGuideDraft).toBeNull();
    expect(after.toolsGuide).toContain('Guide vérifié');
  });

  it('guide ancien (étiquette NULL) : « à vérifier », remplacé sans confirmation', async () => {
    await h.db('Project').where({ id: pid }).update({ toolsGuideCheck: null });
    const read = await h.request('GET', `/api/projects/${pid}/tools`, { token: owner.token });
    expect(read.body.guide.check).toBeNull();
    next = UNCHECKED;
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body.check.status).toBe('not_searched');
  });

  it('relance sur pause_turn : une ligne UsageLog par appel, même kind, budget cumulé', async () => {
    await h.db('UsageLog').del();
    const queue = [
      { stop_reason: 'pause_turn', content: searches(5, 'p'), usage: { server_tool_use: { web_search_requests: 5 } } },
      { content: [...searches(3, 'q'), { type: 'text', text: '## Guide final' }], usage: { server_tool_use: { web_search_requests: 3 } } },
    ];
    h.ai.responder = () => queue.shift();
    const before = callsBefore();
    const res = await post({});
    expect(res.status).toBe(200);
    expect(res.body.check).toMatchObject({ status: 'verified', searches: 8 });
    expect(h.ai.calls[before + 1].tools[0].max_uses).toBe(3);
    await new Promise(r => setTimeout(r, 300)); // journalisation sans attendre
    const logs = await h.db('UsageLog').where({ projectId: pid });
    expect(logs).toHaveLength(2);
    expect(new Set(logs.map(l => l.kind))).toEqual(new Set(['tools/guide']));
    expect(logs.map(l => l.webSearches).sort()).toEqual([3, 5]);
  });

  it('discussion : chaque réponse porte son étiquette ; les anciens messages n\'en ont pas', async () => {
    await h.db('Project').where({ id: pid }).update({ toolsGuideChat: JSON.stringify([{ role: 'assistant', content: 'Ancien message', at: '2026-01-01T00:00:00Z' }]) });
    h.ai.responder = () => ({ content: [...searches(1, 'c'), { type: 'text', text: 'Voici la correction.' }], usage: { server_tool_use: { web_search_requests: 1 } } });
    const before = callsBefore();
    const res = await h.request('POST', `${guideUrl()}/chat`, { token: owner.token, body: { message: 'Erreur de build' } });
    expect(res.status).toBe(200);
    const [old, , answer] = res.body.chat;
    expect(old.check).toBeUndefined();
    expect(answer.check).toMatchObject({ status: 'verified', searches: 1 });
    expect(h.ai.calls[before].tools[0].max_uses).toBe(3);
  });
});
