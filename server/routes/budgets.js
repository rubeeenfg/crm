// Presupuestos multi-línea (plan Fase 1-2). Cada línea sale del catálogo real de
// servicios (precio y coste SIEMPRE recalculados aquí con calcService, nunca con
// lo que mande el cliente — AC2) o es una línea manual escrita a mano por el
// usuario para un extra puntual (nunca la crea la IA). Tope de descuento 15%.
const express = require('express');
const { db, persist, uid, logActivity } = require('../store');
const { requireAuth } = require('../middleware');
const { calcBudget, calcService, invoiceDataFromBudget } = require('../calc');

const router = express.Router();
router.use(requireAuth);

const MAX_DISCOUNT = 0.15;

// Valida y recalcula cada línea de un presupuesto contra el catálogo real.
// Devuelve { lines, error }: si error no es null, lines es null (nada que guardar).
function sanitizeLines(rawLines, data) {
  if (!Array.isArray(rawLines)) return { lines: [], error: null };
  const config = data.config;
  const out = [];
  for (const raw of rawLines) {
    const discountInput = Number(raw.discountPct) || 0;
    if (discountInput > MAX_DISCOUNT) {
      return { lines: null, error: `El descuento por línea no puede superar el ${Math.round(MAX_DISCOUNT * 100)}%.` };
    }
    const discountPct = Math.max(0, discountInput);
    const qty = Math.max(0.01, Number(raw.qty) || 1);

    if (raw.isManual && !raw.serviceId) {
      const concept = String(raw.concept || '').trim();
      if (!concept) return { lines: null, error: 'Las líneas manuales necesitan un concepto.' };
      out.push({
        id: raw.id || uid('bln'), serviceId: null, isManual: true, concept,
        unitPrice: Number(raw.unitPrice) || 0, unitCost: Number(raw.unitCost) || 0, qty, discountPct
      });
      continue;
    }

    const svc = data.services.find(s => s.id === raw.serviceId);
    if (!svc) return { lines: null, error: `Servicio no encontrado en el catálogo: ${raw.serviceId}` };
    const calc = calcService(svc, config, data.fixed);
    // El precio por defecto es siempre el del catálogo (calcService), pero el
    // usuario puede ajustarlo a mano línea a línea (ej. una negociación puntual).
    // La IA nunca manda unitPrice en sus herramientas (ver routes/ai.js), así que
    // esto no le abre ninguna puerta a inventar precios (AC3 intacto).
    const unitPrice = raw.unitPrice === undefined || raw.unitPrice === null || raw.unitPrice === '' || Number.isNaN(Number(raw.unitPrice))
      ? calc.rec : Math.max(0, Number(raw.unitPrice));
    out.push({
      id: raw.id || uid('bln'), serviceId: svc.id, isManual: false, concept: svc.name,
      unitPrice, unitCost: calc.total, qty, discountPct
    });
  }
  return { lines: out, error: null };
}

router.get('/', (req, res) => {
  const data = db();
  let rows = data.budgets.slice();
  if (req.query.clientId) rows = rows.filter(b => b.clientId === req.query.clientId);
  res.json({ items: rows.map(b => calcBudget(b, data.config)) });
});

router.get('/:id', (req, res) => {
  const data = db();
  const row = data.budgets.find(b => b.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ item: calcBudget(row, data.config) });
});

router.post('/', (req, res) => {
  const data = db();
  if (!req.body.clientId) return res.status(400).json({ error: 'Selecciona un cliente.' });
  if (!data.clients.some(c => c.id === req.body.clientId)) return res.status(400).json({ error: 'Cliente no encontrado.' });
  const { lines, error } = sanitizeLines(req.body.lines || [], data);
  if (error) return res.status(400).json({ error });
  const obj = {
    id: uid('bud'), clientId: req.body.clientId, date: req.body.date || new Date().toISOString().slice(0, 10),
    status: 'borrador', legacyStatus: null, charged: 'No', commissionPct: Number(req.body.commissionPct) || 0,
    notes: req.body.notes || '', paused: false, createdAt: new Date().toISOString(), sentAt: null, acceptedAt: null,
    invoiceId: null, lines
  };
  data.budgets.unshift(obj);
  persist();
  res.status(201).json({ item: calcBudget(obj, data.config) });
});

