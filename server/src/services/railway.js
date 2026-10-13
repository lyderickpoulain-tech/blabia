// Connecteur Railway (v5.1, « un clic par outil ») : l'utilisateur autorise BlabIA sur son
// compte Railway (« Login with Railway », OAuth), puis BlabIA met le site en ligne à sa place :
// projet Railway, un service par partie du dépôt (dossier racine), base Postgres si le code en
// attend une, adresses publiques, variables (secrets générés, base reliée, adresses croisées
// entre le site et le serveur). Restent à l'utilisateur les seules clés de services tiers
// (Resend, Anthropic…), transmises à Railway sans être conservées par BlabIA.
//
// Configuration (variables du serveur BlabIA) : RAILWAY_OAUTH_CLIENT_ID, RAILWAY_OAUTH_CLIENT_SECRET
// (application OAuth créée dans Railway › paramètres de l'espace de travail › Developer › New
// OAuth App, adresse de retour : <BlabIA>/api/railway/callback).
// API : https://docs.railway.com/integrations/oauth et https://docs.railway.com/integrations/api
const crypto = require('crypto');
const db = require('../utils/db');

const AUTH_URL = 'https://backboard.railway.com/oauth/auth';
const TOKEN_URL = 'https://backboard.railway.com/oauth/token';
const API_URL = 'https://backboard.railway.com/graphql/v2';
const SCOPES = 'openid email profile offline_access workspace:member';
const STATE_TTL_MS = 15 * 60 * 1000;

// Remplaçable dans les tests (Railway simulé)
const transport = { fetch: (...args) => fetch(...args) };

const config = () => ({
  clientId: process.env.RAILWAY_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.RAILWAY_OAUTH_CLIENT_SECRET || '',
});
const isConfigured = () => { const c = config(); return !!(c.clientId && c.clientSecret); };
// Derrière le proxy de Railway, le protocole réel est dans X-Forwarded-Proto (https)
const redirectUri = req => `${process.env.RAILWAY_OAUTH_REDIRECT_BASE || `${String(req.get('x-forwarded-proto') || req.protocol).split(',')[0]}://${req.get('host')}`}/api/railway/callback`;

class RailwayError extends Error {
  constructor(message, kind = 'api') { super(message); this.kind = kind; }
}

// ── Jeton de renouvellement chiffré (AES-256-GCM, clé dérivée de JWT_SECRET) ──
const key = () => crypto.createHash('sha256').update(`railway:${process.env.JWT_SECRET || ''}`).digest();
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
function decrypt(blob) {
  try {
    const [iv, tag, data] = String(blob || '').split('.').map(s => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return null; }
}

// ── État signé du retour d'autorisation (utilisateur + projet) ───────────────
function signState(userId, projectId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, p: projectId, e: Date.now() + STATE_TTL_MS, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(`railway.${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(`railway.${payload}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { u, p, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return e > Date.now() && u && /^[0-9a-f-]{36}$/.test(String(p)) ? { userId: u, projectId: p } : null;
  } catch { return null; }
}

const authorizeUrl = (req, state) => `${AUTH_URL}?${new URLSearchParams({
  response_type: 'code', client_id: config().clientId, redirect_uri: redirectUri(req), scope: SCOPES, state, prompt: 'consent',
})}`;

async function tokenRequest(body) {
  const { clientId, clientSecret } = config();
  const res = await transport.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new RailwayError(data.error_description || data.error || `Railway a refusé l’autorisation (${res.status}).`, 'auth');
  return data;
}

// Accès en cours par utilisateur (1 h) : évite un renouvellement à chaque appel
const accessCache = new Map();
async function saveTokens(userId, data) {
  accessCache.set(userId, { token: data.access_token, until: Date.now() + Math.max(60, (data.expires_in || 3600) - 120) * 1000 });
  if (data.refresh_token) await db('User').where({ id: userId }).update({ railwayRefreshToken: encrypt(data.refresh_token) });
}

// Code d'autorisation → accès enregistré (jeton de renouvellement chiffré), e-mail du compte
async function connect(req, userId, code) {
  const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(req) });
  await saveTokens(userId, data);
  let email = null;
  try { email = (await gql(data.access_token, 'query { me { email } }')).me?.email || null; } catch { /* facultatif */ }
  await db('User').where({ id: userId }).update({ railwayConnectedAt: new Date(), railwayEmail: email });
  return { email };
}

