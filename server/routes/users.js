const express = require('express');
const bcrypt = require('bcryptjs');
const { db, persist, uid } = require('../store');
const { requireAuth, requireAdmin } = require('../middleware');
const { publicUser } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// --- Perfil propio ---
router.get('/me', (req, res) => res.json({ user: publicUser(req.user) }));

router.put('/me', (req, res) => {
  const data = db();
  const { name, email } = req.body || {};
  const user = data.users.find(u => u.id === req.user.id);
  if (name) user.name = String(name).trim();
  if (email) {
    const newEmail = String(email).trim().toLowerCase();
    if (data.users.some(u => u.id !== user.id && u.email === newEmail)) {
      return res.status(400).json({ error: 'Ese email ya lo usa otra cuenta.' });
    }
    user.email = newEmail;
  }
  persist();
  res.json({ user: publicUser(user) });
});

router.put('/me/password', async (req, res) => {
  const data = db();
  const { currentPassword, newPassword } = req.body || {};
  const user = data.users.find(u => u.id === req.user.id);
  const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  persist();
  res.json({ ok: true });
});

// PIN de acceso rápido (4 dígitos): crear o cambiar. Pide la contraseña actual
// para que nadie con la sesión abierta pueda ponerte un PIN sin tu permiso.
router.put('/me/pin', async (req, res) => {
  const data = db();
  const { currentPassword, pin } = req.body || {};
  const user = data.users.find(u => u.id === req.user.id);
  const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'El PIN debe tener exactamente 4 dígitos.' });
  user.pinHash = await bcrypt.hash(String(pin), 10);
  user.pinAttempts = 0;
  user.pinLockedUntil = null;
  persist();
  res.json({ ok: true });
});

router.delete('/me/pin', async (req, res) => {
  const data = db();
  const { currentPassword } = req.body || {};
  const user = data.users.find(u => u.id === req.user.id);
  const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  user.pinHash = null;
  user.pinAttempts = 0;
  user.pinLockedUntil = null;
  persist();
  res.json({ ok: true });
});

// Lista mínima (id + nombre) para asignar tareas del Kanban (plan Fase 6):
// cualquier usuario logueado la necesita, no solo el admin, así que va antes
// de requireAdmin y no expone email/rol.
router.get('/assignable', (req, res) => {
  res.json({ items: db().users.map(u => ({ id: u.id, name: u.name })) });
});

// --- Gestión de usuarios (solo admin) ---
router.get('/', requireAdmin, (req, res) => {
  res.json({ users: db().users.map(publicUser) });
});

router.post('/', requireAdmin, async (req, res) => {
  const data = db();
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Nombre, email y una contraseña de al menos 6 caracteres son obligatorios.' });
  }
  const normEmail = String(email).trim().toLowerCase();
  if (data.users.some(u => u.email === normEmail)) return res.status(400).json({ error: 'Ya existe una cuenta con ese email.' });
  const user = {
    id: uid('user'), name: String(name).trim(), email: normEmail,
    passwordHash: await bcrypt.hash(password, 10), role: role === 'admin' ? 'admin' : 'colaborador',
    createdAt: new Date().toISOString()
  };
  data.users.push(user);
  persist();
  res.status(201).json({ user: publicUser(user) });
});

// Secciones del menú que puede ver cada usuario no-admin (AC9). null = ve todo
// (igual que un usuario nunca restringido). Un administrador siempre ve todo,
// se ignora lo que se mande aquí para su propia cuenta.
const KNOWN_SECTIONS = ['dashboard', 'clients', 'budgets', 'kanban', 'contracted', 'invoices', 'catalog', 'calculator', 'hours', 'profitability', 'settings', 'email'];

router.put('/:id', requireAdmin, (req, res) => {
  const data = db();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { name, email, role, visibleSections } = req.body || {};
  if (name) user.name = String(name).trim();
  if (email) user.email = String(email).trim().toLowerCase();
  if (role && (role === 'admin' || role === 'colaborador')) {
    if (user.role === 'admin' && role !== 'admin' && data.users.filter(u => u.role === 'admin').length <= 1) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador.' });
    }
    user.role = role;
  }
  if (visibleSections !== undefined) {
    if (visibleSections === null) {
      user.visibleSections = null;
    } else {
      if (!Array.isArray(visibleSections) || visibleSections.some(s => !KNOWN_SECTIONS.includes(s))) {
        return res.status(400).json({ error: 'Lista de secciones no válida.' });
      }
      user.visibleSections = visibleSections;
    }
  }
  persist();
  res.json({ user: publicUser(user) });
});

router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const data = db();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  persist();
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const data = db();
  const user = data.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (user.role === 'admin' && data.users.filter(u => u.role === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Debe quedar al menos un administrador.' });
  }
  if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta mientras tienes sesión iniciada.' });
  data.users = data.users.filter(u => u.id !== user.id);
  persist();
  res.json({ ok: true });
});

module.exports = router;
