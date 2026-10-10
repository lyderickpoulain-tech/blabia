// Parsing centralisé des marqueurs émis par les agents en fin de message.
// Marqueurs reconnus : [DECISION:{...}], [SUGGEST_AGENT: Nom, rôle],
// [SUGGEST_MEETING:{...}] (phase 3.4, remplace [SUGGEST_STEP: titre]),
// [NEED_TOOL:{...}], [MISSION:{...}] (v5.1, missions des agents). Un seul de chaque type est retenu par message (le
// premier) ; tous sont retirés du texte affiché, même si le JSON est
// invalide ou le marqueur dupliqué.

// Note : les marqueurs à charge utile JSON ({...}) doivent être retirés avec
// un motif borné par les accolades, sinon un "]" à l'intérieur du JSON (ex.
// le tableau "choices") tronque le retrait et laisse un reliquat de JSON
// affiché dans la bulle.
const DECISION_RE      = /\[DECISION:(\{[\s\S]*?\})\]/;
const DECISION_STRIP_RE = /\[DECISION:\{[\s\S]*?\}\]/g;
const MAX_DECISIONS_PER_MESSAGE = 3;
const SUGGEST_AGENT_RE  = /\[SUGGEST_AGENT:\s*([\s\S]*?)\]/;
const SUGGEST_AGENT_STRIP_RE = /\[SUGGEST_AGENT:[\s\S]*?\]/g;
const SUGGEST_MEETING_RE   = /\[SUGGEST_MEETING:(\{[\s\S]*?\})\]/;
const SUGGEST_MEETING_STRIP_RE = /\[SUGGEST_MEETING:\{[\s\S]*?\}\]/g;
const NEED_TOOL_RE      = /\[NEED_TOOL:(\{[\s\S]*?\})\]/;
const NEED_TOOL_STRIP_RE     = /\[NEED_TOOL:\{[\s\S]*?\}\]/g;
const MISSION_RE        = /\[MISSION:(\{[\s\S]*?\})\]/;
const MISSION_STRIP_RE  = /\[MISSION:\{[\s\S]*?\}\]/g;
const MISSION_KINDS     = ['research', 'analysis', 'writing'];

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

  // Jusqu'à MAX_DECISIONS_PER_MESSAGE cartes par message : un agent regroupe ses
  // questions en une seule fois plutôt que d'en poser une à chaque tour.
  const decisions = [];
  for (const m of raw.matchAll(new RegExp(DECISION_RE.source, 'g'))) {
    const d = safeJsonParse(m[1]);
    if (!d?.question) continue;
    if (decisions.some(x => x.question === d.question)) continue;
    decisions.push({
      question: d.question,
      choices:  Array.isArray(d.choices) ? d.choices : [],
      context:  d.context || '',
    });
    if (decisions.length >= MAX_DECISIONS_PER_MESSAGE) break;
  }
  const decision = decisions[0] || null;

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

  // v5.1 : mission proposée à un sous-agent (validée ensuite par l'humain)
  const missionMatch = raw.match(MISSION_RE);
  const missionData  = missionMatch ? safeJsonParse(missionMatch[1]) : null;
  const mission = missionData?.title && missionData?.objective
    ? {
        title:       String(missionData.title).trim().slice(0, 200),
        objective:   String(missionData.objective).trim().slice(0, 1500),
        deliverable: missionData.deliverable ? String(missionData.deliverable).trim().slice(0, 500) : null,
        kind:        MISSION_KINDS.includes(missionData.kind) ? missionData.kind : 'research',
      }
    : null;

  const content = raw
    .replace(MISSION_STRIP_RE, '')
    .replace(DECISION_STRIP_RE, '')
    .replace(SUGGEST_AGENT_STRIP_RE, '')
    .replace(SUGGEST_MEETING_STRIP_RE, '')
    .replace(NEED_TOOL_STRIP_RE, '')
    .trim();

  const bubbles = content
    .split(/\n?\[NEXT\]\n?/)
    .map(s => s.trim())
    .filter(Boolean);

  return { bubbles, content, decision, decisions, suggestedAgent, suggestedMeeting, neededTool, artifact, mission };
}

module.exports = { parseAgentOutput, detectArtifactRequest, MAX_DECISIONS_PER_MESSAGE };
