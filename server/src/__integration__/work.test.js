import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// v6 « l'ouvrage d'abord » : création en une question, première version sans question,
// suppositions modifiables, commentaires, version suivante, projet existant. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const FIRST = `<nom>Volcans en famille</nom>
<gabarit>jeu</gabarit>
<resume>Première version complète du jeu.</resume>
<ouvrage>
## Le principe
Les joueurs fuient la lave qui descend du volcan, en famille.

## Le matériel
- 40 cartes chemin (à vérifier)
</ouvrage>
<suppositions>
- Nombre de joueurs :: 2 à 4
- Durée d'une partie :: 30 minutes
</suppositions>
<idees>
- + « thème des volcans » :: Le principe
- + « jouer en famille » :: pas encore — à préciser
</idees>
<fini_quand>
- les règles tiennent sur une page
- une partie dure moins de 45 minutes
</fini_quand>`;

const NEXT = `<nom>Volcans en famille</nom>
<gabarit>jeu</gabarit>
<resume>Le jeu passe à 6 joueurs ; le matériel est plus court.</resume>
<ouvrage>
## Le principe
Les joueurs fuient la lave, de 2 à 6.

## Le matériel
- 30 cartes chemin
</ouvrage>
<suppositions>
- Nombre de joueurs :: 2 à 5
- Durée d'une partie :: 30 minutes
- Âge minimum :: 7 ans
</suppositions>
<idees>
- I1 :: Le principe
- I2 :: Le principe
- + « des cartes plus grandes » :: Le matériel
</idees>
<fini_quand>
- les règles tiennent sur une page
</fini_quand>`;

describe.skipIf(!harness.enabled)('v6 : l’ouvrage du projet', () => {
  let h, owner, outsider, pid;
  let reply = FIRST;
  let failNext = false;
  const getWork = id => h.request('GET', `/api/projects/${id}/work`, { token: owner.token });
  async function waitBuilt(id) {
    for (let i = 0; i < 100; i++) {
      const w = (await getWork(id)).body;
      if (w.build?.status !== 'building') return w;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('construction trop longue');
  }

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'porteur-v6@test.local');
    outsider = await h.createUser('member', 'autre-v6@test.local');
    h.ai.responder = () => {
      if (failNext) { failNext = false; throw Object.assign(new Error('overloaded'), { status: 529 }); }
      return { text: reply };
    };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('création en une question : la première version s’écrit aussitôt, sans question', async () => {
    expect((await h.request('POST', '/api/projects/from-story', { token: owner.token, body: { story: 'Un jeu' } })).status).toBe(400);
    const calls = h.ai.calls.length;
    const r = await h.request('POST', '/api/projects/from-story', { token: owner.token, body: { story: 'Créons un jeu de société sur le thème des volcans, pour jouer en famille.' } });
    expect(r.status).toBe(201);
    pid = r.body.id;
    const w = await waitBuilt(pid);
    expect(h.ai.calls.length - calls).toBe(1); // un seul appel : aucune question avant
    const call = h.ai.calls.at(-1);
    expect(call.system).toMatch(/LIVRE COMPLET/);
    expect(call.messages[0].content).toContain('thème des volcans');
    expect(call.tools?.[0]?.name).toBe('web_search');

    expect(w.current.number).toBe(1);
    expect(w.current.content).toContain('## Le principe');
    expect(w.template).toBe('jeu');
    expect(w.assumptions.map(a => [a.statement, a.value, a.state])).toEqual([['Nombre de joueurs', '2 à 4', 'assumed'], ['Durée d\'une partie', '30 minutes', 'assumed']]);
    expect(w.ideas.map(i => [i.text, i.presence.present])).toEqual([['thème des volcans', true], ['jouer en famille', false]]);
    expect(w.criteria.map(c => c.text)).toEqual(['les règles tiennent sur une page', 'une partie dure moins de 45 minutes']);

    const project = (await h.request('GET', `/api/projects/${pid}`, { token: owner.token })).body;
    expect(project.name).toBe('Volcans en famille');
    expect(project.hasTechnicalStack).toBeFalsy();
    // Coût journalisé sur le projet
    await new Promise(r => setTimeout(r, 200));
    const log = await h.db('UsageLog').where({ projectId: pid }).first();
    expect(log.kind).toBe('work/build');
  });

  it('une seule première version ; personne d’autre n’y touche', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/work/first`, { token: owner.token, body: {} })).status).toBe(409);
    expect((await h.request('GET', `/api/projects/${pid}/work`, { token: outsider.token })).status).toBe(404);
    expect((await h.request('POST', `/api/projects/${pid}/work/next`, { token: owner.token })).status).toBe(400); // rien à changer
  });

  it('supposition changée et commentaire → version suivante qui les applique', async () => {
    let w = (await getWork(pid)).body;
    const players = w.assumptions.find(a => a.statement === 'Nombre de joueurs');
    w = (await h.request('PATCH', `/api/projects/${pid}/work/assumptions/${players.id}`, { token: owner.token, body: { value: '2 à 6' } })).body;
    expect(w.pending.assumptions).toBe(1);
    w = (await h.request('POST', `/api/projects/${pid}/work/comments`, { token: owner.token, body: { section: 'Le matériel', content: 'Moins de cartes, et des cartes plus grandes.' } })).body;
    expect(w.pending.comments).toBe(1);

    reply = NEXT;
    expect((await h.request('POST', `/api/projects/${pid}/work/next`, { token: owner.token })).status).toBe(202);
    w = await waitBuilt(pid);
    const prompt = h.ai.calls.at(-1).messages[0].content;
    expect(prompt).toMatch(/Nombre de joueurs :: 2 à 6 .*CHANGÉ PAR LE PORTEUR/);
    expect(prompt).toContain('Moins de cartes');
    expect(prompt).toContain('I1 « thème des volcans »');

    // Phase 2 : une proposition, rien n'est appliqué avant la réponse du porteur
    expect(w.current.number).toBe(1);
    expect(w.proposal).toMatchObject({ number: 2, origin: 'changes', baseVersion: 1 });
    expect(w.proposal.changeSummary).toMatch(/6 joueurs/);
    expect(w.pending.comments).toBe(1);
    expect((await h.request('POST', `/api/projects/${pid}/work/next`, { token: owner.token })).status).toBe(409); // une proposition attend
    w = (await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/accept`, { token: owner.token })).body;
    expect(w.proposal).toBeNull();

    expect(w.current.number).toBe(2);
    expect(w.current.changeSummary).toMatch(/6 joueurs/);
    expect(w.versions.map(v => v.number)).toEqual([2, 1]);
    // La valeur du porteur fait foi, même si la réponse en donne une autre
    expect(w.assumptions.find(a => a.statement === 'Nombre de joueurs')).toMatchObject({ value: '2 à 6', state: 'applied' });
    expect(w.assumptions.map(a => a.statement)).toContain('Âge minimum');
    expect(w.comments[0]).toMatchObject({ status: 'addressed', addressedInVersion: 2 });
    expect(w.pending).toEqual({ assumptions: 0, comments: 0 });
    expect(w.ideas.map(i => [i.text, i.presence?.present])).toEqual([['thème des volcans', true], ['jouer en famille', true], ['des cartes plus grandes', true]]);
    const v1 = (await h.request('GET', `/api/projects/${pid}/work/versions/1`, { token: owner.token })).body;
    expect(v1.content).toContain('40 cartes');
  });

  it('« Ce sera fini quand… » corrigé par le porteur ; idée mise de côté par lui seul', async () => {
    let w = (await h.request('PUT', `/api/projects/${pid}/work/criteria`, { token: owner.token, body: { criteria: ['les règles tiennent sur une page', 'il y a un plateau imprimable', ''] } })).body;
    expect(w.criteria.map(c => c.text)).toEqual(['les règles tiennent sur une page', 'il y a un plateau imprimable']);
    const idea = w.ideas[2];
    w = (await h.request('PATCH', `/api/projects/${pid}/work/ideas/${idea.id}`, { token: owner.token, body: { state: 'set_aside' } })).body;
    expect(w.ideas[2].state).toBe('set_aside');
  });

  it('panne pendant l’écriture : état « échec » lisible, puis nouvel essai', async () => {
    failNext = true;
    reply = FIRST;
    const r = await h.request('POST', '/api/projects/from-story', { token: owner.token, body: { story: 'Organiser la fête de fin d’année du club de foot, 60 personnes.' } });
    let w = await waitBuilt(r.body.id);
    expect(w.build.status).toBe('failed');
    expect(w.build.error).toMatch(/réessayer/);
    expect(w.current).toBeNull();
    expect((await h.request('POST', `/api/projects/${r.body.id}/work/retry`, { token: owner.token })).status).toBe(202);
    w = await waitBuilt(r.body.id);
    expect(w.current.number).toBe(1);
  });

  it('projet existant : première version à partir de l’historique (décisions, comptes rendus)', async () => {
    const p = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Noël du CSE', objectif: '5 jeux pour chacune des 5 tranches d’âge' } })).body;
    await h.db('Decision').insert({ id: crypto.randomUUID(), projectId: p.id, statement: 'Budget de 40 € par enfant', status: 'active', origin: 'human' });
    await h.db('Session').insert({ id: crypto.randomUUID(), projectId: p.id, task: 'Choix des jeux', summary: 'Dixit retenu pour les 8-10 ans.', status: 'accepted', mode: 'meeting', createdAt: new Date() });
    expect((await getWork(p.id)).body.exists).toBe(false);
    expect((await h.request('POST', `/api/projects/${p.id}/work/first`, { token: owner.token, body: {} })).status).toBe(202);
    const w = await waitBuilt(p.id);
    const prompt = h.ai.calls.at(-1).messages[0].content;
    expect(prompt).toContain('5 jeux pour chacune des 5 tranches');
    expect(prompt).toContain('Budget de 40 € par enfant');
    expect(prompt).toContain('Dixit retenu');
    expect(w.current.number).toBe(1);
    expect(w.ideas[0].source).toBe('historique');
    expect((await h.request('GET', `/api/projects/${p.id}`, { token: owner.token })).body.name).toBe('Noël du CSE'); // nom choisi : gardé
  });

  it('mode avancé : réglé par personne', async () => {
    expect((await h.request('GET', '/api/auth/me', { token: owner.token })).body.advancedMode).toBe(false);
    expect((await h.request('PATCH', '/api/users/me/advanced-mode', { token: owner.token, body: { enabled: true } })).body.advancedMode).toBe(true);
    expect((await h.request('GET', '/api/auth/me', { token: owner.token })).body.advancedMode).toBe(true);
    expect((await h.request('PATCH', '/api/users/me/advanced-mode', { token: owner.token, body: { enabled: 'oui' } })).status).toBe(400);
  });
});
