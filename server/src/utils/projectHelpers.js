const db = require('./db');

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

module.exports = { findProject };
