// Contexte de code d'une réunion (v5.1) : les agents voient le VRAI code du projet au lieu
// de deviner (ex. « le menu Plan » : sans le code, ils ne savaient pas que c'est une entrée
// de la barre latérale d'un projet).
// Réunion Claude Code : toujours. Autres réunions d'un projet relié à un dépôt : seulement si
// le sujet touche au code (jugé par le modèle léger), puis à la demande en cours de réunion
// (question de l'humain ou d'un agent qui demande de lire du code : lookupCode).
// Calculé une fois par réunion (Session.codeContext ; '' = pas de code), au premier tour :
//   1. arborescence du dépôt (fichiers source, chemins seulement) ;
//   2. consignes du dépôt (CLAUDE.md) et début du README ;
//   3. fichiers les plus pertinents pour l'objectif de la réunion, choisis par le modèle
//      léger (repli : mots de l'objectif retrouvés dans les chemins), contenu tronqué.
// Placé dans le bloc commun du prompt des agents (mis en cache) : coût faible par tour.
const github = require('./github');
const anthropic = require('./anthropic');
const db = require('../utils/db');
const { ORCHESTRATOR_MODEL, ORCHESTRATOR_PARAMS } = require('./models');

const MAX_TREE_PATHS = 700;
const MAX_FILES = 6;
const FILE_CHARS = 7000;
const TOTAL_FILE_CHARS = 32000;
const DOC_CHARS = 3000;
const SKIP_PATH_RE = /(^|\/)(node_modules|dist|build|coverage|\.git|\.next|vendor|__snapshots__)\//;
const SOURCE_RE = /\.(jsx?|tsx?|mjs|cjs|vue|svelte|astro|css|scss|html|py|rb|php|go|rs|java|kt|swift|prisma|sql|ya?ml|toml|md)$/i;
const NOISE_RE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.map)$/i;

const unb64 = s => Buffer.from(String(s || '').replace(/\n/g, ''), 'base64').toString('utf8');

async function readFile(inst, repo, path) {
  try {
    const f = await github.gh(inst, 'GET', `/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`);
    return f?.content ? unb64(f.content) : null;
  } catch { return null; }
}

