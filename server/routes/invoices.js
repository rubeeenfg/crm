const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');
const calc = require('../calc');
const { num, nextInvoiceNumber, computeInvoiceAmounts, sanitizeInvoiceLines, clientSnapshot, invoicePaid, invoiceStatus, generatePendingInvoices, invoiceDataFromBudget } = calc;

const router = express.Router();
router.use(requireAuth);

const defaults = { clientId: '', date: '', concept: '', baseAmount: 0, ivaPct: .21, status: 'Emitida', notes: '', sourceType: 'manual', sourceId: '', sourceRefs: [], lines: [], payments: [] };

// Recalcula importes y estado (Emitida/Parcial/Pagada/Anulada según lo cobrado) y persiste.
function finalize(obj) {
  const withAmounts = computeInvoiceAmounts(obj);
  withAmounts.status = invoiceStatus(withAmounts);
  return withAmounts;
}

router.get('/', (req, res) => {
  const data = db();
  generatePendingInvoices(data, uid);
  persist();
  const rows = [...data.invoices].sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const row = db().invoices.find(i => i.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'Factura no encontrada.' });
  res.json({ item: row });
});

router.post('/', (req, res) => {
  const data = db();
  if (!req.body.clientId) return res.status(400).json({ error: 'Selecciona un cliente.' });
  const snap = clientSnapshot(data, req.body.clientId);
  const date = req.body.date || new Date().toISOString().slice(0, 10);
  const lines = sanitizeInvoiceLines(req.body.lines);
  const obj = finalize({
    ...defaults, ...req.body, ...snap, lines, id: uid('inv'), date, payments: [],
    number: nextInvoiceNumber(data, date), createdAt: new Date().toISOString()
  });
  data.invoices.unshift(obj);
  persist();
  res.status(201).json({ item: obj });
});

