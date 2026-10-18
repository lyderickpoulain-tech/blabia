import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// F4 (personas) : plans types hors technique, mode express, plan web sans pack (« j'ai mes outils »),
// livrables à la conclusion. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('plans types et livrables', () => {
  let h, owner, member;
  const project = async (name, body = {}) => (await h.request('POST', '/api/projects', { token: owner.token, body: { name, objectif: `${name} : objectif.`, ...body } })).body.id;
  const plan = async pid => (await h.db('Milestone').where({ projectId: pid }).orderBy('displayOrder')).map(m => m.title);
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'plans@test.local');
    member = await h.createUser('member', 'plans-membre@test.local');
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('événement : quatre réunions, chacune annonce son livrable ; une seule fois ; propriétaire seulement', async () => {
    const pid = await project('Noël CSE');
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: member.id, role: 'collaborator' });
    expect((await h.request('POST', `/api/projects/${pid}/plan/template`, { token: member.token, body: { kind: 'event' } })).status).toBe(403);
    const r = await h.request('POST', `/api/projects/${pid}/plan/template`, { token: owner.token, body: { kind: 'event' } });
    expect(r.body.created).toHaveLength(4);
    expect((await h.db('Milestone').where({ projectId: pid })).filter(m => /Livrable/.test(m.description))).toHaveLength(4);
    expect((await h.request('POST', `/api/projects/${pid}/plan/template`, { token: owner.token, body: { kind: 'event' } })).body.created).toHaveLength(0);
  });

  it('mode express : une seule réunion de cadrage ; genre inconnu : rien', async () => {
    const pid = await project('Déménagement du bureau');
    await h.request('POST', `/api/projects/${pid}/plan/template`, { token: owner.token, body: { express: true } });
    expect(await plan(pid)).toEqual(['Cadrage express : objectif, plan d’action et tâches']);
    const other = await project('Autre');
    expect((await h.request('POST', `/api/projects/${other}/plan/template`, { token: owner.token, body: { kind: 'other' } })).body.created).toEqual([]);
  });

  it('site avec ses propres outils : plan web sans le pack BlabIA', async () => {
    const pid = await project('Mon site', { hasTechnicalStack: true });
    const r = await h.request('POST', `/api/projects/${pid}/plan/website`, { token: owner.token, body: { pack: false } });
    expect(r.body.pack).toEqual([]);
    expect(r.body.created.length).toBeGreaterThan(0);
    const pid2 = await project('Site avec pack', { hasTechnicalStack: true });
    expect((await h.request('POST', `/api/projects/${pid2}/plan/website`, { token: owner.token })).body.pack).toEqual(['Railway', 'GitHub', 'Claude Code']);
  });

  it('livrables à la conclusion : tirés du compte rendu, sans rien inventer', async () => {
    const pid = await project('Fête de quartier');
    const sid = crypto.randomUUID();
    await h.db('Session').insert({ id: sid, projectId: pid, task: 'Cadrer la fête', status: 'accepted', mode: 'meeting', createdAt: new Date(), messages: '[]', summary: '## Décisions\n- Budget 800 € : buvette 300 €, musique 500 €.' });
    h.ai.responder = () => ({ text: '| Poste | Montant | Statut |\n|---|---|---|\n| Buvette | 300 € | décidé |' });
    for (const format of ['checklist', 'retroplanning', 'budget', 'messages']) {
      const calls = h.ai.calls.length;
      const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/summary-format`, { token: owner.token, body: { format } });
      expect(r.status).toBe(200);
      expect(h.ai.calls[calls].messages[0].content).toContain('N\'invente aucun chiffre');
    }
  });
});
