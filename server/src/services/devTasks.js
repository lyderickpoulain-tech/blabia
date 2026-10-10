// Développements lancés depuis BlabIA (v5.1) : Claude Code dans GitHub Actions.
//
// Parcours : prompt d'une réunion Claude Code → demande (issue) sur le dépôt du projet →
// workflow blabia-dev.yml (Claude Code, abonnement de l'utilisateur) → pull request
// → « Mettre en ligne » (blabia-deploy.yml : sauvegarde chiffrée de la base puis fusion).
// Pas de webhook : l'état est relu auprès de GitHub quand la page est consultée.
// Tout passe par l'installation GitHub du PROPRIÉTAIRE du projet.
const db = require('../utils/db');
const github = require('./github');
const wf = require('./githubWorkflows');

const ACTIVE = ['running', 'deploying'];
const REFRESHABLE = ['running', 'ready', 'deploying'];
const RUN_LOST_MS = 60 * 60 * 1000; // aucune exécution visible au bout d'une heure : échec
const SECRET_CLAUDE = 'CLAUDE_CODE_OAUTH_TOKEN';
const SECRET_DB = 'BLABIA_DB_URL';
const SECRET_BACKUP = 'BLABIA_BACKUP_PASSWORD';

const DB_FILE_RE = /(^|\/)migrations\/|(^|\/)schema\.prisma$|\.sql$/i;

async function ownerOf(project) {
  const [owner] = await db('User').where({ id: project.userId }).select('id', 'githubInstallationId', 'githubLogin').limit(1);
  return owner || null;
}

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const unb64 = s => Buffer.from(String(s || '').replace(/\n/g, ''), 'base64').toString('utf8');

