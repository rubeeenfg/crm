// Formulas de negocio del escandallo, identicas a las de la version anterior.
const num = v => Number(v) || 0;
const ceilStep = (n, step) => Math.ceil(num(n) / (num(step) || 1)) * (num(step) || 1);

function activeFixedCosts(fixedList) {
  return (fixedList || []).filter(f => f.active).reduce((sum, f) => sum + num(f.monthly), 0);
}

function costHour(config, fixedList) {
  return (num(config.salaryTarget) + num(config.buffer) + activeFixedCosts(fixedList)) / (num(config.productiveHours) || 1);
}

function calcService(s, config, fixedList, override = {}) {
  const hours = num(override.hours ?? s.hours), tool = num(override.tool ?? s.tool), sub = num(override.sub ?? s.sub);
  const ads = num(override.ads ?? s.ads), other = num(override.other ?? s.other);
  const indirectPct = num(override.indirectPct ?? s.indirectPct);
  const margin = Math.min(num(override.margin ?? s.margin), .95);
  const commissionPct = num(override.commissionPct ?? s.commissionPct);
  const amortizationPct = num(config.amortizationPct);
  const hourCost = costHour(config, fixedList);
  const costHours = hours * hourCost;
  const direct = costHours + tool + sub + ads + other;
  const indirect = direct * indirectPct;
  const amortization = direct * amortizationPct;
  const total = direct + indirect + amortization;
  const rec = total > 0 ? ceilStep(total / (1 - margin), config.rounding) : 0;
  const gross = rec - total;
  const com = Math.max(0, gross) * commissionPct;
  const net = gross - com;
  return {
    ...s, hours, tool, sub, ads, other, indirectPct, amortizationPct, margin, commissionPct,
    hourCost, costHours, direct, indirect, amortization, total, rec, gross, com, net,
    netMargin: rec ? net / rec : 0, iva: rec * num(config.iva), priceIva: rec * (1 + num(config.iva))
  };
}

// Importe de una línea de presupuesto/factura: cantidad x precio unitario, con el
// descuento manual aplicado (tope del 15%, ya forzado al guardar la línea — aquí
// se vuelve a acotar por si acaso, nunca nos fiamos de un valor ya guardado).
function lineAmount(l) {
  const qty = num(l.qty) || 1;
  const unitPrice = num(l.unitPrice);
  const discountPct = Math.min(0.15, Math.max(0, num(l.discountPct)));
  return Math.round(qty * unitPrice * (1 - discountPct) * 100) / 100;
}
function lineCost(l) {
  return Math.round((num(l.qty) || 1) * num(l.unitCost) * 100) / 100;
}

// Presupuesto multi-línea (plan Fase 1-2): precio y coste se derivan siempre de la
// suma de sus líneas (nunca de un campo plano guardado aparte), así una línea
// cambiada o eliminada no puede dejar descuadrado el total del presupuesto.
function calcBudget(b, config) {
  const lines = b.lines || [];
  const price = lines.reduce((a, l) => a + lineAmount(l), 0);
  const cost = lines.reduce((a, l) => a + lineCost(l), 0);
  const gross = price - cost;
  const com = Math.max(0, gross) * num(b.commissionPct), net = gross - com;
  return {
    ...b, lines, price, cost, iva: price * num(config.iva), priceIva: price * (1 + num(config.iva)),
    gross, com, totalCost: cost + com, net, margin: price ? gross / price : 0, netMargin: price ? net / price : 0
  };
}

// Convierte un presupuesto (ya con sus líneas) en los datos de una factura nueva,
// copiando todas las líneas tal cual (AC4): mismo concepto, cantidad, precio y
// descuento ya aplicado en el importe. Nunca cambia el presupuesto por sí misma;
// quien la llama decide cuándo marcar el presupuesto como facturado.
function invoiceDataFromBudget(dataStore, budget, uid) {
  const snap = clientSnapshot(dataStore, budget.clientId);
  const date = new Date().toISOString().slice(0, 10);
  const lines = (budget.lines || []).map(l => ({
    concept: l.concept, qty: num(l.qty) || 1, unitPrice: num(l.unitPrice) * (1 - Math.min(0.15, Math.max(0, num(l.discountPct)))),
    amount: lineAmount(l)
  }));
  return computeInvoiceAmounts({
    ...snap, id: uid('inv'), date, concept: lines.map(l => l.concept).join(', ') || 'Presupuesto',
    lines, baseAmount: 0, ivaPct: num(dataStore.config.iva), status: 'Emitida', notes: '',
    sourceType: 'budget', sourceId: budget.id, payments: [],
    number: nextInvoiceNumber(dataStore, date), createdAt: new Date().toISOString()
  });
}

