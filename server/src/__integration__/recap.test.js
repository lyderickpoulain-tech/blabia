import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Récapitulatif du projet (plan terminé) et réglages recommandés au démarrage d'une réunion
// (v5.1, 15/10/2026), avec une IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('récapitulatif du projet et réglages recommandés', () => {
  let h, owner, pid;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'recap@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Noël CSE' } })).body.id;
    await h.db('Project').where({ id: pid }).update({ brief: 'OBJECTIF : Choisir 5 jeux par tranche d’âge pour le Noël du CSE, budget 30 € par enfant.' });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('aucune réunion conclue : rien à récapituler', async () => {
    expect((await h.request('GET', `/api/projects/${pid}/recap`, { token: owner.token })).body).toBeNull();
    expect((await h.request('POST', `/api/projects/${pid}/recap`, { token: owner.token })).status).toBe(409);
  });

  it('rédigé à partir des objectifs, du registre et de tous les comptes rendus ; rangé dans les documents, remplacé à la régénération', async () => {
    await h.db('Session').insert([
      { id: require('crypto').randomUUID(), projectId: pid, task: 'Critères', status: 'accepted', mode: 'meeting', summary: 'Critères : sécurité, prix < 30 €.', createdAt: new Date('2026-10-01') },
      { id: require('crypto').randomUUID(), projectId: pid, task: 'Liste finale', status: 'accepted', mode: 'meeting', summary: '3-5 ans : Dobble Kids, Halli Galli Junior.', createdAt: new Date('2026-10-05') },
    ]);
    let n = 0;
    h.ai.responder = () => ({ text: `## Objectif de départ\nChoisir des jeux.\n## Résultat\nVersion ${++n}` });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/recap`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.content).toContain('Version 1');
    const prompt = h.ai.calls[calls].messages[0].content;
    expect(prompt).toContain('Choisir 5 jeux par tranche d’âge');
    expect(prompt.indexOf('Critères : sécurité')).toBeLessThan(prompt.indexOf('3-5 ans : Dobble Kids'));
    expect(prompt).toContain('## Réponse aux objectifs');
    await h.request('POST', `/api/projects/${pid}/recap`, { token: owner.token });
    const docs = await h.db('ProjectDocument').where({ projectId: pid, name: 'Récapitulatif du projet' });
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toContain('Version 2');
    expect((await h.request('GET', `/api/projects/${pid}/recap`, { token: owner.token })).body.content).toContain('Version 2');
  });

  it('démarrage d’une réunion : modèle et recherche web recommandés selon l’objectif (même appel)', async () => {
    h.ai.responder = () => ({ text: JSON.stringify({ existingSelected: [], newAgentSuggestion: null, settings: { model: 'opus', modelReason: 'Arbitrage structurant', webSearch: true, webReason: 'Prix des jeux à vérifier' } }) });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/sessions/suggest-agents`, { token: owner.token, body: { task: 'Comparer les prix des jeux' } });
    expect(h.ai.calls.length - calls).toBe(1);
    expect(r.body.recommended).toEqual({ model: 'claude-opus-5-5', modelReason: 'Arbitrage structurant', webSearch: true, webReason: 'Prix des jeux à vérifier' });
    h.ai.responder = () => ({ text: JSON.stringify({ existingSelected: [], newAgentSuggestion: null }) });
    expect((await h.request('POST', `/api/projects/${pid}/sessions/suggest-agents`, { token: owner.token, body: { task: 'Organiser' } })).body.recommended)
      .toMatchObject({ model: 'claude-sonnet-5-5', webSearch: false });
  });
});
