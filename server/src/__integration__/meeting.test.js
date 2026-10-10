import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Réunion complète avec une IA SIMULÉE (aucun appel réel, aucun coût) : orchestrateur,
// tour d'agent, carte de décision, réponse, contradicteur, conclusion (décisions,
// actions), coût journalisé, réunion suivante (registre + actions + point d'avancement),
// projet exemple (IA refusée).

const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sse = text => [...text.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: 'Tu es Léa.' },
  { id: 'a2', name: 'Max', role: 'Analyste', systemPrompt: 'Tu es Max.' },
];

describe.skipIf(!harness.enabled)('réunion complète (IA simulée)', () => {
  let h, owner, pid, sid;
  const orchestratorPlan = [];     // réponses successives de l'orchestrateur
  const agentReplies = [];         // réponses successives des agents
  const isOrchestrator = p => p.model === ORCHESTRATOR_MODEL;
  const isAgent = p => Array.isArray(p.system);
  const isExtraction = p => typeof p.system === 'string' && p.system.includes('Tu extrais');

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'porteur@test.local');
    h.ai.responder = (p) => {
      if (isOrchestrator(p)) return { text: JSON.stringify(orchestratorPlan.shift() || { agentIndex: 1, reason: 'Suite', shouldClose: true }), usage: { input_tokens: 600, output_tokens: 40 } };
      if (isAgent(p)) return agentReplies.shift() || { text: 'Rien de nouveau.' };
      if (isExtraction(p)) return { text: JSON.stringify({
        decisions: [
          { statement: 'Le salon ouvrira à la Croix-Rousse', rationale: 'Loyer compatible avec l’apport', rejectedOptions: ['Presqu’île'], origin: 'human' },
          { statement: 'Signer le bail avant fin janvier', origin: 'agents', vigilance: 'Clause de sortie non vérifiée : faire relire le bail.' },
        ],
        actions: [
          { title: 'Visiter trois locaux', detail: 'Croix-Rousse', dueInDays: 7 },
          { title: 'Rencontrer la banque', dueInDays: null },
        ],
      }) };
      return { text: '## Compte-rendu\n- Croix-Rousse retenue' }; // compte-rendu
    };
    const project = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon de thé', objectif: 'Ouvrir un salon de thé à Lyon.' } })).body;
    pid = project.id;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir le quartier', intention: ['decision'], activeAgents: AGENTS } })).body.session.id;
  });
  afterAll(async () => { await h?.stop(); });

  it('tour d’agent : orchestrateur léger, prompt en deux blocs (cache), carte de décision', async () => {
    orchestratorPlan.push({ agentIndex: 2, reason: 'Apporte les chiffres', shouldClose: false });
    agentReplies.push({
      text: 'Croix-Rousse : 28 €/m², Presqu’île : 45 €/m².\n[NEXT]\nUn point vous revient.\n[DECISION:{"question":"Quel quartier ?","choices":["Croix-Rousse","Presqu’île","Autre (précise)"],"context":"Le loyer pèse lourd."}]',
      usage: { input_tokens: 300, output_tokens: 120, cache_creation_input_tokens: 1700 },
    });
    const calls = h.ai.calls.length;
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Bonjour, quel quartier ?' }) });
    const events = sse(await res.text());
    const newCalls = h.ai.calls.slice(calls);

    expect(events.filter(e => e.type === 'agent_message').flatMap(e => e.messages).map(m => m.agentName)).toEqual(['Max', 'Max']);
    expect(events.find(e => e.type === 'decision')?.question).toBe('Quel quartier ?');
    expect(newCalls[0].model).toBe(ORCHESTRATOR_MODEL);
    expect(newCalls[0].thinking).toEqual({ type: 'disabled' });
    const agentCall = newCalls.find(isAgent);
    expect(agentCall.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(agentCall.system[0].text).toContain('Ouvrir un salon de thé à Lyon.');
    expect(agentCall.system[1].text).toContain('tu es Max');
  });

  it('réponse à la carte de décision', async () => {
    const s = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body;
    const card = s.messages.find(m => m.type === 'decision');
    const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/answer-decision`, { token: owner.token, body: { messageId: card.id, answer: 'Croix-Rousse', status: 'answered' } });
    expect(r.status).toBe(200);
    expect(r.body.message.status).toBe('answered');
    expect(r.body.systemMessage.content).toContain('Croix-Rousse');
  });

  it('contradicteur : point de vigilance, puis « Écarter » (une seule réponse)', async () => {
    orchestratorPlan.push({ agentIndex: 1, reason: 'Risque', shouldClose: false, challenge: true, challengeTarget: 'Signer le bail cette semaine' });
    agentReplies.push({ text: '**Point de vigilance** : un bail 3-6-9 engage 3 ans ; faites relire la clause de sortie.' });
    orchestratorPlan.push({ agentIndex: 1, reason: 'Fin', shouldClose: true });
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Je signe le bail cette semaine.' }) });
    const msgs = sse(await res.text()).filter(e => e.type === 'agent_message').flatMap(e => e.messages);
    const vig = msgs.find(m => m.vigilance);
    expect(vig.agentName).toBe('Contradicteur');
    expect(vig.vigilance).toMatchObject({ status: 'open', target: 'Signer le bail cette semaine' });
    const r1 = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/vigilance`, { token: owner.token, body: { messageId: vig.id, status: 'dismissed' } });
    const r2 = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/vigilance`, { token: owner.token, body: { messageId: vig.id, status: 'accepted' } });
    expect([r1.status, r2.status]).toEqual([200, 409]);
  });

  it('conclusion : compte-rendu, décisions (dont une fragile) et actions proposées, puis inscrites', async () => {
    const gen = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/generate-deliverable`, { token: owner.token, body: {} });
    expect(gen.status).toBe(200);
    expect(gen.body.summary).toContain('Croix-Rousse retenue');
    expect(gen.body.decisionProposals.map(d => !!d.vigilance)).toEqual([false, true]);
    expect(gen.body.actionProposals[0]).toMatchObject({ title: 'Visiter trois locaux', description: 'Croix-Rousse' });
    expect(gen.body.actionProposals[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(gen.body.actionProposals[1].dueDate).toBeNull();

    const d = await h.request('POST', `/api/projects/${pid}/decisions/from-session`, { token: owner.token, body: { sessionId: sid, decisions: gen.body.decisionProposals } });
    const a = await h.request('POST', `/api/projects/${pid}/actions/from-session`, { token: owner.token, body: { sessionId: sid, actions: gen.body.actionProposals } });
    expect([d.status, a.status]).toEqual([201, 201]);
    const st = await h.request('PATCH', `/api/projects/${pid}/sessions/${sid}/status`, { token: owner.token, body: { status: 'accepted' } });
    expect(st.status).toBe(200);
  });

  it('coût réel journalisé (modèles, cache) et visible dans les statistiques', async () => {
    const rows = await h.db('UsageLog').where({ projectId: pid }).select('kind', 'model', 'cacheWriteTokens', 'costUSD');
    expect(rows.some(r => r.kind === 'chat' && r.model === ORCHESTRATOR_MODEL)).toBe(true);
    expect(rows.some(r => r.kind === 'chat' && r.cacheWriteTokens === 1700)).toBe(true);
    expect(rows.some(r => r.kind === 'generate-deliverable')).toBe(true);
    expect(rows.every(r => r.costUSD > 0)).toBe(true);
    const stats = (await h.request('GET', `/api/projects/${pid}/stats`, { token: owner.token })).body;
    expect(stats.realCostUSD).toBeGreaterThan(0);
  });

  it('réunion suivante : registre, actions numérotées et point d’avancement transmis aux agents', async () => {
    const sid2 = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Construire la carte', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false } })).body.session.id;
    orchestratorPlan.push({ agentIndex: 1, reason: 'Ouvre', shouldClose: false });
    agentReplies.push({ text: 'Point d’avancement : la visite des locaux est prévue cette semaine.' });
    orchestratorPlan.push({ agentIndex: 1, reason: 'Fin', shouldClose: true });
    const calls = h.ai.calls.length;
    await (await fetch(`${h.base}/api/projects/${pid}/sessions/${sid2}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'On démarre.' }) })).text();
    const agentCall = h.ai.calls.slice(calls).find(isAgent);
    const shared = agentCall.system[0].text;
    expect(shared).toContain('Le salon ouvrira à la Croix-Rousse');
    expect(shared).toContain('1. [à faire');
    expect(shared).toContain('Visiter trois locaux');
    expect(shared).toContain('POINT D\'AVANCEMENT');
    // Contradicteur désactivé pour cette réunion : pas de section dans le prompt de l'orchestrateur
    expect(h.ai.calls.slice(calls).filter(isOrchestrator).some(c => c.messages[0].content.includes('CONTRADICTEUR'))).toBe(false);
  });

  it('projet exemple : l’IA est refusée (aucun appel, aucun coût)', async () => {
    const demo = (await h.request('POST', '/api/projects/demo', { token: owner.token })).body;
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${demo.id}/quick-command`, { token: owner.token, body: { input: 'résume' } });
    expect(r.status).toBe(403);
    expect(r.body.demo).toBe(true);
    expect(h.ai.calls.length).toBe(calls);
    expect((await h.request('DELETE', '/api/projects/demo', { token: owner.token })).body.deleted).toBe(1);
  });
});
