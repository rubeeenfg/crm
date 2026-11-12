#!/usr/bin/env node
// Migra data/data.json (cifrado o plano) a data/data.sqlite, sin tocar ni borrar
// el JSON original. Operación idempotente: si data.sqlite ya existe y tiene datos,
// no hace nada (a menos que se pase --force, que la reconstruye desde cero).
//
// Uso: node scripts/migrate-json-to-sqlite.js [--force] [--data-dir=<ruta>]
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const dataDirArg = args.find(a => a.startsWith('--data-dir='));
const DATA_DIR = dataDirArg ? dataDirArg.slice('--data-dir='.length) : (process.env.RCP_DATA_DIR || path.join(__dirname, '..', 'data'));

const JSON_FILE = path.join(DATA_DIR, 'data.json');
const KEY_FILE = path.join(DATA_DIR, '.enc.key');

function decryptFromDisk(envelope, keyFile) {
  const key = Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const pt = Buffer.concat([decipher.update(Buffer.from(envelope.ct, 'base64')), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

function loadSourceData() {
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`No se encuentra ${JSON_FILE}. Nada que migrar.`);
  }
  const onDisk = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  if (onDisk && onDisk.v === 1 && onDisk.ct) {
    if (!fs.existsSync(KEY_FILE)) throw new Error(`data.json está cifrado pero falta la clave ${KEY_FILE}.`);
    return decryptFromDisk(onDisk, KEY_FILE);
  }
  return onDisk; // formato antiguo sin cifrar
}

const num = v => Number(v) || 0;
const bool01 = v => (v ? 1 : 0);
const nowIso = () => new Date().toISOString();

// Correspondencia de estados antiguos de presupuesto -> flujo unificado nuevo
// (plan Fase 1.3). Lo que no se reconozca cae en "borrador" y se conserva el
// valor original en legacy_status para revisión manual.
const BUDGET_STATUS_MAP = {
  'Borrador': 'borrador',
  'Pendiente': 'enviado',
  'Aceptado': 'aceptado',
  'Rechazado': 'rechazado',
  'En proceso': 'en_curso',
  'Entregado': 'en_curso',
  'Facturado': 'facturado',
  'Cobrado': 'cobrado'
};
function mapBudgetStatus(oldStatus) {
  return BUDGET_STATUS_MAP[oldStatus] || 'borrador';
}

function migrate() {
  const { openDb } = require('../server/db');
  const src = loadSourceData();
  const dbFile = path.join(DATA_DIR, 'data.sqlite');

  if (fs.existsSync(dbFile) && !FORCE) {
    const BetterSqlite3 = require('better-sqlite3');
    const existing = new BetterSqlite3(dbFile, { readonly: true });
    const row = existing.prepare('SELECT COUNT(*) AS n FROM clients').get();
    existing.close();
    if (row.n > 0) {
      console.log(`${dbFile} ya existe con datos (clients=${row.n}). No se repite la migración (usa --force para rehacerla).`);
      return;
    }
  }
  if (FORCE && fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const db = openDb(dbFile);
  const insertMany = (label, rows, fn) => {
    const tx = db.transaction(items => { items.forEach(fn); });
    tx(rows || []);
    console.log(`  ${label}: ${(rows || []).length}`);
  };

  db.transaction(() => {
    // meta + invoice_counters
    const meta = src.meta || {};
    db.prepare('INSERT OR REPLACE INTO meta (id, session_secret, created_at) VALUES (1, ?, ?)')
      .run(meta.sessionSecret || crypto.randomBytes(32).toString('hex'), meta.createdAt || nowIso());
    Object.entries(meta.invoiceCounters || {}).forEach(([year, counter]) => {
      db.prepare('INSERT OR REPLACE INTO invoice_counters (year, counter) VALUES (?, ?)').run(year, num(counter));
    });

    // config
    const c = src.config || {};
    db.prepare(`INSERT OR REPLACE INTO config
      (id, company_name, productive_hours, salary_target, buffer, margin, amortization_pct, iva, irpf, rounding,
       default_indirect_pct, business_tax_id, business_address, business_email, business_phone, ai_monthly_spend_alert_eur)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      c.companyName || 'RCP Digital', num(c.productiveHours) || 132, num(c.salaryTarget) || 1300, num(c.buffer),
      num(c.margin) || 0.35, num(c.amortizationPct) || 0.05, num(c.iva) || 0.21, num(c.irpf) || 0.15, num(c.rounding) || 5,
      num(c.defaultIndirectPct) || 0.10, c.businessTaxId || '', c.businessAddress || '', c.businessEmail || '', c.businessPhone || '',
      num(process.env.AI_MONTHLY_SPEND_ALERT_EUR) || 15
    );

    // pipeline stages
    insertMany('pipelineStages', src.pipelineStages, (s, i) => {
      db.prepare('INSERT OR REPLACE INTO pipeline_stages (key, label, color, sort_order) VALUES (?, ?, ?, ?)')
        .run(s.key, s.label, s.color || '#64748b', s.order != null ? s.order : i);
    });

    // users
    insertMany('users', src.users, u => {
      db.prepare(`INSERT OR REPLACE INTO users
        (id, name, email, password_hash, pin_hash, pin_attempts, pin_locked_until, role, active_clock_in, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        u.id, u.name || '', u.email || '', u.passwordHash || '', u.pinHash || null, num(u.pinAttempts),
        u.pinLockedUntil || null, u.role || 'colaborador', u.activeClockIn ? JSON.stringify(u.activeClockIn) : null,
        u.createdAt || nowIso()
      );
    });

    // fixed costs
    insertMany('fixed', src.fixed, f => {
      db.prepare(`INSERT OR REPLACE INTO fixed_costs (id, concept, grp, provider, monthly, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(f.id, f.concept || '', f.group || '', f.provider || '', num(f.monthly), bool01(f.active !== false), f.notes || '');
    });

    // services
    insertMany('services', src.services, s => {
      db.prepare(`INSERT OR REPLACE INTO services
        (id, name, client, category, unit, hours, tool, sub, ads, other, indirect_pct, margin, commission_pct, active, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        s.id, s.name || '', s.client || '', s.category || '', s.unit || 'Proyecto', num(s.hours), num(s.tool), num(s.sub),
        num(s.ads), num(s.other), num(s.indirectPct), num(s.margin) || 0.35, num(s.commissionPct), bool01(s.active !== false), s.notes || ''
      );
    });

    // clients
    insertMany('clients', src.clients, cl => {
      db.prepare(`INSERT OR REPLACE INTO clients
        (id, name, contact_name, email, phone, tax_id, billing_address, notes, pipeline_stage, pipeline_value, source, next_action_date, owner_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        cl.id, cl.name || '', cl.contactName || '', cl.email || '', cl.phone || '', cl.taxId || '', cl.billingAddress || '',
        cl.notes || '', cl.pipelineStage || 'nuevo_lead', num(cl.pipelineValue), cl.source || '', cl.nextActionDate || '',
        cl.ownerId || '', cl.createdAt || nowIso(), cl.updatedAt || cl.createdAt || nowIso()
      );
    });

    // budgets (legacy: 1 presupuesto antiguo -> 1 budget + 1 budget_line manual)
    insertMany('budgets', src.budgets, b => {
      db.prepare(`INSERT OR REPLACE INTO budgets
        (id, client_id, date, status, legacy_status, charged, commission_pct, notes, paused, created_at, sent_at, accepted_at, invoice_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL)`).run(
        b.id, b.clientId || '', b.date || '', mapBudgetStatus(b.status), b.status || null, b.charged || 'No',
        num(b.commissionPct), b.notes || '', b.date || nowIso()
      );
      db.prepare(`INSERT OR REPLACE INTO budget_lines
        (id, budget_id, service_id, is_manual, concept_snapshot, unit_price_snapshot, unit_cost_snapshot, qty, discount_pct, sort_order)
        VALUES (?, ?, NULL, 1, ?, ?, ?, 1, 0, 0)`).run(`${b.id}_line1`, b.id, b.service || b.category || 'Servicio migrado', num(b.price), num(b.cost));
    });

    // contracted
    insertMany('contracted', src.contracted, cs => {
      db.prepare(`INSERT OR REPLACE INTO contracted
        (id, client_id, name, periodicity, price, start_date, end_date, status, notes, dismissed_periods, paused, resource_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(
        cs.id, cs.clientId || '', cs.name || '', cs.periodicity || 'Mensual', num(cs.price), cs.startDate || '',
        cs.endDate || '', cs.status || 'Activo', cs.notes || '', JSON.stringify(cs.dismissedPeriods || []), cs.resourceId || null
      );
    });

    // invoices + líneas + pagos
    let lineCount = 0, paymentCount = 0;
    (src.invoices || []).forEach(inv => {
      db.prepare(`INSERT OR REPLACE INTO invoices
        (id, client_id, client_name, client_tax_id, client_address, number, date, concept, base_amount, iva_pct, iva_amount, total,
         status, notes, source_type, source_id, contracted_id, period, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        inv.id, inv.clientId || '', inv.clientName || '', inv.clientTaxId || '', inv.clientAddress || '', inv.number || '',
        inv.date || '', inv.concept || '', num(inv.baseAmount), num(inv.ivaPct) || 0.21, num(inv.ivaAmount), num(inv.total),
        inv.status || 'Emitida', inv.notes || '', inv.sourceType || 'manual', inv.sourceId || '', inv.contractedId || null,
        inv.period || null, inv.createdAt || nowIso()
      );
      (inv.lines || []).forEach((l, i) => {
        db.prepare(`INSERT OR REPLACE INTO invoice_lines (id, invoice_id, concept, qty, unit_price, amount, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(`${inv.id}_line${i + 1}`, inv.id, l.concept || '', num(l.qty) || 1, num(l.unitPrice), num(l.amount), i);
        lineCount++;
      });
      (inv.payments || []).forEach(p => {
        db.prepare(`INSERT OR REPLACE INTO payments (id, invoice_id, date, amount, method, notes) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(p.id, inv.id, p.date || '', num(p.amount), p.method || '', p.notes || '');
        paymentCount++;
      });
    });
    console.log(`  invoices: ${(src.invoices || []).length} (invoice_lines: ${lineCount}, payments: ${paymentCount})`);

    // time entries
    insertMany('timeEntries', src.timeEntries, t => {
      db.prepare(`INSERT OR REPLACE INTO time_entries
        (id, date, contracted_id, budget_id, client_id, client, service, hours, billable, notes, clocked_in_at, clocked_out_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        t.id, t.date || '', t.contractedId || '', t.budgetId || '', t.clientId || '', t.client || '', t.service || '',
        num(t.hours), bool01(t.billable !== false), t.notes || '', t.clockedInAt || null, t.clockedOutAt || null
      );
    });

    // histórico sin normalizar (ya no tienen funcionalidad nueva, plan Fase 0)
    insertMany('charges (legacy)', src.charges, ch => {
      db.prepare('INSERT OR REPLACE INTO legacy_charges (id, data) VALUES (?, ?)').run(ch.id, JSON.stringify(ch));
    });
    insertMany('resources (legacy)', src.resources, r => {
      db.prepare('INSERT OR REPLACE INTO legacy_resources (id, data) VALUES (?, ?)').run(r.id, JSON.stringify(r));
    });
  })();

  db.close();
  console.log(`\nMigración completa -> ${dbFile}`);
}

if (require.main === module) {
  try {
    migrate();
  } catch (e) {
    console.error('Error en la migración:', e.message);
    process.exit(1);
  }
}

module.exports = { migrate, loadSourceData, mapBudgetStatus };