router.put('/:id', (req, res) => {
  const data = db();
  const existing = data.invoices.find(i => i.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Factura no encontrada.' });
  // El número, la fecha de emisión y los pagos no se tocan al editar; solo importes/notas/datos.
  // El estado se recalcula solo a partir de los pagos, salvo que se marque/desmarque "Anulada" a mano.
  const snap = req.body.clientId && req.body.clientId !== existing.clientId ? clientSnapshot(data, req.body.clientId) : {};
  const lines = req.body.lines !== undefined ? sanitizeInvoiceLines(req.body.lines) : (existing.lines || []);
  const obj = finalize({ ...existing, ...req.body, ...snap, lines, id: existing.id, number: existing.number, payments: existing.payments || [] });
  data.invoices = data.invoices.map(i => i.id === obj.id ? obj : i);
  persist();
  res.json({ item: obj });
});

router.delete('/:id', (req, res) => {
  const data = db();
  const existing = data.invoices.find(i => i.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Factura no encontrada.' });
  // Si venía de un contrato activo (generada por periodicidad), se recuerda ese
  // periodo como "descartado" para que no se vuelva a generar sola al recargar.
  if (existing.contractedId && existing.period) {
    const cs = data.contracted.find(s => s.id === existing.contractedId);
    if (cs) {
      cs.dismissedPeriods = cs.dismissedPeriods || [];
      if (!cs.dismissedPeriods.includes(existing.period)) cs.dismissedPeriods.push(existing.period);
    }
  }
  data.invoices = data.invoices.filter(i => i.id !== existing.id);
  persist();
  res.json({ ok: true });
});

// --- Pagos parciales (una factura puede cobrarse en varios plazos) ---
router.post('/:id/payments', (req, res) => {
  const data = db();
  const inv = data.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
  if (inv.status === 'Anulada') return res.status(400).json({ error: 'No se pueden registrar pagos en una factura anulada.' });
  const amount = num(req.body && req.body.amount);
  if (amount <= 0) return res.status(400).json({ error: 'El importe del pago debe ser mayor que 0.' });
  const payment = {
    id: uid('pay'), date: (req.body && req.body.date) || new Date().toISOString().slice(0, 10),
    amount, method: (req.body && req.body.method) || '', notes: (req.body && req.body.notes) || ''
  };
  inv.payments = inv.payments || [];
  inv.payments.push(payment);
  inv.status = invoiceStatus(inv);
  persist();
  res.status(201).json({ item: inv });
});

router.delete('/:id/payments/:paymentId', (req, res) => {
  const data = db();
  const inv = data.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
  inv.payments = (inv.payments || []).filter(p => p.id !== req.params.paymentId);
  inv.status = invoiceStatus(inv);
  persist();
  res.json({ item: inv });
});

// Genera una factura a partir de un contrato activo (acción manual, por ejemplo un
// cobro puntual además del contrato recurrente). Para presupuestos, usa el
// endpoint dedicado POST /api/budgets/:id/invoice (copia todas las líneas, AC4);
// esta rama se mantiene solo por compatibilidad con llamadas antiguas.
router.post('/generate', (req, res) => {
  const data = db();
  const { sourceType, sourceId } = req.body || {};

  if (sourceType === 'budget') {
    const b = data.budgets.find(x => x.id === sourceId);
    if (!b) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
    if (!['aceptado', 'en_curso'].includes(b.status)) {
      return res.status(400).json({ error: 'Solo se puede facturar un presupuesto aceptado o en curso.' });
    }
    if (b.invoiceId) return res.status(400).json({ error: 'Este presupuesto ya tiene una factura generada.' });
    const invoiceData = invoiceDataFromBudget(data, b, uid);
    data.invoices.unshift(invoiceData);
    data.budgets = data.budgets.map(x => x.id === b.id ? { ...x, status: 'facturado', invoiceId: invoiceData.id } : x);
    persist();
    return res.status(201).json({ item: invoiceData });
  }

  if (sourceType !== 'contracted') return res.status(400).json({ error: 'Origen de factura no válido.' });
  const cs = data.contracted.find(x => x.id === sourceId);
  if (!cs) return res.status(404).json({ error: 'Contrato no encontrado.' });
  const clientId = cs.clientId;
  const concept = `${cs.name || 'Servicio'} (${cs.periodicity})`;
  const baseAmount = num(cs.price);

  const snap = clientSnapshot(data, clientId);
  const date = new Date().toISOString().slice(0, 10);
  const obj = finalize({
    ...defaults, ...snap, id: uid('inv'), date, concept, baseAmount,
    ivaPct: num(data.config.iva), status: 'Emitida', sourceType, sourceId, payments: [],
    number: nextInvoiceNumber(data, date), createdAt: new Date().toISOString()
  });
  data.invoices.unshift(obj);
  persist();
  res.status(201).json({ item: obj });
});

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  return (num(n)).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Vista HTML imprimible: el usuario la abre en una pestaña y usa "Imprimir > Guardar como PDF".
// Si la factura tiene pagos parciales, se muestra su desglose y el importe pendiente;
// si está pagada del todo, sirve también como comprobante de pago para el cliente.
router.get('/:id/print', (req, res) => {
  const data = db();
  const inv = data.invoices.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).send('Factura no encontrada.');
  const cfg = data.config;
  const paid = invoicePaid(inv);
  const pending = Math.max(0, num(inv.total) - paid);
  const statusLabel = inv.status === 'Pagada' ? 'PAGADA' : inv.status === 'Anulada' ? 'ANULADA' : inv.status === 'Parcial' ? 'PAGO PARCIAL' : 'EMITIDA';
  const statusClass = inv.status === 'Pagada' ? 'PAGADA' : inv.status === 'Anulada' ? 'ANULADA' : inv.status === 'Parcial' ? 'PARCIAL' : 'EMITIDA';
  const payments = inv.payments || [];
  // Si la factura tiene líneas (varios servicios/conceptos), se listan una a una;
  // si no (facturas antiguas o generadas automáticamente desde un contrato/proyecto
  // con un único importe), se muestra la fila única de siempre.
  const lines = Array.isArray(inv.lines) && inv.lines.length
    ? inv.lines
    : [{ concept: inv.concept || 'Servicios digitales', qty: 1, unitPrice: inv.baseAmount, amount: inv.baseAmount }];
  // El título del documento es lo que Chrome/Electron proponen como nombre de archivo
  // al usar "Imprimir > Guardar como PDF", así se guarda ya con el nº de factura y el
  // cliente sin tener que escribirlo a mano.
  const pdfFileName = `Factura ${inv.number || ''} - ${inv.clientName || 'Cliente'}`.replace(/[\\/:*?"<>|]/g, '-').trim();
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>${esc(pdfFileName)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#141c2b;max-width:780px;margin:40px auto;padding:0 20px;font-size:14px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:18px;margin-bottom:24px}
    .head h1{font-size:22px;margin:0 0 4px;letter-spacing:-.02em}
    .head .num{font-size:15px;color:#0d9488;font-weight:700}
    .status{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.04em}
    .status.EMITIDA{background:#fef3c7;color:#b45309}
    .status.PARCIAL{background:#dbeafe;color:#1d4ed8}
    .status.PAGADA{background:#dcfce7;color:#15803d}
    .status.ANULADA{background:#ffe4e6;color:#be123c}
    .cols{display:flex;gap:30px;margin-bottom:26px}
    .cols div{flex:1}
    .cols h3{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7690;margin:0 0 6px}
    .cols p{margin:0;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-bottom:22px}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b7690;border-bottom:2px solid #e2e7f1;padding:8px 6px}
    td{padding:12px 6px;border-bottom:1px solid #e2e7f1}
    .totals{margin-left:auto;width:280px}
    .totals div{display:flex;justify-content:space-between;padding:6px 0}
    .totals .total{border-top:2px solid #141c2b;margin-top:6px;padding-top:10px;font-weight:800;font-size:17px}
    .totals .pending{color:#b45309;font-weight:700}
    .progress{height:8px;border-radius:99px;background:#e2e7f1;overflow:hidden;margin:6px 0 22px}
    .progress b{display:block;height:100%;background:#0d9488}
    .notes{margin-top:30px;font-size:12px;color:#6b7690}
    @media print{ body{margin:0;padding:16px} .noprint{display:none} }
    .noprint{margin:22px 0;text-align:right}
    .noprint button{background:#0d9488;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:700}
  </style></head><body>
  <div class="noprint">
    <span id="pdfMsg" style="margin-right:14px;font-size:12.5px;font-weight:700;color:#0d9488"></span>
    <button id="btnSavePdf" style="display:none;margin-right:8px" onclick="saveAsPdfDirect()">Guardar PDF</button>
    <button onclick="window.print()">Imprimir / Guardar como PDF</button>
  </div>
  <div class="head">
    <div>
      ${cfg.companyLogo ? `<img src="${esc(cfg.companyLogo)}" alt="" style="max-height:48px;max-width:220px;display:block;margin-bottom:8px">` : ''}
      <h1>${esc(cfg.companyName || 'RCP Digital')}</h1>
      ${cfg.businessTaxId ? `<p style="margin:0">${esc(cfg.businessTaxId)}</p>` : ''}
      ${cfg.businessAddress ? `<p style="margin:0">${esc(cfg.businessAddress)}</p>` : ''}
      ${cfg.businessEmail ? `<p style="margin:0">${esc(cfg.businessEmail)}</p>` : ''}
      ${cfg.businessPhone ? `<p style="margin:0">${esc(cfg.businessPhone)}</p>` : ''}
    </div>
    <div style="text-align:right">
      <div class="num">Factura ${esc(inv.number)}</div>
      <div>${esc(inv.date)}</div>
      <span class="status ${statusClass}">${statusLabel}</span>
    </div>
  </div>
  <div class="cols">
    <div><h3>Facturar a</h3>
      <p><strong>${esc(inv.clientName)}</strong></p>
      ${inv.clientTaxId ? `<p>${esc(inv.clientTaxId)}</p>` : ''}
      ${inv.clientAddress ? `<p>${esc(inv.clientAddress)}</p>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>Concepto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio</th><th style="text-align:right">Importe</th></tr></thead>
    <tbody>${lines.map(l => `<tr><td>${esc(l.concept || 'Servicios digitales')}</td><td style="text-align:center">${num(l.qty) || 1}</td><td style="text-align:right">${money(l.unitPrice)}</td><td style="text-align:right">${money(l.amount)}</td></tr>`).join('')}</tbody>
  </table>
  <div class="totals">
    <div><span>Base imponible</span><span>${money(inv.baseAmount)}</span></div>
    <div><span>IVA (${Math.round(inv.ivaPct * 100)}%)</span><span>${money(inv.ivaAmount)}</span></div>
    <div class="total"><span>Total</span><span>${money(inv.total)}</span></div>
    ${payments.length ? `<div><span>Cobrado</span><span>${money(paid)}</span></div><div class="pending"><span>Pendiente</span><span>${money(pending)}</span></div>` : ''}
  </div>
  ${payments.length ? `
  <div class="progress"><b style="width:${Math.min(100, inv.total > 0 ? (paid / inv.total) * 100 : 0)}%"></b></div>
  <table>
    <thead><tr><th>Pagos recibidos</th><th>Método</th><th style="text-align:right">Importe</th></tr></thead>
    <tbody>${payments.map(p => `<tr><td>${esc(p.date)}</td><td>${esc(p.method || '—')}</td><td style="text-align:right">${money(p.amount)}</td></tr>`).join('')}</tbody>
  </table>` : ''}
  ${inv.notes ? `<div class="notes"><strong>Notas:</strong> ${esc(inv.notes)}</div>` : ''}
  <script>
    (function(){
      // Si esta ventana la abrió la app de escritorio (Electron), tiene acceso a
      // electronAPI y puede guardar el PDF de verdad en un clic, sin diálogo de
      // impresión. Si se abre desde un navegador normal, ese botón no aparece y
      // solo queda "Imprimir / Guardar como PDF" (el del sistema).
      var btn = document.getElementById('btnSavePdf');
      var msg = document.getElementById('pdfMsg');
      if (window.electronAPI && window.electronAPI.saveInvoicePdf) btn.style.display = 'inline-block';
      window.saveAsPdfDirect = async function(){
        if (!window.electronAPI || !window.electronAPI.saveInvoicePdf) return;
        btn.disabled = true; btn.textContent = 'Guardando...'; msg.style.color = '#0d9488'; msg.textContent = '';
        try {
          var r = await window.electronAPI.saveInvoicePdf(${JSON.stringify(inv.id)}, ${JSON.stringify(pdfFileName)});
          if (r && r.ok) {
            msg.textContent = 'Guardado en Documentos \\\\ RCP Digital CRM \\\\ Facturas';
            if (window.electronAPI.openInFolder) window.electronAPI.openInFolder(r.filePath);
          }
        } catch (e) {
          msg.style.color = '#be123c';
          msg.textContent = 'No se pudo guardar: ' + (e && e.message ? e.message : e);
        } finally {
          btn.disabled = false; btn.textContent = 'Guardar PDF';
        }
      };
    })();
  </script>
  </body></html>`);
});

module.exports = router;
