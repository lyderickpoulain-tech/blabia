import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

// BlabIA + : construction du site par un agent hébergé (Managed Agents), retouche, aperçu.
// Le service d'agents d'Anthropic est simulé (setClient) : aucun appel réel, aucun coût.
const require = createRequire(import.meta.url);
const harness = require('./harness');

const DOSSIER = `<nom>Le Pétrin Sonore</nom>
<gabarit>site</gabarit>
<resume>Le dossier du site.</resume>
<ouvrage>
## Le site en bref
Un boulanger de Rennes partage ses disques préférés.

## Les pages
Accueil, Concerts, Contact.
</ouvrage>
<suppositions>
- Nom du site :: Le Pétrin Sonore
</suppositions>
<idees>
- + « mes disques préférés » :: Le site en bref
</idees>
<fini_quand>
- les pages sont décrites
</fini_quand>
<etat_fini>
- C1 :: atteint — Les pages
</etat_fini>
<prochaines_etapes>
- aucune
</prochaines_etapes>`;

function fakeAgents() {
  const f = {
    envCreates: 0, agentCreates: 0, uploads: [], sessions: [], sent: [], archived: [],
    outputs: () => ({ 'index.html': '<!doctype html><title>Le Pétrin Sonore</title><h1>Accueil</h1><a href="concerts.html">Concerts</a>', 'concerts.html': '<h1>Concerts</h1>', 'style.css': 'body{color:#333}', 'RAPPORT.md': 'Pages faites : accueil, concerts.', 'verifier.py': 'print(1)', 'dossier.md': null, '../evil.html': '<script>x</script>' }),
  };
  f.client = {
    files: { upload: async ({ file }) => { const id = `file_up_${f.uploads.length + 1}`; f.uploads.push({ id, name: file.name }); return { id }; } },
    beta: {
      environments: { create: async () => { f.envCreates++; return { id: 'env_test' }; } },
      agents: { create: async p => { f.agentCreates++; f.agent = p; return { id: 'agent_test', version: 1 }; } },
      sessions: {
        create: async p => { const id = `sesn_${f.sessions.length + 1}`; f.sessions.push({ id, ...p }); return { id }; },
        events: {
          stream: async () => (async function* () {
            f.streams = (f.streams || 0) + 1;
            if (f.cutStreams > 0) { f.cutStreams--; yield { type: 'agent.tool_use', id: 't0', name: 'bash', evaluated_permission: 'allow' }; return; } // flux coupé en cours de route
            yield { type: 'agent.tool_use', id: 't1', name: 'write', evaluated_permission: 'allow' };
            yield { type: 'agent.tool_use', id: 't2', name: 'web_fetch', evaluated_permission: 'ask' };
            yield { type: 'session.status_idle', stop_reason: { type: 'end_turn' } };
          })(),
          send: async (id, p) => { f.sent.push({ id, ...p }); },
        },
        retrieve: async () => { f.retrieves = (f.retrieves || 0) + 1; return { status: f.statuses?.shift() || 'idle', usage: { list_cost: { amount: '81', currency: 'USD' }, input_tokens: 12000, output_tokens: 4000 } }; },
        archive: async id => { f.archived.push(id); },
      },
      files: {
        list: () => (async function* () {
          for (const [name, body] of Object.entries(f.outputs())) yield { id: `out_${name}`, filename: name, size_bytes: body ? body.length : 10 };
        })(),
        download: async id => {
          const name = id.replace(/^out_/, '');
          const body = f.outputs()[name];
          if (body == null) throw Object.assign(new Error('not downloadable'), { status: 400 });
          return { arrayBuffer: async () => Buffer.from(body) };
        },
      },
    },
  };
  return f;
}

