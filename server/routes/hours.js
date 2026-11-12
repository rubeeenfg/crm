const { createCrudRouter } = require('./crud-factory');

const defaults = { date: '', contractedId: '', budgetId: '', clientId: '', client: '', service: '', hours: 0, billable: true, notes: '' };

module.exports = createCrudRouter({
  collection: 'timeEntries',
  idPrefix: 'time',
  defaults
});
