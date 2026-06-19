const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de créations de compte depuis cette IP. Réessayez dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    const [user] = await db('User').where({ email }).limit(1);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    res.json({
      token: makeToken(user),
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

// POST /api/auth/register — inscription par invitation uniquement
router.post('/register', registerLimiter, async (req, res) => {
  const { token, password, username } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Token d'invitation et mot de passe requis" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  }

  const cleanUsername = username?.trim() || null;
  if (cleanUsername && !USERNAME_REGEX.test(cleanUsername)) {
    return res.status(400).json({ error: 'Pseudo invalide (3-20 caractères, lettres, chiffres, - ou _)' });
  }

  try {
    const [invitation] = await db('Invitation').where({ token }).limit(1);
    if (!invitation || invitation.used) {
      return res.status(400).json({ error: 'Invitation invalide ou déjà utilisée' });
    }

    const [existing] = await db('User').where({ email: invitation.email }).limit(1);
    if (existing) {
      return res.status(400).json({ error: 'Un compte existe déjà pour cet email' });
    }

    if (cleanUsername) {
      const [takenUsername] = await db('User').where({ username: cleanUsername }).limit(1);
      if (takenUsername) {
        return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
      }
    }

    const hashed = await bcrypt.hash(password, 12);
    const [user] = await db('User')
      .insert({ id: randomUUID(), email: invitation.email, password: hashed, role: 'member', username: cleanUsername })
      .returning(['id', 'email', 'role', 'username']);

    await db('Invitation').where({ token }).update({ used: true });

    // Auto-adhésion au projet si l'invitation était liée à un projet spécifique
    if (invitation.projectId) {
      await db('ProjectMember')
        .insert({
          id: randomUUID(),
          projectId: invitation.projectId,
          userId: user.id,
          role: 'collaborator',
          invitedAt: new Date()
        })
        .onConflict(['projectId', 'userId']).ignore();
    }

    res.json({ token: makeToken(user), user });
  } catch (err) {
    console.error('[auth/register]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const [user] = await db('User')
      .select('id', 'email', 'role', 'username', 'createdAt')
      .where({ id: req.user.id })
      .limit(1);

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) {
    console.error('[auth/me]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
