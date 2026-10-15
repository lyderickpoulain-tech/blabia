import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

// Bras droit, étape 2 (v5.1, 16/10/2026) : une réunion confiée au bras droit tourne sans
// l'humain ; il tranche les cartes dans son cadre, garde les autres pour l'humain, puis rend
// une note de retour dans sa conversation. IA simulée.
const require = createRequire(import.meta.url);
const harness = require('./harness');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const sysText = p => (Array.isArray(p.system) ? p.system.map(b => b.text).join('\n') : String(p.system || ''));
const AGENTS = [
  { id: 'a1', name: 'Léa', role: 'Acheteuse', systemPrompt: '' },
  { id: 'a2', name: 'Max', role: 'Éducateur', systemPrompt: '' },
];

describe.skipIf(!harness.enabled)('réunion tenue par le bras droit', () => {
  let h, owner, pid, sid, ms;
  beforeAll(async () => {
    h = await harness.start();
    await h.reset();
    owner = await h.createUser('member', 'deleg@test.local');
    pid = (await h.request('POST', '/api/projects', { token: owner.token, body: { name: 'Noël CSE' } })).body.id;
    ms = (await h.request('POST', `/api/projects/${pid}/milestones`, { token: owner.token, body: { title: 'Valider la liste', type: 'decision' } })).body;
    sid = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: {
      task: 'Valider la liste', intention: ['decision'], activeAgents: AGENTS, milestoneId: ms.id, challengerEnabled: false,
      delegation: { canDecide: ['La mise en forme'], reserved: ['Le budget'], notifyEmail: true, stopOnBlock: false },
    } })).body.session.id;

    let orch = 0, agent = 0;
    h.ai.responder = p => {
      const sys = sysText(p);
      if (p.model === ORCHESTRATOR_MODEL) {
        orch++;
        return { text: JSON.stringify({ agentIndex: (orch % 2) + 1, reason: 'Avancer', shouldClose: orch >= 3, animation: orch === 1 ? 'On valide la liste ; Léa, tu commences ?' : '' }) };
      }
      if (sys.includes('tu tiens une réunion à sa place')) {
        const q = p.messages[0].content;
        return { text: q.includes('Quel budget par enfant') ? JSON.stringify({ reserved: true, answer: '', reason: 'Le budget vous est réservé.', blocking: false })
          : JSON.stringify({ reserved: false, answer: 'Par tranche d’âge', reason: 'C’est le format attendu pour la commande.', blocking: false }) };
      }
      if (sys.includes('tu lui rends compte')) return { text: 'La liste est prête par tranche d’âge ; le budget reste à trancher.' };
      agent++;
      if (agent === 1) return { text: 'Je propose de présenter la liste.\n[DECISION:{"question":"Quelle présentation ?","choices":["Par tranche d’âge","Par prix","Autre (précise)"],"context":"Pour la commande."}]' };
      if (agent === 2) return { text: 'Il faut aussi fixer le budget.\n[DECISION:{"question":"Quel budget par enfant ?","choices":["30 €","40 €","Autre (précise)"],"context":"Fixe la gamme."}]' };
      return { text: 'La liste tient la route.' };
    };
  });
  afterAll(async () => { h.ai.responder = null; await h?.stop(); });

  it('tenue sans l’humain : cartes tranchées dans le cadre ou gardées, note de retour', async () => {
    const calls = h.ai.calls.length;
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '', resume: true, delegate: true }) });
    await res.text();
    // Les agents savent que l'humain est absent et connaissent le cadre
    const agentCall = h.ai.calls.slice(calls).find(c => c.model !== ORCHESTRATOR_MODEL && Array.isArray(c.system));
    expect(agentCall.system[0].text).toContain('RÉUNION TENUE PAR LE BRAS DROIT');
    expect(agentCall.system[0].text).toContain('Réservé à l\'humain : Le budget.');

    const s = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body;
    const cards = s.messages.filter(m => m.type === 'decision');
    expect(cards[0]).toMatchObject({ status: 'answered', answer: 'Par tranche d’âge', answeredByName: 'Bras droit', decidedByDelegate: true, delegateReason: 'C’est le format attendu pour la commande.' });
    expect(cards[1]).toMatchObject({ status: 'pending', reservedForHuman: true });
    expect(s.messages.filter(m => m.role === 'agent').length).toBe(2); // la réunion a continué après la première carte (clôture au 3e tour)
    expect(s.messages.find(m => m.type === 'animator')).toMatchObject({ agentName: 'Bras droit' });
    expect(s.delegation).toMatchObject({ status: 'done', note: { headline: 'La liste est prête par tranche d’âge ; le budget reste à trancher.' } });
    expect(s.delegation.note.decided).toHaveLength(1);
    expect(s.delegation.note.waiting.map(w => w.question)).toEqual(['Quel budget par enfant ?']);
    expect(s.status).toBe('open'); // l'humain conclut lui-même

    // Note de retour dans la conversation du bras droit
    const thread = (await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages;
    expect(thread.at(-1)).toMatchObject({ role: 'assistant', content: 'La liste est prête par tranche d’âge ; le budget reste à trancher.', proposal: { kind: 'delegation_report', sessionId: sid } });
    // Une seule exécution
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/chat`, { token: owner.token, body: { message: '', resume: true, delegate: true } })).status).toBe(409);
    const list = (await h.request('GET', `/api/projects/${pid}/sessions`, { token: owner.token })).body;
    expect(list.find(x => x.id === sid).delegation).toEqual({ status: 'done', reviewed: false });
  });

  it('contester une réponse du bras droit ; marquer la note comme lue', async () => {
    const card = (await h.request('GET', `/api/projects/${pid}/sessions/${sid}`, { token: owner.token })).body.messages.find(m => m.decidedByDelegate);
    const r = await h.request('POST', `/api/projects/${pid}/sessions/${sid}/contest-decision`, { token: owner.token, body: { messageId: card.id } });
    expect(r.body.message).toMatchObject({ status: 'pending', contestedAnswer: 'Par tranche d’âge' });
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/contest-decision`, { token: owner.token, body: { messageId: card.id } })).status).toBe(409);
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid}/delegation/ack`, { token: owner.token })).status).toBe(200);
    const list = (await h.request('GET', `/api/projects/${pid}/sessions`, { token: owner.token })).body;
    expect(list.find(x => x.id === sid).delegation).toEqual({ status: 'done', reviewed: true });
  });

  it('suivi en retrait : un mot glissé au bras droit, puis « Reprendre la main »', async () => {
    const sid2 = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: {
      task: 'Choisir le fournisseur', intention: ['decision'], activeAgents: AGENTS, challengerEnabled: false, delegation: {},
    } })).body.session.id;
    // Pas de mot glissé hors d'une réunion tenue par le bras droit
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid2}/whisper`, { token: owner.token, body: { text: 'x' } })).status).toBe(409);
    const seen = [];
    h.ai.responder = async p => {
      if (p.model === ORCHESTRATOR_MODEL) return { text: JSON.stringify({ agentIndex: 1, reason: 'Avancer', shouldClose: false }) };
      if (sysText(p).includes('tu lui rends compte')) return { text: 'Vous avez repris la main ; le fournisseur reste à choisir.' };
      seen.push(sysText(p));
      await new Promise(r => setTimeout(r, 150));
      return { text: 'Je compare les fournisseurs.' };
    };
    const ac = new AbortController();
    const res = await fetch(`${h.base}/api/projects/${pid}/sessions/${sid2}/chat`, { method: 'POST', signal: ac.signal, headers: { Authorization: `Bearer ${owner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: '', resume: true, delegate: true }) });
    await res.body.getReader().read();
    ac.abort(); // l'humain suit en retrait (ou ferme la page) : la réunion continue
    const w = await h.request('POST', `/api/projects/${pid}/sessions/${sid2}/whisper`, { token: owner.token, body: { text: 'Privilégiez un fournisseur local.' } });
    expect(w.status).toBe(200);
    expect(w.body.message).toMatchObject({ role: 'human', type: 'whisper' });
    // L'agent suivant lit le mot glissé
    const end = Date.now() + 8000;
    while (!seen.some(t => t.includes('mot glissé au bras droit — tenez-en compte) : Privilégiez un fournisseur local.')) && Date.now() < end) await new Promise(r => setTimeout(r, 100));
    expect(seen.some(t => t.includes('Privilégiez un fournisseur local.'))).toBe(true);
    // Reprendre la main : la réunion s'arrête, note de retour « reprise en main »
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${sid2}/prepare/stop`, { token: owner.token })).body.stopped).toBe(true);
    let s;
    for (let i = 0; i < 80; i++) { s = (await h.request('GET', `/api/projects/${pid}/sessions/${sid2}`, { token: owner.token })).body; if (s.delegation.status === 'stopped') break; await new Promise(r => setTimeout(r, 100)); }
    expect(s.delegation).toMatchObject({ status: 'stopped', note: { takenOver: true } });
    expect(s.prepRunning).toBe(false);
    const thread = (await h.request('GET', `/api/projects/${pid}/assistant`, { token: owner.token })).body.messages;
    expect(thread.at(-1).proposal).toMatchObject({ kind: 'delegation_report', sessionId: sid2, takenOver: true });
  });

  it('une réunion non confiée ne peut pas être tenue par le bras droit', async () => {
    const other = (await h.request('POST', `/api/projects/${pid}/sessions`, { token: owner.token, body: { task: 'Autre', intention: ['decision'], activeAgents: AGENTS } })).body.session.id;
    expect((await h.request('POST', `/api/projects/${pid}/sessions/${other}/chat`, { token: owner.token, body: { message: '', resume: true, delegate: true } })).status).toBe(400);
  });
});
