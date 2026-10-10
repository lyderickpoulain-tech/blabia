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
  if (!res.ok) {
    // Le détail utile est souvent dans errors[] (ex. « name already exists on this account »)
    const detail = (Array.isArray(data?.errors) ? data.errors : []).map(e => e?.message || e?.code).filter(Boolean).join(' ; ');
    throw new GitHubError(res.status, [data?.message || `GitHub a répondu ${res.status}`, detail].filter(Boolean).join(' — '));
  }
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

// extra : action à mener au retour, ex. { a: 'create', p: projectId, n: nom, v: privé ? 1 : 0 }
// (création d'un dépôt : elle exige le jeton de l'UTILISATEUR, obtenu par ce retour)
function signState(userId, ret, extra = null) {
  const payload = b64url(JSON.stringify({ u: userId, r: safeReturn(ret), e: Date.now() + STATE_TTL_MS, n: crypto.randomBytes(8).toString('hex'), ...(extra ? { x: extra } : {}) }));
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || '').update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { u, r, e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return e > Date.now() && u ? { userId: u, ret: safeReturn(r), extra: x || null } : null;
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
  // userToken : jamais conservé, seulement utilisé pendant ce retour (création de dépôt)
  return { login: me.login, installationId: inst ? String(inst.id) : null, allRepos: inst?.repository_selection === 'all', userToken };
}

// ── Création d'un dépôt (projet « à créer de zéro ») ─────────────────────────
// Nom proposé à partir du nom du projet : minuscules, sans accents, tirets
function repoSlug(name) {
  const slug = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60).replace(/[-.]+$/, '');
  return slug || 'mon-site';
}
const REPO_NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;

// Crée le dépôt sur le compte de l'utilisateur, avec son jeton (permission « Administration »
// de l'application). Nom déjà pris : essaie « nom-2 », « nom-3 »… Renvoie le dépôt GitHub.
async function createRepo(userToken, { name, description, isPrivate }) {
  for (let i = 1; i <= 5; i++) {
    const candidate = i === 1 ? name : `${name}-${i}`;
    try {
      return await call(userToken, 'POST', '/user/repos', {
        name: candidate, description: String(description || '').slice(0, 300), private: !!isPrivate,
        auto_init: true, has_wiki: false, has_projects: false, delete_branch_on_merge: true,
      });
    } catch (err) {
      if (err.status !== 422 || !/already exists|name already/i.test(err.message)) throw err;
    }
  }
  throw new GitHubError(422, 'Ce nom de dépôt est déjà pris : choisissez-en un autre.');
}

// Ouvre le nouveau dépôt à l'application quand elle n'a accès qu'à des dépôts choisis
async function addRepoToInstallation(userToken, installationId, repoId) {
  await call(userToken, 'PUT', `/user/installations/${installationId}/repositories/${repoId}`);
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
  repoSlug, REPO_NAME_RE, createRepo, addRepoToInstallation,
  _resetCache: () => tokenCache.clear(),
};
