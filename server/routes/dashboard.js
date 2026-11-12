const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth, requireSection } = require('../middleware');
const calc = require('../calc');

const router = express.Router();
router.use(requireAuth);
// '/' (Panel) vive bajo la sección 'dashboard' (montada en server.js); estas dos
// rutas comparten router pero son la sección 'profitability' del menú (AC9), así
// que exigen ese permiso aparte: ocultarlas en el Sidebar también debe bloquear
// la API si se llama directamente.
const requireProfitability = requireSection('profitability');

router.get('/', (req, res) => {
  const data = db();
  calc.generatePendingInvoices(data, uid);
  persist();

  const services = data.services.filter(s => s.active).map(s => calc.calcService(s, data.config, data.fixed)).filter(x => x.rec > 0);
  const budgets = data.budgets.map(b => calc.calcBudget(b, data.config));
  const active = budgets.filter(b => ['aceptado', 'en_curso', 'facturado'].includes(b.status));
  const avg = key => services.length ? services.reduce((a, b) => a + b[key], 0) / services.length : 0;
  const avgNet = avg('net');

  const topServices = [...services].sort((a, b) => b.net - a.net).slice(0, 8);
  const statusGroups = {};
  data.budgets.forEach(b => statusGroups[b.status] = (statusGroups[b.status] || 0) + 1);
  const pendingCount = data.budgets.filter(b => b.charged === 'No').length;
  const billedIva = budgets.reduce((a, b) => a + b.priceIva, 0);

  // Forecast ponderado por probabilidad de cierre de cada etapa (Fase 12.1):
  // Σ(pipelineValue del cliente × probabilidad de su etapa derivada).
  const stageProbability = {};
  data.pipelineStages.forEach(s => { stageProbability[s.key] = calc.num(s.probability) / 100; });
  const pipelineCounts = {};
  let weightedForecast = 0;
  data.clients.forEach(c => {
    const stage = calc.deriveClientStage(c, data.budgets, data.contracted);
    pipelineCounts[stage] = (pipelineCounts[stage] || 0) + 1;
    weightedForecast += calc.num(c.pipelineValue) * (stageProbability[stage] || 0);
  });

  res.json({
    costHour: calc.costHour(data.config, data.fixed),
    activeFixedCosts: calc.activeFixedCosts(data.fixed),
    avgService: avg('rec'), avgCost: avg('total'), avgNet,
    need: Math.ceil((calc.num(data.config.salaryTarget) + calc.num(data.config.buffer)) / Math.max(avgNet, 1)),
    benefitActive: active.reduce((a, b) => a + b.net, 0),
    activeCount: active.length,
    sales: budgets.reduce((a, b) => a + b.price, 0),
    net: budgets.reduce((a, b) => a + b.net, 0),
    topServices, statusGroups, pendingCount, billedIva,
    servicesActive: data.services.filter(s => s.active).length, servicesTotal: data.services.length,
    fixedActive: data.fixed.filter(f => f.active).length, fixedTotal: data.fixed.length,
    budgetsTotal: data.budgets.length,
    clientsTotal: data.clients.length,
    contractedActive: data.contracted.filter(s => s.status === 'Activo').length, contractedTotal: data.contracted.length,
    recurringMonthlyRevenue: calc.recurringMonthlyRevenue(data.contracted),
    invoicesTotal: data.invoices.length,
    invoicesPending: data.invoices.filter(i => ['Emitida', 'Parcial'].includes(i.status)).length,
    invoicesOverdue: data.invoices.filter(i => ['Emitida', 'Parcial'].includes(i.status) && (i.date || '') < new Date().toISOString().slice(0, 10)).length,
    invoicesPaid: data.invoices.filter(i => i.status === 'Pagada').length,
    invoicesUnpaid: data.invoices.filter(i => ['Emitida', 'Parcial'].includes(i.status)).length,
    pipelineCounts, weightedForecast
  });
});

router.get('/profitability', requireProfitability, (req, res) => {
  const data = db();
  const byClient = {};
  data.contracted.filter(s => s.status === 'Activo').forEach(s => {
    const factor = calc.monthlyFactor(s.periodicity);
    if (factor <= 0) return;
    const key = s.clientId;
    if (!byClient[key]) byClient[key] = { clientId: key, revenue: 0, contracts: 0 };
    byClient[key].revenue += calc.num(s.price) * factor;
    byClient[key].contracts += 1;
  });
  const rows = Object.values(byClient).map(r => ({ ...r, clientName: (data.clients.find(c => c.id === r.clientId) || {}).name || 'Cliente eliminado' })).sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  res.json({ rows, totalRevenue });
});

