// Objectif du projet en une ou deux phrases, tiré du brief (« OBJECTIF : … ») ou, à défaut,
// de la description. Sert de CAP aux agents, à l'orchestrateur et au tri de fin de réunion
// (v5.1, audit du 13/10/2026 : réunions qui s'éloignaient de la problématique de départ).
const MAX = 400;

function projectObjective(project) {
  const brief = String(project?.brief || '');
  const m = brief.match(/OBJECTIF\s*:\s*([\s\S]*?)(?:\n\s*\n|\n[A-ZÉÈ' ]{3,}\s*:|$)/);
  const text = (m ? m[1] : (project?.description || brief)).replace(/\s+/g, ' ').trim();
  return text.length > MAX ? `${text.slice(0, MAX).replace(/\s+\S*$/, '')}…` : text;
}

module.exports = { projectObjective };
