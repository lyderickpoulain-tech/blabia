// Banc d'essai des tests d'intégration (v5.1) : application Express réelle + base de
// TEST dédiée + IA simulée. Lancement : npm run test:integration (TEST_DATABASE_URL).
//
// Garde-fous : refuse de démarrer si la base n'est pas une base de test (nom contenant
// « test », jamais Railway) — server/.env contient l'adresse de la PROD et serait sinon
// chargé par index.js. E-mails coupés. Aucun appel réel à l'API Anthropic.

const url = process.env.TEST_DATABASE_URL || '';
function assertTestDatabase() {
  if (!url) throw new Error('TEST_DATABASE_URL manquant');
  if (/rlwy\.net|railway/i.test(url) || !/\/[^/?]*test[^/?]*(\?|$)/i.test(url)) {
    throw new Error('TEST_DATABASE_URL doit désigner une base de TEST locale (nom contenant « test »), jamais la prod.');
  }
}

// IA simulée : remplace Messages.create AVANT le chargement de services/anthropic.js
// (qui l'enveloppe pour journaliser l'usage), afin que UsageLog soit aussi testé.
const ai = { calls: [], responder: null };
function installFakeAI() {
  const Anthropic = require('@anthropic-ai/sdk');
  const proto = Object.getPrototypeOf(new Anthropic({ apiKey: 'test' }).messages);
  proto.create = async function fakeCreate(params) {
    ai.calls.push(params);
    if (!ai.responder) throw new Error('IA simulée : aucun scénario défini pour cet appel');
    const r = ai.responder(params) || {};
    return {
      id: `msg_test_${ai.calls.length}`, type: 'message', role: 'assistant', model: params.model,
      content: r.content ?? [{ type: 'text', text: r.text ?? '' }], stop_reason: r.stop_reason || 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50, ...(r.usage || {}) },
    };
  };
}

let ctx = null;
async function start() {
  if (ctx) return ctx;
  assertTestDatabase();
  process.env.DATABASE_URL = url;          // avant dotenv : jamais écrasé par server/.env
  process.env.JWT_SECRET = 'secret-de-test';
  process.env.RESEND_API_KEY = '';         // aucun e-mail
  process.env.REMINDERS_DISABLED = '1';
  process.env.ANTHROPIC_API_KEY = 'cle-de-test';
  installFakeAI();
  const app = require('../index');
  const db = require('../utils/db');
  const jwt = require('jsonwebtoken');
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const tokenFor = u => jwt.sign({ id: u.id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  async function request(method, path, { token, body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, text };
  }
  async function createUser(role, email) {
    const { randomUUID } = require('crypto');
    const [u] = await db('User').insert({ id: randomUUID(), email, password: 'x', role }).returning(['id', 'email', 'role']);
    return { ...u, token: tokenFor(u) };
  }
  async function reset() {
    const { rows } = await db.raw(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
    await db.raw(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} CASCADE`);
  }
  async function stop() { await new Promise(r => server.close(r)); await db.destroy(); ctx = null; }

  ctx = { app, db, base, ai, request, createUser, reset, stop };
  return ctx;
}

module.exports = { start, ai, enabled: !!url };
