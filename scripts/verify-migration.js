#!/usr/bin/env node
// Compara data/data.json (origen) contra data/data.sqlite (migrado) y falla si hay
// cualquier discrepancia: mismos conteos por colección y mismas sumas de importes
// de facturas y pagos (AC1 del plan). No modifica ningún fichero.
//
// Uso: node scripts/verify-migration.js [--data-dir=<ruta>]
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dataDirArg = args.find(a => a.startsWith('--data-dir='));
const DATA_DIR = dataDirArg ? dataDirArg.slice('--data-dir='.length) : (process.env.RCP_DATA_DIR || path.join(__dirname, '..', 'data'));

const { loadSourceData } = require('./migrate-json-to-sqlite');
const BetterSqlite3 = require('better-sqlite3');

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

function verify() {
  process.env.RCP_DATA_DIR = DATA_DIR; // por si loadSourceData se reimporta en otro contexto
  const data = loadSourceData();

  const dbFile = path.join(DATA_DIR, 'data.sqlite');
  if (!fs.existsSync(dbFile)) throw new Error(`No existe ${dbFile}. Ejecuta antes scripts/migrate-json-to-sqlite.js.`);
  const db = new BetterSqlite3(dbFile, { readonly: true });

  const discrepancies = [];
  const check = (label, expected, actual) => {
    if (expected !== actual) discrepancies.push(`${label}: esperado ${expected}, encontrado ${actual}`);
  };
  const checkClose = (label, expected, actual, tol = 0.01) => {
    if (Math.abs(round2(expected) - round2(actual)) > tol) discrepancies.push(`${label}: esperado ${round2(expected)}, encontrado ${round2(actual)}`);
  };

  // --- Conteos por colección ---
  check('clients.count', (data.clients || []).length, db.prepare('SELECT COUNT(*) n FROM clients').get().n);
  check('services.count', (data.services || []).length, db.prepare('SELECT COUNT(*) n FROM services').get().n);
  check('fixed.count', (data.fixed || []).length, db.prepare('SELECT COUNT(*) n FROM fixed_costs').get().n);
  check('users.count', (data.users || []).length, db.prepare('SELECT COUNT(*) n FROM users').get().n);
  check('pipelineStages.count', (data.pipelineStages || []).length, db.prepare('SELECT COUNT(*) n FROM pipeline_stages').get().n);
  check('budgets.count', (data.budgets || []).length, db.prepare('SELECT COUNT(*) n FROM budgets').get().n);
  check('contracted.count', (data.contracted || []).length, db.prepare('SELECT COUNT(*) n FROM contracted').get().n);
  check('invoices.count', (data.invoices || []).length, db.prepare('SELECT COUNT(*) n FROM invoices').get().n);
  check('timeEntries.count', (data.timeEntries || []).length, db.prepare('SELECT COUNT(*) n FROM time_entries').get().n);
  check('charges.count (legacy)', (data.charges || []).length, db.prepare('SELECT COUNT(*) n FROM legacy_charges').get().n);
  check('resources.count (legacy)', (data.resources || []).length, db.prepare('SELECT COUNT(*) n FROM legacy_resources').get().n);

  // --- Presupuestos: price/cost originales deben cuadrar con su línea migrada ---
  const sumBudgetPrice = (data.budgets || []).reduce((a, b) => a + (Number(b.price) || 0), 0);
  const sumBudgetCost = (data.budgets || []).reduce((a, b) => a + (Number(b.cost) || 0), 0);
  const sqlBudgetLines = db.prepare('SELECT SUM(unit_price_snapshot * qty) p, SUM(unit_cost_snapshot * qty) c FROM budget_lines').get();
  checkClose('budgets.sum(price)', sumBudgetPrice, sqlBudgetLines.p || 0);
  checkClose('budgets.sum(cost)', sumBudgetCost, sqlBudgetLines.c || 0);

  // --- Facturas: misma suma de total, misma lista de números, sin duplicados ---
  const sumInvoiceTotal = (data.invoices || []).reduce((a, i) => a + (Number(i.total) || 0), 0);
  const sqlInvoiceTotal = db.prepare('SELECT SUM(total) t FROM invoices').get().t || 0;
  checkClose('invoices.sum(total)', sumInvoiceTotal, sqlInvoiceTotal);

  const jsonNumbers = (data.invoices || []).map(i => i.number).filter(Boolean).sort();
  const sqlNumbers = db.prepare('SELECT number FROM invoices ORDER BY number').all().map(r => r.number);
  if (JSON.stringify(jsonNumbers) !== JSON.stringify(sqlNumbers)) {
    discrepancies.push(`invoices.numbers: no coinciden las listas de números (json=${jsonNumbers.length}, sqlite=${sqlNumbers.length})`);
  }
  if (new Set(sqlNumbers).size !== sqlNumbers.length) discrepancies.push('invoices.numbers: hay números de factura duplicados en SQLite');

  // --- Pagos: misma suma de importes cobrados ---
  const sumPayments = (data.invoices || []).reduce((a, i) => a + (i.payments || []).reduce((a2, p) => a2 + (Number(p.amount) || 0), 0), 0);
  const sqlPayments = db.prepare('SELECT SUM(amount) a FROM payments').get().a || 0;
  checkClose('payments.sum(amount)', sumPayments, sqlPayments);

  db.close();

  if (discrepancies.length) {
    console.error(`\n${discrepancies.length} discrepancia(s) encontradas:`);
    discrepancies.forEach(d => console.error(`  - ${d}`));
    process.exitCode = 1;
  } else {
    console.log('0 discrepancias. La migración a SQLite cuadra con data.json.');
  }
  return discrepancies;
}

if (require.main === module) {
  try {
    verify();
  } catch (e) {
    console.error('Error al verificar la migración:', e.message);
    process.exit(1);
  }
}

module.exports = { verify };
