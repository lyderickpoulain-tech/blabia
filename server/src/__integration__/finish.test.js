import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// v6 phase 3 : le cap et la fin. Chaque version dit où en est chaque phrase « Ce sera fini
// quand… » et propose une ou deux prochaines étapes ; quand tout est atteint, la livraison
// est proposée (dossier final en Word ; le PDF passe par la page d'impression). IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const version = ({ summary, list, status, steps }) => `<nom>Noël du CSE</nom>
<gabarit>liste</gabarit>
<resume>${summary}</resume>
<ouvrage>
## La liste complète
${list}

## Le plateau
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>
\`\`\`
</ouvrage>
<suppositions>
- Budget par jeu :: 20 euros
</suppositions>
<idees>
- + « 5 jeux par tranche » :: La liste complète
</idees>
<fini_quand>
- il y a 5 jeux pour chaque tranche d'âge
- chaque jeu a son prix
</fini_quand>
<etat_fini>
${status}
</etat_fini>
<prochaines_etapes>
${steps}
</prochaines_etapes>`;

const V1 = version({
  summary: 'Première liste.', list: '- Dobble (à vérifier)',
  status: '- C1 :: atteint — 25 jeux\n- C2 :: pas encore — 6 prix manquent',
  steps: '- retouche :: Ajoutez le prix des 6 jeux qui n’en ont pas\n- vous :: Vérifiez les prix en magasin',
});
const V2 = version({
  summary: 'Les prix sont complets.', list: '- Dobble, 15 €',
  status: '- C1 :: atteint — 25 jeux\n- C2 :: atteint — tous les prix',
  steps: '- aucune',
});

