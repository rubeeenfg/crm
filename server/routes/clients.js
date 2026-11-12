const express = require('express');
const { db, persist, uid, logActivity } = require('../store');
const { requireAuth } = require('../middleware');
const { calcBudget, monthlyFactor, num, invoicePaid, deriveClientStage } = require('../calc');

// Ingreso mensual real de un cliente: suma de sus contratos activos, normalizando
// los anuales a su equivalente mensual. Sustituye al antiguo campo manual
// "Valor estimado mensual", que había que rellenar a mano y quedaba desactualizado.
function clientMonthlyValue(data, clientId) {
  return data.contracted.filter(s => s.clientId === clientId && s.status === 'Activo')
    .reduce((a, s) => a + num(s.price) * monthlyFactor(s.periodicity), 0);
}

const router = express.Router();
router.use(requireAuth);

const defaults = {
  name: '', contactName: '', email: '', phone: '', taxId: '', websiteUrl: '', billingAddress: '', notes: '',
  pipelineStage: 'nuevo_lead', pipelineValue: 0, source: '', nextActionDate: '', ownerId: ''
};

function matchesSearch(c, q) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [c.name, c.contactName, c.email, c.phone, c.taxId].some(v => String(v || '').toLowerCase().includes(needle));
}

router.get('/', (req, res) => {
  const data = db();
  let rows = data.clients.slice();
  const { search, stage } = req.query;
  if (search) rows = rows.filter(c => matchesSearch(c, search));
  rows = rows.map(c => ({
    ...c,
    pipelineStage: deriveClientStage(c, data.budgets, data.contracted),
    activeContractedCount: data.contracted.filter(s => s.clientId === c.id && s.status === 'Activo').length,
    monthlyValue: clientMonthlyValue(data, c.id)
  }));
  if (stage) rows = rows.filter(c => c.pipelineStage === stage);
  res.json({ items: rows, stages: data.pipelineStages });
});

router.get('/:id', (req, res) => {
  const data = db();
  const client = data.clients.find(c => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const contracted = data.contracted.filter(s => s.clientId === client.id);
  const budgets = data.budgets.filter(b => b.clientId === client.id).map(b => calcBudget(b, data.config));
  const invoices = data.invoices.filter(i => i.clientId === client.id).sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  // Resumen económico del cliente: lo facturado/cobrado (facturas no anuladas) y el
  // beneficio neto ya cerrado en proyectos puntuales (presupuestos facturados/cobrados).
  const notCancelled = invoices.filter(i => i.status !== 'Anulada');
  const totalBilled = notCancelled.reduce((a, i) => a + num(i.total), 0);
  const totalCollected = notCancelled.reduce((a, i) => a + invoicePaid(i), 0);
  const finishedStatuses = ['facturado', 'cobrado', 'cerrado'];
  const finishedProjects = budgets.filter(b => finishedStatuses.includes(b.status));
  const totalProjectsNet = finishedProjects.reduce((a, b) => a + num(b.net), 0);
  const item = {
    ...client,
    pipelineStage: deriveClientStage(client, data.budgets, data.contracted),
    monthlyValue: clientMonthlyValue(data, client.id),
    totalBilled, totalCollected, totalProjectsNet,
    finishedProjectsCount: finishedProjects.length
  };
  const activity = data.clientActivity.filter(a => a.clientId === client.id);
  res.json({ item, contracted, budgets, invoices, activity });
});

router.post('/', (req, res) => {
  const data = db();
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  const obj = { ...defaults, ...req.body, id: uid('cli'), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  data.clients.unshift(obj);
  persist();
  res.status(201).json({ item: obj });
});

router.put('/:id', (req, res) => {
  const data = db();
  const existing = data.clients.find(c => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
  if (!name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  const obj = { ...defaults, ...existing, ...req.body, id: existing.id, name, updatedAt: new Date().toISOString() };
  data.clients = data.clients.map(c => c.id === obj.id ? obj : c);
  persist();
  res.json({ item: obj });
});

// Solo estas tres etapas se marcan a mano (plan Fase 1.3): el resto del pipeline
// se deriva solo de los presupuestos/proyectos del cliente (deriveClientStage).
const MANUAL_STAGES = ['nuevo_lead', 'contactado', 'perdido'];

router.put('/:id/stage', (req, res) => {
  const data = db();
  const existing = data.clients.find(c => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const { stage } = req.body || {};
  if (!MANUAL_STAGES.includes(stage)) {
    return res.status(400).json({ error: 'Esa etapa se calcula sola a partir de los presupuestos/proyectos del cliente; solo puedes marcar a mano "Nuevo lead", "Contactado" o "Perdido".' });
  }
  const STAGE_LABEL = { nuevo_lead: 'Nuevo lead', contactado: 'Contactado', perdido: 'Perdido / Descartado' };
  existing.pipelineStage = stage;
  existing.updatedAt = new Date().toISOString();
  logActivity(data, existing.id, 'stage', `Etapa → ${STAGE_LABEL[stage] || stage}`);
  persist();
  res.json({ item: { ...existing, pipelineStage: deriveClientStage(existing, data.budgets, data.contracted) } });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.clients.find(c => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const linked = data.contracted.filter(s => s.clientId === existing.id).length;
  data.clients = data.clients.filter(c => c.id !== existing.id);
  persist();
  res.json({ ok: true, linkedContracted: linked });
});

module.exports = router;
