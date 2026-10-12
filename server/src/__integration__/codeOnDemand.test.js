import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Projet relié à un dépôt : les agents lisent le code quand le sujet s'y prête (début de
// réunion) ou quand une question le demande (en cours de réunion) ; les missions aussi.
// Cas réel : les agents posaient à l'humain des questions dont la réponse était dans le code.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sse = text => [...text.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
const userText = p => p.messages.map(m => (typeof m.content === 'string' ? m.content : (m.content || []).map(b => b.text || '').join('\n'))).join('\n');

const PATHS = ['README.md', 'src/Home.jsx', 'src/Prix.jsx', 'src/numerologie.js'];
const FILES = {
  'README.md': '# Site de numérologie',
  'src/Home.jsx': '<h1>Bienvenue</h1><Prix />',
  'src/Prix.jsx': 'export const PRIX = "9,90 € par profil";',
  'src/numerologie.js': 'export const cheminDeVie = d => reduire(somme(d));',
};

describe.skipIf(!harness.enabled)('lecture du code à la demande', () => {
  let h, owner, pid, github, realGh, realConfigured;
  let orchestratorReply = {};
  let pick = [];
  const chat = async (sid, message) => {
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
    });
    return sse(await res.text());
  };
  const agentSystems = () => h.ai.calls.filter(p => p.model !== ORCHESTRATOR_MODEL && sysText(p).includes('DÉPÔT DU CODE')).map(sysText);
  const newSession = async task => (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
    body: { task, intention: ['decision'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'Produit', systemPrompt: '' }, { id: 'a2', name: 'Max', role: 'Tech', systemPrompt: '' }] } })).body.session.id;

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'code-demande@test.local');
    github = require('../services/github');
    realGh = github.gh; realConfigured = github.isConfigured;
    github.isConfigured = () => true;
    github.gh = async (_inst, _m, path) => {
      if (path === '/repos/moi/numero') return { default_branch: 'main' };
      if (path.startsWith('/repos/moi/numero/git/trees/main')) return { tree: PATHS.map(p => ({ path: p, type: 'blob' })) };
      const file = decodeURIComponent(path.replace('/repos/moi/numero/contents/', ''));
      if (FILES[file]) return { content: Buffer.from(FILES[file]).toString('base64') };
      throw Object.assign(new Error('Not Found'), { status: 404 });
    };
    await h.db('User').where({ id: owner.id }).update({ githubInstallationId: '77' });
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Numérologie' } })).body.id;
    await h.db('Project').where({ id: pid }).update({ githubRepo: 'moi/numero' });
    h.ai.responder = p => {
      if (sysText(p).includes('Tu choisis les fichiers')) return { text: JSON.stringify(pick) };
      if (p.model === ORCHESTRATOR_MODEL && userText(p).includes('orchestrateur')) {
        return { text: JSON.stringify({ agentIndex: 1, reason: 'r', shouldClose: false, ...orchestratorReply }) };
      }
      if (p.model === ORCHESTRATOR_MODEL) return { text: '{}' };
      return { text: 'Voilà mon avis.' };
    };
  });
  afterAll(async () => { if (github) { github.gh = realGh; github.isConfigured = realConfigured; } h.ai.responder = null; await h?.stop(); });

  it('sujet sans lien avec le code : rien n’est lu, mais les agents savent que le code est lisible', async () => {
    pick = [];
    const sid = await newSession('Choisir le nom du site');
    h.ai.calls.length = 0;
    await chat(sid, 'On commence ?');
    const [sys] = agentSystems();
    expect(sys).toContain('BlabIA peut lire ce code pendant la réunion');
    expect(sys).not.toContain('CODE DU PROJET');
    expect((await h.db('Session').where({ id: sid }).first()).codeContext).toBe('');
    // L'orchestrateur reçoit la consigne de repérer une question qui demande le code
    expect(userText(h.ai.calls.find(p => p.model === ORCHESTRATOR_MODEL && userText(p).includes('orchestrateur')))).toContain('codeQuestion');
  });

  it('question de l’humain qui demande le code : BlabIA le lit avant le tour de l’agent', async () => {
    pick = [];
    const sid = await newSession('Revoir la formule d’abonnement');
    await chat(sid, 'Bonjour');
    pick = ['src/Prix.jsx'];
    orchestratorReply = { codeQuestion: 'Où et comment le prix est affiché sur le site' };
    h.ai.calls.length = 0;
    const events = await chat(sid, 'Quel prix affiche le site aujourd’hui ?');
    expect(events.some(e => e.type === 'agent_typing' && e.agentName === 'BlabIA' && /Je lis le code/.test(e.reason))).toBe(true);
    const sys = agentSystems()[0];
    expect(sys).toContain('LECTURE COMPLÉMENTAIRE — Où et comment le prix est affiché sur le site');
    expect(sys).toContain('export const PRIX = "9,90 € par profil";');
    expect(sys).toContain('Arborescence (fichiers source)');
    // Conservé sur la réunion ; un fichier déjà lu n'est pas relu
    const stored = (await h.db('Session').where({ id: sid }).first()).codeContext;
    expect(stored).toContain('--- src/Prix.jsx ---');
    const picker = h.ai.calls.find(p => sysText(p).includes('Tu choisis les fichiers'));
    expect(userText(picker)).toContain('Question à éclairer par le code');
    h.ai.calls.length = 0;
    await chat(sid, 'Et ailleurs ?');
    const picker2 = h.ai.calls.find(p => sysText(p).includes('Tu choisis les fichiers'));
    expect(userText(picker2)).not.toContain('src/Prix.jsx');
    orchestratorReply = {};
  });

  it('sujet qui touche au code : lu dès le début de la réunion', async () => {
    pick = ['src/numerologie.js'];
    const sid = await newSession('Vérifier le calcul du chemin de vie');
    h.ai.calls.length = 0;
    await chat(sid, 'On commence ?');
    const sys = agentSystems()[0];
    expect(sys).toContain('CODE DU PROJET');
    expect(sys).toContain('export const cheminDeVie');
  });

  it('mission : outils de lecture du dépôt, code lu et transmis au sous-agent', async () => {
    const { executeMission } = require('../services/missionRunner');
    const project = await h.db('Project').where({ id: pid }).first();
    const seen = [];
    h.ai.responder = p => {
      seen.push(p);
      if (seen.length === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'read_code_file', input: { path: 'src/numerologie.js' } }] };
      return { text: '# Audit du calcul\n## Synthèse\nLe calcul réduit la somme des chiffres.' };
    };
    const { report } = await executeMission({ id: crypto.randomUUID(), projectId: pid, agentName: 'Max', kind: 'analysis', title: 'Auditer le calcul', objective: 'Vérifier le calcul', budgetUSD: 0.6, level: 'standard' }, project);
    expect(seen[0].tools.map(t => t.name)).toEqual(expect.arrayContaining(['list_code_files', 'read_code_file']));
    expect(sysText(seen[0])).toContain('lisent le dépôt GitHub moi/numero');
    const toolResult = seen[1].messages.flatMap(m => (Array.isArray(m.content) ? m.content : [])).find(b => b.type === 'tool_result');
    expect(toolResult.content).toContain('export const cheminDeVie');
    expect(report).toContain('# Audit du calcul');
  });
});