describe.skipIf(!harness.enabled)('v6 phase 3 : le cap et la fin', () => {
  let h, owner, pid;
  let reply = V1;
  const getWork = () => h.request('GET', `/api/projects/${pid}/work`, { token: owner.token }).then(r => r.body);
  async function waitBuilt() {
    for (let i = 0; i < 200; i++) {
      const w = await getWork();
      if (w.build?.status !== 'building') return w;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('écriture trop longue');
  }

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'porteur-fin@test.local');
    h.ai.responder = () => ({ text: reply });
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('première version : état de chaque phrase et prochaines étapes', async () => {
    pid = (await h.request('POST', '/api/projects/from-story', { token: owner.token, body: { story: '5 jeux de société pour chacune des 5 tranches d’âge, pour le Noël du CSE.' } })).body.id;
    const w = await waitBuilt();
    expect(h.ai.calls.at(-1).system).toMatch(/<etat_fini>/);
    expect(w.criteria.map(c => [c.text, c.status, c.note])).toEqual([
      ['il y a 5 jeux pour chaque tranche d\'âge', 'met', '25 jeux'],
      ['chaque jeu a son prix', 'open', '6 prix manquent'],
    ]);
    expect(w.current.nextSteps).toEqual([
      { kind: 'retouche', text: 'Ajoutez le prix des 6 jeux qui n’en ont pas' },
      { kind: 'vous', text: 'Vérifiez les prix en magasin' },
    ]);
    expect(w.allMet).toBe(false);
    expect(w.delivered).toBeNull();
  });

  it('version suivante : les phrases sont repérées C1, C2 ; l’état change à l’acceptation seulement', async () => {
    reply = V2;
    expect((await h.request('POST', `/api/projects/${pid}/work/retouch`, { token: owner.token, body: { text: 'Ajoutez le prix des 6 jeux qui n’en ont pas' } })).status).toBe(202);
    let w = await waitBuilt();
    const prompt = h.ai.calls.at(-1).messages[0].content;
    expect(prompt).toContain('- chaque jeu a son prix');
    expect(prompt).toMatch(/MOT POUR MOT/);
    expect(h.ai.calls.at(-1).system).toMatch(/EN LISANT LE DOSSIER SEUL/);
    expect(w.allMet).toBe(false); // proposition pas encore gardée
    w = (await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/accept`, { token: owner.token })).body;
    expect(w.criteria.every(c => c.status === 'met')).toBe(true);
    expect(w.current.nextSteps).toEqual([]);
    expect(w.allMet).toBe(true);
  });

  it('livraison : le dossier final, en Word, sans les dessins', async () => {
    let w = (await h.request('POST', `/api/projects/${pid}/work/deliver`, { token: owner.token })).body;
    expect(w.delivered).toMatchObject({ version: 2, current: true });
    const r = await h.request('GET', `/api/projects/${pid}/work/export/word`, { token: owner.token });
    expect(r.status).toBe(200);
    expect((await h.request('GET', `/api/projects/${pid}/work/export/word?version=1`, { token: owner.token })).status).toBe(200);
    expect((await h.request('GET', `/api/projects/${pid}/work/export/word?version=9`, { token: owner.token })).status).toBe(404);
    // Une nouvelle version après la livraison : le projet n'est plus « livré » tel quel
    reply = V2.replace('Dobble, 15 €', 'Dobble, 14 €');
    await h.request('POST', `/api/projects/${pid}/work/retouch`, { token: owner.token, body: { text: 'Dobble à 14 €' } });
    w = await waitBuilt();
    w = (await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/accept`, { token: owner.token })).body;
    expect(w.delivered).toMatchObject({ version: 2, current: false });
  });

  it('la liste « Ce sera fini quand… » suit le projet quand le porteur le change ; ses propres phrases restent', async () => {
    reply = V2.replace('- chaque jeu a son prix\n</fini_quand>', '- chaque jeu a son prix et un lien d’achat\n</fini_quand>')
      .replace('- C2 :: atteint — tous les prix', '- C2 :: pas encore — 3 liens manquent');
    await h.request('POST', `/api/projects/${pid}/work/retouch`, { token: owner.token, body: { text: 'Ajoutez où acheter chaque jeu' } });
    let w = await waitBuilt();
    expect(w.proposal.criteriaChanges).toEqual({ added: ['chaque jeu a son prix et un lien d’achat'], removed: ['chaque jeu a son prix'] });
    w = (await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/accept`, { token: owner.token })).body;
    expect(w.criteria.map(c => [c.text, c.status])).toEqual([
      ['il y a 5 jeux pour chaque tranche d\'âge', 'met'],
      ['chaque jeu a son prix et un lien d’achat', 'open'],
    ]);
    expect(w.allMet).toBe(false);

    // Le porteur corrige la liste lui-même : sa phrase est marquée, et une proposition écrite
    // avant sa correction ne la remplace pas
    await h.request('POST', `/api/projects/${pid}/work/retouch`, { token: owner.token, body: { text: 'Encore un détail' } });
    w = await waitBuilt();
    w = (await h.request('PUT', `/api/projects/${pid}/work/criteria`, { token: owner.token, body: { criteria: ['il y a 5 jeux pour chaque tranche d\'âge', 'chaque jeu a un prix de moins de 30 €'] } })).body;
    expect(w.proposal.criteriaChanges).toBeNull();
    w = (await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/accept`, { token: owner.token })).body;
    expect(w.criteria.map(c => c.text)).toEqual(['il y a 5 jeux pour chaque tranche d\'âge', 'chaque jeu a un prix de moins de 30 €']);
    await h.request('POST', `/api/projects/${pid}/work/retouch`, { token: owner.token, body: { text: 'Et un dernier' } });
    w = await waitBuilt();
    expect(h.ai.calls.at(-1).messages[0].content).toContain('- chaque jeu a un prix de moins de 30 € (écrite par le porteur)');
    await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/refuse`, { token: owner.token });
  });

  it('une version coupée (trop longue) n’est jamais enregistrée : échec lisible, « Réessayer »', async () => {
    h.ai.responder = () => ({ text: V2.slice(0, 200), stop_reason: 'max_tokens' });
    await h.request('POST', `/api/projects/${pid}/work/retouch`, { token: owner.token, body: { text: 'Une retouche' } });
    let w = await waitBuilt();
    expect(w.build.status).toBe('failed');
    expect(w.build.error).toMatch(/coupée/);
    expect(w.proposal).toBeNull();
    expect(h.ai.calls.at(-1).max_tokens).toBeGreaterThanOrEqual(32000);
    h.ai.responder = () => ({ text: reply });
    await h.request('POST', `/api/projects/${pid}/work/retry`, { token: owner.token });
    w = await waitBuilt();
    expect(w.proposal).not.toBeNull();
    await h.request('POST', `/api/projects/${pid}/work/proposals/${w.proposal.id}/refuse`, { token: owner.token });
  });

  it('aucun plan de réunions n’est créé pour un projet v6', async () => {
    const [{ n }] = await h.db('Milestone').where({ projectId: pid }).count('* as n');
    expect(Number(n)).toBe(0);
  });
});
