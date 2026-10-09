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

module.exports = { recentMemory };
