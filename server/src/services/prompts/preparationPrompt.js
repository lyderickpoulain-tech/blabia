// Préparation de réunion sans l'humain : les agents débattent seuls, puis une
// synthèse et les décisions qui reviennent à l'humain lui sont présentées à son
// arrivée (server/src/routes/sessions/chat.js, flag `prepare`).

const MAX_PREP_DECISIONS = 5;

// Nombre de tours de préparation : 2 par agent, borné à [4, 8]
function prepTurnsFor(agentCount) {
  return Math.min(8, Math.max(4, agentCount * 2));
}

// Consigne ajoutée au prompt de chaque agent pendant la préparation
const AGENT_PREPARATION_SECTION = `
PRÉPARATION SANS L'HUMAIN : l'humain n'est pas encore là. Vous préparez la réunion entre agents pour lui faire gagner du temps.
- Débattez vraiment : prends position, argumente, contredis un autre agent quand tu n'es pas d'accord, cherche à converger vers une recommandation.
- N'utilise AUCUNE carte [DECISION] et ne t'adresse pas à l'humain.
- Quand un point dépend de ses préférences, de son budget ou de ses contraintes, écris-le clairement : « À trancher par l'humain : … » avec les options en présence.
`;

// Note pour l'orchestrateur pendant la préparation
const ORCHESTRATOR_PREPARATION_NOTE = `
🧠 PRÉPARATION SANS L'HUMAIN : fais débattre les agents entre eux (alterne, donne la parole à celui qui peut contredire ou compléter le dernier), puis fais converger. Ne propose PAS shouldClose.
`;

function buildPrepSynthesisPrompt({ task, transcript, registryText, maxDecisions }) {
  const max = Math.max(0, Math.min(MAX_PREP_DECISIONS, maxDecisions));
  return {
    system: 'Tu prépares l\'arrivée de l\'humain dans une réunion que des agents IA ont préparée sans lui. Tu réponds UNIQUEMENT en JSON valide, sans backticks ni texte autour.',
    user: `Objectif de la réunion : ${task}

${registryText ? `Décisions déjà au registre du projet (ne les repose pas) :\n${registryText}\n\n` : ''}Débat de préparation entre agents :
${transcript}

Produis :
1. "summary" : une synthèse en Markdown, courte et lisible en une minute, avec ces sections :
   ## Ce que les agents proposent
   ## Points d'accord
   ## Désaccords et options en présence
   ## Recommandation
2. "decisions" : ${max === 0 ? 'une liste VIDE (budget de questions épuisé)' : `les décisions qui reviennent VRAIMENT à l'humain (préférences, budget, contraintes, choix structurants), ${max} au maximum, les plus importantes d'abord`}. Pour chacune : "question" (claire et courte), "choices" (2 à 4 options, la recommandation des agents en premier, toujours "Autre (précise)" en dernier), "context" (pourquoi c'est important, une phrase simple).
Les détails que les agents ont pu trancher seuls ne sont PAS des décisions pour l'humain : ils vont dans la synthèse. Mais une hypothèse des agents sur une préférence, le budget, une priorité, le périmètre ou un choix structurant lui revient : présente-la comme une décision à valider (leur choix en premier).

Format : {"summary":"...","decisions":[{"question":"...","choices":["..."],"context":"..."}]}`,
    max,
  };
}

function parsePrepSynthesis(text, max) {
  const match = String(text).replace(/```json\n?/g, '').replace(/```\n?/g, '').match(/\{[\s\S]*\}/);
  if (!match) return { summary: '', decisions: [] };
  let raw;
  try { raw = JSON.parse(match[0]); } catch { return { summary: '', decisions: [] }; }
  const decisions = (Array.isArray(raw.decisions) ? raw.decisions : [])
    .filter(d => d && String(d.question || '').trim())
    .map(d => {
      const choices = (Array.isArray(d.choices) ? d.choices : []).map(c => String(c).slice(0, 200)).filter(Boolean).slice(0, 4);
      if (!choices.some(c => /^autre/i.test(c))) choices.push('Autre (précise)');
      return { question: String(d.question).trim().slice(0, 300), choices, context: String(d.context || '').slice(0, 300) };
    })
    .slice(0, max);
  return { summary: String(raw.summary || '').trim().slice(0, 6000), decisions };
}

module.exports = {
  MAX_PREP_DECISIONS, prepTurnsFor, AGENT_PREPARATION_SECTION, ORCHESTRATOR_PREPARATION_NOTE,
  buildPrepSynthesisPrompt, parsePrepSynthesis,
};
