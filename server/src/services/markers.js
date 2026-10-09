// Parsing centralisé des marqueurs émis par les agents en fin de message.
// Marqueurs reconnus : [DECISION:{...}], [SUGGEST_AGENT: Nom, rôle],
// [SUGGEST_MEETING:{...}] (phase 3.4, remplace [SUGGEST_STEP: titre]),
// [NEED_TOOL:{...}]. Un seul de chaque type est retenu par message (le
// premier) ; tous sont retirés du texte affiché, même si le JSON est
// invalide ou le marqueur dupliqué.

// Note : les marqueurs à charge utile JSON ({...}) doivent être retirés avec
// un motif borné par les accolades, sinon un "]" à l'intérieur du JSON (ex.
// le tableau "choices") tronque le retrait et laisse un reliquat de JSON
// affiché dans la bulle.
const DECISION_RE      = /\[DECISION:(\{[\s\S]*?\})\]/;
const DECISION_STRIP_RE = /\[DECISION:\{[\s\S]*?\}\]/g;
const SUGGEST_AGENT_RE  = /\[SUGGEST_AGENT:\s*([\s\S]*?)\]/;
const SUGGEST_AGENT_STRIP_RE = /\[SUGGEST_AGENT:[\s\S]*?\]/g;
const SUGGEST_MEETING_RE   = /\[SUGGEST_MEETING:(\{[\s\S]*?\})\]/;
const SUGGEST_MEETING_STRIP_RE = /\[SUGGEST_MEETING:\{[\s\S]*?\}\]/g;
const NEED_TOOL_RE      = /\[NEED_TOOL:(\{[\s\S]*?\})\]/;
const NEED_TOOL_STRIP_RE     = /\[NEED_TOOL:\{[\s\S]*?\}\]/g;

// v5.0 phase 5 : illustrations (artéfacts) — un bloc ```mermaid, ```html ou ```svg,
// titré par [ARTIFACT_TITLE: …]. Extraits AVANT les autres marqueurs : le code
// HTML/SVG peut contenir des crochets qui fausseraient leur détection.
// Le retrait couvre aussi un bloc non refermé (réponse tronquée).
const ARTIFACT_BLOCK_RE       = /```(mermaid|html|svg)[^\S\n]*\n([\s\S]*?)```/i;
const ARTIFACT_BLOCK_STRIP_RE = /```(mermaid|html|svg)[^\S\n]*\n[\s\S]*?(```|$)/gi;
const ARTIFACT_TITLE_RE       = /\[ARTIFACT_TITLE:\s*([^\]\n]+)\]/;
const ARTIFACT_TITLE_STRIP_RE = /\[ARTIFACT_TITLE:[^\]\n]*\]/g;
const ARTIFACT_DEFAULT_TITLE  = { mermaid: 'Schéma', html: 'Maquette', svg: 'Visuel' };
const MAX_ARTIFACT_CODE       = 60000;

// Demande explicite d'illustration dans un message humain (« fais-moi un schéma »…)
const ARTIFACT_REQUEST_RE = /(^\s*\/illustrer\b)|\b(fais|fait|faites|montre|montrez|dessine|dessinez|g[ée]n[èe]re|cr[ée]e|cr[ée]ez|propose|proposez|illustre|illustrez|peux-tu|pourrais-tu|tu peux|vous pouvez|j'aimerais|je voudrais)\b[^.?!\n]{0,50}\b(sch[ée]ma|diagramme|tableau visuel|maquette|visuel|illustration|organigramme|logigramme|carte mentale|mind ?map|wireframe)/i;

function detectArtifactRequest(text) {
  return ARTIFACT_REQUEST_RE.test(String(text || ''));
}

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
 *   suggestedMeeting: {title:string, objective:string, type:string, reason:string, after:string|null} | null,
 *   neededTool: object | null,
 *   artifact: {kind:"mermaid"|"html"|"svg", title:string, code:string} | null,
 * }}
 */
function parseAgentOutput(text) {
  const original = text || '';

  // Illustration : toujours extraite et retirée du texte ; c'est l'appelant qui
  // décide de la garder (tour avec demande d'illustration) ou de l'ignorer.
  const artifactMatch = original.match(ARTIFACT_BLOCK_RE);
  const titleMatch    = original.match(ARTIFACT_TITLE_RE);
  let artifact = null;
  if (artifactMatch && artifactMatch[2].trim()) {
    const kind = artifactMatch[1].toLowerCase();
    artifact = {
      kind,
      title: (titleMatch ? titleMatch[1].trim() : ARTIFACT_DEFAULT_TITLE[kind]).slice(0, 120),
      code:  artifactMatch[2].trim().slice(0, MAX_ARTIFACT_CODE),
    };
  }
  const raw = original.replace(ARTIFACT_BLOCK_STRIP_RE, '').replace(ARTIFACT_TITLE_STRIP_RE, '');

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

  const suggestMeetingMatch = raw.match(SUGGEST_MEETING_RE);
  const suggestMeetingData  = suggestMeetingMatch ? safeJsonParse(suggestMeetingMatch[1]) : null;
  const suggestedMeeting = suggestMeetingData?.title
    ? {
        title:     suggestMeetingData.title,
        objective: suggestMeetingData.objective || '',
        type:      ['decision', 'claude_code', 'stack'].includes(suggestMeetingData.type) ? suggestMeetingData.type : 'decision',
        reason:    suggestMeetingData.reason || '',
        after:     suggestMeetingData.after || null,
      }
    : null;

  // v5.0 phase 4.3 : NEED_TOOL enrichi du coût (accepte aussi l'ancien format v4 label/reason)
  const needToolMatch = raw.match(NEED_TOOL_RE);
  const needToolData  = needToolMatch ? safeJsonParse(needToolMatch[1]) : null;
  const toolName      = needToolData && (needToolData.name || needToolData.label);
  const toNum = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Math.max(0, Number(v)));
  const neededTool = toolName
    ? {
        name:        String(toolName).trim(),
        category:    needToolData.category || null,
        need:        needToolData.need || '',
        why:         needToolData.why || needToolData.reason || '',
        costMin:     toNum(needToolData.costMin),
        costMax:     toNum(needToolData.costMax),
        freeTier:    needToolData.freeTier || null,
        priceSource: typeof needToolData.priceSource === 'string' && /^https?:\/\//.test(needToolData.priceSource) ? needToolData.priceSource : null,
      }
    : null;

  const content = raw
    .replace(DECISION_STRIP_RE, '')
    .replace(SUGGEST_AGENT_STRIP_RE, '')
    .replace(SUGGEST_MEETING_STRIP_RE, '')
    .replace(NEED_TOOL_STRIP_RE, '')
    .trim();

  const bubbles = content
    .split(/\n?\[NEXT\]\n?/)
    .map(s => s.trim())
    .filter(Boolean);

  return { bubbles, content, decision, suggestedAgent, suggestedMeeting, neededTool, artifact };
}

module.exports = { parseAgentOutput, detectArtifactRequest };
