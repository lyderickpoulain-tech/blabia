const jwt = require('jsonwebtoken');
const db = require('../utils/db');

// Contrôle de sécurité du 18/11/2026 : le jeton seul ne suffit plus. Un compte supprimé ou
// dont le rôle a changé gardait ses droits jusqu'à l'expiration du jeton (24 h) ; le compte est
// désormais relu (au plus toutes les 30 s, par compte), et seul l'algorithme HS256 est accepté.
const CACHE_MS = 30 * 1000;
const cache = new Map(); // id → { at, user }

async function currentUser(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.user;
  const user = await db('User').where({ id }).first('id', 'email', 'role');
  cache.set(id, { at: Date.now(), user: user || null });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return user || null;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
  try {
    const user = await currentUser(payload.id);
    if (!user) return res.status(401).json({ error: 'Compte introuvable' });
    req.user = { ...payload, email: user.email, role: user.role };
    next();
  } catch (err) {
    console.error('[auth]', err.message);
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }
}

// Après un changement de rôle ou une suppression de compte (routes d'administration)
authMiddleware.forget = id => cache.delete(id);

module.exports = authMiddleware;