router.put('/:id', (req, res) => {
  const data = db();
  const existing = data.budgets.find(b => b.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  // La instantánea se congela al enviar (Fase 1.2): solo se edita mientras está en borrador.
  if (existing.status !== 'borrador') {
    return res.status(400).json({ error: 'Solo se puede editar un presupuesto mientras está en borrador.' });
  }
  const clientId = req.body.clientId !== undefined ? req.body.clientId : existing.clientId;
  if (!data.clients.some(c => c.id === clientId)) return res.status(400).json({ error: 'Cliente no encontrado.' });
  let lines = existing.lines;
  if (req.body.lines !== undefined) {
    const r = sanitizeLines(req.body.lines, data);
    if (r.error) return res.status(400).json({ error: r.error });
    lines = r.lines;
  }
  const obj = {
    ...existing, clientId, date: req.body.date !== undefined ? req.body.date : existing.date,
    commissionPct: req.body.commissionPct !== undefined ? (Number(req.body.commissionPct) || 0) : existing.commissionPct,
    notes: req.body.notes !== undefined ? req.body.notes : existing.notes, lines
  };
  data.budgets = data.budgets.map(b => b.id === obj.id ? obj : b);
  persist();
  res.json({ item: calcBudget(obj, data.config) });
});

// Descripción en español de cada transición, para el timeline de actividad del
// cliente (Fase 12.2) — solo texto, no afecta a ninguna lógica de negocio.
const STATUS_ACTIVITY_LABEL = {
  enviado: 'Presupuesto enviado', aceptado: 'Presupuesto aceptado', rechazado: 'Presupuesto rechazado',
  en_curso: 'Proyecto puesto en curso', facturado: 'Presupuesto facturado'
};

// --- Ciclo de vida: borrador -> enviado -> aceptado|rechazado -> en_curso -> facturado ---
function transition(allowedFrom, nextStatus, extra) {
  return (req, res) => {
    const data = db();
    const existing = data.budgets.find(b => b.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'No encontrado.' });
    if (!allowedFrom.includes(existing.status)) {
      return res.status(400).json({ error: `No se puede pasar a "${nextStatus}" desde "${existing.status}".` });
    }
    if (nextStatus !== 'rechazado' && !existing.lines.length) {
      return res.status(400).json({ error: 'El presupuesto no tiene ninguna línea todavía.' });
    }
    const obj = { ...existing, status: nextStatus, ...(extra ? extra(existing, data) : {}) };
    data.budgets = data.budgets.map(b => b.id === obj.id ? obj : b);
    logActivity(data, existing.clientId, 'budget_status', STATUS_ACTIVITY_LABEL[nextStatus] || `Presupuesto → ${nextStatus}`);
    persist();
    res.json({ item: calcBudget(obj, data.config) });
  };
}

router.post('/:id/send', transition(['borrador'], 'enviado', () => ({ sentAt: new Date().toISOString() })));
// Al aceptar, se crean automáticamente las tareas de onboarding configuradas en
// Configuración (Fase 12.5) — una sola plantilla general, siempre la misma, no
// bloquea nada si está vacía. Se añaden directamente a data.kanbanTasks aquí
// mismo (antes de persist(), que llama transition() justo después).
router.post('/:id/accept', transition(['enviado'], 'aceptado', (existing, data) => {
  (data.config.onboardingTasks || []).forEach(title => {
    data.kanbanTasks.push({ id: uid('ktk'), budgetId: existing.id, title, assigneeId: null, done: false, createdAt: new Date().toISOString() });
  });
  return { acceptedAt: new Date().toISOString() };
}));
router.post('/:id/reject', transition(['enviado'], 'rechazado'));
// Al pasar a "en_curso" la tarjeta entra en el Kanban (plan Fase 6): si no tenía
// columna asignada, se le pone la primera configurada.
router.post('/:id/start', transition(['aceptado'], 'en_curso', (existing, data) => (
  existing.kanbanColumn ? {} : { kanbanColumn: (data.kanbanColumns[0] || {}).key || null }
)));

// Factura la totalidad del presupuesto, copiando todas sus líneas (AC4).
router.post('/:id/invoice', (req, res) => {
  const data = db();
  const existing = data.budgets.find(b => b.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  if (!['aceptado', 'en_curso'].includes(existing.status)) {
    return res.status(400).json({ error: 'Solo se puede facturar un presupuesto aceptado o en curso.' });
  }
  if (existing.invoiceId) return res.status(400).json({ error: 'Este presupuesto ya tiene una factura generada.' });
  const invoiceData = invoiceDataFromBudget(data, existing, uid);
  data.invoices.unshift(invoiceData);
  const obj = { ...existing, status: 'facturado', invoiceId: invoiceData.id };
  data.budgets = data.budgets.map(b => b.id === obj.id ? obj : b);
  logActivity(data, existing.clientId, 'invoice', `Factura ${invoiceData.number} generada`);
  persist();
  res.status(201).json({ item: calcBudget(obj, data.config), invoice: invoiceData });
});

// Clona un presupuesto como borrador nuevo del mismo cliente (backlog #23): copia
// sus líneas tal cual (serviceId/qty/descuento, o concepto+precio si es manual)
// y las vuelve a pasar por sanitizeLines, que recalcula el precio de catálogo con
// calcService igual que cualquier línea nueva (AC2/AC3 intactos: nunca se copia
// un precio de catálogo "congelado", solo el de las líneas manuales).
router.post('/:id/clone', (req, res) => {
  const data = db();
  const existing = data.budgets.find(b => b.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  const rawLines = (existing.lines || []).map(l => ({
    serviceId: l.serviceId, isManual: l.isManual, concept: l.concept,
    unitPrice: l.isManual ? l.unitPrice : undefined, unitCost: l.unitCost, qty: l.qty, discountPct: l.discountPct
  }));
  const { lines, error } = sanitizeLines(rawLines, data);
  if (error) return res.status(400).json({ error });
  const obj = {
    id: uid('bud'), clientId: existing.clientId, date: new Date().toISOString().slice(0, 10),
    status: 'borrador', legacyStatus: null, charged: 'No', commissionPct: existing.commissionPct || 0,
    notes: existing.notes || '', paused: false, createdAt: new Date().toISOString(), sentAt: null, acceptedAt: null,
    invoiceId: null, lines
  };
  data.budgets.unshift(obj);
  persist();
  res.status(201).json({ item: calcBudget(obj, data.config) });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.budgets.find(b => b.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado.' });
  data.budgets = data.budgets.filter(b => b.id !== existing.id);
  persist();
  res.json({ ok: true });
});

module.exports = router;
module.exports.sanitizeLines = sanitizeLines;
module.exports.MAX_DISCOUNT = MAX_DISCOUNT;
