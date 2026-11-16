// BlabIA + : construction du site d'un projet par un agent hébergé par Anthropic (Managed
// Agents), à partir de la version en cours de son dossier. Décision du porteur du 17/11/2026
// (étude « BlabIA + », phase 5 de la v6) : palier 3 avec Sonnet, sur la clé de BlabIA, dans
// une session au plafond de dépense fixé chez Anthropic. Mesure : 9 pages en 7 minutes, 0,81 $.
//
// Le porteur n'ouvre aucun compte : les fichiers du site sont conservés par BlabIA (SiteFile),
// servis en aperçu (routes/site.js, origine isolée), publiés ensuite. Une retouche repart du
// site existant. Le cœur v6 (services/work/) ne dépend pas de ce module.
const crypto = require('crypto');
const db = require('../../utils/db');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.SITE_MODEL || 'claude-sonnet-5-5';
const BUDGET_CENTS = String(Number(process.env.SITE_BUDGET_CENTS) || 200);
const TIMEOUT_MS = 25 * 60 * 1000;
const STALE_MS = 35 * 60 * 1000;
const RECONNECT_MS = Number(process.env.SITE_RECONNECT_MS) || 5000;
const MAX_FILES = 60;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const OUTPUTS = '/mnt/session/outputs/';
const REPORT = 'RAPPORT.md';

class SiteError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Client Anthropic (remplaçable dans les tests : setClient)
let client = null;
const api = () => client || (client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' }));
const setClient = c => { client = c; };

const SYSTEM = `Tu es développeur web. Tu construis un site vitrine complet, prêt à être mis en ligne, à partir du dossier du projet (/workspace/dossier.md), écrit avec son porteur, qui n'a pas de connaissances techniques.

CONTRAINTES :
- Site statique : HTML, CSS et un peu de JavaScript si utile, sans framework, sans dépendance, sans ressource externe (pas de CDN, pas de police en ligne : polices du système). Il doit s'ouvrir tel quel depuis un hébergement de fichiers statiques.
- TOUS LES FICHIERS À PLAT, sans sous-dossier : index.html, les autres pages, style.css, site.js, les images (svg) côte à côte. Les liens et les chemins sont relatifs et sans dossier (« concerts.html », « style.css »).
- Toutes les pages décrites dans le dossier, avec les VRAIS textes du dossier (jamais de faux texte). Le style suit la partie « Le style » du dossier.
- N'invente rien qui n'est pas dans le dossier : ni adresse de site, ni numéro, ni prix, ni date. Ce qui manque reste absent, ou s'affiche comme « à venir », et figure dans le rapport.
- Ce que le dossier marque « à vérifier » reste, avec un commentaire HTML pour le porteur (pas à l'écran).
- Adapté au téléphone, accessible (contrastes, textes alternatifs, navigation au clavier), en français.
- Référencement : chaque page a un <title> et une <meta name="description"> propres, des balises Open Graph (og:title, og:description, og:type), un seul <h1> ; un fichier robots.txt qui autorise tout ; des données structurées JSON-LD quand le dossier s'y prête (événements pour des concerts, organisation ou personne). Le plan du site (sitemap) sera produit à la mise en ligne, quand l'adresse sera connue.

LIVRAISON : tout le site dans ${OUTPUTS} (index.html à la racine, rien d'autre que le site et le rapport). Avant de finir, vérifie toi-même : chaque lien interne mène à un fichier existant, aucune ressource externe, HTML bien formé (un petit script Python suffit, que tu ne livres pas). Termine par ${OUTPUTS}${REPORT}, en français courant pour le porteur : les pages faites, ce que tu as dû supposer, ce qui reste à faire par lui. Sois économe : pas de relectures inutiles.`;

const RETOUCH = request => `Le site actuel est dans /workspace/site/ (tous ses fichiers, à plat) et le dossier du projet dans /workspace/dossier.md.
DEMANDE DU PORTEUR : ${request}
Applique cette demande, et seulement elle (ne change pas le reste du site). Écris le site COMPLET modifié, tous les fichiers, dans ${OUTPUTS}, puis ${OUTPUTS}${REPORT} : ce qui a changé, et ce qui reste à faire par le porteur.`;

// ── Agent et environnement, créés une fois (AppSetting) ───────────────────────
const promptHash = crypto.createHash('sha256').update(`${MODEL}\n${SYSTEM}`).digest('hex').slice(0, 16);

async function setting(key) {
  const row = await db('AppSetting').where({ key }).first();
  return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
}
async function saveSetting(key, value) {
  await db('AppSetting').insert({ key, value: JSON.stringify(value), updatedAt: new Date() }).onConflict('key').merge();
}

async function ensureAgent() {
  let env = await setting('site.environment');
  if (!env) {
    const created = await api().beta.environments.create({
      name: 'blabia-plus-sites',
      config: { type: 'cloud', networking: { type: 'limited', allow_package_managers: false, allow_mcp_servers: false } },
    });
    env = { id: created.id };
    await saveSetting('site.environment', env);
  }
  let agent = await setting('site.agent');
  if (!agent || agent.hash !== promptHash) { // modèle ou consignes changés : nouvel agent
    const created = await api().beta.agents.create({
      name: `BlabIA + constructeur de sites (${MODEL})`,
      model: MODEL,
      system: SYSTEM,
      tools: [{
        type: 'agent_toolset_20260401',
        default_config: { enabled: true, permission_policy: { type: 'auto' } },
        configs: [{ name: 'web_fetch', enabled: false }, { name: 'web_search', enabled: false }],
      }],
    });
    agent = { id: created.id, version: created.version, hash: promptHash, model: MODEL };
    await saveSetting('site.agent', agent);
  }
  return { environmentId: env.id, agent };
}

// ── Lecture ──────────────────────────────────────────────────────────────────
const latestBuild = projectId => db('SiteBuild').where({ projectId }).orderBy('createdAt', 'desc').first();
const latestReady = projectId => db('SiteBuild').where({ projectId, status: 'ready' }).orderBy('createdAt', 'desc').first();
const isStale = b => b?.status === 'building' && Date.now() - new Date(b.createdAt).getTime() > STALE_MS;

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8', json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json',
};
const contentTypeOf = name => CONTENT_TYPES[String(name).split('.').pop().toLowerCase()] || null;
// Nom de fichier sûr, à plat (le site est livré sans sous-dossier)
const safeName = name => {
  const base = String(name || '').trim(); // aucun chemin : le site est livré à plat
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(base) && !base.includes('..') ? base : null;
};

