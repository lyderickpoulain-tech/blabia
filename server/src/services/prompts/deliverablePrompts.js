// Prompts de génération des livrables à la clôture d'une réunion
// (server/src/routes/sessions/deliverables.js — POST /:sessionId/generate-deliverable).

// v5.0 phase 3.2 : pour les réunions de type "decision", le compte-rendu prend
// la forme d'un relevé de décisions plutôt que du format générique.
function buildSummaryPrompt(sessionContext, expertiseLevel = 3, meetingType = 'decision') {
  // Niveau 1-2 (découverte/initié) : le compte-rendu se termine par un glossaire
  // des termes techniques employés — pas au niveau prompt Claude Code (phase 2.4).
  const glossarySection = expertiseLevel <= 2
    ? '\n## Glossaire\n(Termine le compte-rendu par cette section si tu as employé des termes techniques : chaque terme, défini en une phrase simple.)'
    : '';
  const format = meetingType === 'decision'
    ? '## Décisions prises\n## Options écartées et pourquoi\n## Questions ouvertes\n## Actions'
    : '## Objectif\n## Points discutés\n## Décisions prises\n## Actions à mener';
  return {
    system: 'Tu es un expert en synthèse de réunion d\'entreprise. Tu rédiges des comptes-rendus clairs et structurés. Réponds uniquement en français, sans introduction ni conclusion génériques.',
    user: `Génère un compte-rendu structuré de cette réunion.\n\nFormat :\n${format}${glossarySection}\n\nMax 600 mots (hors glossaire).\n\n${sessionContext}`,
  };
}

function buildClaudeCodePrompt({ session, brief, devDirectory, stackLines = [], decisions = [], historyText }) {
  const briefSection = brief?.trim()
    ? `Brief du projet :\n${brief.trim()}\n\n`
    : '';
  const stackSection = stackLines.length > 0
    ? `Stack technique :\n${stackLines.join('\n')}\n\n`
    : '';
  const decisionsSection = decisions.length > 0
    ? `Décisions prises pendant la réunion (contraintes obligatoires) :\n${decisions.map((d, i) => `${i + 1}. ${d.content}`).join('\n')}\n\n`
    : '';
  const cdInstruction = devDirectory
    ? `- Commencer IMPÉRATIVEMENT par la ligne : cd "${devDirectory}"`
    : '- Préciser que l\'utilisateur doit naviguer manuellement vers son répertoire de projet';

  return {
    system: 'Tu es un expert en rédaction de prompts techniques pour Claude Code. Tu génères des prompts précis, calibrés et directement utilisables. Réponds uniquement en français.',
    user: `${briefSection}Objectif de la réunion : ${session.task}

${stackSection}${decisionsSection}Génère un prompt Claude Code prêt à être copié dans Claude Code.

Le prompt généré doit :
${cdInstruction}
- Calibrer sa complexité sur l'objectif réel (ne pas over-engineer : chaque tâche doit servir directement "${session.task}")
- Lister les tâches concrètes à implémenter dans l'ordre logique (numérotées)
- Préciser les fichiers ou composants concernés si identifiés dans la réunion
- Intégrer les décisions prises comme contraintes non négociables
- Demander une validation étape par étape avant de passer à la suivante
- Être rédigé en français

Conversation de la réunion :
${historyText}`,
  };
}

module.exports = { buildSummaryPrompt, buildClaudeCodePrompt };
