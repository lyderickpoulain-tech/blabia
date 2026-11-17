// v6 : veille mensuelle des outils de BlabIA (décision du porteur du 18/11/2026). Un agent
// programmé chez Anthropic (Managed Agents, « scheduled deployment ») se lance le premier lundi
// du mois : il lit les nouveautés des outils et services de BlabIA, les failles de sécurité et
// les évolutions de la loi utiles, puis écrit un rapport. Il ne modifie RIEN : le porteur lit et
// décide. Le serveur récupère le rapport (vérification horaire), le garde (VeilleReport) et
// l'envoie par e-mail aux administrateurs ; page « Veille » de l'administration.
// Ne tourne qu'en production (ou VEILLE_ENABLED=1) : une seule programmation pour BlabIA.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../utils/db');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.VEILLE_MODEL || 'claude-sonnet-5-5';
const BUDGET_CENTS = String(Number(process.env.VEILLE_BUDGET_CENTS) || 200); // premier rapport réel : 1,51 $ (plafond de 1,50 $ atteint)
// Premier lundi du mois, 7 h (Paris). Anthropic refuse de croiser « jours 1 à 7 » et « lundi »
// dans une même programmation : l'agent se lance chaque lundi et s'arrête aussitôt (≈ 1 centime)
// si ce n'est pas le premier lundi du mois.
const CRON = process.env.VEILLE_CRON || '0 7 * * 1';
const REPORT = 'veille.md';

let client = null;
const api = () => client || (client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'missing' }));
const setClient = c => { client = c; };
const enabled = () => process.env.VEILLE_ENABLED === '1' || (process.env.NODE_ENV === 'production' && process.env.VEILLE_ENABLED !== '0');

// Sites que l'agent peut lire (réseau fermé par défaut ; recherche et lecture limitées à ces sites)
const HOSTS = [
  'docs.anthropic.com', 'docs.claude.com', 'platform.claude.com', 'www.anthropic.com', 'anthropic.com', 'status.anthropic.com',
  'developers.cloudflare.com', 'blog.cloudflare.com', 'www.cloudflare.com',
  'docs.railway.com', 'blog.railway.com', 'railway.com', 'resend.com',
  'github.com', 'docs.github.com', 'github.blog', 'nodejs.org', 'www.npmjs.com', 'expressjs.com', 'www.prisma.io', 'react.dev', 'vite.dev', 'tailwindcss.com', 'www.postgresql.org',
  'owasp.org', 'cyber.gouv.fr', 'www.cert.ssi.gouv.fr', 'www.cnil.fr', 'www.legifrance.gouv.fr', 'eur-lex.europa.eu', 'digital-strategy.ec.europa.eu',
];

// Ce que BlabIA utilise, relu dans le dépôt à chaque démarrage (la veille suit les versions réelles)
function inventory() {
  const read = rel => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8')); } catch { return {}; } };
  const deps = pkg => Object.entries({ ...(pkg.dependencies || {}) }).map(([n, v]) => `${n} ${v}`).join(', ');
  const models = require('./models');
  return `SERVICES : API Claude d'Anthropic (modèles : ${[...new Set([models.DEFAULT_MODEL, models.BUILDER_MODEL, models.ORCHESTRATOR_MODEL])].join(', ')} ; agents hébergés « Managed Agents » pour construire les sites ; recherche web ; mise en cache des consignes), Cloudflare (Workers, stockage KV, Cloudflare for SaaS pour les adresses des porteurs, enregistrement du domaine sites-blabia.com), Railway (hébergement du serveur Node et de la base PostgreSQL, plan Hobby), Resend (e-mails), application GitHub (développements du parcours technique), GitHub Actions (sauvegarde de la base).
SERVEUR (Node, Express) : ${deps(read('server/package.json'))}.
CLIENT (React, Vite) : ${deps(read('client/package.json'))}.`;
}

