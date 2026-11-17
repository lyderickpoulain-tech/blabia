import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// v6 phase 2 : la réunion améliore l'ouvrage. Revue lancée en un clic, ouverte sur l'avis du
// porteur ; tour de table des assistants ; conclusion → proposition de version suivante,
// acceptée, corrigée ou refusée ; retouche sans réunion ; retouche par le bras droit. IA simulée.
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
- + « jouer en famille » :: Le principe
</idees>
<fini_quand>
- les règles tiennent sur une page
</fini_quand>`;

const after = (summary, material, extraIdea = '') => `<nom>Volcans en famille</nom>
<gabarit>jeu</gabarit>
<resume>${summary}</resume>
<ouvrage>
## Le principe
Les joueurs fuient la lave qui descend du volcan, en famille.

## Le matériel
${material}
</ouvrage>
<suppositions>
- Nombre de joueurs :: 2 à 4
- Durée d'une partie :: 30 minutes
</suppositions>
<idees>
- I1 :: Le principe
- I2 :: Le principe
${extraIdea}
</idees>
<fini_quand>
- les règles tiennent sur une page
</fini_quand>`;

describe.skipIf(!harness.enabled)('v6 phase 2 : la réunion améliore le projet', () => {
  let h, owner, outsider, pid, sid;
  let builderReply = FIRST;
  let failNext = false;
  let agentDelay = 0;
  let assistantReply = 'Bien noté.';
  const get = (path, token = owner.token) => h.request('GET', path, { token });
  const post = (path, body = {}, token = owner.token) => h.request('POST', path, { token, body });
  const getWork = () => get(`/api/projects/${pid}/work`).then(r => r.body);
  const turnOf = params => (Array.isArray(params.system) ? params.system.at(-1).text : '');

  async function waitBuilt() {
    for (let i = 0; i < 200; i++) {
      const w = await getWork();
      if (w.build?.status !== 'building') return w;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('écriture trop longue');
  }
  async function waitRound() {
    for (let i = 0; i < 200; i++) {
      const s = (await get(`/api/projects/${pid}/sessions/${sid}/review`)).body;
      if (!s.speaking) return s;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('tour de table trop long');
  }

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    for (const [i, name] of ['Analyste', 'Créatif', 'Critique', 'Expert', 'Rédacteur'].entries()) {
      await h.db('Agent').insert({ id: crypto.randomUUID(), name, role: `Rôle ${name}`, systemPrompt: `Tu es ${name}.`, isDefault: true, createdAt: new Date(Date.now() + i) });
    }
    owner = await h.createUser('member', 'porteur-revue@test.local');
    outsider = await h.createUser('member', 'autre-revue@test.local');
    h.ai.responder = async params => {
      if (failNext && params.tools) { failNext = false; throw Object.assign(new Error('overloaded'), { status: 529 }); }
      if (params.tools) return { text: builderReply }; // le constructeur (recherche web permise)
      const turn = turnOf(params);
      const m = turn.match(/Tu es ([^.]+)\./);
      if (/C'EST TON TOUR/.test(turn)) {
        if (agentDelay) await new Promise(r => setTimeout(r, agentDelay));
        return { text: `${m[1]} propose : un dé en bois dans « Le matériel ».` };
      }
      return { text: assistantReply };
    };
    pid = (await post('/api/projects/from-story', { story: 'Créons un jeu de société sur le thème des volcans, pour jouer en famille.' })).body.id;
    expect((await waitBuilt()).current.number).toBe(1);
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('« Demander l’avis de l’équipe » : la réunion s’ouvre sur l’avis du porteur ; BlabIA choisit les assistants', async () => {
    await post(`/api/projects/${pid}/work/comments`, { section: 'Le matériel', content: 'Des cartes plus grandes.' });
    const calls = h.ai.calls.length;
    const r = await post(`/api/projects/${pid}/work/review`);
    expect(r.status).toBe(201);
    sid = r.body.sessionId;
    expect(h.ai.calls.length).toBe(calls); // ouvrir la réunion ne coûte rien
    const s = (await get(`/api/projects/${pid}/sessions/${sid}/review`)).body;
    expect(s.status).toBe('open');
    expect(s.reviewOfVersion).toBe(1);
    expect(s.agents.map(a => a.name)).toEqual(['Créatif', 'Critique', 'Expert']); // regard d'un jeu
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].content).toMatch(/qu’en pensez-vous|qu'en pensez-vous/i);
    expect(s.messages[0].content).toContain('Des cartes plus grandes'); // ses remarques à l'ordre du jour
    // Un second clic rejoint la même réunion ; « Mon projet » la signale
    expect((await post(`/api/projects/${pid}/work/review`)).body.sessionId).toBe(sid);
    expect((await getWork()).openReview.id).toBe(sid);
    // Ni le moteur v5.1, ni une autre personne
    expect((await post(`/api/projects/${pid}/sessions/${sid}/chat`, { message: 'Bonjour' })).status).toBe(400);
    expect((await get(`/api/projects/${pid}/sessions/${sid}/review`, outsider.token)).status).toBe(404);
  });

  it('le porteur parle librement ; chaque assistant répond une fois, celui qu’il nomme d’abord', async () => {
    const calls = h.ai.calls.length;
    agentDelay = 300; // marge : la seconde demande doit arriver pendant que l'équipe parle
    expect((await post(`/api/projects/${pid}/sessions/${sid}/review/message`, { text: 'Je voudrais un dé en forme de volcan. Qu’en pense Expert ?' })).status).toBe(202);
    expect((await post(`/api/projects/${pid}/sessions/${sid}/review/message`, { text: 'Et aussi…' })).status).toBe(409); // l'équipe parle encore
    const s = await waitRound();
    agentDelay = 0;
    const said = s.messages.filter(m => m.role !== 'system');
    expect(said.map(m => m.agentName || 'porteur')).toEqual(['porteur', 'Expert', 'Créatif', 'Critique']);
    const agentCalls = h.ai.calls.slice(calls);
    expect(agentCalls).toHaveLength(3);
    const first = agentCalls[0];
    expect(first.tools).toBeUndefined(); // pas de recherche web
    expect(first.system[0].text).toContain('Les joueurs fuient la lave'); // la version en cours…
    expect(first.system[0].cache_control).toEqual({ type: 'ephemeral' }); // …dans le bloc commun en cache
    expect(first.system[0].text).toMatch(/PAS DE QUESTION/);
    expect(first.system[0].text).toContain('« thème des volcans »');
    expect(first.system.map(b => b.text).join('\n')).toContain('Le porteur : Je voudrais un dé en forme de volcan');
    expect(first.system.at(-1).text).toMatch(/Tu es Expert/);
    // Le bloc commun est identique d'un assistant à l'autre (cache)
    expect(agentCalls[1].system[0].text).toBe(first.system[0].text);
  });

  it('il peut aussi écouter l’équipe sans rien écrire', async () => {
    expect((await post(`/api/projects/${pid}/sessions/${sid}/review/message`, { text: '' })).status).toBe(202);
    const s = await waitRound();
    expect(s.messages.filter(m => m.role === 'agent')).toHaveLength(6);
  });

  it('il termine : la version suivante s’écrit avec la réunion, et lui est PROPOSÉE', async () => {
    builderReply = after('Le matériel gagne un dé en forme de volcan et des cartes plus grandes.', '- 40 grandes cartes chemin\n- 1 dé en forme de volcan', '- + « un dé en forme de volcan » :: Le matériel');
    expect((await post(`/api/projects/${pid}/sessions/${sid}/review/conclude`)).status).toBe(202);
    const w = await waitBuilt();
    const prompt = h.ai.calls.at(-1).messages[0].content;
    expect(prompt).toContain('CE QUI S\'EST DIT EN RÉUNION');
    expect(prompt).toContain('Porteur : Je voudrais un dé en forme de volcan');
    expect(prompt).toContain('Critique : Critique propose');
    expect(prompt).toContain('Des cartes plus grandes'); // ses remarques aussi
    expect(w.current.number).toBe(1); // rien n'est appliqué
    expect(w.proposal).toMatchObject({ origin: 'review', number: 2, sessionId: sid });
    expect(w.openReview).toBeNull();
    const s = (await get(`/api/projects/${pid}/sessions/${sid}/review`)).body;
    expect(s.status).toBe('accepted');
    expect(s.summary).toMatch(/^Ce qui change/);
    expect((await post(`/api/projects/${pid}/sessions/${sid}/review/message`, { text: 'encore' })).status).toBe(409);
    expect((await post(`/api/projects/${pid}/work/review`)).status).toBe(409); // une proposition attend sa réponse
  });

  it('il corrige : la proposition est réécrite à partir d’elle-même, avec la réunion', async () => {
    const before = (await getWork()).proposal;
    builderReply = after('Le dé est en carton, comme demandé.', '- 40 grandes cartes chemin\n- 1 dé en carton en forme de volcan', '- + « un dé en forme de volcan » :: Le matériel');
    expect((await post(`/api/projects/${pid}/work/proposals/${before.id}/correct`, { text: 'Le dé en carton, pas en bois.' })).status).toBe(200);
    const w = await waitBuilt();
    const prompt = h.ai.calls.at(-1).messages[0].content;
    expect(prompt).toContain('TEXTE DE DÉPART');
    expect(prompt).toContain('1 dé en forme de volcan'); // la proposition corrigée
    expect(prompt).toContain('Le dé en carton, pas en bois.');
    expect(prompt).toContain('Porteur : Je voudrais un dé'); // toujours la même réunion
    expect(w.proposal.id).not.toBe(before.id);
    expect(w.proposal).toMatchObject({ origin: 'review', sessionId: sid });
    expect((await h.db('WorkProposal').where({ id: before.id }).first()).status).toBe('corrected');
  });

  it('il accepte : la version 2 existe, ses idées de réunion sont suivies, ses remarques prises en compte', async () => {
    const p = (await getWork()).proposal;
    const w = (await post(`/api/projects/${pid}/work/proposals/${p.id}/accept`)).body;
    expect(w.current.number).toBe(2);
    expect(w.current.content).toContain('dé en carton');
    expect(w.proposal).toBeNull();
    const idea = w.ideas.find(i => i.text === 'un dé en forme de volcan');
    expect(idea).toMatchObject({ source: 'reunion' });
    expect(idea.presence).toMatchObject({ present: true, where: 'Le matériel' });
    expect(w.comments.every(c => c.status === 'addressed' && c.addressedInVersion === 2)).toBe(true);
    expect(w.pending).toEqual({ assumptions: 0, comments: 0 });
    expect((await get(`/api/projects/${pid}/sessions/${sid}/review`)).body.summary).toMatch(/^Version 2 acceptée/);
    expect((await post(`/api/projects/${pid}/work/proposals/${p.id}/accept`)).status).toBe(409);
  });

  it('retouche sans réunion, refusée : rien ne change, sa demande reste en attente', async () => {
    builderReply = after('Les cartes passent à 60.', '- 60 cartes chemin\n- 1 dé en carton en forme de volcan');
    expect((await post(`/api/projects/${pid}/work/retouch`, { text: '' })).status).toBe(400);
    expect((await post(`/api/projects/${pid}/work/retouch`, { text: 'Passe à 60 cartes.' })).status).toBe(202);
    let w = await waitBuilt();
    expect(w.proposal).toMatchObject({ origin: 'retouch', number: 3 });
    expect(h.ai.calls.at(-1).messages[0].content).toContain('Passe à 60 cartes.');
    w = (await post(`/api/projects/${pid}/work/proposals/${w.proposal.id}/refuse`)).body;
    expect(w.current.number).toBe(2);
    expect(w.proposal).toBeNull();
    expect(w.pending.comments).toBe(1);
  });

  it('une supposition changée APRÈS l’écriture de la proposition n’est pas comptée comme appliquée', async () => {
    let w = await getWork();
    const players = w.assumptions.find(a => a.statement === 'Nombre de joueurs');
    const length = w.assumptions.find(a => a.statement === 'Durée d\'une partie');
    await h.request('PATCH', `/api/projects/${pid}/work/assumptions/${players.id}`, { token: owner.token, body: { value: '2 à 6' } });
    expect((await post(`/api/projects/${pid}/work/next`)).status).toBe(202);
    w = await waitBuilt();
    await new Promise(r => setTimeout(r, 20));
    await h.request('PATCH', `/api/projects/${pid}/work/assumptions/${length.id}`, { token: owner.token, body: { value: '1 heure' } });
    w = (await post(`/api/projects/${pid}/work/proposals/${w.proposal.id}/accept`)).body;
    expect(w.current.number).toBe(3);
    expect(w.assumptions.find(a => a.id === players.id)).toMatchObject({ value: '2 à 6', state: 'applied' });
    expect(w.assumptions.find(a => a.id === length.id)).toMatchObject({ value: '1 heure', state: 'changed' });
    expect(w.pending.assumptions).toBe(1);
  });

  it('panne pendant l’écriture d’une proposition : « Réessayer » refait la même', async () => {
    failNext = true;
    builderReply = after('La durée passe à une heure.', '- 60 cartes chemin');
    expect((await post(`/api/projects/${pid}/work/retouch`, { text: 'Des parties d’une heure.' })).status).toBe(202);
    let w = await waitBuilt();
    expect(w.build.status).toBe('failed');
    expect(w.proposal).toBeNull();
    expect((await post(`/api/projects/${pid}/work/retry`)).status).toBe(202);
    w = await waitBuilt();
    expect(w.proposal).toMatchObject({ origin: 'retouch' });
    expect((await post(`/api/projects/${pid}/work/retry`)).status).toBe(409); // plus rien à reprendre
    await post(`/api/projects/${pid}/work/proposals/${w.proposal.id}/refuse`);
  });

  it('le bras droit connaît le projet et fait la retouche demandée, confirmée d’un clic', async () => {
    assistantReply = 'Je passe le plateau à 50 cases. [RETOUCHE: un plateau de 50 cases]';
    const r = await post(`/api/projects/${pid}/assistant`, { message: 'Il faudrait un plateau de 50 cases.' });
    expect(r.status).toBe(200);
    const sys = h.ai.calls.at(-1).system.map(b => b.text).join('\n');
    expect(sys).toContain('LE PROJET LUI-MÊME (version 3');
    expect(sys).toContain('[RETOUCHE:');
    expect(r.body.reply.content).not.toContain('[RETOUCHE');
    expect(r.body.reply.proposal).toMatchObject({ kind: 'retouch', status: 'pending', text: 'un plateau de 50 cases' });
    builderReply = after('Le plateau a 50 cases.', '- 60 cartes chemin\n- un plateau de 50 cases');
    const done = await post(`/api/projects/${pid}/assistant/${r.body.reply.id}/retouch`);
    expect(done.status).toBe(200);
    expect(done.body.message.proposal.status).toBe('started');
    const w = await waitBuilt();
    expect(w.proposal).toMatchObject({ origin: 'retouch' });
    expect(h.ai.calls.at(-1).messages[0].content).toContain('un plateau de 50 cases');
    expect((await post(`/api/projects/${pid}/assistant/${r.body.reply.id}/retouch`)).status).toBe(404); // déjà faite
  });

  it('un dossier de site est relu par le Rédacteur, le Juriste et Sécurité, même ajouté après la création du projet', async () => {
    await h.db('Agent').insert({ id: crypto.randomUUID(), name: 'Juriste', role: 'Ce qui est obligatoire', systemPrompt: 'Tu es Juriste.', isDefault: true, createdAt: new Date() });
    await h.db('Agent').insert({ id: crypto.randomUUID(), name: 'Sécurité', role: 'Protège le projet', systemPrompt: 'Tu es Sécurité.', isDefault: true, createdAt: new Date() });
    builderReply = FIRST.replace('<gabarit>jeu</gabarit>', '<gabarit>site</gabarit>');
    const siteId = (await post('/api/projects/from-story', { story: 'Un site pour partager mes disques préférés et les concerts de Rennes.' })).body.id;
    for (let i = 0; i < 100; i++) { if ((await get(`/api/projects/${siteId}/work`)).body.current) break; await new Promise(r => setTimeout(r, 50)); }
    const r = await post(`/api/projects/${siteId}/work/review`);
    const s = (await get(`/api/projects/${siteId}/sessions/${r.body.sessionId}/review`)).body;
    expect(s.agents.map(a => a.name)).toEqual(['Rédacteur', 'Juriste', 'Sécurité']);
  });
});
