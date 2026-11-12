// Kanban de proyectos (plan Fase 6): cada tarjeta es un presupuesto en estado
// "aceptado" o "en_curso" (nunca un contrato recurrente, que no tiene tareas).
// Las columnas son configurables por el usuario; las tareas de cada tarjeta se
// pueden asignar a cualquier usuario del CRM.
const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth, requireAdmin } = require('../middleware');
const { calcBudget } = require('../calc');

const router = express.Router();
router.use(requireAuth);

const CARD_STATUSES = ['aceptado', 'en_curso'];

router.get('/columns', (req, res) => {
  res.json({ items: db().kanbanColumns });
});

// Reemplaza el conjunto completo de columnas (añadir, reordenar, renombrar,
// recolorear o borrar) — solo el administrador, es un cambio estructural.
router.put('/columns', requireAdmin, (req, res) => {
  const data = db();
  const items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!items || !items.length) return res.status(400).json({ error: 'Tiene que quedar al menos una columna.' });
  const keys = new Set();
  for (const raw of items) {
    const key = String(raw.key || '').trim();
    const label = String(raw.label || '').trim();
    if (!key || !label) return res.status(400).json({ error: 'Cada columna necesita clave y nombre.' });
    if (keys.has(key)) return res.status(400).json({ error: `Clave de columna repetida: ${key}` });
    keys.add(key);
  }
  const previousKeys = new Set(data.kanbanColumns.map(c => c.key));
  const removedKeys = [...previousKeys].filter(k => !keys.has(k));
  data.kanbanColumns = items.map((raw, i) => ({
    key: String(raw.key).trim(), label: String(raw.label).trim(), color: raw.color || '#64748b', order: i
  }));
  // Las tarjetas que estaban en una columna borrada vuelven a la primera columna.
  if (removedKeys.length) {
    const fallback = data.kanbanColumns[0].key;
    data.budgets = data.budgets.map(b => removedKeys.includes(b.kanbanColumn) ? { ...b, kanbanColumn: fallback } : b);
  }
  persist();
  res.json({ items: data.kanbanColumns });
});

function cardFromBudget(data, b) {
  const client = data.clients.find(c => c.id === b.clientId);
  const tasks = data.kanbanTasks.filter(t => t.budgetId === b.id).map(t => ({
    ...t, assigneeName: (data.users.find(u => u.id === t.assigneeId) || {}).name || null
  }));
  return { ...calcBudget(b, data.config), clientName: client ? client.name : 'Cliente eliminado', tasks };
}

router.get('/cards', (req, res) => {
  const data = db();
  const cards = data.budgets.filter(b => CARD_STATUSES.includes(b.status)).map(b => cardFromBudget(data, b));
  res.json({ items: cards });
});

router.post('/cards/:budgetId/move', (req, res) => {
  const data = db();
  const budget = data.budgets.find(b => b.id === req.params.budgetId);
  if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  if (!CARD_STATUSES.includes(budget.status)) return res.status(400).json({ error: 'Este presupuesto no está en el Kanban.' });
  const column = String(req.body.column || '');
  if (!data.kanbanColumns.some(c => c.key === column)) return res.status(400).json({ error: 'Columna no encontrada.' });
  const obj = { ...budget, kanbanColumn: column };
  data.budgets = data.budgets.map(b => b.id === obj.id ? obj : b);
  persist();
  res.json({ item: cardFromBudget(data, obj) });
});

router.post('/tasks', (req, res) => {
  const data = db();
  const budgetId = req.body.budgetId;
  const budget = data.budgets.find(b => b.id === budgetId);
  if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'La tarea necesita un título.' });
  const assigneeId = req.body.assigneeId || null;
  if (assigneeId && !data.users.some(u => u.id === assigneeId)) return res.status(400).json({ error: 'Usuario no encontrado.' });
  const task = { id: uid('ktk'), budgetId, title, assigneeId, done: false, createdAt: new Date().toISOString() };
  data.kanbanTasks.push(task);
  persist();
  res.status(201).json({ item: { ...task, assigneeName: (data.users.find(u => u.id === assigneeId) || {}).name || null } });
});

router.put('/tasks/:id', (req, res) => {
  const data = db();
  const task = data.kanbanTasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
  const next = { ...task };
  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: 'El título no puede quedar vacío.' });
    next.title = title;
  }
  if (req.body.assigneeId !== undefined) {
    if (req.body.assigneeId && !data.users.some(u => u.id === req.body.assigneeId)) {
      return res.status(400).json({ error: 'Usuario no encontrado.' });
    }
    next.assigneeId = req.body.assigneeId || null;
  }
  if (req.body.done !== undefined) next.done = !!req.body.done;
  data.kanbanTasks = data.kanbanTasks.map(t => t.id === next.id ? next : t);
  persist();
  res.json({ item: { ...next, assigneeName: (data.users.find(u => u.id === next.assigneeId) || {}).name || null } });
});

router.delete('/tasks/:id', (req, res) => {
  const data = db();
  if (!data.kanbanTasks.some(t => t.id === req.params.id)) return res.status(404).json({ error: 'Tarea no encontrada.' });
  data.kanbanTasks = data.kanbanTasks.filter(t => t.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

module.exports = router;
