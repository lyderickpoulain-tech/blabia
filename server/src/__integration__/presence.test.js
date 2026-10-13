import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Carte du projet : participants (projet à plusieurs) avec voyant « sur le projet » ou dernière
// venue ; « Créé par » pour un projet solo ; invitations en attente jamais montrées.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('présence sur les projets', () => {
  let h, owner, member, admin, solo, shared;
  const list = async user => (await h.request('GET', '/api/projects', { token: user.token })).body;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'lea@test.local');
    member = await h.createUser('member', 'max@test.local');
    admin = await h.createUser('admin', 'admin-presence@test.local');
    await h.db('User').where({ id: member.id }).update({ username: 'max' });
    solo = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Solo' } })).body.id;
    shared = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'À deux' } })).body.id;
    expect((await h.request('POST', `/api/projects/${shared}/members`, { token: owner.token, body: { email: 'max@test.local' } })).status).toBe(201);
    // Invitation en attente (personne pas encore inscrite) : jamais affichée
    await h.db('Invitation').insert({ id: crypto.randomUUID(), email: 'inconnu@test.local', token: crypto.randomUUID(), used: false, createdBy: 'lea@test.local', projectId: shared });
  });
  afterAll(async () => { await h?.stop(); });

  it('projet solo : « Créé par » (vous / pseudo ou début de l’e-mail), pas de participants', async () => {
    const p = (await list(owner)).find(x => x.id === solo);
    expect(p).toMatchObject({ createdBy: 'vous' });
    expect(p.people).toBeUndefined();
    const forAdmin = (await list(admin)).find(x => x.id === solo);
    expect(forAdmin.createdBy).toBe('lea');
  });

  it('projet à plusieurs : propriétaire et membre, voyant et dernière venue ; invitation en attente absente', async () => {
    let p = (await list(owner)).find(x => x.id === shared);
    expect(p.createdBy).toBeUndefined();
    expect(p.people.map(x => [x.name, x.isOwner, x.online, x.lastSeenAt])).toEqual([['lea', true, false, null], ['max', false, false, null]]);

    expect((await h.request('POST', `/api/projects/${shared}/presence`, { token: member.token })).status).toBe(204);
    p = (await list(owner)).find(x => x.id === shared);
    expect(p.people.find(x => x.name === 'max')).toMatchObject({ online: true, isYou: false });
    expect(p.people.find(x => x.name === 'lea')).toMatchObject({ isYou: true, online: false });

    // Plus de 2 min 30 sans signal : voyant gris, date de la dernière venue
    const old = new Date(Date.now() - 3 * 3600 * 1000);
    await h.db('ProjectPresence').where({ projectId: shared, userId: member.id }).update({ lastSeenAt: old });
    p = (await list(owner)).find(x => x.id === shared);
    expect(p.people.find(x => x.name === 'max')).toMatchObject({ online: false });
    expect(new Date(p.people.find(x => x.name === 'max').lastSeenAt).getTime()).toBe(old.getTime());
  });

  it('administrateur qui consulte : non compté ; étranger au projet : refusé', async () => {
    await h.request('POST', `/api/projects/${shared}/presence`, { token: admin.token });
    expect(await h.db('ProjectPresence').where({ projectId: shared, userId: admin.id }).first()).toBeUndefined();
    const stranger = await h.createUser('member', 'intrus-presence@test.local');
    expect((await h.request('POST', `/api/projects/${shared}/presence`, { token: stranger.token })).status).toBe(404);
  });
});
