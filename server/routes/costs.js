const { createCrudRouter } = require('./crud-factory');

const defaults = { concept: '', group: 'General', provider: '', monthly: 0, active: true, notes: '' };

module.exports = createCrudRouter({
  collection: 'fixed',
  idPrefix: 'fix',
  defaults
});
