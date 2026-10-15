import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// « À trancher » (v5.1, 16/10/2026) : tout ce qui attend l'humain, en un seul endroit, et le
// dernier message du bras droit (son retour proactif). IA simulée pour le bras droit.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('à trancher', () => {
  let h, owner, other, pid, sid;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'inbox@test.local');
    other = await h.createUser('member', 'inbox2@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Noël CSE' } })).body.id;
    sid = crypto.randomUUID();
    await h.db('Session').insert({ id: sid, projectId: pid, task: 'Valider la liste', status: 'open', mode: 'meeting', createdAt: new Date(),
      delegation: JSON.stringify({ by: owner.id, status: 'done', reviewed: false, note: { headline: 'Liste prête.', decided: [{ id: 'c1' }] } }),
      messages: JSON.stringify([
        { id: 'c1', role: 'system', type: 'decision', agentName: 'Léa', question: 'Format ?', choices: ['PDF', 'Autre (précise)'], status: 'answered', answer: 'PDF', decidedByDelegate: true },
        { id: 'c2', role: 'system', type: 'decision', agentName: 'Léa', question: 'Quel budget par enfant ?', choices: ['30 €', '40 €', 'Autre (précise)'], status: 'pending', reservedForHuman: true },
        { id: 'c3', role: 'system', type: 'decision', agentName: 'Max', question: 'Livraison ?', choices: ['Oui', 'Non'], status: 'awaiting_human', assignedTo: other.id, assignedBy: owner.id },
      ]) });
    await h.db('AgentMission').insert({ projectId: pid, agentName: 'Léa', title: 'Prix', objective: 'o', status: 'done', report: '# Prix' });
    await h.db('Decision').insert({ id: crypto.randomUUID(), projectId: pid, statement: 'Budget 30 €', status: 'reopened', origin: 'human' });
    await h.db('TodoItem').insert({ id: crypto.randomUUID(), projectId: pid, title: 'Appeler le fournisseur', status: 'todo', dueDate: new Date('2026-01-01'), displayOrder: 0 });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('rassemble questions, note du bras droit, compte rendu, décision remise en question, retard', async () => {
    const r = await h.request('GET', `/api/projects/${pid}/assistant/inbox`, { token: owner.token });
    expect(r.status).toBe(200);
    const kinds = r.body.items.map(i => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['delegation_note', 'question', 'mission_report', 'decision_reopened', 'actions_late']));
    const q = r.body.items.filter(i => i.kind === 'question');
    expect(q).toHaveLength(1); // la question confiée à un autre humain ne m'attend pas
    expect(q[0]).toMatchObject({ messageId: 'c2', reserved: true, sessionTask: 'Valider la liste', choices: ['30 €', '40 €', 'Autre (précise)'] });
    expect(r.body.count).toBe(r.body.items.length);
    // … et celle-ci attend l'autre participant
    const r2 = await h.request('GET', `/api/projects/${pid}/assistant/inbox`, { token: other.token });
    expect(r2.status).toBe(404); // pas membre du projet
  });

  it('répondre depuis « À trancher » retire la question ; le bras droit en parle et revient vers l’humain', async () => {
    await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: owner.token, body: { messageId: 'c2', answer: '30 €', status: 'answered' } });
    const after = (await h.request('GET', `/api/projects/${pid}/assistant/inbox`, { token: owner.token })).body;
    expect(after.items.some(i => i.kind === 'question')).toBe(false);

    await h.request('POST', `/api/projects/${pid}/sessions/${sid}/delegation/ack`, { token: owner.token });
    h.ai.responder = () => ({ text: 'Une décision remise en question vous attend.' });
    const calls = h.ai.calls.length;
    await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Qu’est-ce que je dois trancher ?' } });
    const sys = h.ai.calls[calls].system;
    expect(sys[1].text).toContain('À TRANCHER PAR L\'HUMAIN');
    expect(sys[1].text).toContain('Décision remise en question : Budget 30 €');
    expect(sys[1].text).not.toContain('Note de retour'); // lue
    const inbox = (await h.request('GET', `/api/projects/${pid}/assistant/inbox`, { token: owner.token })).body;
    expect(inbox.lastAssistant).toMatchObject({ content: 'Une décision remise en question vous attend.' });
  });
});
