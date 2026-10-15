// Exécution des missions des agents (v5.1) en arrière-plan.
// Un sous-agent travaille seul (sans pouvoir questionner l'humain), avec la recherche
// web, la lecture de pages et la lecture des documents du projet, sous un PLAFOND de
// coût : à ~75 % du plafond, il rédige son rapport avec ce qu'il a, sans nouvel outil.
// Le rapport rejoint les documents de référence du projet (lus aux réunions suivantes).
//
// Déclenchement : à la validation d'une mission, par une vérification périodique dans
// le serveur, et par POST /api/reminders/run (cron externe). Une mission à la fois ;
// une mission restée « en cours » après un redémarrage est relancée une fois.
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const anthropic = require('./anthropic');
const { costUSD } = require('./pricing');
const { runWithUsage } = require('./usage');
const { DEFAULT_MODEL } = require('./models');
const { buildWebSearchTool } = require('./webSearchTool');
const { KIND_LABEL, LEVELS, levelOf } = require('./missions');
const { memoryForPrompt, appendMemory, missionDigest } = require('../utils/projectMemory');
// appendMemory / missionDigest : intégration du compte rendu, au choix de l'humain (integrateMission)
const { codeAccess, sourcePaths, compactTree, readFile } = require('./codeContext');

const MAX_STEPS = 10;
const FINALIZE_AT = 0.75;           // part du plafond à partir de laquelle on rédige
const STALE_MS = 20 * 60 * 1000;    // « en cours » depuis plus longtemps : redémarrage du serveur
const MAX_ATTEMPTS = 2;
const DOC_MAX_CHARS = 30000;
const CODE_FILE_MAX_CHARS = 20000;

const TOOLS = [
  buildWebSearchTool({ maxUses: 5 }),
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6, max_content_tokens: 8000 },
  { name: 'list_project_documents', description: 'Liste les documents de référence du projet (nom et taille).',
    input_schema: { type: 'object', properties: {} } },
  { name: 'read_project_document', description: 'Lit le texte d\'un document de référence du projet, par son nom exact.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Nom exact du document' } }, required: ['name'] } },
];

