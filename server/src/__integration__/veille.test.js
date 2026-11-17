import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Veille mensuelle : récupération des rapports des séances terminées (service d'agents simulé).
// Une séance en cours attend ; une séance sans rapport (« Pas ce mois-ci ») n'est pas montrée.
const require = createRequire(import.meta.url);
const harness = require('./harness');

describe.skipIf(!harness.enabled)('veille mensuelle des outils', () => {
  let h, admin, veille, sessions;
  const fake = {
    beta: {
      deploymentRuns: { list: () => (async function* () { for (const id of Object.keys(sessions)) yield { id: `drun_${id}`, session_id: id, trigger_context: { type: 'schedule' } }; })() },
      sessions: { retrieve: async id => ({ status: sessions[id].status, usage: { list_cost: { amount: '120', currency: 'USD' } } }), archive: async () => {} },
      files: {
        list: ({ scope_id }) => (async function* () { if (sessions[scope_id].report) yield { id: `f_${scope_id}`, filename: 'veille.md' }; })(),
        download: async id => ({ arrayBuffer: async () => Buffer.from(sessions[id.slice(2)].report) }),
      },
    },
  };

  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    admin = await h.createUser('admin', 'admin-veille@test.local');
    veille = require('../services/veille');
    veille.setClient(fake);
    await h.db('AppSetting').insert({ key: 'veille', value: JSON.stringify({ deploymentId: 'depl_test', upcoming: [] }), updatedAt: new Date() });
    sessions = {
      sesn_a: { status: 'idle', report: '# Veille de BlabIA — novembre 2026\n## En bref\n- Mettre Node à jour.' },
      sesn_b: { status: 'idle', report: null },      // « Pas ce mois-ci »
      sesn_c: { status: 'running', report: null },   // pas encore finie
    };
  });
  afterAll(async () => { veille?.setClient(null); await h?.stop(); });

  it('garde le rapport d’une séance finie, ignore celle en cours, cache les mois sans veille', async () => {
    expect((await veille.collect()).collected).toBe(2);
    const r = await h.request('GET', '/api/admin/veille', { token: admin.token });
    expect(r.status).toBe(200);
    expect(r.body.reports).toHaveLength(1);
    expect(r.body.reports[0]).toMatchObject({ status: 'ready', trigger: 'schedule' });
    expect(r.body.reports[0].content).toMatch(/Mettre Node à jour/);
    expect(Number((await h.db('UsageLog').where({ kind: 'veille' }).sum('costUSD as c'))[0].c)).toBeCloseTo(2.4);
    // Une fois finie, la séance en cours est récupérée à son tour ; rien n'est relu deux fois
    sessions.sesn_c = { status: 'idle', report: '# Veille\nRien de neuf.' };
    expect((await veille.collect()).collected).toBe(1);
    expect((await veille.collect()).collected).toBe(0);
  });

  it('réservée à l’administration', async () => {
    const member = await h.createUser('member', 'membre-veille@test.local');
    expect((await h.request('GET', '/api/admin/veille', { token: member.token })).status).toBe(403);
  });
});
