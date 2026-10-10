import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractText, formatDocumentsForPrompt, PROMPT_TOTAL_CHARS } = require('../documents');
const { buildAgentSystemPrompt } = require('../prompts/agentPrompt');

// Vrai PDF (imprimé par Edge) : un devis avec accents et symbole €
const DEVIS_PDF = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'devis.pdf'));

describe('documents de référence', () => {
  it('extrait le texte d’un PDF, d’un fichier texte et d’un CSV', async () => {
    expect(await extractText({ buffer: DEVIS_PDF, originalname: 'devis.pdf' })).toContain('Montant total : 18 400 € HT. Délai d’exécution : 11 semaines');
    expect(await extractText({ buffer: Buffer.from('Ligne 1\n\n\n\nLigne 2  \n'), originalname: 'notes.txt' })).toBe('Ligne 1\n\nLigne 2');
    expect(await extractText({ buffer: Buffer.from('a;b\n1;2'), originalname: 'devis.csv' })).toBe('a;b\n1;2');
  });

  it('PDF endommagé : message clair (400)', async () => {
    await expect(extractText({ buffer: Buffer.from('%PDF-1.4 pas un vrai pdf'), originalname: 'casse.pdf' })).rejects.toMatchObject({ status: 400 });
  });

  it('refuse un format non pris en charge', async () => {
    await expect(extractText({ buffer: Buffer.from('x'), originalname: 'photo.png', mimetype: 'image/png' })).rejects.toMatchObject({ status: 400 });
  });

  it('budget partagé : les courts en entier, les longs tronqués avec mention ; désactivés ignorés', () => {
    const long = 'x'.repeat(PROMPT_TOTAL_CHARS);
    const text = formatDocumentsForPrompt([
      { id: '1', name: 'Court', enabled: true, content: 'contenu court' },
      { id: '2', name: 'Long', enabled: true, content: long },
      { id: '3', name: 'Ignoré', enabled: false, content: 'secret' },
    ]);
    expect(text).toContain('« Court »\ncontenu court');
    expect(text).toContain('« Long » (extrait : début du document');
    expect(text).not.toContain('Ignoré');
    expect(text.length).toBeLessThan(PROMPT_TOTAL_CHARS + 500);
    expect(formatDocumentsForPrompt([])).toBe('');
  });

  it('les documents vont dans le bloc commun du prompt (mis en cache)', () => {
    const agent = { name: 'Léa', role: 'r' };
    const [shared, turn] = buildAgentSystemPrompt({ agent, project: {}, session: { task: 'T' }, activeAgents: [agent], documentsText: '### « Devis »\n12 000 €' });
    expect(shared.text).toContain('DOCUMENTS DE RÉFÉRENCE');
    expect(shared.text).toContain('12 000 €');
    expect(turn.text).not.toContain('12 000 €');
  });
});