async function readFile(inst, repo, path) {
  try {
    const f = await github.gh(inst, 'GET', `/repos/${repo}/contents/${path}`);
    return { sha: f.sha, content: unb64(f.content) };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// État du dépôt du projet : tout ce qu'il faut pour pouvoir lancer un développement
async function repoStatus(project) {
  const owner = await ownerOf(project);
  const status = {
    appConfigured: github.isConfigured(), connected: !!owner?.githubInstallationId, githubLogin: owner?.githubLogin || null,
    repo: project.githubRepo || null, accessible: false, defaultBranch: null, private: null,
    workflows: { installed: false, current: false }, secrets: { claude: false, db: false, backupPassword: false },
    ready: false, error: null,
  };
  if (!status.appConfigured || !status.connected || !status.repo) return status;
  const inst = owner.githubInstallationId;
  try {
    const repo = await github.gh(inst, 'GET', `/repos/${project.githubRepo}`);
    status.accessible = true;
    status.defaultBranch = repo.default_branch;
    status.private = repo.private;
    const [dev, deploy] = await Promise.all([readFile(inst, project.githubRepo, wf.DEV_PATH), readFile(inst, project.githubRepo, wf.DEPLOY_PATH)]);
    status.workflows = { installed: !!(dev && deploy), current: !!(dev && deploy && wf.isCurrent(dev.content) && wf.isCurrent(deploy.content)) };
    // Noms des secrets seulement : leurs valeurs ne sont jamais lisibles par l'API
    const { secrets = [] } = await github.gh(inst, 'GET', `/repos/${project.githubRepo}/actions/secrets?per_page=100`) || {};
    const names = new Set(secrets.map(s => s.name));
    status.secrets = { claude: names.has(SECRET_CLAUDE), db: names.has(SECRET_DB), backupPassword: names.has(SECRET_BACKUP) };
    // Une base déclarée sans mot de passe de sauvegarde bloquerait toute mise en ligne
    status.ready = status.workflows.current && status.secrets.claude && (!status.secrets.db || status.secrets.backupPassword);
  } catch (err) {
    status.error = err.status === 404 ? 'Dépôt introuvable ou non autorisé pour l’application BlabIA.' : `GitHub : ${err.message}`;
  }
  return status;
}

// Installe (ou met à jour) les deux automatisations sur la branche par défaut
async function installWorkflows(project) {
  const owner = await ownerOf(project);
  const inst = owner.githubInstallationId;
  const files = [
    [wf.DEV_PATH, wf.devWorkflow({ appSlug: github.config().slug })],
    [wf.DEPLOY_PATH, wf.deployWorkflow()],
  ];
  for (const [path, content] of files) {
    const existing = await readFile(inst, project.githubRepo, path);
    if (existing?.content === content) continue;
    await github.gh(inst, 'PUT', `/repos/${project.githubRepo}/contents/${path}`, {
      message: `BlabIA : automatisation ${path.split('/').pop()} (v${wf.WORKFLOW_VERSION})`,
      content: b64(content), ...(existing ? { sha: existing.sha } : {}),
    });
  }
}

const shortTitle = s => String(s || 'Développement').replace(/\s+/g, ' ').trim().slice(0, 90);

async function createTask({ project, session, prompt, userId }) {
  const owner = await ownerOf(project);
  const inst = owner.githubInstallationId;
  const status = await repoStatus(project);
  if (!status.ready) {
    const e = new Error('Le dépôt n’est pas prêt : terminez la configuration dans Projet › Développements.');
    e.status = 409; throw e;
  }
  const title = shortTitle(session?.task);
  const issue = await github.gh(inst, 'POST', `/repos/${project.githubRepo}/issues`, {
    title: `BlabIA : ${title}`,
    body: `${prompt}\n\n---\n_Demande créée par BlabIA${session?.task ? ` (réunion « ${shortTitle(session.task)} »)` : ''}. Claude Code la réalise et ouvre une pull request ; rien n'est mis en ligne sans validation dans BlabIA._`,
  });
  const [task] = await db('DevTask').insert({
    projectId: project.id, sessionId: session?.id || null, createdBy: userId, repo: project.githubRepo,
    title, prompt, status: 'running', issueNumber: issue.number, issueUrl: issue.html_url,
    createdAt: new Date(), // posée ici (et non par la base) : comparée à l'heure du serveur Node
  }).returning('*');
  try {
    await github.gh(inst, 'POST', `/repos/${project.githubRepo}/actions/workflows/blabia-dev.yml/dispatches`, {
      ref: status.defaultBranch, inputs: { issue: String(issue.number) },
    });
  } catch (err) {
    await db('DevTask').where({ id: task.id }).update({ status: 'failed', error: `Lancement refusé par GitHub : ${err.message}`, finishedAt: new Date() });
    throw Object.assign(new Error(`Lancement refusé par GitHub : ${err.message}`), { status: 502 });
  }
  return task;
}

// Pull request → résumé, fichiers modifiés, base de données touchée ?
async function loadPr(inst, repo, prNumber) {
  const pr = await github.gh(inst, 'GET', `/repos/${repo}/pulls/${prNumber}`);
  const files = await github.gh(inst, 'GET', `/repos/${repo}/pulls/${prNumber}/files?per_page=100`) || [];
  return {
    pr,
    patch: {
      prNumber: pr.number, prUrl: pr.html_url,
      summary: String(pr.body || '').replace(/\n*\s*(Closes|Fixes|Resolves) #\d+\s*$/i, '').trim().slice(0, 8000) || null,
      files: JSON.stringify(files.map(f => ({ filename: f.filename, additions: f.additions, deletions: f.deletions }))),
      touchesDatabase: files.some(f => DB_FILE_RE.test(f.filename)),
    },
  };
}

async function findRun(inst, repo, workflowFile, runName, since) {
  const data = await github.gh(inst, 'GET', `/repos/${repo}/actions/workflows/${workflowFile}/runs?event=workflow_dispatch&per_page=30`);
  return (data?.workflow_runs || []).find(r => r.display_title === runName && (!since || new Date(r.created_at) >= new Date(new Date(since).getTime() - 10 * 1000))) || null;
}

// Filet de sécurité : Claude Code a poussé sa branche mais n'a pas pu ouvrir la pull
// request (réglage du dépôt « Allow GitHub Actions to create and approve pull requests »
// désactivé par défaut) ; BlabIA l'ouvre avec son application. Renvoie son numéro ou null.
async function openPrFromBranch(inst, task) {
  const branch = wf.devBranch(task.issueNumber);
  const { default_branch: base } = await github.gh(inst, 'GET', `/repos/${task.repo}`);
  let cmp;
  try {
    cmp = await github.gh(inst, 'GET', `/repos/${task.repo}/compare/${base}...${branch}`);
  } catch (err) {
    if (err.status === 404) return null; // branche absente : rien à proposer
    throw err;
  }
  if (!cmp?.ahead_by) return null;
  const commits = (cmp.commits || []).map(c => `- ${String(c.commit?.message || '').split('\n')[0]}`).join('\n');
  const pr = await github.gh(inst, 'POST', `/repos/${task.repo}/pulls`, {
    title: `BlabIA : ${task.title}`, head: branch, base,
    body: `Modifications réalisées par Claude Code (pull request ouverte par BlabIA) :\n${commits}\n\nCloses #${task.issueNumber}`,
  });
  return pr.number;
}

const NO_PR_RE = /pull request/i;

// Relit l'état d'un développement auprès de GitHub ; renvoie la ligne à jour
async function refreshTask(task, inst) {
  const repo = task.repo;
  const patch = {};
  // Échec « sans pull request » : la branche a peut-être été poussée (ancien développement)
  if (task.status === 'failed' && !task.prNumber && task.issueNumber && NO_PR_RE.test(task.error || '')) {
    const prNumber = await openPrFromBranch(inst, task);
    if (!prNumber) return task;
    const [row] = await db('DevTask').where({ id: task.id })
      .update({ ...(await loadPr(inst, repo, prNumber)).patch, status: 'ready', readyAt: new Date(), error: null, finishedAt: null }).returning('*');
    return row;
  }
  if (!REFRESHABLE.includes(task.status)) return task;

  if (task.status === 'running') {
    const owner = repo.split('/')[0];
    const prs = await github.gh(inst, 'GET', `/repos/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${wf.devBranch(task.issueNumber)}`)}`) || [];
    const run = await findRun(inst, repo, 'blabia-dev.yml', wf.devRunName(task.issueNumber), task.createdAt);
    if (run) patch.runUrl = run.html_url;
    if (prs[0]) {
      Object.assign(patch, (await loadPr(inst, repo, prs[0].number)).patch, { status: 'ready', readyAt: new Date(), error: null });
    } else if (run?.status === 'completed' && run.conclusion === 'success' && (patch.prNumber = await openPrFromBranch(inst, task))) {
      Object.assign(patch, (await loadPr(inst, repo, patch.prNumber)).patch, { status: 'ready', readyAt: new Date(), error: null });
    } else if (run?.status === 'completed') {
      delete patch.prNumber;
      // Terminé sans pull request : l'explication de Claude Code est le dernier commentaire de la demande
      const comments = await github.gh(inst, 'GET', `/repos/${repo}/issues/${task.issueNumber}/comments?per_page=100`) || [];
      const last = comments.filter(c => c.user?.type === 'Bot').pop();
      Object.assign(patch, { status: 'failed', finishedAt: new Date(),
        error: run.conclusion === 'success'
          ? (last?.body ? `Claude Code n'a pas ouvert de pull request : ${last.body.slice(0, 600)}` : 'Claude Code n’a pas ouvert de pull request.')
          : run.conclusion === 'cancelled' ? 'Le développement a été annulé sur GitHub.' : 'Le développement a échoué (voir le journal sur GitHub).' });
    } else if (!run && Date.now() - new Date(task.createdAt).getTime() > RUN_LOST_MS) {
      Object.assign(patch, { status: 'failed', finishedAt: new Date(), error: 'GitHub n’a pas démarré le développement.' });
    }
  } else if (task.status === 'ready') {
    const pr = await github.gh(inst, 'GET', `/repos/${repo}/pulls/${task.prNumber}`);
    if (pr.merged) Object.assign(patch, { status: 'deployed', finishedAt: new Date() });
    else if (pr.state === 'closed') Object.assign(patch, { status: 'abandoned', finishedAt: new Date() });
    else if (pr.updated_at && new Date(pr.updated_at) > new Date(task.readyAt || 0)) Object.assign(patch, (await loadPr(inst, repo, task.prNumber)).patch);
  } else if (task.status === 'deploying') {
    const pr = await github.gh(inst, 'GET', `/repos/${repo}/pulls/${task.prNumber}`);
    if (pr.merged) Object.assign(patch, { status: 'deployed', finishedAt: new Date(), error: null });
    else {
      const run = await findRun(inst, repo, 'blabia-deploy.yml', wf.deployRunName(task.prNumber), task.deployRequestedAt);
      if (run) patch.runUrl = run.html_url;
      if (run?.status === 'completed') {
        Object.assign(patch, { status: 'deploy_failed', finishedAt: new Date(),
          error: 'La mise en ligne a échoué (sauvegarde ou fusion) : rien n’a été mis en ligne. Voir le journal sur GitHub.' });
      } else if (!run && Date.now() - new Date(task.deployRequestedAt).getTime() > RUN_LOST_MS) {
        Object.assign(patch, { status: 'deploy_failed', finishedAt: new Date(), error: 'GitHub n’a pas démarré la mise en ligne.' });
      }
    }
  }
  if (!Object.keys(patch).length) return task;
  const [row] = await db('DevTask').where({ id: task.id }).update(patch).returning('*');
  return row;
}

