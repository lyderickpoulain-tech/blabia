// Mémoire du projet à deux étages (v5.1, 11/10/2026) — plus rien n'est « perdu » :
//   1. Project.memorySummary : SYNTHÈSE consolidée et structurée (contexte et objectifs,
//      ce qui est établi, pistes écartées, points ouverts, travaux réalisés), chaque point
//      avec sa source ; lisible et corrigible par l'humain (Paramètres › Mémoire).
//   2. Project.context : les DERNIÈRES entrées telles quelles (comptes rendus, missions…).
// Quand les entrées récentes dépassent RECENT_MAX, les plus anciennes sont FONDUES dans la
// synthèse (consigne : ne perdre aucun fait, chiffre, nom ni choix ; seul ce qui a été
// remplacé disparaît, en le disant) au lieu d'être supprimées. Échec de l'IA : rien n'est
// retiré (la mémoire grandit jusqu'au prochain essai).
// Les agents reçoivent la synthèse entière + les entrées récentes (memoryForPrompt).
const db = require('../utils/db');
const anthropic = require('./anthropic');
const { DEFAULT_MODEL } = require('./models');
const { SEPARATOR, memoryForPrompt } = require('../utils/projectMemory');

const RECENT_MAX = 6000;    // au-delà : consolidation
const RECENT_KEEP = 3000;   // entrées récentes gardées telles quelles après consolidation
const SUMMARY_TARGET = 8000;
const SECTIONS = ['Contexte et objectifs', 'Ce qui est établi', 'Pistes écartées', 'Points ouverts', 'Travaux réalisés'];

function buildConsolidationPrompt({ summary, entries, editedByHuman }) {
  return {
    system: 'Tu tiens la mémoire d\'un projet : une synthèse consolidée, fidèle et sans perte. Réponds uniquement par la synthèse, en Markdown, en français.',
    user: `${summary ? `SYNTHÈSE ACTUELLE DU PROJET :\n${summary}\n` : 'Pas encore de synthèse.\n'}${editedByHuman ? '\nL\'humain a corrigé lui-même cette synthèse : ses formulations et corrections font foi, garde-les.\n' : ''}
NOUVELLES ENTRÉES À INTÉGRER (de la plus ancienne à la plus récente) :
${entries.join(SEPARATOR)}

Produis la NOUVELLE SYNTHÈSE, exactement avec ces titres, dans cet ordre :
${SECTIONS.map(s => `## ${s}`).join('\n')}

Règles impératives :
- Ne PERDS aucune information utile : faits, chiffres, montants, dates, noms, choix, contraintes, préférences de l'humain, résultats de missions, demandes réalisées. Fusionne les doublons, reformule court, mais ne supprime rien.
- Seul ce qui a été explicitement REMPLACÉ par une entrée plus récente change : garde la trace en une ligne (« remplacé : ancien → nouveau »).
- Chaque point se termine par sa source entre parenthèses : date et titre court de la réunion, ou « mission « … » ».
- « Pistes écartées » : ce qui a été écarté, avec la raison. « Points ouverts » : questions non tranchées, à jour (retire celles qui ont été tranchées depuis, en les déplaçant vers « Ce qui est établi »).
- Puces courtes. Vise ${SUMMARY_TARGET} caractères au plus : si c'est trop long, condense la formulation, jamais les faits.`,
  };
}

async function summarize(input) {
  const p = buildConsolidationPrompt(input);
  const res = await anthropic.messages.create({ model: DEFAULT_MODEL, max_tokens: 6000, system: p.system, messages: [{ role: 'user', content: p.user }] });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!/^##\s/m.test(text)) throw new Error('Synthèse illisible');
  return text;
}

// Entrées à fondre : les plus anciennes, pour qu'il reste au plus RECENT_KEEP caractères
function splitForConsolidation(context) {
  const entries = String(context || '').split(SEPARATOR).filter(e => e.trim());
  const keep = [];
  let size = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (keep.length && size + entries[i].length > RECENT_KEEP) break;
    keep.unshift(entries[i]);
    size += entries[i].length + SEPARATOR.length;
  }
  return { fold: entries.slice(0, entries.length - keep.length), keep };
}

const running = new Set(); // une consolidation à la fois par projet

