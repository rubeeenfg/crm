const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');
const calc = require('../calc');

const router = express.Router();
router.use(requireAuth);

const defaults = { contractedId: '', clientId: '', period: 'manual', date: '', amount: 0, status: 'Pendiente', notes: '' };

router.get('/', (req, res) => {
  const data = db();
  calc.generatePendingCharges(data, uid);
  persist();
  const rows = [...data.charges].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  res.json({ items: rows });
});

router.post('/', (req, res) => {
  const data = db();
  const obj = { ...defaults, ...req.body, id: uid('chg') };
  data.charges.unshift(obj);
  persist();
  res.status(201).json({ item: obj });
});

router.put('/:id', (req, res) => {
  const data = db();
  const existing = data.charges.find(c => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  const obj = { ...defaults, ...existing, ...req.body, id: existing.id };
  data.charges = data.charges.map(c => c.id === obj.id ? obj : c);
  persist();
  res.json({ item: obj });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.charges.find(c => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  // Si el cobro venía de un contrato activo (generado por periodicidad), se recuerda
  // ese periodo como "descartado" para que no se vuelva a generar solo al recargar.
  if (existing.contractedId && existing.period && existing.period !== 'manual') {
    const cs = data.contracted.find(s => s.id === existing.contractedId);
    if (cs) {
      cs.dismissedPeriods = cs.dismissedPeriods || [];
      if (!cs.dismissedPeriods.includes(existing.period)) cs.dismissedPeriods.push(existing.period);
    }
  }
  data.charges = data.charges.filter(c => c.id !== existing.id);
  persist();
  res.json({ ok: true });
});

module.exports = router;
