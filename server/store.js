// Almacen de datos: SQLite local (server/db.js) en vez del JSON anterior.
// Mantiene exactamente el mismo contrato que el store.js anterior (db()/persist()/
// uid()/...) para que el resto de rutas no tenga que cambiar: db() devuelve un
// objeto en memoria con las mismas colecciones de siempre (con la excepción de
// "budgets", que ahora lleva "lines[]" en vez de precio/coste planos — presupuestos
// multi-línea, plan Fase 1-2), y persist() vuelca ese objeto entero a SQLite dentro
// de una única transacción.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openDb, DATA_DIR } = require('./db');

const DB_FILE = path.join(DATA_DIR, 'data.sqlite');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbnails');
const JSON_FILE = path.join(DATA_DIR, 'data.json');

// --- Migración automática JSON -> SQLite al primer arranque de esta versión ---
// Si ya existe data.sqlite, no se toca. Si solo existe el data.json antiguo (una
// instalación previa a esta versión), se migra y se verifica automáticamente;
// si algo no cuadra, la app NO arranca con datos a medio migrar (modo seguro) y
// el data.json original queda intacto para poder reintentarlo o pedir ayuda.
function maybeAutoMigrateFromJson() {
  if (fs.existsSync(DB_FILE) || !fs.existsSync(JSON_FILE)) return;
  console.log('Detectado data.json de una versión anterior: migrando a SQLite automáticamente...');
  const { migrate } = require('../scripts/migrate-json-to-sqlite');
  const { verify } = require('../scripts/verify-migration');
  migrate();
  const discrepancies = verify();
  if (discrepancies.length) {
    if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
    throw new Error(
      `La migración automática de datos encontró ${discrepancies.length} discrepancia(s) y se ha cancelado por seguridad. ` +
      'Tu data.json original no se ha tocado. Contacta con soporte antes de continuar.'
    );
  }
  // Migración verificada: el JSON antiguo se archiva (nunca se borra) como
  // vuelta atrás manual durante al menos 90 días (plan Fase 5.3).
  const KEY_FILE_LEGACY = path.join(DATA_DIR, '.enc.key');
  const archiveDir = path.join(DATA_DIR, `_migrado_${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.renameSync(JSON_FILE, path.join(archiveDir, 'data.json'));
  if (fs.existsSync(KEY_FILE_LEGACY)) fs.renameSync(KEY_FILE_LEGACY, path.join(archiveDir, '.enc.key'));
  console.log(`Migración automática completa y verificada. Copia del JSON original en ${archiveDir}`);
}

// --- Cifrado (solo para las copias de seguridad diarias, Fase 0.1: el fichero
// data.sqlite en uso lo protegen los permisos normales del sistema) ---
const KEY_FILE = path.join(DATA_DIR, '.enc.key');

function loadOrCreateKey() {
  if (fs.existsSync(KEY_FILE)) return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

function encryptBuffer(buf) {
  const key = loadOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('hex'), tag: tag.toString('hex'), ct: ct.toString('base64') });
}

// --- Copias de seguridad automáticas: una por día, cifradas, del fichero
// data.sqlite tal cual está en disco en ese momento. Se conservan las últimas 30.
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_KEEP = 30;
const BACKUP_RE = /^data-\d{4}-\d{2}-\d{2}\.sqlite\.enc$/;

function maybeBackup() {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const backupFile = path.join(BACKUP_DIR, `data-${today}.sqlite.enc`);
    if (fs.existsSync(backupFile)) return; // ya hay copia de hoy
    const raw = fs.readFileSync(DB_FILE);
    fs.writeFileSync(backupFile, encryptBuffer(raw), { mode: 0o600 });
    const files = fs.readdirSync(BACKUP_DIR).filter(f => BACKUP_RE.test(f)).sort();
    while (files.length > BACKUP_KEEP) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  } catch (e) {
    console.error('No se pudo crear la copia de seguridad automática:', e.message);
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => BACKUP_RE.test(f))
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, date: f.slice(5, 15), size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

// Columnas por defecto del Kanban de proyectos (Fase 6): el usuario las puede
// renombrar, reordenar, recolorear o borrar desde Configuración.
const KANBAN_COLUMNS_DEFAULT = [
  { key: 'pendiente', label: 'Pendiente', color: '#64748b', order: 0 },
  { key: 'en_progreso', label: 'En progreso', color: '#2563eb', order: 1 },
  { key: 'revision', label: 'Revisión', color: '#b45309', order: 2 },
  { key: 'entregado', label: 'Entregado', color: '#15803d', order: 3 }
];

// probability (Fase 12.1): estimación razonable por etapa para el forecast
// ponderado del pipeline; el admin puede ajustarla desde la UI.
const PIPELINE_STAGES_DEFAULT = [
  { key: 'nuevo_lead', label: 'Nuevo lead', color: '#64748b', order: 0, probability: 10 },
  { key: 'contactado', label: 'Contactado', color: '#2563eb', order: 1, probability: 20 },
  { key: 'propuesta_enviada', label: 'Propuesta enviada', color: '#7c3aed', order: 2, probability: 40 },
  { key: 'negociacion', label: 'En negociación', color: '#b45309', order: 3, probability: 60 },
  { key: 'cliente_activo', label: 'Cliente activo', color: '#15803d', order: 4, probability: 100 },
  { key: 'pausado', label: 'Pausado', color: '#0891b2', order: 5, probability: 50 },
  { key: 'finalizado', label: 'Finalizado', color: '#0d9488', order: 6, probability: 100 },
  { key: 'perdido', label: 'Perdido / Descartado', color: '#be123c', order: 7, probability: 0 }
];

const num = v => Number(v) || 0;
const bool01 = v => (v ? 1 : 0);

let db = null; // conexión better-sqlite3
let data = null; // snapshot en memoria, misma forma que antes

// --- Carga: SQLite -> objeto en memoria ---
function loadFromSql() {
  const meta = db.prepare('SELECT * FROM meta WHERE id = 1').get() || {};
  const counters = {};
  db.prepare('SELECT year, counter FROM invoice_counters').all().forEach(r => { counters[r.year] = r.counter; });

  const cfgRow = db.prepare('SELECT * FROM config WHERE id = 1').get() || {};
  const config = {
    companyName: cfgRow.company_name, productiveHours: cfgRow.productive_hours, salaryTarget: cfgRow.salary_target,
    buffer: cfgRow.buffer, margin: cfgRow.margin, amortizationPct: cfgRow.amortization_pct, iva: cfgRow.iva,
    irpf: cfgRow.irpf, rounding: cfgRow.rounding, defaultIndirectPct: cfgRow.default_indirect_pct,
    businessTaxId: cfgRow.business_tax_id, businessAddress: cfgRow.business_address, businessEmail: cfgRow.business_email,
    businessPhone: cfgRow.business_phone, aiMonthlySpendAlertEur: cfgRow.ai_monthly_spend_alert_eur,
    onboardingTasks: JSON.parse(cfgRow.onboarding_tasks || '[]'),
    companyLogo: cfgRow.company_logo || '', paymentTermsDays: cfgRow.payment_terms_days,
    quoteValidityDays: cfgRow.quote_validity_days, invoicePrefix: cfgRow.invoice_prefix || ''
  };

  const pipelineStages = db.prepare('SELECT * FROM pipeline_stages ORDER BY sort_order').all()
    .map(r => ({ key: r.key, label: r.label, color: r.color, order: r.sort_order, probability: r.probability }));

  const users = db.prepare('SELECT * FROM users').all().map(u => ({
    id: u.id, name: u.name, email: u.email, passwordHash: u.password_hash, pinHash: u.pin_hash,
    pinAttempts: u.pin_attempts, pinLockedUntil: u.pin_locked_until, role: u.role,
    activeClockIn: u.active_clock_in ? JSON.parse(u.active_clock_in) : null, createdAt: u.created_at,
    visibleSections: u.visible_sections ? JSON.parse(u.visible_sections) : null
  }));

  const fixed = db.prepare('SELECT * FROM fixed_costs').all().map(f => ({
    id: f.id, concept: f.concept, group: f.grp, provider: f.provider, monthly: f.monthly, active: !!f.active, notes: f.notes
  }));

  const services = db.prepare('SELECT * FROM services').all().map(s => ({
    id: s.id, name: s.name, client: s.client, category: s.category, unit: s.unit, hours: s.hours, tool: s.tool,
    sub: s.sub, ads: s.ads, other: s.other, indirectPct: s.indirect_pct, margin: s.margin, commissionPct: s.commission_pct,
    active: !!s.active, notes: s.notes
  }));

  const clients = db.prepare('SELECT * FROM clients').all().map(c => ({
    id: c.id, name: c.name, contactName: c.contact_name, email: c.email, phone: c.phone, taxId: c.tax_id,
    websiteUrl: c.website_url, billingAddress: c.billing_address, notes: c.notes, pipelineStage: c.pipeline_stage,
    pipelineValue: c.pipeline_value, source: c.source, nextActionDate: c.next_action_date, ownerId: c.owner_id,
    domainRenewalDate: c.domain_renewal_date || '', createdAt: c.created_at, updatedAt: c.updated_at
  }));

  const budgetLinesByBudget = {};
  db.prepare('SELECT * FROM budget_lines ORDER BY budget_id, sort_order').all().forEach(l => {
    (budgetLinesByBudget[l.budget_id] = budgetLinesByBudget[l.budget_id] || []).push({
      id: l.id, serviceId: l.service_id, isManual: !!l.is_manual, concept: l.concept_snapshot,
      unitPrice: l.unit_price_snapshot, unitCost: l.unit_cost_snapshot, qty: l.qty, discountPct: l.discount_pct
    });
  });
  const budgets = db.prepare('SELECT * FROM budgets').all().map(b => ({
    id: b.id, clientId: b.client_id, date: b.date, status: b.status, legacyStatus: b.legacy_status, charged: b.charged,
    commissionPct: b.commission_pct, notes: b.notes, paused: !!b.paused, createdAt: b.created_at, sentAt: b.sent_at,
    acceptedAt: b.accepted_at, invoiceId: b.invoice_id, kanbanColumn: b.kanban_column, lines: budgetLinesByBudget[b.id] || []
  }));

  const contracted = db.prepare('SELECT * FROM contracted').all().map(c => ({
    id: c.id, clientId: c.client_id, name: c.name, periodicity: c.periodicity, price: c.price, startDate: c.start_date,
    endDate: c.end_date, status: c.status, notes: c.notes, dismissedPeriods: JSON.parse(c.dismissed_periods || '[]'),
    paused: !!c.paused, resourceId: c.resource_id, monthlyHoursQuota: c.monthly_hours_quota
  }));

  const invoiceLinesByInvoice = {};
  db.prepare('SELECT * FROM invoice_lines ORDER BY invoice_id, sort_order').all().forEach(l => {
    (invoiceLinesByInvoice[l.invoice_id] = invoiceLinesByInvoice[l.invoice_id] || []).push({
      id: l.id, concept: l.concept, qty: l.qty, unitPrice: l.unit_price, amount: l.amount
    });
  });
  const paymentsByInvoice = {};
  db.prepare('SELECT * FROM payments ORDER BY invoice_id, date').all().forEach(p => {
    (paymentsByInvoice[p.invoice_id] = paymentsByInvoice[p.invoice_id] || []).push({
      id: p.id, date: p.date, amount: p.amount, method: p.method, notes: p.notes
    });
  });
  const invoices = db.prepare('SELECT * FROM invoices').all().map(i => ({
    id: i.id, clientId: i.client_id, clientName: i.client_name, clientTaxId: i.client_tax_id, clientAddress: i.client_address,
    number: i.number, date: i.date, concept: i.concept, baseAmount: i.base_amount, ivaPct: i.iva_pct, ivaAmount: i.iva_amount,
    total: i.total, status: i.status, notes: i.notes, sourceType: i.source_type, sourceId: i.source_id,
    contractedId: i.contracted_id, period: i.period, createdAt: i.created_at,
    lines: invoiceLinesByInvoice[i.id] || [], payments: paymentsByInvoice[i.id] || []
  }));

  const timeEntries = db.prepare('SELECT * FROM time_entries').all().map(t => ({
    id: t.id, date: t.date, contractedId: t.contracted_id, budgetId: t.budget_id, clientId: t.client_id, client: t.client,
    service: t.service, hours: t.hours, billable: !!t.billable, notes: t.notes, clockedInAt: t.clocked_in_at, clockedOutAt: t.clocked_out_at
  }));

  const charges = db.prepare('SELECT data FROM legacy_charges').all().map(r => JSON.parse(r.data));
  const resources = db.prepare('SELECT data FROM legacy_resources').all().map(r => JSON.parse(r.data));

  const kanbanColumns = db.prepare('SELECT * FROM kanban_columns ORDER BY sort_order').all()
    .map(r => ({ key: r.key, label: r.label, color: r.color, order: r.sort_order }));
  const kanbanTasks = db.prepare('SELECT * FROM kanban_tasks ORDER BY budget_id, sort_order').all().map(t => ({
    id: t.id, budgetId: t.budget_id, title: t.title, assigneeId: t.assignee_id, done: !!t.done, createdAt: t.created_at
  }));

  const clientActivity = db.prepare('SELECT * FROM client_activity_log ORDER BY created_at DESC').all().map(a => ({
    id: a.id, clientId: a.client_id, type: a.type, description: a.description, createdAt: a.created_at
  }));

  const budgetTemplates = db.prepare('SELECT * FROM budget_templates ORDER BY created_at').all().map(t => ({
    id: t.id, name: t.name, lines: JSON.parse(t.lines || '[]'), createdAt: t.created_at
  }));

  const emails = db.prepare('SELECT * FROM emails ORDER BY created_at DESC').all().map(e => ({
    id: e.id, clientId: e.client_id, direction: e.direction, from: e.from_address, to: e.to_address,
    subject: e.subject, bodyText: e.body_text, bodyHtml: e.body_html, messageId: e.message_id,
    inReplyTo: e.in_reply_to, read: !!e.is_read, createdAt: e.created_at
  }));
  const emailDrafts = db.prepare('SELECT * FROM email_drafts ORDER BY created_at').all().map(d => ({
    id: d.id, emailId: d.email_id, body: d.body, model: d.model,
    inputTokens: d.input_tokens, outputTokens: d.output_tokens, createdAt: d.created_at
  }));

  return {
    meta: { sessionSecret: meta.session_secret, createdAt: meta.created_at, invoiceCounters: counters },
    config, pipelineStages, users, fixed, services, clients, budgets, contracted, invoices, timeEntries, charges, resources,
    kanbanColumns, kanbanTasks, clientActivity, budgetTemplates, emails, emailDrafts
  };
}

// --- Guardado: objeto en memoria -> SQLite (reemplazo completo, transaccional) ---
function saveToSql() {
  const tx = db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO meta (id, session_secret, created_at) VALUES (1, ?, ?)')
      .run(data.meta.sessionSecret, data.meta.createdAt);
    db.prepare('DELETE FROM invoice_counters').run();
    Object.entries(data.meta.invoiceCounters || {}).forEach(([year, counter]) => {
      db.prepare('INSERT INTO invoice_counters (year, counter) VALUES (?, ?)').run(year, num(counter));
    });

    const c = data.config || {};
    db.prepare(`INSERT OR REPLACE INTO config
      (id, company_name, productive_hours, salary_target, buffer, margin, amortization_pct, iva, irpf, rounding,
       default_indirect_pct, business_tax_id, business_address, business_email, business_phone, ai_monthly_spend_alert_eur, onboarding_tasks,
       company_logo, payment_terms_days, quote_validity_days, invoice_prefix)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      c.companyName, num(c.productiveHours), num(c.salaryTarget), num(c.buffer), num(c.margin), num(c.amortizationPct),
      num(c.iva), num(c.irpf), num(c.rounding), num(c.defaultIndirectPct), c.businessTaxId || '', c.businessAddress || '',
      c.businessEmail || '', c.businessPhone || '', num(c.aiMonthlySpendAlertEur) || 15, JSON.stringify(c.onboardingTasks || []),
      c.companyLogo || '', num(c.paymentTermsDays) || 30, num(c.quoteValidityDays) || 15, c.invoicePrefix || ''
    );

    db.prepare('DELETE FROM pipeline_stages').run();
    (data.pipelineStages || []).forEach((s, i) => {
      db.prepare('INSERT INTO pipeline_stages (key, label, color, sort_order, probability) VALUES (?, ?, ?, ?, ?)')
        .run(s.key, s.label, s.color || '#64748b', s.order != null ? s.order : i, num(s.probability));
    });

    db.prepare('DELETE FROM users').run();
    (data.users || []).forEach(u => {
      db.prepare(`INSERT INTO users (id, name, email, password_hash, pin_hash, pin_attempts, pin_locked_until, role, active_clock_in, created_at, visible_sections)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        u.id, u.name || '', u.email || '', u.passwordHash || '', u.pinHash || null, num(u.pinAttempts),
        u.pinLockedUntil || null, u.role || 'colaborador', u.activeClockIn ? JSON.stringify(u.activeClockIn) : null, u.createdAt,
        u.visibleSections ? JSON.stringify(u.visibleSections) : null
      );
    });

    db.prepare('DELETE FROM fixed_costs').run();
    (data.fixed || []).forEach(f => {
      db.prepare('INSERT INTO fixed_costs (id, concept, grp, provider, monthly, active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(f.id, f.concept || '', f.group || '', f.provider || '', num(f.monthly), bool01(f.active !== false), f.notes || '');
    });

    db.prepare('DELETE FROM services').run();
    (data.services || []).forEach(s => {
      db.prepare(`INSERT INTO services (id, name, client, category, unit, hours, tool, sub, ads, other, indirect_pct, margin, commission_pct, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        s.id, s.name || '', s.client || '', s.category || '', s.unit || 'Proyecto', num(s.hours), num(s.tool), num(s.sub),
        num(s.ads), num(s.other), num(s.indirectPct), num(s.margin), num(s.commissionPct), bool01(s.active !== false), s.notes || ''
      );
    });

    db.prepare('DELETE FROM clients').run();
    (data.clients || []).forEach(cl => {
      db.prepare(`INSERT INTO clients (id, name, contact_name, email, phone, tax_id, website_url, billing_address, notes, pipeline_stage, pipeline_value, source, next_action_date, owner_id, domain_renewal_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        cl.id, cl.name || '', cl.contactName || '', cl.email || '', cl.phone || '', cl.taxId || '', cl.websiteUrl || '', cl.billingAddress || '',
        cl.notes || '', cl.pipelineStage || 'nuevo_lead', num(cl.pipelineValue), cl.source || '', cl.nextActionDate || '',
        cl.ownerId || '', cl.domainRenewalDate || '', cl.createdAt, cl.updatedAt
      );
    });

    db.prepare('DELETE FROM budget_lines').run();
    db.prepare('DELETE FROM budgets').run();
    (data.budgets || []).forEach(b => {
      db.prepare(`INSERT INTO budgets (id, client_id, date, status, legacy_status, charged, commission_pct, notes, paused, created_at, sent_at, accepted_at, invoice_id, kanban_column)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        b.id, b.clientId || '', b.date || '', b.status || 'borrador', b.legacyStatus || null, b.charged || 'No',
        num(b.commissionPct), b.notes || '', bool01(b.paused), b.createdAt, b.sentAt || null, b.acceptedAt || null, b.invoiceId || null,
        b.kanbanColumn || null
      );
      (b.lines || []).forEach((l, i) => {
        db.prepare(`INSERT INTO budget_lines (id, budget_id, service_id, is_manual, concept_snapshot, unit_price_snapshot, unit_cost_snapshot, qty, discount_pct, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          l.id, b.id, l.serviceId || null, bool01(l.isManual), l.concept || '', num(l.unitPrice), num(l.unitCost), num(l.qty) || 1, num(l.discountPct), i
        );
      });
    });

    db.prepare('DELETE FROM contracted').run();
    (data.contracted || []).forEach(cs => {
      db.prepare(`INSERT INTO contracted (id, client_id, name, periodicity, price, start_date, end_date, status, notes, dismissed_periods, paused, resource_id, monthly_hours_quota)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        cs.id, cs.clientId || '', cs.name || '', cs.periodicity || 'Mensual', num(cs.price), cs.startDate || '',
        cs.endDate || '', cs.status || 'Activo', cs.notes || '', JSON.stringify(cs.dismissedPeriods || []), bool01(cs.paused), cs.resourceId || null,
        num(cs.monthlyHoursQuota)
      );
    });

    db.prepare('DELETE FROM invoice_lines').run();
    db.prepare('DELETE FROM payments').run();
    db.prepare('DELETE FROM invoices').run();
    (data.invoices || []).forEach(inv => {
      db.prepare(`INSERT INTO invoices (id, client_id, client_name, client_tax_id, client_address, number, date, concept, base_amount, iva_pct, iva_amount, total, status, notes, source_type, source_id, contracted_id, period, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        inv.id, inv.clientId || '', inv.clientName || '', inv.clientTaxId || '', inv.clientAddress || '', inv.number || '',
        inv.date || '', inv.concept || '', num(inv.baseAmount), num(inv.ivaPct), num(inv.ivaAmount), num(inv.total),
        inv.status || 'Emitida', inv.notes || '', inv.sourceType || 'manual', inv.sourceId || '', inv.contractedId || null,
        inv.period || null, inv.createdAt
      );
      (inv.lines || []).forEach((l, i) => {
        db.prepare('INSERT INTO invoice_lines (id, invoice_id, concept, qty, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(l.id, inv.id, l.concept || '', num(l.qty) || 1, num(l.unitPrice), num(l.amount), i);
      });
      (inv.payments || []).forEach(p => {
        db.prepare('INSERT INTO payments (id, invoice_id, date, amount, method, notes) VALUES (?, ?, ?, ?, ?, ?)')
          .run(p.id, inv.id, p.date || '', num(p.amount), p.method || '', p.notes || '');
      });
    });

    db.prepare('DELETE FROM time_entries').run();
    (data.timeEntries || []).forEach(t => {
      db.prepare(`INSERT INTO time_entries (id, date, contracted_id, budget_id, client_id, client, service, hours, billable, notes, clocked_in_at, clocked_out_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        t.id, t.date || '', t.contractedId || '', t.budgetId || '', t.clientId || '', t.client || '', t.service || '',
        num(t.hours), bool01(t.billable !== false), t.notes || '', t.clockedInAt || null, t.clockedOutAt || null
      );
    });

    db.prepare('DELETE FROM legacy_charges').run();
    (data.charges || []).forEach(ch => db.prepare('INSERT INTO legacy_charges (id, data) VALUES (?, ?)').run(ch.id, JSON.stringify(ch)));
    db.prepare('DELETE FROM legacy_resources').run();
    (data.resources || []).forEach(r => db.prepare('INSERT INTO legacy_resources (id, data) VALUES (?, ?)').run(r.id, JSON.stringify(r)));

    db.prepare('DELETE FROM kanban_columns').run();
    (data.kanbanColumns || []).forEach((c, i) => {
      db.prepare('INSERT INTO kanban_columns (key, label, color, sort_order) VALUES (?, ?, ?, ?)')
        .run(c.key, c.label || '', c.color || '#64748b', c.order != null ? c.order : i);
    });
    db.prepare('DELETE FROM kanban_tasks').run();
    (data.kanbanTasks || []).forEach((t, i) => {
      db.prepare('INSERT INTO kanban_tasks (id, budget_id, title, assignee_id, done, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(t.id, t.budgetId, t.title || '', t.assigneeId || null, bool01(t.done), i, t.createdAt);
    });

    db.prepare('DELETE FROM client_activity_log').run();
    (data.clientActivity || []).forEach(a => {
      db.prepare('INSERT INTO client_activity_log (id, client_id, type, description, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(a.id, a.clientId, a.type || '', a.description || '', a.createdAt);
    });

    db.prepare('DELETE FROM budget_templates').run();
    (data.budgetTemplates || []).forEach(t => {
      db.prepare('INSERT INTO budget_templates (id, name, lines, created_at) VALUES (?, ?, ?, ?)')
        .run(t.id, t.name || '', JSON.stringify(t.lines || []), t.createdAt);
    });

    db.prepare('DELETE FROM email_drafts').run();
    db.prepare('DELETE FROM emails').run();
    (data.emails || []).forEach(e => {
      db.prepare(`INSERT INTO emails (id, client_id, direction, from_address, to_address, subject, body_text, body_html, message_id, in_reply_to, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        e.id, e.clientId || null, e.direction || 'in', e.from || '', e.to || '', e.subject || '',
        e.bodyText || '', e.bodyHtml || '', e.messageId || null, e.inReplyTo || null, bool01(e.read), e.createdAt
      );
    });
    (data.emailDrafts || []).forEach(d => {
      db.prepare('INSERT INTO email_drafts (id, email_id, body, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(d.id, d.emailId, d.body || '', d.model || '', num(d.inputTokens), num(d.outputTokens), d.createdAt);
    });
  });
  tx();
}

function buildDefaultServices() {
  const SERVICES_SEED = [
    ['Portfolio básico / presencia online', 'Autónomo o negocio que empieza', 'Portfolio / Web básica', 'Proyecto', 20, 12, 0, 0, 0, .05, .35, 0],
    ['Web media + perfil de negocio en Google', 'Negocio local con 4-5 secciones', 'Portfolio / Web básica', 'Proyecto', 30, 25, 0, 0, 20, .10, .35, .10],
    ['Web avanzada / profesional', 'Restaurante, clínica o servicios', 'Web profesional', 'Proyecto', 40, 50, 0, 0, 35, .12, .35, .10],
    ['Web avanzada + WhatsApp + chat', 'Captación de clientes y atención online', 'Web profesional', 'Proyecto', 40, 80, 0, 0, 40, .12, .35, 0],
    ['Landing page campaña', 'Promoción, evento o servicio concreto', 'Portfolio / Web básica', 'Proyecto', 7, 10, 0, 0, 10, .08, .35, 0],
    ['Tienda online base hasta 20 productos', 'Ecommerce pequeño', 'Tienda online', 'Proyecto', 30, 90, 0, 0, 45, .15, .35, .10],
    ['Tienda online 21-40 productos', 'Ecommerce pequeño/medio', 'Tienda online', 'Proyecto', 37, 95, 0, 0, 55, .15, .35, .10],
    ['Tienda online 41-60 productos', 'Ecommerce medio', 'Tienda online', 'Proyecto', 45, 105, 0, 0, 65, .15, .35, .10],
    ['Tienda online 61-80 productos', 'Ecommerce medio/amplio', 'Tienda online', 'Proyecto', 57, 115, 0, 0, 75, .15, .35, .10],
    ['Tienda online 81-100 productos', 'Ecommerce amplio', 'Tienda online', 'Proyecto', 65, 125, 0, 0, 85, .15, .35, .10],
    ['Tienda online +100 productos', 'Presupuesto personalizado', 'Tienda online', 'Proyecto', 0, 0, 0, 0, 0, .15, .35, 0],
    ['Configuración WhatsApp Business', 'Extra para web o ficha de negocio', 'Extras web', 'Único', 4, 0, 0, 0, 0, .05, .35, 0],
    ['Chat online básico / chatbot IA', 'Extra para atención al cliente', 'Automatizaciones IA', 'Único', 8, 20, 0, 0, 10, .10, .40, .10],
    ['Automatización formulario a email/Sheets/CRM', 'Captación y organización de leads', 'Automatizaciones IA', 'Proyecto', 10, 10, 0, 0, 10, .10, .35, .10],
    ['Mantenimiento web básico', 'Actualizaciones y pequeñas revisiones', 'Mantenimiento web', 'Mes', 2, 12, 0, 0, 0, .08, .35, 0],
    ['Mantenimiento web completo', 'Actualizaciones + cambios + soporte', 'Mantenimiento web', 'Mes', 6, 12, 0, 0, 5, .08, .35, 0],
    ['SEO inicial básico', 'Indexación, títulos, textos y velocidad', 'SEO/SEM', 'Proyecto', 8, 10, 0, 0, 10, .10, .35, 0],
    ['Redes sociales pack básico', 'Contenido mensual básico', 'Redes sociales', 'Mes', 10, 20, 0, 80, 10, .10, .35, 0],
    ['Consultoría digital / IA', 'Sesión de diagnóstico o formación', 'Consultoría digital', 'Hora', 1, 0, 0, 0, 0, .05, .35, 0]
  ];
  const FIELDS = ['name', 'client', 'category', 'unit', 'hours', 'tool', 'sub', 'ads', 'other', 'indirectPct', 'margin', 'commissionPct'];
  return SERVICES_SEED.map(row => {
    const obj = { id: uid('srv'), active: true, notes: '' };
    FIELDS.forEach((key, i) => obj[key] = row[i]);
    return obj;
  });
}

function buildDefaultFixed() {
  return [
    ['Autónomo tarifa plana', 'Fiscal/laboral', 'Seguridad Social', 86],
    ['Gestoría', 'Fiscal/laboral', '', 10],
    ['Hosting principal', 'Infraestructura', 'IONOS / similar', 11],
    ['Dominio principal', 'Infraestructura', 'rcpdigital.es', 12],
    ['Email profesional', 'Infraestructura', 'Google/Microsoft/IONOS', 0],
    ['IA / productividad', 'Herramientas', 'ChatGPT / similar', 20],
    ['Materiales', 'Herramientas', '', 3]
  ].map(([concept, group, provider, monthly]) => ({ id: uid('fix'), concept, group, provider, monthly, active: true, notes: '' }));
}

function seedIfEmpty() {
  if (!db.prepare('SELECT 1 FROM meta WHERE id = 1').get()) {
    db.prepare('INSERT INTO meta (id, session_secret, created_at) VALUES (1, ?, ?)')
      .run(crypto.randomBytes(32).toString('hex'), new Date().toISOString());
  }
  if (!db.prepare('SELECT 1 FROM config WHERE id = 1').get()) {
    const defaultOnboarding = JSON.stringify(['Pedir accesos al cliente', 'Reunión de kickoff', 'Confirmar plazos y entregables']);
    db.prepare(`INSERT INTO config (id, company_name, ai_monthly_spend_alert_eur, onboarding_tasks) VALUES (1, 'RCP Digital', 15, ?)`).run(defaultOnboarding);
  }
  if (db.prepare('SELECT COUNT(*) n FROM pipeline_stages').get().n === 0) {
    PIPELINE_STAGES_DEFAULT.forEach(s => {
      db.prepare('INSERT INTO pipeline_stages (key, label, color, sort_order, probability) VALUES (?, ?, ?, ?, ?)').run(s.key, s.label, s.color, s.order, s.probability);
    });
  }
  if (db.prepare('SELECT COUNT(*) n FROM services').get().n === 0) {
    buildDefaultServices().forEach(s => {
      db.prepare(`INSERT INTO services (id, name, client, category, unit, hours, tool, sub, ads, other, indirect_pct, margin, commission_pct, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '')`).run(
        s.id, s.name, s.client, s.category, s.unit, s.hours, s.tool, s.sub, s.ads, s.other, s.indirectPct, s.margin, s.commissionPct
      );
    });
  }
  if (db.prepare('SELECT COUNT(*) n FROM fixed_costs').get().n === 0) {
    buildDefaultFixed().forEach(f => {
      db.prepare('INSERT INTO fixed_costs (id, concept, grp, provider, monthly, active, notes) VALUES (?, ?, ?, ?, ?, 1, ?)')
        .run(f.id, f.concept, f.group, f.provider, f.monthly, f.notes);
    });
  }
  if (db.prepare('SELECT COUNT(*) n FROM kanban_columns').get().n === 0) {
    KANBAN_COLUMNS_DEFAULT.forEach(c => {
      db.prepare('INSERT INTO kanban_columns (key, label, color, sort_order) VALUES (?, ?, ?, ?)').run(c.key, c.label, c.color, c.order);
    });
  }
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
  maybeAutoMigrateFromJson();
  const existedBefore = fs.existsSync(DB_FILE);
  // La copia de seguridad diaria se hace ANTES de tocar nada (si ya existía el fichero).
  if (existedBefore) maybeBackup();
  db = openDb(DB_FILE);
  seedIfEmpty(); // rellena piezas por defecto que falten (instalación nueva o parcial)
  data = loadFromSql();
  return data;
}

function persist() {
  saveToSql();
}

function dbFn() {
  if (!data) load();
  return data;
}

// Sustituye TODOS los datos en memoria y los persiste. La usa "Restaurar copia de
// seguridad" (sube un JSON plano exportado antes).
function replaceAll(newData) {
  data = newData;
  persist();
  return data;
}

// Registra una entrada en el timeline de actividad de un cliente (Fase 12.2).
// No llama a persist() por sí misma: quien la invoca ya lo hace justo después
// de modificar lo que corresponda (mismo patrón que el resto de este fichero).
function logActivity(d, clientId, type, description) {
  if (!clientId) return;
  d.clientActivity = d.clientActivity || [];
  d.clientActivity.unshift({ id: uid('act'), clientId, type, description, createdAt: new Date().toISOString() });
}

module.exports = {
  db: dbFn, load, persist, replaceAll, uid, logActivity,
  PIPELINE_STAGES_DEFAULT, KANBAN_COLUMNS_DEFAULT, THUMBS_DIR, listBackups, BACKUP_DIR
};
