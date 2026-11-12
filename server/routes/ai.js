// Chat IA de presupuestos (plan Fase 2.4): Claude solo puede tocar el presupuesto
// a través de herramientas (tool-calling) — ninguna cifra sale nunca de su texto
// libre. Cada herramienta se ejecuta aquí contra el catálogo real y pasa siempre
// por sanitizeLines (misma validación que usa el CRUD normal de presupuestos:
// servicio real, precio recalculado con calcService, descuento tope 15%, AC3).
const express = require('express');
const path = require('path');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');
const { calcService, calcBudget } = require('../calc');
const { sanitizeLines, MAX_DISCOUNT } = require('./budgets');
const { openDb, DATA_DIR } = require('../db');

const router = express.Router();
router.use(requireAuth);

const MODEL = 'claude-sonnet-5-5';
// Precio aproximado de Sonnet 5.5 por millón de tokens (USD) y cambio a EUR, solo
// para el aviso de gasto mensual (no es una factura real, es una estimación).
const PRICE_IN_PER_MTOK_USD = 3;
const PRICE_OUT_PER_MTOK_USD = 15;
const USD_TO_EUR = 0.92;

let aiDb = null;
function getAiDb() {
  if (!aiDb) aiDb = openDb(path.join(DATA_DIR, 'data.sqlite'));
  return aiDb;
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function buildSystemPrompt(data) {
  const catalog = data.services.filter(s => s.active).map(s => {
    const c = calcService(s, data.config, data.fixed);
    return `- id=${s.id} | ${s.name} (${s.category}, por ${s.unit}) -> precio recomendado ${c.rec}€`;
  }).join('\n');
  return [
    'Eres el asistente de presupuestos de RCP Digital. Ayudas a construir presupuestos para clientes usando ÚNICAMENTE el catálogo real de servicios de abajo.',
    '',
    'Reglas estrictas, sin excepción:',
    '- NUNCA inventes precios ni servicios. Todo precio sale siempre del catálogo de abajo o de las herramientas que lo consultan; nunca escribas un precio decidido por ti en el texto.',
    '- Para añadir, quitar, cambiar cantidad o aplicar descuento a una línea, usa SIEMPRE las herramientas disponibles. No describas cambios en el presupuesto solo con texto.',
    `- El descuento máximo por línea es del ${Math.round(MAX_DISCOUNT * 100)}%. Si el cliente pide más, explica que no es posible y ofrece el máximo.`,
    '- Si piden un servicio que no existe en el catálogo, dilo con claridad y sugiere el más parecido; nunca te inventes uno nuevo ni le pongas precio tú.',
    '- Responde siempre en español, de forma breve y clara, como un compañero que ayuda a armar el presupuesto.',
    '',
    'Catálogo de servicios activos:',
    catalog || '(sin servicios activos en el catálogo)'
  ].join('\n');
}

const TOOLS = [
  {
    name: 'buscar_servicios',
    description: 'Busca servicios reales del catálogo por texto y/o categoría. Úsala siempre antes de añadir una línea si no tienes ya el id exacto del servicio.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string' }, categoria: { type: 'string' } } }
  },
  {
    name: 'ver_presupuesto',
    description: 'Devuelve las líneas actuales del presupuesto y sus totales.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'anadir_linea',
    description: 'Añade una línea al presupuesto con un servicio real del catálogo (nunca un precio libre).',
    input_schema: { type: 'object', properties: { serviceId: { type: 'string' }, qty: { type: 'number' } }, required: ['serviceId'] }
  },
  {
    name: 'quitar_linea',
    description: 'Elimina una línea del presupuesto por su id.',
    input_schema: { type: 'object', properties: { lineId: { type: 'string' } }, required: ['lineId'] }
  },
  {
    name: 'ajustar_cantidad',
    description: 'Cambia la cantidad de una línea ya existente.',
    input_schema: { type: 'object', properties: { lineId: { type: 'string' }, qty: { type: 'number' } }, required: ['lineId', 'qty'] }
  },
  {
    name: 'aplicar_descuento',
    description: `Aplica un descuento a una línea existente (máximo ${Math.round(MAX_DISCOUNT * 100)}%, como fracción: 0.1 = 10%).`,
    input_schema: { type: 'object', properties: { lineId: { type: 'string' }, discountPct: { type: 'number' } }, required: ['lineId', 'discountPct'] }
  }
];

