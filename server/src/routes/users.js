const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

// GET /api/users/me — profil complet
router.get('/me', async (req, res) => {
  try {
    const [user] = await db('User')
      .select('id', 'email', 'role', 'username', 'tutorialSeenAt', 'tourProgress', 'reminderDay', 'createdAt')
      .where({ id: req.user.id })
      .limit(1);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    console.error('[users/me GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/me/username — définir ou modifier son pseudo
router.patch('/me/username', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Pseudo requis' });
  }
  const trimmed = username.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    return res.status(400).json({ error: 'Pseudo invalide (3-20 caractères, lettres, chiffres, - ou _)' });
  }
  try {
    const [existing] = await db('User').where({ username: trimmed }).limit(1);
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
    }
    await db('User').where({ id: req.user.id }).update({ username: trimmed });
    res.json({ username: trimmed });
  } catch (err) {
    console.error('[users/me/username PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users/me/tutorial-seen — guide de prise en main terminé ou fermé
router.post('/me/tutorial-seen', async (req, res) => {
  try {
    const [row] = await db('User').where({ id: req.user.id })
      .update({ tutorialSeenAt: new Date() }).returning(['tutorialSeenAt']);
    if (!row) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(row);
  } catch (err) {
    console.error('[users/me/tutorial-seen POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/me/reminders — jour d'envoi des rappels hebdomadaires (1 = lundi … 7 = dimanche)
router.patch('/me/reminders', async (req, res) => {
  const day = Number(req.body.reminderDay);
  if (!Number.isInteger(day) || day < 1 || day > 7) return res.status(400).json({ error: 'reminderDay : 1 (lundi) à 7 (dimanche)' });
  try {
    const [row] = await db('User').where({ id: req.user.id }).update({ reminderDay: day }).returning(['reminderDay']);
    res.json(row);
  } catch (err) {
    console.error('[users/me/reminders PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users/me/reminders/test — envoie tout de suite le rappel (sans attendre le jour)
router.post('/me/reminders/test', async (req, res) => {
  try {
    const [user] = await db('User').where({ id: req.user.id }).select('id', 'email').limit(1);
    res.json(await require('../services/reminders').sendDigestTo(user));
  } catch (err) {
    console.error('[users/me/reminders/test]', err.message);
    res.status(500).json({ error: 'Envoi impossible' });
  }
});

// PATCH /api/users/me/tour — chapitre de la visite guidée terminé { chapter }
const TOUR_CHAPTERS = ['create', 'shared', 'dashboard', 'plan', 'meeting', 'close', 'admin'];
router.patch('/me/tour', async (req, res) => {
  const { chapter } = req.body;
  if (!TOUR_CHAPTERS.includes(chapter)) return res.status(400).json({ error: 'Chapitre inconnu' });
  try {
    const [row] = await db('User').where({ id: req.user.id })
      .update({ tourProgress: db.raw(`"tourProgress" || ?::jsonb`, [JSON.stringify({ [chapter]: new Date().toISOString() })]) })
      .returning(['tourProgress']);
    if (!row) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(row);
  } catch (err) {
    console.error('[users/me/tour PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/check-username/:username — disponibilité d'un pseudo (validation temps réel)
router.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;
  if (!USERNAME_REGEX.test(username)) {
    return res.json({ available: false, reason: 'format' });
  }
  try {
    const [existing] = await db('User').where({ username }).limit(1);
    const available = !existing || existing.id === req.user.id;
    res.json({ available });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/by-username/:username — résolution pseudo → user (pour invitation)
router.get('/by-username/:username', async (req, res) => {
  try {
    const [user] = await db('User')
      .select('id', 'email', 'username', 'role')
      .where({ username: req.params.username })
      .limit(1);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    console.error('[users/by-username GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
