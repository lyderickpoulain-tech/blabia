// Parsing centralisé des marqueurs émis par les agents en fin de message.
// Marqueurs reconnus : [DECISION:{...}], [SUGGEST_AGENT: Nom, rôle],
// [SUGGEST_STEP: titre], [NEED_TOOL:{...}]. Un seul de chaque type est
// retenu par message (le premier) ; tous sont retirés du texte affiché,
// même si le JSON est invalide ou le marqueur dupliqué.

// Note : les marqueurs à charge utile JSON ({...}) doivent être retirés avec
// un motif borné par les accolades, sinon un "]" à l'intérieur du JSON (ex.
// le tableau "choices") tronque le retrait et laisse un reliquat de JSON
// affiché dans la bulle.
const DECISION_RE      = /\[DECISION:(\{[\s\S]*?\})\]/;
const DECISION_STRIP_RE = /\[DECISION:\{[\s\S]*?\}\]/g;
const SUGGEST_AGENT_RE  = /\[SUGGEST_AGENT:\s*([\s\S]*?)\]/;
const SUGGEST_AGENT_STRIP_RE = /\[SUGGEST_AGENT:[\s\S]*?\]/g;
const SUGGEST_STEP_RE   = /\[SUGGEST_STEP:\s*([\s\S]*?)\]/;
const SUGGEST_STEP_STRIP_RE  = /\[SUGGEST_STEP:[\s\S]*?\]/g;
const NEED_TOOL_RE      = /\[NEED_TOOL:(\{[\s\S]*?\})\]/;
const NEED_TOOL_STRIP_RE     = /\[NEED_TOOL:\{[\s\S]*?\}\]/g;

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Extrait les marqueurs d'une réponse d'agent et retourne le texte nettoyé,
 * découpé en bulles (séparateur [NEXT], cf. phase 2 — vide aujourd'hui tant
 * que les agents ne l'utilisent pas).
 * @param {string} text - texte brut renvoyé par l'agent
 * @returns {{
 *   bubbles: string[],
 *   content: string,
 *   decision: {question:string, choices:string[], context:string} | null,
 *   suggestedAgent: {name:string, role:string} | null,
 *   suggestedStep: {title: string} | null,
 *   neededTool: object | null,
 * }}
 */
function parseAgentOutput(text) {
  const raw = text || '';

  const decisionMatch = raw.match(DECISION_RE);
  const decisionData   = decisionMatch ? safeJsonParse(decisionMatch[1]) : null;
  const decision = decisionData?.question
    ? {
        question: decisionData.question,
        choices:  Array.isArray(decisionData.choices) ? decisionData.choices : [],
        context:  decisionData.context || '',
      }
    : null;

  const suggestAgentMatch = raw.match(SUGGEST_AGENT_RE);
  let suggestedAgent = null;
  if (suggestAgentMatch) {
    const parts = suggestAgentMatch[1].split(',').map(p => p.trim());
    const name  = parts[0] || '';
    if (name) suggestedAgent = { name, role: parts.slice(1).join(', ') || '' };
  }

  const suggestStepMatch = raw.match(SUGGEST_STEP_RE);
  const stepTitle = suggestStepMatch ? suggestStepMatch[1].trim() : '';
  const suggestedStep = stepTitle ? { title: stepTitle } : null;

  const needToolMatch = raw.match(NEED_TOOL_RE);
  const neededTool = needToolMatch ? safeJsonParse(needToolMatch[1]) : null;

  const content = raw
    .replace(DECISION_STRIP_RE, '')
    .replace(SUGGEST_AGENT_STRIP_RE, '')
    .replace(SUGGEST_STEP_STRIP_RE, '')
    .replace(NEED_TOOL_STRIP_RE, '')
    .trim();

  const bubbles = content
    .split(/\n?\[NEXT\]\n?/)
    .map(s => s.trim())
    .filter(Boolean);

  return { bubbles, content, decision, suggestedAgent, suggestedStep, neededTool };
}

module.exports = { parseAgentOutput };
