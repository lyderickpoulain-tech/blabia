// Historique de la réunion donné aux agents (v5.1, 11/10/2026) : TOUTE la réunion, et non
// plus les 10 derniers messages (dans une réunion de 40 messages, le début leur échappait).
// Placé dans les consignes système, APRÈS le bloc commun et AVANT le bloc propre à l'agent,
// un bloc par message, point de cache sur le dernier : d'un tour à l'autre et d'un agent à
// l'autre, ce qui précède est relu depuis le cache (10 % du prix) au lieu d'être repayé.
// Réunion très longue : les ~60 derniers messages, avec un début qui n'avance que par
// paliers de 20 (le début stable garde le cache valable entre deux paliers).
const HISTORY_WINDOW = 60;
const HISTORY_STEP = 20;

const visibleMessages = messages => messages.filter(m => m.role !== 'system' || m.type === 'decision_answer' || m.type === 'prep_summary' || m.type === 'animator');

function lineOf(m) {
  if (m.role === 'human') return `Participant : ${m.content}`;
  if (m.role === 'system' && m.type === 'decision_answer') return `[${m.content}]`;
  if (m.role === 'system' && m.type === 'prep_summary') return `[Synthèse de la préparation entre agents]\n${m.content}`;
  if (m.type === 'animator') return `Animation : ${m.content}`; // v5.1 : la voix de l'animateur
  return `${m.agentName} : ${m.content}${m.artifact ? ` [Illustration produite : « ${m.artifact.title} »]` : ''}`;
}

// → { blocks, omitted } ; blocks vide en début de réunion
function meetingHistory(messages) {
  const visible = visibleMessages(messages || []).filter(m => m.content);
  if (!visible.length) return { blocks: [], omitted: 0 };
  const start = visible.length > HISTORY_WINDOW ? Math.ceil((visible.length - HISTORY_WINDOW) / HISTORY_STEP) * HISTORY_STEP : 0;
  const header = `HISTORIQUE DE LA RÉUNION EN COURS (du plus ancien au plus récent${start ? ` ; les ${start} premiers messages, plus anciens, ne sont pas repris` : ''}) :`;
  const blocks = [header, ...visible.slice(start).map(lineOf)].map(text => ({ type: 'text', text }));
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  return { blocks, omitted: start };
}

// Consignes système d'un tour : bloc commun, historique, puis bloc propre à l'agent
const withHistory = (systemBlocks, history) => (history.blocks.length
  ? [systemBlocks[0], ...history.blocks, ...systemBlocks.slice(1)]
  : systemBlocks);

module.exports = { meetingHistory, withHistory, HISTORY_WINDOW, HISTORY_STEP };
