import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Réunion « WorldOfMetal » (17/10/2026) : une réunion « outils » ouvrait un projet sans brief.
// Désormais : le cadrage d'abord ; pour un débutant, le pack recommandé en un clic.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('réunion « outils » : cadrage d’abord, pack en un clic', () => {
  let h, owner, member, pid;
  const status = async (token = owner.token) => (await h.request('GET', `/api/projects/${pid}/tools`, { token })).body.toolsMeeting;

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'metal@test.local');
    member = await h.createUser('member', 'collegue-metal@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'WorldOfMetal' } })).body.id;
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: member.id, role: 'collaborator' });
  });
  afterAll(async () => { await h?.stop(); });

  it('sans brief ni réunion tenue : raconter le projet d’abord', async () => {
    expect(await status()).toMatchObject({ done: false, framingFirst: true });
  });

  it('brief renseigné, débutant : offre du pack avec son coût total', async () => {
    await h.request('PATCH', `/api/projects/${pid}/brief`, { token: owner.token, body: { objectif: 'Un site pour la communauté metal de ma ville.' } });
    await h.request('PATCH', `/api/projects/${pid}`, { token: owner.token, body: { expertiseLevel: 1 } });
    const s = await status();
    expect(s).toMatchObject({ done: false, framingFirst: false, simple: true });
    expect(s.pack.tools.map(t => t.name)).toEqual(['Railway', 'GitHub', 'Claude Code']);
    expect(s.pack.monthlyMin).toBeGreaterThan(0);
    expect(s.pack.monthlyMax).toBeGreaterThan(s.pack.monthlyMin);
  });

  it('pack en un clic : propriétaire seulement, puis plus de réunion « outils » exigée', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/tools/recommended-pack`, { token: member.token })).status).toBe(403);
    const r = await h.request('POST', `/api/projects/${pid}/tools/recommended-pack`, { token: owner.token });
    expect(r.status).toBe(201);
    expect(r.body.added).toEqual(['Railway', 'GitHub', 'Claude Code']);
    expect((await status()).done).toBe(true);
  });

  it('niveau « C’est mon métier » : la réunion reste proposée, sans offre simplifiée', async () => {
    await h.db('Project').where({ id: pid }).update({ tools: null, expertiseLevel: 5 });
    const s = await status();
    expect(s.simple).toBe(false);
    expect(s.pack).toBeNull();
  });
});
