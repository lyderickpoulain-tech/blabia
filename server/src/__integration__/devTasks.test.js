import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Développements depuis BlabIA (Claude Code dans GitHub Actions), avec un GitHub SIMULÉ en
// mémoire : connexion, dépôt, automatisations, secrets, lancement, suivi, mise en ligne.
const require = createRequire(import.meta.url);
const harness = require('./harness');

// ── GitHub simulé ────────────────────────────────────────────────────────────
function fakeGitHub() {
  const gh = {
    calls: [], files: {}, branches: {}, secrets: new Set(), issues: [], pulls: [], runs: [], dispatches: [], comments: {}, created: [], createdFiles: {}, deployments: [],
    repo: { full_name: 'moi/app', private: false, default_branch: 'main' },
  };
  const json = (status, data) => ({ status, ok: status < 400, text: async () => (data === undefined ? '' : JSON.stringify(data)), json: async () => data });
  gh.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const u = new URL(url);
    const p = u.pathname;
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    gh.calls.push(`${method} ${p}${u.search}`);
    if (u.host === 'github.com' && p === '/login/oauth/access_token') return json(200, body.code === 'bon-code' ? { access_token: 'jeton-utilisateur' } : { error: 'bad_verification_code' });
    if (p === '/user') return json(200, { login: 'moi' });
    if (p === '/user/installations') return json(200, { installations: [{ id: 77, account: { login: 'moi' }, repository_selection: 'selected' }] });
    if (method === 'POST' && p === '/app/installations/77/access_tokens') return json(201, { token: 'jeton-installation', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    let m;
    // Création d'un dépôt : jeton de l'UTILISATEUR (obtenu au retour de GitHub)
    if (method === 'POST' && p === '/user/repos') {
      if (opts.headers?.Authorization !== 'Bearer jeton-utilisateur') return json(401, { message: 'Bad credentials' });
      if (gh.denyRepoCreation) return json(403, { message: 'Resource not accessible by integration' });
      if (['app', ...gh.created.map(r => r.name)].includes(body.name)) return json(422, { message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] });
      const repo = { id: 500 + gh.created.length, name: body.name, full_name: `moi/${body.name}`, private: body.private, default_branch: 'main', body };
      gh.created.push(repo); return json(201, repo);
    }
    if (method === 'PUT' && (m = p.match(/^\/user\/installations\/77\/repositories\/(\d+)$/))) return json(204);
    if (opts.headers?.Authorization !== 'Bearer jeton-installation') return json(401, { message: 'Bad credentials' });
    if (p === '/installation/repositories') return json(200, { repositories: [gh.repo] });
    if (p === '/repos/moi/app') return json(200, gh.repo);
    // Automatisations installées dans un dépôt créé par BlabIA
    if ((m = p.match(/^\/repos\/moi\/([\w.-]+)\/contents\/(.+)$/)) && m[1] !== 'app') {
      const key = `${m[1]}:${decodeURIComponent(m[2])}`;
      if (method === 'PUT') { gh.createdFiles[key] = { sha: 'sha', content: body.content }; return json(201, {}); }
      return gh.createdFiles[key] ? json(200, gh.createdFiles[key]) : json(404, { message: 'Not Found' });
    }
    if ((m = p.match(/^\/repos\/moi\/app\/contents\/(.+)$/))) {
      const path = decodeURIComponent(m[1]);
      // Jeton créé avant un changement de permissions : refusé une fois
      if (method === 'PUT' && gh.denyNextWrite) { gh.denyNextWrite = false; return json(403, { message: 'Resource not accessible by integration' }); }
      if (method === 'PUT') { gh.files[path] = { sha: `sha-${path.length}`, content: body.content }; return json(201, {}); }
      return gh.files[path] ? json(200, gh.files[path]) : json(404, { message: 'Not Found' });
    }
    if (p === '/repos/moi/app/actions/secrets') return json(200, { secrets: [...gh.secrets].map(name => ({ name })) });
    if (method === 'POST' && p === '/repos/moi/app/issues') {
      const issue = { number: gh.issues.length + 1, html_url: `https://github.com/moi/app/issues/${gh.issues.length + 1}`, ...body };
      gh.issues.push(issue); return json(201, issue);
    }
    if ((m = p.match(/^\/repos\/moi\/app\/actions\/workflows\/([\w.-]+)\/dispatches$/))) { gh.dispatches.push({ workflow: m[1], ...body }); return json(204); }
    if ((m = p.match(/^\/repos\/moi\/app\/actions\/workflows\/([\w.-]+)\/runs$/))) return json(200, { workflow_runs: gh.runs.filter(r => r.workflow === m[1]) });
    if ((m = p.match(/^\/repos\/moi\/app\/compare\/main\.\.\.(.+)$/))) {
      const commits = gh.branches[decodeURIComponent(m[1])];
      return commits ? json(200, { ahead_by: commits.length, commits: commits.map(message => ({ commit: { message } })) }) : json(404, { message: 'Not Found' });
    }
    if (method === 'POST' && p === '/repos/moi/app/pulls') {
      const pr = { number: 100 + gh.pulls.length, head: body.head, html_url: `https://github.com/moi/app/pull/${100 + gh.pulls.length}`, state: 'open', merged: false,
        body: body.body, files: [{ filename: 'client/src/Page.jsx', additions: 8, deletions: 1 }] };
      gh.pulls.push(pr); return json(201, pr);
    }
    if (p === '/repos/moi/app/pulls') return json(200, gh.pulls.filter(pr => `moi:${pr.head}` === u.searchParams.get('head')));
    if ((m = p.match(/^\/repos\/moi\/app\/pulls\/(\d+)(\/files)?$/))) {
      const pr = gh.pulls.find(x => x.number === Number(m[1]));
      if (!pr) return json(404, { message: 'Not Found' });
      if (m[2]) return json(200, pr.files);
      if (method === 'PATCH') Object.assign(pr, body);
      return json(200, { ...pr, head: { ref: pr.head, sha: pr.headSha || null } });
    }
    if ((m = p.match(/^\/repos\/moi\/app\/issues\/(\d+)\/comments$/))) return json(200, gh.comments[m[1]] || []);
    if ((m = p.match(/^\/repos\/moi\/app\/issues\/(\d+)$/)) && method === 'PATCH') { Object.assign(gh.issues[Number(m[1]) - 1], body); return json(200, {}); }
    // Déploiements déclarés par l'hébergeur relié au dépôt (Railway, Vercel…)
    if (p === '/repos/moi/app/deployments') {
      if (gh.denyDeployments) return json(403, { message: 'Resource not accessible by integration' });
      const sha = u.searchParams.get('sha');
      return json(200, gh.deployments.filter(d => !sha || d.sha === sha).slice(0, Number(u.searchParams.get('per_page') || 30)));
    }
    if ((m = p.match(/^\/repos\/moi\/app\/deployments\/(\d+)\/statuses$/))) return json(200, gh.deployments.find(d => d.id === Number(m[1]))?.statuses || []);
    return json(404, { message: `Route simulée absente : ${method} ${p}` });
  };
  return gh;
}

