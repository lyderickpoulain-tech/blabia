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
      .select('id', 'email', 'role', 'username', 'createdAt')
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

// GET /api/users/me/tech-stack — environnement technique
router.get('/me/tech-stack', async (req, res) => {
  try {
    const [user] = await db('User').select(['techStack']).where({ id: req.user.id }).limit(1);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const techStack = typeof user.techStack === 'string'
      ? JSON.parse(user.techStack)
      : (user.techStack || {});
    res.json(techStack);
  } catch (err) {
    console.error('[users/me/tech-stack GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/me/tech-stack — sauvegarder l'environnement technique
router.patch('/me/tech-stack', async (req, res) => {
  const { techStack } = req.body;
  if (!techStack || typeof techStack !== 'object' || Array.isArray(techStack)) {
    return res.status(400).json({ error: 'techStack invalide' });
  }
  try {
    await db('User').where({ id: req.user.id }).update({
      techStack: JSON.stringify(techStack)
    });
    res.json({ message: 'Environnement sauvegardé' });
  } catch (err) {
    console.error('[users/me/tech-stack PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/users/me/toolbox — boîte à outils personnelle
router.get('/me/toolbox', async (req, res) => {
  try {
    const [user] = await db('User').select(['toolbox']).where({ id: req.user.id }).limit(1);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const toolbox = typeof user.toolbox === 'string'
      ? JSON.parse(user.toolbox)
      : (user.toolbox || {});
    res.json(toolbox);
  } catch (err) {
    console.error('[users/me/toolbox GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/me/toolbox — sauvegarder la boîte à outils
router.patch('/me/toolbox', async (req, res) => {
  const { toolbox } = req.body;
  if (!toolbox || typeof toolbox !== 'object' || Array.isArray(toolbox)) {
    return res.status(400).json({ error: 'toolbox invalide' });
  }
  try {
    await db('User').where({ id: req.user.id }).update({
      toolbox: JSON.stringify(toolbox)
    });
    res.json({ message: 'Boîte à outils sauvegardée' });
  } catch (err) {
    console.error('[users/me/toolbox PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
