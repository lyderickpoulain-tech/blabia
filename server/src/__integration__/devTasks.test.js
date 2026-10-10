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
    calls: [], files: {}, secrets: new Set(), issues: [], pulls: [], runs: [], dispatches: [], comments: {},
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
    if (p === '/user/installations') return json(200, { installations: [{ id: 77, account: { login: 'moi' } }] });
    if (method === 'POST' && p === '/app/installations/77/access_tokens') return json(201, { token: 'jeton-installation', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    if (opts.headers?.Authorization !== 'Bearer jeton-installation') return json(401, { message: 'Bad credentials' });
    if (p === '/installation/repositories') return json(200, { repositories: [gh.repo] });
    if (p === '/repos/moi/app') return json(200, gh.repo);
    let m;
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
    if (p === '/repos/moi/app/pulls') return json(200, gh.pulls.filter(pr => `moi:${pr.head}` === u.searchParams.get('head')));
    if ((m = p.match(/^\/repos\/moi\/app\/pulls\/(\d+)(\/files)?$/))) {
      const pr = gh.pulls.find(x => x.number === Number(m[1]));
      if (!pr) return json(404, { message: 'Not Found' });
      if (m[2]) return json(200, pr.files);
      if (method === 'PATCH') Object.assign(pr, body);
      return json(200, pr);
    }
    if ((m = p.match(/^\/repos\/moi\/app\/issues\/(\d+)\/comments$/))) return json(200, gh.comments[m[1]] || []);
    if ((m = p.match(/^\/repos\/moi\/app\/issues\/(\d+)$/)) && method === 'PATCH') { Object.assign(gh.issues[Number(m[1]) - 1], body); return json(200, {}); }
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

  it('projet exemple et compte « user » : refusés', async () => {
    const invited = await h.createUser('user', 'invite@test.local');
    expect((await h.request('POST', '/api/github/connect', { token: invited.token, body: {} })).status).toBe(403);
    await h.db('Project').where({ id: projectId }).update({ isDemo: true });
    expect((await h.request('POST', `/api/projects/${projectId}/dev-tasks`, { token: owner.token, body: { sessionId } })).status).toBe(403);
    await h.db('Project').where({ id: projectId }).update({ isDemo: false });
  });
});
