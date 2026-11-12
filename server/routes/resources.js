const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');
const calc = require('../calc');

const router = express.Router();
router.use(requireAuth);

// Rediseño: en vez de pedir siempre "coste anual", se pide la periodicidad
// (Mensual / Anual / Único) y el importe correspondiente a ESA periodicidad.
// El resto de equivalencias se calculan solas.
const defaults = { name: '', periodicity: 'Mensual', amount: 0, maxClients: 0, notes: '', active: true };

function enrich(r, data) {
  return {
    ...r,
    monthlyCost: calc.resourceMonthlyCost(r),
    annualCost: calc.resourceAnnualCost(r),
    hosted: calc.hostedCount(data.contracted, r.id),
    proratedMonthly: calc.resourceProratedCost(r, data.contracted),
    capacityStatus: calc.resourceCapacityStatus(r, data.contracted)
  };
}

router.get('/', (req, res) => {
  const data = db();
  res.json({ items: data.resources.map(r => enrich(r, data)) });
});

router.post('/', (req, res) => {
  const data = db();
  const obj = { ...defaults, ...req.body, id: uid('res'), name: (req.body.name || '').trim() || 'Recurso sin nombre' };
  data.resources.unshift(obj);
  persist();
  res.status(201).json({ item: enrich(obj, data) });
});

router.put('/:id', (req, res) => {
  const data = db();
  const existing = data.resources.find(r => r.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Recurso no encontrado.' });
  const obj = { ...defaults, ...existing, ...req.body, id: existing.id };
  data.resources = data.resources.map(r => r.id === obj.id ? obj : r);
  persist();
  res.json({ item: enrich(obj, data) });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.resources.find(r => r.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Recurso no encontrado.' });
  data.resources = data.resources.filter(r => r.id !== existing.id);
  data.contracted = data.contracted.map(s => s.resourceId === existing.id ? { ...s, resourceId: '' } : s);
  persist();
  res.json({ ok: true });
});

module.exports = router;
