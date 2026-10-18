import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Action « à faire avant la réunion R2 » : tant qu'elle n'est ni faite ni supprimée, la
// réunion R2 ne peut pas se tenir. Proposée aussi à la conclusion d'une réunion.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));

describe.skipIf(!harness.enabled)('actions à mener avant une réunion', () => {
  let openR1;
  let h, owner, pid, otherPid, r1, r2, todo, extractionPrompt;
  const agents = [{ id: 'a1', name: 'Léa', role: 'R', systemPrompt: '' }];
  const startMeeting = milestoneId => h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Réunion', intention: ['decision'], activeAgents: agents, milestoneId } });
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'avant@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon' } })).body.id;
    otherPid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Autre' } })).body.id;
    r1 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Choisir le local', type: 'decision' } })).body;
    r2 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Signer le bail', type: 'decision' } })).body;
    h.ai.responder = p => (sysText(p).includes('Tu extrais')
      ? (extractionPrompt = p.messages[0].content, { text: JSON.stringify({ decisions: [], actions: [{ title: 'Obtenir l’accord de la banque', beforeMeeting: 'R2' }, { title: 'Prévenir le voisinage', beforeMeeting: 'R9' }] }) })
      : { text: '## Compte-rendu' });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('action créée « avant R2 » ; réunion d’un autre projet refusée', async () => {
    const other = (await h.request('POST', `/api/projects/${otherPid}/milestones`, { token: owner.token, body: { title: 'X', type: 'decision' } })).body;
    expect((await h.request('POST', `/api/projects/${pid}/todos`, { token: owner.token, body: { title: 'Visiter', beforeMilestoneId: other.id } })).status).toBe(400);
    const r = await h.request('POST', `/api/projects/${pid}/todos`, { token: owner.token, body: { title: 'Faire relire le bail par un juriste', beforeMilestoneId: r2.id } });
    expect(r.status).toBe(201);
    todo = r.body;
    expect(todo.beforeMilestoneId).toBe(r2.id);
    const list = (await h.request('GET', `/api/projects/${pid}/actions`, { token: owner.token })).body;
    expect(list[0]).toMatchObject({ beforeMilestoneTitle: 'Signer le bail' });
    const { formatActionsForPrompt } = require('../services/actions');
    expect(formatActionsForPrompt(list)).toContain('AVANT la réunion « Signer le bail »');
  });

  it('R2 bloquée tant que l’action est ouverte (plan, détail, démarrage) ; R1 libre', async () => {
    const plan = (await h.request('GET', `/api/projects/${pid}/plan`, { token: owner.token })).body;
    expect(plan.milestones.find(m => m.id === r2.id).blockingActions).toEqual([{ id: todo.id, title: 'Faire relire le bail par un juriste' }]);
    expect(plan.milestones.find(m => m.id === r1.id).blockingActions).toEqual([]);
    expect((await h.request('GET', `/api/projects/${pid}/milestones/${r2.id}`, { token: owner.token })).body.blockingActions).toHaveLength(1);
    const blocked = await startMeeting(r2.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ kind: 'blocked', blockingActions: [{ title: 'Faire relire le bail par un juriste' }] });
    const r1Start = await startMeeting(r1.id);
    expect(r1Start.status).toBe(201);
    openR1 = r1Start.body.session;
    // Faite : la réunion peut se tenir (puis abandonnée : une seule réunion ouverte par étape, v5.1)
    await h.request('PATCH', `/api/projects/${pid}/todos/${todo.id}`, { token: owner.token, body: { status: 'done' } });
    const r2Start = await startMeeting(r2.id);
    expect(r2Start.status).toBe(201);
    await h.request('PATCH', `/api/projects/${pid}/sessions/${r2Start.body.session.id}/status`, { token: owner.token, body: { status: 'abandoned' } });
  });

  it('conclusion : « avant R2 » proposé par BlabIA (repère inconnu ignoré), puis enregistré', async () => {
    const s = openR1; // la réunion R1 déjà ouverte (une étape ne se rouvre pas en double)
    expect((await startMeeting(r1.id)).body).toMatchObject({ kind: 'already_open', openSessionId: openR1.id });
    await h.db('Session').where({ id: s.id }).update({ messages: JSON.stringify([{ id: 'm1', role: 'human', content: 'Il faut l’accord de la banque avant de signer.', timestamp: new Date().toISOString() }]) });
    const gen = (await h.request('POST', `/api/projects/${pid}/sessions/${s.id}/generate-deliverable`, { token: owner.token, body: {} })).body;
    expect(extractionPrompt).toContain('R2 « Signer le bail »');
    expect(extractionPrompt).not.toContain('R1 « Choisir le local »'); // la réunion en cours n'est pas une cible
    expect(gen.actionProposals.map(a => [a.title, a.beforeMilestoneId])).toEqual([['Obtenir l’accord de la banque', r2.id], ['Prévenir le voisinage', null]]);
    const created = (await h.request('POST', `/api/projects/${pid}/actions/from-session`, { token: owner.token, body: { sessionId: s.id, actions: gen.actionProposals } })).body;
    expect(created.find(a => a.title === 'Obtenir l’accord de la banque')).toBeTruthy();
    const row = await h.db('TodoItem').where({ projectId: pid, title: 'Obtenir l’accord de la banque' }).first();
    expect(row.beforeMilestoneId).toBe(r2.id);
    const again = await startMeeting(r2.id);
    expect(again.status).toBe(409);
    expect(again.body.kind).toBe('blocked');
  });

  it('réunion supprimée : l’action reste, sans condition', async () => {
    await h.request('DELETE', `/api/projects/${pid}/milestones/${r2.id}`, { token: owner.token });
    const row = await h.db('TodoItem').where({ projectId: pid, title: 'Obtenir l’accord de la banque' }).first();
    expect(row).toMatchObject({ status: 'todo', beforeMilestoneId: null });
  });
});
