const db = require('./db');

const TECH_STACK_LABELS = {
  hebergement: 'Hébergement',
  bdd:         'Base de données',
  frontend:    'Framework frontend',
  backend:     'Framework backend',
  auth:        'Authentification',
  emails:      "Envoi d'emails",
  devtools:    'Outils de développement',
  domaine:     'Domaine',
};

/**
 * Trouve un projet accessible : propriétaire OU membre OU admin.
 * Retourne undefined si introuvable ou non autorisé.
 */
async function findProject(id, userId, isAdmin) {
  const query = db('Project').where('Project.id', id);
  if (!isAdmin) {
    query.where(function () {
      this.where('Project.userId', userId)
        .orWhereExists(
          db.select(db.raw('1')).from('ProjectMember')
            .where('ProjectMember.projectId', id)
            .where('ProjectMember.userId', userId)
        );
    });
  }
  const [project] = await query.limit(1);
  return project;
}

/**
 * Formate la stack technique (objet ou JSON string) en lignes lisibles pour les prompts.
 * Retourne [] si vide ou invalide.
 */
function formatTechStack(raw) {
  const ts = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  if (!ts || typeof ts !== 'object') return [];
  const lines = [];
  for (const [key, label] of Object.entries(TECH_STACK_LABELS)) {
    const selected = ts[key] || [];
    if (selected.length === 0) continue;
    const items = selected.map(item => {
      if (item === 'Autre' && ts[`${key}_autre`]) return ts[`${key}_autre`];
      if (item === 'Autre') return null;
      return item;
    }).filter(Boolean);
    if (items.length > 0) lines.push(`- ${label} : ${items.join(', ')}`);
  }
  return lines;
}

module.exports = { findProject, formatTechStack };
