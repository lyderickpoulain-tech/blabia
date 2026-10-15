// Avis de l'humain sur les bulles des agents (v5.1, 16/10/2026) : « à côté de la plaque »,
// « trop technique », « trop long », « bien vu ». Ils deviennent des PRÉFÉRENCES APPRISES,
// transmises aux agents de tous ses projets (bloc commun du prompt) — comme Claude Code
// garde en mémoire les retours de l'utilisateur.
const { randomUUID } = require('crypto');
const db = require('../utils/db');

const KINDS = ['off_topic', 'too_technical', 'too_long', 'good'];
const LABEL = {
  off_topic: 'jugée « à côté de la plaque »',
  too_technical: 'jugée « trop technique »',
  too_long: 'jugée « trop longue »',
  good: 'appréciée (« bien vu »)',
};
const ADVICE = {
  off_topic: 'réponds à la question posée, sur l\'objectif, sans digression',
  too_technical: 'simplifie le vocabulaire et le niveau de détail',
  too_long: 'fais plus court : la réponse d\'abord, une idée par bulle',
};
const RECENT = 12;
const EXCERPT = 220;

const excerptOf = text => {
  const t = String(text || '').replace(/\[[A-Z_]+:[^\n]*\]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > EXCERPT ? `${t.slice(0, EXCERPT).replace(/\s+\S*$/, '')}…` : t;
};

// Un avis par bulle et par personne ; kind null = avis retiré
async function saveFeedback({ userId, projectId, sessionId, message, kind }) {
  if (!kind) {
    await db('AgentFeedback').where({ userId, messageId: message.id }).del();
    return null;
  }
  const row = {
    id: randomUUID(), userId, projectId, sessionId, messageId: message.id,
    agentName: message.agentName || null, kind, excerpt: excerptOf(message.content), createdAt: new Date(),
  };
  const [saved] = await db('AgentFeedback').insert(row)
    .onConflict(['userId', 'messageId']).merge({ kind, createdAt: row.createdAt }).returning('*');
  return saved;
}

// Texte pour le prompt : derniers avis (tous projets) et tendance dominante
async function preferencesForPrompt(userId) {
  if (!userId) return '';
  const rows = await db('AgentFeedback').where({ userId }).orderBy('createdAt', 'desc').limit(RECENT)
    .select('kind', 'excerpt', 'agentName');
  if (!rows.length) return '';
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] || 0) + 1 }), {});
  const [topKind, topCount] = Object.entries(counts).filter(([k]) => k !== 'good').sort((a, b) => b[1] - a[1])[0] || [];
  const trend = topKind && topCount >= 2
    ? `\nTendance : ${topCount} réponses ${LABEL[topKind].replace('jugée', 'jugées').replace('trop longue', 'trop longues')} parmi ses ${rows.length} derniers avis → ${ADVICE[topKind]}.`
    : '';
  return `PRÉFÉRENCES APPRISES DE L'HUMAIN (ses avis récents sur des réponses d'agents, tous projets confondus — tiens-en compte, sans les mentionner) :
${rows.map(r => `- Réponse ${LABEL[r.kind]}${r.agentName ? ` (${r.agentName})` : ''} : « ${r.excerpt} »`).join('\n')}${trend}`;
}

module.exports = { KINDS, saveFeedback, preferencesForPrompt, excerptOf };
