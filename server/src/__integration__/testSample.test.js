import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Projet de démo pré-rempli (« Nouveau projet » → « Créer un projet de démo ») : même
// contenu que l'exemple de la visite, mais agents ACTIFS et conservé.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('projet de démo pré-rempli', () => {
  let h, member, invited;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    member = await h.createUser('member', 'testeur@test.local');
    invited = await h.createUser('user', 'invite@test.local');
    h.ai.responder = () => ({ text: 'Réponse simulée.' });
  });
  afterAll(async () => { await h?.stop(); });

  let pid;
  it('contenu complet, agents actifs', async () => {
    const r = await h.request('POST', '/api/projects/test-sample', { token: member.token });
    expect(r.status).toBe(201);
    pid = r.body.id;
    const [p] = await h.db('Project').where({ id: pid });
    expect(p.isDemo).toBe(false);
    expect(p.name).toMatch(/^Projet de démo — Salon de thé/);
    const count = async t => Number((await h.db(t).where({ projectId: pid }).count('* as n'))[0].n);
    expect({ réunions: await count('Session'), plan: await count('Milestone'), décisions: await count('Decision'),
      actions: await count('TodoItem'), documents: await count('ProjectDocument'), missions: await count('AgentMission') })
      .toEqual({ réunions: 2, plan: 4, décisions: 4, actions: 3, documents: 2, missions: 2 });
    const calls = h.ai.calls.length;
    const qc = await h.request('POST', `/api/projects/${pid}/quick-command`, { token: member.token, body: { input: 'résume' } });
    expect(qc.status).toBe(200); // pas de blocage « projet exemple »
    expect(h.ai.calls.length).toBeGreaterThan(calls);
  });

  it('conservé : le nettoyage de la visite guidée ne le supprime pas ; plusieurs possibles', async () => {
    await h.request('DELETE', '/api/projects/demo', { token: member.token });
    expect((await h.request('GET', `/api/projects/${pid}`, { token: member.token })).status).toBe(200);
    expect((await h.request('POST', '/api/projects/test-sample', { token: member.token })).status).toBe(201);
  });

  it('refusé à un compte « user » (pas de création de projet)', async () => {
    expect((await h.request('POST', '/api/projects/test-sample', { token: invited.token })).status).toBe(403);
  });
});
