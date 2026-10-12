import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Une réunion peut préciser une action déjà suivie, l'annuler si elle devient inutile, ou
// la cocher si elle est faite : proposé à la conclusion, appliqué seulement si l'humain l'accepte.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));

describe.skipIf(!harness.enabled)('actions revues par une réunion', () => {
  let h, owner, pid, sid, extractionPrompt;
  const ids = {};
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'actions-revues@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Numérologie' } })).body.id;
    for (const [k, title, description, order] of [['methode', 'Rédiger la page Méthode', null, 0], ['avocat', 'Contacter un avocat', 'Démo célébrités', 1], ['logo', 'Faire dessiner le logo', null, 2]]) {
      ids[k] = crypto.randomUUID();
      await h.db('TodoItem').insert({ id: ids[k], projectId: pid, title, description, status: 'todo', displayOrder: order });
    }
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token,
      body: { task: 'Contenu du site', intention: ['decision'], activeAgents: [{ id: 'a1', name: 'Léa', role: 'R', systemPrompt: '' }] } })).body.session.id;
    await h.db('Session').where({ id: sid }).update({ messages: JSON.stringify([
      { id: 'm1', role: 'human', content: 'On abandonne la démo célébrités, et le logo est déjà fait.', timestamp: new Date().toISOString() },
      { id: 'm2', role: 'agent', agentName: 'Léa', content: 'A1 : il s’agit plutôt d’une page de 600 mots au ton pédagogique.', timestamp: new Date().toISOString() },
    ]) });
    h.ai.responder = p => {
      if (sysText(p).includes('Tu extrais')) {
        extractionPrompt = p.messages[0].content;
        return { text: JSON.stringify({ decisions: [], actions: [], actionChanges: [
          { ref: 'A1', kind: 'update', title: '', detail: 'Page de 600 mots, ton pédagogique', reason: 'Précisé par Léa' },
          { ref: 'A2', kind: 'cancel', reason: 'Démo célébrités abandonnée' },
          { ref: 'A3', kind: 'done', reason: 'Logo déjà fait' },
        ] }) };
      }
      return { text: '## Compte-rendu' };
    };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('conclusion : changements proposés sur les actions suivies (repères et précisions transmis)', async () => {
    const gen = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/generate-deliverable`, { token: owner.token, body: {} });
    expect(gen.status).toBe(200);
    expect(extractionPrompt).toContain('A2. [à faire] Contacter un avocat — Démo célébrités');
    expect(extractionPrompt).toContain('"actionChanges"');
    expect(gen.body.actionChanges.map(c => [c.id, c.kind])).toEqual([[ids.methode, 'update'], [ids.avocat, 'cancel'], [ids.logo, 'done']]);
    expect(gen.body.actionChanges[0]).toMatchObject({ title: 'Rédiger la page Méthode', description: 'Page de 600 mots, ton pédagogique' });
    // Rien n'est appliqué avant l'accord de l'humain
    expect((await h.db('TodoItem').where({ id: ids.avocat }).first()).status).toBe('todo');
  });

  it('acceptés : précisée, annulée (récupérable sur la page Actions, hors des agents), cochée', async () => {
    const patch = (id, body) => h.request('PATCH', `/api/projects/${pid}/todos/${id}`, { token: owner.token, body });
    await patch(ids.methode, { title: 'Rédiger la page Méthode', description: 'Page de 600 mots, ton pédagogique' });
    await patch(ids.avocat, { status: 'cancelled' });
    await patch(ids.logo, { status: 'done' });
    const list = (await h.request('GET', `/api/projects/${pid}/actions`, { token: owner.token })).body;
    expect(list.map(a => a.title)).toEqual(['Rédiger la page Méthode', 'Faire dessiner le logo']); // annulée absente
    const all = (await h.request('GET', `/api/projects/${pid}/actions?withCancelled=1`, { token: owner.token })).body;
    expect(all.find(a => a.id === ids.avocat).status).toBe('cancelled');
    const { formatActionsForPrompt, listActions } = require('../services/actions');
    const text = formatActionsForPrompt(await listActions(pid));
    expect(text).toContain('A1. [à faire] Rédiger la page Méthode — Page de 600 mots, ton pédagogique');
    expect(text).not.toContain('avocat');
  });
});
