import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// Ordre du jour (décisions remises en question à retraiter) dans les prompts
const require = createRequire(import.meta.url);
const { buildExtractionPrompt, sanitizeDecision } = require('../decisions');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');
const { formatAgendaForPrompt } = require('../agenda');

const ID = '0f8b1c2d-1111-2222-3333-444455556666';

describe('ordre du jour dans les prompts', () => {
  const agendaText = formatAgendaForPrompt([{ id: ID, statement: 'Public cible : les curieux en questionnement relationnel', reopenNote: 'Les passionnés viendront aussi' }]);
  it('agents : un point à la fois, avec le motif de l’humain', () => {
    const shared = buildAgentSystemPrompt({ agent: { name: 'Léa', role: 'Marketing', systemPrompt: '' }, session: { task: 'T' }, intention: ['decision'], activeAgents: [], project: { name: 'P', brief: 'b' }, agendaText })
      .find(b => b.cache_control).text;
    expect(shared).toContain('ORDRE DU JOUR DE CETTE RÉUNION');
    expect(shared).toContain('motif de l\'humain : Les passionnés viendront aussi');
    expect(shared).toContain('UN point à la fois');
  });
  it('extraction : « replaces » pour une décision qui retraite un point ; sinon rien', () => {
    expect(buildExtractionPrompt({ task: 'T', historyText: '…', agendaText }).user).toContain('"replaces": "<id du point>"');
    expect(buildExtractionPrompt({ task: 'T', historyText: '…' }).user).not.toContain('replaces');
    expect(sanitizeDecision({ statement: 'S', replaces: ID }).replaces).toBe(ID);
    expect(sanitizeDecision({ statement: 'S', replaces: 'n’importe quoi' }).replaces).toBeNull();
  });
});


describe('titre et objectif d’une réunion « Retraiter »', () => {
  const { shortLabel, objectiveOf } = require('../agenda');
  it('titre court, coupé à la première proposition ou à la fin d’un mot', () => {
    expect(shortLabel('Le public cible prioritaire est celui des curieux en questionnement relationnel — personnes cherchant « compatibilité » après une rencontre')).toBe('Le public cible prioritaire est celui des curieux en questionnement relationnel');
    // Coupé après un mot entier (« de »), jamais au milieu d'un mot
    expect(shortLabel('Le site propose gratuitement le profil complet, le test aveugle et la compatibilité de base avec un ami ou un partenaire, sans compte'))
      .toBe('Le site propose gratuitement le profil complet, le test aveugle et la compatibilité de…');
    expect(shortLabel('Couleurs sobres')).toBe('Couleurs sobres');
  });
  it('objectif : la décision complète et le motif', () => {
    expect(objectiveOf({ statement: 'Public : les curieux — longue précision', reopenNote: 'Les passionnés aussi' }))
      .toBe('Retraiter la décision remise en question : « Public : les curieux — longue précision ». Motif : Les passionnés aussi');
  });
});

describe('réunion ouverte depuis une action', () => {
  it('section dédiée dans le bloc commun des agents', () => {
    const shared = buildAgentSystemPrompt({ agent: { name: 'Léa', role: 'R', systemPrompt: '' }, session: { task: 'T' }, intention: ['decision'], activeAgents: [], project: { name: 'P', brief: 'b' },
      actionText: '« Rédiger la page Méthode »\nRAPPORT DE LA MISSION…' }).find(b => b.cache_control).text;
    expect(shared).toContain('ACTION À TRAITER DANS CETTE RÉUNION');
    expect(shared).toContain('cochée « faite » à la conclusion');
    expect(shared).toContain('RAPPORT DE LA MISSION');
  });
});
