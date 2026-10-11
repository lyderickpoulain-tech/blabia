import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Page Actions : confier une action à un agent (mission). Cas réel : « Vérifier si la démo
// célébrités pose un problème légal ou d'image » (Site de numérologie).
const require = createRequire(import.meta.url);
const harness = require('./harness');

const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 100)); }
};

describe.skipIf(!harness.enabled)('mission confiée depuis une action', () => {
  let h, owner, pid, actionId;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'actions-mission@test.local');
    h.ai.responder = p => (typeof p.system === 'string' && p.system.includes('sous-agent de BlabIA')
      ? { usage: { input_tokens: 1500, output_tokens: 600 }, content: [{ type: 'text', text: '# Démo célébrités\n## Synthèse\nRisque faible si les dates sont publiques et l’usage non commercial.\n## Recommandation\nAjouter une mention.' }] }
      : { text: 'ok' });
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Numérologie' } })).body.id;
    await h.db('Agent').insert({ id: crypto.randomUUID(), name: 'Juriste', role: 'Droit du numérique et de l’image', systemPrompt: '', isDefault: true });
    actionId = crypto.randomUUID();
    await h.db('TodoItem').insert({ id: actionId, projectId: pid, title: 'Vérifier si la démo célébrités pose un problème légal ou d’image', description: 'Dates de naissance de personnalités', status: 'todo', displayOrder: 0 });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('agent du projet obligatoire ; mission lancée, action « en cours » ; une seule à la fois', async () => {
    const url = `/api/projects/${pid}/actions/${actionId}/mission`;
    expect((await h.request('POST', url, { token: owner.token, body: { agentName: 'Inconnu', kind: 'research' } })).status).toBe(400);
    const r = await h.request('POST', url, { token: owner.token, body: { agentName: 'Juriste', kind: 'research', level: 'light', deliverable: 'Une note avec les risques' } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ todoId: actionId, agentName: 'Juriste', kind: 'research', level: 'light', budgetUSD: 0.25, status: 'queued',
      objective: 'Vérifier si la démo célébrités pose un problème légal ou d’image\nDates de naissance de personnalités' });
    expect((await h.db('TodoItem').where({ id: actionId }).first()).status).toBe('in_progress');
  });

  it('rapport prêt : visible sur l’action, rangé dans les documents', async () => {
    const action = await waitFor(async () => {
      const list = (await h.request('GET', `/api/projects/${pid}/actions`, { token: owner.token })).body;
      const a = list.find(x => x.id === actionId);
      return a?.mission?.status === 'done' ? a : null;
    });
    expect(action.mission).toMatchObject({ agentName: 'Juriste', status: 'done' });
    expect(action.mission.documentId).toBeTruthy();
    expect(action.status).toBe('in_progress'); // l'humain coche l'action une fois satisfait
    // Mémoire du projet : la synthèse et la recommandation, relues par les agents en réunion
    const { context } = await h.db('Project').where({ id: pid }).first();
    expect(context).toMatch(/^\[MISSION:[0-9a-f-]+ \| \d\d\/\d\d\/\d{4} — Mission « Vérifier si la démo célébrités pose un problème légal ou d’image » menée pour Juriste\]/);
    expect(context).toContain('Risque faible si les dates sont publiques et l’usage non commercial.\nAjouter une mention.');
    expect(context).toContain('(Rapport complet : document « Mission — Vérifier si la démo');
    // Nouvelle mission possible une fois la précédente terminée ; pas sur une action faite
    await h.db('TodoItem').where({ id: actionId }).update({ status: 'done' });
    expect((await h.request('POST', `/api/projects/${pid}/actions/${actionId}/mission`, { token: owner.token, body: { agentName: 'Juriste' } })).status).toBe(409);
  });
});
