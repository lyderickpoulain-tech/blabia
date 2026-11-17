// BlabIA + : mise en ligne du site d'un projet, à une adresse du type
// « le-petrin-sonore.sites-blabia.com », sur le compte Cloudflare de BlabIA (lot 3).
//
// Un seul petit programme (Worker « blabia-sites ») sert tous les sites : il lit l'adresse
// demandée et renvoie le fichier rangé sous « <adresse>/<fichier> » dans un stockage clé-valeur
// (KV). BlabIA installe ce programme une fois (installation idempotente, mémorisée dans
// AppSetting), puis dépose les fichiers de chaque site publié. Le porteur n'ouvre aucun compte.
// Variables : CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SITES_DOMAIN (jamais affichées).
const crypto = require('crypto');
const db = require('../../utils/db');

const SCRIPT = 'blabia-sites';
const NAMESPACE = 'blabia-sites';
const RESERVED = new Set(['www', 'api', 'admin', 'blabia', 'mail', 'smtp', 'ftp', 'app', 'sites', 'static', 'cdn', 'test', 'demo', 'support', 'aide']);

class PublishError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const config = () => ({
  token: process.env.CLOUDFLARE_API_TOKEN, account: process.env.CLOUDFLARE_ACCOUNT_ID, domain: (process.env.SITES_DOMAIN || '').toLowerCase(),
});
const enabled = () => { const c = config(); return !!(c.token && c.account && c.domain); };

// Appel à l'API de Cloudflare (remplaçable dans les tests : setFetch)
let fetchImpl = (...a) => fetch(...a);
const setFetch = f => { fetchImpl = f || ((...a) => fetch(...a)); };
async function cf(method, path, { json, body, headers } = {}) {
  const { token } = config();
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const why = (data.errors || []).map(e => `${e.code} ${e.message}`).join('; ') || res.status;
    throw new Error(`Cloudflare ${method} ${path.replace(/\/accounts\/[^/]+/, '/accounts/…')} : ${why}`);
  }
  return data;
}

// ── Le programme qui sert les sites (exécuté chez Cloudflare) ─────────────────
// Sécurité : seuls les fichiers du site sont servis ; aucune ressource extérieure autorisée par
// défaut (CSP), comme dans les consignes de construction.
const WORKER = `const CSP = "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' mailto:";
const page = (status, text) => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + text + '</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#333"><h1 style="font-size:1.4rem">' + text + '</h1><p>Vérifiez l’adresse, ou revenez à <a href="/">l’accueil du site</a>.</p>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP } });
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('', { status: 405 });
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const suffix = '.' + env.DOMAIN;
    let slug = host.endsWith(suffix) ? host.slice(0, -suffix.length) : await env.SITES.get('host:' + host);
    if (!slug || slug.includes('.')) return page(404, 'Ce site n’existe pas');
    let path = '';
    try { path = decodeURIComponent(url.pathname).replace(/^\\/+/, ''); } catch { return page(404, 'Page introuvable'); }
    if (!path) path = 'index.html';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path)) return page(404, 'Page introuvable');
    let found = await env.SITES.getWithMetadata(slug + '/' + path, { type: 'arrayBuffer' });
    if (!found.value && !path.includes('.')) found = await env.SITES.getWithMetadata(slug + '/' + path + '.html', { type: 'arrayBuffer' });
    if (!found.value) {
      if (!(await env.SITES.get(slug + '/index.html', { type: 'arrayBuffer' }))) return page(404, 'Ce site n’est pas en ligne');
      return page(404, 'Page introuvable');
    }
    return new Response(request.method === 'HEAD' ? null : found.value, { headers: {
      'Content-Type': (found.metadata && found.metadata.ct) || 'application/octet-stream',
      'Cache-Control': 'public, max-age=300', 'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    } });
  },
};
`;
const workerHash = () => crypto.createHash('sha256').update(WORKER).digest('hex').slice(0, 16);

// ── Installation, une fois (rejouée si le programme change) ──────────────────
async function setting(key) {
  const row = await db('AppSetting').where({ key }).first();
  return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
}
const saveSetting = (key, value) => db('AppSetting').insert({ key, value: JSON.stringify(value), updatedAt: new Date() }).onConflict('key').merge();

async function zoneId(domain) {
  const { result } = await cf('GET', `/zones?name=${encodeURIComponent(domain)}`);
  if (!result?.[0]) throw new PublishError('La mise en ligne des sites est momentanément indisponible.', 503);
  return result[0].id;
}

