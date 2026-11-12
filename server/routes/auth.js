const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db, persist, uid } = require('../store');

const router = express.Router();

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

// Límite de intentos por IP para las rutas de acceso. El PIN ya tiene su propio
// bloqueo por usuario (ver más abajo); esto añade protección extra a nivel de
// red frente a fuerza bruta cuando el CRM sea accesible desde internet, sin
// afectar al uso normal (10 intentos / 15 min es más que de sobra para un
// despiste tecleando la contraseña).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos desde esta conexión. Espera unos minutos y vuelve a intentarlo.' }
});

function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt, hasPin: !!u.pinHash,
    visibleSections: u.visibleSections === undefined ? null : u.visibleSections
  };
}

router.get('/status', (req, res) => {
  const data = db();
  res.json({
    needsSetup: data.users.length === 0,
    user: req.session.userId ? publicUser(data.users.find(u => u.id === req.session.userId) || {}) : null
  });
});

// Alta del primer administrador. Solo funciona si todavia no hay usuarios.
router.post('/setup', loginLimiter, async (req, res) => {
  const data = db();
  if (data.users.length > 0) return res.status(400).json({ error: 'La cuenta de administrador ya existe.' });
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Nombre, email y una contraseña de al menos 6 caracteres son obligatorios.' });
  }
  const user = {
    id: uid('user'), name: String(name).trim(), email: String(email).trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10), role: 'admin', createdAt: new Date().toISOString()
  };
  data.users.push(user);
  persist();
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const data = db();
  const { email, password } = req.body || {};
  const user = data.users.find(u => u.email === String(email || '').trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// --- Acceso rápido con PIN (sin exponer email/contraseña) ---
// Lista pública (sin sesión) de usuarios que tienen PIN activado, para mostrarlos
// como avatares seleccionables en la pantalla de login. No incluye datos sensibles.
router.get('/pin-users', (req, res) => {
  const data = db();
  const items = data.users.filter(u => u.pinHash).map(u => ({ id: u.id, name: u.name, role: u.role }));
  res.json({ items });
});

router.post('/pin-login', loginLimiter, async (req, res) => {
  const data = db();
  const { userId, pin } = req.body || {};
  const user = data.users.find(u => u.id === userId);
  if (!user || !user.pinHash) return res.status(401).json({ error: 'PIN no disponible para este usuario.' });

  if (user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date()) {
    const minsLeft = Math.max(1, Math.ceil((new Date(user.pinLockedUntil) - new Date()) / 60000));
    return res.status(429).json({ error: `PIN bloqueado por demasiados intentos. Prueba con tu contraseña o espera ${minsLeft} min.` });
  }

  const ok = await bcrypt.compare(String(pin || ''), user.pinHash);
  if (!ok) {
    user.pinAttempts = (user.pinAttempts || 0) + 1;
    const left = Math.max(0, PIN_MAX_ATTEMPTS - user.pinAttempts);
    let msg = `PIN incorrecto. Te queda${left === 1 ? '' : 'n'} ${left} intento${left === 1 ? '' : 's'}.`;
    if (user.pinAttempts >= PIN_MAX_ATTEMPTS) {
      user.pinLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60000).toISOString();
      user.pinAttempts = 0;
      msg = `PIN bloqueado ${PIN_LOCK_MINUTES} min por demasiados intentos. Prueba con tu contraseña.`;
    }
    persist();
    return res.status(401).json({ error: msg });
  }

  user.pinAttempts = 0;
  user.pinLockedUntil = null;
  persist();
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

module.exports = { router, publicUser };
