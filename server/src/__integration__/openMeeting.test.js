import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Retours du 18/10 (WorldOfMetal) : une réunion du plan lancée deux fois ; le bras droit doit
// pouvoir reprendre une réunion commencée ; illustrer les choix faits. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');
const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
const AGENTS = [{ id: 'a1', name: 'Léa', role: 'Design', systemPrompt: '' }, { id: 'a2', name: 'Max', role: 'Données', systemPrompt: '' }];

describe.skipIf(!harness.enabled)('réunion déjà ouverte, passation, illustration', () => {
  let h, owner, pid, ms, sid;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'open@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'WorldOfMetal', objectif: 'Metal du monde.' } })).body.id;
    ms = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Modèle de données', type: 'claude_code' } })).body;
    h.ai.responder = p => {
      if (p.model === ORCHESTRATOR_MODEL) return { text: JSON.stringify({ agentIndex: 1, reason: 'Suite', shouldClose: (p.messages[0].content || '').includes('On termine') }) };
      if (sysText(p).includes('tu lui rends compte')) return { text: 'Modèle terminé.' };
      if (sysText(p).includes('ILLUSTRATION DEMANDÉE')) return { text: 'Voici vos choix.\n[ARTIFACT_TITLE: Polices et couleurs]\n```html\n<h1 style="font-family:Cinzel">WorldOfMetal</h1>\n```' };
      if (sysText(p).includes('bras droit de l\'humain sur le projet')) return { text: 'Rien de visuel n’est encore choisi.' };
      return { text: 'On termine : quatre listes.' };
    };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('une réunion du plan déjà ouverte ne se recrée pas : 409 avec son identifiant', async () => {
    const body = { task: 'Modèle de données', intention: ['claude_code'], activeAgents: AGENTS, milestoneId: ms.id };
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body })).body.session.id;
    await (await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Commençons.' }) })).text();
    const again = await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { ...body, delegation: {} } });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ kind: 'already_open', openSessionId: sid });
  });

  it('passation : le bras droit reprend la réunion commencée et la termine', async () => {
    const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/handover`, { token: owner.token, body: { delegation: {} } });
    expect(r.body.delegation).toMatchObject({ handover: true, status: 'pending' });
    const before = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body.messages.length;
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '', resume: true, delegate: true }) });
    expect(res.status).toBe(200);
    await res.text();
    const s = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body;
    expect(s.messages.length).toBeGreaterThan(before); // reprise là où elle en était, pas de nouvelle réunion
    expect(s.delegation).toMatchObject({ status: 'done', note: { headline: 'Modèle terminé.' } });
    expect(await h.db('Session').where({ projectId: pid, milestoneId: ms.id })).toHaveLength(1);
  });

  it('le bras droit illustre les choix faits, à la demande', async () => {
    const calls = h.ai.calls.length;
    const reply = (await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Tu peux m’afficher le choix de typographie et de couleurs ?' } })).body.reply;
    expect(h.ai.calls[calls].max_tokens).toBeGreaterThanOrEqual(5000);
    expect(reply.content).toBe('Voici vos choix.');
    expect(reply.proposal).toMatchObject({ kind: 'artifact', artifact: { kind: 'html', title: 'Polices et couleurs' } });
    // Une question ordinaire : pas d'illustration
    const plain = (await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'On en est où ?' } })).body.reply;
    expect(plain.proposal?.kind).not.toBe('artifact');
  });
});
