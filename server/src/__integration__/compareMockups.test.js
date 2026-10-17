import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Trois maquettes à comparer (v5.1, étape B du test « Gérard ») : un seul agent les produit,
// avec plus de marge de tokens, sur un même message ; puis la main revient à l'humain
// (les agents suivants ne choisissent pas à sa place). IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sse = text => [...text.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const AGENTS = [
  { id: 'a1', name: 'Créatif', role: 'Idées', systemPrompt: 'Tu es Créatif.' },
  { id: 'a2', name: 'Stratège', role: 'Plans', systemPrompt: 'Tu es Stratège.' },
];
const block = t => `[ARTIFACT_TITLE: ${t}]\n\`\`\`html\n<h1>${t}</h1>\n\`\`\``;

describe.skipIf(!harness.enabled)('maquettes à comparer', () => {
  let h, owner, pid, sid;
  const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'gerard@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Site musique du monde' } })).body.id;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir le style', intention: ['decision'], activeAgents: AGENTS } })).body.session.id;
    h.ai.responder = p => {
      if (p.model === ORCHESTRATOR_MODEL) return { text: JSON.stringify({ agentIndex: 1, reason: 'Visuel', shouldClose: false }) };
      if (sysText(p).includes('Tu participes à une réunion')) {
        return { text: `Trois ambiances bien distinctes.\n${block('A — Carnet de voyage')}\n${block('B — Pochettes en vedette')}\n${block('C — Esprit boulangerie')}` };
      }
      return { text: 'Je retiendrais B.' };
    };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('un message porte les trois maquettes, puis la main revient à l’humain', async () => {
    const calls = h.ai.calls.length;
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Trois maquettes à comparer : la page d’accueil du site', artifactRequest: true, artifactCompare: true }),
    });
    const msgs = sse(await res.text()).filter(e => e.type === 'agent_message').flatMap(e => e.messages);
    expect(msgs.map(m => m.content)).toEqual(['Trois ambiances bien distinctes.']);
    expect(msgs[0].artifacts.map(a => a.title)).toEqual(['A — Carnet de voyage', 'B — Pochettes en vedette', 'C — Esprit boulangerie']);
    expect(msgs[0].artifact).toBeUndefined();

    const agentCalls = h.ai.calls.slice(calls).filter(p => sysText(p).includes('Tu participes à une réunion'));
    expect(agentCalls).toHaveLength(1); // aucun agent ne choisit à la place de l'humain
    expect(agentCalls[0].max_tokens).toBeGreaterThanOrEqual(9000); // + la marge de callAgent
    expect(sysText(agentCalls[0])).toContain('TROIS MAQUETTES À COMPARER');
  });
});
