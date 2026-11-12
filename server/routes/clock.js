// Fichaje manual de horas: iniciar / finalizar un cronómetro ligado a un
// proyecto (contrato, presupuesto o cliente/proyecto manual). Al finalizar,
// se crea automáticamente el registro correspondiente en "Horas" (misma
// colección y mismos campos que "Registrar horas" a mano).
//
// El fichaje en curso se guarda en el propio usuario (req.user.activeClockIn),
// así que es individual por persona y sobrevive a cerrar y reabrir la app
// (se guarda cifrado en disco como el resto de datos).
const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ active: req.user.activeClockIn || null });
});

router.post('/start', (req, res) => {
  if (req.user.activeClockIn) {
    return res.status(400).json({ error: 'Ya tienes un fichaje en curso. Finalízalo antes de iniciar otro.' });
  }
  const { contractedId, budgetId, clientId, client, service } = req.body || {};
  const clientName = String(client || '').trim();
  if (!clientName) return res.status(400).json({ error: 'Selecciona un proyecto antes de iniciar el fichaje.' });
  req.user.activeClockIn = {
    contractedId: contractedId || '',
    budgetId: budgetId || '',
    clientId: clientId || '',
    client: clientName,
    service: service || '',
    startedAt: new Date().toISOString()
  };
  persist();
  res.json({ active: req.user.activeClockIn });
});

router.post('/stop', (req, res) => {
  const active = req.user.activeClockIn;
  if (!active) return res.status(400).json({ error: 'No tienes ningún fichaje en curso.' });
  const data = db();
  const startedAt = new Date(active.startedAt);
  const ms = Math.max(0, Date.now() - startedAt.getTime());
  const hours = Math.max(0.01, Math.round((ms / 3600000) * 100) / 100);
  const { notes, billable } = req.body || {};
  const entry = {
    id: uid('time'),
    date: startedAt.toISOString().slice(0, 10),
    contractedId: active.contractedId || '',
    budgetId: active.budgetId || '',
    clientId: active.clientId || '',
    client: active.client,
    service: active.service || '',
    hours,
    billable: billable !== false,
    notes: notes ? String(notes).trim() : '',
    clockedInAt: active.startedAt,
    clockedOutAt: new Date().toISOString()
  };
  data.timeEntries.unshift(entry);
  req.user.activeClockIn = null;
  persist();
  res.json({ entry });
});

// Descarta el fichaje en curso sin generar ningún registro de horas
// (por si se ha iniciado por error o con el proyecto equivocado).
router.post('/cancel', (req, res) => {
  if (!req.user.activeClockIn) return res.status(400).json({ error: 'No tienes ningún fichaje en curso.' });
  req.user.activeClockIn = null;
  persist();
  res.json({ ok: true });
});

module.exports = router;