describe.skipIf(!harness.enabled)('BlabIA + : le site construit par un agent', () => {
  let h, owner, pid, fake, site;
  const getSite = () => h.request('GET', `/api/projects/${pid}/site`, { token: owner.token }).then(r => r.body);
  async function waitSite() {
    for (let i = 0; i < 200; i++) {
      const s = await getSite();
      if (s.last?.status !== 'building') return s;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('construction trop longue');
  }

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'porteur-site@test.local');
    h.ai.responder = () => ({ text: DOSSIER });
    site = require('../services/plus/siteBuilder');
    fake = fakeAgents();
    site.setClient(fake.client);
    pid = (await h.request('POST', '/api/projects/from-story', { token: owner.token, body: { story: 'Je suis boulanger à Rennes et je voudrais un site pour mes disques préférés.' } })).body.id;
    for (let i = 0; i < 100; i++) {
      const w = (await h.request('GET', `/api/projects/${pid}/work`, { token: owner.token })).body;
      if (w.current) break;
      await new Promise(r => setTimeout(r, 50));
    }
  });
  afterAll(async () => { site?.setClient(null); h.ai.responder = null; }); // base fermée à la fin du fichier (bloc suivant)

  it('« Construire mon site » : session plafonnée, dossier fourni, site conservé, coût journalisé', async () => {
    expect((await getSite()).last).toBeNull();
    expect((await h.request('POST', `/api/projects/${pid}/site/build`, { token: owner.token })).status).toBe(202);
    const s = await waitSite();
    expect(s.last).toMatchObject({ status: 'ready', kind: 'build', report: 'Pages faites : accueil, concerts.' });
    expect(s.last.previewPath).toMatch(/^\/api\/apercu\/[0-9a-f]{48}\/$/);
    const session = fake.sessions[0];
    expect(session.budget).toEqual({ type: 'limit', max_list_cost: { amount: '200', currency: 'USD' } });
    expect(session.resources[0]).toMatchObject({ type: 'file', mount_path: '/workspace/dossier.md' });
    expect(fake.agent.model).toBe('claude-sonnet-5-5');
    expect(fake.agent.system).toMatch(/À PLAT/);
    expect(fake.agent.system).toMatch(/N'invente rien/);
    expect(fake.agent.system).toMatch(/Référencement/);
    expect(fake.agent.tools[0].configs).toEqual(expect.arrayContaining([{ name: 'web_fetch', enabled: false }]));
    // Un outil hors du bac à sable de l'agent est refusé
    expect(fake.sent.find(e => e.events[0].type === 'user.tool_confirmation').events[0]).toMatchObject({ tool_use_id: 't2', result: 'deny' });
    // Fichiers : le site, sans le rapport, sans le script de vérification, sans nom dangereux
    const files = await h.db('SiteFile').join('SiteBuild', 'SiteBuild.id', 'SiteFile.buildId').where({ 'SiteBuild.projectId': pid }).pluck('path');
    expect(files.sort()).toEqual(['concerts.html', 'index.html', 'style.css']);
    expect(fake.archived).toEqual(['sesn_1']);
    const log = await h.db('UsageLog').where({ projectId: pid, kind: 'site/build' }).first();
    expect(Number(log.costUSD)).toBeCloseTo(0.81);
  });

  it('aperçu : servi dans un bac à sable, sans connexion, par son jeton seul', async () => {
    const { last } = await getSite();
    const token = last.previewPath.split('/')[3];
    const r = await h.request('GET', `/api/apercu/${token}/`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.headers['content-security-policy']).toMatch(/^sandbox /);
    expect(r.headers['content-security-policy']).toMatch(/connect-src 'none'/);
    expect(r.headers['x-robots-tag']).toMatch(/noindex/);
    expect((await h.request('GET', `/api/apercu/${token}/style.css`)).headers['content-type']).toMatch(/text\/css/);
    expect((await h.request('GET', `/api/apercu/${token}/absent.html`)).status).toBe(404);
    expect((await h.request('GET', `/api/apercu/${'0'.repeat(48)}/`)).status).toBe(404);
  });

  it('« Télécharger mon site » : tout le site dans un .zip, avec un mode d’emploi', async () => {
    const res = await fetch(`${h.base}/api/projects/${pid}/site/download`, { headers: { Authorization: `Bearer ${owner.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    expect(Object.keys(zip.files).sort()).toEqual(['LISEZMOI.txt', 'concerts.html', 'index.html', 'style.css']);
    expect(await zip.file('LISEZMOI.txt').async('string')).toMatch(/index\.html doit être au premier niveau/);
    expect((await fetch(`${h.base}/api/projects/${pid}/site/download`)).status).toBe(401);
  });

  it('retouche : repart du site existant, nouvel aperçu ; une seule construction à la fois', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/site/retouch`, { token: owner.token, body: { text: '' } })).status).toBe(400);
    const before = (await getSite()).ready;
    expect((await h.request('POST', `/api/projects/${pid}/site/retouch`, { token: owner.token, body: { text: 'Mettez le fond en brun.' } })).status).toBe(202);
    expect((await h.request('POST', `/api/projects/${pid}/site/build`, { token: owner.token })).status).toBe(409);
    const s = await waitSite();
    expect(s.last).toMatchObject({ status: 'ready', kind: 'retouch', request: 'Mettez le fond en brun.' });
    expect(s.last.previewPath).not.toBe(before.previewPath);
    const session = fake.sessions[1];
    expect(session.resources.map(r => r.mount_path)).toEqual(expect.arrayContaining(['/workspace/dossier.md', '/workspace/site/index.html', '/workspace/site/style.css']));
    const message = fake.sent.filter(e => e.id === 'sesn_2' && e.events[0].type === 'user.message')[0].events[0].content[0].text;
    expect(message).toContain('Mettez le fond en brun.');
    expect(fake.envCreates).toBe(1); // environnement et agent créés une seule fois
    expect(fake.agentCreates).toBe(1);
  });

  it('un site incomplet n’est pas enregistré : échec lisible, l’aperçu précédent reste', async () => {
    const outputs = fake.outputs;
    fake.outputs = () => ({ 'style.css': 'body{}', 'RAPPORT.md': 'Plafond atteint.' });
    await h.request('POST', `/api/projects/${pid}/site/retouch`, { token: owner.token, body: { text: 'Ajoutez une page.' } });
    const s = await waitSite();
    fake.outputs = outputs;
    expect(s.last.status).toBe('failed');
    expect(s.last.error).toMatch(/incomplet/);
    expect(s.ready.kind).toBe('retouch');
  });

  it('flux coupé avant la fin : BlabIA relit l’état de la session et se reconnecte', async () => {
    fake.cutStreams = 1; fake.statuses = ['running']; fake.streams = 0;
    await h.request('POST', `/api/projects/${pid}/site/retouch`, { token: owner.token, body: { text: 'Agrandissez le titre.' } });
    const s = await waitSite();
    expect(s.last).toMatchObject({ status: 'ready', request: 'Agrandissez le titre.' });
    expect(fake.streams).toBe(2); // reconnecté après la coupure
    expect(fake.sent.filter(e => e.events[0].type === 'user.message' && e.events[0].content[0].text.includes('Agrandissez')).length).toBe(1); // demande envoyée une seule fois
  });

  it('seul un projet qui décrit un site se construit', async () => {
    h.ai.responder = () => ({ text: DOSSIER.replace('<gabarit>site</gabarit>', '<gabarit>jeu</gabarit>') });
    const other = (await h.request('POST', '/api/projects/from-story', { token: owner.token, body: { story: 'Un jeu de société sur les volcans, pour jouer en famille.' } })).body.id;
    for (let i = 0; i < 100; i++) { if ((await h.request('GET', `/api/projects/${other}/work`, { token: owner.token })).body.current) break; await new Promise(r => setTimeout(r, 50)); }
    expect((await h.request('POST', `/api/projects/${other}/site/build`, { token: owner.token })).status).toBe(400);
  });
});

