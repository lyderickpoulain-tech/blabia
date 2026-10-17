import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// « Apportez votre clé API » (v5.1, 17/10/2026) : l'IA d'un projet passe par la clé Anthropic de
// son propriétaire ; si Anthropic la refuse, la clé de BlabIA prend le relais. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const KEY = `sk-ant-api03-${'a'.repeat(30)}`;
const KEY2 = `sk-ant-api03-${'b'.repeat(26)}wxyz`;
const BLABIA = 'cle-de-test';
const apiError = (status, message) => Object.assign(new Error(message), { status, error: { error: { message } } });

describe.skipIf(!harness.enabled)('clé API du porteur de projet', () => {
  let h, owner, member, pid;
  let failWith = null; // erreur renvoyée par Anthropic pour la clé du porteur
  const ask = (token, message = 'Où en est-on ?') => h.request('POST', `/api/projects/${pid}/assistant`, { token, body: { message } });
  const lastLog = () => h.db('UsageLog').where({ projectId: pid }).orderBy('createdAt', 'desc').first();
  const settle = () => new Promise(r => setTimeout(r, 300)); // journalisation et état de la clé : sans attendre

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'porteur-cle@test.local');
    member = await h.createUser('member', 'collegue-cle@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Site musique du monde' } })).body.id;
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: member.id, role: 'collaborator' });
    h.ai.responder = () => {
      if (failWith && h.ai.keys.at(-1) !== BLABIA) throw failWith;
      return { text: 'Tout avance.' };
    };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('enregistrement : format vérifié, clé testée auprès d’Anthropic, jamais renvoyée', async () => {
    expect((await h.request('PUT', '/api/users/me/anthropic-key', { token: owner.token, body: { apiKey: 'mon-abonnement-claude' } })).status).toBe(400);
    failWith = apiError(401, 'invalid x-api-key');
    expect((await h.request('PUT', '/api/users/me/anthropic-key', { token: owner.token, body: { apiKey: KEY } })).status).toBe(400);
    failWith = null;
    const r = await h.request('PUT', '/api/users/me/anthropic-key', { token: owner.token, body: { apiKey: KEY } });
    expect(r.status).toBe(200);
    expect(r.body.anthropicKey).toMatchObject({ configured: true, last4: 'aaaa', status: 'ok' });
    const me = await h.request('GET', '/api/users/me', { token: owner.token });
    expect(JSON.stringify(me.body)).not.toContain(KEY);
    expect(me.body.anthropicApiKey).toBeUndefined();
    const stored = await h.db('User').where({ id: owner.id }).first();
    expect(stored.anthropicApiKey).not.toContain('sk-ant'); // chiffrée
  });

  it('l’IA du projet passe par la clé du porteur, y compris pour un collaborateur', async () => {
    await ask(owner.token);
    expect(h.ai.keys.at(-1)).toBe(KEY);
    await settle();
    expect((await lastLog()).billedTo).toBe('user');
    await ask(member.token);
    expect(h.ai.keys.at(-1)).toBe(KEY);
    const stats = (await h.request('GET', `/api/projects/${pid}/stats`, { token: owner.token })).body;
    expect(stats.userKeyCostUSD).toBeGreaterThan(0);
    expect(stats.ownerKeyStatus).toBe('ok');
  });

  it('limite de débit : relais par BlabIA pour cet appel, la clé reste active', async () => {
    failWith = apiError(429, 'rate_limit_error');
    const r = await ask(owner.token);
    expect(r.status).toBe(200);
    expect(h.ai.keys.slice(-2)).toEqual([KEY, BLABIA]);
    await settle();
    expect((await lastLog()).billedTo).toBe('blabia');
    expect((await h.db('User').where({ id: owner.id }).first()).anthropicKeyStatus).toBe('ok');
  });

  it('crédit épuisé : relais, puis la clé n’est plus essayée pendant une heure', async () => {
    failWith = apiError(400, 'Your credit balance is too low to access the Anthropic API.');
    await ask(owner.token);
    expect(h.ai.keys.slice(-2)).toEqual([KEY, BLABIA]);
    await settle();
    expect((await h.db('User').where({ id: owner.id }).first()).anthropicKeyStatus).toBe('no_credit');
    const calls = h.ai.keys.length;
    await ask(owner.token);
    expect(h.ai.keys.slice(calls)).toEqual([BLABIA]);
    expect((await h.request('GET', `/api/projects/${pid}/stats`, { token: owner.token })).body.ownerKeyStatus).toBe('no_credit');
    expect((await h.request('GET', `/api/projects/${pid}/stats`, { token: member.token })).body.ownerKeyStatus).toBeNull(); // affaire du porteur
  });

  it('clé révoquée : relais et clé écartée ; une nouvelle clé la remplace', async () => {
    failWith = null;
    await h.request('PUT', '/api/users/me/anthropic-key', { token: owner.token, body: { apiKey: KEY } });
    failWith = apiError(401, 'invalid x-api-key');
    await ask(owner.token);
    await settle();
    expect((await h.db('User').where({ id: owner.id }).first()).anthropicKeyStatus).toBe('invalid');
    const calls = h.ai.keys.length;
    await ask(owner.token);
    expect(h.ai.keys.slice(calls)).toEqual([BLABIA]);

    failWith = null;
    const r = await h.request('PUT', '/api/users/me/anthropic-key', { token: owner.token, body: { apiKey: KEY2 } });
    expect(r.body.anthropicKey).toMatchObject({ last4: 'wxyz', status: 'ok' });
    await ask(owner.token);
    expect(h.ai.keys.at(-1)).toBe(KEY2);
  });

  it('panne d’Anthropic (5xx) : pas de relais, l’erreur remonte', async () => {
    failWith = apiError(529, 'overloaded_error');
    const calls = h.ai.keys.length;
    expect((await ask(owner.token)).status).toBe(500);
    expect(h.ai.keys.slice(calls)).toEqual([KEY2]);
    failWith = null;
  });

  it('retirer la clé : retour à la clé de BlabIA', async () => {
    const r = await h.request('DELETE', '/api/users/me/anthropic-key', { token: owner.token });
    expect(r.body.anthropicKey).toMatchObject({ configured: false, status: null });
    await ask(owner.token);
    expect(h.ai.keys.at(-1)).toBe(BLABIA);
  });
});
