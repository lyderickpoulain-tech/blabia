import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Préparation d'une réunion par les agents, sans l'humain (v5.1, 15/10/2026) : lancée, elle
// continue sur le serveur quand l'humain se déconnecte ; « Mes projets » et la liste des
// réunions la signalent en cours, puis prête ; rien d'autre ne s'y mêle pendant ce temps.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: '' },
  { id: 'a2', name: 'Max', role: 'Analyste', systemPrompt: '' },
];
const waitFor = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 100)); }
};

describe.skipIf(!harness.enabled)('préparation sans l’humain', () => {
  let h, owner, pid, sid;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'prepa@test.local');
    h.ai.responder = async p => {
      if (p.model === ORCHESTRATOR_MODEL) return { text: JSON.stringify({ agentIndex: 1, reason: 'Avancer', shouldClose: false }) };
      if (typeof p.system === 'string') return { text: JSON.stringify({ summary: '## Ce que les agents proposent\nUne carte courte.', decisions: [{ question: 'Quel budget ?', choices: ['50 €', 'Autre (précise)'], context: 'Fixe la gamme.' }] }) };
      await new Promise(r => setTimeout(r, 120)); // agents « lents » : l'humain est parti avant la fin
      return { text: 'Je propose une carte courte.' };
    };
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon' } })).body.id;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir la carte', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false } })).body.session.id;
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('continue après la déconnexion, signalée en cours puis prête', async () => {
    const ac = new AbortController();
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, {
      method: 'POST', signal: ac.signal,
      headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '', resume: true, prepare: true }),
    });
    const reader = res.body.getReader();
    await reader.read();      // « connected »
    ac.abort();               // l'humain retourne à ses projets
    // En cours : signalée, et pas d'autre échange en parallèle
    const list = (await h.request('GET', `/api/projects/${pid}/sessions`, { token: owner.token })).body;
    expect(list.find(s => s.id === sid)).toMatchObject({ prepRunning: true, prepReady: false });
    expect((await h.request('GET', '/api/projects', { token: owner.token })).body.find(p => p.id === pid).prepRunning).toBe(true);
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/chat`, { token: owner.token, body: { message: 'Je suis là' } })).status).toBe(409);
    // Prête : synthèse et décision enregistrées alors que personne n'écoutait
    await waitFor(async () => (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body.messages.some(m => m.type === 'prep_summary'));
    const session = await waitFor(async () => { const s = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body; return !s.prepRunning && s; });
    expect(session.messages.filter(m => m.role === 'agent').length).toBeGreaterThanOrEqual(4);
    expect(session.messages.some(m => m.type === 'decision' && m.question === 'Quel budget ?')).toBe(true);
    expect((await h.request('GET', `/api/projects/${pid}/sessions`, { token: owner.token })).body.find(s => s.id === sid)).toMatchObject({ prepRunning: false, prepReady: true });
    expect((await h.request('GET', '/api/projects', { token: owner.token })).body.find(p => p.id === pid).prepReadyCount).toBe(1);
  });

  it('une fois l’humain venu (réponse à une carte), elle n’est plus signalée', async () => {
    const card = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body.messages.find(m => m.type === 'decision');
    await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: owner.token, body: { messageId: card.id, answer: '50 €', status: 'answered' } });
    expect((await h.request('GET', '/api/projects', { token: owner.token })).body.find(p => p.id === pid).prepReadyCount).toBe(0);
  });

  it('arrêt de la préparation à la demande', async () => {
    const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/prepare/stop`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.stopped).toBe(false); // plus rien en cours
  });
});
