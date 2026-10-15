import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Outils de réunion (v5.1, 16/10/2026), IA simulée : avis sur les bulles → préférences des
// agents ; animation visible ; « Où en est-on ? » ; formats de compte rendu ; zone
// d'interrogation du projet nourrie du registre et des comptes rendus.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
const sse = text => [...text.matchAll(/^data: (\{.*\})$/gm)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: '' },
  { id: 'a2', name: 'Max', role: 'Analyste', systemPrompt: '' },
];

describe.skipIf(!harness.enabled)('outils de réunion', () => {
  let h, owner, other, pid, sid;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'outils@test.local');
    other = await h.createUser('member', 'autre@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Salon' } })).body.id;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Choisir la carte', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false } })).body.session.id;
    await h.db('Session').where({ id: sid }).update({ messages: JSON.stringify([
      { id: 'h1', role: 'human', content: 'Quelle carte ?' },
      { id: 'm1', role: 'agent', agentName: 'Léa', content: 'Il faut un webhook Stripe et une table Subscription pour la carte.' },
      { id: 'm2', role: 'agent', agentName: 'Max', content: 'Une carte courte, douze thés.' },
    ]) });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('avis sur une bulle : enregistré, modifiable, retiré ; transmis aux agents comme préférence', async () => {
    const post = body => h.request('POST', `/api/projects/${pid}/sessions/${sid}/feedback`, { token: owner.token, body });
    expect((await post({ messageId: 'm1', kind: 'too_technical' })).body).toEqual({ messageId: 'm1', kind: 'too_technical' });
    expect((await post({ messageId: 'h1', kind: 'good' })).status).toBe(404);   // pas une bulle d'agent
    expect((await post({ messageId: 'm1', kind: 'bof' })).status).toBe(400);
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/feedback`, { token: other.token, body: { messageId: 'm1', kind: 'good' } })).status).toBe(404);
    await post({ messageId: 'm2', kind: 'off_topic' });
    await post({ messageId: 'm2', kind: 'good' }); // avis changé
    expect((await h.request('GET', `/api/projects/${pid}/sessions/${sid}/feedback`, { token: owner.token })).body).toEqual({ m1: 'too_technical', m2: 'good' });

    // Tour suivant : préférences dans le bloc commun ; l'animation parle à la transition
    h.ai.responder = p => (p.model === ORCHESTRATOR_MODEL
      ? { text: JSON.stringify({ agentIndex: 2, reason: 'Proposer', shouldClose: false, animation: 'On a la base ; Max, une carte à valider ?' }) }
      : { text: 'Douze thés, trois familles.' });
    const calls = h.ai.calls.length;
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'On avance ?' }) });
    const events = sse(await res.text());
    const agentCall = h.ai.calls.slice(calls).find(c => c.model !== ORCHESTRATOR_MODEL);
    const shared = agentCall.system[0].text;
    expect(shared).toContain('PRÉFÉRENCES APPRISES DE L\'HUMAIN');
    expect(shared).toContain('jugée « trop technique » (Léa) : « Il faut un webhook Stripe');
    expect(shared).toContain('appréciée (« bien vu ») (Max)');
    expect(shared).toContain('POSTURE (ce qui fait une bonne réponse)');
    const anim = events.find(e => e.type === 'animator');
    expect(anim.message).toMatchObject({ type: 'animator', agentName: 'Animation', content: 'On a la base ; Max, une carte à valider ?' });
    // L'animation est lue par les agents au tour suivant (historique)
    expect(sysText(agentCall)).toContain('Animation : On a la base ; Max, une carte à valider ?');

    await post({ messageId: 'm1', kind: null });
    expect((await h.request('GET', `/api/projects/${pid}/sessions/${sid}/feedback`, { token: owner.token })).body).toEqual({ m2: 'good' });
  });

  it('« Où en est-on ? » : point de situation de l’animation, enregistré dans la réunion', async () => {
    h.ai.responder = p => (p.model === ORCHESTRATOR_MODEL
      ? { text: 'Où on en est : la carte.\nAcquis : douze thés.\nReste à trancher : les prix.' } : { text: '' });
    const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/where`, { token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.message).toMatchObject({ type: 'animator', kind: 'where', content: 'Où on en est : la carte.\nAcquis : douze thés.\nReste à trancher : les prix.' });
    const msgs = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body.messages;
    expect(msgs.at(-1).id).toBe(r.body.message.id);
  });

  it('formats de compte rendu : réunion conclue seulement ; conservés, refaits si le CR change', async () => {
    const fmt = format => h.request('POST', `/api/projects/${pid}/sessions/${sid}/summary-format`, { token: owner.token, body: { format } });
    expect((await fmt('executive')).status).toBe(409);
    await h.db('Session').where({ id: sid }).update({ status: 'accepted', summary: '## Décisions\n- Carte de douze thés.' });
    let n = 0;
    h.ai.responder = () => ({ text: `Synthèse ${++n}` });
    const calls = h.ai.calls.length;
    expect((await fmt('executive')).body).toMatchObject({ content: 'Synthèse 1', cached: false });
    expect(h.ai.calls[calls].messages[0].content).toContain('Carte de douze thés.');
    expect((await fmt('executive')).body).toMatchObject({ content: 'Synthèse 1', cached: true });
    expect((await fmt('pv')).body.content).toBe('Synthèse 2');
    await h.db('Session').where({ id: sid }).update({ summary: '## Décisions\n- Carte de dix thés.' });
    expect((await fmt('executive')).body).toMatchObject({ content: 'Synthèse 3', cached: false });
    expect((await fmt('autre')).status).toBe(400);
  });

  it('zone d’interrogation : registre, comptes rendus datés et posture transmis, sources demandées', async () => {
    await h.db('Decision').insert({ id: crypto.randomUUID(), projectId: pid, statement: 'Le prix du thé est fixé à 4,50 €.', status: 'active', origin: 'human' });
    h.ai.responder = () => ({ text: 'Le prix est de 4,50 € (registre des décisions).' });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/quick-command`, { token: owner.token, body: { input: 'Qu’avait-on décidé sur le prix ?' } });
    expect(r.status).toBe(200);
    const sys = sysText(h.ai.calls[calls]);
    expect(sys).toContain('Le prix du thé est fixé à 4,50 €.');
    expect(sys).toContain('### Réunion « Choisir la carte »');
    expect(sys).toContain('Carte de dix thés.');
    expect(sys).toContain('SOURCES :');
    expect(sys).toContain('POSTURE');
  });
});
