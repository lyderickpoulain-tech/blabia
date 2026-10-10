// Vue d'ensemble du dépôt GitHub d'un projet (v5.1), pour que le guide de mise en place et
// sa discussion s'appuient sur la VRAIE structure du code : parties (dossiers), scripts,
// framework détecté, fichiers de configuration, NOMS des variables attendues.
// Lu avec l'installation GitHub du propriétaire. Jamais de valeur de variable : seulement
// les noms trouvés dans les fichiers d'exemple (.env.example).
const github = require('./github');

const MAX_PARTS = 6;
const SKIP_DIRS = /^(\.|node_modules$|dist$|build$|docs?$|public$|assets$|scripts?$|tests?$|supabase$)/i;
const CONFIG_RE = /^(vite\.config\.[jt]s|next\.config\.[cm]?[jt]s|astro\.config\.[cm]?[jt]s|nuxt\.config\.[jt]s|svelte\.config\.js|angular\.json|Dockerfile|railway\.(json|toml)|nixpacks\.toml|Procfile|vercel\.json|netlify\.toml|requirements\.txt|pyproject\.toml|composer\.json|Gemfile|index\.html|Caddyfile)$/;
const ENV_EXAMPLE_RE = /^\.env\.(example|sample|template)$/;
const FRAMEWORKS = ['next', 'astro', 'nuxt', 'vite', '@sveltejs/kit', 'react-scripts', '@angular/core', 'express', 'fastify', '@nestjs/core', 'koa', 'hono'];

const unb64 = s => Buffer.from(String(s || '').replace(/\n/g, ''), 'base64').toString('utf8');

async function list(inst, repo, dir) {
  try {
    const items = await github.gh(inst, 'GET', `/repos/${repo}/contents/${dir}`);
    return Array.isArray(items) ? items : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}
async function read(inst, repo, path) {
  try { return unb64((await github.gh(inst, 'GET', `/repos/${repo}/contents/${path}`)).content); } catch { return null; }
}

// Une partie du dépôt (racine ou dossier) : ce qu'un hébergeur doit savoir pour la déployer
async function describePart(inst, repo, dir, items) {
  const files = items.filter(i => i.type === 'file').map(i => i.name);
  const configs = files.filter(f => CONFIG_RE.test(f));
  const pkgText = files.includes('package.json') ? await read(inst, repo, `${dir ? `${dir}/` : ''}package.json`) : null;
  let pkg = null;
  try { pkg = pkgText ? JSON.parse(pkgText) : null; } catch { /* package.json illisible */ }
  const envFile = files.find(f => ENV_EXAMPLE_RE.test(f));
  const envText = envFile ? await read(inst, repo, `${dir ? `${dir}/` : ''}${envFile}`) : null;
  const envNames = envText ? [...envText.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map(m => m[1]) : [];
  if (!pkg && !configs.length && !envNames.length) return null;
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  return {
    dir: dir || '(racine)',
    name: pkg?.name || null,
    scripts: pkg?.scripts || {},
    frameworks: FRAMEWORKS.filter(f => deps[f]),
    configs, envNames,
  };
}

async function repoOverview(inst, repo) {
  const root = await list(inst, repo, '');
  const parts = [await describePart(inst, repo, '', root)];
  const dirs = root.filter(i => i.type === 'dir' && !SKIP_DIRS.test(i.name)).slice(0, MAX_PARTS);
  for (const d of dirs) parts.push(await describePart(inst, repo, d.name, await list(inst, repo, d.name)));
  return {
    rootFiles: root.filter(i => i.type === 'file').map(i => i.name),
    rootDirs: root.filter(i => i.type === 'dir').map(i => i.name),
    parts: parts.filter(Boolean),
  };
}

// Texte pour les prompts
function formatOverview(repo, o) {
  if (!o) return '';
  const lines = [`Dépôt ${repo} — à la racine : dossiers ${o.rootDirs.join(', ') || '(aucun)'} ; fichiers ${o.rootFiles.join(', ') || '(aucun)'}.`];
  if (!o.parts.length) lines.push('Aucune application détectée (pas de package.json ni de configuration connue).');
  for (const p of o.parts) {
    const scripts = Object.entries(p.scripts).map(([k, v]) => `${k} = « ${v} »`).join(' ; ');
    lines.push(`- Partie « ${p.dir} »${p.name ? ` (${p.name})` : ''}${p.frameworks.length ? ` — ${p.frameworks.join(', ')}` : ''}${scripts ? ` — scripts : ${scripts}` : ' — aucun script'}${p.configs.length ? ` — fichiers : ${p.configs.join(', ')}` : ''}${p.envNames.length ? ` — variables attendues : ${p.envNames.join(', ')}` : ''}`);
  }
  const deployable = o.parts.filter(p => p.dir !== '(racine)');
  if (deployable.length && !o.parts.some(p => p.dir === '(racine)' && Object.keys(p.scripts).length)) {
    lines.push(`ATTENTION : rien à déployer à la racine. Chez l'hébergeur, il faut UN SERVICE PAR PARTIE, avec le « dossier racine » (Root Directory) réglé sur ${deployable.map(p => `/${p.dir}`).join(' ou ')}.`);
  }
  return lines.join('\n');
}

// Pour un projet : vue d'ensemble de son dépôt, ou '' (pas de dépôt, GitHub indisponible)
async function projectRepoText(project) {
  if (!project.githubRepo || !github.isConfigured()) return '';
  const db = require('../utils/db');
  const [owner] = await db('User').where({ id: project.userId }).select('githubInstallationId').limit(1);
  if (!owner?.githubInstallationId) return '';
  try {
    return formatOverview(project.githubRepo, await repoOverview(owner.githubInstallationId, project.githubRepo));
  } catch (err) {
    console.error('[repoOverview]', err.message);
    return '';
  }
}

module.exports = { repoOverview, formatOverview, projectRepoText };
