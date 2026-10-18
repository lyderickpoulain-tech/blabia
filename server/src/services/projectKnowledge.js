// Ce que BlabIA sait d'un projet, en un texte (v5.1, 16/10/2026) : brief, plan des réunions,
// registre des décisions, actions, comptes rendus datés, mémoire, documents.
// Partagé par la zone « Demander à BlabIA » (routes/projects.js, quick-command) et le bras
// droit (routes/assistant.js). Avant, la zone ne recevait que les titres des réunions.
const db = require('../utils/db');
const { memoryForPrompt } = require('../utils/projectMemory');
const { listDecisions, formatRegistryForPrompt } = require('./decisions');
const { listActions } = require('./actions');
const { listDocuments, formatDocumentsForPrompt } = require('./documents');
const { getProjectTools } = require('./tools/toolsStore');
const { meetingState, openCards } = require('./meetingState');
const { parseJsonField } = require('../utils/parseJsonField');

const REPORTS_CHARS = 40000; // comptes rendus : les plus récents en entier, les plus anciens tronqués
const REPORT_CHARS = 4000;
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const STATUS = { done: 'tenue', in_progress: 'en cours', blocked: 'bloquée' };

async function projectKnowledge(project) {
  const milestones = await db('Milestone').where({ projectId: project.id }).orderBy('displayOrder');
  const sessions = await db('Session').where({ projectId: project.id, status: 'accepted' })
    .orderBy('createdAt', 'asc').select('id', 'task', 'summary', 'createdAt');
  // v5.1 (F2, constats sur « WorldOfMetal ») : le bras droit ne voyait que les réunions
  // conclues — il a renié la note de retour d'une réunion qu'il venait de tenir
  const openSessions = await db('Session').where({ projectId: project.id, status: 'open' })
    .orderBy('createdAt', 'asc').select('id', 'task', 'messages', 'delegation', 'createdAt');
  const STATE_LABEL = {
    question: 'des questions attendent l\'humain', answers_ready: 'l\'humain a répondu, elle peut reprendre',
    ready_to_close: 'prête à conclure (l\'humain doit cliquer « Conclure »)', idle: 'en pause', empty: 'pas encore commencée',
  };
  const openText = openSessions.map(s => {
    const msgs = parseJsonField(s.messages, []);
    const st = meetingState(msgs);
    const d = parseJsonField(s.delegation, null);
    const lines = [`### Réunion EN COURS « ${s.task} » (ouverte le ${fmtDate(s.createdAt)}) — ${STATE_LABEL[st.state] || st.state}`];
    if (d) {
      const status = { pending: 'confiée au bras droit, pas encore lancée', running: 'tenue en ce moment par toi (bras droit)', done: 'tenue par toi (bras droit), terminée', stopped: 'tenue par toi, interrompue', failed: 'confiée à toi, échec' }[d.status] || d.status;
      lines.push(`Délégation : ${status}${d.note?.headline ? ` — ta note de retour : ${d.note.headline}` : ''}`);
    }
    const qs = openCards(msgs).map(c => `- Question ouverte : ${c.question}`);
    if (qs.length) lines.push(...qs);
    const recent = msgs.filter(m => m.role === 'agent' && m.content).slice(-4).map(m => `- ${m.agentName} : ${String(m.content).replace(/\s+/g, ' ').slice(0, 220)}`);
    if (recent.length) lines.push('Derniers échanges :', ...recent);
    return lines.join('\n');
  }).join('\n\n');
  const registry = formatRegistryForPrompt(await listDecisions(project.id));
  const actions = await listActions(project.id);
  const documentsText = formatDocumentsForPrompt(await listDocuments(project.id, { withContent: true }));
  // v5.1 (test « Gérard ») : les outils retenus et leur coût — « combien ça coûte ? » est LA
  // question d'un débutant ; sans eux, le bras droit répondait que l'hébergement était le seul coût
  const euros = c => (!c ? 'coût non renseigné' : c.type === 'free' ? 'gratuit'
    : `${c.monthlyMin ?? 0} à ${c.monthlyMax ?? c.monthlyMin ?? 0} €/mois${c.type === 'subscription' ? ' (abonnement)' : c.type === 'usage' ? ' (selon l’utilisation)' : c.type === 'freemium' ? ' (gratuit au départ)' : ''}`);
  const tools = (await getProjectTools(project).catch(() => [])).filter(t => ['validated', 'suggested'].includes(t.status));
  const toolsText = tools.map(t => `- ${t.name} : ${euros(t.cost)}${t.status === 'suggested' ? ' — suggéré, pas encore retenu' : /^Pack recommandé/.test(t.why || '') ? ' — recommandé par BlabIA' : ''}${t.setupDone ? ' — en place' : ''}`).join('\n');
  let left = REPORTS_CHARS;
  const reports = [...sessions].reverse().map(s => {
    const text = String(s.summary || '').trim().slice(0, Math.min(REPORT_CHARS, Math.max(0, left)));
    left -= text.length;
    return `### Réunion « ${s.task} » — ${fmtDate(s.createdAt)}\n${text || '(pas de compte rendu)'}`;
  }).reverse().join('\n\n');

  const text = `Brief : ${project.brief || 'non défini'}${project.visionStatus === 'validated' && project.vision ? `
Sa vision, validée par lui (la référence ; signale tout écart) : ${project.vision}` : ''}
Réunions du plan (repère — titre — statut) :${milestones.length ? milestones.map((m, i) => `\nR${i + 1} — ${m.title} — ${STATUS[m.status] || 'à venir'}`).join('') : ' aucune'}

DÉCISIONS EN VIGUEUR (registre) :
${registry.activeText || '(aucune)'}
${registry.reopenedText ? `\nDÉCISIONS REMISES EN QUESTION :\n${registry.reopenedText}\n` : ''}
ACTIONS :
${actions.length ? actions.slice(0, 30).map(a => `- [${a.status === 'done' ? 'faite' : a.status === 'cancelled' ? 'annulée' : 'à faire'}] ${a.title}`).join('\n') : '(aucune)'}

OUTILS DU PROJET ET LEUR COÛT (estimations mensuelles) :
${toolsText || '(aucun outil retenu)'}

COMPTES RENDUS DES RÉUNIONS TENUES (dans l'ordre) :
${reports || '(aucune réunion tenue)'}

RÉUNIONS EN COURS (pas encore conclues ; leurs résultats ne sont pas encore au registre) :
${openText || '(aucune)'}

Mémoire du projet :
${memoryForPrompt(project) || 'aucune'}
${documentsText ? `\nDocuments de référence du projet (cite-les entre « » quand tu t'en sers) :\n${documentsText}\n` : ''}`;
  return { text, milestones };
}

module.exports = { projectKnowledge };