// Ejecuta una herramienta contra el estado actual de líneas. Devuelve las líneas
// resultantes (ya validadas) y el resultado a mandarle al modelo. Si algo no es
// válido, las líneas no cambian y el error se le explica al modelo como texto,
// nunca se aplica un valor sin validar.
function executeTool(name, input, data, currentLines) {
  const svcPublic = s => { const c = calcService(s, data.config, data.fixed); return { id: s.id, nombre: s.name, categoria: s.category, unidad: s.unit, precio: c.rec }; };

  if (name === 'buscar_servicios') {
    const q = String((input && input.consulta) || '').toLowerCase();
    const cat = input && input.categoria;
    const resultados = data.services.filter(s => s.active && (!cat || s.category === cat) &&
      (!q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q))).slice(0, 15).map(svcPublic);
    return { lines: currentLines, result: { servicios: resultados } };
  }
  if (name === 'ver_presupuesto') {
    const calc = calcBudget({ lines: currentLines, commissionPct: 0 }, data.config);
    return { lines: currentLines, result: { lineas: currentLines, total: calc.price, totalConIva: calc.priceIva } };
  }
  if (name === 'anadir_linea') {
    const svc = data.services.find(s => s.id === (input && input.serviceId) && s.active);
    if (!svc) return { lines: currentLines, result: { error: `No existe ese servicio activo en el catálogo: ${input && input.serviceId}. Usa buscar_servicios primero.` } };
    const r = sanitizeLines([...currentLines, { serviceId: svc.id, qty: (input && input.qty) || 1 }], data);
    if (r.error) return { lines: currentLines, result: { error: r.error } };
    return { lines: r.lines, result: { ok: true, lineas: r.lines } };
  }
  if (name === 'quitar_linea') {
    const next = currentLines.filter(l => l.id !== (input && input.lineId));
    if (next.length === currentLines.length) return { lines: currentLines, result: { error: 'No existe ninguna línea con ese id.' } };
    return { lines: next, result: { ok: true, lineas: next } };
  }
  if (name === 'ajustar_cantidad') {
    if (!currentLines.some(l => l.id === (input && input.lineId))) return { lines: currentLines, result: { error: 'No existe ninguna línea con ese id.' } };
    const r = sanitizeLines(currentLines.map(l => l.id === input.lineId ? { ...l, qty: input.qty } : l), data);
    if (r.error) return { lines: currentLines, result: { error: r.error } };
    return { lines: r.lines, result: { ok: true, lineas: r.lines } };
  }
  if (name === 'aplicar_descuento') {
    if (!currentLines.some(l => l.id === (input && input.lineId))) return { lines: currentLines, result: { error: 'No existe ninguna línea con ese id.' } };
    if (Number(input.discountPct) > MAX_DISCOUNT) return { lines: currentLines, result: { error: `El descuento máximo por línea es del ${Math.round(MAX_DISCOUNT * 100)}%.` } };
    const r = sanitizeLines(currentLines.map(l => l.id === input.lineId ? { ...l, discountPct: input.discountPct } : l), data);
    if (r.error) return { lines: currentLines, result: { error: r.error } };
    return { lines: r.lines, result: { ok: true, lineas: r.lines } };
  }
  return { lines: currentLines, result: { error: 'Herramienta desconocida.' } };
}

