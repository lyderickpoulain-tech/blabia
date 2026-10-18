import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Déroulé d'une réunion (v5.1, 18/10/2026 — constats sur « WorldOfMetal ») : une réponse dit ce
// qui suit, « À trancher » signale la réunion qui peut reprendre ; la proposition de conclure est
// conservée et tient compte des questions encore ouvertes. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sse = t => [...t.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Design', systemPrompt: 'Tu es Léa.' },
  { id: 'a2', name: 'Max', role: 'Contenu', systemPrompt: 'Tu es Max.' },
];

describe.skipIf(!harness.enabled)('déroulé d’une réunion', () => {
  let h, owner, pid, sid;
  let orch = [];   // réponses successives de l'orchestrateur
  let agents = []; // réponses successives des agents
  const chat = async body => sse(await (await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, {
    method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })).text());
  const session = async () => (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body;
  const inbox = async () => (await h.request('GET', `/api/projects/${pid}/assistant/inbox`, { token: owner.token })).body.items;

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'flow@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'WorldOfMetal', objectif: 'Faire découvrir le metal du monde.' } })).body.id;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir le style', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false } })).body.session.id;
    h.ai.responder = p => (p.model === ORCHESTRATOR_MODEL
      ? { text: JSON.stringify(orch.shift() || { agentIndex: 1, reason: 'Suite', shouldClose: false }) }
      : agents.shift() || { text: 'Rien de neuf.' });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('une réponse dit ce qui suit ; « À trancher » propose de reprendre', async () => {
    orch = [{ agentIndex: 1, reason: 'Typographie' }];
    agents = [{ text: 'Trois polices possibles.\n[DECISION:{"question":"Quelle police ?","choices":["Cinzel","Metal Mania","Autre (précise)"],"context":"Le ton du site."}]' }];
    const ev = await chat({ message: 'Proposez-moi des polices.' });
    const card = ev.find(e => e.type === 'decision');
    expect(card).toBeTruthy();
    const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: owner.token, body: { messageId: card.messageId, answer: 'Cinzel', status: 'answered' } });
    expect(r.body).toMatchObject({ followUp: 'resume', remaining: 0 });
    expect((await inbox()).find(i => i.kind === 'meeting_resume' && i.sessionId === sid)).toBeTruthy();
  });

  it('proposer de conclure : conservé dans la réunion, avec les questions encore ouvertes', async () => {
    orch = [
      { agentIndex: 2, reason: 'Couleurs' },
      { agentIndex: 1, reason: 'Objectif atteint', shouldClose: true },
    ];
    agents = [{ text: 'Et les couleurs ?\n[DECISION:{"question":"Quelles couleurs ?","choices":["Cuivre et noir","Rouge et noir","Autre (précise)"],"context":"Ambiance."}]' }];
    let ev = await chat({ message: '', resume: true });
    expect(ev.find(e => e.type === 'decision')).toBeTruthy();
    // L'humain écrit au lieu de répondre : la question reste ouverte, les agents proposent de conclure
    ev = await chat({ message: 'Et pour le logo ?' });
    const close = ev.find(e => e.type === 'suggest_close');
    expect(close).toMatchObject({ pendingCount: 1, message: { type: 'close_suggestion' } });
    const s = await session();
    expect(s.messages.filter(m => m.type === 'close_suggestion')).toHaveLength(1);
    // L'orchestrateur savait qu'une question attendait encore l'humain
    const lastOrch = h.ai.calls.filter(c => c.model === ORCHESTRATOR_MODEL).at(-1);
    expect(lastOrch.messages[0].content).toContain('1 question attend la réponse de l\'humain');
    // Pas de « prête à conclure » dans « À trancher » tant que la question attend
    expect((await inbox()).find(i => i.kind === 'meeting_close' && i.sessionId === sid)).toBeFalsy();
  });
});
