const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/users/me/tech-stack — récupère l'environnement technique de l'utilisateur connecté
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

// PATCH /api/users/me/tech-stack — sauvegarde l'environnement technique
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

module.exports = router;
