import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { decisionBudgetFor, effectiveQuestionMode } = require('../questionModes');

describe('mode de questions', () => {
  it('la réunion surcharge le projet, le projet sert de défaut', () => {
    expect(decisionBudgetFor({ questionMode: 'delegate' }, { questionMode: 'control' })).toBe(4);
    expect(decisionBudgetFor({ questionMode: null }, { questionMode: 'control' })).toBe(15);
    expect(decisionBudgetFor({}, {})).toBe(8);
  });

  it('ignore une valeur inconnue', () => {
    expect(effectiveQuestionMode({ questionMode: 'nimporte' }, { questionMode: 'delegate' })).toBe('delegate');
    expect(effectiveQuestionMode({ questionMode: 'constructor' }, {})).toBe('balanced');
  });
});
