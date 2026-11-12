const { db } = require('../store');
const { requireAuth } = require('../middleware');
const { calcService } = require('../calc');
const { createCrudRouter } = require('./crud-factory');

const defaults = {
  name: '', client: '', category: 'General', unit: 'Proyecto',
  hours: 0, tool: 0, sub: 0, ads: 0, other: 0, indirectPct: .10, margin: .35, commissionPct: 0,
  active: true, notes: ''
};

const router = createCrudRouter({
  collection: 'services',
  idPrefix: 'srv',
  defaults,
  enrich: (s, data) => calcService(s, data.config, data.fixed)
});

// Simulador "qué pasaría si": recalcula el precio de un servicio base con
// parámetros a mano, sin guardar nada. Reutiliza calcService (misma fuente de
// verdad que el resto de la app) para no duplicar la fórmula en el frontend.
router.post('/simulate', requireAuth, (req, res) => {
  const data = db();
  const base = data.services.find(s => s.id === req.body.serviceId) || data.services[0];
  if (!base) return res.status(400).json({ error: 'No hay ningún servicio en el catálogo para usar como base.' });
  const override = req.body.override || {};
  const result = calcService(base, data.config, data.fixed, override);
  res.json({ item: result });
});

module.exports = router;
