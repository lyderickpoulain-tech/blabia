import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Question d'un agent confiée à un autre humain : « Laisser répondre @… » (une personne) ou
// « Laisser répondre quelqu'un » (un autre participant) ; la réunion attend sa réponse.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('question confiée à un autre participant', () => {
  let h, lea, max, zoe, pid, sid, soloSid;
  const card = (id, question) => ({ id, role: 'system', type: 'decision', agentName: 'Stratège', question, choices: ['Oui', 'Non'], status: 'pending', timestamp: new Date().toISOString() });
  const msgOf = async (s, id) => {
    const { messages } = await h.db('Session').where({ id: s }).first();
    return (typeof messages === 'string' ? JSON.parse(messages) : messages).find(m => m.id === id);
  };
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    lea = await h.createUser('member', 'lea@asso.local');
    max = await h.createUser('member', 'max@asso.local');
    zoe = await h.createUser('member', 'zoe@asso.local');
    await h.db('User').where({ id: max.id }).update({ username: 'max' });
    pid = (await h.request('POST', '/api/projects', { token: lea.token, body: { name: 'Association' } })).body.id;
    for (const email of ['max@asso.local', 'zoe@asso.local']) await h.request('POST', `/api/projects/${pid}/members`, { token: lea.token, body: { email } });
    const agents = [{ id: 'a1', name: 'Stratège', role: 'R', systemPrompt: '' }];
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: lea.token, body: { task: 'Budget de la fête', intention: ['decision'], activeAgents: agents } })).body.session.id;
    await h.db('Session').where({ id: sid }).update({ messages: JSON.stringify([card('q1', 'Quel budget pour la salle ?'), card('q2', 'Quelle date ?')]) });
    const solo = (await h.request('POST', '/api/projects', { token: lea.token, body: { name: 'Solo' } })).body.id;
    soloSid = (await h.request('POST', `/api/projects/${solo}/sessions`, { token: lea.token, body: { task: 'x', intention: ['decision'], activeAgents: agents } })).body.session.id;
    await h.db('Session').where({ id: soloSid }).update({ messages: JSON.stringify([card('s1', 'Q ?')]) });
    h.solo = solo;
  });
  afterAll(async () => { await h?.stop(); });

  it('participants : propriétaire et membres, sans e-mail', async () => {
    const r = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}/participants`, { token: lea.token })).body;
    expect(r).toEqual([
      { userId: lea.id, name: 'lea', isYou: true },
      { userId: max.id, name: 'max', isYou: false },
      { userId: zoe.id, name: 'zoe', isYou: false },
    ]);
  });

  it('« Laisser répondre @max » : seul max (ou Léa) répond ; sa réponse lui est attribuée', async () => {
    const a = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/assign-decision`, { token: lea.token, body: { messageId: 'q1', userId: max.id } });
    expect(a.body.message).toMatchObject({ status: 'awaiting_human', assignedTo: max.id, assignedToName: 'max', assignedBy: lea.id, assignedByName: 'lea' });
    const zoeTry = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: zoe.token, body: { messageId: 'q1', answer: 'Oui', status: 'answered' } });
    expect(zoeTry.status).toBe(403);
    expect(zoeTry.body.error).toContain('max');
    const ok = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: max.token, body: { messageId: 'q1', answer: '800 €', status: 'answered' } });
    expect(ok.status).toBe(200);
    expect(ok.body.message).toMatchObject({ status: 'answered', answer: '800 €', answeredBy: max.id, answeredByName: 'max' });
    expect(ok.body.systemMessage.content).toContain('(réponse de max)');
  });

  it('« Laisser répondre quelqu’un » : n’importe quel autre participant ; reprise par Léa', async () => {
    const a = (await h.request('POST', `/api/projects/${pid}/sessions/${sid}/assign-decision`, { token: lea.token, body: { messageId: 'q2', userId: null } })).body.message;
    expect(a).toMatchObject({ status: 'awaiting_human', assignedTo: null });
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/assign-decision`, { token: lea.token, body: { messageId: 'q2', userId: 'inconnu' } })).status).toBe(400);
    const back = (await h.request('POST', `/api/projects/${pid}/sessions/${sid}/assign-decision`, { token: lea.token, body: { messageId: 'q2', cancel: true } })).body.message;
    expect(back.status).toBe('pending');
    expect(back.assignedTo).toBeUndefined();
    await h.request('POST', `/api/projects/${pid}/sessions/${sid}/assign-decision`, { token: lea.token, body: { messageId: 'q2', userId: null } });
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: zoe.token, body: { messageId: 'q2', answer: 'Samedi', status: 'answered' } })).status).toBe(200);
    expect(await msgOf(sid, 'q2')).toMatchObject({ answer: 'Samedi', answeredByName: 'zoe' });
    // Déjà répondue : ne peut plus être confiée
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/assign-decision`, { token: lea.token, body: { messageId: 'q2', userId: max.id } })).status).toBe(409);
  });

  it('projet solo : personne à qui confier ; réponse sans attribution', async () => {
    expect((await h.request('POST', `/api/projects/${h.solo}/sessions/${soloSid}/assign-decision`, { token: lea.token, body: { messageId: 's1', userId: null } })).status).toBe(409);
    const r = await h.request('POST', `/api/projects/${h.solo}/sessions/${soloSid}/answer-decision`, { token: lea.token, body: { messageId: 's1', answer: 'Oui', status: 'answered' } });
    expect(r.body.message.answeredByName).toBeUndefined();
    expect(r.body.systemMessage.content).not.toContain('réponse de');
  });
});
