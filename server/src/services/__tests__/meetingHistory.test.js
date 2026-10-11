import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Les agents voient toute la réunion, avec un historique compatible avec le cache
const require = createRequire(import.meta.url);
const { meetingHistory, withHistory, HISTORY_WINDOW, HISTORY_STEP } = require('../prompts/meetingHistory');

const msg = (i, extra = {}) => ({ role: i % 3 === 0 ? 'human' : 'agent', agentName: `Agent${i}`, content: `Message ${i}`, ...extra });

describe('historique de la réunion pour les agents', () => {
  it('toute la réunion (et non plus les 10 derniers messages), dans l’ordre', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => msg(i));
    const { blocks, omitted } = meetingHistory(msgs);
    expect(omitted).toBe(0);
    expect(blocks).toHaveLength(41); // en-tête + 40 messages
    expect(blocks[1].text).toBe('Participant : Message 0');
    expect(blocks[2].text).toBe('Agent1 : Message 1');
    expect(blocks.at(-1)).toMatchObject({ text: 'Participant : Message 39', cache_control: { type: 'ephemeral' } });
    expect(blocks.filter(b => b.cache_control)).toHaveLength(1);
  });

  it('cache : l’historique d’un tour est le début exact de celui du tour suivant', () => {
    const msgs = Array.from({ length: 25 }, (_, i) => msg(i));
    const a = meetingHistory(msgs).blocks.map(b => b.text);
    const b = meetingHistory([...msgs, msg(25), msg(26)]).blocks.map(x => x.text);
    expect(b.slice(0, a.length)).toEqual(a);
  });

  it('réponses aux cartes et synthèse de préparation gardées ; autres messages système écartés', () => {
    const { blocks } = meetingHistory([
      msg(1), { role: 'system', type: 'decision_answer', content: 'Décision : budget 25 000 €' },
      { role: 'system', type: 'prep_summary', content: 'Les agents proposent…' }, { role: 'system', type: 'info', content: 'Agent ajouté' },
    ]);
    expect(blocks.map(b => b.text)).toEqual([expect.stringMatching(/^HISTORIQUE/), 'Agent1 : Message 1', '[Décision : budget 25 000 €]', '[Synthèse de la préparation entre agents]\nLes agents proposent…']);
  });

  it('réunion très longue : les derniers messages, début avancé par paliers (stable entre deux paliers)', () => {
    const n = HISTORY_WINDOW + 5;
    const h1 = meetingHistory(Array.from({ length: n }, (_, i) => msg(i)));
    const h2 = meetingHistory(Array.from({ length: n + 3 }, (_, i) => msg(i)));
    expect(h1.omitted).toBe(HISTORY_STEP);
    expect(h2.omitted).toBe(HISTORY_STEP);
    expect(h1.blocks[0].text).toBe(h2.blocks[0].text);
    expect(h1.blocks[0].text).toContain(`les ${HISTORY_STEP} premiers messages`);
  });

  it('consignes : bloc commun, historique, puis bloc propre à l’agent ; rien en début de réunion', () => {
    const sys = [{ type: 'text', text: 'commun', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'tour' }];
    const h = meetingHistory([msg(1)]);
    expect(withHistory(sys, h).map(b => b.text)).toEqual(['commun', expect.stringMatching(/^HISTORIQUE/), 'Agent1 : Message 1', 'tour']);
    expect(withHistory(sys, meetingHistory([]))).toBe(sys);
  });
});
