const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const AGENT_FIELDS = ['id', 'name', 'role', 'systemPrompt', 'emoji', 'isDefault', 'createdAt', 'userId'];

// GET /api/agents — agents par défaut + agents personnels de l'utilisateur
router.get('/', async (req, res) => {
  try {
    const agents = await db('Agent')
      .select(AGENT_FIELDS)
      .where(function () {
        this.where({ isDefault: true }).orWhere({ userId: req.user.id });
      })
      .orderBy([
        { column: 'isDefault', order: 'desc' },
        { column: 'createdAt', order: 'asc' }
      ]);

    res.json(agents);
  } catch (err) {
    console.error('[agents GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/agents — créer un agent personnalisé
router.post('/', async (req, res) => {
  const { name, role, systemPrompt, emoji = '🤖' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Le nom est requis' });
  if (!role?.trim()) return res.status(400).json({ error: 'Le rôle est requis' });
  // systemPrompt optionnel — génère un prompt par défaut si absent
  const effectivePrompt = systemPrompt?.trim() || `Tu es ${name.trim()}, ${role.trim()}. Contribue de façon concise et pertinente.`;

  try {
    const [agent] = await db('Agent')
      .insert({
        id: randomUUID(),
        name: name.trim(),
        role: role.trim(),
        systemPrompt: effectivePrompt,
        emoji: emoji.trim() || '🤖',
        isDefault: false,
        userId: req.user.id,
        createdAt: new Date()
      })
      .returning(AGENT_FIELDS);

    res.status(201).json(agent);
  } catch (err) {
    console.error('[agents POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/agents/:id — modifier un agent personnalisé (propriétaire ou admin)
router.patch('/:id', async (req, res) => {
  const { name, role, systemPrompt, emoji } = req.body;
  const isAdmin = req.user.role === 'admin';

  try {
    const [agent] = await db('Agent').where({ id: req.params.id }).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent introuvable' });
    if (agent.isDefault) return res.status(403).json({ error: 'Les agents par défaut ne sont pas modifiables' });
    if (!isAdmin && agent.userId !== req.user.id) return res.status(403).json({ error: 'Action non autorisée' });

    const updates = {};
    if (name?.trim())         updates.name         = name.trim();
    if (role?.trim())         updates.role         = role.trim();
    if (systemPrompt?.trim()) updates.systemPrompt = systemPrompt.trim();
    if (emoji !== undefined)  updates.emoji        = emoji.trim() || '🤖';

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    const [updated] = await db('Agent')
      .where({ id: req.params.id })
      .update(updates)
      .returning(AGENT_FIELDS);

    res.json(updated);
  } catch (err) {
    console.error('[agents/:id PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/agents/:id — supprimer un agent personnalisé (propriétaire ou admin)
router.delete('/:id', async (req, res) => {
  const isAdmin = req.user.role === 'admin';

  try {
    const [agent] = await db('Agent').where({ id: req.params.id }).limit(1);
    if (!agent) return res.status(404).json({ error: 'Agent introuvable' });
    if (agent.isDefault) return res.status(403).json({ error: 'Les agents par défaut ne peuvent pas être supprimés' });
    if (!isAdmin && agent.userId !== req.user.id) return res.status(403).json({ error: 'Action non autorisée' });

    await db('Agent').where({ id: req.params.id }).delete();
    res.json({ message: 'Agent supprimé' });
  } catch (err) {
    console.error('[agents/:id DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
