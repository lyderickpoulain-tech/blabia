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

  it('actions proposées : nettoyées, sans doublon, limitées à 8', () => {
    const raw = { actions: [
      { title: 'Visiter trois locaux', detail: 'Croix-Rousse', dueInDays: 14 },
      { title: 'visiter trois locaux', dueInDays: 3 },
      { title: '   ' },
      ...Array.from({ length: 10 }, (_, i) => ({ title: `Action ${i}` })),
    ] };
    const out = parseActions(raw, FROM);
    expect(out[0]).toEqual({ title: 'Visiter trois locaux', description: 'Croix-Rousse', dueDate: '2026-10-24' });
    expect(out).toHaveLength(8);
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
