const express = require('express');
const { db, persist, replaceAll, listBackups } = require('../store');
const { requireAuth, requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => res.json({ config: db().config }));

router.put('/', (req, res) => {
  const data = db();
  const patch = { ...req.body };
  if (Array.isArray(patch.onboardingTasks)) {
    patch.onboardingTasks = patch.onboardingTasks.map(t => String(t || '').trim()).filter(Boolean);
  }
  data.config = { ...data.config, ...patch };
  persist();
  res.json({ config: data.config });
});

// Copias de seguridad automáticas: una por día, guardadas en data/backups.
// Solo se listan (fecha y tamaño); no se sirven por HTTP para no exponer datos
// del negocio sin autenticación adicional a través de una URL de fichero estático.
router.get('/backups', (req, res) => {
  res.json({ items: listBackups() });
});

// Restaurar una copia de seguridad completa (sube el JSON exportado desde "Copia de seguridad").
// Solo un administrador puede hacerlo: sobreescribe TODOS los datos del CRM.
router.post('/restore', requireAdmin, (req, res) => {
  const incoming = req.body;
  const REQUIRED_KEYS = ['users', 'config', 'clients', 'services'];
  if (!incoming || typeof incoming !== 'object' || REQUIRED_KEYS.some(k => !(k in incoming))) {
    return res.status(400).json({ error: 'El fichero no parece una copia de seguridad válida del CRM.' });
  }
  replaceAll(incoming); // guarda ya cifrado en disco, igual que el resto de datos
  res.json({ ok: true });
});

module.exports = router;