router.get('/status', (req, res) => {
  res.json({ available: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
});

router.post('/budget-chat', async (req, res) => {
  const client = getClient();
  if (!client) return res.status(503).json({ error: 'El chat IA no está disponible: falta configurar ANTHROPIC_API_KEY.' });

  const data = db();
  const { budgetId, message } = req.body || {};
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Escribe un mensaje.' });
  const budget = data.budgets.find(b => b.id === budgetId);
  if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
  if (budget.status !== 'borrador') return res.status(400).json({ error: 'El chat solo puede modificar un presupuesto mientras está en borrador.' });

  const sql = getAiDb();
  const now = () => new Date().toISOString();
  const history = sql.prepare('SELECT role, content FROM ai_conversations WHERE budget_id = ? ORDER BY created_at').all(budgetId);
  sql.prepare(`INSERT INTO ai_conversations (id, budget_id, role, content, input_tokens, output_tokens, created_at) VALUES (?, ?, 'user', ?, 0, 0, ?)`)
    .run(uid('aic'), budgetId, String(message), now());

  const messages = history.map(h => ({ role: h.role, content: h.content })).concat([{ role: 'user', content: String(message) }]);
  let currentLines = budget.lines.map(l => ({ ...l }));
  let totalIn = 0, totalOut = 0, finalText = '';

  try {
    for (let turn = 0; turn < 6; turn++) {
      const resp = await client.messages.create({
        model: MODEL, max_tokens: 1024, system: buildSystemPrompt(data), tools: TOOLS, messages
      });
      totalIn += resp.usage.input_tokens || 0;
      totalOut += resp.usage.output_tokens || 0;

      const toolUses = resp.content.filter(b => b.type === 'tool_use');
      const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (text) finalText = finalText ? `${finalText}\n${text}` : text;
      messages.push({ role: 'assistant', content: resp.content });

      if (!toolUses.length) break;
      const toolResults = toolUses.map(tu => {
        const { lines, result } = executeTool(tu.name, tu.input, data, currentLines);
        currentLines = lines;
        return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) };
      });
      messages.push({ role: 'user', content: toolResults });
    }
  } catch (e) {
    console.error('Error llamando a la API de Anthropic:', e.message);
    return res.status(502).json({ error: 'No se pudo contactar con la IA. Inténtalo de nuevo en unos segundos.' });
  }

  // Las líneas resultantes del chat se vuelven a validar aquí (nunca nos fiamos de
  // lo que haya ido quedando en memoria durante el tool-calling) y solo entonces
  // se guardan de verdad en el presupuesto.
  const final = sanitizeLines(currentLines, data);
  if (!final.error) {
    const obj = { ...budget, lines: final.lines };
    data.budgets = data.budgets.map(b => b.id === obj.id ? obj : b);
    persist();
  }

  sql.prepare(`INSERT INTO ai_conversations (id, budget_id, role, content, input_tokens, output_tokens, created_at) VALUES (?, ?, 'assistant', ?, ?, ?, ?)`)
    .run(uid('aic'), budgetId, finalText || '(sin respuesta de texto)', totalIn, totalOut, now());

  // Aviso de gasto mensual estimado (Fase 2.4): no bloquea el chat, solo informa.
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthUsage = sql.prepare('SELECT SUM(input_tokens) i, SUM(output_tokens) o FROM ai_conversations WHERE created_at >= ?').get(monthStart.toISOString());
  const estimatedSpendEur = ((monthUsage.i || 0) / 1e6 * PRICE_IN_PER_MTOK_USD + (monthUsage.o || 0) / 1e6 * PRICE_OUT_PER_MTOK_USD) * USD_TO_EUR;
  const alertThreshold = Number(data.config.aiMonthlySpendAlertEur) || 15;

  const updated = data.budgets.find(b => b.id === budgetId);
  res.json({
    reply: finalText || '(La IA no devolvió ningún texto en esta respuesta.)',
    budget: calcBudget(updated, data.config),
    lineError: final.error || null,
    usage: { inputTokens: totalIn, outputTokens: totalOut },
    monthlySpend: { estimatedEur: Math.round(estimatedSpendEur * 100) / 100, alertThresholdEur: alertThreshold, overThreshold: estimatedSpendEur > alertThreshold }
  });
});

module.exports = router;
