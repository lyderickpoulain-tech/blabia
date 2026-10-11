import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Migration vers les modèles Claude 5 (11/10/2026) : réglage centralisé de chaque appel
const require = createRequire(import.meta.url);
const { adaptForModel, textOf } = require('../anthropic');
const { DEFAULT_MODEL, MEETING_MODELS, ORCHESTRATOR_MODEL, ORCHESTRATOR_PARAMS, currentModel } = require('../models');
const { LEVELS } = require('../missions');
const { pricesFor } = require('../pricing');

describe('migration Claude 5', () => {
  it('modèles : Sonnet 5.5 par défaut, Opus 5.5 au choix, orchestrateur Haiku inchangé', () => {
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5');
    expect(MEETING_MODELS.map(m => m.id)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5']);
    expect(ORCHESTRATOR_MODEL).toBe('claude-haiku-5-5');
    expect(LEVELS.deep.model).toBe('claude-opus-5-5');
    expect(pricesFor('claude-sonnet-5-5')).toMatchObject({ input: 2, output: 10, cacheRead: 0.2 });
  });

  it('réunions créées avant la migration : leur modèle est remplacé par son successeur', () => {
    expect(currentModel('claude-opus-4-8')).toBe('claude-opus-5-5');
    expect(currentModel('claude-sonnet-4-6')).toBe('claude-sonnet-5-5');
    expect(adaptForModel({ model: 'claude-opus-4-8', max_tokens: 600 }).model).toBe('claude-opus-5-5');
  });

  it('Claude 5 : effort faible par défaut, marge de réflexion, bascule en cas de refus', () => {
    const p = adaptForModel({ model: 'claude-sonnet-5-5', max_tokens: 600, messages: [] });
    expect(p).toMatchObject({ max_tokens: 2600, output_config: { effort: 'low' }, fallbacks: 'default' });
    // Effort choisi par l'appelant respecté (prompt Claude Code : « medium »)
    expect(adaptForModel({ model: 'claude-sonnet-5-5', max_tokens: 12000, output_config: { effort: 'medium' } }).output_config.effort).toBe('medium');
    // Réflexion « désactivée » refusée par ces modèles : retirée
    expect(adaptForModel({ model: 'claude-opus-5-5', max_tokens: 100, thinking: { type: 'disabled' } }).thinking).toBeUndefined();
    // Préchauffage du cache (max_tokens 0) : ni marge ni bascule
    expect(adaptForModel({ model: 'claude-sonnet-5-5', max_tokens: 0 })).toMatchObject({ max_tokens: 0 });
    expect(adaptForModel({ model: 'claude-sonnet-5-5', max_tokens: 0 }).fallbacks).toBeUndefined();
  });

  it('orchestrateur Haiku : réglages inchangés (réflexion désactivée, pas de marge)', () => {
    const p = adaptForModel({ model: ORCHESTRATOR_MODEL, max_tokens: 150, ...ORCHESTRATOR_PARAMS });
    expect(p).toEqual({ model: ORCHESTRATOR_MODEL, max_tokens: 150, thinking: { type: 'disabled' } });
  });

  it('texte d’une réponse : seulement les blocs « text » (la réflexion peut venir en premier)', () => {
    expect(textOf({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Bonjour' }, { type: 'text', text: ' !' }] })).toBe('Bonjour !');
    expect(textOf({ content: [] })).toBe('');
  });
});
