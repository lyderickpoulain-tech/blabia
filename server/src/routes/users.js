const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const userKeys = require('../services/userKeys');
const { adaptForModel } = require('../services/anthropic');
const { ORCHESTRATOR_MODEL } = require('../services/models');

const router = express.Router();
router.use(authMiddleware);

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

// GET /api/users/me — profil complet
router.get('/me', async (req, res) => {
  try {
    const [user] = await db('User')
      .select('id', 'email', 'role', 'username', 'tutorialSeenAt', 'tourProgress', 'reminderDay', 'createdAt',
        'anthropicApiKey', 'anthropicKeyLast4', 'anthropicKeyStatus', 'anthropicKeyError', 'anthropicKeyCheckedAt')
      .where({ id: req.user.id })
      .limit(1);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const { anthropicApiKey, anthropicKeyLast4, anthropicKeyStatus, anthropicKeyError, anthropicKeyCheckedAt, ...profile } = user;
    res.json({ ...profile, anthropicKey: await keySummary(req.user.id, user) });
  } catch (err) {
    console.error('[users/me GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// « Apportez votre clé API » (v5.1, services/userKeys.js) : état de la clé (jamais la clé
// elle-même) et ce que l'IA de mes projets a coûté ce mois-ci, sur ma clé et sur celle de BlabIA
async function keySummary(userId, user) {
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const rows = await db('UsageLog').join('Project', 'Project.id', 'UsageLog.projectId')
    .where('Project.userId', userId).where('UsageLog.createdAt', '>=', since)
    .groupBy('UsageLog.billedTo').select('UsageLog.billedTo', db.raw('COALESCE(SUM("UsageLog"."costUSD"), 0) AS cost'));
  const month = Object.fromEntries(rows.map(r => [r.billedTo, Number(r.cost) || 0]));
  return {
    configured: !!user.anthropicApiKey,
    last4: user.anthropicKeyLast4 || null,
    status: user.anthropicApiKey ? (user.anthropicKeyStatus || 'ok') : null,
    error: user.anthropicKeyError || null,
    checkedAt: user.anthropicKeyCheckedAt || null,
    monthUSD: { user: month.user || 0, blabia: month.blabia || 0 },
  };
}
const keyRow = id => db('User').where({ id }).select('anthropicApiKey', 'anthropicKeyLast4', 'anthropicKeyStatus', 'anthropicKeyError', 'anthropicKeyCheckedAt').first();

// PUT /api/users/me/anthropic-key { apiKey } — vérifiée auprès d'Anthropic, puis chiffrée
router.put('/me/anthropic-key', async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (!userKeys.KEY_RE.test(apiKey)) {
    return res.status(400).json({ error: 'Ce n’est pas une clé API Anthropic : elle commence par « sk-ant- » (Claude Console › API keys).' });
  }
  try {
    const params = adaptForModel({ model: ORCHESTRATOR_MODEL, max_tokens: 16, messages: [{ role: 'user', content: 'ok' }] });
    delete params.fallbacks;
    const check = await userKeys.testKey(apiKey, params);
    if (check.status === 'invalid') return res.status(400).json({ error: 'Anthropic refuse cette clé (révoquée ou mal copiée).' });
    if (check.status === 'error') return res.status(502).json({ error: 'Anthropic ne répond pas : réessayez dans un instant.' });
    await userKeys.saveKey(req.user.id, apiKey, check);
    res.json({ anthropicKey: await keySummary(req.user.id, await keyRow(req.user.id)) });
  } catch (err) {
    console.error('[users/me/anthropic-key PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/users/me/anthropic-key — retour à la clé de BlabIA
router.delete('/me/anthropic-key', async (req, res) => {
  try {
    await userKeys.removeKey(req.user.id);
    res.json({ anthropicKey: await keySummary(req.user.id, await keyRow(req.user.id)) });
  } catch (err) {
    console.error('[users/me/anthropic-key DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/me/username — définir ou modifier son pseudo
router.patch('/me/username', async (req, res) => {
  const { username } = req.body;
  if (typeof username !== 'string') {
    return res.status(400).json({ error: 'Pseudo requis' });
  }
  const trimmed = username.trim();
  // Chaîne vide : suppression du pseudo
  if (!trimmed) {
    try {
      await db('User').where({ id: req.user.id }).update({ username: null });
      return res.json({ username: null });
    } catch (err) {
      console.error('[users/me/username PATCH]', err.message);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }
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
