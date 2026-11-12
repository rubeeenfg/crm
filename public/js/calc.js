// Copia en cliente de las fórmulas del escandallo, para que la Calculadora
// responda al instante sin ir al servidor en cada tecla. El servidor es
// siempre la fuente de verdad al guardar.
function clientCostHour(config, fixedList) {
  const activeFixed = (fixedList || []).filter(f => f.active).reduce((s, f) => s + (Number(f.monthly) || 0), 0);
  return ((Number(config.salaryTarget) || 0) + (Number(config.buffer) || 0) + activeFixed) / ((Number(config.productiveHours) || 1));
}
function ceilStep(n, step) { return Math.ceil((Number(n) || 0) / (Number(step) || 1)) * (Number(step) || 1); }
function clientCalcService(s, config, fixedList, override = {}) {
  const num = v => Number(v) || 0;
  const hours = num(override.hours ?? s.hours), tool = num(override.tool ?? s.tool), sub = num(override.sub ?? s.sub);
  const ads = num(override.ads ?? s.ads), other = num(override.other ?? s.other);
  const indirectPct = num(override.indirectPct ?? s.indirectPct);
  const margin = Math.min(num(override.margin ?? s.margin), .95);
  const commissionPct = num(override.commissionPct ?? s.commissionPct);
  const amortizationPct = num(config.amortizationPct);
  const hourCost = clientCostHour(config, fixedList);
  const costHours = hours * hourCost;
  const direct = costHours + tool + sub + ads + other;
  const indirect = direct * indirectPct;
  const amortization = direct * amortizationPct;
  const total = direct + indirect + amortization;
  const rec = total > 0 ? ceilStep(total / (1 - margin), config.rounding) : 0;
  const gross = rec - total;
  const com = Math.max(0, gross) * commissionPct;
  const net = gross - com;
  return { ...s, hours, tool, sub, ads, other, indirectPct, amortizationPct, margin, commissionPct, hourCost, costHours, direct, indirect, amortization, total, rec, gross, com, net, netMargin: rec ? net / rec : 0, iva: rec * num(config.iva), priceIva: rec * (1 + num(config.iva)) };
}