// ── Une session de l'agent ───────────────────────────────────────────────────
const setStage = (id, stage) => db('SiteBuild').where({ id }).update({ stage });

async function runSession(build, { dossier, previousFiles }) {
  const started = Date.now();
  let sessionId = null;
  try {
    const { environmentId, agent } = await ensureAgent();
    const toFile = Anthropic.toFile;
    const uploaded = await api().files.upload({ file: await toFile(Buffer.from(dossier, 'utf8'), 'dossier.md', { type: 'text/markdown' }) });
    const resources = [{ type: 'file', file_id: uploaded.id, mount_path: '/workspace/dossier.md' }];
    for (const f of previousFiles || []) { // retouche : le site actuel, fichier par fichier
      const up = await api().files.upload({ file: await toFile(Buffer.from(f.content), f.path, { type: f.contentType.split(';')[0] }) });
      resources.push({ type: 'file', file_id: up.id, mount_path: `/workspace/site/${f.path}` });
    }
    const session = await api().beta.sessions.create({
      agent: { type: 'agent', id: agent.id, version: agent.version },
      environment_id: environmentId,
      title: `BlabIA + : ${build.kind === 'retouch' ? 'retouche' : 'construction'} ${build.id}`,
      resources,
      budget: { type: 'limit', max_list_cost: { amount: BUDGET_CENTS, currency: 'USD' } },
      metadata: { blabia_project: build.projectId, blabia_build: build.id },
    });
    sessionId = session.id;
    await db('SiteBuild').where({ id: build.id }).update({ agentSession: sessionId, stage: 'reading', model: agent.model });

    const text = build.kind === 'retouch' ? RETOUCH(build.request) : 'Construis le site à partir du dossier /workspace/dossier.md.';
    const deadline = Date.now() + TIMEOUT_MS;
    const timer = setTimeout(() => {
      api().beta.sessions.events.send(sessionId, { events: [{ type: 'user.interrupt' }] }).catch(() => {});
    }, TIMEOUT_MS);
    let actions = 0, stop = null, first = true;
    try {
      // Le flux d'événements peut se couper avant la fin du travail (constaté au premier essai réel,
      // après 2 min 24) : on relit l'état de la session et on se reconnecte tant qu'elle travaille
      while (!stop && Date.now() < deadline) {
        const stream = await api().beta.sessions.events.stream(sessionId);
        if (first) {
          await api().beta.sessions.events.send(sessionId, { events: [{ type: 'user.message', content: [{ type: 'text', text }] }] });
          first = false;
        }
        for await (const ev of stream) {
          if (ev.type === 'agent.tool_use') {
            actions++;
            if (actions === 1) await setStage(build.id, 'writing');
            // Seuls les outils du bac à sable de l'agent sont permis ; rien d'autre ne tourne sans surveillance
            if (ev.evaluated_permission === 'ask') {
              const ok = ['bash', 'read', 'write', 'edit', 'glob', 'grep'].includes(ev.name);
              await api().beta.sessions.events.send(sessionId, { events: [{ type: 'user.tool_confirmation', tool_use_id: ev.id, result: ok ? 'allow' : 'deny' }] });
            }
          }
          if (ev.type === 'session.status_idle') {
            const reason = ev.stop_reason?.type || 'end_turn';
            if (reason !== 'requires_action') { stop = reason; break; }
          }
          if (ev.type === 'session.status_terminated') { stop = 'terminated'; break; }
        }
        if (stop) break;
        // Flux coupé : la session a-t-elle fini entre-temps ?
        const s = await api().beta.sessions.retrieve(sessionId);
        if (s?.status === 'terminated') stop = 'terminated';
        else if (s?.status === 'idle') stop = Number(s?.usage?.list_cost?.amount || 0) >= Number(BUDGET_CENTS) ? 'budget_reached' : 'end_turn';
        else await new Promise(r => setTimeout(r, RECONNECT_MS));
      }
    } finally { clearTimeout(timer); }

    await setStage(build.id, 'saving');
    const done = await api().beta.sessions.retrieve(sessionId);
    const cost = Number(done?.usage?.list_cost?.amount || 0) / 100;
    await recordCost(build, done, cost);

    // Fichiers produits (à plat), le rapport à part
    const files = [];
    let report = null;
    for await (const f of api().beta.files.list({ scope_id: sessionId, betas: ['managed-agents-2026-04-01'] })) {
      const name = safeName(f.filename);
      if (!name) continue;
      let buf;
      try { buf = Buffer.from(await (await api().beta.files.download(f.id)).arrayBuffer()); } catch { continue; } // fichier d'entrée : pas téléchargeable
      if (name === REPORT) { report = buf.toString('utf8').slice(0, 20000); continue; }
      const type = contentTypeOf(name);
      if (!type || buf.length > MAX_FILE_BYTES || files.length >= MAX_FILES) continue;
      if (/\.py$/i.test(name)) continue; // les scripts de vérification de l'agent ne sont pas le site
      files.push({ path: name, contentType: type, size: buf.length, content: buf });
    }
    if (!files.some(f => f.path === 'index.html')) {
      const why = stop === 'budget_reached' ? 'La construction a atteint son plafond avant la fin.' : 'Le site reçu était incomplet.';
      throw new SiteError(`${why} Vous pouvez réessayer.`, 502);
    }
    await db.transaction(async trx => {
      await trx('SiteFile').insert(files.map(f => ({ id: crypto.randomUUID(), buildId: build.id, ...f })));
      await trx('SiteBuild').where({ id: build.id }).update({
        status: 'ready', stage: null, report, costUSD: cost, durationMs: Date.now() - started, finishedAt: new Date(),
      });
    });
  } catch (err) {
    console.error('[site/build]', err.message);
    const message = err instanceof SiteError ? err.message : 'Le site n’a pas pu être construit. Vous pouvez réessayer.';
    await db('SiteBuild').where({ id: build.id }).update({ status: 'failed', stage: null, error: message, durationMs: Date.now() - started, finishedAt: new Date() }).catch(() => {});
  } finally {
    if (sessionId) api().beta.sessions.archive(sessionId).catch(() => {}); // refusé si elle tourne encore : elle s'arrête seule au plafond
  }
}

