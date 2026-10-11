import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Mission réussie → mémoire du projet : synthèse et recommandation du rapport
const require = createRequire(import.meta.url);
const { missionDigest, appendEntry } = require('../../utils/projectMemory');

describe('mémoire du projet : missions', () => {
  it('garde la synthèse et la recommandation, sans le reste du rapport', () => {
    const report = '# Démo célébrités\n## Synthèse\nRisque faible.\n## Résultats\nDétails longs…\n## Recommandation\nAjouter une mention.\n## Limites et points à vérifier\nAvis d’un avocat.';
    expect(missionDigest(report)).toBe('Risque faible.\nAjouter une mention.');
  });

  it('sans ces titres : le début du rapport, 1 500 caractères au plus', () => {
    expect(missionDigest('# Titre\nTexte libre.')).toBe('Texte libre.');
    const long = missionDigest(`# T\n${'x'.repeat(3000)}`);
    expect(long).toHaveLength(1500);
    expect(long.endsWith('…')).toBe(true);
  });

  it('ajout en fin de mémoire, les plus anciennes entrées sortent au-delà de 10 000 caractères', () => {
    expect(appendEntry('', 'A')).toBe('A');
    expect(appendEntry('A', 'B')).toBe('A\n---\nB');
    const full = appendEntry(['x'.repeat(6000), 'y'.repeat(3000)].join('\n---\n'), 'z'.repeat(2000));
    expect(full.startsWith('y')).toBe(true);
    expect(full.endsWith('z')).toBe(true);
  });
});
