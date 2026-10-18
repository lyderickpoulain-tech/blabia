import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// Bras droit (v5.1, 16/10/2026, étape 1) : conversation en tête-à-tête, par projet et par
// personne ; connaissance du projet en cache ; sources et réunion proposée ; IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('bras droit', () => {
  let h, owner, member, pid, r1, r2;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'brasdroit@test.local');
    member = await h.createUser('member', 'membre@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Noël CSE' } })).body.id;
    await h.db('Project').where({ id: pid }).update({ brief: 'OBJECTIF : Choisir 5 jeux par tranche d’âge, 30 € par enfant.' });
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: member.id, role: 'member' }).catch(() => {});
    r1 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Retenir les jeux', type: 'decision' } })).body;
    r2 = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Valider la liste', type: 'decision' } })).body;
    await h.db('Milestone').where({ id: r1.id }).update({ status: 'done' });
    await h.db('Session').insert({ id: crypto.randomUUID(), projectId: pid, task: 'Retenir les jeux', status: 'accepted', mode: 'meeting', summary: '3-5 ans : cinq jeux retenus.', createdAt: new Date('2026-10-09') });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('répond avec la connaissance du projet, ses sources et la réunion à venir proposée', async () => {
    h.ai.responder = () => ({ text: 'La liste des 3-5 ans est prête.\n[SOURCES:["Réunion « Retenir les jeux », 9 oct."]]\n[MEETING:R2]' });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'On en est où ?' } });
    expect(r.status).toBe(200);
    expect(r.body.reply).toMatchObject({
      role: 'assistant', content: 'La liste des 3-5 ans est prête.',
      sources: ['Réunion « Retenir les jeux », 9 oct.'],
      proposal: { ref: 'R2', milestoneId: r2.id, title: 'Valider la liste' },
    });
    const call = h.ai.calls[calls];
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(call.system[0].text).toContain('3-5 ans : cinq jeux retenus.');
    expect(call.system[0].text).toContain('R2 — Valider la liste — à venir');
    expect(call.system[0].text).toContain('POSTURE');
    expect(call.messages).toEqual([{ role: 'user', content: 'On en est où ?' }]);
  });

  it('la conversation continue (historique) ; une réunion déjà tenue n’est pas proposée', async () => {
    h.ai.responder = () => ({ text: 'Le budget est de 30 € par enfant.\n[MEETING:R1]' });
    const calls = h.ai.calls.length;
    const r = await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Et le budget ?' } });
    expect(r.body.reply.proposal).toBeNull();
    expect(r.body.reply.sources).toEqual([]);
    expect(h.ai.calls[calls].messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(h.ai.calls[calls].messages[1].content).toBe('La liste des 3-5 ans est prête.');
    const list = (await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages;
    expect(list.map(m => m.role)).toEqual(['human', 'assistant', 'human', 'assistant']);
  });

  it('une conversation par personne ; effacer ne touche que la sienne', async () => {
    expect((await h.request('GET', `/api/projects/${pid}/assistant`, { token: member.token })).body.messages).toEqual([]);
    expect((await h.request('DELETE', `/api/projects/${pid}/assistant`, { token: owner.token })).status).toBe(200);
    expect((await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages).toEqual([]);
    expect((await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: '' } })).status).toBe(400);
  });

  // Étape C du test « Gérard » : le projet évolue sur proposition du bras droit, après accord
  const EVOLVE = 'Vendre vos vinyles demande une boutique et un paiement en ligne (1,5 % par vente environ).\n'
    + '[EVOLVE:{"summary":"Le site vend aussi des vinyles.","brief":"Vendre une sélection de vinyles en ligne.","meetings":['
    + '{"title":"Choisir comment vendre les vinyles","type":"decision","why":"Prix, envoi, paiement [cartes]."},'
    + '{"title":"Ajouter la boutique au site","type":"claude_code","why":"Pages produits."},{"title":"x","type":"inconnu"}],'
    + '"after":"R1","technical":true}]\n[SOURCES:["Brief"]]';

  it('propose une évolution : carte « evolution », marqueur retiré du texte, types bornés', async () => {
    h.ai.responder = () => ({ text: EVOLVE });
    const r = await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Et si je vendais mes vinyles sur mon site ?' } });
    expect(r.body.reply.content).toBe('Vendre vos vinyles demande une boutique et un paiement en ligne (1,5 % par vente environ).');
    expect(r.body.reply.sources).toEqual(['Brief']);
    expect(r.body.reply.proposal).toMatchObject({
      kind: 'evolution', status: 'pending', technical: true, after: { ref: 'R1', milestoneId: r1.id },
      meetings: [{ title: 'Choisir comment vendre les vinyles', type: 'decision', why: 'Prix, envoi, paiement [cartes].' },
        { title: 'Ajouter la boutique au site', type: 'claude_code' }, { title: 'x', type: 'decision' }],
    });
    expect(h.ai.calls[h.ai.calls.length - 1].system[0].text).toContain('[EVOLVE:');
  });

  it('accepter : brief complété, réunions insérées après R1, projet technique, mémoire ; une seule fois', async () => {
    const msgId = (await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages.at(-1).id;
    const r = await h.request('POST', `/api/projects/${pid}/assistant/${msgId}/evolution`, { token: owner.token, body: { accept: true } });
    expect(r.status).toBe(200);
    expect(r.body.message.proposal.status).toBe('applied');
    const project = await h.db('Project').where({ id: pid }).first();
    expect(project.brief).toMatch(/OBJECTIF : Choisir 5 jeux[\s\S]*ÉVOLUTION \(\d\d\/\d\d\/\d{4}\) : Vendre une sélection de vinyles en ligne\./);
    expect(project.hasTechnicalStack).toBe(true);
    const plan = await h.db('Milestone').where({ projectId: pid }).orderBy('displayOrder');
    expect(plan.map(m => m.title)).toEqual(['Retenir les jeux', 'Choisir comment vendre les vinyles', 'Ajouter la boutique au site', 'x', 'Valider la liste']);
    expect(plan[2].type).toBe('claude_code');
    expect(project.context).toContain('Évolution du projet, acceptée avec le bras droit');
    expect((await h.request('POST', `/api/projects/${pid}/assistant/${msgId}/evolution`, { token: owner.token, body: { accept: true } })).status).toBe(409);
  });

  it('un membre ne fait pas évoluer le projet ; il peut écarter la proposition', async () => {
    h.ai.responder = () => ({ text: 'Une appli, c’est possible.\n[EVOLVE:{"summary":"Une appli.","meetings":[{"title":"Choisir l’appli","type":"decision"}],"after":null}]' });
    const reply = (await h.request('POST', `/api/projects/${pid}/assistant`, { token: member.token, body: { message: 'Je vais créer une appli' } })).body.reply;
    expect(reply.proposal).toMatchObject({ kind: 'evolution', after: null, technical: false });
    const url = `/api/projects/${pid}/assistant/${reply.id}/evolution`;
    expect((await h.request('POST', url, { token: member.token, body: { accept: true } })).status).toBe(403);
    expect((await h.request('POST', url, { token: owner.token, body: { accept: false } })).status).toBe(404); // pas sa conversation
    const r = await h.request('POST', url, { token: member.token, body: { accept: false } });
    expect(r.body.message.proposal.status).toBe('declined');
    expect(await h.db('Milestone').where({ projectId: pid, title: 'Choisir l’appli' })).toHaveLength(0);
  });

  // v5.1 (F2, constats sur « WorldOfMetal ») : « occupe-toi de… », ordre du plan, réunions en cours, niveau
  it('« occupe-toi de la prochaine réunion » : carte de prise en charge, puis lancée', async () => {
    const plan = await h.db('Milestone').where({ projectId: pid }).orderBy('displayOrder');
    const ref = `R${plan.findIndex(m => m.title === 'Valider la liste') + 1}`;
    h.ai.responder = () => ({ text: `Je m'en occupe : je tiens la réunion sur la liste maintenant et je reviens vers vous.\n[DELEGATE:${ref}]` });
    const reply = (await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Occupe-toi de la prochaine réunion' } })).body.reply;
    expect(reply.content).not.toContain('[DELEGATE');
    expect(reply.proposal).toMatchObject({ kind: 'delegate', status: 'pending', title: 'Valider la liste' });
    const r = await h.request('POST', `/api/projects/${pid}/assistant/${reply.id}/delegated`, { token: owner.token, body: { sessionId: 'abc' } });
    expect(r.body.message.proposal).toMatchObject({ kind: 'delegate', status: 'started', sessionId: 'abc' });
    // Une réunion déjà tenue ne se délègue pas
    h.ai.responder = () => ({ text: 'Elle est déjà tenue.\n[DELEGATE:R1]' });
    expect((await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Occupe-toi de la première' } })).body.reply.proposal).toBeNull();
  });

  it('« maquetter avant le schéma » : déplacement proposé, appliqué après accord', async () => {
    const before = (await h.db('Milestone').where({ projectId: pid }).orderBy('displayOrder')).map(m => m.title);
    const last = before.length, prev = before.length - 1;
    h.ai.responder = () => ({ text: `C'est raisonnable.\n[REORDER:R${last}->R${prev}]` });
    const reply = (await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Je préfère tenir la dernière avant l’avant-dernière' } })).body.reply;
    expect(reply.proposal).toMatchObject({ kind: 'reorder', move: { title: before[last - 1] }, before: { title: before[prev - 1] } });
    const r = await h.request('POST', `/api/projects/${pid}/assistant/${reply.id}/reorder`, { token: owner.token, body: { accept: true } });
    expect(r.body.message.proposal.status).toBe('applied');
    const after = (await h.db('Milestone').where({ projectId: pid }).orderBy('displayOrder')).map(m => m.title);
    expect(after).toEqual([...before.slice(0, prev - 1), before[last - 1], before[prev - 1]]);
    expect((await h.request('POST', `/api/projects/${pid}/assistant/${reply.id}/reorder`, { token: owner.token, body: { accept: true } })).status).toBe(409);
  });

  it('il voit les réunions en cours (et sa note de retour) et parle au niveau de l’humain', async () => {
    await h.db('Project').where({ id: pid }).update({ expertiseLevel: 1 });
    await h.db('Session').insert({ id: crypto.randomUUID(), projectId: pid, task: 'Cartographier les régions', status: 'open', mode: 'meeting', createdAt: new Date(),
      messages: JSON.stringify([{ id: 'm1', role: 'agent', agentName: 'Chercheur', content: 'Huit régions.', type: 'message' },
        { id: 'c1', role: 'system', type: 'decision', question: 'Lancer une région à un seul groupe ?', status: 'pending' }]),
      delegation: JSON.stringify({ status: 'done', note: { headline: 'Huit régions, une vingtaine de groupes.' } }) });
    h.ai.responder = () => ({ text: 'La cartographie est tenue, une question vous attend.' });
    const calls = h.ai.calls.length;
    await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'On en est où de la réunion ?' } });
    const sys = h.ai.calls[calls].system[0].text;
    expect(sys).toContain('Réunion EN COURS « Cartographier les régions »');
    expect(sys).toContain('ta note de retour : Huit régions, une vingtaine de groupes.');
    expect(sys).toContain('Question ouverte : Lancer une région à un seul groupe ?');
    expect(sys).toContain('TON INTERLOCUTEUR : Il n\'y connaît rien');
  });

  it('marqueur malformé : pas de carte, texte nettoyé', async () => {
    h.ai.responder = () => ({ text: 'Bonne idée.\n[EVOLVE:{"summary": "coupé' });
    const r = await h.request('POST', `/api/projects/${pid}/assistant`, { token: owner.token, body: { message: 'Et un podcast ?' } });
    expect(r.body.reply).toMatchObject({ content: 'Bonne idée.', proposal: null });
  });
});
