import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// « Votre vision » (v5.1, 18/10/2026 — personas : le novice craint d'être mal retranscrit) :
// BlabIA écrit ce qu'il a compris, le porteur corrige et valide ; la vision validée devient la
// référence des agents. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
const VISION = 'Vous voulez faire découvrir les groupes de metal qui mêlent leur culture traditionnelle.';

describe.skipIf(!harness.enabled)('votre vision', () => {
  let h, owner, member, pid;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'vision@test.local');
    member = await h.createUser('member', 'vision-membre@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'WorldOfMetal', objectif: 'Faire découvrir le metal du monde (The Hu, Bloodywood).' } })).body.id;
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: member.id, role: 'collaborator' });
    h.ai.responder = p => (p.model === ORCHESTRATOR_MODEL
      ? { text: JSON.stringify({ agentIndex: 1, reason: 'Suite', shouldClose: false }) }
      : sysText(p).includes('Tu reformules le projet') ? { text: VISION } : { text: 'Bien noté.' });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('brouillon rédigé par BlabIA, à partir de tout le projet ; réservé au propriétaire', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/vision/draft`, { token: member.token })).status).toBe(403);
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/vision/draft`, { token: owner.token });
    expect(r.body).toMatchObject({ vision: VISION, visionStatus: 'draft' });
    expect(h.ai.calls[calls].messages[0].content).toContain('The Hu, Bloodywood');
    expect(h.ai.calls[calls].messages[0].content).toContain('n\'invente rien');
  });

  it('brouillon : pas encore une référence pour les agents ; validée : elle l’est', async () => {
    const sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir le style', intention: ['decision'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'Design', systemPrompt: '' }] } })).body.session.id;
    const agentPrompt = async () => {
      const calls = h.ai.calls.length;
      await (await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'On commence ?' }) })).text();
      return sysText(h.ai.calls.slice(calls).find(c => c.model !== ORCHESTRATOR_MODEL));
    };
    expect(await agentPrompt()).not.toContain('SA VISION, VALIDÉE PAR LUI');
    const corrected = `${VISION} Sans publicité envahissante.`;
    const r = await h.request('PUT', `/api/projects/${pid}/vision`, { token: owner.token, body: { text: corrected, validated: true } });
    expect(r.body).toMatchObject({ vision: corrected, visionStatus: 'validated' });
    expect(await agentPrompt()).toContain(`SA VISION, VALIDÉE PAR LUI (la référence de tout le projet : si une proposition s'en écarte, dis-le-lui clairement) :\n${corrected}`);
    const project = (await h.request('GET', `/api/projects/${pid}`, { token: member.token })).body;
    expect(project).toMatchObject({ vision: corrected, visionStatus: 'validated' }); // lisible par l'équipe
    expect((await h.request('PUT', `/api/projects/${pid}/vision`, { token: owner.token, body: { text: '  ' } })).status).toBe(400);
  });
});