// Coût de la session au journal (UsageLog), comme tout appel à l'IA
async function recordCost(build, session, cost) {
  const u = session?.usage || {};
  await db('UsageLog').insert({
    userId: build.createdBy || null, projectId: build.projectId, sessionId: null,
    kind: build.kind === 'retouch' ? 'site/retouch' : 'site/build', model: build.model || MODEL,
    inputTokens: Number(u.input_tokens || 0), outputTokens: Number(u.output_tokens || 0),
    cacheWriteTokens: Number(u.cache_creation_input_tokens || 0), cacheReadTokens: Number(u.cache_read_input_tokens || 0),
    webSearches: 0, costUSD: cost, billedTo: 'blabia',
  }).catch(err => console.error('[site/cost]', err.message));
}

// ── Points d'entrée ──────────────────────────────────────────────────────────
async function dossierOf(projectId) {
  const project = await db('Project').where({ id: projectId }).first();
  const work = await db('Work').where({ projectId }).first();
  if (!work?.currentVersion) throw new SiteError('Le dossier de votre site n’a pas encore de première version.', 409);
  const version = await db('WorkVersion').where({ workId: work.id, number: work.currentVersion }).first();
  return { project, work, text: `# ${project.name} (version ${version.number} du dossier)\n\n${version.content}` };
}