async function accessToken(userId) {
  const cached = accessCache.get(userId);
  if (cached && cached.until > Date.now()) return cached.token;
  const [u] = await db('User').where({ id: userId }).select('railwayRefreshToken').limit(1);
  const refresh = decrypt(u?.railwayRefreshToken);
  if (!refresh) throw new RailwayError('Compte Railway non connecté.', 'auth');
  try {
    const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
    await saveTokens(userId, data); // jeton de renouvellement tourné : toujours garder le dernier
    return data.access_token;
  } catch (err) {
    if (err.kind === 'auth') await disconnect(userId); // accès retiré côté Railway : reconnecter
    throw err;
  }
}

async function disconnect(userId) {
  accessCache.delete(userId);
  await db('User').where({ id: userId }).update({ railwayRefreshToken: null, railwayConnectedAt: null, railwayEmail: null });
}

async function gql(token, query, variables = {}) {
  const res = await transport.fetch(API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new RailwayError('Railway refuse l’accès : reconnectez votre compte.', 'auth');
  if (data.errors?.length) throw new RailwayError(data.errors.map(e => e.message).join(' ; '));
  if (!res.ok) throw new RailwayError(`Railway ne répond pas (${res.status}).`);
  return data.data || {};
}

// ── Plan de mise en ligne, déduit de la structure du dépôt ───────────────────
// overview : services/repoOverview.js ; une partie = un service Railway (son dossier racine)
const SECRET_RE = /(^|_)(SECRET|SESSION_SECRET|JWT_SECRET|COOKIE_SECRET|ENCRYPTION_KEY|SECRET_KEY|APP_KEY)$/;
const DB_RE = /^(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|DB_URL|PG_URL)$/;
const API_URL_RE = /(API_URL|API_BASE_URL|BACKEND_URL|SERVER_URL|API_ENDPOINT)$/;
const FRONT_URL_RE = /^(FRONTEND_URL|CLIENT_URL|APP_URL|SITE_URL|PUBLIC_URL|CORS_ORIGIN|ALLOWED_ORIGINS?|ORIGIN)$/;
const SKIP_RE = /^(PORT|HOST|RAILWAY_[A-Z_]+)$/;
const FRONT_FRAMEWORKS = ['vite', 'next', 'astro', 'nuxt', '@sveltejs/kit', 'react-scripts', '@angular/core'];
const BACK_FRAMEWORKS = ['express', 'fastify', '@nestjs/core', 'koa', 'hono'];

const serviceName = (part, projectName) => (part.dir === '(racine)'
  ? String(projectName || 'site').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'site'
  : part.dir);
const kindOf = part => (part.frameworks.some(f => BACK_FRAMEWORKS.includes(f)) && !part.frameworks.some(f => FRONT_FRAMEWORKS.includes(f)) ? 'server'
  : part.frameworks.some(f => FRONT_FRAMEWORKS.includes(f)) ? 'site' : /server|api|back/i.test(part.dir) ? 'server' : 'site');

function buildPlan(overview, project) {
  const parts = (overview?.parts || []).filter(p => Object.keys(p.scripts || {}).length || p.configs?.length);
  // À la racine sans scripts alors que des dossiers en ont : la racine ne se déploie pas
  const deployable = parts.some(p => p.dir !== '(racine)') ? parts.filter(p => p.dir !== '(racine)' || Object.keys(p.scripts || {}).length) : parts;
  const services = deployable.map(p => ({ dir: p.dir, rootDirectory: p.dir === '(racine)' ? '' : p.dir, name: serviceName(p, project?.name), kind: kindOf(p), envNames: p.envNames || [] }));
  const server = services.find(s => s.kind === 'server');
  const site = services.find(s => s.kind === 'site');
  const needsDatabase = services.some(s => s.envNames.some(n => DB_RE.test(n)));
  for (const s of services) {
    s.auto = {};
    s.missing = [];
    for (const n of s.envNames) {
      if (SKIP_RE.test(n)) continue;
      if (SECRET_RE.test(n)) s.auto[n] = { kind: 'secret' };
      else if (DB_RE.test(n)) s.auto[n] = { kind: 'database', value: '${{Postgres.DATABASE_URL}}' };
      else if (n === 'NODE_ENV') s.auto[n] = { kind: 'fixed', value: 'production' };
      else if (API_URL_RE.test(n) && server && server !== s) s.auto[n] = { kind: 'link', value: `https://\${{${server.name}.RAILWAY_PUBLIC_DOMAIN}}` };
      else if (FRONT_URL_RE.test(n) && site && site !== s) s.auto[n] = { kind: 'link', value: `https://\${{${site.name}.RAILWAY_PUBLIC_DOMAIN}}` };
      else s.missing.push(n);
    }
  }
  return { services, needsDatabase, siteService: (site || services[0])?.name || null };
}

// ── Mise en place ─────────────────────────────────────────────────────────────
async function workspaceId(token) {
  // Selon la version de l'API : « workspaces » (actuel) ou « teams » (ancien nom)
  try {
    const r = await gql(token, 'query { me { workspaces { id name } } }');
    if (r.me?.workspaces?.length) return r.me.workspaces[0].id;
  } catch { /* champ absent : essai suivant */ }
  try {
    const r = await gql(token, 'query { me { teams { edges { node { id } } } } }');
    return r.me?.teams?.edges?.[0]?.node?.id || null;
  } catch { return null; }
}

async function productionEnvironment(token, projectId) {
  const r = await gql(token, 'query ($id: String!) { project(id: $id) { environments { edges { node { id name } } } } }', { id: projectId });
  const envs = (r.project?.environments?.edges || []).map(e => e.node);
  return (envs.find(e => e.name === 'production') || envs[0])?.id || null;
}

async function projectServices(token, projectId) {
  const r = await gql(token, 'query ($id: String!) { project(id: $id) { services { edges { node { id name } } } } }', { id: projectId });
  return (r.project?.services?.edges || []).map(e => e.node);
}

// Base Postgres : modèle officiel « postgres » (templateDeployV2) ; le service « Postgres »
// apparaît dans le projet quelques secondes plus tard
async function createPostgres(token, { projectId, environmentId, wsId }) {
  const t = (await gql(token, 'query { template(code: "postgres") { id serializedConfig } }')).template;
  if (!t?.id) throw new RailwayError('Modèle Postgres introuvable chez Railway.');
  const input = { templateId: t.id, serializedConfig: t.serializedConfig, projectId, environmentId, ...(wsId ? { workspaceId: wsId } : {}) };
  try {
    await gql(token, 'mutation ($input: TemplateDeployV2Input!) { templateDeployV2(input: $input) { projectId workflowId } }', { input });
  } catch (err) {
    if (!/workspaceId/i.test(err.message) || !wsId) throw err;
    const { workspaceId: _w, ...rest } = input; // ancienne API : « teamId »
    await gql(token, 'mutation ($input: TemplateDeployV2Input!) { templateDeployV2(input: $input) { projectId workflowId } }', { input: { ...rest, teamId: wsId } });
  }
  for (let i = 0; i < 20; i++) {
    const pg = (await projectServices(token, projectId)).find(s => /postgres/i.test(s.name));
    if (pg) return pg;
    await new Promise(r => setTimeout(r, module.exports.POLL_MS));
  }
  throw new RailwayError('La base Postgres tarde à apparaître dans le projet Railway.');
}

const GITHUB_ACCESS_RE = /github|repo|repository|installation|not found|permission/i;

// Met le site en ligne ; renvoie l'état enregistré sur le projet (Project.railwaySetup)
// save(state) : progression enregistrée au fil de l'eau (une nouvelle tentative reprend le même projet Railway)
async function setup({ userId, project, overview, save = async () => {} }) {
  const token = await accessToken(userId);
  const plan = buildPlan(overview, project);
  if (!plan.services.length) throw new RailwayError('Rien à mettre en ligne pour l’instant : le dépôt ne contient pas encore de site (lancez d’abord un développement).', 'empty');
  const prev = project.railwaySetup && typeof project.railwaySetup === 'object' ? project.railwaySetup : null;
  const wsId = prev?.workspaceId || await workspaceId(token);

  // 1. Projet Railway (réutilisé si une première tentative l'a créé)
  let rProjectId = prev?.projectId;
  if (!rProjectId) {
    const r = await gql(token, 'mutation ($input: ProjectCreateInput!) { projectCreate(input: $input) { id } }',
      { input: { name: project.name.slice(0, 60), description: 'Créé par BlabIA', ...(wsId ? { workspaceId: wsId } : {}) } });
    rProjectId = r.projectCreate.id;
  }
  const environmentId = prev?.environmentId || await productionEnvironment(token, rProjectId);
  const state = { projectId: rProjectId, environmentId, workspaceId: wsId, services: [], postgres: prev?.postgres || null, at: new Date().toISOString(), error: null };
  await save({ ...(prev || {}), projectId: rProjectId, environmentId, workspaceId: wsId });
  const existing = await projectServices(token, rProjectId);

  // 2. Base de données si le code en attend une
  if (plan.needsDatabase && !existing.some(s => /postgres/i.test(s.name))) {
    const pg = await createPostgres(token, { projectId: rProjectId, environmentId, wsId });
    state.postgres = { id: pg.id, name: pg.name };
  } else if (plan.needsDatabase) {
    const pg = existing.find(s => /postgres/i.test(s.name));
    state.postgres = { id: pg.id, name: pg.name };
  }

  // 3. Un service par partie, relié au dépôt GitHub, avec son dossier racine
  for (const s of plan.services) {
    let svc = existing.find(e => e.name === s.name);
    if (!svc) {
      try {
        svc = (await gql(token, 'mutation ($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
          { input: { projectId: rProjectId, name: s.name, source: { repo: project.githubRepo }, branch: 'main' } })).serviceCreate;
      } catch (err) {
        if (GITHUB_ACCESS_RE.test(err.message)) throw new RailwayError(`Railway n’a pas accès au dépôt ${project.githubRepo} sur GitHub.`, 'github');
        throw err;
      }
    }
    if (s.rootDirectory) {
      await gql(token, 'mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }',
        { serviceId: svc.id, environmentId, input: { rootDirectory: s.rootDirectory } });
    }
    // Adresse publique
    const prevSvc = prev?.services?.find(p => p.id === svc.id);
    let domain = prevSvc?.domain || null;
    if (!domain) {
      domain = (await gql(token, 'mutation ($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }',
        { input: { serviceId: svc.id, environmentId } })).serviceDomainCreate?.domain || null;
    }
    state.services.push({ id: svc.id, name: s.name, dir: s.dir, kind: s.kind, domain, auto: Object.keys(s.auto), missing: s.missing, provided: prevSvc?.provided || [] });
  }

  // 4. Variables (le dépôt est lu à nouveau : secrets générés une seule fois, jamais montrés)
  for (const s of plan.services) {
    const svc = state.services.find(x => x.name === s.name);
    const vars = {};
    for (const [n, a] of Object.entries(s.auto)) {
      if (a.kind === 'secret') { if (!prev?.services?.find(p => p.id === svc.id)?.auto?.includes(n)) vars[n] = crypto.randomBytes(32).toString('hex'); }
      else if (a.kind === 'database') { if (state.postgres) vars[n] = a.value.replace('${{Postgres.', `${'$'}{{${state.postgres.name}.`); }
      else vars[n] = a.value;
    }
    if (Object.keys(vars).length) {
      await gql(token, 'mutation ($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }',
        { input: { projectId: rProjectId, environmentId, serviceId: svc.id, variables: vars } });
    }
    if (s.auto.DATABASE_URL && !state.postgres) svc.missing.push('DATABASE_URL');
  }

  // 5. Déploiement (les variables en déclenchent déjà un ; sans variable, on le lance)
  for (const svc of state.services) {
    await gql(token, 'mutation ($serviceId: String!, $environmentId: String!) { serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }',
      { serviceId: svc.id, environmentId }).catch(err => console.error('[railway] déploiement', svc.name, err.message));
  }
  state.siteUrl = state.services.find(x => x.name === plan.siteService)?.domain ? `https://${state.services.find(x => x.name === plan.siteService).domain}` : null;
  return state;
}

// Clé d'un service tiers fournie par l'utilisateur : transmise à Railway, jamais conservée
async function setVariable({ userId, setupState, serviceId, name, value }) {
  const token = await accessToken(userId);
  await gql(token, 'mutation ($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }',
    { input: { projectId: setupState.projectId, environmentId: setupState.environmentId, serviceId, variables: { [name]: value } } });
}

// État des déploiements : dernier déploiement de chaque service, et fin du journal en cas d'échec
const FAILED = ['FAILED', 'CRASHED'];
async function status({ userId, setupState }) {
  const token = await accessToken(userId);
  const out = [];
  for (const svc of setupState.services || []) {
    const r = await gql(token, 'query ($input: DeploymentListInput!) { deployments(input: $input, first: 1) { edges { node { id status createdAt } } } }',
      { input: { projectId: setupState.projectId, serviceId: svc.id, environmentId: setupState.environmentId } });
    const d = r.deployments?.edges?.[0]?.node || null;
    let logs = null;
    if (d && FAILED.includes(d.status)) {
      try {
        const l = await gql(token, 'query ($id: String!) { buildLogs(deploymentId: $id, limit: 60) { message } }', { id: d.id });
        logs = (l.buildLogs || []).map(x => x.message).join('\n').slice(-4000) || null;
        if (!logs || d.status === 'CRASHED') {
          const rl = await gql(token, 'query ($id: String!) { deploymentLogs(deploymentId: $id, limit: 60) { message } }', { id: d.id });
          logs = (rl.deploymentLogs || []).map(x => x.message).join('\n').slice(-4000) || logs;
        }
      } catch { /* journal facultatif */ }
    }
    out.push({ id: svc.id, name: svc.name, status: d?.status || 'NONE', at: d?.createdAt || null, logs });
  }
  return out;
}

// ── Nom de domaine personnalisé ──────────────────────────────────────────────
// Le site de test garde son adresse Railway ; l'utilisateur ajoute ensuite son domaine. Railway
// donne l'enregistrement CNAME (dnsRecords) et le jeton de vérification, à poser en TXT sur
// « _railway-verify.<domaine> ». Noms relatifs à la zone, tels qu'on les saisit chez OVH.
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const MULTI_SUFFIX = ['co.uk', 'org.uk', 'com.au', 'co.nz', 'com.br', 'co.jp'];
const cleanDomain = d => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
function zoneOf(domain) {
  const labels = domain.split('.');
  const n = MULTI_SUFFIX.some(s => domain.endsWith(`.${s}`)) ? 3 : 2;
  return { zone: labels.slice(-n).join('.'), sub: labels.slice(0, -n).join('.') };
}

async function addCustomDomain({ userId, setupState, domain: raw }) {
  const domain = cleanDomain(raw);
  if (!DOMAIN_RE.test(domain)) throw new RailwayError('Adresse invalide : écrivez-la sous la forme www.monsite.fr.', 'domain');
  const site = (setupState.services || []).find(s => s.kind === 'site') || setupState.services?.[0];
  if (!site) throw new RailwayError('Mettez d’abord le site en ligne.', 'empty');
  const token = await accessToken(userId);
  const r = await gql(token, 'mutation ($input: CustomDomainCreateInput!) { customDomainCreate(input: $input) { id domain status { verificationToken dnsRecords { hostlabel requiredValue } } } }',
    { input: { projectId: setupState.projectId, environmentId: setupState.environmentId, serviceId: site.id, domain } });
  const cd = r.customDomainCreate || {};
  const { zone, sub } = zoneOf(domain);
  const cname = cd.status?.dnsRecords?.find(x => x.requiredValue) || null;
  const records = [];
  if (cname) records.push({ type: 'CNAME', name: cname.hostlabel && cname.hostlabel !== '@' ? cname.hostlabel : (sub || '@'), value: cname.requiredValue });
  if (cd.status?.verificationToken) records.push({ type: 'TXT', name: sub ? `_railway-verify.${sub}` : '_railway-verify', value: cd.status.verificationToken });
  return { id: cd.id || null, domain, zone, apex: !sub, serviceId: site.id, records, at: new Date().toISOString(), check: null };
}

// Vérification par les DNS publics (indépendante de l'API Railway), puis le site répond-il ?
const dnsApi = { resolveCname: (...a) => require('dns').promises.resolveCname(...a), resolveTxt: (...a) => require('dns').promises.resolveTxt(...a) };
const bare = v => String(v || '').toLowerCase().replace(/\.$/, '');
async function checkCustomDomain(cd) {
  const want = t => cd.records.find(r => r.type === t);
  const result = { cname: null, txt: null, live: false, at: new Date().toISOString() };
  if (want('CNAME')) {
    try { result.cname = (await dnsApi.resolveCname(cd.domain)).map(bare).includes(bare(want('CNAME').value)); } catch { result.cname = false; }
  }
  if (want('TXT')) {
    try { result.txt = (await dnsApi.resolveTxt(`_railway-verify.${cd.domain}`)).map(parts => parts.join('')).includes(want('TXT').value); } catch { result.txt = false; }
  }
  if (result.cname !== false && result.txt !== false) {
    try {
      const res = await transport.fetch(`https://${cd.domain}`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000) });
      result.live = res.status < 500 && res.status !== 404;
    } catch { result.live = false; } // certificat pas encore émis (jusqu'à une heure)
  }
  return result;
}

module.exports = {
  transport, dnsApi, isConfigured, signState, verifyState, authorizeUrl, connect, disconnect, accessToken,
  buildPlan, setup, setVariable, status, addCustomDomain, checkCustomDomain, zoneOf, encrypt, decrypt, RailwayError, POLL_MS: 3000,
};