async function listTasks(project) {
  let tasks = await db('DevTask').where({ projectId: project.id }).orderBy('createdAt', 'desc').limit(50);
  const owner = await ownerOf(project);
  if (owner?.githubInstallationId && github.isConfigured()) {
    tasks = await Promise.all(tasks.map((t, i) => (i < 10 ? refreshTask(t, owner.githubInstallationId).catch(err => {
      console.error(`[devTasks] relecture ${t.id} :`, err.message);
      return t;
    }) : t)));
  }
  return tasks;
}

async function deployTask(project, task) {
  const owner = await ownerOf(project);
  const status = await repoStatus(project);
  if (!status.ready) throw Object.assign(new Error('Le dépôt n’est plus prêt : vérifiez la configuration (Projet › Développements).'), { status: 409 });
  await github.gh(owner.githubInstallationId, 'POST', `/repos/${task.repo}/actions/workflows/blabia-deploy.yml/dispatches`, {
    ref: status.defaultBranch, inputs: { pr: String(task.prNumber) },
  });
  const [row] = await db('DevTask').where({ id: task.id }).update({ status: 'deploying', deployRequestedAt: new Date(), error: null, runUrl: null }).returning('*');
  return row;
}

async function abandonTask(project, task) {
  const owner = await ownerOf(project);
  const inst = owner?.githubInstallationId;
  if (inst) {
    // Fermetures « au mieux » : l'abandon dans BlabIA ne dépend pas de GitHub
    if (task.prNumber) await github.gh(inst, 'PATCH', `/repos/${task.repo}/pulls/${task.prNumber}`, { state: 'closed' }).catch(err => console.error('[devTasks] fermeture PR :', err.message));
    if (task.issueNumber) await github.gh(inst, 'PATCH', `/repos/${task.repo}/issues/${task.issueNumber}`, { state: 'closed', state_reason: 'not_planned' }).catch(err => console.error('[devTasks] fermeture demande :', err.message));
  }
  const [row] = await db('DevTask').where({ id: task.id }).update({ status: 'abandoned', finishedAt: new Date() }).returning('*');
  return row;
}

module.exports = {
  repoStatus, installWorkflows, createTask, refreshTask, listTasks, deployTask, abandonTask,
  ACTIVE, SECRET_CLAUDE, SECRET_DB, SECRET_BACKUP, DB_FILE_RE,
};
