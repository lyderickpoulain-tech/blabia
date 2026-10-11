import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Mémoire à deux étages : rien n'est perdu. Synthèse construite depuis l'historique,
// entrées anciennes fondues (pas supprimées), échec de l'IA sans perte, corrections de
// l'humain respectées, réunion supprimée retirée de la synthèse.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 100)); }
};
const SUMMARY = '## Contexte et objectifs\n- Site de numérologie sérieux (réunion 01/10/2026 « Lancement »)\n## Ce qui est établi\n- Budget 25 000 € (réunion 01/10/2026 « Lancement »)\n## Pistes écartées\n## Points ouverts\n## Travaux réalisés';

describe.skipIf(!harness.enabled)('mémoire du projet à deux étages', () => {
  let h, owner, pid;
  const entry = (id, title, ch) => `[SESSION:${id} | 01/10/2026 — ${title}]\n${ch.repeat(2500)}`;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'memoire@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Numérologie' } })).body.id;
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });
  const memory = async () => (await h.request('GET', `/api/projects/${pid}/memory`, { token: owner.token })).body;

  it('synthèse construite depuis l’historique ; les entrées anciennes y sont fondues, pas supprimées', async () => {
    // Une réunion déjà sortie de l'ancienne mémoire (perdue avant) + 3 entrées récentes trop longues
    const old = crypto.randomUUID();
    await h.db('Session').insert({ id: old, projectId: pid, task: 'Lancement', status: 'accepted', summary: 'Budget 25 000 €, site sérieux.', createdAt: new Date('2026-10-01') });
    await h.db('Project').where({ id: pid }).update({ context: [entry('a', 'Une', 'A'), entry('b', 'Deux', 'B'), entry('c', 'Trois', 'C')].join('\n---\n') });
    h.ai.responder = () => ({ text: SUMMARY });

    const r = await h.request('POST', `/api/projects/${pid}/memory/rebuild`, { token: owner.token, body: { fromScratch: true } });
    expect(r.status).toBe(200);
    expect(r.body.summary).toBe(SUMMARY);
    // 1er appel : l'historique perdu ; 2e : les entrées anciennes fondues
    const prompts = h.ai.calls.slice(-2).map(c => c.messages[0].content);
    expect(prompts[0]).toContain('Budget 25 000 €, site sérieux.');
    expect(prompts[1]).toContain('AAAA');
    expect(prompts[1]).toContain('BBBB');
    expect(prompts[1]).toContain('Ne PERDS aucune information utile');
    // Il ne reste que l'entrée la plus récente, telle quelle
    expect(r.body.recent).toBe(entry('c', 'Trois', 'C'));
  });

  it('IA en panne : aucune entrée retirée', async () => {
    const before = (await memory()).recent;
    await h.db('Project').where({ id: pid }).update({ context: [before, entry('d', 'Quatre', 'D'), entry('e', 'Cinq', 'E')].join('\n---\n') });
    h.ai.responder = () => { throw new Error('panne'); };
    await h.request('POST', `/api/projects/${pid}/memory/rebuild`, { token: owner.token, body: {} });
    const m = await memory();
    expect(m.recent).toContain('CCCC');
    expect(m.recent).toContain('DDDD');
    expect(m.summary).toBe(SUMMARY);
  });

  it('corrections de l’humain : enregistrées et respectées à la consolidation suivante', async () => {
    const fixed = SUMMARY.replace('25 000 €', '30 000 €');
    const r = await h.request('PUT', `/api/projects/${pid}/memory-summary`, { token: owner.token, body: { summary: fixed } });
    expect(r.body.editedAt).toBeTruthy();
    h.ai.responder = () => ({ text: fixed });
    await h.request('POST', `/api/projects/${pid}/memory/rebuild`, { token: owner.token, body: {} });
    const last = h.ai.calls.at(-1).messages[0].content;
    expect(last).toContain('30 000 €');
    expect(last).toContain('L\'humain a corrigé lui-même cette synthèse');
  });

  it('réunion supprimée déjà fondue dans la synthèse : elle en est retirée', async () => {
    const s = crypto.randomUUID();
    await h.db('Session').insert({ id: s, projectId: pid, task: 'Lancement bis', status: 'accepted', summary: 'x', createdAt: new Date('2026-10-02') });
    h.ai.responder = () => ({ text: SUMMARY });
    const calls = h.ai.calls.length;
    expect((await h.request('DELETE', `/api/projects/${pid}/sessions/${s}`, { token: owner.token })).status).toBe(200);
    const asked = await waitFor(() => h.ai.calls.slice(calls).find(c => String(c.messages[0].content).includes('a été supprimée')));
    expect(asked.messages[0].content).toContain('« Lancement bis (02/10/2026) »');
  });
});
