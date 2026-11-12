// Bandeja de correo por cliente con borrador de respuesta IA (plan Fase 8). La
// IA SOLO prepara un borrador de texto — nunca envía nada por su cuenta, mismo
// principio que el chat de presupuestos (routes/ai.js): ninguna acción que sale
// de la empresa ocurre sin revisión humana explícita.
const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');
const { mailStatus, syncInbox, sendReply } = require('../mail');

const router = express.Router();
router.use(requireAuth);

const MODEL = 'claude-sonnet-5-5';

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

router.get('/status', (req, res) => {
  res.json({ ...mailStatus(), aiAvailable: !!process.env.ANTHROPIC_API_KEY });
});

// Sincroniza la bandeja IMAP (polling manual/periódico, no push — plan Fase 8).
router.post('/sync', async (req, res) => {
  const data = db();
  try {
    const result = await syncInbox(data, uid);
    if (result.error) return res.status(503).json({ error: result.error });
    persist();
    res.json(result);
  } catch (e) {
    console.error('Error sincronizando IMAP:', e.message);
    res.status(502).json({ error: 'No se pudo conectar al buzón de correo. Revisa las credenciales EMAIL_IMAP_* en .env.' });
  }
});

router.get('/', (req, res) => {
  const data = db();
  let rows = data.emails.slice();
  if (req.query.clientId) rows = rows.filter(e => e.clientId === req.query.clientId);
  res.json({ items: rows });
});

router.get('/:id', (req, res) => {
  const data = db();
  const email = data.emails.find(e => e.id === req.params.id);
  if (!email) return res.status(404).json({ error: 'Correo no encontrado.' });
  const drafts = data.emailDrafts.filter(d => d.emailId === email.id);
  res.json({ item: email, drafts });
});

router.put('/:id/read', (req, res) => {
  const data = db();
  const email = data.emails.find(e => e.id === req.params.id);
  if (!email) return res.status(404).json({ error: 'Correo no encontrado.' });
  email.read = req.body.read !== undefined ? !!req.body.read : true;
  persist();
  res.json({ item: email });
});

// Contexto real del cliente para el borrador (plan Fase 8 punto 4): historial de
// presupuestos/facturas reales — la IA nunca inventa importes ni compromisos
// porque el propio prompt solo contiene datos ya calculados por el servidor.
function buildClientContext(data, clientId) {
  if (!clientId) return 'Este correo no está vinculado a ningún cliente del CRM.';
  const client = data.clients.find(c => c.id === clientId);
  if (!client) return 'Cliente vinculado no encontrado.';
  const budgets = data.budgets.filter(b => b.clientId === clientId).slice(0, 5)
    .map(b => `- Presupuesto ${b.date} (${b.status}): ${(b.lines || []).map(l => l.concept).join(', ') || 'sin líneas'}`);
  const invoices = data.invoices.filter(i => i.clientId === clientId).slice(0, 5)
    .map(i => `- Factura ${i.number} (${i.status}): ${i.total}€`);
  return [
    `Cliente: ${client.name}`,
    client.notes ? `Notas internas: ${client.notes}` : null,
    budgets.length ? `Presupuestos recientes:\n${budgets.join('\n')}` : 'Sin presupuestos registrados.',
    invoices.length ? `Facturas recientes:\n${invoices.join('\n')}` : 'Sin facturas registradas.'
  ].filter(Boolean).join('\n\n');
}

router.post('/:id/draft', async (req, res) => {
  const client = getAnthropicClient();
  if (!client) return res.status(503).json({ error: 'El borrador IA no está disponible: falta configurar ANTHROPIC_API_KEY.' });

  const data = db();
  const email = data.emails.find(e => e.id === req.params.id);
  if (!email) return res.status(404).json({ error: 'Correo no encontrado.' });

  const system = [
    'Eres el asistente de correo de RCP Digital. Redactas SOLO un borrador de respuesta en español, breve, profesional y cercano — el usuario lo revisará y editará antes de enviarlo, tú nunca envías nada.',
    'Usa ÚNICAMENTE los datos reales del cliente de abajo. Si no tienes un dato (fecha, importe, compromiso concreto), no lo inventes: pide al usuario que lo complete o dilo en términos generales.',
    '',
    buildClientContext(data, email.clientId)
  ].join('\n');

  try {
    const resp = await client.messages.create({
      model: MODEL, max_tokens: 600, system,
      messages: [{ role: 'user', content: `Correo recibido de ${email.from}.\nAsunto: ${email.subject}\n\n${email.bodyText || email.bodyHtml || '(sin contenido)'}\n\nRedacta un borrador de respuesta.` }]
    });
    const body = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const draft = {
      id: uid('edr'), emailId: email.id, body: body || '(la IA no devolvió texto)', model: MODEL,
      inputTokens: resp.usage.input_tokens || 0, outputTokens: resp.usage.output_tokens || 0, createdAt: new Date().toISOString()
    };
    data.emailDrafts.push(draft);
    persist();
    res.status(201).json({ item: draft });
  } catch (e) {
    console.error('Error generando borrador IA:', e.message);
    res.status(502).json({ error: 'No se pudo contactar con la IA. Inténtalo de nuevo en unos segundos.' });
  }
});

// Envía la respuesta por SMTP: SIEMPRE el texto que manda el usuario en el
// cuerpo de esta petición (editado o no sobre el borrador), nunca el de la IA
// directamente — el frontend es quien decide qué texto final confirma.
router.post('/:id/send', async (req, res) => {
  const data = db();
  const email = data.emails.find(e => e.id === req.params.id);
  if (!email) return res.status(404).json({ error: 'Correo no encontrado.' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'El correo no puede ir vacío.' });
  const subject = req.body.subject !== undefined ? String(req.body.subject) : `Re: ${email.subject}`;

  try {
    const record = await sendReply(data, uid, { to: email.from, subject, body, inReplyTo: email.messageId });
    persist();
    res.status(201).json({ item: record });
  } catch (e) {
    if (e.code === 'SMTP_NOT_CONFIGURED') return res.status(503).json({ error: e.message });
    console.error('Error enviando correo:', e.message);
    res.status(502).json({ error: 'No se pudo enviar el correo. Revisa las credenciales EMAIL_SMTP_* en .env.' });
  }
});

module.exports = router;
