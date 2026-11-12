const { db } = require('./store');

function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return db().users.find(u => u.id === req.session.userId) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'No has iniciado sesión.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Necesitas permisos de administrador.' });
  next();
}

// Bloquea una sección del menú para un usuario no-admin al que el administrador
// se la ha quitado (AC9): no basta con ocultarla en el Sidebar, la API también
// tiene que rechazar la ruta aunque se llame directamente. requireAuth tiene que
// ejecutarse antes para que exista req.user. visibleSections === null significa
// "ve todo" (admin siempre, y usuarios ya existentes antes de este permiso).
function requireSection(sectionKey) {
  return (req, res, next) => {
    // No depende de que requireAuth ya haya corrido antes en la cadena de
    // middlewares (aquí se monta en server.js, antes del router de cada
    // recurso, que es quien normalmente llama a requireAuth) — resuelve el
    // usuario por sí mismo con currentUser().
    const user = req.user || currentUser(req);
    if (!user) return res.status(401).json({ error: 'No has iniciado sesión.' });
    req.user = user;
    if (user.role === 'admin') return next();
    const sections = user.visibleSections;
    if (sections == null || sections.includes(sectionKey)) return next();
    return res.status(403).json({ error: 'No tienes acceso a esta sección del CRM.' });
  };
}

module.exports = { currentUser, requireAuth, requireAdmin, requireSection };