// Deriva la etapa de pipeline de un cliente a partir de sus presupuestos y
// proyectos en curso (plan Fase 1.3, AC5). Solo "nuevo_lead", "contactado" y
// "perdido" se guardan y editan a mano; el resto se calcula siempre aquí.
function deriveClientStage(client, budgets, contracted) {
  const stage = (client && client.pipelineStage) || 'nuevo_lead';

  const ownBudgets = (budgets || []).filter(b => b.clientId === client.id);
  const ownContracted = (contracted || []).filter(c => c.clientId === client.id);

  if (ownContracted.some(c => c.status === 'Activo' && c.paused)) return 'pausado';
  if (ownContracted.some(c => c.status === 'Activo')) return 'cliente_activo';
  if (ownBudgets.some(b => ['aceptado', 'en_curso'].includes(b.status))) return 'cliente_activo';
  if (ownBudgets.some(b => ['facturado', 'cobrado', 'cerrado'].includes(b.status))) return 'finalizado';
  if (ownBudgets.some(b => b.status === 'enviado')) return 'negociacion';
  if (ownBudgets.length && ownBudgets.every(b => b.status === 'rechazado')) return 'perdido';
  return stage;
}

// --- Contratos / cobros recurrentes ---
function monthlyFactor(periodicity) { return periodicity === 'Mensual' ? 1 : periodicity === 'Anual' ? 1 / 12 : 0; }