// Chemins des fichiers source de la branche par défaut
async function sourcePaths(inst, repo) {
  const { default_branch: branch } = await github.gh(inst, 'GET', `/repos/${repo}`);
  const tree = await github.gh(inst, 'GET', `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  return (tree?.tree || []).filter(t => t.type === 'blob' && SOURCE_RE.test(t.path) && !SKIP_PATH_RE.test(t.path) && !NOISE_RE.test(t.path))
    .map(t => t.path).slice(0, MAX_TREE_PATHS);
}

// Arborescence compacte : un dossier par ligne, ses fichiers à la suite
function compactTree(paths) {
  const byDir = new Map();
  for (const p of paths) {
    const i = p.lastIndexOf('/');
    const dir = i < 0 ? '.' : p.slice(0, i);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(p.slice(i + 1));
  }
  return [...byDir.entries()].map(([dir, files]) => `${dir}/ : ${files.join(', ')}`).join('\n');
}

// Repli sans IA : fichiers dont le chemin contient des mots de l'objectif
const STOP = new Set(['dans', 'avec', 'pour', 'sans', 'cette', 'mais', 'plus', 'tout', 'tous', 'faire', 'reprenons', 'projet', 'site', 'page', 'une', 'des', 'les', 'qui', 'que', 'pas', 'est']);
function keywordPick(task, paths) {
  const words = String(task).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w));
  return paths.map(p => ({ p, score: words.filter(w => p.toLowerCase().includes(w)).length }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_FILES).map(x => x.p);
}

// Fichiers à lire, choisis par le modèle léger. allowNone : [] si le sujet ne demande pas
// de connaître le code (sinon repli sur les mots de l'objectif)
async function pickRelevant(task, paths, docsText, { allowNone = false, label = 'Objectif de la réunion', max = MAX_FILES } = {}) {
  try {
    const res = await anthropic.messages.create({
      model: ORCHESTRATOR_MODEL, max_tokens: 400, ...ORCHESTRATOR_PARAMS,
      system: 'Tu choisis les fichiers de code à lire pour comprendre une demande. Réponds UNIQUEMENT par un tableau JSON de chemins, sans texte autour.',
      messages: [{ role: 'user', content: `${label} : ${task}\n${docsText ? `\nConsignes du dépôt (extrait) :\n${docsText.slice(0, 1500)}\n` : ''}\nFichiers du dépôt :\n${paths.join('\n')}\n\nDonne au plus ${max} chemins EXACTS, du plus utile au moins utile : les fichiers qui montrent ce dont il est question (écran, composant, style, route, règle de calcul…).${allowNone ? ' Si le sujet ne demande PAS de connaître le code (ex. nom, tarif, public visé, ton, organisation), réponds [].' : ''} Format : ["chemin/a", "chemin/b"]` }],
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const list = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0]);
    const known = new Set(paths);
    const picked = (Array.isArray(list) ? list : []).map(String).filter(p => known.has(p)).slice(0, max);
    return picked.length || allowNone ? picked : keywordPick(task, paths);
  } catch (err) {
    console.error('[codeContext] choix des fichiers :', err.message);
    return keywordPick(task, paths);
  }
}

// Contenu des fichiers choisis, dans une limite de caractères
async function readFiles(inst, repo, picked, totalChars) {
  let budget = totalChars;
  const files = [];
  for (const p of picked) {
    if (budget <= 0) break;
    const content = await readFile(inst, repo, p);
    if (!content) continue;
    const part = content.slice(0, Math.min(FILE_CHARS, budget));
    budget -= part.length;
    files.push(`--- ${p}${part.length < content.length ? ' (début du fichier)' : ''} ---\n${part}`);
  }
  return files;
}

// allowNone : '' quand le sujet ne demande pas de connaître le code
async function buildCodeContext(inst, repo, task, { allowNone = false } = {}) {
  const paths = await sourcePaths(inst, repo);
  if (!paths.length) return '';
  const claudeMd = paths.find(p => /^claude\.md$/i.test(p));
  const readme = paths.find(p => /^readme\.md$/i.test(p));
  const [claude, readmeText] = await Promise.all([claudeMd && readFile(inst, repo, claudeMd), readme && readFile(inst, repo, readme)]);
  const docsText = [claude && `CLAUDE.md :\n${claude.slice(0, DOC_CHARS)}`, readmeText && `README.md :\n${readmeText.slice(0, DOC_CHARS)}`].filter(Boolean).join('\n\n');
  const picked = await pickRelevant(task, paths, docsText, { allowNone });
  if (allowNone && !picked.length) return '';
  const files = await readFiles(inst, repo, picked, TOTAL_FILE_CHARS);
  return [
    `Arborescence (fichiers source) :\n${compactTree(paths)}`,
    docsText,
    files.length ? `FICHIERS LES PLUS UTILES POUR CETTE RÉUNION :\n${files.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

// Installation GitHub du propriétaire si le projet est relié à un dépôt lisible, sinon null
async function codeAccess(project) {
  if (!project?.githubRepo || !github.isConfigured()) return null;
  const [owner] = await db('User').where({ id: project.userId }).select('githubInstallationId').limit(1);
  return owner?.githubInstallationId || null;
}

// Fichiers déjà lus dans un contexte de code
function readPaths(text) {
  return new Set([...String(text || '').matchAll(/^--- (.+?)(?: \(début du fichier\))? ---$/gm)].map(m => m[1]));
}

// Réunion d'un projet relié à un dépôt : contexte calculé une fois, conservé sur la réunion.
// auto (réunion autre que Claude Code) : seulement si le sujet touche au code.
// '' si pas de code utile ou indisponible (GitHub injoignable : nouvel essai au tour suivant).
async function sessionCodeContext(session, project, { auto = false } = {}) {
  if (session.codeContext != null) return session.codeContext;
  const inst = await codeAccess(project);
  if (!inst) return '';
  let text = '';
  try {
    text = await buildCodeContext(inst, project.githubRepo, session.task, { allowNone: auto });
  } catch (err) {
    console.error('[codeContext]', err.message);
    return ''; // non conservé : nouvel essai au tour suivant
  }
  await db('Session').where({ id: session.id }).update({ codeContext: text });
  return text;
}

// Lecture à la demande en cours de réunion : une question (de l'humain ou d'un agent) demande
// de voir du code pas encore lu. Ajoute les fichiers utiles au contexte de la réunion.
// Renvoie { text, files } ou null (rien à lire, plafond atteint, GitHub injoignable).
const MAX_LOOKUPS = 4;
const LOOKUP_CHARS = 20000;
const MAX_CONTEXT_CHARS = 110000;
async function lookupCode(sessionId, project, currentText, question) {
  const current = String(currentText || '');
  if ((current.match(/^LECTURE COMPLÉMENTAIRE/gm) || []).length >= MAX_LOOKUPS || current.length > MAX_CONTEXT_CHARS) return null;
  const inst = await codeAccess(project);
  if (!inst) return null;
  try {
    const paths = await sourcePaths(inst, project.githubRepo);
    const already = readPaths(current);
    const picked = await pickRelevant(question, paths.filter(p => !already.has(p)), '', { allowNone: true, label: 'Question à éclairer par le code', max: 4 });
    if (!picked.length) return null;
    const files = await readFiles(inst, project.githubRepo, picked, LOOKUP_CHARS);
    if (!files.length) return null;
    const tree = /^Arborescence \(fichiers source\)/m.test(current) ? '' : `Arborescence (fichiers source) :\n${compactTree(paths)}\n\n`;
    const text = [current, `${tree}LECTURE COMPLÉMENTAIRE — ${question} :\n${files.join('\n\n')}`].filter(Boolean).join('\n\n');
    await db('Session').where({ id: sessionId }).update({ codeContext: text });
    return { text, files: [...readPaths(files.join('\n'))] };
  } catch (err) {
    console.error('[codeContext] lecture à la demande :', err.message);
    return null;
  }
}

module.exports = { buildCodeContext, sessionCodeContext, lookupCode, codeAccess, readPaths, compactTree, keywordPick, sourcePaths, readFile };
