import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const github = require('../github');
const wf = require('../githubWorkflows');

describe('connexion GitHub', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'secret-unitaire';
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GITHUB_APP_ID = '123';
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' }).replace(/\n/g, '\\n');
    globalThis.__pub = publicKey;
  });

  it('état signé : utilisateur et page de retour retrouvés ; falsification refusée', () => {
    const s = github.signState('u1', '/projects/0f8b1c2d-1111-2222-3333-444455556666/developpements');
    expect(github.verifyState(s)).toEqual({ userId: 'u1', ret: '/projects/0f8b1c2d-1111-2222-3333-444455556666/developpements', extra: null });
    // Action à mener au retour (création d'un dépôt), signée avec le reste
    const c = github.signState('u1', '/profile', { a: 'create', p: 'p1', n: 'mon-site', v: 1 });
    expect(github.verifyState(c).extra).toEqual({ a: 'create', p: 'p1', n: 'mon-site', v: 1 });
    const [payload, sig] = s.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'pirate', r: '/profile', e: Date.now() + 1e6 })).toString('base64url');
    expect(github.verifyState(`${forged}.${sig}`)).toBeNull();
    expect(github.verifyState(`${payload}.xx`)).toBeNull();
    expect(github.verifyState('')).toBeNull();
  });

  it('nom de dépôt proposé : minuscules, sans accents ni espaces', () => {
    expect(github.repoSlug('Salon de thé « Les Feuilles » à Lyon !')).toBe('salon-de-the-les-feuilles-a-lyon');
    expect(github.repoSlug('  ')).toBe('mon-site');
    expect(github.REPO_NAME_RE.test(github.repoSlug('Été 2027 : site'))).toBe(true);
  });

  it('page de retour : jamais une adresse externe', () => {
    expect(github.verifyState(github.signState('u1', 'https://pirate.example')).ret).toBe('/profile');
    expect(github.safeReturn('//pirate.example')).toBe('/profile');
    expect(github.safeReturn('/profile')).toBe('/profile');
  });

  it('jeton de l’application : JWT RS256 vérifiable, émis par l’application', () => {
    const [h, b, sig] = github.appJwt().split('.');
    expect(crypto.createVerify('RSA-SHA256').update(`${h}.${b}`).verify(globalThis.__pub, Buffer.from(sig, 'base64url'))).toBe(true);
    const body = JSON.parse(Buffer.from(b, 'base64url').toString());
    expect(body.iss).toBe('123');
    expect(body.exp - body.iat).toBeLessThanOrEqual(10 * 60);
  });
});

describe('automatisations installées dans le dépôt', () => {
  const dev = wf.devWorkflow({ appSlug: 'blabia-app' });
  const deploy = wf.deployWorkflow();

  it('développement : lancé seulement par BlabIA, abonnement de l’utilisateur, garde-fous', () => {
    expect(wf.isCurrent(dev)).toBe(true);
    expect(dev).toMatch(/on:\n {2}workflow_dispatch:/);
    // Seul déclencheur : workflow_dispatch (un tiers ne peut rien déclencher sur un dépôt public)
    const triggers = dev.slice(dev.indexOf('\non:\n'), dev.indexOf('\npermissions:')).match(/\n {2}\w[\w-]*:/g);
    expect(triggers).toEqual(['\n  workflow_dispatch:']);
    expect(dev).toContain('claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}');
    expect(dev).toContain('allowed_bots: "blabia-app[bot]"');
    expect(dev).toContain('--max-turns 60');
    expect(dev).toContain('timeout-minutes: 45');
    expect(dev).toContain('blabia/dev-${{ inputs.issue }}');
    expect(dev).toContain('Ne fusionne jamais');
    // Résumé pour une personne qui ne code pas : sections fixes, procédures pas à pas
    for (const title of ['## Ce qui change', '## À faire de votre côté', '## À vérifier après la mise en ligne', '## Base de données']) expect(dev).toContain(title);
    expect(dev).toContain('PAS développeuse');
    expect(dev).toContain('« Avant la mise en ligne : »');
    expect(dev).toContain('--body-file /tmp/pr-body.md');
    expect(dev).toContain('--add-dir /tmp');
    expect(dev).toContain(`run-name: "${wf.devRunName('${{ inputs.issue }}')}"`);
  });

  it('mise en ligne : sauvegarde chiffrée AVANT la fusion, échec si mot de passe absent', () => {
    expect(wf.isCurrent(deploy)).toBe(true);
    const backup = deploy.indexOf('pg_dump');
    const encrypt = deploy.indexOf('gpg --batch');
    const merge = deploy.indexOf('gh pr merge');
    expect(backup).toBeGreaterThan(0);
    expect(encrypt).toBeGreaterThan(backup);
    expect(merge).toBeGreaterThan(encrypt);
    expect(deploy).toContain('rm -f base.dump');                 // jamais de sauvegarde en clair conservée
    expect(deploy).toMatch(/BACKUP_PASSWORD" \]; then echo .*exit 1/);
    expect(deploy).toContain('retention-days: 90');
    expect(deploy).toContain(`run-name: "${wf.deployRunName('${{ inputs.pr }}')}"`);
  });
});

describe('prompts quand le projet a un dépôt GitHub', () => {
  const { buildClaudeCodePrompt } = require('../prompts/deliverablePrompts');
  const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

  it('prompt Claude Code : pas de « cd » local ni de validation étape par étape (Claude Code travaille seul)', () => {
    const gh = buildClaudeCodePrompt({ session: { task: 'Lien' }, devDirectory: 'C:/BlabIA', githubRepo: 'moi/app', historyText: '…' }).user;
    expect(gh).not.toContain('cd "C:/BlabIA"');
    expect(gh).not.toContain('validation étape par étape');
    expect(gh).toContain('sans demander de validation intermédiaire');
    expect(gh).toContain('racine du dépôt GitHub moi/app');
    // Sans dépôt : comportement inchangé (copier-coller dans VS Code)
    const local = buildClaudeCodePrompt({ session: { task: 'Lien' }, devDirectory: 'C:/BlabIA', historyText: '…' }).user;
    expect(local).toContain('cd "C:/BlabIA"');
    expect(local).toContain('validation étape par étape');
  });

  it('agents : le dépôt figure dans le bloc commun (mis en cache)', () => {
    const base = { agent: { name: 'Léa', role: 'Dev', systemPrompt: '' }, session: { task: 'T' }, intention: ['claude_code'], activeAgents: [] };
    const blocks = buildAgentSystemPrompt({ ...base, project: { name: 'P', brief: 'b', githubRepo: 'moi/app' } });
    const shared = Array.isArray(blocks) ? blocks[0].text : String(blocks);
    expect(shared).toContain('DÉPÔT DU CODE : GitHub moi/app');
    const without = buildAgentSystemPrompt({ ...base, project: { name: 'P', brief: 'b' } });
    expect(JSON.stringify(without)).not.toContain('DÉPÔT DU CODE');
  });
});
