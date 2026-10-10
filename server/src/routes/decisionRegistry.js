// Registre des décisions du projet — monté sur /api/projects.
const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { findProject } = require('../utils/projectHelpers');
const { sanitizeDecision, listDecisions, STATUSES } = require('../services/decisions');

// Colonnes de la table Decision uniquement : sanitizeDecision renvoie aussi des champs
// d'affichage (ex. vigilance, relecture du contradicteur) qui n'y sont pas stockés.
const toRow = ({ statement, rationale, rejectedOptions, origin }) => ({ statement, rationale, rejectedOptions: JSON.stringify(rejectedOptions), origin });

const router = express.Router();
router.use(authMiddleware);

const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);
const RETURN_FIELDS = ['id', 'projectId', 'sessionId', 'statement', 'rationale', 'rejectedOptions', 'origin', 'status', 'reopenNote', 'createdAt', 'updatedAt'];

// GET /api/projects/:id/decisions
router.get('/:id/decisions', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const decisions = await listDecisions(project.id);
    // Titre de la réunion d'origine, pour l'affichage
    const sessionIds = [...new Set(decisions.map(d => d.sessionId).filter(Boolean))];
    const sessions = sessionIds.length
      ? await db('Session').select('id', 'task').whereIn('id', sessionIds)
      : [];
    const taskById = Object.fromEntries(sessions.map(s => [s.id, s.task]));
    res.json(decisions.map(d => ({ ...d, sessionTask: d.sessionId ? taskById[d.sessionId] || null : null })));
  } catch (err) {
    console.error('[decisions GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/decisions/from-session — inscription des décisions
// validées par l'humain à la clôture d'une réunion : { sessionId, decisions: [...] }
router.post('/:id/decisions/from-session', async (req, res) => {
  const { sessionId } = req.body;
  const decisions = (Array.isArray(req.body.decisions) ? req.body.decisions : []).map(sanitizeDecision).filter(Boolean).slice(0, 30);
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const [session] = await db('Session').select('id').where({ id: sessionId, projectId: project.id }).limit(1);
    if (!session) return res.status(404).json({ error: 'Session introuvable' });
    if (decisions.length === 0) return res.json([]);
    const now = new Date();
    const rows = await db('Decision')
      .insert(decisions.map(d => ({
        ...toRow(d), projectId: project.id, sessionId: session.id,
        status: 'active', createdAt: now, updatedAt: now,
      })))
      .returning(RETURN_FIELDS);
    res.status(201).json(rows);
  } catch (err) {
    console.error('[decisions from-session POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/decisions — ajout manuel par l'humain
router.post('/:id/decisions', async (req, res) => {
  const d = sanitizeDecision({ ...req.body, origin: 'human' });
  if (!d) return res.status(400).json({ error: 'La décision (statement) est requise' });
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const now = new Date();
    const [row] = await db('Decision')
      .insert({ ...toRow(d), projectId: project.id, status: 'active', createdAt: now, updatedAt: now })
      .returning(RETURN_FIELDS);
    res.status(201).json(row);
  } catch (err) {
    console.error('[decisions POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id/decisions/:did — modifier, remettre en question, rétablir
router.patch('/:id/decisions/:did', async (req, res) => {
  const { statement, rationale, status, reopenNote } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status invalide (active | reopened | superseded)' });
  }
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const updates = { updatedAt: new Date() };
    if (statement !== undefined) {
      if (!String(statement).trim()) return res.status(400).json({ error: 'La décision ne peut pas être vide' });
      updates.statement = String(statement).trim().slice(0, 500);
    }
    if (rationale !== undefined) updates.rationale = String(rationale || '').trim().slice(0, 1000) || null;
    if (status !== undefined) {
      updates.status = status;
      // La note de remise en question n'a de sens que pour une décision rouverte
      updates.reopenNote = status === 'reopened' ? (String(reopenNote || '').trim().slice(0, 1000) || null) : null;
    }
    const [row] = await db('Decision')
      .where({ id: req.params.did, projectId: project.id })
      .update(updates)
      .returning(RETURN_FIELDS);
    if (!row) return res.status(404).json({ error: 'Décision introuvable' });
    res.json(row);
  } catch (err) {
    console.error('[decisions PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/decisions/:did
router.delete('/:id/decisions/:did', async (req, res) => {
  try {
    const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    const deleted = await db('Decision').where({ id: req.params.did, projectId: project.id }).delete();
    if (!deleted) return res.status(404).json({ error: 'Décision introuvable' });
    res.json({ message: 'Décision supprimée' });
  } catch (err) {
    console.error('[decisions DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
