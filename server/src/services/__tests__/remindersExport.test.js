import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parisParts, isDue, buildDigestHtml, SEND_HOUR } = require('../reminders');
const { markdownToDocx, sessionDocx, registryDocx } = require('../exporters');

// Lundi 12 octobre 2026, 9 h à Paris (7 h UTC, heure d'été)
const MONDAY_9H = new Date('2026-10-12T07:00:00Z');

describe('rappels hebdomadaires', () => {
  it('jour et heure de Paris', () => {
    expect(parisParts(MONDAY_9H)).toEqual({ isoDay: 1, hour: 9, dateKey: '2026-10-12' });
    expect(parisParts(new Date('2026-10-11T22:30:00Z')).isoDay).toBe(1); // dimanche 22 h 30 UTC = lundi 0 h 30 à Paris
  });

  it('envoyé le jour choisi, après l’heure d’envoi, une seule fois', () => {
    expect(isDue({ reminderDay: 1, remindersLastSentAt: null }, MONDAY_9H)).toBe(true);
    expect(isDue({ reminderDay: 3, remindersLastSentAt: null }, MONDAY_9H)).toBe(false);
    expect(isDue({ reminderDay: 1, remindersLastSentAt: '2026-10-12T06:30:00Z' }, MONDAY_9H)).toBe(false);
    expect(isDue({ reminderDay: 1, remindersLastSentAt: '2026-10-05T07:00:00Z' }, MONDAY_9H)).toBe(true);
    expect(isDue({ reminderDay: 1 }, new Date(`2026-10-12T0${SEND_HOUR - 3}:00:00Z`))).toBe(false); // trop tôt
  });

  it('e-mail : retards, semaine, suite ; texte échappé ; lien de désactivation', () => {
    const html = buildDigestHtml([{
      project: { id: 'p1', name: 'Salon <b>thé</b>' },
      overdue: [{ title: 'Voir la banque', dueDate: '2026-10-01' }],
      upcoming: [{ title: 'Visiter le local', dueDate: '2026-10-14' }],
      next: [{ title: 'Choisir le nom' }], openCount: 3,
    }], 'https://app');
    expect(html).toContain('Salon &lt;b&gt;thé&lt;/b&gt;');
    expect(html).toContain('En retard');
    expect(html).toContain('Cette semaine');
    expect(html).toContain('https://app/projects/p1/parametres');
  });
});

describe('export Word', () => {
  it('Markdown → paragraphes (titres, listes, tableau)', () => {
    const out = markdownToDocx('## Décisions\n- **Bail** signé\n- Ouverture\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nTexte libre');
    expect(out.length).toBe(6); // titre, 2 puces, tableau + paragraphe vide, texte
  });

  it('produit de vrais fichiers .docx', async () => {
    const project = { name: 'Salon de thé' };
    const doc1 = await sessionDocx({ project, session: { task: 'Choisir le local', createdAt: new Date(), intention: '["decision"]', summary: '## Décisions\n- Croix-Rousse' } });
    const doc2 = await registryDocx({ project,
      decisions: [{ statement: 'Croix-Rousse', status: 'active', origin: 'human', createdAt: new Date(), rejectedOptions: ['Presqu’île'] }],
      actions: [{ title: 'Voir la banque', status: 'todo', dueDate: '2026-10-01' }, { title: 'Lister les fournisseurs', status: 'done' }] });
    for (const b of [doc1, doc2]) {
      expect(b.slice(0, 2).toString()).toBe('PK'); // archive OOXML
      expect(b.length).toBeGreaterThan(4000);
    }
  });
});
