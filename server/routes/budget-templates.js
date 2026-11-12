// Plantillas de presupuesto reutilizables (Fase 12.4): cada plantilla guarda solo
// serviceId + qty por línea, nunca un precio — al insertarse en un presupuesto
// (routes/budgets.js sanitizeLines) el precio se recalcula siempre con
// calcService, igual que cualquier línea nueva. Nunca se guarda una línea manual
// en una plantilla (no tendría catálogo real detrás que recalcular).
const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

function sanitizeTemplateLines(rawLines, services) {
  if (!Array.isArray(rawLines)) return [];
  return rawLines
    .filter(l => l && l.serviceId && services.some(s => s.id === l.serviceId))
    .map(l => ({ serviceId: l.serviceId, qty: Math.max(0.01, Number(l.qty) || 1) }));
}

router.get('/', (req, res) => {
  res.json({ items: db().budgetTemplates });
});

router.post('/', (req, res) => {
  const data = db();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'La plantilla necesita un nombre.' });
  const lines = sanitizeTemplateLines(req.body.lines, data.services);
  if (!lines.length) return res.status(400).json({ error: 'La plantilla necesita al menos una línea del catálogo.' });
  const obj = { id: uid('tpl'), name, lines, createdAt: new Date().toISOString() };
  data.budgetTemplates.push(obj);
  persist();
  res.status(201).json({ item: obj });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.budgetTemplates.find(t => t.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrada.' });
  data.budgetTemplates = data.budgetTemplates.filter(t => t.id !== existing.id);
  persist();
  res.json({ ok: true });
});

module.exports = router;
