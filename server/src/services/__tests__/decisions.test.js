import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseExtraction, formatRegistryForPrompt, decisionCardsText } = require('../decisions');

describe('registre des décisions', () => {
  it('nettoie l\'extraction : doublons, entrées vides, origine inconnue', () => {
    const out = parseExtraction('```json\n{"decisions":[' +
      '{"statement":"Lancement en mars","rationale":"Salon","rejectedOptions":["Avril",""],"origin":"human"},' +
      '{"statement":"lancement en mars","origin":"human"},' +
      '{"statement":"  ","origin":"human"},' +
      '{"statement":"Hébergement sur Railway","origin":"inconnue"}' +
      ']}\n```');
    expect(out).toEqual([
      { statement: 'Lancement en mars', rationale: 'Salon', rejectedOptions: ['Avril'], origin: 'human' },
      { statement: 'Hébergement sur Railway', rationale: null, rejectedOptions: [], origin: 'human' },
    ]);
  });

  it('renvoie une liste vide si la réponse est illisible', () => {
    expect(parseExtraction('pas de JSON ici')).toEqual([]);
    expect(parseExtraction('{"decisions": [}')).toEqual([]);
  });

  it('sépare décisions actives et remises en question, ignore les remplacées', () => {
    const { activeText, reopenedText } = formatRegistryForPrompt([
      { statement: 'A', status: 'active', origin: 'human' },
      { statement: 'B', status: 'active', origin: 'agents' },
      { statement: 'C', status: 'reopened', reopenNote: 'trop cher' },
      { statement: 'D', status: 'superseded' },
    ]);
    expect(activeText).toBe('- A\n- B (hypothèse validée tacitement)');
    expect(reopenedText).toBe("- C — motif de l'humain : trop cher");
  });

  it('inclut les réponses de l\'humain aux cartes (absentes de la transcription)', () => {
    const txt = decisionCardsText([
      { type: 'decision', question: 'Quelle date ?', agentName: 'Léa', status: 'answered', answer: 'Mars' },
      { type: 'decision', question: 'Quel budget ?', agentName: 'Max', status: 'delegated' },
      { type: 'message', content: 'ignoré' },
    ]);
    expect(txt).toContain('Quelle date ? (posée par Léa) → réponse de l\'humain : « Mars »');
    expect(txt).toContain('délégué');
    expect(txt).not.toContain('ignoré');
  });
});
