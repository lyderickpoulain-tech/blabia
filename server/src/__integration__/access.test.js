import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Contrôle d'accès de TOUTES les routes (v5.1). La liste est lue dans index.js et dans
// les routeurs : une route ajoutée plus tard est couverte automatiquement.
//  1. sans jeton : 401 partout (sauf routes publiques) ;
//  2. un membre étranger au projet : jamais de 2xx sur les routes d'un projet, aucun
//     appel à l'IA, aucune donnée du projet modifiée ;
//  3. routes d'administration : refusées à un membre.

const require = createRequire(import.meta.url);
const harness = require('./harness');
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC = [
  'GET /api/health', 'GET /api/ping', 'POST /api/auth/login', 'POST /api/auth/register',
  'POST /api/reminders/run', // protégée par CRON_SECRET (testé à part)
  'GET /api/github/callback', // retour de GitHub : utilisateur reconnu par l'état signé (testé à part)
  'GET /api/railway/callback', // retour de Railway : utilisateur reconnu par l'état signé (testé à part)
];

// Toutes les routes : montages de index.js + routeurs (récursivement, routeurs imbriqués compris)
function listRoutes() {
  const index = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
  const mounts = [...index.matchAll(/app\.use\('([^']+)',\s*require\('\.\/routes\/([^']+)'\)\)/g)].map(m => [m[1], m[2]]);
  const out = [];
  const walk = (prefix, router) => {
    for (const layer of router.stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      } else if (layer.handle?.stack) {
        walk(prefix, layer.handle); // routeurs montés sans chemin (sessions/index.js)
      }
    }
  };
  for (const [prefix, file] of mounts) walk(prefix, require(path.join(SRC, 'routes', file)));
  return out;
}

describe.skipIf(!harness.enabled)('contrôle d’accès de toutes les routes', () => {
  let h, owner, outsider, ids;

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'proprio@test.local');
    outsider = await h.createUser('member', 'intrus@test.local');
    const { db } = h;
    const project = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Projet privé' } })).body;
    const session = (await h.request('POST', `/api/projects/${project.id}/sessions`, { token: owner.token,
      body: { task: 'Réunion privée', intention: ['decision'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: '' }] } })).body.session;
    const decision = (await h.request('POST', `/api/projects/${project.id}/decisions`, { token: owner.token, body: { statement: 'Décision privée' } })).body;
    const todo = (await h.request('POST', `/api/projects/${project.id}/todos`, { token: owner.token, body: { title: 'Action privée' } })).body;
    const milestone = (await h.request('POST', `/api/projects/${project.id}/milestones`, { token: owner.token, body: { title: 'Réunion du plan', type: 'decision' } })).body;
    const { randomUUID } = require('crypto');
    const [doc] = await db('ProjectDocument').insert({ id: randomUUID(), projectId: project.id, name: 'secret.txt', content: 'confidentiel', charCount: 12 }).returning('id');
    // La préparation doit réussir, sinon le test vérifierait des identifiants vides
    for (const [name, v] of Object.entries({ project, session, decision, todo, milestone })) expect(v?.id, name).toBeTruthy();
    ids = { project: project.id, session: session.id, decision: decision.id, todo: todo.id, milestone: milestone.id, doc: doc.id ?? doc };
  });
  afterAll(async () => { await h?.stop(); });

  // Valeur de chaque paramètre d'URL, selon le contexte du chemin
  const fill = (p) => p
    .replace(/\/documents\/:did/, () => `/documents/${ids.doc}`)
    .replace(/\/decisions\/:did/, () => `/decisions/${ids.decision}`)
    .replace(/:(id|projectId)\b/g, () => ids.project)
    .replace(/:(sessionId|sid)\b/g, () => ids.session)
    .replace(/:mid\b/g, () => ids.milestone)
    .replace(/:tid\b/g, () => ids.todo)
    .replace(/:(\w+)/g, () => '00000000-0000-0000-0000-000000000000');

  it('chaque route est listée (garde-fou du test lui-même)', () => {
    expect(listRoutes().length).toBeGreaterThan(80);
  });

  it('sans jeton : 401 partout, sauf les routes publiques', async () => {
    const failures = [];
    for (const r of listRoutes()) {
      if (PUBLIC.includes(`${r.method} ${r.path}`)) continue;
      const res = await h.request(r.method, fill(r.path), { body: r.method === 'GET' ? undefined : {} });
      if (res.status !== 401) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('membre étranger au projet : aucun accès, aucun appel à l’IA, aucune modification', async () => {
    const snapshot = async () => {
      const t = async (table, col = 'projectId') => (await h.db(table).where({ [col]: ids.project }).count('* as n'))[0].n;
      const [p] = await h.db('Project').where({ id: ids.project }).select('name', 'status', 'brief', 'remindersEnabled', 'challengerEnabled');
      return { p, sessions: await t('Session'), decisions: await t('Decision'), todos: await t('TodoItem'), milestones: await t('Milestone'), docs: await t('ProjectDocument'), members: await t('ProjectMember') };
    };
    const before = await snapshot();
    const aiBefore = h.ai.calls.length;
    const leaks = [];
    for (const r of listRoutes()) {
      if (!/\/api\/projects\/:(id|projectId)\b/.test(r.path)) continue; // routes d'un projet
      const res = await h.request(r.method, fill(r.path), { token: outsider.token, body: r.method === 'GET' ? undefined : { name: 'piraté', statement: 'x', title: 'x', status: 'archived', enabled: false } });
      if (res.status >= 200 && res.status < 300) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
    expect(h.ai.calls.length - aiBefore).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it('administration : refusée à un membre', async () => {
    const failures = [];
    for (const r of listRoutes().filter(x => x.path.startsWith('/api/admin'))) {
      const res = await h.request(r.method, fill(r.path), { token: outsider.token, body: r.method === 'GET' ? undefined : {} });
      if (res.status !== 403) failures.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('déclenchement des rappels : refusé sans le bon secret', async () => {
    const res = await h.request('POST', '/api/reminders/run', { body: {} });
    expect([403, 503]).toContain(res.status);
  });
});
