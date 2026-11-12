const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');
const calc = require('../calc');

const router = express.Router();
router.use(requireAuth);

const defaults = { clientId: '', name: '', periodicity: 'Mensual', price: 0, startDate: '', endDate: '', status: 'Activo', notes: '', dismissedPeriods: [], monthlyHoursQuota: 0 };

// Horas reales fichadas este mes para un contrato (Fase 11.2): compara contra su
// monthly_hours_quota para el aviso del 80%, sin bloquear nada automáticamente.
function hoursThisMonth(timeEntries, contractedId) {
  const ym = new Date().toISOString().slice(0, 7);
  return (timeEntries || [])
    .filter(t => t.contractedId === contractedId && String(t.date || '').slice(0, 7) === ym)
    .reduce((a, t) => a + (Number(t.hours) || 0), 0);
}

router.get('/', (req, res) => {
  const data = db();
  let rows = data.contracted.slice();
  if (req.query.clientId) rows = rows.filter(s => s.clientId === req.query.clientId);
  const todayMs = Date.now();
  rows = rows.map(s => {
    const quota = Number(s.monthlyHoursQuota) || 0;
    const used = hoursThisMonth(data.timeEntries, s.id);
    // Aviso de renovación próxima (Fase 12.3): contrato activo con end_date dentro
    // de 30 días o ya vencido; solo informativo, no cambia el status.
    let daysToEnd = null;
    if (s.status === 'Activo' && s.endDate) {
      const end = new Date(s.endDate);
      if (!Number.isNaN(end.getTime())) daysToEnd = Math.ceil((end.getTime() - todayMs) / 86400000);
    }
    return {
      ...s, hoursUsedThisMonth: used, hoursQuotaPct: quota > 0 ? used / quota : 0,
      daysToEnd, renewalDueSoon: daysToEnd !== null && daysToEnd <= 30
    };
  });
  res.json({ items: rows });
});

router.post('/', (req, res) => {
  const data = db();
  const obj = { ...defaults, ...req.body, id: uid('cs') };
  if (!obj.clientId) return res.status(400).json({ error: 'Selecciona un cliente.' });
  if (!String(obj.name || '').trim()) return res.status(400).json({ error: 'Indica qué le llevas a este cliente.' });
  obj.startDate = obj.startDate || new Date().toISOString().slice(0, 10);
  data.contracted.unshift(obj);
  calc.generatePendingInvoices(data, uid);
  persist();
  res.status(201).json({ item: obj });
});

router.put('/:id', (req, res) => {
  const data = db();
  const existing = data.contracted.find(s => s.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  const obj = { ...defaults, ...existing, ...req.body, id: existing.id };
  if (!obj.clientId) return res.status(400).json({ error: 'Selecciona un cliente.' });
  if (!String(obj.name || '').trim()) return res.status(400).json({ error: 'Indica qué le llevas a este cliente.' });
  data.contracted = data.contracted.map(s => s.id === obj.id ? obj : s);
  calc.generatePendingInvoices(data, uid);
  persist();
  res.json({ item: obj });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.contracted.find(s => s.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  data.contracted = data.contracted.filter(s => s.id !== existing.id);
  persist();
  res.json({ ok: true });
});

module.exports = router;
