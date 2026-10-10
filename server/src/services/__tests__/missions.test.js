import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseAgentOutput } = require('../markers');
const { formatMissionsForPrompt, DEFAULT_BUDGET } = require('../missions');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

describe('missions des agents', () => {
  it('marqueur [MISSION:…] lu puis retiré du texte affiché', () => {
    const r = parseAgentOutput('Il faut creuser.\n[NEXT]\nJe propose une mission.\n[MISSION:{"title":"Comparer les loyers","objective":"Relever 5 locaux","deliverable":"Tableau","kind":"analysis"}]');
    expect(r.mission).toEqual({ title: 'Comparer les loyers', objective: 'Relever 5 locaux', deliverable: 'Tableau', kind: 'analysis' });
    expect(r.bubbles).toEqual(['Il faut creuser.', 'Je propose une mission.']);
  });

  it('marqueur invalide : ignoré mais retiré ; nature inconnue → recherche', () => {
    expect(parseAgentOutput('Texte [MISSION:{"title":"x"}]').mission).toBeNull();
    expect(parseAgentOutput('Texte [MISSION:{"title":"x"}]').content).toBe('Texte');
    expect(parseAgentOutput('[MISSION:{"title":"x","objective":"y","kind":"code"}]').mission.kind).toBe('research');
  });

  it('plafonds par défaut selon la nature', () => {
    expect(DEFAULT_BUDGET).toEqual({ research: 0.6, analysis: 0.4, writing: 0.3 });
  });

  it('texte pour les agents : missions utiles seulement, rapport cité', () => {
    const text = formatMissionsForPrompt([
      { status: 'done', title: 'Loyers', agentName: 'Max' },
      { status: 'running', title: 'Aides', agentName: 'Léa' },
      { status: 'rejected', title: 'Écartée', agentName: 'Léa' },
    ]);
    expect(text).toContain('[terminée] Loyers (Max) — rapport dans les documents : « Mission — Loyers »');
    expect(text).toContain('[en cours] Aides');
    expect(text).not.toContain('Écartée');
  });

  it('consigne et état des missions dans le bloc commun (mis en cache)', () => {
    const agent = { name: 'Léa', role: 'r' };
    const [shared, turn] = buildAgentSystemPrompt({ agent, project: {}, session: { task: 'T' }, activeAgents: [agent], missionsText: '- [en cours] Aides (Léa)' });
    expect(shared.text).toContain('[MISSION:{');
    expect(shared.text).toContain('[en cours] Aides');
    expect(turn.text).not.toContain('[en cours] Aides');
  });
});
