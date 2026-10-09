import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { prepTurnsFor, parsePrepSynthesis, buildPrepSynthesisPrompt } = require('../prompts/preparationPrompt');

describe('préparation de réunion sans l\'humain', () => {
  it('2 tours par agent, entre 4 et 8', () => {
    expect(prepTurnsFor(2)).toBe(4);
    expect(prepTurnsFor(3)).toBe(6);
    expect(prepTurnsFor(6)).toBe(8);
  });

  it('nettoie la synthèse : plafond de décisions, choix « Autre » ajouté, entrées vides ignorées', () => {
    const json = JSON.stringify({
      summary: '## Ce que les agents proposent\nLancer en mars.',
      decisions: [
        { question: 'Quel budget ?', choices: ['500 €', '1 000 €'], context: 'Fixe le périmètre' },
        { question: '   ' },
        { question: 'Quelle date ?', choices: ['Mars', 'Avril', 'Autre (précise)'] },
        { question: 'Quel nom ?', choices: ['A'] },
      ],
    });
    const { summary, decisions } = parsePrepSynthesis('```json\n' + json + '\n```', 2);
    expect(summary).toContain('Lancer en mars');
    expect(decisions.map(d => d.question)).toEqual(['Quel budget ?', 'Quelle date ?']);
    expect(decisions[0].choices).toEqual(['500 €', '1 000 €', 'Autre (précise)']);
    expect(decisions[1].choices).toEqual(['Mars', 'Avril', 'Autre (précise)']);
  });

  it('budget épuisé : aucune décision demandée', () => {
    const p = buildPrepSynthesisPrompt({ task: 't', transcript: 'x', registryText: '', maxDecisions: 0 });
    expect(p.max).toBe(0);
    expect(p.user).toContain('liste VIDE');
    expect(parsePrepSynthesis(JSON.stringify({ summary: 's', decisions: [{ question: 'Q ?' }] }), p.max).decisions).toEqual([]);
  });

  it('réponse illisible : synthèse vide, pas de plantage', () => {
    expect(parsePrepSynthesis('rien', 3)).toEqual({ summary: '', decisions: [] });
  });
});
