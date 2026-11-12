// Conexión IMAP/SMTP al correo del hosting (Fase 8). Las credenciales viven
// SOLO en .env, nunca en código ni en SQLite en claro. Si no están configuradas,
// las funciones de este fichero devuelven null/un error claro y el resto de la
// app sigue funcionando con normalidad — mismo patrón que ANTHROPIC_API_KEY en
// routes/ai.js.
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

function getImapConfig() {
  if (!process.env.EMAIL_IMAP_HOST || !process.env.EMAIL_IMAP_USER || !process.env.EMAIL_IMAP_PASSWORD) return null;
  return {
    host: process.env.EMAIL_IMAP_HOST,
    port: Number(process.env.EMAIL_IMAP_PORT) || 993,
    secure: process.env.EMAIL_IMAP_SECURE !== 'false',
    auth: { user: process.env.EMAIL_IMAP_USER, pass: process.env.EMAIL_IMAP_PASSWORD },
    logger: false
  };
}

function getSmtpConfig() {
  if (!process.env.EMAIL_SMTP_HOST || !process.env.EMAIL_SMTP_USER || !process.env.EMAIL_SMTP_PASSWORD) return null;
  return {
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT) || 465,
    secure: process.env.EMAIL_SMTP_SECURE !== 'false',
    auth: { user: process.env.EMAIL_SMTP_USER, pass: process.env.EMAIL_SMTP_PASSWORD }
  };
}

function mailStatus() {
  return { imapConfigured: !!getImapConfig(), smtpConfigured: !!getSmtpConfig() };
}

// Busca el cliente cuyo email coincida exactamente con una dirección (matching
// determinista, sin IA — plan Fase 8 punto 3). Case-insensitive.
function findClientByEmail(clients, address) {
  if (!address) return null;
  const needle = String(address).trim().toLowerCase();
  return (clients || []).find(c => c.email && String(c.email).trim().toLowerCase() === needle) || null;
}

// Sincroniza los correos entrantes de los últimos `days` días (por defecto 30):
// se guardan en data.emails, vinculados al cliente si su email coincide. Dedupe
// por Message-ID — si ya existe, no se repite (polling periódico, no push).
// No llama a persist(): quien la invoca lo hace justo después, igual que el
// resto de rutas de este proyecto.
async function syncInbox(data, uid, days = 30) {
  const cfg = getImapConfig();
  if (!cfg) return { imported: 0, error: 'IMAP no configurado (faltan EMAIL_IMAP_* en .env).' };

  const known = new Set((data.emails || []).map(e => e.messageId).filter(Boolean));
  const client = new ImapFlow(cfg);
  let imported = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      for await (const msg of client.fetch({ since }, { envelope: true, source: true, uid: true })) {
        const parsed = await simpleParser(msg.source);
        const messageId = parsed.messageId || `imap-uid-${msg.uid}`;
        if (known.has(messageId)) continue;
        known.add(messageId);
        const fromAddress = (parsed.from && parsed.from.value[0] && parsed.from.value[0].address) || '';
        const toAddress = (parsed.to && parsed.to.value[0] && parsed.to.value[0].address) || '';
        const matched = findClientByEmail(data.clients, fromAddress);
        data.emails.unshift({
          id: uid('eml'), clientId: matched ? matched.id : null, direction: 'in',
          from: fromAddress, to: toAddress, subject: parsed.subject || '(sin asunto)',
          bodyText: parsed.text || '', bodyHtml: parsed.html || '',
          messageId, inReplyTo: (parsed.inReplyTo || null), read: false,
          createdAt: (parsed.date || new Date()).toISOString()
        });
        imported++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return { imported };
}

// Envía una respuesta por SMTP y guarda su propio registro en data.emails como
// correo "out" — el texto es siempre el que el usuario confirmó (editado o no),
// nunca el de la IA sin pasar por esta confirmación explícita.
async function sendReply(data, uid, { to, subject, body, inReplyTo }) {
  const cfg = getSmtpConfig();
  if (!cfg) throw Object.assign(new Error('SMTP no configurado (faltan EMAIL_SMTP_* en .env).'), { code: 'SMTP_NOT_CONFIGURED' });

  const transporter = nodemailer.createTransport(cfg);
  const from = process.env.EMAIL_SMTP_USER;
  const info = await transporter.sendMail({ from, to, subject, text: body, inReplyTo: inReplyTo || undefined });

  const matched = findClientByEmail(data.clients, to);
  const record = {
    id: uid('eml'), clientId: matched ? matched.id : null, direction: 'out',
    from, to, subject: subject || '', bodyText: body || '', bodyHtml: '',
    messageId: info.messageId || null, inReplyTo: inReplyTo || null, read: true,
    createdAt: new Date().toISOString()
  };
  data.emails.unshift(record);
  return record;
}

module.exports = { getImapConfig, getSmtpConfig, mailStatus, findClientByEmail, syncInbox, sendReply };
