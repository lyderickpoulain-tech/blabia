import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Supprimer une réunion : elle disparaît aussi de ce que les agents retiennent (mémoire,
// registre des décisions, actions) ; l'étape du plan redevient « à tenir ».
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { withoutSession } = require('../utils/projectMemory');

describe('mémoire du projet', () => {
  it('retire le compte rendu d’une réunion, et lui seul', () => {
    const ctx = '[SESSION:a | 01/10/2026 — Une]\nCR une\n---\n[SESSION:b | 02/10/2026 — Deux]\nCR deux\n---\n[SESSION:c | 03/10/2026 — Trois]\nCR trois';
    expect(withoutSession(ctx, 'b')).toBe('[SESSION:a | 01/10/2026 — Une]\nCR une\n---\n[SESSION:c | 03/10/2026 — Trois]\nCR trois');
    expect(withoutSession(ctx, 'zz')).toBeNull();
    expect(withoutSession(null, 'a')).toBeNull();
  });
});

describe.skipIf(!harness.enabled)('suppression d’une réunion', () => {
  let h, owner, collaborator, projectId;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'proprio-suppr@test.local');
    collaborator = await h.createUser('member', 'collegue-suppr@test.local');
    projectId = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Suppression' } })).body.id;
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId, userId: collaborator.id });
  });
  afterAll(async () => { await h?.stop(); });

  const newMeeting = async (task, milestoneId) => {
    const s = (await h.request('POST', `/api/projects/${projectId}/sessions`, { token: owner.token,
      body: { task, intention: ['decision'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'Analyste', systemPrompt: '' }], ...(milestoneId ? { milestoneId } : {}) } })).body.session;
    await h.db('Session').where({ id: s.id }).update({ status: 'accepted', summary: `CR ${task}` });
    return s;
  };

  it('compte rendu, décisions et actions supprimés ; étape du plan à tenir ; propriétaire seulement', async () => {
    const [milestone] = await h.db('Milestone').insert({ projectId, title: 'Choisir le local', type: 'decision', status: 'done', displayOrder: 0 }).returning('*');
    const keep = await newMeeting('Garder');
    const drop = await newMeeting('Choisir le local', milestone.id);
    await h.db('Project').where({ id: projectId }).update({
      context: `[SESSION:${keep.id} | 01/10/2026 — Garder]\nCR garder\n---\n[SESSION:${drop.id} | 02/10/2026 — Choisir le local]\nLocal de la Croix-Rousse retenu`,
    });
    await h.db('Decision').insert([
      { projectId, sessionId: drop.id, statement: 'Local de la Croix-Rousse' },
      { projectId, sessionId: keep.id, statement: 'Ouverture au printemps' },
    ]);
    await h.db('TodoItem').insert([
      { id: crypto.randomUUID(), projectId, sessionId: drop.id, title: 'Visiter le local', status: 'todo', displayOrder: 0 },
      { id: crypto.randomUUID(), projectId, sessionId: keep.id, title: 'Appeler la banque', status: 'todo', displayOrder: 1 },
    ]);

    const url = `/api/projects/${projectId}/sessions/${drop.id}`;
    expect((await h.request('GET', `${url}/deletion`, { token: collaborator.token })).status).toBe(403);
    expect((await h.request('DELETE', url, { token: collaborator.token })).status).toBe(403);
    expect((await h.request('GET', `${url}/deletion`, { token: owner.token })).body).toEqual({ decisions: 1, actions: 1, devRunning: false });

    const r = await h.request('DELETE', url, { token: owner.token });
    expect(r.status).toBe(200);
    expect(await h.db('Session').where({ id: drop.id }).first()).toBeUndefined();
    const p = await h.db('Project').where({ id: projectId }).first();
    expect(p.context).toBe(`[SESSION:${keep.id} | 01/10/2026 — Garder]\nCR garder`);
    expect((await h.db('Decision').where({ projectId })).map(d => d.statement)).toEqual(['Ouverture au printemps']);
    expect((await h.db('TodoItem').where({ projectId })).map(t => t.title)).toEqual(['Appeler la banque']);
    expect((await h.db('Milestone').where({ id: milestone.id }).first()).status).toBe('pending');
  });

  it('refusée pendant que son développement tourne', async () => {
    const s = await newMeeting('Développer');
    await h.db('DevTask').insert({ projectId, sessionId: s.id, repo: 'moi/app', title: 'Dev', prompt: 'p', status: 'running' });
    expect((await h.request('GET', `/api/projects/${projectId}/sessions/${s.id}/deletion`, { token: owner.token })).body.devRunning).toBe(true);
    expect((await h.request('DELETE', `/api/projects/${projectId}/sessions/${s.id}`, { token: owner.token })).status).toBe(409);
    await h.db('DevTask').where({ sessionId: s.id }).update({ status: 'deployed' });
    expect((await h.request('DELETE', `/api/projects/${projectId}/sessions/${s.id}`, { token: owner.token })).status).toBe(200);
    expect((await h.db('DevTask').where({ projectId }).first()).sessionId).toBeNull(); // historique du développement conservé
  });
});
