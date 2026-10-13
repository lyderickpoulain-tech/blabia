// Présence sur un projet (v5.1) : carte du projet dans la liste des projets.
// Projet à plusieurs (au moins un membre ayant accepté l'invitation) : chaque participant,
// propriétaire compris, avec un voyant « en ligne » (activité de moins de 2 min 30) ou la
// date de sa dernière venue. Projet solo : seulement « Créé par … ». Les invitations en
// attente (table Invitation) ne sont jamais montrées.
// L'activité vient d'un signal envoyé chaque minute par les pages du projet (POST /presence).
const db = require('../utils/db');

const ONLINE_MS = 150 * 1000;

const displayName = u => u?.username || String(u?.email || '').split('@')[0] || 'quelqu’un';

async function touch(projectId, userId) {
  await db('ProjectPresence').insert({ projectId, userId, lastSeenAt: new Date() })
    .onConflict(['projectId', 'userId']).merge({ lastSeenAt: new Date() });
}

// projects : lignes de la liste (id, userId) → { [projectId]: { people } | { createdBy } }
async function peopleOf(projects, currentUserId, now = Date.now()) {
  const ids = projects.map(p => p.id);
  if (!ids.length) return {};
  const [members, presences] = await Promise.all([
    db('ProjectMember as m').join('User as u', 'u.id', 'm.userId').whereIn('m.projectId', ids)
      .select('m.projectId', 'u.id as userId', 'u.username', 'u.email'),
    db('ProjectPresence').whereIn('projectId', ids).select('projectId', 'userId', 'lastSeenAt'),
  ]);
  const ownerIds = [...new Set(projects.map(p => p.userId).filter(Boolean))];
  const owners = Object.fromEntries((ownerIds.length ? await db('User').whereIn('id', ownerIds).select('id', 'username', 'email') : []).map(u => [u.id, u]));
  const seen = Object.fromEntries(presences.map(p => [`${p.projectId}:${p.userId}`, p.lastSeenAt]));
  const out = {};
  for (const p of projects) {
    const others = members.filter(m => m.projectId === p.id && m.userId !== p.userId);
    const owner = owners[p.userId];
    if (!others.length) {
      out[p.id] = { createdBy: p.userId === currentUserId ? 'vous' : displayName(owner) };
      continue;
    }
    const person = (u, isOwner) => {
      const last = seen[`${p.id}:${u.id || u.userId}`] || null;
      return {
        userId: u.id || u.userId, name: displayName(u), isOwner, isYou: (u.id || u.userId) === currentUserId,
        lastSeenAt: last, online: !!last && now - new Date(last).getTime() < ONLINE_MS,
      };
    };
    out[p.id] = { people: [...(owner ? [person(owner, true)] : []), ...others.map(m => person(m, false))] };
  }
  return out;
}

module.exports = { touch, peopleOf, displayName, ONLINE_MS };
