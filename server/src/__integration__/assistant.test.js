import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Bras droit (v5.1, 16/10/2026, étape 1) : conversation en tête-à-tête, par projet et par
// personne ; connaissance du projet en cache ; sources et réunion proposée ; IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('bras droit', () => {
  let h, owner, member, pid, r1, r2;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'brasdroit@test.local');
    member = await h.createUser('member', 'membre@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Noël CSE' } })).body.id;
    await h.db('Project').where({ id: pid }).update({ brief: 'OBJECTIF : Choisir 5 jeux par tranche d’âge, 30 € par enfant.' });
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: member.id, role: 'member' }).catch(() => {});
    r1 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Retenir les jeux', type: 'decision' } })).body;
    r2 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Valider la liste', type: 'decision' } })).body;
    await h.db('Milestone').where({ id: r1.id }).update({ status: 'done' });
    await h.db('Session').insert({ id: crypto.randomUUID(), projectId: pid, task: 'Retenir les jeux', status: 'accepted', mode: 'meeting', summary: '3-5 ans : cinq jeux retenus.', createdAt: new Date('2026-10-09') });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('répond avec la connaissance du projet, ses sources et la réunion à venir proposée', async () => {
    h.ai.responder = () => ({ text: 'La liste des 3-5 ans est prête.\n[SOURCES:["Réunion « Retenir les jeux », 9 oct."]]\n[MEETING:R2]' });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'On en est où ?' } });
    expect(r.status).toBe(200);
    expect(r.body.reply).toMatchObject({
      role: 'assistant', content: 'La liste des 3-5 ans est prête.',
      sources: ['Réunion « Retenir les jeux », 9 oct.'],
      proposal: { ref: 'R2', milestoneId: r2.id, title: 'Valider la liste' },
    });
    const call = h.ai.calls[calls];
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.system[0].text).toContain('3-5 ans : cinq jeux retenus.');
    expect(call.system[0].text).toContain('R2 — Valider la liste — à venir');
    expect(call.system[0].text).toContain('POSTURE');
    expect(call.messages).toEqual([{ role: 'user', content: 'On en est où ?' }]);
  });

  it('la conversation continue (historique) ; une réunion déjà tenue n’est pas proposée', async () => {
    h.ai.responder = () => ({ text: 'Le budget est de 30 € par enfant.\n[MEETING:R1]' });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Et le budget ?' } });
    expect(r.body.reply.proposal).toBeNull();
    expect(r.body.reply.sources).toEqual([]);
    expect(h.ai.calls[calls].messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(h.ai.calls[calls].messages[1].content).toBe('La liste des 3-5 ans est prête.');
    const list = (await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages;
    expect(list.map(m => m.role)).toEqual(['human', 'assistant', 'human', 'assistant']);
  });

  it('une conversation par personne ; effacer ne touche que la sienne', async () => {
    expect((await h.request('GET', `/api/projects/${pid}/assistant`, { token: member.token })).body.messages).toEqual([]);
    expect((await h.request('DELETE', `/api/projects/${pid}/assistant`, { token: owner.token })).status).toBe(200);
    expect((await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages).toEqual([]);
    expect((await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: '' } })).status).toBe(400);
  });
});
