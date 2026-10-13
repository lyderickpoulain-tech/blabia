import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Connecteur Railway (Railway et GitHub simulés) : autorisation en un clic, puis mise en ligne
// par BlabIA d'un site « client + server » avec base Postgres ; secrets générés, adresses
// croisées, clé tierce transmise sans être conservée, reprise sans doublon.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const b64 = s => Buffer.from(s).toString('base64');

// Dépôt simulé : client/ (Vite) et server/ (Express), avec leurs .env.example
const REPO = {
  '': [{ type: 'dir', name: 'client' }, { type: 'dir', name: 'server' }, { type: 'file', name: 'README.md' }],
  client: [{ type: 'file', name: 'package.json' }, { type: 'file', name: 'vite.config.js' }, { type: 'file', name: '.env.example' }],
  server: [{ type: 'file', name: 'package.json' }, { type: 'file', name: '.env.example' }],
};
const FILES = {
  'client/package.json': JSON.stringify({ name: 'client', scripts: { build: 'vite build' }, devDependencies: { vite: '^5' } }),
  'client/.env.example': 'VITE_API_URL=http://localhost:3001\n',
  'server/package.json': JSON.stringify({ name: 'server', scripts: { start: 'node src/index.js' }, dependencies: { express: '^4' } }),
  'server/.env.example': 'DATABASE_URL=\nJWT_SECRET=\nFRONTEND_URL=\nRESEND_API_KEY=\nPORT=3001\n',
};

function fakeRailway() {
  const rw = { calls: [], vars: {}, services: [], refreshCount: 0, deployStatus: 'SUCCESS', denyRepo: false, projects: 0 };
  rw.fetch = async (url, opts = {}) => {
    if (url.endsWith('/oauth/token')) {
      const body = new URLSearchParams(opts.body);
      if (body.get('grant_type') === 'authorization_code' && body.get('code') !== 'bon-code') return json(400, { error: 'invalid_grant' });
      if (body.get('grant_type') === 'refresh_token') rw.refreshCount++;
      return json(200, { access_token: `acces-${rw.refreshCount}`, refresh_token: `renouv-${rw.refreshCount}`, expires_in: 3600 });
    }
    const { query, variables = {} } = JSON.parse(opts.body);
    rw.calls.push(query);
    const v = variables;
    if (query.includes('me { email }')) return json(200, { data: { me: { email: 'moi@exemple.fr' } } });
    if (query.includes('me { workspaces')) return json(200, { data: { me: { workspaces: [{ id: 'ws1', name: 'Perso' }] } } });
    if (query.includes('projectCreate')) { rw.projects++; return json(200, { data: { projectCreate: { id: 'p1' } } }); }
    if (query.includes('environments')) return json(200, { data: { project: { environments: { edges: [{ node: { id: 'env1', name: 'production' } }] } } } });
    if (query.includes('services { edges')) return json(200, { data: { project: { services: { edges: rw.services.map(node => ({ node })) } } } });
    if (query.includes('template(code: "postgres")')) return json(200, { data: { template: { id: 'tpl-pg', serializedConfig: { services: {} } } } });
    if (query.includes('templateDeployV2')) { rw.services.push({ id: 'pg1', name: 'Postgres' }); return json(200, { data: { templateDeployV2: { projectId: 'p1', workflowId: 'w1' } } }); }
    if (query.includes('serviceCreate')) {
      if (rw.denyRepo) return json(200, { errors: [{ message: 'Repository not found or GitHub installation missing' }] });
      const svc = { id: `s-${v.input.name}`, name: v.input.name };
      rw.services.push(svc);
      return json(200, { data: { serviceCreate: svc } });
    }
    if (query.includes('serviceInstanceUpdate')) return json(200, { data: { serviceInstanceUpdate: true } });
    if (query.includes('serviceDomainCreate')) return json(200, { data: { serviceDomainCreate: { domain: `${v.input.serviceId}.up.railway.app` } } });
    if (query.includes('variableCollectionUpsert')) {
      rw.vars[v.input.serviceId] = { ...(rw.vars[v.input.serviceId] || {}), ...v.input.variables };
      return json(200, { data: { variableCollectionUpsert: true } });
    }
    if (query.includes('serviceInstanceDeployV2')) return json(200, { data: { serviceInstanceDeployV2: 'd' } });
    if (query.includes('deployments(')) return json(200, { data: { deployments: { edges: [{ node: { id: `dep-${v.input.serviceId}`, status: rw.deployStatus, createdAt: new Date().toISOString() } }] } } });
    if (query.includes('buildLogs')) return json(200, { data: { buildLogs: [{ message: 'npm ERR! Missing script: "build"' }] } });
    return json(200, { errors: [{ message: `Requête simulée absente : ${query.slice(0, 60)}` }] });
  };
  return rw;
}