async function consolidate(projectId, { force = false } = {}) {
  if (running.has(projectId)) return false;
  running.add(projectId);
  try {
    const [p] = await db('Project').where({ id: projectId }).select('context', 'memorySummary', 'memoryEditedAt').limit(1);
    if (!p || (!force && String(p.context || '').length <= RECENT_MAX)) return false;
    const { fold } = splitForConsolidation(p.context);
    if (!fold.length) return false;
    const summary = await summarize({ summary: p.memorySummary, entries: fold, editedByHuman: !!p.memoryEditedAt });
    // Relu au moment d'écrire : une entrée a pu s'ajouter pendant l'appel ; seules les
    // entrées effectivement fondues sont retirées
    await db.transaction(async trx => {
      const [cur] = await trx('Project').where({ id: projectId }).select('context').forUpdate();
      const rest = String(cur?.context || '').split(SEPARATOR).filter(e => e.trim() && !fold.includes(e));
      await trx('Project').where({ id: projectId }).update({ context: rest.join(SEPARATOR) || null, memorySummary: summary, memorySummaryAt: new Date() });
    });
    return true;
  } catch (err) {
    console.error('[memory] consolidation :', err.message);
    return false;
  } finally {
    running.delete(projectId);
  }
}

// Lancée sans attendre après chaque ajout à la mémoire
function consolidateSoon(projectId) {
  setImmediate(() => consolidate(projectId).catch(() => {}));
}

// Première synthèse d'un projet existant : tout l'historique (comptes rendus des réunions
// conclues, synthèses des missions) qui n'est plus dans les entrées récentes — récupère ce
// que l'ancienne rotation avait supprimé. Par lots, pour les gros projets.
async function rebuildFromHistory(projectId, { fromScratch = false } = {}) {
  if (running.has(projectId)) return false;
  running.add(projectId);
  try {
    const { missionDigest } = require('../utils/projectMemory');
    const [p] = await db('Project').where({ id: projectId }).select('context', 'memorySummary', 'memoryEditedAt').limit(1);
    const recent = String(p?.context || '');
    const fmt = d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const sessions = await db('Session').where({ projectId, status: 'accepted' }).whereNotNull('summary').orderBy('createdAt', 'asc').select('id', 'task', 'summary', 'createdAt');
    const missions = await db('AgentMission').where({ projectId, status: 'done' }).orderBy('finishedAt', 'asc').select('id', 'title', 'agentName', 'report', 'finishedAt');
    const items = [
      ...sessions.filter(s => !recent.includes(`[SESSION:${s.id} |`)).map(s => ({ at: s.createdAt, text: `[SESSION:${s.id} | ${fmt(s.createdAt)} — ${s.task}]\n${s.summary}` })),
      ...missions.filter(m => !recent.includes(`[MISSION:${m.id} |`)).map(m => ({ at: m.finishedAt, text: `[MISSION:${m.id} | ${fmt(m.finishedAt)} — Mission « ${m.title} » menée pour ${m.agentName}]\n${missionDigest(m.report)}` })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at)).map(i => i.text);
    if (!items.length) return false;
    let summary = fromScratch ? null : (p.memorySummary || null);
    for (let i = 0; i < items.length;) {
      const batch = [];
      let size = 0;
      while (i < items.length && (batch.length === 0 || size + items[i].length < 24000)) { batch.push(items[i]); size += items[i].length; i++; }
      summary = await summarize({ summary, entries: batch, editedByHuman: !fromScratch && !!p.memoryEditedAt });
    }
    await db('Project').where({ id: projectId }).update({ memorySummary: summary, memorySummaryAt: new Date(), ...(fromScratch ? { memoryEditedAt: null } : {}) });
    return true;
  } finally {
    running.delete(projectId);
  }
}

// Réunion supprimée alors que son compte rendu a déjà été fondu dans la synthèse :
// on retire de la synthèse ce qui ne provient QUE de cette réunion
async function forgetInSummary(projectId, label) {
  const [p] = await db('Project').where({ id: projectId }).select('memorySummary').limit(1);
  if (!p?.memorySummary) return;
  const res = await anthropic.messages.create({
    model: DEFAULT_MODEL, max_tokens: 6000,
    system: 'Tu tiens la mémoire d\'un projet. Réponds uniquement par la synthèse corrigée, en Markdown, mêmes titres.',
    messages: [{ role: 'user', content: `SYNTHÈSE :\n${p.memorySummary}\n\nLa réunion « ${label} » a été supprimée par l'humain. Retire les points dont la SEULE source est cette réunion ; pour un point qui a aussi d'autres sources, retire seulement cette source. Ne change rien d'autre.` }],
  });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (/^##\s/m.test(text)) await db('Project').where({ id: projectId }).update({ memorySummary: text, memorySummaryAt: new Date() });
}

// Projet existant sans synthèse : première synthèse construite en arrière-plan depuis
// l'historique (au premier tour de réunion), sans attendre
function bootstrapIfNeeded(project) {
  if (project?.memorySummary || !project?.id || running.has(project.id)) return;
  setImmediate(() => rebuildFromHistory(project.id).catch(err => console.error('[memory] première synthèse :', err.message)));
}

module.exports = {
  RECENT_MAX, RECENT_KEEP, SECTIONS, buildConsolidationPrompt, splitForConsolidation,
  consolidate, consolidateSoon, rebuildFromHistory, forgetInSummary, bootstrapIfNeeded, memoryForPrompt,
};