const SYSTEM = `Tu fais la veille technique, sécurité et juridique de BlabIA, un service en ligne français qui aide des personnes sans connaissances techniques à mener leurs projets avec des assistants d'intelligence artificielle, et construit et héberge leurs sites. Son porteur n'est pas développeur ; il décide de ce qui sera développé.

AVANT TOUT : lance la commande « date +%d » (jour du mois). Si le résultat est supérieur à 07 et que le message ne dit pas « lancement à la main », ce n'est pas le premier lundi du mois : réponds seulement « Pas ce mois-ci », n'écris aucun fichier, et arrête-toi.

TA MISSION, une fois par mois :
1. Repère, pour la période depuis la dernière veille (environ 5 semaines), les nouveautés des outils et services listés dans le message : nouveaux modèles et fonctions de l'API Claude et des agents hébergés, changements de prix, fonctions abandonnées ; nouveautés de Cloudflare et de Railway utiles à BlabIA ; nouvelles versions majeures des composants listés.
2. Repère les failles de sécurité publiées qui touchent les composants ou versions listés (avis de sécurité, CERT-FR, GitHub).
3. Repère les évolutions de la loi utiles aux sites et applications que BlabIA fabrique (CNIL, règlement européen sur l'IA, DSA, LCEN, Code de la consommation).
4. Pour chaque point utile, dis ce qui change, ce que cela apporterait à BlabIA (ou le risque si on ne fait rien), l'effort (petit, moyen, gros) et ta recommandation. Ignore ce qui n'apporte rien à BlabIA.

RÈGLES : uniquement des faits vérifiés sur les sites officiels, chacun avec son lien ; rien d'inventé ; si tu n'as rien trouvé de nouveau sur un sujet, dis-le en une ligne. Tu ne modifies rien et tu ne contactes personne. Français courant, phrases courtes, sans jargon inutile (un terme technique indispensable est expliqué en quelques mots). Deux pages au plus. Sois économe en recherches.

LIVRAISON : écris le rapport dans /mnt/session/outputs/${REPORT}, en Markdown :
# Veille de BlabIA — <mois et année>
## En bref (trois lignes au plus)
## À faire (recommandé) — chaque point : titre, ce qui change, ce que ça apporterait, effort, lien
## Sécurité — failles touchant nos versions, ou « rien de nouveau »
## Loi — ou « rien de nouveau »
## À surveiller — ce qui pourrait servir plus tard
## Sources`;

const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

async function setting(key) {
  const row = await db('AppSetting').where({ key }).first();
  return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
}
const saveSetting = (key, value) => db('AppSetting').insert({ key, value: JSON.stringify(value), updatedAt: new Date() }).onConflict('key').merge();

const kickoff = () => `Fais la veille de ce mois. Date du jour : utilise la date de ta séance.\n\nCE QUE BLABIA UTILISE :\n${inventory()}`;

// Environnement, agent et programmation, créés une fois puis mis à jour si quelque chose change
async function ensureVeille() {
  const state = (await setting('veille')) || {};
  if (!state.environmentId) {
    const env = await api().beta.environments.create({
      name: 'blabia-veille',
      config: { type: 'cloud', networking: { type: 'limited', allow_package_managers: false, allow_mcp_servers: false, allowed_hosts: HOSTS } },
    });
    state.environmentId = env.id;
  }
  const agentHash = hash(`${MODEL}\n${SYSTEM}\n${HOSTS.join(',')}`);
  if (!state.agentId || state.agentHash !== agentHash) {
    const agent = await api().beta.agents.create({
      name: `BlabIA veille (${MODEL})`, model: MODEL, system: SYSTEM,
      tools: [{
        type: 'agent_toolset_20260401',
        default_config: { enabled: true, permission_policy: { type: 'always_allow' } },
        configs: [
          { name: 'web_search', enabled: true, allowed_domains: HOSTS },
          { name: 'web_fetch', enabled: true, allowed_domains: HOSTS },
        ],
      }],
    });
    Object.assign(state, { agentId: agent.id, agentVersion: agent.version, agentHash });
    state.deploymentHash = null; // à reprogrammer avec le nouvel agent
  }
  const events = [{ type: 'user.message', content: [{ type: 'text', text: kickoff() }] }];
  const deploymentHash = hash(`${state.agentId}\n${CRON}\n${BUDGET_CENTS}\n${events[0].content[0].text}`);
  if (state.deploymentHash !== deploymentHash) {
    const body = {
      name: 'BlabIA : veille mensuelle', agent: state.agentId, environment_id: state.environmentId,
      initial_events: events, schedule: { type: 'cron', expression: CRON, timezone: 'Europe/Paris' },
      budget: { type: 'limit', max_list_cost: { amount: BUDGET_CENTS, currency: 'USD' } },
    };
    const dep = state.deploymentId ? await api().beta.deployments.update(state.deploymentId, body) : await api().beta.deployments.create(body);
    Object.assign(state, { deploymentId: dep.id, deploymentHash, upcoming: dep.schedule?.upcoming_runs_at || [] });
  }
  await saveSetting('veille', state);
  return state;
}

