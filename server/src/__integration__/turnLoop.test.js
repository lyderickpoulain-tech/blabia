import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Boucle des tours d'agents : une mention « @agent » ne vaut que pour le premier tour, et
// un agent seul répond une fois. Avant correction, l'agent répétait « On clôture » jusqu'à
// MAX_TURNS (12) sans que l'orchestrateur ne puisse proposer la clôture.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sse = text => [...text.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: 'Tu es Léa.' },
  { id: 'a2', name: 'Max', role: 'Analyste', systemPrompt: 'Tu es Max.' },
];

describe.skipIf(!harness.enabled)('boucle des tours d’agents', () => {
  let h, owner, pid;
  let closeOnOrchestrate = true;
  const chat = async (sid, message) => {
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, {
      method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
    });
    return sse(await res.text());
  };
  const speakers = events => events.filter(e => e.type === 'agent_message').flatMap(e => e.messages).map(m => m.agentName);

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'boucle@test.local');
    // Orchestrateur : propose toujours la clôture ; agents : toujours la même réponse
    h.ai.responder = p => p.model === ORCHESTRATOR_MODEL
      ? { text: JSON.stringify(closeOnOrchestrate ? { agentIndex: 2, reason: 'Tout est couvert', shouldClose: true } : { agentIndex: 1, reason: 'Seul agent', shouldClose: false }) }
      : { text: 'Rien à ajouter, tout est verrouillé. On clôture.' };
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Boucle' } })).body.id;
  });
  afterAll(async () => { await h?.stop(); });

  it('mention « @Léa » : Léa répond une fois, puis l’orchestrateur reprend (clôture proposée)', async () => {
    const sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
      body: { task: 'Mode sombre', intention: ['claude_code'], activeAgents: AGENTS } })).body.session.id;
    const events = await chat(sid, '@Léa tu confirmes le contraste ?');
    expect(speakers(events)).toEqual(['Léa']);
    expect(events.some(e => e.type === 'suggest_close')).toBe(true);
  });

  it('réunion à un seul agent : une réponse par message de l’humain', async () => {
    closeOnOrchestrate = false; // contradicteur actif : l'orchestrateur est consulté, il désigne le seul agent
    const sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
      body: { task: 'Seul', intention: ['decision'], activeAgents: [AGENTS[0]] } })).body.session.id;
    expect(speakers(await chat(sid, 'Qu’en penses-tu ?'))).toEqual(['Léa']);
  });
});
