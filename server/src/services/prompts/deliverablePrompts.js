// Prompts de génération des livrables à la clôture d'une réunion
// (server/src/routes/sessions/deliverables.js — POST /:sessionId/generate-deliverable).

function buildSummaryPrompt(sessionContext) {
  return {
    system: 'Tu es un expert en synthèse de réunion d\'entreprise. Tu rédiges des comptes-rendus clairs et structurés. Réponds uniquement en français, sans introduction ni conclusion génériques.',
    user: `Génère un compte-rendu structuré de cette réunion.\n\nFormat :\n## Objectif\n## Points discutés\n## Décisions prises\n## Actions à mener\n\nMax 600 mots.\n\n${sessionContext}`,
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

function buildTimelineStepsPrompt(sessionContext) {
  return {
    system: 'Tu extrais des jalons et tâches actionnables depuis une réunion. Réponds UNIQUEMENT en JSON valide, sans markdown ni backticks.',
    user: `Extrais les étapes actionnables de cette réunion sous forme de jalons et tâches.\n\nRetourne UNIQUEMENT ce JSON :\n{\n  "milestones": [\n    { "title": "...", "description": "...", "type": "meeting", "todos": [{ "title": "...", "priority": "high" }] }\n  ],\n  "standalone_todos": [{ "title": "...", "priority": "medium" }]\n}\n\n${sessionContext}`,
  };
}

module.exports = { buildSummaryPrompt, buildClaudeCodePrompt, buildTimelineStepsPrompt };