describe.skipIf(!harness.enabled)('développements depuis BlabIA (GitHub simulé)', () => {
  let h, owner, collaborator, gh, projectId, sessionId;
  const env = {};

  beforeAll(async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    Object.assign(env, { GITHUB_APP_ID: '1', GITHUB_APP_SLUG: 'blabia-app', GITHUB_APP_CLIENT_ID: 'cid', GITHUB_APP_CLIENT_SECRET: 'csecret',
      GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs1', format: 'pem' }) });
    Object.assign(process.env, env);
    h = await harness.start();
    await h.reset();
    const github = require('../services/github');
    github._resetCache();
    gh = fakeGitHub();
    github.transport.fetch = gh.fetch;
    owner = await h.createUser('member', 'proprio@test.local');
    collaborator = await h.createUser('member', 'collegue@test.local');
    const project = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Mon appli' } })).body;
    projectId = project.id;
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId, userId: collaborator.id });
    const session = (await h.request('POST', `/api/projects/${projectId}/sessions`, { token: owner.token,
      body: { task: 'Ajouter un bouton d’export', intention: ['claude_code'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'Dev', systemPrompt: '' }] } })).body.session;
    sessionId = session.id;
    await h.db('Session').where({ id: sessionId }).update({ deliverable: 'Ajoute un bouton « Exporter » sur la page des décisions, qui télécharge un CSV.' });
  });
  afterAll(async () => {
    for (const k of Object.keys(env)) delete process.env[k];
    await h?.stop();
  });

  const callback = async (query) => {
    const res = await fetch(`${h.base}/api/github/callback?${new URLSearchParams(query)}`, { redirect: 'manual' });
    return res.headers.get('location') || '';
  };

  it('connexion : état signé obligatoire, puis installation enregistrée', async () => {
    const forged = await callback({ code: 'bon-code', state: 'faux.etat' });
    expect(forged).toMatch(/github=erreur/);
    expect((await h.db('User').where({ id: owner.id }).first()).githubInstallationId).toBeNull();

    const { url } = (await h.request('POST', '/api/github/connect', { token: owner.token, body: { returnTo: `/projects/${projectId}/developpements` } })).body;
    const state = new URL(url).searchParams.get('state');
    const ok = await callback({ code: 'bon-code', state });
    expect(ok).toContain(`/projects/${projectId}/developpements?github=ok`);
    const u = await h.db('User').where({ id: owner.id }).first();
    expect({ inst: u.githubInstallationId, login: u.githubLogin }).toEqual({ inst: '77', login: 'moi' });
    expect((await h.request('GET', '/api/github', { token: owner.token })).body).toMatchObject({ connected: true, login: 'moi' });
    expect((await h.request('GET', '/api/github/repos', { token: owner.token })).body).toEqual([{ fullName: 'moi/app', private: false, defaultBranch: 'main' }]);
  });

  it('dépôt : automatisations installées, puis prêt seulement avec le secret de l’abonnement Claude', async () => {
    expect((await h.request('PUT', `/api/projects/${projectId}/github`, { token: collaborator.token, body: { repo: 'moi/app' } })).status).toBe(403);
    let s = (await h.request('PUT', `/api/projects/${projectId}/github`, { token: owner.token, body: { repo: 'moi/app' } })).body;
    expect(s).toMatchObject({ accessible: true, defaultBranch: 'main', workflows: { installed: false }, ready: false });

    gh.denyNextWrite = true; // jeton en cache aux anciennes permissions : BlabIA en redemande un
    const tokensBefore = gh.calls.filter(c => c.includes('/access_tokens')).length;
    s = (await h.request('POST', `/api/projects/${projectId}/github/install`, { token: owner.token })).body;
    expect(gh.calls.filter(c => c.includes('/access_tokens')).length).toBe(tokensBefore + 1);
    expect(s.workflows).toEqual({ installed: true, current: true });
    const devFile = Buffer.from(gh.files['.github/workflows/blabia-dev.yml'].content, 'base64').toString();
    expect(devFile).toContain('allowed_bots: "blabia-app[bot]"');
    expect(s.ready).toBe(false); // secret CLAUDE_CODE_OAUTH_TOKEN absent

    gh.secrets.add('CLAUDE_CODE_OAUTH_TOKEN');
    gh.secrets.add('BLABIA_DB_URL'); // base déclarée sans mot de passe : la mise en ligne échouerait
    expect((await h.request('GET', `/api/projects/${projectId}/github`, { token: owner.token })).body.ready).toBe(false);
    gh.secrets.add('BLABIA_BACKUP_PASSWORD');
    expect((await h.request('GET', `/api/projects/${projectId}/github`, { token: collaborator.token })).body).toMatchObject({ ready: true, isOwner: false });
  });

  let devId;
  it('lancement : demande créée, Claude Code déclenché, un seul à la fois, propriétaire seulement', async () => {
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: collaborator.token, body: { sessionId } })).status).toBe(403);
    const r = await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } });
    expect(r.status).toBe(201);
    devId = r.body.id;
    expect(r.body).toMatchObject({ status: 'running', issueNumber: 1, repo: 'moi/app' });
    expect(gh.issues[0].body).toContain('bouton « Exporter »');
    expect(gh.dispatches).toEqual([{ workflow: 'blabia-dev.yml', ref: 'main', inputs: { issue: '1' } }]);
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } })).status).toBe(409);
    const list = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: collaborator.token })).body;
    expect(list.tasks.map(t => t.status)).toEqual(['running']);
    expect(list.launchable.map(s => s.id)).toEqual([sessionId]);
  });

  it('suivi : pull request ouverte → prête, avec résumé, fichiers et base de données touchée', async () => {
    gh.runs.push({ workflow: 'blabia-dev.yml', display_title: 'BlabIA dev #1', status: 'in_progress', html_url: 'https://github.com/moi/app/actions/runs/9', created_at: new Date().toISOString() });
    gh.pulls.push({ number: 5, head: 'blabia/dev-1', html_url: 'https://github.com/moi/app/pull/5', state: 'open', merged: false,
      body: 'Ajout du bouton Exporter sur la page des décisions.\n\nCloses #1',
      files: [{ filename: 'client/src/Decisions.jsx', additions: 20, deletions: 2 }, { filename: 'server/prisma/migrations/2026_x/migration.sql', additions: 3, deletions: 0 }] });
    const t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t).toMatchObject({ status: 'ready', prNumber: 5, touchesDatabase: true, summary: 'Ajout du bouton Exporter sur la page des décisions.', runUrl: 'https://github.com/moi/app/actions/runs/9' });
    expect(t.files).toHaveLength(2);
  });

  it('mise en ligne : workflow de sauvegarde + fusion déclenché, puis « en ligne » une fois fusionnée', async () => {
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks/${devId}/deploy`, { token: collaborator.token })).status).toBe(403);
    const r = await h.request('POST', `/api/projects/${projectId}/dev-tasks/${devId}/deploy`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('deploying');
    expect(gh.dispatches.at(-1)).toEqual({ workflow: 'blabia-deploy.yml', ref: 'main', inputs: { pr: '5' } });
    // Sauvegarde échouée : rien n'est fusionné, l'échec est signalé
    gh.runs.push({ workflow: 'blabia-deploy.yml', display_title: 'BlabIA mise en ligne PR #5', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/moi/app/actions/runs/10', created_at: new Date().toISOString() });
    let t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t.status).toBe('deploy_failed');
    expect(t.error).toMatch(/rien n’a été mis en ligne/);
    // Nouvel essai réussi
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks/${devId}/deploy`, { token: owner.token })).status).toBe(200);
    gh.pulls[0].merged = true;
    t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t.status).toBe('deployed');
  });

  it('échec sans pull request : l’explication de Claude Code est rapportée ; abandon ferme la demande', async () => {
    const r = await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } });
    expect(r.status).toBe(201);
    gh.runs.push({ workflow: 'blabia-dev.yml', display_title: 'BlabIA dev #2', status: 'completed', conclusion: 'success', html_url: 'https://github.com/moi/app/actions/runs/11', created_at: new Date().toISOString() });
    gh.comments['2'] = [{ user: { type: 'Bot' }, body: 'La demande ne précise pas quelle page modifier.' }];
    const t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t.status).toBe('failed');
    expect(t.error).toContain('ne précise pas quelle page');
    const a = await h.request('POST', `/api/projects/${projectId}/dev-tasks/${t.id}/abandon`, { token: owner.token });
    expect(a.body.status).toBe('abandoned');
    expect(gh.issues[1].state).toBe('closed');
  });

  it('branche poussée sans pull request : BlabIA l’ouvre lui-même (et récupère un ancien échec)', async () => {
    // Ancien échec « sans pull request », branche poussée ensuite visible : récupéré
    let r = await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } });
    expect(r.body.issueNumber).toBe(3);
    gh.runs.push({ workflow: 'blabia-dev.yml', display_title: 'BlabIA dev #3', status: 'completed', conclusion: 'success', html_url: 'https://github.com/moi/app/actions/runs/12', created_at: new Date().toISOString() });
    let t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t.status).toBe('failed'); // pas encore de branche
    gh.branches['blabia/dev-3'] = ['Lien « Voir le dépôt » sous le titre'];
    t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t).toMatchObject({ status: 'ready', error: null });
    expect(t.summary).toContain('Lien « Voir le dépôt » sous le titre');
    expect(gh.pulls.at(-1)).toMatchObject({ head: 'blabia/dev-3' });
    expect(gh.pulls.at(-1).body).toContain('Closes #3');
    await h.request('POST', `/api/projects/${projectId}/dev-tasks/${t.id}/abandon`, { token: owner.token });

    // Cas direct : fin du travail, branche poussée, pas de pull request → ouverte aussitôt
    r = await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } });
    gh.branches['blabia/dev-4'] = ['Deuxième essai'];
    gh.runs.push({ workflow: 'blabia-dev.yml', display_title: 'BlabIA dev #4', status: 'completed', conclusion: 'success', html_url: 'https://github.com/moi/app/actions/runs/13', created_at: new Date().toISOString() });
    t = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks[0];
    expect(t).toMatchObject({ status: 'ready', prNumber: gh.pulls.at(-1).number });
  });

  it('publication : aperçu de la PR ; « non publié » sans hébergeur ; adresse du site une fois publié', async () => {
    const tasks = async () => (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body.tasks;
    // Le 1er développement, fusionné plus haut : aucun hébergeur n'a jamais publié ce dépôt
    expect((await tasks()).find(t => t.id === devId)).toMatchObject({ status: 'deployed', publishState: 'no_host', siteUrl: null });

    // Aperçu : l'hébergeur publie la pull request du développement en attente
    const pr = gh.pulls.at(-1);
    pr.headSha = 'tete-4';
    gh.deployments.push({ id: 1, sha: 'tete-4', environment: `app-pr-${pr.number}`, statuses: [{ state: 'success', environment_url: 'https://app-pr.example' }] });
    let t = (await tasks())[0];
    expect(t).toMatchObject({ status: 'ready', previewUrl: 'https://app-pr.example' });

    // Hébergeur relié ensuite : il publie le commit de fusion (site + serveur) → adresse du SITE
    gh.pulls.find(x => x.number === 5).merge_commit_sha = 'fusion-5';
    gh.deployments.push(
      { id: 2, sha: 'fusion-5', environment: 'production / server', statuses: [{ state: 'success', environment_url: 'https://api.example' }] },
      { id: 3, sha: 'fusion-5', environment: 'production / client', statuses: [{ state: 'success', environment_url: 'https://site.example' }] });
    expect((await tasks()).find(x => x.id === devId)).toMatchObject({ publishState: 'live', siteUrl: 'https://site.example', mergeSha: 'fusion-5' });

    // Mise en ligne du développement en attente : publication en cours, puis échouée
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks/${t.id}/deploy`, { token: owner.token })).status).toBe(200);
    Object.assign(pr, { merged: true, merge_commit_sha: 'fusion-4' });
    t = (await tasks())[0];
    expect(t).toMatchObject({ status: 'deployed', publishState: 'pending', mergeSha: 'fusion-4' });
    const dep = { id: 4, sha: 'fusion-4', environment: 'production', statuses: [{ state: 'in_progress' }] };
    gh.deployments.push(dep);
    expect((await tasks())[0].publishState).toBe('pending');
    dep.statuses.unshift({ state: 'failure' });
    expect((await tasks())[0].publishState).toBe('failed');

    // Permission « Deployments » absente : signalé, et revérifié ensuite
    await h.db('DevTask').where({ id: t.id }).update({ publishState: 'pending' });
    gh.denyDeployments = true;
    expect((await tasks())[0].publishState).toBe('no_access');
    gh.denyDeployments = false;
    dep.statuses.unshift({ state: 'success', environment_url: 'https://site.example' });
    expect((await tasks())[0]).toMatchObject({ publishState: 'live', siteUrl: 'https://site.example' });

    // Cas réel Railway (mode sombre de BlabIA, 10/10/2026) : publié, puis « inactive » une fois
    // remplacé par la version suivante ; l'adresse transmise est celle du TABLEAU DE BORD.
    // Ancienne lecture : « Publication échouée » et un « Voir le site » vers railway.com.
    const board = 'https://railway.com/project/bc0f?environmentId=89ef';
    await h.db('DevTask').where({ id: t.id }).update({ publishState: 'failed', siteUrl: board });
    dep.statuses.splice(0, dep.statuses.length,
      { state: 'inactive', environment_url: board }, { state: 'success', environment_url: board }, { state: 'in_progress', environment_url: board });
    expect((await tasks())[0]).toMatchObject({ publishState: 'live', siteUrl: null });
  });

  it('projet exemple et compte « user » : refusés', async () => {
    const invited = await h.createUser('user', 'invite@test.local');
    expect((await h.request('POST', '/api/github/connect', { token: invited.token, body: {} })).status).toBe(403);
    await h.db('Project').where({ id: projectId }).update({ isDemo: true });
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } })).status).toBe(403);
    await h.db('Project').where({ id: projectId }).update({ isDemo: false });
  });

  // ── Site web à créer de zéro ─────────────────────────────────────────────
  const newProject = async name => (await h.request('POST', '/api/projects', { token: owner.token, body: { name, description: 'Site vitrine' } })).body;
  const createVia = async (pid, body = {}) => {
    const r = await h.request('POST', `/api/projects/${pid}/github/create-repo`, { token: owner.token, body });
    if (r.status !== 200) return { status: r.status, body: r.body };
    const state = new URL(r.body.url).searchParams.get('state');
    return { status: 200, name: r.body.name, location: await callback({ code: 'bon-code', state }) };
  };

  it('site web : plan type ajouté une seule fois, réservé au propriétaire', async () => {
    const site = await newProject('Salon de thé « Feuilles »');
    expect((await h.request('POST', `/api/projects/${site.id}/plan/website`, { token: collaborator.token })).status).toBe(404);
    const r = await h.request('POST', `/api/projects/${site.id}/plan/website`, { token: owner.token });
    expect(r.status).toBe(201);
    expect(r.body.created.map(m => m.type)).toEqual(['decision', 'decision', 'stack', 'claude_code']);
    expect((await h.request('POST', `/api/projects/${site.id}/plan/website`, { token: owner.token })).body.created).toEqual([]);
    // Réunion « outils » suggérée avant de développer : celle du plan, tant qu'aucune n'a été tenue
    let tools = (await h.request('GET', `/api/projects/${site.id}/tools`, { token: owner.token })).body;
    expect(tools.toolsMeeting).toMatchObject({ done: false, planned: { title: 'Choisir les outils : hébergement, nom de domaine…' }, missing: [] });
    expect(tools.guide).toBeNull();

    // Outils renseignés sur la page Outils, sans réunion (cas du projet BlabIA) : reconnus.
    // Seules les catégories pour construire et publier comptent (pas la surveillance, etc.).
    await h.db('Project').where({ id: site.id }).update({ toolNeeds: JSON.stringify([
      { category: 'frontend', need: 'Pages' }, { category: 'hosting', need: 'En ligne' }, { category: 'monitoring', need: 'Alertes' }]) });
    const put = tools => h.request('PUT', `/api/projects/${site.id}/tools`, { token: owner.token, body: { tools } });
    await put([{ name: 'React', category: 'frontend', status: 'validated' }]);
    tools = (await h.request('GET', `/api/projects/${site.id}/tools`, { token: owner.token })).body;
    expect(tools.toolsMeeting).toMatchObject({ done: false, missing: ['Où vit l\'application en ligne'] });
    await put([{ name: 'React', category: 'frontend', status: 'validated' }, { name: 'Railway', category: 'hosting', status: 'validated' }]);
    tools = (await h.request('GET', `/api/projects/${site.id}/tools`, { token: owner.token })).body;
    expect(tools.toolsMeeting).toEqual({ done: true, planned: null, missing: [] });
    await put([]);
    await h.db('Project').where({ id: site.id }).update({ toolNeeds: null });
    // Guide de mise en place : seulement une fois des outils retenus
    expect((await h.request('POST', `/api/projects/${site.id}/tools/guide`, { token: owner.token })).status).toBe(400);
    const s = (await h.request('POST', `/api/projects/${site.id}/sessions`, { token: owner.token,
      body: { task: 'Choisir les outils', intention: ['stack'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'Dev', systemPrompt: '' }] } })).body.session;
    await h.db('Session').where({ id: s.id }).update({ status: 'accepted' });
    tools = (await h.request('GET', `/api/projects/${site.id}/tools`, { token: owner.token })).body;
    expect(tools.toolsMeeting).toEqual({ done: true, planned: null, missing: [] });
  });

  it('site web : BlabIA crée le dépôt au retour de GitHub, l’ouvre à l’application et l’équipe', async () => {
    const site = await newProject('Salon de thé « Feuilles » à Lyon');
    expect((await h.request('POST', `/api/projects/${site.id}/github/create-repo`, { token: collaborator.token, body: {} })).status).toBe(404);
    expect((await h.request('POST', `/api/projects/${site.id}/github/create-repo`, { token: owner.token, body: { name: 'mauvais nom' } })).status).toBe(400);
    const r = await createVia(site.id);
    expect(r.name).toBe('salon-de-the-feuilles-a-lyon');
    expect(r.location).toContain(`/projects/${site.id}/developpements?github=depot-cree`);
    const repo = gh.created.at(-1);
    expect(repo.body).toMatchObject({ name: 'salon-de-the-feuilles-a-lyon', private: true, auto_init: true, description: 'Site vitrine' });
    expect(gh.calls).toContain(`PUT /user/installations/77/repositories/${repo.id}`); // installation sur des dépôts choisis
    expect((await h.db('Project').where({ id: site.id }).first()).githubRepo).toBe('moi/salon-de-the-feuilles-a-lyon');
    const devFile = Buffer.from(gh.createdFiles['salon-de-the-feuilles-a-lyon:.github/workflows/blabia-dev.yml'].content, 'base64').toString();
    expect(devFile).toContain('allowed_bots: "blabia-app[bot]"');
    // Déjà un dépôt : refusé
    expect((await createVia(site.id)).status).toBe(409);
  });

  it('outils : développement bloqué tant qu’un outil dont il se sert n’est pas mis en place ; « lancer quand même »', async () => {
    h.ai.responder = () => ({ text: '{"categories":["payment"]}' });
    const putTools = tools => h.request('PUT', `/api/projects/${projectId}/tools`, { token: owner.token, body: { tools } });
    await putTools([{ name: 'Stripe', category: 'payment', status: 'validated' }]);
    await h.db('Session').where({ id: sessionId }).update({ requiredTools: null });
    const launch = body => h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId, ...body } });

    let r = await launch({});
    expect(r.status).toBe(409);
    expect(r.body.missingTools).toEqual([{ category: 'payment', label: 'Encaisser de l\'argent', tool: 'Stripe', reason: 'not_setup' }]);
    expect(r.body.error).toContain('Stripe (Encaisser de l\'argent) : pas encore mis en place');
    expect(h.ai.calls.at(-1).model).toMatch(/haiku/);
    // Repéré une fois, conservé sur la réunion ; visible dans la liste à lancer
    const calls = h.ai.calls.length;
    const list = (await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body;
    expect(list.launchable.find(s => s.id === sessionId).missingTools).toHaveLength(1);
    expect(h.ai.calls.length).toBe(calls);

    // Mis en place : plus de blocage (vérifié sans lancer : l'erreur suivante n'est plus celle des outils)
    await putTools([{ name: 'Stripe', category: 'payment', status: 'validated', setupDone: true }]);
    expect((await h.request('GET', `/api/projects/${projectId}/dev-tasks`, { token: owner.token })).body
      .launchable.find(s => s.id === sessionId).missingTools).toEqual([]);

    // Pas mis en place mais confirmation explicite : lancé
    await putTools([{ name: 'Stripe', category: 'payment', status: 'validated' }]);
    r = await launch({ force: true });
    expect(r.status).toBe(201);
    await h.db('DevTask').where({ id: r.body.id }).update({ status: 'abandoned' }); // ne gêne pas la suite
    await putTools([]);
    h.ai.responder = null;
  });

  it('guide de mise en place : discussion sous le guide (erreur collée), reprise au guide suivant', async () => {
    h.ai.responder = params => ({ text: params.system.includes('aides une personne') ? 'Dans Railway, réglez **Root Directory** sur `/client`.' : '## Étape 1 — Railway\nRoot Directory : /client' });
    const url = `/api/projects/${projectId}/tools/guide/chat`;
    expect((await h.request('POST', url, { token: owner.token, body: { message: ' ' } })).status).toBe(400);
    const r = await h.request('POST', url, { token: owner.token, body: { message: 'The build failed because the repo root only contains a README' } });
    expect(r.status).toBe(200);
    expect(r.body.chat.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(r.body.chat[1].content).toContain('Root Directory');
    const asked = h.ai.calls.at(-1);
    expect(asked.messages[0].content).toContain('NOUVEAU MESSAGE DE L\'HUMAIN');
    expect(asked.messages[0].content).toContain('STRUCTURE RÉELLE DU DÉPÔT'); // lue sur GitHub (dépôt moi/app)
    expect(asked.tools?.[0]?.name).toBe('web_search');
    expect((await h.request('GET', `/api/projects/${projectId}/tools`, { token: collaborator.token })).body.guideChat).toHaveLength(2);

    // Le guide suivant reprend les problèmes rencontrés
    await h.request('PUT', `/api/projects/${projectId}/tools`, { token: owner.token, body: { tools: [{ name: 'Railway', category: 'hosting', status: 'validated' }] } });
    const g = await h.request('POST', `/api/projects/${projectId}/tools/guide`, { token: owner.token });
    expect(g.status).toBe(200);
    expect(h.ai.calls.at(-1).messages[0].content).toContain('PROBLÈMES DÉJÀ RENCONTRÉS ET SOLUTIONS');
    expect(h.ai.calls.at(-1).messages[0].content).toContain('HUMAIN : The build failed');

    expect((await h.request('DELETE', url, { token: owner.token })).body.chat).toEqual([]);
    h.ai.responder = null;
  });

  it('site web : nom déjà pris → suffixe ; permission « Administration » absente → message dédié', async () => {
    const other = await newProject('App');
    const r = await createVia(other.id, { name: 'app' });
    expect(r.location).toContain('github=depot-cree');
    expect(gh.created.at(-1).full_name).toBe('moi/app-2');

    const third = await newProject('Troisième site');
    gh.denyRepoCreation = true;
    expect((await createVia(third.id)).location).toContain('github=depot-permission');
    expect((await h.db('Project').where({ id: third.id }).first()).githubRepo).toBeNull();
    gh.denyRepoCreation = false;
  });
});
