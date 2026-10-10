import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

const agents = [
  { id: 'a1', name: 'Léa', role: 'Stratège', systemPrompt: 'Tu es Léa, stratège.' },
  { id: 'a2', name: 'Max', role: 'Critique', systemPrompt: 'Tu es Max, critique.' },
];
const base = {
  project: { brief: 'OBJECTIF : ouvrir un salon de thé.', context: '[01/10/2026 — Concept]\nSalon cosy.' },
  session: { task: 'Choisir l’emplacement' },
  intention: ['decision'],
  activeAgents: agents,
  decisionRegistry: { activeText: '- Public : actifs du quartier', reopenedText: '' },
};

describe('prompt agent : mise en cache', () => {
  it('rend deux blocs, le premier marqué pour le cache', () => {
    const blocks = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it('bloc commun identique quel que soit l’agent et ce qui varie d’un tour à l’autre', () => {
    const t1 = buildAgentSystemPrompt({ ...base, agent: agents[0], reason: 'Ouvre le débat', decisionBudget: { used: 0, max: 8 } });
    const t2 = buildAgentSystemPrompt({
      ...base, agent: agents[1], reason: 'Répond à Léa', decisionBudget: { used: 3, max: 8 },
      priorDecisionQuestions: ['- "Quel quartier ?" (Léa)'], artifactRequest: 'un plan du local',
      preparationSection: '\nPRÉPARATION\n',
    });
    expect(t2[0].text).toBe(t1[0].text);
  });

  it('ce qui varie est dans le bloc du tour, pas dans le bloc commun', () => {
    const [shared, turn] = buildAgentSystemPrompt({
      ...base, agent: agents[1], reason: 'Répond à Léa', decisionBudget: { used: 3, max: 8 },
      priorDecisionQuestions: ['- "Quel quartier ?" (Léa)'], artifactRequest: 'un plan du local',
    });
    for (const dynamic of ['Max', 'Répond à Léa', 'il reste 5 cartes', 'Quel quartier ?', 'un plan du local']) {
      expect(shared.text).not.toContain(dynamic === 'Max' ? 'tu es Max' : dynamic);
      expect(turn.text).toContain(dynamic);
    }
  });

  it('le projet (brief, mémoire, registre) est dans le bloc commun', () => {
    const [shared] = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(shared.text).toContain('ouvrir un salon de thé');
    expect(shared.text).toContain('Salon cosy');
    expect(shared.text).toContain('actifs du quartier');
  });

  it('réunion outils : les outils déjà proposés sortent du bloc commun', () => {
    const toolReview = { toolCategories: [{ id: 'pos', label: 'Caisse', technical: 'POS' }], userToolsText: '', toolSuggestionsText: '- SumUp' };
    const [shared, turn] = buildAgentSystemPrompt({ ...base, intention: ['stack'], agent: agents[0], toolReview });
    expect(shared.text).toContain('GRILLE DES CATÉGORIES');
    expect(shared.text).not.toContain('SumUp');
    expect(turn.text).toContain('SumUp');
  });

  it('bloc commun assez long pour être mis en cache (≥ 1 024 tokens, ~4 caractères/token)', () => {
    const [shared] = buildAgentSystemPrompt({ ...base, agent: agents[0] });
    expect(shared.text.length / 4).toBeGreaterThan(1024);
  });
});
