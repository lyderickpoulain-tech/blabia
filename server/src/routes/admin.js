const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');
const { canManageUsers, SUPERVISOR_EMAIL } = require('../middleware/admin');
const { sendInvitation, sendTestEmail } = require('../services/email');

const router = express.Router();
router.use(authMiddleware, canManageUsers);

const ALLOWED_ROLES = ['user', 'member', 'admin', 'supervisor'];

// GET /api/admin/invitations
router.get('/invitations', async (req, res) => {
  try {
    const invitations = await db('Invitation')
      .select('id', 'email', 'token', 'used', 'createdAt', 'createdBy')
      .orderBy('createdAt', 'desc');
    res.json(invitations);
  } catch (err) {
    console.error('[admin/invitations GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/invitations
router.post('/invitations', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  try {
    const [existingUser] = await db('User').where({ email }).limit(1);
    if (existingUser) {
      return res.status(400).json({ error: 'Un compte existe déjà pour cet email' });
    }

    const [pendingInvite] = await db('Invitation').where({ email, used: false }).limit(1);
    if (pendingInvite) {
      return res.status(400).json({ error: 'Une invitation est déjà en attente pour cet email' });
    }

    const token = randomUUID();
    const [invitation] = await db('Invitation')
      .insert({ id: randomUUID(), email, token, used: false, createdBy: req.user.email })
      .returning(['id', 'email', 'token', 'used', 'createdAt', 'createdBy']);

    await sendInvitation(email, token, req.user.email);

    res.status(201).json(invitation);
  } catch (err) {
    console.error('[admin/invitations POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/invitations/:id
router.delete('/invitations/:id', async (req, res) => {
  try {
    const [invitation] = await db('Invitation').where({ id: req.params.id }).limit(1);
    if (!invitation) return res.status(404).json({ error: 'Invitation introuvable' });
    if (invitation.used) {
      return res.status(400).json({ error: 'Impossible de supprimer une invitation déjà utilisée' });
    }

    await db('Invitation').where({ id: req.params.id }).delete();
    res.json({ message: 'Invitation supprimée' });
  } catch (err) {
    console.error('[admin/invitations DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/test-email
router.post('/test-email', async (req, res) => {
  try {
    await sendTestEmail(req.user.email);
    res.json({ message: `Email de test envoyé à ${req.user.email}` });
  } catch (err) {
    console.error('[admin/test-email]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await db('User')
      .select('id', 'email', 'role', 'createdAt')
      .orderBy('createdAt', 'desc');
    res.json(users);
  } catch (err) {
    console.error('[admin/users GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/users/:id/role — changer le rôle d'un utilisateur
router.put('/users/:id/role', async (req, res) => {
  const requesterRole = req.user.role;
  const { role: newRole } = req.body;

  if (!ALLOWED_ROLES.includes(newRole)) {
    return res.status(400).json({ error: `Rôle invalide. Valeurs acceptées : ${ALLOWED_ROLES.join(', ')}` });
  }

  try {
    const [target] = await db('User').where({ id: req.params.id }).limit(1);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Protéger contact@rasia-editions.fr contre toute rétrogradation
    if (target.email === SUPERVISOR_EMAIL) {
      return res.status(403).json({ error: 'Ce compte est protégé et ne peut pas être modifié' });
    }

    // Un admin ne peut pas promouvoir en supervisor
    if (requesterRole === 'admin' && newRole === 'supervisor') {
      return res.status(403).json({ error: 'Les administrateurs ne peuvent pas attribuer le rôle supervisor' });
    }

    // Un admin peut uniquement changer user↔member et promouvoir en admin
    if (requesterRole === 'admin' && !['user', 'member', 'admin'].includes(newRole)) {
      return res.status(403).json({ error: 'Action non autorisée pour votre rôle' });
    }

    await db('User').where({ id: req.params.id }).update({ role: newRole });
    res.json({ message: 'Rôle mis à jour', role: newRole });
  } catch (err) {
    console.error('[admin/users/:id/role PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
