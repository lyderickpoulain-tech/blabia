// Niveaux de mission (v5.1) — miroir de LEVELS dans server/src/services/missions.js :
// l'humain choisit une profondeur, le plafond de coût en découle (affiché à titre indicatif).
export const MISSION_LEVELS = [
  { id: 'light',    label: 'Légère',      hint: 'quelques recherches, réponse courte',              budgetUSD: 0.25 },
  { id: 'standard', label: 'Standard',    hint: 'recherche et lectures ciblées',                      budgetUSD: 0.6 },
  { id: 'deep',     label: 'Approfondie', hint: 'beaucoup plus de sources, modèle le plus puissant',  budgetUSD: 2 },
];
export const levelById = id => MISSION_LEVELS.find(l => l.id === id) || MISSION_LEVELS[1];
