import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { recentMemory } = require('../../utils/projectMemory');

describe('mémoire projet transmise aux agents', () => {
  const ctx = ['[SESSION:1] Réunion 1 : choix de React', '[SESSION:2] Réunion 2 : budget 50 €', '[SESSION:3] Réunion 3 : lancement en mars'].join('\n---\n');

  it('garde les réunions les plus récentes, pas la première', () => {
    const m = recentMemory(ctx, 90);
    expect(m).toContain('Réunion 3');
    expect(m).toContain('Réunion 2');
    expect(m).not.toContain('Réunion 1');
  });

  it('tronque par la fin une entrée récente trop longue', () => {
    const m = recentMemory(`ancienne\n---\n${'x'.repeat(50)}FIN`, 20);
    expect(m.endsWith('FIN')).toBe(true);
    expect(m.length).toBeLessThanOrEqual(20);
  });

  it('renvoie tout si ça tient, et rien si vide', () => {
    expect(recentMemory(ctx, 10000)).toBe(ctx);
    expect(recentMemory(null)).toBe('');
  });
});
