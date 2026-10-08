// Normalise un champ JSONB potentiellement renvoyé comme objet déjà parsé,
// chaîne JSON, null/undefined, ou JSON invalide — remplace les dizaines de
// variantes locales de `Array.isArray(x) ? x : JSON.parse(x || fallback)`.
function parseJsonField(value, fallback) {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) return value;
  if (value === null || value === undefined || value === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

module.exports = { parseJsonField };