// Lot 3 : mise en ligne sur le compte Cloudflare de BlabIA (API simulée : aucun appel réel)
describe.skipIf(!harness.enabled)('BlabIA + : mettre le site en ligne', () => {
  let h, owner, other, pid, pub, calls, kv;
  let saasEnabled = false, hostStatus = 'pending';
  const hostnames = new Map();
  const ok = result => ({ ok: true, status: 200, json: async () => ({ success: true, result }) });
  function fakeCloudflare(url, init) {
    const u = new URL(url); const p = u.pathname.replace('/client/v4', ''); const m = init.method;
    calls.push(`${m} ${p}`);
    if (m === 'GET' && p.endsWith('/storage/kv/namespaces')) return ok([]);
    if (m === 'POST' && p.endsWith('/storage/kv/namespaces')) return ok({ id: 'ns_1' });
    if (m === 'PUT' && p.includes('/workers/scripts/')) return ok({});
    if (m === 'GET' && p === '/zones') return ok([{ id: 'zone_1' }]);
    if (p.endsWith('/dns_records')) return ok(m === 'GET' ? [] : {});
    if (p.endsWith('/workers/routes')) return ok(m === 'GET' ? [] : {});
    if (m === 'PUT' && p.endsWith('/bulk')) { for (const e of JSON.parse(init.body)) kv.set(e.key, e); return ok({}); }
    if (m === 'POST' && p.endsWith('/bulk/delete')) { for (const k of JSON.parse(init.body)) kv.delete(k); return ok({}); }
    if (p.endsWith('/custom_hostnames/fallback_origin')) return saasEnabled ? ok({}) : { ok: false, status: 403, json: async () => ({ success: false, errors: [{ code: 1404, message: 'No quota has been allocated' }] }) };
    if (m === 'POST' && p.endsWith('/custom_hostnames')) { hostnames.set('ch_1', JSON.parse(init.body).hostname); return ok({ id: 'ch_1' }); }
    if (m === 'GET' && p.includes('/custom_hostnames/')) return ok({ status: hostStatus, ssl: { status: hostStatus } });
    if (m === 'DELETE' && p.includes('/custom_hostnames/')) { hostnames.delete(p.split('/').pop()); return ok({}); }
    if (p.includes('/values/')) { const key = decodeURIComponent(p.split('/values/')[1]); if (m === 'PUT') kv.set(key, init.body); else kv.delete(key); return ok({}); }
    if (m === 'GET' && p.endsWith('/keys')) { const prefix = u.searchParams.get('prefix'); return { ok: true, status: 200, json: async () => ({ success: true, result: [...kv.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), result_info: {} }) }; }
    return { ok: false, status: 404, json: async () => ({ success: false, errors: [{ code: 0, message: `inattendu ${m} ${p}` }] }) };
  }

  beforeAll(async () => {
    h = await harness.start();
    Object.assign(process.env, { CLOUDFLARE_API_TOKEN: 'jeton-de-test', CLOUDFLARE_ACCOUNT_ID: 'compte_test', SITES_DOMAIN: 'sites-test.com' });
    pub = require('../services/plus/sitePublisher');
    calls = []; kv = new Map();
    pub.setFetch(fakeCloudflare);
    owner = await h.createUser('member', 'porteur-enligne@test.local');
    other = await h.createUser('member', 'invite-enligne@test.local');
    const [p] = await h.db('Project').insert({ id: crypto.randomUUID(), name: 'Le Pétrin Sonore', status: 'active', userId: owner.id, createdAt: new Date(), updatedAt: new Date() }).returning('id');
    pid = p.id;
    const workId = crypto.randomUUID();
    await h.db('Work').insert({ id: workId, projectId: pid, template: 'site', currentVersion: 1 });
    const buildId = crypto.randomUUID();
    await h.db('SiteBuild').insert({ id: buildId, projectId: pid, workId, baseVersion: 1, status: 'ready', previewToken: crypto.randomBytes(24).toString('hex'), createdAt: new Date() });
    await h.db('SiteFile').insert([
      { id: crypto.randomUUID(), buildId, path: 'index.html', contentType: 'text/html; charset=utf-8', size: 10, content: Buffer.from('<h1>Accueil</h1>') },
      { id: crypto.randomUUID(), buildId, path: 'concerts.html', contentType: 'text/html; charset=utf-8', size: 10, content: Buffer.from('<h1>Concerts</h1>') },
      { id: crypto.randomUUID(), buildId, path: 'robots.txt', contentType: 'text/plain; charset=utf-8', size: 10, content: Buffer.from('User-agent: *\nAllow: /\n') },
    ]);
    await h.db('ProjectMember').insert({ id: crypto.randomUUID(), projectId: pid, userId: other.id, role: 'member' }).catch(() => {});
  });
  afterAll(async () => { pub?.setFetch(null); for (const k of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SITES_DOMAIN']) delete process.env[k]; await h?.stop(); });

  it('première mise en ligne : installation une fois, adresse tirée du nom, plan du site pour Google', async () => {
    const before = (await h.request('GET', `/api/projects/${pid}/site`, { token: owner.token })).body.publication;
    expect(before).toMatchObject({ available: true, online: false, suggestedSlug: 'le-petrin-sonore', domain: 'sites-test.com' });
    const r = await h.request('POST', `/api/projects/${pid}/site/publish`, { token: owner.token, body: {} });
    expect(r.status).toBe(200);
    expect(r.body.publication).toMatchObject({ online: true, url: 'https://le-petrin-sonore.sites-test.com/', upToDate: true });
    expect(calls).toEqual(expect.arrayContaining(['POST /accounts/compte_test/storage/kv/namespaces', 'PUT /accounts/compte_test/workers/scripts/blabia-sites', 'POST /zones/zone_1/dns_records', 'POST /zones/zone_1/workers/routes']));
    expect([...kv.keys()].sort()).toEqual(['le-petrin-sonore/concerts.html', 'le-petrin-sonore/index.html', 'le-petrin-sonore/robots.txt', 'le-petrin-sonore/sitemap.xml']);
    const sitemap = Buffer.from(kv.get('le-petrin-sonore/sitemap.xml').value, 'base64').toString();
    expect(sitemap).toContain('<loc>https://le-petrin-sonore.sites-test.com/</loc>');
    expect(sitemap).toContain('<loc>https://le-petrin-sonore.sites-test.com/concerts.html</loc>');
    expect(Buffer.from(kv.get('le-petrin-sonore/robots.txt').value, 'base64').toString()).toContain('Sitemap: https://le-petrin-sonore.sites-test.com/sitemap.xml');
    expect(kv.get('le-petrin-sonore/index.html').metadata).toEqual({ ct: 'text/html; charset=utf-8' });
  });

  it('nouvelle adresse choisie : l’ancienne disparaît ; adresse invalide ou réservée refusée ; installation pas refaite', async () => {
    calls = [];
    expect((await h.request('POST', `/api/projects/${pid}/site/publish`, { token: owner.token, body: { slug: 'Le Pétrin' } })).status).toBe(400);
    expect((await h.request('POST', `/api/projects/${pid}/site/publish`, { token: owner.token, body: { slug: 'admin' } })).status).toBe(400);
    const r = await h.request('POST', `/api/projects/${pid}/site/publish`, { token: owner.token, body: { slug: 'petrin-sonore' } });
    expect(r.body.publication.url).toBe('https://petrin-sonore.sites-test.com/');
    expect([...kv.keys()].every(k => k.startsWith('petrin-sonore/'))).toBe(true);
    expect(calls.some(c => c.includes('/workers/scripts/'))).toBe(false);
  });

  it('adresse au nom du porteur : refusée tant que l’option n’est pas activée, puis la ligne à ajouter, puis active', async () => {
    let r = await h.request('POST', `/api/projects/${pid}/site/domain`, { token: owner.token, body: { hostname: 'petrin-sonore.fr' } });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/pas encore ouvertes/);
    saasEnabled = true;
    expect((await h.request('POST', `/api/projects/${pid}/site/domain`, { token: owner.token, body: { hostname: 'pas une adresse' } })).status).toBe(400);
    expect((await h.request('POST', `/api/projects/${pid}/site/domain`, { token: owner.token, body: { hostname: 'x.sites-test.com' } })).status).toBe(400);
    r = await h.request('POST', `/api/projects/${pid}/site/domain`, { token: owner.token, body: { hostname: 'https://Petrin-Sonore.fr/' } });
    expect(r.status).toBe(200);
    expect(r.body.publication.customDomain).toMatchObject({
      hostname: 'www.petrin-sonore.fr', status: 'pending', apex: 'petrin-sonore.fr',
      record: { type: 'CNAME', name: 'www', target: 'fallback.sites-test.com' },
    });
    expect(kv.get('host:www.petrin-sonore.fr')).toBe('petrin-sonore');
    expect(calls).toEqual(expect.arrayContaining(['POST /zones/zone_1/workers/routes']));
    hostStatus = 'active';
    r = await h.request('GET', `/api/projects/${pid}/site`, { token: owner.token });
    expect(r.body.publication.customDomain).toMatchObject({ status: 'active', url: 'https://www.petrin-sonore.fr/' });
    r = await h.request('DELETE', `/api/projects/${pid}/site/domain`, { token: owner.token });
    expect(r.body.publication.customDomain).toBeNull();
    expect(kv.has('host:www.petrin-sonore.fr')).toBe(false);
    expect(hostnames.size).toBe(0);
  });

  it('seul le propriétaire met en ligne ou retire ; retirer vide l’adresse', async () => {
    expect((await h.request('POST', `/api/projects/${pid}/site/unpublish`, { token: other.token })).status).toBeGreaterThanOrEqual(403);
    const r = await h.request('POST', `/api/projects/${pid}/site/unpublish`, { token: owner.token });
    expect(r.body.publication).toMatchObject({ online: false, url: null });
    expect(kv.size).toBe(0);
    expect((await h.request('POST', `/api/projects/${pid}/site/unpublish`, { token: owner.token })).status).toBe(409);
  });
});