// Rentabilidad "real" por proyecto y por cliente: compara lo presupuestado con
// las horas realmente registradas (a coste/hora del negocio) y lo realmente
// facturado/cobrado. No sustituye al escandallo (que es una estimación previa),
// sino que muestra qué está pasando de verdad una vez el proyecto está en marcha.
router.get('/margins', requireProfitability, (req, res) => {
  const data = db();
  const hourCost = calc.costHour(data.config, data.fixed);

  // Horas reales por presupuesto/proyecto (solo las que están enlazadas a un
  // presupuesto concreto vía "budgetId"; las horas sueltas sin proyecto no
  // se pueden atribuir a un margen real y quedan fuera de esta tabla).
  const hoursByBudget = {};
  data.timeEntries.forEach(t => {
    if (!t.budgetId) return;
    hoursByBudget[t.budgetId] = (hoursByBudget[t.budgetId] || 0) + calc.num(t.hours);
  });

  // Facturado/cobrado real por presupuesto (facturas generadas manualmente
  // desde "Presupuestos" con sourceType 'budget').
  const invoicedByBudget = {};
  const paidByBudget = {};
  data.invoices.forEach(inv => {
    if (inv.status === 'Anulada' || inv.sourceType !== 'budget' || !inv.sourceId) return;
    invoicedByBudget[inv.sourceId] = (invoicedByBudget[inv.sourceId] || 0) + calc.num(inv.baseAmount);
    paidByBudget[inv.sourceId] = (paidByBudget[inv.sourceId] || 0) + calc.invoicePaid(inv);
  });

  // Mismo criterio de "proyecto activo" que ya se usa en Horas/Panel.
  const activeBudgets = data.budgets.filter(b => ['aceptado', 'en_curso', 'facturado'].includes(b.status));
  const projects = activeBudgets.map(b => {
    const calcB = calc.calcBudget(b, data.config);
    const realHours = hoursByBudget[b.id] || 0;
    const realCost = realHours * hourCost;
    const invoiced = invoicedByBudget[b.id] || 0;
    const paid = paidByBudget[b.id] || 0;
    const realMargin = invoiced - realCost;
    const client = data.clients.find(c => c.id === b.clientId);
    return {
      id: b.id, clientId: b.clientId, clientName: client ? client.name : 'Cliente eliminado',
      service: (b.lines || []).map(l => l.concept).join(', '), status: b.status,
      estimatedPrice: calcB.price, estimatedCost: calcB.cost, estimatedMargin: calcB.gross, estimatedMarginPct: calcB.margin,
      realHours, realCost, invoiced, paid,
      realMargin, realMarginPct: invoiced ? realMargin / invoiced : 0
    };
  }).sort((a, b) => b.realMargin - a.realMargin);

  // Por cliente: TODA la facturación real (cualquier origen: contrato, presupuesto
  // o manual) frente a TODAS las horas reales enlazadas a ese cliente (de
  // contratos o presupuestos; las horas manuales sin cliente enlazado no cuentan
  // coste porque no se sabe a qué proyecto imputarlas).
  const invByClient = {};
  const paidByClient = {};
  data.invoices.forEach(inv => {
    if (inv.status === 'Anulada' || !inv.clientId) return;
    invByClient[inv.clientId] = (invByClient[inv.clientId] || 0) + calc.num(inv.baseAmount);
    paidByClient[inv.clientId] = (paidByClient[inv.clientId] || 0) + calc.invoicePaid(inv);
  });
  const hoursByClient = {};
  data.timeEntries.forEach(t => {
    if (!t.clientId) return;
    hoursByClient[t.clientId] = (hoursByClient[t.clientId] || 0) + calc.num(t.hours);
  });
  const byClient = data.clients.map(c => {
    const invoiced = invByClient[c.id] || 0;
    const paid = paidByClient[c.id] || 0;
    const hours = hoursByClient[c.id] || 0;
    const cost = hours * hourCost;
    const margin = invoiced - cost;
    return { clientId: c.id, clientName: c.name, invoiced, paid, hours, cost, margin, marginPct: invoiced ? margin / invoiced : 0 };
  }).filter(r => r.invoiced > 0 || r.hours > 0).sort((a, b) => b.margin - a.margin);

  res.json({
    hourCost, projects, byClient,
    totalRealMargin: byClient.reduce((a, r) => a + r.margin, 0),
    totalInvoiced: byClient.reduce((a, r) => a + r.invoiced, 0)
  });
});

module.exports = router;