describe.skipIf(!harness.enabled)('connecteur Railway (simulé)', () => {
  let h, owner, other, pid, rw, railway, github, realGh, realConfigured;
  beforeAll(async () => {
    Object.assign(process.env, { RAILWAY_OAUTH_CLIENT_ID: 'cid-rw', RAILWAY_OAUTH_CLIENT_SECRET: 'secret-rw' });
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'rail@test.local');
    other = await h.createUser('member', 'autre-rail@test.local');
    railway = require('../services/railway');
    railway.POLL_MS = 1;
    rw = fakeRailway();
    railway.transport.fetch = rw.fetch;
    github = require('../services/github');
    realGh = github.gh; realConfigured = github.isConfigured;
    github.isConfigured = () => true;
    github.gh = async (_inst, _m, path) => {
      const m = path.match(/^\/repos\/moi\/numero\/contents\/?(.*)$/);
      if (!m) throw Object.assign(new Error('Not Found'), { status: 404 });
      const p = decodeURIComponent(m[1]);
      if (REPO[p]) return REPO[p];
      if (FILES[p]) return { content: b64(FILES[p]) };
      throw Object.assign(new Error('Not Found'), { status: 404 });
    };
    await h.db('User').where({ id: owner.id }).update({ githubInstallationId: '77' });
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Site de numérologie' } })).body.id;
    await h.db('Project').where({ id: pid }).update({ githubRepo: 'moi/numero',
      tools: JSON.stringify([{ id: 't1', name: 'Railway', category: 'hosting', status: 'validated' }]) });
  });
  afterAll(async () => { if (github) { github.gh = realGh; github.isConfigured = realConfigured; } await h?.stop(); });

  it('connexion : adresse d’autorisation (droits sur un espace de travail), retour signé, accès chiffré', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/railway/connect`, { token: other.token })).status).toBe(404);
    const { url } = (await h.request('POST', `/api/projects/${pid}/railway/connect`, { token: owner.token })).body;
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://backboard.railway.com/oauth/auth');
    expect(u.searchParams.get('scope')).toContain('workspace:member');
    expect(u.searchParams.get('scope')).toContain('offline_access');
    expect(u.searchParams.get('prompt')).toBe('consent');
    const back = async q => (await fetch(`${h.base}/api/railway/callback?${new URLSearchParams(q)}`, { redirect: 'manual' })).headers.get('location');
    expect(await back({ code: 'bon-code', state: 'faux.etat' })).toContain('railway=erreur');
    expect(await back({ code: 'bon-code', state: u.searchParams.get('state') })).toContain(`/projects/${pid}/outils?railway=ok`);
    const u2 = await h.db('User').where({ id: owner.id }).first();
    expect(u2.railwayEmail).toBe('moi@exemple.fr');
    expect(u2.railwayRefreshToken).toBeTruthy();
    expect(u2.railwayRefreshToken).not.toContain('renouv'); // chiffré
  });

  it('plan déduit du dépôt : un service par dossier, base, réglages automatiques, clés à fournir', async () => {
    const r = (await h.request('GET', `/api/projects/${pid}/railway`, { token: owner.token })).body;
    expect(r).toMatchObject({ configured: true, connected: true, email: 'moi@exemple.fr', setup: null });
    expect(r.plan.needsDatabase).toBe(true);
    expect(r.plan.services.map(s => [s.name, s.kind, s.rootDirectory])).toEqual([['client', 'site', 'client'], ['server', 'server', 'server']]);
    expect(r.plan.services[1].missing).toEqual(['RESEND_API_KEY']);
  });

  it('accès GitHub manquant pour Railway : message dédié, projet Railway gardé pour la reprise', async () => {
    rw.denyRepo = true;
    const r = await h.request('POST', `/api/projects/${pid}/railway/setup`, { token: owner.token });
    expect(r.status).toBe(409);
    expect(r.body.kind).toBe('github');
    expect((await h.db('Project').where({ id: pid }).first()).railwaySetup.projectId).toBe('p1');
    rw.denyRepo = false;
  });

  it('mise en ligne : services, base, adresses, variables ; outil coché et adresse du site', async () => {
    const r = await h.request('POST', `/api/projects/${pid}/railway/setup`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(rw.projects).toBe(1); // projet Railway repris, pas recréé
    const { setup } = r.body;
    expect(setup.siteUrl).toBe('https://s-client.up.railway.app');
    expect(setup.postgres).toEqual({ id: 'pg1', name: 'Postgres' });
    expect(rw.vars['s-client']).toEqual({ VITE_API_URL: 'https://${{server.RAILWAY_PUBLIC_DOMAIN}}' });
    expect(rw.vars['s-server']).toMatchObject({ DATABASE_URL: '${{Postgres.DATABASE_URL}}', FRONTEND_URL: 'https://${{client.RAILWAY_PUBLIC_DOMAIN}}' });
    expect(rw.vars['s-server'].JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
    const p = await h.db('Project').where({ id: pid }).first();
    expect(p.siteUrl).toBe('https://s-client.up.railway.app');
    expect(p.tools[0].setupDone).toBe(true);

    // Revérifier : rien n'est recréé, le secret n'est pas régénéré
    const secret = rw.vars['s-server'].JWT_SECRET;
    await h.request('POST', `/api/projects/${pid}/railway/setup`, { token: owner.token });
    expect(rw.projects).toBe(1);
    expect(rw.services.filter(s => s.name === 'server')).toHaveLength(1);
    expect(rw.vars['s-server'].JWT_SECRET).toBe(secret);
  });

  it('clé tierce : transmise à Railway, jamais conservée par BlabIA', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/railway/variables`, { token: owner.token, body: { serviceId: 's-server', name: 'AUTRE', value: 'x' } })).status).toBe(400);
    const r = await h.request('POST', `/api/projects/${pid}/railway/variables`, { token: owner.token, body: { serviceId: 's-server', name: 'RESEND_API_KEY', value: 're_cle_tres_secrete' } });
    expect(r.status).toBe(200);
    expect(rw.vars['s-server'].RESEND_API_KEY).toBe('re_cle_tres_secrete');
    const p = await h.db('Project').where({ id: pid }).first();
    expect(JSON.stringify(p.railwaySetup)).not.toContain('re_cle_tres_secrete');
    expect(p.railwaySetup.services.find(s => s.id === 's-server').provided).toEqual(['RESEND_API_KEY']);
  });

  it('état : déploiement en échec avec la fin du journal ; déconnexion', async () => {
    rw.deployStatus = 'FAILED';
    const st = (await h.request('GET', `/api/projects/${pid}/railway/status`, { token: owner.token })).body.services;
    expect(st[0]).toMatchObject({ name: 'client', status: 'FAILED' });
    expect(st[0].logs).toContain('Missing script');
    expect((await h.request('DELETE', `/api/projects/${pid}/railway/connection`, { token: owner.token })).body.connected).toBe(false);
    expect((await h.db('User').where({ id: owner.id }).first()).railwayRefreshToken).toBeNull();
  });
});
