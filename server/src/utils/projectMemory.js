// Mémoire projet (Project.context) : les comptes-rendus s'ajoutent à la fin,
// séparés par "\n---\n" (cf. updateProjectContext). Pour les prompts, on garde
// les entrées les PLUS RÉCENTES qui tiennent dans maxChars — tronquer par le
// début ne transmettait que la toute première réunion.
const SEPARATOR = '\n---\n';

function recentMemory(context, maxChars = 3000) {
  if (!context) return '';
  const entries = String(context).split(SEPARATOR);
  const kept = [];
  let size = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const add = entries[i].length + (kept.length ? SEPARATOR.length : 0);
    if (size + add > maxChars) {
      // Entrée la plus récente trop longue à elle seule : on en garde la fin
      if (kept.length === 0) kept.unshift(`…${entries[i].slice(-(maxChars - 1))}`);
      break;
    }
    kept.unshift(entries[i]);
    size += add;
  }
  return kept.join(SEPARATOR);
}

// Retire de la mémoire du projet le compte rendu d'une réunion (entrées « [SESSION:<id> | … »,
// écrites par updateProjectContext). Renvoie la mémoire nettoyée, ou null si rien ne change.
function withoutSession(context, sessionId) {
  if (!context) return null;
  const entries = String(context).split(SEPARATOR);
  const kept = entries.filter(e => !e.startsWith(`[SESSION:${sessionId} |`));
  return kept.length === entries.length ? null : kept.join(SEPARATOR);
}

// Ajoute une entrée à la mémoire du projet ; au-delà de MAX_CHARS, les plus anciennes sortent.
// Utilisé pour les comptes rendus de réunion ([SESSION:…], updateProjectContext) et les
// missions réussies ([MISSION:…], services/missionRunner.js).
const MAX_CHARS = 10000;
function appendEntry(context, entry) {
  const parts = [...(context ? String(context).split(SEPARATOR) : []), entry];
  while (parts.length > 1 && parts.join(SEPARATOR).length > MAX_CHARS) parts.shift();
  return parts.join(SEPARATOR);
}
async function appendMemory(projectId, entry) {
  const db = require('./db');
  const [project] = await db('Project').select('context').where({ id: projectId }).limit(1);
  await db('Project').where({ id: projectId }).update({ context: appendEntry(project?.context, entry), updatedAt: new Date() });
}

// Ce qu'une mission réussie laisse en mémoire : la synthèse et la recommandation du rapport
// (titres « ## Synthèse », « ## Recommandation(s) »), sinon son début ; 1 500 caractères au plus
function missionDigest(report) {
  const text = String(report || '');
  const section = re => { const m = text.match(re); return m ? m[1].trim() : ''; };
  const parts = [
    section(/^##\s*Synth[eè]se\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im),
    section(/^##\s*Recommandations?\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im),
  ].filter(Boolean);
  const digest = parts.length ? parts.join('\n') : text.replace(/^#.*\n/, '').trim();
  return digest.length > 1500 ? `${digest.slice(0, 1499).trim()}…` : digest;
}

module.exports = { recentMemory, withoutSession, appendEntry, appendMemory, missionDigest, SEPARATOR };