async function claim(projectId) {
  const last = await latestBuild(projectId);
  if (last?.status === 'building' && !isStale(last)) throw new SiteError('Votre site est déjà en cours de construction.', 409);
  if (last && isStale(last)) await db('SiteBuild').where({ id: last.id }).update({ status: 'failed', error: 'La construction a été interrompue. Vous pouvez réessayer.' });
}

async function startBuild(projectId, userId, { wait = false } = {}) {
  const { work, text } = await dossierOf(projectId);
  if (work.template !== 'site') throw new SiteError('Ce projet ne décrit pas un site.', 400);
  await claim(projectId);
  const [build] = await db('SiteBuild').insert({
    id: crypto.randomUUID(), projectId, workId: work.id, baseVersion: work.currentVersion, kind: 'build',
    status: 'building', stage: 'starting', model: MODEL, previewToken: crypto.randomBytes(24).toString('hex'), createdBy: userId, createdAt: new Date(),
  }).returning('*');
  const job = runSession(build, { dossier: text });
  if (wait) await job;
  return build.id;
}

async function startRetouch(projectId, userId, request, { wait = false } = {}) {
  const text = String(request || '').trim().slice(0, 3000);
  if (!text) throw new SiteError('Écrivez ce que vous voulez changer sur le site.', 400);
  const parent = await latestReady(projectId);
  if (!parent) throw new SiteError('Votre site n’est pas encore construit.', 409);
  const { work, text: dossier } = await dossierOf(projectId);
  await claim(projectId);
  const previousFiles = await db('SiteFile').where({ buildId: parent.id }).select('path', 'contentType', 'content');
  const [build] = await db('SiteBuild').insert({
    id: crypto.randomUUID(), projectId, workId: work.id, baseVersion: work.currentVersion, kind: 'retouch', request: text, parentId: parent.id,
    status: 'building', stage: 'starting', model: MODEL, previewToken: crypto.randomBytes(24).toString('hex'), createdBy: userId, createdAt: new Date(),
  }).returning('*');
  const job = runSession(build, { dossier, previousFiles });
  if (wait) await job;
  return build.id;
}

// État pour l'écran (« Votre site » sur « Mon projet »)
async function siteState(projectId) {
  const [last, ready] = await Promise.all([latestBuild(projectId), latestReady(projectId)]);
  const shape = b => (!b ? null : {
    id: b.id, kind: b.kind, request: b.request, status: isStale(b) ? 'failed' : b.status, stage: b.stage,
    error: isStale(b) ? 'La construction a été interrompue. Vous pouvez réessayer.' : b.error,
    report: b.report, baseVersion: b.baseVersion, createdAt: b.createdAt, finishedAt: b.finishedAt,
    previewPath: b.status === 'ready' ? `/api/apercu/${b.previewToken}/` : null,
    costUSD: b.costUSD == null ? null : Number(b.costUSD), model: b.model,
  });
  return { last: shape(last), ready: shape(ready) };
}

// Aperçu : un fichier d'une construction prête, par son jeton
async function previewFile(token, name) {
  const build = await db('SiteBuild').where({ previewToken: String(token || ''), status: 'ready' }).first('id');
  if (!build) return null;
  const path = safeName(name || 'index.html');
  if (!path) return null;
  return db('SiteFile').where({ buildId: build.id, path }).first('path', 'contentType', 'content');
}

module.exports = { startBuild, startRetouch, siteState, previewFile, setClient, SiteError, MODEL, SYSTEM, safeName };
