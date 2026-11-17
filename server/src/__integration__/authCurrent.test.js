import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Contrôle de sécurité du 18/11/2026 : un jeton valide ne suffit plus, le compte est relu.
// Un compte supprimé perd l'accès ; un changement de rôle vaut aussitôt (cache effacé).
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('sécurité : le compte derrière le jeton', () => {
  let h, admin, member;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    admin = await h.createUser('admin', 'admin-securite@test.local');
    member = await h.createUser('member', 'membre-securite@test.local');
  });
  afterAll(async () => { await h?.stop(); });

  it('un compte supprimé n’a plus accès, même avec un jeton encore valable', async () => {
    const ghost = await h.createUser('member', 'fantome@test.local');
    expect((await h.request('GET', '/api/auth/me', { token: ghost.token })).status).toBe(200);
    await h.db('User').where({ id: ghost.id }).del();
    require('../middleware/auth').forget(ghost.id); // sinon : refusé au plus tard 30 s après
    expect((await h.request('GET', '/api/auth/me', { token: ghost.token })).status).toBe(401);
  });

  it('un rôle retiré par l’administration vaut aussitôt', async () => {
    expect((await h.request('GET', '/api/admin/users', { token: member.token })).status).toBe(403);
    const r = await h.request('PUT', `/api/admin/users/${member.id}/role`, { token: admin.token, body: { role: 'admin' } });
    expect(r.status).toBe(200);
    // L'ancien jeton (signé « member ») porte désormais le nouveau rôle, et inversement
    expect((await h.request('GET', '/api/admin/users', { token: member.token })).status).toBe(200);
    expect((await h.request('PUT', `/api/admin/users/${member.id}/role`, { token: admin.token, body: { role: 'member' } })).status).toBe(200);
    expect((await h.request('GET', '/api/admin/users', { token: member.token })).status).toBe(403);
  });

  it('un jeton signé avec un autre algorithme est refusé', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ id: admin.id, role: 'admin' }, '', { algorithm: 'none' });
    expect((await h.request('GET', '/api/auth/me', { token: forged })).status).toBe(401);
  });

  it('en-têtes de protection présents, logiciel du serveur non révélé', async () => {
    const r = await h.request('GET', '/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});
