const express = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const authMiddleware = require('../middleware/auth');
const db = require('../utils/db');
const { findProject } = require('../utils/projectHelpers');
const { MAX_DOCUMENTS, MAX_STORED_CHARS, extractText, listDocuments } = require('../services/documents');

// Documents de référence du projet (v5.1) : dépôt, liste, aperçu, activation, suppression.
const router = express.Router();
router.use(authMiddleware);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const isAdminOf = req => ['admin', 'supervisor'].includes(req.user.role);

async function access(req, res) {
  const project = await findProject(req.params.id, req.user.id, isAdminOf(req));
  if (!project) res.status(404).json({ error: 'Projet introuvable' });
  return project;
}

// GET /api/projects/:id/documents — liste (sans le texte, avec un court extrait)
router.get('/:id/documents', async (req, res) => {
  try {
    if (!(await access(req, res))) return;
    const docs = await listDocuments(req.params.id, { withContent: true });
    res.json(docs.map(({ content, ...d }) => ({ ...d, excerpt: content.slice(0, 280) })));
  } catch (err) {
    console.error('[documents GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/projects/:id/documents/:did — texte complet (aperçu)
router.get('/:id/documents/:did', async (req, res) => {
  try {
    if (!(await access(req, res))) return;
    const [doc] = await db('ProjectDocument').where({ id: req.params.did, projectId: req.params.id }).limit(1);
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });
    res.json(doc);
  } catch (err) {
    console.error('[documents/:did GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects/:id/documents — dépôt d'un fichier (champ « file »)
router.post('/:id/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier requis' });
  try {
    if (!(await access(req, res))) return;
    const [{ n }] = await db('ProjectDocument').where({ projectId: req.params.id }).count('id as n');
    if (Number(n) >= MAX_DOCUMENTS) {
      return res.status(400).json({ error: `${MAX_DOCUMENTS} documents au maximum par projet : supprimez-en un d'abord.` });
    }
    // multer décode le nom en latin-1 : on le relit en UTF-8 (accents)
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 200);
    const text = await extractText({ ...req.file, originalname: name });
    if (!text) return res.status(400).json({ error: 'Aucun texte lisible dans ce fichier (PDF scanné ou image ?).' });

    const content = text.slice(0, MAX_STORED_CHARS);
    const [doc] = await db('ProjectDocument').insert({
      id: randomUUID(), projectId: req.params.id, name, mimeType: req.file.mimetype || null,
      sizeBytes: req.file.size, charCount: content.length, content, enabled: true,
      createdAt: new Date(), createdBy: req.user.id,
    }).returning(['id', 'name', 'mimeType', 'sizeBytes', 'charCount', 'enabled', 'createdAt']);
    res.status(201).json({ ...doc, excerpt: content.slice(0, 280), truncated: text.length > MAX_STORED_CHARS });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('[documents POST]', err.message);
    res.status(500).json({ error: 'Le fichier n’a pas pu être lu.' });
  }
});

// PATCH /api/projects/:id/documents/:did — { enabled?, name? }
router.patch('/:id/documents/:did', async (req, res) => {
  const updates = {};
  if (typeof req.body.enabled === 'boolean') updates.enabled = req.body.enabled;
  if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim().slice(0, 200);
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification' });
  try {
    if (!(await access(req, res))) return;
    const [doc] = await db('ProjectDocument').where({ id: req.params.did, projectId: req.params.id })
      .update(updates).returning(['id', 'name', 'mimeType', 'sizeBytes', 'charCount', 'enabled', 'createdAt']);
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });
    res.json(doc);
  } catch (err) {
    console.error('[documents PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/projects/:id/documents/:did
router.delete('/:id/documents/:did', async (req, res) => {
  try {
    if (!(await access(req, res))) return;
    const n = await db('ProjectDocument').where({ id: req.params.did, projectId: req.params.id }).delete();
    if (!n) return res.status(404).json({ error: 'Document introuvable' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('[documents DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