async function ensureInfra() {
  if (!enabled()) throw new PublishError('La mise en ligne des sites n’est pas encore ouverte.', 503);
  const { account, domain } = config();
  const state = (await setting('sites.cloudflare')) || {};
  if (state.domain === domain && state.workerHash === workerHash() && state.namespaceId && state.routeOk && state.dnsOk) return state;

  // Stockage des fichiers
  if (!state.namespaceId) {
    const { result } = await cf('GET', `/accounts/${account}/storage/kv/namespaces?per_page=100`);
    const found = (result || []).find(n => n.title === NAMESPACE);
    state.namespaceId = found ? found.id : (await cf('POST', `/accounts/${account}/storage/kv/namespaces`, { json: { title: NAMESPACE } })).result.id;
  }
  // Le programme, avec son stockage et son domaine
  if (state.workerHash !== workerHash() || state.domain !== domain) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({
      main_module: 'worker.js', compatibility_date: '2026-10-01',
      bindings: [{ type: 'kv_namespace', name: 'SITES', namespace_id: state.namespaceId }, { type: 'plain_text', name: 'DOMAIN', text: domain }],
    })], { type: 'application/json' }));
    form.append('worker.js', new Blob([WORKER], { type: 'application/javascript+module' }), 'worker.js');
    await cf('PUT', `/accounts/${account}/workers/scripts/${SCRIPT}`, { body: form });
    state.workerHash = workerHash();
  }
  const zone = await zoneId(domain);
  // Toutes les adresses *.domaine vont vers Cloudflare (enregistrement fictif, servi par le programme)
  if (!state.dnsOk || state.domain !== domain) {
    const { result } = await cf('GET', `/zones/${zone}/dns_records?name=${encodeURIComponent(`*.${domain}`)}`);
    if (!result?.length) await cf('POST', `/zones/${zone}/dns_records`, { json: { type: 'AAAA', name: `*.${domain}`, content: '100::', proxied: true, comment: 'BlabIA + : sites des porteurs' } });
    state.dnsOk = true;
  }
  if (!state.routeOk || state.domain !== domain) {
    const pattern = `*.${domain}/*`;
    const { result } = await cf('GET', `/zones/${zone}/workers/routes`);
    if (!(result || []).some(r => r.pattern === pattern)) await cf('POST', `/zones/${zone}/workers/routes`, { json: { pattern, script: SCRIPT } });
    state.routeOk = true;
  }
  state.domain = domain;
  await saveSetting('sites.cloudflare', state);
  return state;
}

// ── Adresse du site ──────────────────────────────────────────────────────────
function slugify(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '') || 'mon-site';
}
const validSlug = s => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s) && !s.includes('--') && !RESERVED.has(s);

async function chooseSlug(projectId, wanted, projectName) {
  if (wanted) {
    const s = String(wanted).trim().toLowerCase();
    if (!validSlug(s)) throw new PublishError('L’adresse ne peut contenir que des lettres sans accent, des chiffres et des tirets (3 à 40 caractères).', 400);
    const taken = await db('SitePublication').where({ slug: s }).whereNot({ projectId }).first('id');
    if (taken) throw new PublishError('Cette adresse est déjà prise : choisissez-en une autre.', 409);
    return s;
  }
  const base = slugify(projectName);
  for (let i = 1; i < 50; i++) {
    const s = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    if (!validSlug(s)) continue;
    if (!(await db('SitePublication').where({ slug: s }).whereNot({ projectId }).first('id'))) return s;
  }
  return `site-${crypto.randomBytes(4).toString('hex')}`;
}

// Plan du site et robots.txt, avec l'adresse réelle (le constructeur ne la connaissait pas)
function seoFiles(files, siteUrl, publishedAt) {
  const day = publishedAt.toISOString().slice(0, 10);
  const pages = files.filter(f => /\.html$/i.test(f.path)).map(f => f.path).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${siteUrl}${p === 'index.html' ? '' : p}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  const robots = files.find(f => f.path === 'robots.txt');
  const robotsText = `${robots ? Buffer.from(robots.content).toString('utf8').replace(/^Sitemap:.*$/gmi, '').trimEnd() : 'User-agent: *\nAllow: /'}\n\nSitemap: ${siteUrl}sitemap.xml\n`;
  return [
    { path: 'sitemap.xml', contentType: 'application/xml; charset=utf-8', content: Buffer.from(sitemap) },
    { path: 'robots.txt', contentType: 'text/plain; charset=utf-8', content: Buffer.from(robotsText) },
  ];
}

