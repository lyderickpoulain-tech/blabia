import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { dueDateFrom, parseActions, formatActionsForPrompt, isOverdue } = require('../actions');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

const FROM = new Date('2026-10-10T12:00:00Z');

describe('actions entre les réunions', () => {
  it('échéance relative → date', () => {
    expect(dueDateFrom(7, FROM)).toBe('2026-10-17');
    expect(dueDateFrom(null, FROM)).toBeNull();
    expect(dueDateFrom(-2, FROM)).toBeNull();
    expect(dueDateFrom(1000, FROM)).toBeNull();
  });

  it('actions proposées : nettoyées, sans doublon, limitées à 5 (les plus importantes)', () => {
    const raw = { actions: [
      { title: 'Visiter trois locaux', detail: 'Croix-Rousse', dueInDays: 14, beforeMeeting: 'r3' },
      { title: 'visiter trois locaux', dueInDays: 3 },
      { title: '   ' },
      ...Array.from({ length: 10 }, (_, i) => ({ title: `Action ${i}` })),
    ] };
    const out = parseActions(raw, FROM);
    // beforeRef : réunion du plan avant laquelle l'action doit être faite (repère R…)
    expect(out[0]).toEqual({ title: 'Visiter trois locaux', description: 'Croix-Rousse', dueDate: '2026-10-24', beforeRef: 'R3', beforeMilestoneId: null });
    expect(out[1].beforeRef).toBeNull();
    expect(out).toHaveLength(5);
    expect(parseActions(null)).toEqual([]);
  });

  it('texte pour les agents : en retard, à faire, fait', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const text = formatActionsForPrompt([
      { title: 'Visiter les locaux', status: 'todo', dueDate: '2026-10-05' },
      { title: 'Appeler la banque', status: 'todo', dueDate: '2026-10-20' },
      { title: 'Lister les fournisseurs', status: 'done', dueDate: null },
    ], now);
    expect(text).toContain('1. [EN RETARD, prévue le 5 oct.] Visiter les locaux');
    expect(text).toContain('2. [à faire, pour le 20 oct.] Appeler la banque');
    expect(text).toContain('[fait] Lister les fournisseurs');
    expect(isOverdue({ status: 'done', dueDate: '2026-10-01' }, now)).toBe(false);
  });

  it('les actions vont dans le bloc commun du prompt (mis en cache)', () => {
    const agent = { name: 'Léa', role: 'Stratège' };
    const [shared, turn] = buildAgentSystemPrompt({
      agent, project: {}, session: { task: 'T' }, activeAgents: [agent],
      actionsText: '- [à faire] Appeler la banque', today: '10/10/2026',
    });
    expect(shared.text).toContain('Appeler la banque');
    expect(shared.text).toContain('POINT D\'AVANCEMENT');
    expect(turn.text).not.toContain('Appeler la banque');
  });
});

describe('actions déjà suivies revues à la conclusion', () => {
  const { parseActionChanges } = require('../actions');
  const ACTIONS = [
    { id: 'a1', title: 'Rédiger la page Méthode', description: null, status: 'todo' },
    { id: 'f1', title: 'Lister les fournisseurs', status: 'done' },
    { id: 'a2', title: 'Contacter un avocat', description: 'Droit à l’image', status: 'in_progress' },
  ];
  it('repères A1, A2… sur les actions à faire, avec leur précision', () => {
    const text = formatActionsForPrompt(ACTIONS);
    expect(text).toContain('A1. [à faire] Rédiger la page Méthode');
    expect(text).toContain('A2. [à faire] Contacter un avocat — Droit à l’image');
    expect(text).toContain('- [fait] Lister les fournisseurs');
  });
  it('repères rapprochés des actions ; changement vide, repère inconnu ou doublon écartés', () => {
    const changes = parseActionChanges({ actionChanges: [
      { ref: 'A1', kind: 'update', title: '', detail: 'Ton pédagogique, 600 mots', reason: 'Précisé par Léa' },
      { ref: 'A2', kind: 'cancel', reason: 'Démo célébrités abandonnée' },
      { ref: 'A2', kind: 'done' },                          // doublon
      { ref: 'A7', kind: 'done' },                          // inconnue
      { ref: 'A1', kind: 'update', title: '', detail: '' }, // rien ne change
      { ref: 'A1', kind: 'supprimer' },                     // type inconnu
    ] }, ACTIONS);
    expect(changes).toEqual([
      { id: 'a1', kind: 'update', currentTitle: 'Rédiger la page Méthode', currentDescription: null, title: 'Rédiger la page Méthode', description: 'Ton pédagogique, 600 mots', reason: 'Précisé par Léa' },
      { id: 'a2', kind: 'cancel', currentTitle: 'Contacter un avocat', currentDescription: 'Droit à l’image', reason: 'Démo célébrités abandonnée' },
    ]);
  });
});
