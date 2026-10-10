// Documents de référence du projet (v5.1) — table ProjectDocument.
// Le texte est extrait UNE fois au dépôt (sans IA : pdf-parse, mammoth, xlsx) ;
// les documents actifs sont transmis aux agents dans le bloc commun du prompt
// (mis en cache : relus à 10 % du prix à chaque tour).
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse/lib/pdf-parse.js'); // chemin direct : l'entrée du paquet lit un fichier de test au chargement
const db = require('../utils/db');

const MAX_DOCUMENTS     = 10;
const MAX_STORED_CHARS  = 200_000; // texte conservé par document
const PROMPT_TOTAL_CHARS = 40_000; // ~10 000 tokens pour l'ensemble des documents, à chaque tour
const ACCEPTED = '.pdf, .docx, .xlsx, .csv, .txt, .md';

const ext = name => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

// Texte brut d'un fichier ; erreur explicite si le format n'est pas pris en charge
async function extractText({ buffer, mimetype = '', originalname = '' }) {
  const e = ext(originalname);
  let text;
  if (e === 'pdf' || mimetype === 'application/pdf') {
    try {
      text = (await pdfParse(buffer)).text;
    } catch {
      const err = new Error('PDF illisible : fichier protégé par mot de passe ou endommagé ?');
      err.status = 400;
      throw err;
    }
  } else if (e === 'docx' || mimetype.includes('wordprocessingml')) {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (e === 'xlsx' || mimetype.includes('spreadsheetml')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    text = wb.SheetNames.map(n => `--- Feuille : ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n');
  } else if (['csv', 'txt', 'md'].includes(e) || mimetype.startsWith('text/')) {
    text = buffer.toString('utf-8');
  } else {
    const err = new Error(`Format non pris en charge. Formats acceptés : ${ACCEPTED}`);
    err.status = 400;
    throw err;
  }
  // Espaces et lignes vides en trop (fréquents dans les PDF)
  return String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function listDocuments(projectId, { withContent = false } = {}) {
  const cols = ['id', 'name', 'mimeType', 'sizeBytes', 'charCount', 'enabled', 'createdAt'];
  return db('ProjectDocument').where({ projectId }).orderBy('createdAt', 'asc')
    .select(withContent ? [...cols, 'content'] : cols);
}

// Section du prompt : documents actifs, partage équitable du budget de caractères
function formatDocumentsForPrompt(docs) {
  const active = docs.filter(d => d.enabled && d.content);
  if (active.length === 0) return '';
  let budget = PROMPT_TOTAL_CHARS;
  let remaining = active.length;
  // Les plus courts d'abord : ce qu'ils n'utilisent pas profite aux plus longs
  const shares = new Map();
  for (const d of [...active].sort((a, b) => a.content.length - b.content.length)) {
    const share = Math.floor(budget / remaining);
    const take = Math.min(d.content.length, share);
    shares.set(d.id, take);
    budget -= take;
    remaining -= 1;
  }
  return active.map(d => {
    const take = shares.get(d.id);
    const truncated = take < d.content.length;
    return `### « ${d.name} »${truncated ? ` (extrait : début du document, ${take.toLocaleString('fr-FR')} caractères sur ${d.content.length.toLocaleString('fr-FR')})` : ''}\n${d.content.slice(0, take)}`;
  }).join('\n\n');
}

module.exports = { MAX_DOCUMENTS, MAX_STORED_CHARS, PROMPT_TOTAL_CHARS, ACCEPTED, extractText, listDocuments, formatDocumentsForPrompt };