const urlOf = slug => `https://${slug}.${config().domain}/`;

async function existingKeys(namespaceId, slug) {
  const { account } = config();
  const keys = [];
  let cursor = '';
  do {
    const data = await cf('GET', `/accounts/${account}/storage/kv/namespaces/${namespaceId}/keys?prefix=${encodeURIComponent(`${slug}/`)}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    keys.push(...(data.result || []).map(k => k.name));
    cursor = data.result_info?.cursor || '';
  } while (cursor);
  return keys;
}

// ── Mettre en ligne (ou mettre à jour) le site d'un projet ───────────────────
async function publish(projectId, userId, { slug: wanted } = {}) {
  const build = await db('SiteBuild').where({ projectId, status: 'ready' }).orderBy('createdAt', 'desc').first();
  if (!build) throw new PublishError('Votre site n’est pas encore construit.', 409);
  const project = await db('Project').where({ id: projectId }).first('name');
  const current = await db('SitePublication').where({ projectId }).first();
  const slug = wanted || !current ? await chooseSlug(projectId, wanted, project.name) : current.slug;
  const infra = await ensureInfra();
  const { account } = config();
  const publishedAt = new Date();
  const files = (await db('SiteFile').where({ buildId: build.id }).select('path', 'contentType', 'content'))
    .filter(f => !['sitemap.xml', 'robots.txt'].includes(f.path) || f.path === 'robots.txt');
  const all = [...files.filter(f => f.path !== 'robots.txt'), ...seoFiles(files, urlOf(slug), publishedAt)];
  await cf('PUT', `/accounts/${account}/storage/kv/namespaces/${infra.namespaceId}/bulk`, {
    json: all.map(f => ({ key: `${slug}/${f.path}`, value: Buffer.from(f.content).toString('base64'), base64: true, metadata: { ct: f.contentType } })),
  });
  // Fichiers d'une version précédente qui n'existent plus ; ancienne adresse si elle a changé
  const keep = new Set(all.map(f => `${slug}/${f.path}`));
  const stale = (await existingKeys(infra.namespaceId, slug)).filter(k => !keep.has(k));
  if (current && current.slug !== slug) stale.push(...await existingKeys(infra.namespaceId, current.slug));
  if (stale.length) await cf('POST', `/accounts/${account}/storage/kv/namespaces/${infra.namespaceId}/bulk/delete`, { json: stale });
  await db('SitePublication').insert({ id: crypto.randomUUID(), projectId, slug, buildId: build.id, status: 'online', publishedAt, createdBy: userId, createdAt: publishedAt })
    .onConflict('projectId').merge({ slug, buildId: build.id, status: 'online', publishedAt });
  return publicationState(projectId);
}

// Retirer le site d'Internet (les fichiers restent dans BlabIA)
async function unpublish(projectId) {
  const pub = await db('SitePublication').where({ projectId }).first();
  if (!pub || pub.status !== 'online') throw new PublishError('Votre site n’est pas en ligne.', 409);
  const infra = await ensureInfra();
  const keys = await existingKeys(infra.namespaceId, pub.slug);
  if (keys.length) await cf('POST', `/accounts/${config().account}/storage/kv/namespaces/${infra.namespaceId}/bulk/delete`, { json: keys });
  await db('SitePublication').where({ id: pub.id }).update({ status: 'offline' });
  return publicationState(projectId);
}

async function publicationState(projectId) {
  const pub = await db('SitePublication').where({ projectId }).first();
  const ready = await db('SiteBuild').where({ projectId, status: 'ready' }).orderBy('createdAt', 'desc').first('id');
  const project = await db('Project').where({ id: projectId }).first('name');
  return {
    available: enabled(),
    domain: config().domain || null,
    suggestedSlug: pub?.slug || slugify(project?.name),
    online: pub?.status === 'online',
    url: pub?.status === 'online' ? urlOf(pub.slug) : null,
    slug: pub?.slug || null,
    publishedAt: pub?.publishedAt || null,
    upToDate: !!(pub?.status === 'online' && ready && pub.buildId === ready.id),
  };
}

module.exports = { publish, unpublish, publicationState, ensureInfra, setFetch, PublishError, slugify, validSlug, WORKER };
