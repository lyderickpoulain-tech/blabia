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
    h.ai.responder = p => ((Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || '')).includes('sous-agent de BlabIA')
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

  it('rapport prêt : en attente du choix de l’humain, puis intégré au projet (action cochée, mission retirée)', async () => {
    const action = await waitFor(async () => {
      const list = (await h.request('GET', `/api/projects/${pid}/actions`, { token: owner.token })).body;
      const a = list.find(x => x.id === actionId);
      return a?.mission?.status === 'done' ? a : null;
    });
    expect(action.mission).toMatchObject({ agentName: 'Juriste', status: 'done', outcome: null });
    expect(action.status).toBe('in_progress');
    // Pas encore intégré : document inactif, mémoire inchangée
    const doc = await h.db('ProjectDocument').where({ id: action.mission.documentId }).first();
    expect(doc.enabled).toBe(false);
    expect((await h.db('Project').where({ id: pid }).first()).context || '').not.toContain('[MISSION:');
    // « Intégrer le CR au projet »
    const r = await h.request('POST', `/api/projects/${pid}/missions/${action.mission.id}/outcome`, { token: owner.token, body: { outcome: 'integrated' } });
    expect(r.status).toBe(200);
    expect(r.body.outcome).toBe('integrated');
    expect((await h.db('ProjectDocument').where({ id: action.mission.documentId }).first()).enabled).toBe(true);
    const { context } = await h.db('Project').where({ id: pid }).first();
    expect(context).toMatch(/^\[MISSION:[0-9a-f-]+ \| \d\d\/\d\d\/\d{4} — Mission « Vérifier si la démo célébrités pose un problème légal ou d’image » menée pour Juriste\]/);
    expect(context).toContain('Risque faible si les dates sont publiques et l’usage non commercial.\nAjouter une mention.');
    expect((await h.db('TodoItem').where({ id: actionId }).first()).status).toBe('done');
    const after = (await h.request('GET', `/api/projects/${pid}/actions`, { token: owner.token })).body.find(x => x.id === actionId);
    expect(after.mission).toBeNull();
    // Déjà traité : refusé ; pas de nouvelle mission sur une action faite
    expect((await h.request('POST', `/api/projects/${pid}/missions/${action.mission.id}/outcome`, { token: owner.token, body: { outcome: 'discarded' } })).status).toBe(409);
    expect((await h.request('POST', `/api/projects/${pid}/actions/${actionId}/mission`, { token: owner.token, body: { agentName: 'Juriste' } })).status).toBe(409);
  });

  it('« Ne pas intégrer » : document retiré, action toujours à faire, rapport plus transmis', async () => {
    const todo = crypto.randomUUID();
    await h.db('TodoItem').insert({ id: todo, projectId: pid, title: 'Comparer les hébergeurs', status: 'todo', displayOrder: 9 });
    const docId = crypto.randomUUID();
    await h.db('ProjectDocument').insert({ id: docId, projectId: pid, name: 'Mission — Hébergeurs', content: 'x', charCount: 1, enabled: false });
    const [m] = await h.db('AgentMission').insert({ projectId: pid, todoId: todo, agentName: 'Juriste', kind: 'research', title: 'Hébergeurs', objective: 'o', status: 'done', report: '# Rapport hors sujet', documentId: docId }).returning('*');
    const r = await h.request('POST', `/api/projects/${pid}/missions/${m.id}/outcome`, { token: owner.token, body: { outcome: 'discarded' } });
    expect(r.status).toBe(200);
    expect(await h.db('ProjectDocument').where({ id: docId }).first()).toBeUndefined();
    expect((await h.db('TodoItem').where({ id: todo }).first()).status).toBe('todo');
    const { actionForPrompt } = require('../services/actions');
    expect(await actionForPrompt(todo, pid)).not.toContain('Rapport hors sujet');
    expect((await h.request('POST', `/api/projects/${pid}/missions/${m.id}/outcome`, { token: owner.token, body: { outcome: 'autre' } })).status).toBe(400);
  });

  it('« Traiter en réunion » : action et rapport complet transmis aux agents ; action cochée à la conclusion', async () => {
    const { actionForPrompt } = require('../services/actions'); // après harness.start() : base de test
    const todo = crypto.randomUUID();
    await h.db('TodoItem').insert({ id: todo, projectId: pid, title: 'Rédiger la page Méthode', description: 'Ton sérieux', status: 'in_progress', displayOrder: 5 });
    await h.db('AgentMission').insert({ projectId: pid, todoId: todo, agentName: 'Juriste', kind: 'writing', title: 'Rédiger la page Méthode', objective: 'o', status: 'done', report: '# Page Méthode\n## Synthèse\nBrouillon complet ci-dessous.\n## Texte\nLa numérologie ici est un outil de dialogue.' });
    // Session liée à l'action ; une action d'un autre projet ou déjà faite est ignorée
    const s = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
      body: { task: 'Rédiger la page Méthode', intention: ['decision'], todoId: todo, activeAgents: [{ id: 'a1', name: 'Léa', role: 'Rédactrice', systemPrompt: '' }] } })).body.session;
    expect((await h.db('Session').where({ id: s.id }).first()).todoId).toBe(todo);
    const other = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
      body: { task: 'x', intention: ['decision'], todoId: crypto.randomUUID(), activeAgents: [{ id: 'a1', name: 'Léa', role: 'R', systemPrompt: '' }] } })).body.session;
    expect((await h.db('Session').where({ id: other.id }).first()).todoId).toBeNull();

    const text = await actionForPrompt(todo, pid);
    expect(text).toContain('« Rédiger la page Méthode » — Ton sérieux');
    expect(text).toContain('RAPPORT DE LA MISSION MENÉE POUR Juriste');
    expect(text).toContain('La numérologie ici est un outil de dialogue.'); // rapport complet, pas seulement la synthèse

    // Abandon : l'action reste à faire ; conclusion : elle est cochée
    await h.request('PATCH', `/api/projects/${pid}/sessions/${other.id}/status`, { token: owner.token, body: { status: 'abandoned' } });
    expect((await h.request('PATCH', `/api/projects/${pid}/sessions/${s.id}/status`, { token: owner.token, body: { status: 'accepted' } })).status).toBe(200);
    expect((await h.db('TodoItem').where({ id: todo }).first()).status).toBe('done');
  });
});
