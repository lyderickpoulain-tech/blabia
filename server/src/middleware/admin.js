const SUPERVISOR_EMAIL = 'contact@rasia-editions.fr';

function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

function isSupervisor(req, res, next) {
  if (req.user?.role !== 'supervisor') {
    return res.status(403).json({ error: 'Accès réservé aux superviseurs' });
  }
  next();
}

function canManageUsers(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'supervisor') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs et superviseurs' });
  }
  next();
}

module.exports = adminMiddleware;
module.exports.isSupervisor    = isSupervisor;
module.exports.canManageUsers  = canManageUsers;
module.exports.SUPERVISOR_EMAIL = SUPERVISOR_EMAIL;