function parseYMD(str) {
  const [y, m, d] = String(str || new Date().toISOString().slice(0, 10)).split('-').map(Number);
  return { y, m: m || 1, d: d || 1 };
}
function toYMD(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function duePeriods(cs) {
  const { y, m, d } = parseYMD(cs.startDate);
  let now = new Date();
  // Si el contrato tiene fecha de fin, no se generan cobros/facturas después de esa fecha.
  if (cs.endDate) {
    const end = new Date(cs.endDate);
    if (!Number.isNaN(end.getTime()) && end < now) now = end;
  }
  const periods = [];
  if (cs.periodicity === 'Puntual') {
    periods.push({ key: 'unico', date: cs.startDate || toYMD(now) });
    return periods;
  }
  if (cs.periodicity === 'Mensual') {
    let cur = new Date(y, m - 1, d);
    let guard = 0;
    while (cur <= now && guard < 1200) {
      periods.push({ key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`, date: toYMD(cur) });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, d);
      guard++;
    }
    return periods;
  }
  if (cs.periodicity === 'Anual') {
    let cur = new Date(y, m - 1, d);
    let guard = 0;
    while (cur <= now && guard < 200) {
      periods.push({ key: `${cur.getFullYear()}`, date: toYMD(cur) });
      cur = new Date(cur.getFullYear() + 1, cur.getMonth(), d);
      guard++;
    }
    return periods;
  }
  return periods;
}

function generatePendingCharges(dataStore, uid) {
  let created = false;
  dataStore.contracted.forEach(cs => {
    if (cs.status !== 'Activo') return;
    duePeriods(cs).forEach(p => {
      // Si el usuario borró explícitamente el cobro de este periodo, no se vuelve a generar.
      if ((cs.dismissedPeriods || []).includes(p.key)) return;
      const exists = dataStore.charges.some(ch => ch.contractedId === cs.id && ch.period === p.key);
      if (!exists) {
        dataStore.charges.push({
          id: uid('chg'), contractedId: cs.id, clientId: cs.clientId, period: p.key,
          date: p.date, amount: num(cs.price), status: 'Pendiente', notes: ''
        });
        created = true;
      }
    });
  });
  return created;
}

function recurringMonthlyRevenue(contractedList) {
  return (contractedList || []).filter(s => s.status === 'Activo')
    .reduce((a, s) => a + num(s.price) * monthlyFactor(s.periodicity), 0);
}

// --- Facturas: numeración, importes y pagos parciales ---

// Numeración fiscal correlativa por año: 2026-0001, 2026-0002, ...
function nextInvoiceNumber(dataStore, dateStr) {
  const year = String((dateStr || new Date().toISOString().slice(0, 10)).slice(0, 4));
  dataStore.meta.invoiceCounters = dataStore.meta.invoiceCounters || {};
  const n = (dataStore.meta.invoiceCounters[year] || 0) + 1;
  dataStore.meta.invoiceCounters[year] = n;
  // Prefijo de serie configurable (backlog #22, ej. "PRO-"): el contador sigue
  // llevándose solo por año, cambiar el prefijo no reinicia ni duplica numeración.
  const prefix = (dataStore.config && dataStore.config.invoicePrefix) || '';
  return `${prefix}${year}-${String(n).padStart(4, '0')}`;
}

// Normaliza las líneas de una factura manual: cada línea puede ser un servicio
// del catálogo o un concepto libre, con cantidad y precio unitario. Se filtran
// las líneas vacías (sin concepto y sin importe) y se recalcula el importe de
// cada una (cantidad x precio) para que el cliente no pueda mandar un importe
// manipulado que no cuadre.
function sanitizeInvoiceLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map(l => ({
      concept: String((l && l.concept) || '').trim(),
      qty: num(l && l.qty) || 1,
      unitPrice: num(l && l.unitPrice)
    }))
    .filter(l => l.concept || l.unitPrice)
    .map(l => ({ ...l, amount: Math.round(l.qty * l.unitPrice * 100) / 100 }));
}

// Si la factura tiene líneas (una o varias: servicios del catálogo y/o
// conceptos manuales mezclados), la base imponible es la suma de sus importes
// y "baseAmount" se recalcula a partir de ahí (nunca se confía en lo que
// mande el cliente). Si no tiene líneas (facturas antiguas o generadas
// automáticamente desde un contrato/proyecto con un único importe), se sigue
// usando baseAmount tal cual, igual que antes.
function computeInvoiceAmounts(obj) {
  const lines = sanitizeInvoiceLines(obj.lines);
  const base = lines.length ? lines.reduce((a, l) => a + l.amount, 0) : num(obj.baseAmount);
  const ivaPct = num(obj.ivaPct);
  const ivaAmount = base * ivaPct;
  return { ...obj, lines, baseAmount: base, ivaPct, ivaAmount, total: base + ivaAmount };
}

function clientSnapshot(dataStore, clientId, fallbackName) {
  const c = dataStore.clients.find(x => x.id === clientId);
  if (c) return { clientId: c.id, clientName: c.name, clientTaxId: c.taxId || '', clientAddress: c.billingAddress || '' };
  return { clientId: '', clientName: fallbackName || 'Cliente sin datos', clientTaxId: '', clientAddress: '' };
}

// Suma de los pagos parciales registrados en una factura.
function invoicePaid(inv) {
  return (inv.payments || []).reduce((a, p) => a + num(p.amount), 0);
}

// Estado automático según lo cobrado, salvo que esté anulada manualmente (estado
// "pegajoso": solo cambia si se desanula a mano volviendo a "Emitida").
function invoiceStatus(inv) {
  if (inv.status === 'Anulada') return 'Anulada';
  const paid = invoicePaid(inv);
  const total = num(inv.total);
  if (total <= 0 || paid <= 0) return 'Emitida';
  if (paid >= total - 0.005) return 'Pagada';
  return 'Parcial';
}

// Genera facturas automáticamente para cada periodo vencido de cada contrato
// activo (mensual/anual/puntual), igual que antes se generaban "cobros". Si el
// usuario borra una factura generada así, ese periodo se recuerda como
// descartado (dismissedPeriods, en el propio contrato) para no regenerarla sola.
function generatePendingInvoices(dataStore, uid) {
  let created = false;
  dataStore.contracted.forEach(cs => {
    if (cs.status !== 'Activo') return;
    duePeriods(cs).forEach(p => {
      if ((cs.dismissedPeriods || []).includes(p.key)) return;
      const exists = dataStore.invoices.some(inv => inv.contractedId === cs.id && inv.period === p.key);
      if (exists) return;
      const snap = clientSnapshot(dataStore, cs.clientId);
      const obj = computeInvoiceAmounts({
        contractedId: cs.id, period: p.key, ...snap,
        id: uid('inv'), date: p.date, concept: `${cs.name || 'Servicio'} (${cs.periodicity})`,
        baseAmount: num(cs.price), ivaPct: num(dataStore.config.iva),
        status: 'Emitida', notes: '', sourceType: 'contracted', sourceId: cs.id, payments: [],
        number: nextInvoiceNumber(dataStore, p.date), createdAt: new Date().toISOString()
      });
      dataStore.invoices.unshift(obj);
      created = true;
    });
  });
  return created;
}

module.exports = {
  num, ceilStep, activeFixedCosts, costHour, calcService, calcBudget, lineAmount, lineCost,
  monthlyFactor, duePeriods, generatePendingCharges, recurringMonthlyRevenue,
  nextInvoiceNumber, computeInvoiceAmounts, sanitizeInvoiceLines, clientSnapshot, invoicePaid, invoiceStatus, generatePendingInvoices,
  invoiceDataFromBudget, deriveClientStage
};
