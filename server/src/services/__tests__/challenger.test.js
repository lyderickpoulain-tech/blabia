import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { challengerAvailable, challengesLeft, priorVigilanceText, CHALLENGER, MAX_CHALLENGES } = require('../challenger');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');
const { buildChallengerTurnSection } = require('../challenger');

const agentMsg = (agentName, extra = {}) => ({ role: 'agent', agentName, content: 'x', ...extra });
const vig = status => agentMsg(CHALLENGER.name, { content: '**Point de vigilance** : bail', vigilance: { status, target: 'Signer un bail de 9 ans' } });

describe('contradicteur', () => {
  it('plafond de 2 interventions par réunion', () => {
    expect(MAX_CHALLENGES).toBe(2);
    expect(challengesLeft([vig('open')])).toBe(1);
    expect(challengerAvailable({ enabled: true, messages: [vig('accepted'), agentMsg('Léa'), vig('dismissed'), agentMsg('Max')] })).toBe(false);
  });

  it('désactivé, en préparation, ou juste après sa propre intervention : indisponible', () => {
    expect(challengerAvailable({ enabled: false, messages: [] })).toBe(false);
    expect(challengerAvailable({ enabled: true, messages: [], preparing: true })).toBe(false);
    expect(challengerAvailable({ enabled: true, messages: [vig('open')] })).toBe(false);
    expect(challengerAvailable({ enabled: true, messages: [vig('open'), agentMsg('Léa')] })).toBe(true);
  });

  it('points déjà soulevés, avec leur statut (un point écarté est clos)', () => {
    expect(priorVigilanceText([vig('dismissed')])).toContain('ÉCARTÉ');
  });

  it('sa consigne va dans le bloc du tour : le bloc commun reste identique (cache)', () => {
    const base = { project: {}, session: { task: 'T' }, activeAgents: [{ name: 'Léa', role: 'r' }] };
    const normal = buildAgentSystemPrompt({ ...base, agent: { name: 'Léa', role: 'r' } });
    const challenge = buildAgentSystemPrompt({ ...base, agent: CHALLENGER, challengerSection: buildChallengerTurnSection({ target: 'Bail 9 ans', priorText: '' }) });
    expect(challenge[0].text).toBe(normal[0].text);
    expect(challenge[1].text).toContain('Point de vigilance');
    expect(challenge[1].text).toContain('Bail 9 ans');
  });
});