// Projet relié à un dépôt GitHub : le sous-agent lit le code quand la mission le demande
const CODE_TOOLS = [
  { name: 'list_code_files', description: 'Liste les fichiers source du dépôt GitHub du projet (arborescence : un dossier par ligne).',
    input_schema: { type: 'object', properties: {} } },
  { name: 'read_code_file', description: 'Lit un fichier source du dépôt GitHub du projet, par son chemin exact (tel que donné par list_code_files).',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Chemin exact, ex. client/src/App.jsx' } }, required: ['path'] } },
];

const FINALIZE = 'Budget de la mission presque atteint : n\'utilise plus aucun outil et rédige MAINTENANT le rapport final avec ce que tu as trouvé, en signalant ce qui reste à vérifier.';

function buildPrompts(mission, project, { codeReadable = false } = {}) {
  const system = `Tu es un sous-agent de BlabIA. L'agent « ${mission.agentName} » t'a confié une mission pour le projet « ${project.name} », que tu mènes SEUL : tu ne peux pas poser de question à l'humain. Si une information manque, fais une hypothèse explicite et signale-la.

Outils : web_search (trouver des sources), web_fetch (lire une page trouvée), list_project_documents et read_project_document (documents fournis par l'humain : lis-les d'abord s'ils concernent la mission).${codeReadable ? `
Code du site : list_code_files et read_code_file lisent le dépôt GitHub ${project.githubRepo}. Si la mission porte sur le site lui-même (fonctionnement, écran, règle, audit, ce qui existe déjà), lis le code concerné AVANT de conclure et cite les fichiers ; sinon, ne l'ouvre pas.` : ''}
Sois économe : budget limité, va à l'essentiel, pas de recherche redondante.
N'invente AUCUN chiffre ni AUCUNE source. Écris en français, simplement.

Rapport final en Markdown, exactement dans cet ordre :
# <titre de la mission>
## Synthèse
(5 lignes maximum : ce qu'il faut retenir)
## Résultats
(détail ; un tableau quand tu compares au moins 3 éléments)
## Recommandation
## Limites et points à vérifier
## Sources
(liste de liens [titre](url) réellement consultés)`;
  const user = `Mission (${KIND_LABEL[mission.kind] || 'Recherche'}) : ${mission.title}

Objectif : ${mission.objective}
${mission.deliverable ? `Livrable attendu : ${mission.deliverable}\n` : ''}
Contexte du projet :
${project.brief || '(pas de brief)'}
${memoryForPrompt(project) ? `\nMémoire du projet :\n${memoryForPrompt(project)}` : ''}`;
  return { system, user };
}

// Sources consultées : résultats de recherche, pages lues, citations
function collectSources(content, into) {
  const add = (url, title) => { if (url && !into.has(url) && into.size < 30) into.set(url, { url, title: title || url }); };
  for (const b of content || []) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(r => add(r.url, r.title));
    if (b.type === 'web_fetch_tool_result' && b.content?.url) add(b.content.url, b.content.content?.title);
    if (b.type === 'text') (b.citations || []).forEach(c => add(c.url, c.title));
  }
}

async function runClientTool(block, projectId, code = null) {
  if (code && block.name === 'list_code_files') {
    code.paths = code.paths || await sourcePaths(code.inst, code.repo);
    return code.paths.length ? compactTree(code.paths) : 'Aucun fichier source dans le dépôt.';
  }
  if (code && block.name === 'read_code_file') {
    const content = await readFile(code.inst, code.repo, String(block.input?.path || ''));
    if (content == null) return { error: true, text: 'Fichier introuvable : utilise list_code_files pour avoir les chemins exacts.' };
    return content.length > CODE_FILE_MAX_CHARS ? `${content.slice(0, CODE_FILE_MAX_CHARS)}\n[… fichier tronqué]` : content;
  }
  if (block.name === 'list_project_documents') {
    const docs = await db('ProjectDocument').where({ projectId, enabled: true }).select('name', 'charCount');
    return docs.length ? docs.map(d => `- ${d.name} (${d.charCount} caractères)`).join('\n') : 'Aucun document de référence.';
  }
  if (block.name === 'read_project_document') {
    const [doc] = await db('ProjectDocument').where({ projectId, enabled: true, name: String(block.input?.name || '') }).select('content').limit(1);
    if (!doc) return { error: true, text: 'Document introuvable : utilise list_project_documents pour avoir les noms exacts.' };
    return doc.content.length > DOC_MAX_CHARS ? `${doc.content.slice(0, DOC_MAX_CHARS)}\n[… document tronqué]` : doc.content;
  }
  return { error: true, text: `Outil inconnu : ${block.name}` };
}

// Mène une mission jusqu'au rapport ; renvoie { report, sources, cost }
// Outils et modèle selon le niveau de la mission (légère / standard / approfondie)
function settingsFor(mission) {
  const lv = LEVELS[levelOf(mission.level)];
  const tools = TOOLS.map(t => (t.name === 'web_search' ? buildWebSearchTool({ maxUses: lv.searches }) : t.name === 'web_fetch' ? { ...t, max_uses: lv.fetches } : t));
  return { tools, maxSteps: lv.maxSteps, model: lv.model || DEFAULT_MODEL };
}

async function executeMission(mission, project) {
  const inst = await codeAccess(project);
  const code = inst ? { inst, repo: project.githubRepo } : null;
  const { system, user } = buildPrompts(mission, project, { codeReadable: !!code });
  const settings = settingsFor(mission);
  const { maxSteps, model } = settings;
  const tools = code ? [...settings.tools, ...CODE_TOOLS] : settings.tools;
  const messages = [{ role: 'user', content: user }];
  const sources = new Map();
  let spent = 0;
  let report = '';

  for (let step = 0; step < maxSteps && !report; step++) {
    const finalizing = spent >= mission.budgetUSD * FINALIZE_AT || step === maxSteps - 1;
    if (finalizing) {
      const last = messages[messages.length - 1];
      if (last.role === 'user' && Array.isArray(last.content)) last.content.push({ type: 'text', text: FINALIZE });
      else if (last.role === 'user') last.content = `${last.content}\n\n${FINALIZE}`;
      else messages.push({ role: 'user', content: FINALIZE });
    }
    // Cache : consignes fixes (point de cache explicite) + conversation qui grossit à chaque
    // étape (cache automatique) ; sans lui, chaque étape repayait tout ce qui précède
    const response = await anthropic.messages.create({
      model, max_tokens: 4000, messages, tools,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      cache_control: { type: 'ephemeral' },
      ...(finalizing ? { tool_choice: { type: 'none' } } : {}),
    });
    spent += costUSD(response.model || model, response.usage);
    collectSources(response.content, sources);
    messages.push({ role: 'assistant', content: response.content });

    if (!finalizing && response.stop_reason === 'tool_use') {
      const results = [];
      for (const b of response.content.filter(x => x.type === 'tool_use')) {
        const out = await runClientTool(b, mission.projectId, code);
        results.push({ type: 'tool_result', tool_use_id: b.id, content: typeof out === 'string' ? out : out.text, ...(out?.error ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    if (!finalizing && response.stop_reason === 'pause_turn') continue; // recherche longue : on relance
    report = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    // Le rapport commence à son titre : on retire la phrase d'annonce éventuelle (« Je rédige le rapport. »)
    const titleAt = report.search(/^# /m);
    if (titleAt > 0) report = report.slice(titleAt).trim();
    if (!report && !finalizing) messages.push({ role: 'user', content: FINALIZE });
  }
  return { report, sources: [...sources.values()], cost: spent };
}

let running = false;

// Traite les missions en attente, une à la fois
async function processMissions() {
  if (running) return { processed: 0 };
  running = true;
  let processed = 0;
  try {
    // Missions « en cours » abandonnées par un redémarrage : relancées une fois, sinon échouées
    const stale = new Date(Date.now() - STALE_MS);
    await db('AgentMission').where({ status: 'running' }).where('startedAt', '<', stale).where('attempts', '<', MAX_ATTEMPTS).update({ status: 'queued' });
    await db('AgentMission').where({ status: 'running' }).where('startedAt', '<', stale).update({ status: 'failed', error: 'Interrompue (redémarrage du serveur).', finishedAt: new Date() });

    for (;;) {
      // Réservation atomique de la plus ancienne mission en attente
      const { rows } = await db.raw(`UPDATE "AgentMission" SET status = 'running', "startedAt" = now(), attempts = attempts + 1
        WHERE id = (SELECT id FROM "AgentMission" WHERE status = 'queued' ORDER BY "approvedAt" ASC NULLS LAST LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING *`);
      const mission = rows[0];
      if (!mission) break;
      processed++;
      await runOne(mission);
    }
  } finally {
    running = false;
  }
  return { processed };
}

async function runOne(mission) {
  const [project] = await db('Project').where({ id: mission.projectId }).limit(1);
  try {
    if (!project) throw new Error('Projet introuvable');
    const { report, sources, cost } = await runWithUsage(
      { projectId: mission.projectId, sessionId: mission.sessionId, kind: 'mission', userId: mission.approvedBy },
      () => executeMission(mission, project),
    );
    if (!report) throw new Error('Aucun rapport produit.');
    const sourcesMd = sources.length && !/##\s*Sources/i.test(report)
      ? `\n\n## Sources consultées\n${sources.map(s => `- [${s.title}](${s.url})`).join('\n')}` : '';
    const content = `${report}${sourcesMd}`;
    const [doc] = await db('ProjectDocument').insert({
      id: randomUUID(), projectId: mission.projectId, name: `Mission — ${mission.title}`.slice(0, 200), mimeType: 'text/markdown',
      // Inactif tant que l'humain n'a pas choisi « Intégrer le CR au projet » (routes/missions.js)
      sizeBytes: Buffer.byteLength(content), charCount: content.length, content, enabled: false, createdAt: new Date(), createdBy: mission.approvedBy,
    }).returning('id');
    await db('AgentMission').where({ id: mission.id }).update({
      status: 'done', report: content, sources: JSON.stringify(sources), costUSD: cost,
      documentId: doc.id ?? doc, finishedAt: new Date(), error: null,
    });
    // Mission d'une réunion reportée : son action est cochée, la réunion de reprise est débloquée
    if (mission.todoId) await db('TodoItem').where({ id: mission.todoId, source: 'mission' }).whereIn('status', ['todo', 'in_progress']).update({ status: 'done' });
    // v5.1 (15/10/2026) : la mémoire du projet n'est plus alimentée d'office — l'humain choisit
    // d'intégrer le compte rendu au projet ou non (integrateMission, routes/missions.js).
  } catch (err) {
    console.error(`[missions] ${mission.id} :`, err.message);
    await db('AgentMission').where({ id: mission.id }).update({ status: 'failed', error: String(err.message).slice(0, 500), finishedAt: new Date() });
  }
}

// Lancement sans attendre (après une validation)
function kickMissions() {
  setImmediate(() => processMissions().catch(err => console.error('[missions]', err.message)));
}

// « Intégrer le CR au projet » : document actif (lu par les agents), mémoire du projet,
// action d'origine cochée. « Ne pas intégrer » : document retiré, l'action reste à faire.
async function setMissionOutcome(mission, outcome) {
  if (outcome === 'integrated') {
    if (mission.documentId) await db('ProjectDocument').where({ id: mission.documentId }).update({ enabled: true });
    try {
      const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      await appendMemory(mission.projectId, `[MISSION:${mission.id} | ${date} — Mission « ${mission.title} » menée pour ${mission.agentName}]\n${missionDigest(mission.report || '')}\n(Rapport complet : document « Mission — ${mission.title} ».)`);
    } catch (err) { console.error(`[missions] ${mission.id} mémoire :`, err.message); }
    if (mission.todoId) await db('TodoItem').where({ id: mission.todoId, projectId: mission.projectId }).whereIn('status', ['todo', 'in_progress']).update({ status: 'done' });
  } else if (mission.documentId) {
    await db('AgentMission').where({ id: mission.id }).update({ documentId: null });
    await db('ProjectDocument').where({ id: mission.documentId }).del();
  }
  const [m] = await db('AgentMission').where({ id: mission.id }).update({ outcome }).returning('*');
  return m;
}

module.exports = { setMissionOutcome, processMissions, kickMissions, executeMission, collectSources, settingsFor, TOOLS, MAX_STEPS, FINALIZE_AT };
