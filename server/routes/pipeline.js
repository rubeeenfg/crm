const express = require('express');
const { db, persist } = require('../store');
const { requireAuth, requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/stages', (req, res) => res.json({ stages: db().pipelineStages.sort((a, b) => a.order - b.order) }));

router.put('/stages', requireAdmin, (req, res) => {
  const data = db();
  if (!Array.isArray(req.body.stages)) return res.status(400).json({ error: 'Formato inválido.' });
  data.pipelineStages = req.body.stages.map((s, i) => ({
    key: s.key, label: s.label, color: s.color || '#64748b', order: i,
    probability: Math.min(100, Math.max(0, Number(s.probability) || 0))
  }));
  persist();
  res.json({ stages: data.pipelineStages });
});

module.exports = router;
