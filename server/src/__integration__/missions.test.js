import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Missions des agents avec une IA SIMULÉE : proposition en réunion ([MISSION:…]),
// budget mensuel, validation, exécution par un sous-agent (outil client
// read_project_document), rapport versé aux documents, coût, réunion suivante,
// annulation, projet exemple.

const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: 'Tu es Léa.' },
  { id: 'a2', name: 'Max', role: 'Analyste', systemPrompt: 'Tu es Max.' },
];
const sse = text => [...text.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const waitFor = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 100)); }
};

describe.skipIf(!harness.enabled)('missions des agents (IA simulée)', () => {
  let h, owner, pid, sid;
  const agentReplies = [];
  const isRunner = p => typeof p.system === 'string' && p.system.includes('sous-agent de BlabIA');

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'missions@test.local');
    h.ai.responder = (p) => {
      if (p.model === ORCHESTRATOR_MODEL) return { text: JSON.stringify({ agentIndex: 1, reason: 'Suite', shouldClose: agentReplies.length === 0 }) };
      if (Array.isArray(p.system)) return agentReplies.shift() || { text: 'Rien à ajouter.' };
      if (isRunner(p)) {
        const toolResults = p.messages.filter(m => m.role === 'user' && Array.isArray(m.content)).flatMap(m => m.content).filter(b => b.type === 'tool_result');
        if (toolResults.length === 0) {
          return { stop_reason: 'tool_use', usage: { input_tokens: 2000, output_tokens: 80 },
            content: [{ type: 'text', text: 'Je lis le devis.' }, { type: 'tool_use', id: 'tu_1', name: 'read_project_document', input: { name: 'Devis.txt' } }] };
        }
        expect(toolResults[0].content).toContain('18 400');
        return { usage: { input_tokens: 3000, output_tokens: 900 }, content: [
          { type: 'text', text: '# Comparer les devis\n## Synthèse\nLe devis Atelier Brun (18 400 € HT) est dans la moyenne.\n## Résultats\n…\n## Recommandation\nNégocier le délai.\n## Limites et points à vérifier\nUn seul devis fourni.' },
          { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', url: 'https://exemple.fr/prix-travaux', title: 'Prix des travaux PMR' }] },
        ] };
      }
      return { text: '## Compte-rendu' };
    };
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon de thé', objectif: 'Ouvrir un salon de thé.' } })).body.id;
    await h.db('ProjectDocument').insert({ projectId: pid, name: 'Devis.txt', content: 'Devis Atelier Brun : 18 400 € HT, 11 semaines.', charCount: 46 });
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Budget travaux', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false } })).body.session.id;
  });
  afterAll(async () => { await h?.stop(); });

  let missionId;
  it('un agent propose une mission : carte dans le fil, mission « proposée »', async () => {
    agentReplies.push({ text: 'Il faut comparer avant de signer.\n[MISSION:{"title":"Comparer les devis","objective":"Situer le devis Atelier Brun par rapport aux prix du marché","deliverable":"Tableau comparatif","kind":"research"}]' });
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Le devis est-il correct ?' }) });
    const events = sse(await res.text());
    const ev = events.find(e => e.type === 'mission');
    expect(ev.mission).toMatchObject({ title: 'Comparer les devis', status: 'proposed', kind: 'research', budgetUSD: 0.6 });
    const msg = events.filter(e => e.type === 'agent_message').flatMap(e => e.messages).find(m => m.missionId);
    expect(msg.missionId).toBe(ev.mission.id);
    expect(msg.content).not.toContain('[MISSION');
    missionId = ev.mission.id;
  });

  it('budget mensuel : refus si insuffisant, puis validation au niveau choisi (le plafond en découle)', async () => {
    await h.request('PATCH', `/api/projects/${pid}`, { token: owner.token, body: { missionsMonthlyBudgetUSD: 0.5 } });
    const refused = await h.request('POST', `/api/projects/${pid}/missions/${missionId}/approve`, { token: owner.token, body: {} });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('Budget des missions du mois insuffisant');
    await h.request('PATCH', `/api/projects/${pid}`, { token: owner.token, body: { missionsMonthlyBudgetUSD: 5 } });
    const ok = await h.request('POST', `/api/projects/${pid}/missions/${missionId}/approve`, { token: owner.token, body: { level: 'deep' } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'queued', level: 'deep', budgetUSD: 2 });
  });

  it('exécution : outil du projet, rapport versé aux documents, coût enregistré', async () => {
    const done = await waitFor(async () => {
      const [m] = await h.db('AgentMission').where({ id: missionId });
      return ['done', 'failed'].includes(m.status) && m;
    });
    expect(done.error).toBeNull();
    expect(done.status).toBe('done');
    expect(done.report).toContain('## Synthèse');
    expect(done.report).toContain('https://exemple.fr/prix-travaux'); // sources ajoutées au rapport
    expect(done.costUSD).toBeGreaterThan(0);
    const [doc] = await h.db('ProjectDocument').where({ id: done.documentId });
    expect(doc.name).toBe('Mission — Comparer les devis');
    const logs = await h.db('UsageLog').where({ projectId: pid, kind: 'mission' });
    expect(logs.length).toBe(2);
    const list = (await h.request('GET', `/api/projects/${pid}/missions`, { token: owner.token })).body;
    expect(list.budget.spentUSD).toBeGreaterThan(0);
  });

  it('réunion suivante : la mission et son rapport sont connus des agents', async () => {
    const sid2 = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Suite', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false } })).body.session.id;
    agentReplies.push({ text: 'Le rapport de mission confirme le devis.' });
    const calls = h.ai.calls.length;
    await (await fetch(`${h.base}/api/projects/${pid}/sessions/${sid2}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'On reprend.' }) })).text();
    const shared = h.ai.calls.slice(calls).find(p => Array.isArray(p.system)).system[0].text;
    expect(shared).toContain('[terminée] Comparer les devis');
    expect(shared).toContain('« Mission — Comparer les devis »'); // rapport lu comme document
  });

  it('annulation d’une mission en attente ; projet exemple refusé', async () => {
    const [m] = await h.db('AgentMission').insert({ projectId: pid, agentName: 'Léa', title: 'Autre', objective: 'x', status: 'queued', approvedAt: new Date() }).returning('id');
    const c = await h.request('POST', `/api/projects/${pid}/missions/${m.id ?? m}/cancel`, { token: owner.token });
    expect(c.body.status).toBe('cancelled');
    const demo = (await h.request('POST', '/api/projects/demo', { token: owner.token })).body;
    const [dm] = await h.db('AgentMission').insert({ projectId: demo.id, agentName: 'Léa', title: 'Démo', objective: 'x' }).returning('id');
    const r = await h.request('POST', `/api/projects/${demo.id}/missions/${dm.id ?? dm}/approve`, { token: owner.token, body: {} });
    expect(r.status).toBe(403);
  });
});
