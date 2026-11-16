import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { xlsxToText, toCsv } = require('../spreadsheet');
const dir = path.dirname(fileURLToPath(import.meta.url));

describe('classeur .xlsx → texte (read-excel-file, v6)', () => {
  it('une section CSV par feuille, même rendu que l’ancienne bibliothèque xlsx', async () => {
    const text = await xlsxToText(fs.readFileSync(path.join(dir, 'fixtures/classeur.xlsx')));
    expect(text).toBe([
      '--- Feuille : Jeux ---',
      'Jeu,Âge,Prix',
      '"Dixit, édition ""famille""",6-8,29.9',
      'Uno,7,',
      '--- Feuille : Budget ---',
      'Budget',
      '150',
    ].join('\n'));
  });

  it('dates en AAAA-MM-JJ, cellules vides', () => {
    expect(toCsv([[new Date('2026-12-24T00:00:00Z'), null, 'a\nb']])).toBe('2026-12-24,,"a\nb"');
  });

  it('fichier qui n’est pas un classeur : erreur', async () => {
    await expect(xlsxToText(Buffer.from('pas un classeur'))).rejects.toThrow();
  });
});