// Rapports des séances terminées : gardés, puis envoyés par e-mail aux administrateurs
async function collect() {
  const state = await setting('veille');
  if (!state?.deploymentId) return { collected: 0 };
  let collected = 0;
  const runs = [];
  for await (const run of api().beta.deploymentRuns.list({ deployment_id: state.deploymentId })) runs.push(run);
  for (const id of state.manual || []) runs.push({ id: null, session_id: id, trigger_context: { type: 'manual' } });
  for (const run of runs) {
    if (!run.session_id) continue;
    if (await db('VeilleReport').where({ agentSession: run.session_id }).first('id')) continue;
    const session = await api().beta.sessions.retrieve(run.session_id);
    if (session.status === 'running' || session.status === 'rescheduling') continue; // pas encore finie
    let content = null;
    for await (const f of api().beta.files.list({ scope_id: run.session_id, betas: ['managed-agents-2026-04-01'] })) {
      if (f.filename !== REPORT) continue;
      try { content = Buffer.from(await (await api().beta.files.download(f.id)).arrayBuffer()).toString('utf8').slice(0, 60000); } catch { /* fichier d'entrée */ }
    }
    const cost = Number(session.usage?.list_cost?.amount || 0) / 100;
    await db('VeilleReport').insert({
      id: crypto.randomUUID(), agentSession: run.session_id, runId: run.id, trigger: run.trigger_context?.type || null,
      content, status: content ? 'ready' : 'empty', costUSD: cost, createdAt: new Date(),
    }).onConflict('agentSession').ignore();
    await db('UsageLog').insert({ userId: null, projectId: null, sessionId: null, kind: 'veille', model: MODEL, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, webSearches: 0, costUSD: cost, billedTo: 'blabia' }).catch(() => {});
    api().beta.sessions.archive(run.session_id).catch(() => {});
    collected++;
    if (content) await emailReport(run.session_id, content).catch(err => console.error('[veille] e-mail :', err.message));
  }
  return { collected };
}

async function emailReport(agentSession, content) {
  const admins = await db('User').whereIn('role', ['admin', 'supervisor']).pluck('email');
  if (!admins.length) return;
  const { sendVeilleReport } = require('./email');
  for (const to of admins) await sendVeilleReport(to, content);
  await db('VeilleReport').where({ agentSession }).update({ emailedAt: new Date() });
}

// Lancement à la main (administration) : une séance tout de suite, hors calendrier
async function runNow() {
  const state = await ensureVeille();
  // Une séance hors calendrier, avec la même programmation, mais sans la vérification du jour
  const session = await api().beta.sessions.create({
    agent: state.agentId, environment_id: state.environmentId, title: 'BlabIA : veille (lancement à la main)',
    budget: { type: 'limit', max_list_cost: { amount: BUDGET_CENTS, currency: 'USD' } },
  });
  await api().beta.sessions.events.send(session.id, { events: [{ type: 'user.message', content: [{ type: 'text', text: `Lancement à la main. ${kickoff()}` }] }] });
  await saveSetting('veille', { ...state, manual: [...(state.manual || []), session.id].slice(-12) });
  return { sessionId: session.id };
}

async function status() {
  const state = await setting('veille');
  const reports = await db('VeilleReport').whereNot({ status: 'empty' }).orderBy('createdAt', 'desc').limit(24).select('id', 'trigger', 'status', 'costUSD', 'emailedAt', 'createdAt', 'content');
  return { enabled: enabled(), scheduled: !!state?.deploymentId, upcoming: state?.upcoming || [], reports };
}

// Démarrage du serveur : programmation à jour, puis relevé horaire des rapports
function startVeille() {
  if (!enabled()) return;
  const tick = () => collect().then(r => { if (r.collected) console.log(`[veille] ${r.collected} rapport(s) récupéré(s)`); }).catch(err => console.error('[veille]', err.message));
  setTimeout(() => ensureVeille().then(tick).catch(err => console.error('[veille] programmation :', err.message)), 60 * 1000);
  setInterval(tick, 60 * 60 * 1000).unref?.();
}

module.exports = { ensureVeille, collect, runNow, status, startVeille, setClient, inventory, SYSTEM, CRON, HOSTS };
