import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Profil : pseudo (enregistrement, suppression — longtemps refusée par le serveur),
// jour des rappels.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('profil', () => {
  let h, u;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    u = await h.createUser('member', 'profil@test.local');
  });
  afterAll(async () => { await h?.stop(); });

  it('pseudo : enregistrement puis suppression', async () => {
    const set = await h.request('PATCH', '/api/users/me/username', { token: u.token, body: { username: 'the_tea' } });
    expect(set.body.username).toBe('the_tea');
    const clear = await h.request('PATCH', '/api/users/me/username', { token: u.token, body: { username: '' } });
    expect(clear.status).toBe(200);
    expect(clear.body.username).toBeNull();
    const me = await h.request('GET', '/api/auth/me', { token: u.token });
    expect(me.body.username).toBeNull();
  });

  it('jour des rappels : 1 à 7 seulement', async () => {
    expect((await h.request('PATCH', '/api/users/me/reminders', { token: u.token, body: { reminderDay: 5 } })).body.reminderDay).toBe(5);
    expect((await h.request('PATCH', '/api/users/me/reminders', { token: u.token, body: { reminderDay: 9 } })).status).toBe(400);
  });
});
