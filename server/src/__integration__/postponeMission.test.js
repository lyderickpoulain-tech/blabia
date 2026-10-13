import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Pas de mission qui tourne pendant une réunion : la lancer REPORTE la réunion ; une réunion
// « Reprendre : … » est insérée juste après au plan, bloquée jusqu'au rapport, puis tenue
// avec lui (objectif, décisions et échanges d'origine + rapport complet).
const require = createRequire(import.meta.url);
const harness = require('./harness');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 100)); }
};

describe.skipIf(!harness.enabled)('mission en réunion : la réunion est reportée', () => {
  let h, owner, pid, r1, r2, sid, missionId, resume;
  const agents = [{ id: 'a1', name: 'Léa', role: 'Juriste', systemPrompt: '' }];
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'report@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon' } })).body.id;
    r1 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Choisir le statut juridique', type: 'decision' } })).body;
    r2 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Ouvrir le compte en banque', type: 'decision' } })).body;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir le statut juridique', intention: ['decision'], activeAgents: agents, milestoneId: r1.id } })).body.session.id;
    await h.db('Session').where({ id: sid }).update({ messages: JSON.stringify([
      { id: 'm1', role: 'human', content: 'SAS ou micro-entreprise ?', timestamp: new Date().toISOString() },
      { id: 'm2', role: 'agent', agentName: 'Léa', content: 'Il faut comparer les charges sociales réelles.', timestamp: new Date().toISOString() },
      { id: 'q1', role: 'system', type: 'decision', agentName: 'Léa', question: 'Associés ?', status: 'answered', answer: 'Seule' },
    ]) });
    missionId = crypto.randomUUID();
    await h.db('AgentMission').insert({ id: missionId, projectId: pid, sessionId: sid, agentName: 'Léa', kind: 'analysis', title: 'Comparer SAS et micro', objective: 'Charges sociales sur 3 ans', status: 'proposed' });
    // Premier essai de la mission en échec : la reprise reste bloquée tant que le rapport manque
    h.ai.responder = p => { if (sysText(p).includes('sous-agent de BlabIA')) throw new Error('panne simulée'); return { text: 'ok' }; };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('lancer la mission reporte la réunion ; reprise insérée juste après R1, bloquée', async () => {
    const r = await h.request('POST', `/api/projects/${pid}/missions/${missionId}/approve`, { token: owner.token, body: { level: 'light' } });
    expect(r.status).toBe(200);
    expect(r.body.postponed.milestoneTitle).toBe('Reprendre : Choisir le statut juridique');
    expect((await h.db('Session').where({ id: sid }).first()).status).toBe('postponed');
    const plan = (await h.request('GET', `/api/projects/${pid}/plan`, { token: owner.token })).body.milestones;
    expect(plan.map(m => [m.title, m.status])).toEqual([
      ['Choisir le statut juridique', 'done'], ['Reprendre : Choisir le statut juridique', 'pending'], ['Ouvrir le compte en banque', 'pending']]);
    resume = plan[1];
    expect(resume.blockingActions).toEqual([{ id: r.body.todoId, title: 'Mission « Comparer SAS et micro » (Léa)' }]);
    // Réunion reportée : plus de discussion possible
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/chat`, { token: owner.token, body: { message: 'encore ?' } })).status).toBe(400);
    await waitFor(async () => (await h.db('AgentMission').where({ id: missionId }).first()).status === 'failed');
    expect((await h.db('TodoItem').where({ id: r.body.todoId }).first()).status).toBe('in_progress');
    expect((await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Reprise', intention: ['decision'], activeAgents: agents, milestoneId: resume.id } })).status).toBe(409);
  });

  it('rapport prêt : action cochée, reprise tenue avec le contexte d’origine et le rapport complet', async () => {
    h.ai.responder = p => (sysText(p).includes('sous-agent de BlabIA')
      ? { text: '# Comparatif\n## Synthèse\nLa micro-entreprise coûte moins jusqu’à 40 k€.' }
      : { text: 'ok' });
    // Relance de la mission échouée : pas de nouveau report (la réunion l'est déjà)
    const again = (await h.request('POST', `/api/projects/${pid}/missions/${missionId}/approve`, { token: owner.token, body: { level: 'light' } })).body;
    expect(again.postponed).toBeUndefined();
    await waitFor(async () => (await h.db('AgentMission').where({ id: missionId }).first()).status === 'done');
    const todo = await h.db('TodoItem').where({ id: (await h.db('AgentMission').where({ id: missionId }).first()).todoId }).first();
    expect(todo).toMatchObject({ status: 'done', source: 'mission' });
    const s2 = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Reprendre : Choisir le statut juridique', intention: ['decision'], activeAgents: agents, milestoneId: resume.id } }));
    expect(s2.status).toBe(201);
    expect((await h.db('Session').where({ id: s2.body.session.id }).first()).todoId).toBe(todo.id);
    // Prompt des agents : section de reprise et rapport de mission
    const { resumeTextFor } = require('../services/missions');
    const text = await resumeTextFor(resume.id);
    expect(text).toContain('« Choisir le statut juridique »');
    expect(text).toContain('- Associés ? → Seule');
    expect(text).toContain('Léa : Il faut comparer les charges sociales réelles.');
    const { actionForPrompt } = require('../services/actions');
    expect(await actionForPrompt(todo.id, pid)).toContain('La micro-entreprise coûte moins jusqu’à 40 k€.');
  });
});
