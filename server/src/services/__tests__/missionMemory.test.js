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

  it('ajout en fin de mémoire, sans jamais rien supprimer (la consolidation s’en charge)', () => {
    expect(appendEntry('', 'A')).toBe('A');
    expect(appendEntry('A', 'B')).toBe('A\n---\nB');
    const full = appendEntry(['x'.repeat(6000), 'y'.repeat(3000)].join('\n---\n'), 'z'.repeat(2000));
    expect(full.startsWith('x')).toBe(true);
    expect(full).toHaveLength(6000 + 3000 + 2000 + 10);
  });
});

describe('mémoire à deux étages', () => {
  const { splitForConsolidation, buildConsolidationPrompt, SECTIONS, RECENT_KEEP } = require('../memory');
  const { memoryForPrompt } = require('../../utils/projectMemory');

  it('fond les entrées les plus anciennes, garde les plus récentes telles quelles', () => {
    const entries = ['A'.repeat(2500), 'B'.repeat(2500), 'C'.repeat(1500), 'D'.repeat(1200)];
    const { fold, keep } = splitForConsolidation(entries.join('\n---\n'));
    expect(fold.map(e => e[0])).toEqual(['A', 'B']);
    expect(keep.map(e => e[0])).toEqual(['C', 'D']);
    expect(keep.join('').length).toBeLessThanOrEqual(RECENT_KEEP);
    // Une seule entrée très longue : gardée (rien à fondre)
    expect(splitForConsolidation('X'.repeat(9000)).fold).toEqual([]);
  });

  it('consigne de consolidation : rien perdu, sources, remplacements tracés, corrections de l’humain respectées', () => {
    const p = buildConsolidationPrompt({ summary: '## Contexte et objectifs\n- Site de numérologie (réunion 10/10)', entries: ['[SESSION:x | 11/10/2026 — Public]\nPublic : curieux'], editedByHuman: true }).user;
    for (const s of SECTIONS) expect(p).toContain(`## ${s}`);
    expect(p).toContain('Ne PERDS aucune information utile');
    expect(p).toContain('remplacé : ancien → nouveau');
    expect(p).toContain('sa source entre parenthèses');
    expect(p).toContain('L\'humain a corrigé lui-même cette synthèse');
    expect(p).toContain('Public : curieux');
  });

  it('les agents reçoivent la synthèse entière et les entrées récentes', () => {
    const text = memoryForPrompt({ memorySummary: '## Ce qui est établi\n- Budget 25 000 € (réunion 01/10)', context: 'x'.repeat(10000) });
    expect(text).toContain('SYNTHÈSE DU PROJET');
    expect(text).toContain('Budget 25 000 €');
    expect(text).toContain('DERNIÈRES ENTRÉES');
    expect(memoryForPrompt({})).toBe('');
  });
});

describe('niveaux de mission', () => {
  const { settingsFor } = require('../missionRunner');
  const { LEVELS } = require('../missions');
  it('légère / standard / approfondie : étapes, recherches, lectures, modèle', () => {
    const light = settingsFor({ level: 'light' });
    expect(light.maxSteps).toBe(5);
    expect(light.tools.find(t => t.name === 'web_search').max_uses).toBe(3);
    const deep = settingsFor({ level: 'deep' });
    expect(deep.model).toMatch(/opus/);
    expect(deep.tools.find(t => t.name === 'web_fetch').max_uses).toBe(10);
    expect(settingsFor({}).maxSteps).toBe(LEVELS.standard.maxSteps); // ancienne mission : standard
    expect(LEVELS.light.budget).toBeLessThan(LEVELS.standard.budget);
    expect(LEVELS.standard.budget).toBeLessThan(LEVELS.deep.budget);
  });
});
