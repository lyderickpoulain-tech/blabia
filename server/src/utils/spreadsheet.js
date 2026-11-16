// Classeur .xlsx → texte (une section CSV par feuille), pour les documents et pièces jointes.
// v6 : read-excel-file (JS pur, maintenu) remplace xlsx 0.18.5 (non maintenu sur npm, failles connues).
const readExcelFile = require('read-excel-file/node').default;

const cell = v => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = rows => rows.map(r => r.map(cell).join(',')).join('\n');

async function xlsxToText(buffer) {
  const sheets = await readExcelFile(buffer);
  return sheets.map(({ sheet, data }) => `--- Feuille : ${sheet} ---\n${toCsv(data)}`).join('\n');
}

module.exports = { xlsxToText, toCsv };
