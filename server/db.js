// Conexión y esquema de la base de datos SQLite local (sustituye a data.json).
// El cifrado fuerte sigue aplicándose solo a las copias de seguridad diarias
// (igual que con el JSON anterior); el fichero .sqlite en uso lo protegen los
// permisos normales del sistema de ficheros, como cualquier programa de escritorio.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.RCP_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'data.sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  session_secret TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_counters (
  year TEXT PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'RCP Digital',
  productive_hours REAL NOT NULL DEFAULT 132,
  salary_target REAL NOT NULL DEFAULT 1300,
  buffer REAL NOT NULL DEFAULT 0,
  margin REAL NOT NULL DEFAULT 0.35,
  amortization_pct REAL NOT NULL DEFAULT 0.05,
  iva REAL NOT NULL DEFAULT 0.21,
  irpf REAL NOT NULL DEFAULT 0.15,
  rounding REAL NOT NULL DEFAULT 5,
  default_indirect_pct REAL NOT NULL DEFAULT 0.10,
  business_tax_id TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  business_email TEXT NOT NULL DEFAULT '',
  business_phone TEXT NOT NULL DEFAULT '',
  -- Umbral de aviso de gasto mensual del chat IA (euros). Solo informativo: no bloquea el chat.
  ai_monthly_spend_alert_eur REAL NOT NULL DEFAULT 15,
  -- Plantilla única de tareas de onboarding (Fase 12.5), JSON array de títulos;
  -- se copian al Kanban en cuanto un presupuesto pasa a "aceptado".
  onboarding_tasks TEXT NOT NULL DEFAULT '[]',
  -- Logo de empresa para el PDF de factura (backlog #19), como data URI base64;
  -- cadena vacía = sin logo, se sigue mostrando solo el nombre como hasta ahora.
  company_logo TEXT NOT NULL DEFAULT '',
  -- Plazo de pago en días desde la emisión, usado por el aviso "Vencida" de
  -- Facturas (backlog #20); antes se comparaba inv.date tal cual contra hoy.
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  -- Validez del presupuesto en días desde que se envía, para el aviso de
  -- "Caducado" en presupuestos "enviado" (backlog #21).
  quote_validity_days INTEGER NOT NULL DEFAULT 15,
  -- Prefijo de serie de factura, antepuesto al número "AAAA-NNNN" ya existente
  -- (backlog #22); vacío = igual que siempre, sin prefijo.
  invoice_prefix TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Probabilidad de cierre de esta etapa (0-100), para el forecast ponderado (Fase 12.1).
  probability INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  pin_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT,
  role TEXT NOT NULL DEFAULT 'colaborador',
  -- Fichaje en curso (cronómetro), antes guardado como objeto suelto en el usuario; JSON o NULL.
  active_clock_in TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixed_costs (
  id TEXT PRIMARY KEY,
  concept TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  monthly REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'Proyecto',
  hours REAL NOT NULL DEFAULT 0,
  tool REAL NOT NULL DEFAULT 0,
  sub REAL NOT NULL DEFAULT 0,
  ads REAL NOT NULL DEFAULT 0,
  other REAL NOT NULL DEFAULT 0,
  indirect_pct REAL NOT NULL DEFAULT 0,
  margin REAL NOT NULL DEFAULT 0.35,
  commission_pct REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  billing_address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  -- Solo las etapas PRE-presupuesto se guardan aquí (nuevo_lead, contactado); el
  -- resto del pipeline se deriva en el servidor a partir de los presupuestos/proyectos.
  pipeline_stage TEXT NOT NULL DEFAULT 'nuevo_lead',
  pipeline_value REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT '',
  next_action_date TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL DEFAULT '',
  -- Fecha de renovación de dominio/hosting de este cliente (backlog #29), si la
  -- agencia se encarga de gestionarlo; vacío = no aplica. Mismo patrón de aviso
  -- que la renovación de contrato (contracted.end_date, Fase 12.3).
  domain_renewal_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Presupuesto con varias líneas. status: borrador -> enviado -> aceptado|rechazado
-- -> en_curso -> facturado -> cobrado -> cerrado (AC5). legacy_status conserva el
-- valor original del JSON antiguo tal cual, por si la correspondencia automática
-- necesita revisión manual.
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'borrador',
  legacy_status TEXT,
  charged TEXT NOT NULL DEFAULT 'No',
  commission_pct REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  paused INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  accepted_at TEXT,
  invoice_id TEXT
);

-- Línea de presupuesto: o bien serviceId real del catálogo (is_manual = 0, precio
-- siempre recalculado en servidor con calcService), o bien manual (is_manual = 1,
-- service_id NULL, la escribe el usuario, nunca la IA). Snapshot congelado al enviar.
CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  service_id TEXT,
  is_manual INTEGER NOT NULL DEFAULT 0,
  concept_snapshot TEXT NOT NULL DEFAULT '',
  unit_price_snapshot REAL NOT NULL DEFAULT 0,
  unit_cost_snapshot REAL NOT NULL DEFAULT 0,
  qty REAL NOT NULL DEFAULT 1,
  discount_pct REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id);

CREATE TABLE IF NOT EXISTS contracted (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  periodicity TEXT NOT NULL DEFAULT 'Mensual',
  price REAL NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Activo',
  notes TEXT NOT NULL DEFAULT '',
  dismissed_periods TEXT NOT NULL DEFAULT '[]',
  -- Flag manual de "pausado" sobre el proyecto en curso (ya no es una etapa del cliente).
  paused INTEGER NOT NULL DEFAULT 0,
  resource_id TEXT,
  -- Cuota de horas mensual de este contrato (Fase 11.2); 0 = sin límite. Se compara
  -- contra time_entries del mes para avisar al superar el 80%, sin bloquear nada.
  monthly_hours_quota REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contracted_client ON contracted(client_id);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_tax_id TEXT NOT NULL DEFAULT '',
  client_address TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL UNIQUE,
  date TEXT NOT NULL,
  concept TEXT NOT NULL DEFAULT '',
  base_amount REAL NOT NULL DEFAULT 0,
  iva_pct REAL NOT NULL DEFAULT 0.21,
  iva_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Emitida',
  notes TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT NOT NULL DEFAULT '',
  contracted_id TEXT,
  period TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contracted_period ON invoices(contracted_id, period);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  concept TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  contracted_id TEXT NOT NULL DEFAULT '',
  budget_id TEXT NOT NULL DEFAULT '',
  client_id TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  hours REAL NOT NULL DEFAULT 0,
  billable INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  clocked_in_at TEXT,
  clocked_out_at TEXT
);

-- Historial del chat IA de presupuestos (una fila por mensaje). Sirve también
-- para estimar el gasto mensual de la API (AI_MONTHLY_SPEND_ALERT_EUR).
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_budget ON ai_conversations(budget_id);

-- routes/charges.js y routes/resources.js ya no tienen funcionalidad nueva (plan
-- Fase 0): se conserva su histórico tal cual, como JSON, sin normalizar.
CREATE TABLE IF NOT EXISTS legacy_charges (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_resources (id TEXT PRIMARY KEY, data TEXT NOT NULL);

-- Kanban de proyectos (cada tarjeta = un presupuesto aceptado/en curso) y sus
-- tareas internas, asignables a un usuario. Columnas configurables por el usuario.
CREATE TABLE IF NOT EXISTS kanban_columns (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kanban_tasks (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kanban_tasks_budget ON kanban_tasks(budget_id);

-- Timeline de actividad por cliente (Fase 12.2): una fila por cambio de etapa,
-- presupuesto o factura relevante, registrada automáticamente desde el propio
-- punto donde ya se actualiza budgets.status/clients.pipelineStage.
CREATE TABLE IF NOT EXISTS client_activity_log (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_activity_client ON client_activity_log(client_id, created_at);

-- Plantillas de presupuesto reutilizables (Fase 12.4): solo líneas serviceId+qty,
-- nunca precio fijo — al insertarse se recalculan siempre con calcService, igual
-- que cualquier línea nueva de un presupuesto.
CREATE TABLE IF NOT EXISTS budget_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  lines TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

-- Bandeja de correo por cliente (Fase 8): un correo entrante o saliente, vinculado
-- al cliente por coincidencia exacta de email (matching determinista, sin IA).
-- message_id es el Message-ID real del correo (dedupe al sincronizar IMAP).
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  direction TEXT NOT NULL DEFAULT 'in',
  from_address TEXT NOT NULL DEFAULT '',
  to_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  in_reply_to TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emails_client ON emails(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

-- Borrador de respuesta generado por la IA para un correo (Fase 8): solo texto
-- propuesto, nunca se envía solo — el usuario lo revisa/edita y confirma el envío
-- aparte (POST /api/emails/:id/send). Mismo patrón que ai_conversations.
CREATE TABLE IF NOT EXISTS email_drafts (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_drafts_email ON email_drafts(email_id);
`;

// Migraciones aditivas sobre una base ya existente (SQLite no tiene "ADD COLUMN
// IF NOT EXISTS"): cada ALTER se intenta y se ignora si la columna ya existe.
const ADDITIVE_MIGRATIONS = [
  "ALTER TABLE clients ADD COLUMN website_url TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE budgets ADD COLUMN kanban_column TEXT",
  // Secciones del menú visibles para este usuario (JSON array); NULL = ve todo
  // (compatibilidad con usuarios ya existentes, que no tenían este permiso).
  "ALTER TABLE users ADD COLUMN visible_sections TEXT",
  "ALTER TABLE contracted ADD COLUMN monthly_hours_quota REAL NOT NULL DEFAULT 0",
  "ALTER TABLE pipeline_stages ADD COLUMN probability INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE config ADD COLUMN onboarding_tasks TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE config ADD COLUMN company_logo TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE config ADD COLUMN payment_terms_days INTEGER NOT NULL DEFAULT 30",
  "ALTER TABLE config ADD COLUMN quote_validity_days INTEGER NOT NULL DEFAULT 15",
  "ALTER TABLE config ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE clients ADD COLUMN domain_renewal_date TEXT NOT NULL DEFAULT ''"
];

function runAdditiveMigrations(database) {
  ADDITIVE_MIGRATIONS.forEach(sql => {
    try { database.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  });
}

function openDb(dbFile = DB_FILE) {
  const dir = path.dirname(dbFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const database = new Database(dbFile);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
  runAdditiveMigrations(database);
  return database;
}

module.exports = { openDb, DATA_DIR, DB_FILE, SCHEMA };
