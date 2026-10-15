const express = require('express');
const { randomUUID } = require('crypto');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const anthropic = require('../services/anthropic');
const { findProject } = require('../utils/projectHelpers');
const { DEFAULT_MODEL } = require('../services/models');
const { listDecisions, formatRegistryForPrompt } = require('../services/decisions');
const { listActions } = require('../services/actions');
const { projectObjective } = require('../utils/projectObjective');

// Récapitulatif du projet (v5.1, 15/10/2026) : une fois le plan terminé, un bilan bref de
// TOUT le projet qui répond point par point aux objectifs de départ (brief) et donne le
// résultat concret. Rangé dans les documents (« Récapitulatif du projet »), régénérable.
const router = express.Router();
router.use(authMiddleware);
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);
const RECAP_NAME = 'Récapitulatif du projet';
const SUMMARY_CHARS = 3500;   // par compte rendu
const TOTAL_CHARS = 45000;    // ensemble des comptes rendus (les plus récents gardés en entier)

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}\n[…]` : s);

async function recapDocument(projectId) {
  return db('ProjectDocument').where({ projectId, name: RECAP_NAME }).orderBy('createdAt', 'desc').first('id', 'content', 'createdAt');
}

// GET /api/projects/:id/recap — récapitulatif existant (ou null)
router.get('/:id/recap', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const doc = await recapDocument(project.id);
    res.json(doc ? { content: doc.content, createdAt: doc.createdAt } : null);
  } catch (err) {
    console.error('[recap GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function buildRecapPrompt({ project, milestones, sessions, registryText, actions }) {
  let budget = TOTAL_CHARS;
  // Du plus récent au plus ancien pour garder la fin du projet entière, puis remis dans l'ordre
  const reports = [...sessions].reverse().map(s => {
    const text = clip(String(s.summary || '').trim(), Math.min(SUMMARY_CHARS, Math.max(0, budget)));
    budget -= text.length;
    return text ? `### ${s.task} (${new Date(s.createdAt).toLocaleDateString('fr-FR')})\n${text}` : null;
  }).filter(Boolean).reverse().join('\n\n');
  const done = actions.filter(a => a.status === 'done').map(a => `- ${a.title}`).join('\n');
  const open = actions.filter(a => ['todo', 'in_progress'].includes(a.status)).map(a => `- ${a.title}`).join('\n');
  const simple = (project.expertiseLevel ?? 3) <= 2;
  return {
    system: 'Tu rédiges le bilan final d\'un projet mené en réunions avec des agents IA. Français, clair, concret, sans jargon inutile. Markdown simple : titres ##, listes, tableaux seulement si utiles. Tu ne gardes que ce qui répond aux objectifs.',
    user: `Projet : ${project.name}
OBJECTIFS DE DÉPART (brief) :
${String(project.brief || project.description || '(non renseignés)').trim()}

PLAN DES RÉUNIONS :
${milestones.map((m, i) => `R${i + 1}. ${m.title} — ${m.status === 'done' ? 'tenue' : 'non tenue'}`).join('\n') || '(aucun)'}

DÉCISIONS EN VIGUEUR (registre) :
${registryText || '(aucune)'}

ACTIONS FAITES :
${done || '(aucune)'}
ACTIONS RESTANT À FAIRE :
${open || '(aucune)'}

COMPTES RENDUS DES RÉUNIONS (dans l'ordre) :
${reports || '(aucun)'}

Rédige un récapitulatif BREF (une page au plus) qui répond aux objectifs de départ, avec exactement ces parties :
## Objectif de départ
Une ou deux phrases.
## Résultat
Le livrable concret que le projet devait produire, tel qu'il ressort des réunions (par exemple la liste retenue, le choix final, le plan d'action), complet et directement utilisable. C'est la partie la plus importante.
## Réponse aux objectifs
Pour chaque objectif ou contrainte du brief : atteint, partiellement atteint ou non atteint, en une phrase avec ce qui le montre.
## Décisions clés
Les 3 à 6 décisions qui ont fait le résultat.
## Ce qui reste à faire
Actions ouvertes et points non tranchés ; « Rien » s'il n'y en a pas.
N'invente rien : si une information manque dans les comptes rendus, dis-le.${simple ? ' Le lecteur n\'est pas du métier : explique tout terme technique.' : ''}`,
  };
}

// POST /api/projects/:id/recap — (re)génère le récapitulatif
router.post('/:id/recap', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const sessions = await db('Session').where({ projectId: project.id, status: 'accepted' }).whereNotNull('summary')
      .orderBy('createdAt', 'asc').select('task', 'summary', 'createdAt');
    if (!sessions.length) return res.status(409).json({ error: 'Aucune réunion conclue : rien à récapituler pour l’instant.' });
    const milestones = await db('Milestone').where({ projectId: project.id }).orderBy('displayOrder', 'asc').select('title', 'status');
    const registryText = formatRegistryForPrompt(await listDecisions(project.id)).activeText;
    const actions = await listActions(project.id);
    const prompt = buildRecapPrompt({ project, milestones, sessions, registryText, actions });
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL, max_tokens: 4000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    });
    const content = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!content) return res.status(502).json({ error: 'Le récapitulatif n’a pas pu être rédigé : réessayez.' });
    await db.transaction(async trx => {
      await trx('ProjectDocument').where({ projectId: project.id, name: RECAP_NAME }).del();
      await trx('ProjectDocument').insert({
        id: randomUUID(), projectId: project.id, name: RECAP_NAME, mimeType: 'text/markdown',
        sizeBytes: Buffer.byteLength(content), charCount: content.length, content, enabled: true,
        createdAt: new Date(), createdBy: req.user.id,
      });
    });
    res.json({ content, createdAt: new Date(), objective: projectObjective(project) });
  } catch (err) {
    console.error('[recap POST]', err.message);
    res.status(500).json({ error: 'Le récapitulatif n’a pas pu être rédigé.' });
  }
});

module.exports = router;
module.exports.buildRecapPrompt = buildRecapPrompt;
