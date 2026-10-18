import { describe, it, expect } from 'vitest';
import { meetingState, openCards } from '../meetingState.js';
import { buildOrchestratorPrompt } from '../prompts/orchestratorPrompt.js';

// v5.1 (18/10/2026, constats sur « WorldOfMetal ») : la réunion dit toujours ce qui suit
const agent = (t = 'Idée.') => ({ role: 'agent', agentName: 'Léa', content: t, type: 'message' });
const card = (status = 'pending') => ({ role: 'system', type: 'decision', id: `c-${status}`, question: 'Quelle police ?', status });
const answer = { role: 'system', type: 'decision_answer', content: 'Décision : …' };
const close = { role: 'system', type: 'close_suggestion', content: 'Objectif atteint.' };

describe('état d’une réunion', () => {
  it('vide, puis en pause', () => {
    expect(meetingState([]).state).toBe('empty');
    expect(meetingState([agent()]).state).toBe('idle');
  });

  it('une question ouverte prime, même si les agents proposent de conclure', () => {
    const st = meetingState([agent(), card(), agent(), close]);
    expect(st).toMatchObject({ state: 'question', pendingCount: 1, closeSuggested: true });
    expect(openCards([card('deferred'), card('awaiting_human'), card('answered'), card('delegated')])).toHaveLength(2); // reportée et confiée à quelqu'un restent ouvertes
  });

  it('réponses prêtes tant que les agents n’ont pas repris', () => {
    expect(meetingState([agent(), card('answered'), answer]).state).toBe('answers_ready');
    expect(meetingState([agent(), card('answered'), answer, agent()]).state).toBe('idle');
  });

  it('prête à conclure, jusqu’à ce que l’humain relance', () => {
    expect(meetingState([agent(), close])).toMatchObject({ state: 'ready_to_close', closeReason: 'Objectif atteint.' });
    expect(meetingState([agent(), close, { role: 'human', content: 'Encore une chose' }]).state).toBe('idle');
  });
});

describe('orchestrateur : seul l’humain conclut', () => {
  const p = (openQuestions = 0) => buildOrchestratorPrompt({ session: { task: 'Choisir le style', intention: ['decision'] }, agentsForSelection: [{ name: 'Léa', role: 'Design' }], turnCount: 4, openQuestions });
  it('jamais « on clôt » ; une question ouverte est rappelée', () => {
    expect(p()).toContain('Ne dis JAMAIS que la réunion est close');
    expect(p()).not.toContain('attend la réponse de l\'humain');
    expect(p(1)).toContain('1 question attend la réponse de l\'humain');
    expect(p(2)).toContain('2 questions attendent la réponse de l\'humain');
  });
});

describe('point de vigilance écarté (retour du 18/10)', () => {
  it('ne relance rien : la réunion reste prête à conclure', () => {
    const dismissed = { role: 'system', type: 'decision_answer', kind: 'vigilance_dismissed', content: 'Point écarté' };
    expect(meetingState([agent(), close, dismissed]).state).toBe('ready_to_close');
    expect(meetingState([agent(), close, { ...dismissed, kind: undefined }]).state).toBe('answers_ready');
  });
});
