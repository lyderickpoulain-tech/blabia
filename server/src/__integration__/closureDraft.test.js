import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Conclusion préparée mais pas validée : conservée sur la réunion (fermer la fenêtre pour
// vérifier un outil ne la perd plus), avec les modifications de l'humain ; régénération
// conseillée si la réunion a continué ; effacée à la clôture.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));

describe.skipIf(!harness.enabled)('conclusion préparée conservée', () => {
  let h, owner, pid, sid;
  const url = () => `/api/projects/${pid}/sessions/${sid}/closure-draft`;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'brouillon@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Brouillon' } })).body.id;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
      body: { task: 'Choisir l’hébergeur', intention: ['decision'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'R', systemPrompt: '' }] } })).body.session.id;
    await h.db('Session').where({ id: sid }).update({ messages: JSON.stringify([
      { id: 'm1', role: 'human', content: 'On part sur Railway.', timestamp: new Date().toISOString() },
    ]) });
    h.ai.responder = p => (sysText(p).includes('Tu extrais')
      ? { text: JSON.stringify({ decisions: [{ statement: 'Héberger le site sur Railway', origin: 'human' }], actions: [{ title: 'Créer le compte Railway' }] }) }
      : { text: '## Compte-rendu\n- Railway retenu' });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('avant toute génération : aucun brouillon', async () => {
    expect((await h.request('GET', url(), { token: owner.token })).body).toEqual({ draft: null, changedSince: 0 });
    expect((await h.request('PUT', url(), { token: owner.token, body: { edits: {} } })).status).toBe(409);
  });

  it('génération conservée, puis modifications de l’humain reprises telles quelles', async () => {
    const gen = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/generate-deliverable`, { token: owner.token, body: {} });
    expect(gen.status).toBe(200);
    let r = (await h.request('GET', url(), { token: owner.token })).body;
    expect(r.changedSince).toBe(0);
    expect(r.draft.data.decisionProposals[0].statement).toBe('Héberger le site sur Railway');
    expect(r.draft.edits).toBeNull();

    const edits = { ...r.draft.data, decisionProposals: [{ statement: 'Héberger le site sur Railway (offre Hobby)', key: 0, keep: true }], actionProposals: [{ title: 'Créer le compte Railway', key: 0, keep: false }] };
    expect((await h.request('PUT', url(), { token: owner.token, body: { edits } })).status).toBe(200);
    r = (await h.request('GET', url(), { token: owner.token })).body;
    expect(r.draft.edits.decisionProposals[0].statement).toBe('Héberger le site sur Railway (offre Hobby)');
    expect(r.draft.edits.actionProposals[0].keep).toBe(false);
  });

  it('la réunion continue : régénération conseillée ; régénérer repart des propositions de BlabIA', async () => {
    const [s] = await h.db('Session').where({ id: sid }).select('messages');
    await h.db('Session').where({ id: sid }).update({ messages: JSON.stringify([...(typeof s.messages === 'string' ? JSON.parse(s.messages) : s.messages),
      { id: 'm2', role: 'human', content: 'Finalement Vercel ?', timestamp: new Date().toISOString() }]) });
    expect((await h.request('GET', url(), { token: owner.token })).body.changedSince).toBe(1);
    await h.request('POST', `/api/projects/${pid}/sessions/${sid}/generate-deliverable`, { token: owner.token, body: {} });
    const r = (await h.request('GET', url(), { token: owner.token })).body;
    expect(r).toMatchObject({ changedSince: 0, draft: { edits: null } });
  });

  it('réunion conclue : brouillon effacé', async () => {
    expect((await h.request('PATCH', `/api/projects/${pid}/sessions/${sid}/status`, { token: owner.token, body: { status: 'accepted' } })).status).toBe(200);
    expect((await h.db('Session').where({ id: sid }).first()).closureDraft).toBeNull();
    expect((await h.request('GET', url(), { token: owner.token })).body.draft).toBeNull();
  });
});
