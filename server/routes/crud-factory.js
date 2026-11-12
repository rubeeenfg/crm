// Generador de rutas CRUD simples para colecciones sin logica especial de negocio.
const express = require('express');
const { db, persist, uid } = require('../store');
const { requireAuth } = require('../middleware');

function createCrudRouter({ collection, idPrefix, defaults = {}, onSave, enrich, sort }) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    let rows = db()[collection].slice();
    if (sort) rows = rows.sort(sort);
    if (enrich) rows = rows.map(r => enrich(r, db()));
    res.json({ items: rows });
  });

  router.get('/:id', (req, res) => {
    const row = db()[collection].find(r => r.id === req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ item: enrich ? enrich(row, db()) : row });
  });

  router.post('/', (req, res) => {
    const data = db();
    let obj = { ...defaults, ...req.body, id: uid(idPrefix) };
    if (onSave) obj = onSave(obj, data, null);
    data[collection].unshift(obj);
    persist();
    res.status(201).json({ item: enrich ? enrich(obj, data) : obj });
  });

  router.put('/:id', (req, res) => {
    const data = db();
    const existing = data[collection].find(r => r.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'No encontrado.' });
    let obj = { ...defaults, ...existing, ...req.body, id: existing.id };
    if (onSave) obj = onSave(obj, data, existing);
    data[collection] = data[collection].map(r => r.id === obj.id ? obj : r);
    persist();
    res.json({ item: enrich ? enrich(obj, data) : obj });
  });

  router.delete('/:id', (req, res) => {
    const data = db();
    const existing = data[collection].find(r => r.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'No encontrado.' });
    data[collection] = data[collection].filter(r => r.id !== req.params.id);
    persist();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createCrudRouter };
