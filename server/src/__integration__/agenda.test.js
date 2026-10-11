import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Décision remise en question → mise à l'ordre du jour d'une réunion de décision →
// agents choisis pour couvrir chaque point → à la conclusion, la nouvelle décision remplace
// l'ancienne. Cas réel : public cible du « Site de numérologie ».
const require = createRequire(import.meta.url);
const harness = require('./harness');
describe.skipIf(!harness.enabled)('ordre du jour des réunions de décision', () => {
  let h, owner, projectId;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'proprio-odj@test.local');
    projectId = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Numérologie' } })).body.id;
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  const decision = async (statement, status = 'reopened', reopenNote = null) =>
    (await h.db('Decision').insert({ projectId, statement, status, reopenNote }).returning('*'))[0];

  let cible, milestoneId;
  it('nouvelle réunion dédiée ; ajout à une réunion existante ; 4 points au plus ; seulement une décision remise en question', async () => {
    cible = await decision('Public cible : les curieux en questionnement relationnel', 'reopened', 'Les passionnés viendront aussi');
    const url = d => `/api/projects/${projectId}/decisions/${d.id}/agenda`;
    expect((await h.request('POST', url(await decision('Couleurs sobres', 'active')), { token: owner.token, body: {} })).status).toBe(400);

    const r = await h.request('POST', url(cible), { token: owner.token, body: {} });
    expect(r.status).toBe(201);
    milestoneId = r.body.milestone.id;
    const m = await h.db('Milestone').where({ id: milestoneId }).first();
    expect(m).toMatchObject({ type: 'decision', status: 'pending', agenda: [cible.id] });
    expect(m.title).toBe('Retraiter : Public cible : les curieux en questionnement relationnel');
    expect(m.description).toContain('Motif : Les passionnés viendront aussi');
    // Affichée dans le registre
    const list = (await h.request('GET', `/api/projects/${projectId}/decisions`, { token: owner.token })).body;
    expect(list.find(d => d.id === cible.id).agendaMilestone).toEqual({ id: milestoneId, title: m.title });
    // Ajout à la même réunion, jusqu'à 4 points
    for (const s of ['Ton des contenus', 'Démo célébrités', 'Prix du mode d’emploi']) {
      expect((await h.request('POST', url(await decision(s)), { token: owner.token, body: { milestoneId } })).status).toBe(201);
    }
    const full = await h.request('POST', url(await decision('Cinquième point')), { token: owner.token, body: { milestoneId } });
    expect(full.status).toBe(409);
    expect((await h.db('Milestone').where({ id: milestoneId }).first()).agenda).toHaveLength(4);
  });

  it('agents suggérés pour couvrir chaque point de l’ordre du jour', async () => {
    h.ai.responder = () => ({ text: '{"existingSelected":[],"newAgentSuggestion":null}' });
    await h.request('POST', `/api/projects/${projectId}/sessions/suggest-agents`, { token: owner.token, body: { task: 'Retraiter', milestoneId } });
    const prompt = h.ai.calls.at(-1).messages[0].content;
    expect(prompt).toContain('Ordre du jour (décisions remises en question à retraiter');
    expect(prompt).toContain('motif de l\'humain : Les passionnés viendront aussi');
    expect(prompt).toContain('chaque point de l\'ordre du jour doit être couvert par AU MOINS UN agent');
    expect(prompt).toContain('Sélectionne 2 à 5 agents');
  });

  it('conclusion : la nouvelle décision remplace l’ancienne (et seulement si demandé)', async () => {
    const s = (await h.request('POST', `/api/projects/${projectId}/sessions`, { token: owner.token,
      body: { task: 'Retraiter le public cible', intention: ['decision'], milestoneId, activeAgents: [{ id: 'a1', name: 'Léa', role: 'Marketing', systemPrompt: '' }] } })).body.session;
    const r = await h.request('POST', `/api/projects/${projectId}/decisions/from-session`, { token: owner.token, body: { sessionId: s.id, decisions: [
      { statement: 'Public cible : les curieux en priorité, avec un contenu rigoureux pour les passionnés', origin: 'human', replaces: cible.id },
      { statement: 'Le ton reste sobre', origin: 'human' },
    ] } });
    expect(r.status).toBe(201);
    const old = await h.db('Decision').where({ id: cible.id }).first();
    expect(old).toMatchObject({ status: 'superseded', supersededBy: r.body[0].id, reopenNote: null });
    expect((await h.db('Decision').where({ id: r.body[1].id }).first()).status).toBe('active');
    // Plus à l'ordre du jour une fois remplacée
    const list = (await h.request('GET', `/api/projects/${projectId}/decisions`, { token: owner.token })).body;
    expect(list.find(d => d.id === cible.id).status).toBe('superseded');
  });
});
