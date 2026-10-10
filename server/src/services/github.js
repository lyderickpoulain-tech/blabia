// Accès à GitHub via l'application GitHub BlabIA (v5.1, développements).
//
// L'utilisateur installe l'application sur son compte (« Connecter GitHub ») : BlabIA agit
// ensuite avec un jeton d'INSTALLATION de courte durée (1 h), limité aux dépôts choisis.
// Le jeton OAuth de l'utilisateur ne sert qu'au retour de connexion (vérifier que
// l'installation est bien la sienne) et n'est jamais conservé.
//
// Variables d'environnement (Railway) : GITHUB_APP_ID, GITHUB_APP_SLUG,
// GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_PRIVATE_KEY (PEM, les retours
// à la ligne peuvent être écrits « \n »). Sans elles, la fonctionnalité est masquée.
const crypto = require('crypto');

const API = 'https://api.github.com';
const STATE_TTL_MS = 15 * 60 * 1000;

// Remplaçable par les tests d'intégration (GitHub simulé)
const transport = { fetch: (...args) => fetch(...args) };

function config() {
  const e = process.env;
  return {
    appId: e.GITHUB_APP_ID, slug: e.GITHUB_APP_SLUG, clientId: e.GITHUB_APP_CLIENT_ID,
    clientSecret: e.GITHUB_APP_CLIENT_SECRET, privateKey: (e.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };
}
const isConfigured = () => { const c = config(); return !!(c.appId && c.slug && c.clientId && c.clientSecret && c.privateKey); };

class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const b64url = buf => Buffer.from(buf).toString('base64url');

// Jeton de l'application (JWT RS256, 9 min)
function appJwt() {
  const { appId, privateKey } = config();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

async function call(token, method, path, body, { scheme = 'Bearer' } = {}) {
  const res = await transport.fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BlabIA',
      ...(token ? { Authorization: `${scheme} ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new GitHubError(res.status, data?.message || `GitHub a répondu ${res.status}`);
  return data;
}

// Jetons d'installation mis en cache jusqu'à 5 min de leur expiration
const tokenCache = new Map();
async function installationToken(installationId) {
  const cached = tokenCache.get(String(installationId));
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) return cached.token;
  const data = await call(appJwt(), 'POST', `/app/installations/${installationId}/access_tokens`, {});
  tokenCache.set(String(installationId), { token: data.token, expiresAt: new Date(data.expires_at).getTime() });
  return data.token;
}

// Appel à l'API au nom d'une installation. Un jeton porte les permissions du moment de sa
// création : après un changement de permissions (accepté sur GitHub), le jeton en cache
// est refusé (403) ; on en redemande un et on réessaie une fois.
async function gh(installationId, method, path, body) {
  try {
    return await call(await installationToken(installationId), method, path, body);
  } catch (err) {
    if (err.status !== 403 || !tokenCache.has(String(installationId))) throw err;
    tokenCache.delete(String(installationId));
    return call(await installationToken(installationId), method, path, body);
  }
}

// ── Connexion (« Connecter GitHub ») ─────────────────────────────────────────
// L'état transmis à GitHub est signé : il désigne l'utilisateur BlabIA au retour,
// qui arrive par une redirection du navigateur (sans en-tête d'authentification).
// Page de retour : profil ou page Développements d'un projet (jamais une adresse externe)
const RETURN_RE = /^\/(profile|projects\/[0-9a-f-]{36}\/developpements)$/;
const safeReturn = r => (RETURN_RE.test(String(r || '')) ? r : '/profile');

function signState(userId, ret) {
  const payload = b64url(JSON.stringify({ u: userId, r: safeReturn(ret), e: Date.now() + STATE_TTL_MS, n: crypto.randomBytes(8).toString('hex') }));
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { u, r, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return e > Date.now() && u ? { userId: u, ret: safeReturn(r) } : null;
  } catch { return null; }
}

const authorizeUrl = state => `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(config().clientId)}&state=${encodeURIComponent(state)}`;
const installUrl = state => `https://github.com/apps/${config().slug}/installations/new?state=${encodeURIComponent(state)}`;

// Code OAuth → compte GitHub + installation de l'application accessible à ce compte
async function resolveConnection(code) {
  const { clientId, clientSecret } = config();
  const res = await transport.fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'BlabIA' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new GitHubError(400, data.error_description || 'Connexion GitHub refusée');
  const userToken = data.access_token;
  const me = await call(userToken, 'GET', '/user');
  const { installations = [] } = await call(userToken, 'GET', '/user/installations') || {};
  // De préférence l'installation sur le compte personnel
  const inst = installations.find(i => i.account?.login === me.login) || installations[0] || null;
  return { login: me.login, installationId: inst ? String(inst.id) : null };
}

// Dépôts auxquels l'installation donne accès
async function listRepos(installationId) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const data = await gh(installationId, 'GET', `/installation/repositories?per_page=100&page=${page}`);
    out.push(...(data?.repositories || []).map(r => ({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch })));
    if (!data || data.repositories.length < 100) break;
  }
  return out;
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

module.exports = {
  transport, config, isConfigured, GitHubError, appJwt, installationToken, gh, call,
  signState, verifyState, safeReturn, authorizeUrl, installUrl, resolveConnection, listRepos, REPO_RE,
  _resetCache: () => tokenCache.clear(),
};
