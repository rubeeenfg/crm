/* ===================== Helpers ===================== */
const money = n => (Number(n)||0).toLocaleString('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const money2 = n => (Number(n)||0).toLocaleString('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
const pct = n => ((Number(n)||0)*100).toLocaleString('es-ES',{maximumFractionDigits:1})+'%';
const today = () => new Date().toISOString().slice(0,10);
const num = v => Number(v)||0;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escAttr = v => String(v).replaceAll('\\','\\\\').replaceAll("'","\\'");
const val = id => num(document.getElementById(id)?.value);
const textVal = id => (document.getElementById(id)?.value || '').trim();
const checked = id => Boolean(document.getElementById(id)?.checked);
function plainNumber(id,label,value,step){return `<div class="field"><label>${label}</label><input id="${id}" type="number" step="${step}" value="${Math.round((Number(value)||0)*100)/100}"></div>`}
function initials(name){ return (name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase() || '?'; }

/* ===== Orden reutilizable para listados (clic en cabecera de columna) =====
   Cada tabla mantiene su propio {key, dir} (ver "let xSort = {...}" junto a cada
   render*). sortRows() aplica ese estado sobre las filas ya filtradas/buscadas;
   thSort() pinta la cabecera clicable con la flecha de dirección activa. */
function sortRows(rows, sortState, accessors){
  if(!sortState || !sortState.key || !accessors[sortState.key]) return rows;
  const acc = accessors[sortState.key];
  const dir = sortState.dir==='desc' ? -1 : 1;
  return [...rows].sort((a,b)=>{
    let va=acc(a), vb=acc(b);
    if(typeof va==='string') va=va.toLowerCase();
    if(typeof vb==='string') vb=vb.toLowerCase();
    if(va<vb) return -1*dir;
    if(va>vb) return 1*dir;
    return 0;
  });
}
function toggleSort(stateObj, key){
  if(stateObj.key===key) stateObj.dir = stateObj.dir==='asc' ? 'desc' : 'asc';
  else { stateObj.key = key; stateObj.dir = 'asc'; }
}
function thSort(label, key, stateObj, setterName){
  const active = stateObj.key===key;
  const arrow = active ? (stateObj.dir==='asc' ? ' ▲' : ' ▼') : '';
  return `<th class="sortable" onclick="${setterName}('${key}')">${esc(label)}${arrow}</th>`;
}

/* ===================== Iconos (SVG en línea, sin CDN) ===================== */
const ICON_PATHS = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  pipeline:'<path d="M3 4h18l-7.5 8.5v6.5l-3 1.5v-8L3 4z"/>',
  clients:'<circle cx="8.5" cy="8" r="3"/><path d="M2.5 20c0-4.2 2.6-6.7 6-6.7s6 2.5 6 6.7"/><circle cx="17.5" cy="9" r="2.3"/><path d="M15.8 13.3c2.6.4 4.2 2.5 4.2 6.2"/>',
  contracted:'<path d="M6 2.5h8.5L19 7v14.5H6z"/><path d="M14.5 2.5V7H19"/><path d="M9 13l2 2 4.2-4.2"/>',
  charges:'<rect x="2" y="5.5" width="20" height="13" rx="2.2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="5.5" y1="14.5" x2="9.5" y2="14.5"/>',
  calculator:'<rect x="4.5" y="2" width="15" height="20" rx="2"/><line x1="7.5" y1="6" x2="16.5" y2="6"/><circle cx="8" cy="11" r=".9"/><circle cx="12" cy="11" r=".9"/><circle cx="16" cy="11" r=".9"/><circle cx="8" cy="15" r=".9"/><circle cx="12" cy="15" r=".9"/><circle cx="16" cy="15" r=".9"/><circle cx="8" cy="19" r=".9"/><circle cx="12" cy="19" r=".9"/>',
  catalog:'<path d="M20.4 13.2 10.8 3.6a2 2 0 0 0-1.5-.6H4a1 1 0 0 0-1 1v5.3c0 .53.2 1.04.6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  config:'<line x1="4" y1="6.5" x2="20" y2="6.5"/><circle cx="9.5" cy="6.5" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2"/><line x1="4" y1="17.5" x2="20" y2="17.5"/><circle cx="10.5" cy="17.5" r="2"/>',
  budgets:'<path d="M6 2.5h8.5L19 7v14.5H6z"/><path d="M14.5 2.5V7H19"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="16.7" x2="15" y2="16.7"/>',
  costs:'<rect x="2" y="6" width="20" height="12" rx="2.2"/><circle cx="12" cy="12" r="3"/><line x1="5.5" y1="9.3" x2="6.2" y2="9.3"/><line x1="17.8" y1="14.7" x2="18.5" y2="14.7"/>',
  invoices:'<path d="M6 2.5h12v18.5l-1.7-1.3-1.6 1.3-1.7-1.3-1.6 1.3-1.7-1.3-1.7 1.3-1.6-1.3-1.7 1.3z"/><line x1="8.5" y1="7" x2="15.5" y2="7"/><line x1="8.5" y1="10.5" x2="15.5" y2="10.5"/><line x1="8.5" y1="14" x2="13" y2="14"/>',
  settings:'<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/><line x1="3" y1="13" x2="21" y2="13"/>',
  hours:'<circle cx="12" cy="12" r="9"/><polyline points="12 7.2 12 12 15.8 14.2"/>',
  profitability:'<polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.5 3.5-7 8-7s8 2.5 8 7"/>',
  users:'<path d="M12 2.2 4.5 5v6c0 5 3.2 8.3 7.5 9.8 4.3-1.5 7.5-4.8 7.5-9.8V5z"/>',
  guide:'<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.7 2.7 0 0 1 5.1-1.2c.4.9.2 1.5-.6 2.2-.7.5-1.3 1.1-1.3 2.4"/><circle cx="12.3" cy="16.6" r=".55" fill="currentColor" stroke="none"/>',
  dots:'<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  coins:'<ellipse cx="8" cy="7" rx="6" ry="3"/><path d="M2 7v10c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M2 12c0 1.7 2.7 3 6 3s6-1.3 6-3"/><path d="M14 10.3c3 .2 8 1.2 8 3.7 0 1.7-2.7 3-6 3-1 0-1.9-.1-2.7-.3"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash:'<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  link:'<path d="M9.5 14.5 14.5 9.5"/><path d="M8 17 5 20a3 3 0 0 1-4-4l3-3"/><path d="M16 7l3-3a3 3 0 1 1 4 4l-3 3"/>'
};
function icon(name){
  return `<svg class="icsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]||''}</svg>`;
}
function stageInfo(key){ return (STAGES.find(s=>s.key===key)) || {label:key||'Sin etapa', color:'#64748b'}; }
function stagePill(key){ const s=stageInfo(key); return `<span class="stagepill" style="background:${s.color}20;color:${s.color}"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span>`; }

function openModal(title, bodyHtml, opts={}){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalCard').classList.toggle('wide', Boolean(opts.wide));
  document.getElementById('modal').classList.remove('hide');
}
function closeModal(){
  document.getElementById('modal').classList.add('hide');
  document.getElementById('modalBody').innerHTML = '';
}
async function guarded(promise){
  try{ return await promise; }
  catch(e){ toast(e.message || 'Ha ocurrido un error', 'error'); throw e; }
}
// Valida campos obligatorios antes de crear/guardar algo. pairs: [[valor, 'Etiqueta'], ...]
// Devuelve true si falta algo (y ya muestra el aviso); false si todo está relleno.
function blockIfMissing(pairs){
  for(const [v,label] of pairs){
    const empty = v===undefined || v===null || (typeof v==='number' ? false : String(v).trim()==='');
    if(empty){ toast('Falta rellenar: '+label, 'error'); return true; }
  }
  return false;
}

/* ===================== Navegación ===================== */
const PAGES = {
  dashboard:['Panel','Visión general de tu negocio: pipeline, precios, cobros y avisos.'],
  pipeline:['Pipeline de clientes','Sigue el estado comercial de cada cliente, en Kanban o en tabla.'],
  clients:['Clientes','Base de datos de clientes: contacto, facturación y contratos.'],
  contracted:['Contratos','Servicios recurrentes o de pago único que facturas a cada cliente (mantenimiento, hosting, redes sociales...), con su fecha de inicio y, si aplica, de fin.'],
  calculator:['Calculadora de proyectos','Simula servicios con costes reales, margen, IVA y comisión antes de presupuestar.'],
  services:['Catálogo de servicios','Crea, edita o retira servicios. Cada cambio recalcula el escandallo.'],
  budgets:['Proyectos','Pipeline de proyectos por cliente: de presupuesto a cobrado, con margen real.'],
  hours:['Control de horas','Registra las horas trabajadas por cliente o servicio y compáralas con lo presupuestado.'],
  profitability:['Rentabilidad','Facturación recurrente mensual por cliente y estado de los cobros.'],
  invoices:['Facturas','Genera y controla las facturas emitidas a tus clientes, con pagos parciales y estado de cobro.'],
  pricing:['Costes y precios','Costes fijos y parámetros económicos que usa la calculadora del escandallo, todo en un mismo sitio.'],
  profile:['Mi perfil','Tus datos de acceso y tu contraseña.'],
  users:['Usuarios','Gestiona quién tiene acceso al CRM y con qué permisos.'],
  settings:['Ajustes generales','Datos fiscales para tus facturas, copia de seguridad y funcionamiento de la app.'],
  guide:['Guía rápida','Criterios prácticos para interpretar costes, margen, comisiones y beneficio neto.']
};
const NAV = [
  {group:null, items:[['dashboard','dashboard','Panel']]},
  {group:'CRM', items:[['pipeline','pipeline','Pipeline'],['clients','clients','Clientes'],['budgets','budgets','Proyectos'],['contracted','contracted','Contratos']]},
  {group:'Escandallo', items:[['calculator','calculator','Calculadora de proyectos'],['services','catalog','Catálogo de servicios']]},
  {group:'Finanzas', items:[['invoices','invoices','Facturas'],['pricing','costs','Costes y precios'],['hours','hours','Horas'],['profitability','profitability','Rentabilidad']]},
  {group:'Cuenta', items:[['profile','profile','Mi perfil'],['users','users','Usuarios','admin'],['settings','settings','Ajustes generales','admin'],['guide','guide','Guía rápida']]}
];
const RENDERERS = {
  dashboard:renderDashboard, pipeline:renderPipeline, clients:renderClients, contracted:renderContracted,
  calculator:renderCalculator, services:renderServices, budgets:renderBudgets,
  invoices:renderInvoices, pricing:renderPricing, hours:renderHours, profitability:renderProfitability,
  profile:renderProfile, users:renderUsers, settings:renderSettings, guide:renderGuide
};

function renderNav(){
  const isAdmin = CURRENT_USER.role === 'admin';
  const html = NAV.map(g=>{
    const items = g.items.filter(it => it[3]!=='admin' || isAdmin);
    if(!items.length) return '';
    const buttons = items.map(([id,ic,label])=>`<button data-page="${id}"><span class="ic">${icon(ic)}</span>${label}</button>`).join('');
    return `<div class="navgroup">${g.group?`<div class="navgroup-label">${g.group}</div>`:''}<div class="nav">${buttons}</div></div>`;
  }).join('');
  document.getElementById('navContainer').innerHTML = html;
  document.getElementById('mobileNav').innerHTML = NAV.flatMap(g=>g.items).filter(it=>it[3]!=='admin'||isAdmin).map(([id,ic,label])=>`<button data-page="${id}"><span class="ic">${icon(ic)}</span>${label}</button>`).join('');
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>show(b.dataset.page));
}

async function show(page){
  closeModal();
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  document.getElementById('pageTitle').textContent = PAGES[page][0];
  document.getElementById('pageDesc').textContent = PAGES[page][1];
  window.scrollTo({top:0});
  await RENDERERS[page]();
}

/* ===================== Arranque ===================== */
let CURRENT_USER=null, CONFIG=null, FIXED=[], STAGES=[];
async function boot(){
  let status;
  try{ status = await api('/auth/status'); }
  catch(e){ window.location.href='/login.html'; return; }
  if(!status.user){ window.location.href='/login.html'; return; }
  CURRENT_USER = status.user;
  document.getElementById('userName').textContent = CURRENT_USER.name;
  document.getElementById('userRole').textContent = CURRENT_USER.role==='admin' ? 'Administrador' : 'Colaborador';
  document.getElementById('userAvatar').textContent = initials(CURRENT_USER.name);
  document.getElementById('logoutBtn').onclick = async ()=>{ await api('/auth/logout',{method:'POST'}); window.location.href='/login.html'; };
  renderNav();
  const [cfgRes, fixedRes, stagesRes] = await Promise.all([api('/config'), api('/costs'), api('/pipeline/stages')]);
  CONFIG = cfgRes.config; FIXED = fixedRes.items; STAGES = stagesRes.stages.sort((a,b)=>a.order-b.order);
  show('dashboard');
}
async function exportBackup(){ window.location.href = '/api/export'; }
boot();

/* ===================== Panel (Dashboard) ===================== */
async function renderDashboard(){
  const k = await guarded(api('/dashboard'));
  const el = document.getElementById('dashboard');
  el.innerHTML = `
  <div class="grid kpis">
    <div class="card kpi"><span>Coste/hora calculado</span><strong>${money2(k.costHour)}</strong><small>Sueldo + costes fijos / horas productivas</small></div>
    <div class="card kpi"><span>Costes fijos activos</span><strong>${money(k.activeFixedCosts)}</strong><small>${k.fixedActive} costes incluidos</small></div>
    <div class="card kpi"><span>Precio medio servicio</span><strong>${money(k.avgService)}</strong><small>Servicios activos con precio calculable</small></div>
    <div class="card kpi"><span>Beneficio medio neto</span><strong>${money(k.avgNet)}</strong><small>Después de comisión estimada</small></div>
    <div class="card kpi"><span>Servicios para objetivo</span><strong>${k.need}</strong><small>Objetivo ${money(CONFIG.salaryTarget)}</small></div>
  </div>
  <div class="grid two">
    <div class="card"><h3>Servicios más rentables</h3><div class="canvas-wrap">${k.topServices.length ? '<canvas id="chartServices"></canvas>' : '<div class="empty">Activa servicios con precio calculable para ver el gráfico.</div>'}</div></div>
    <div class="card">
      <h3>Presupuestos activos</h3>
      <div class="bigprice">${money(k.benefitActive)}</div>
      <p class="sub">Beneficio neto estimado en presupuestos aceptados, en proceso o facturados.</p>
      <div class="metric"><span>Presupuestos activos</span><strong>${k.activeCount}</strong></div>
      <div class="metric"><span>Facturación presupuestada sin IVA</span><strong>${money(k.sales)}</strong></div>
      <div class="metric"><span>Beneficio neto total</span><strong>${money(k.net)}</strong></div>
      <div class="metric"><span>Margen neto medio</span><strong>${pct(k.sales?k.net/k.sales:0)}</strong></div>
    </div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h3>Estados de presupuestos</h3><div class="canvas-wrap">${Object.keys(k.statusGroups).length ? '<canvas id="chartBudgets"></canvas>' : '<div class="empty">Crea presupuestos para ver su distribución por estado.</div>'}</div></div>
    <div class="card">
      <h3>Pipeline comercial</h3>
      ${STAGES.map(s=>`<div class="metric"><span>${stagePill(s.key)}</span><strong>${k.pipelineCounts[s.key]||0}</strong></div>`).join('')}
      <button class="btn small full" style="margin-top:10px" onclick="show('pipeline')">Ver pipeline completo →</button>
    </div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card">
      <h3>Clientes y contratos</h3>
      <div class="metric"><span>Clientes</span><strong>${k.clientsTotal}</strong></div>
      <div class="metric"><span>Contratos activos</span><strong>${k.contractedActive} / ${k.contractedTotal}</strong></div>
      <div class="metric"><span>Facturación recurrente mensual</span><strong>${money(k.recurringMonthlyRevenue)}</strong></div>
    </div>
    <div class="card">
      <h3>Avisos de facturación</h3>
      <div class="metric"><span>Facturas pendientes de cobro</span><strong>${k.invoicesPending}</strong></div>
      <div class="metric"><span>Pendientes atrasadas</span><strong>${k.invoicesOverdue}</strong></div>
      <div class="metric"><span>Cobradas</span><strong>${k.invoicesPaid}</strong></div>
      <button class="btn small full" style="margin-top:10px" onclick="show('invoices')">Ver facturas →</button>
    </div>
  </div>`;
  drawCharts(k.topServices, k.statusGroups);
}

/* ===================== Pipeline (Kanban + Tabla) ===================== */
let pipelineView = 'kanban';
let pipelineSearch = '';
async function renderPipeline(){
  const q = pipelineSearch ? `?search=${encodeURIComponent(pipelineSearch)}` : '';
  const data = await guarded(api('/clients'+q));
  const el = document.getElementById('pipeline');
  el.innerHTML = `
  <div class="card">
    <div class="toolbar-row">
      <div class="toolbar-left">
        <div class="tabs">
          <button class="${pipelineView==='kanban'?'active':''}" onclick="pipelineView='kanban';renderPipeline()">Kanban</button>
          <button class="${pipelineView==='tabla'?'active':''}" onclick="pipelineView='tabla';renderPipeline()">Tabla</button>
        </div>
      </div>
      <div class="searchbox"><input id="pipeSearch" placeholder="Buscar cliente, email o teléfono..." value="${esc(pipelineSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openClientModal(null,'nuevo_lead')">+ Nuevo cliente</button></div>
    </div>
    <div id="pipelineBody">${pipelineView==='kanban' ? kanbanHtml(data.items) : pipelineTableHtml(data.items)}</div>
  </div>`;
  const searchInput = document.getElementById('pipeSearch');
  let t=null;
  searchInput.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ pipelineSearch=searchInput.value; renderPipeline(); }, 300); };
  searchInput.focus(); searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  if(pipelineView==='kanban') wireKanbanDragDrop();
}
function kanbanHtml(clients){
  const grandTotal = clients.reduce((a,c)=>a+num(c.monthlyValue),0);
  return `<div class="kanban-summary">Ingresos mensuales recurrentes en el pipeline: <strong>${money(grandTotal)}/mes</strong></div>
  <div class="kanban">${STAGES.map(s=>{
    const items = clients.filter(c=>(c.pipelineStage||'nuevo_lead')===s.key);
    const total = items.reduce((a,c)=>a+num(c.monthlyValue),0);
    return `<div class="kanban-col" data-stage="${s.key}">
      <div class="kanban-col-head">
        <span class="kanban-col-title"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span>
        <span class="count">${items.length}</span>
      </div>
      <div class="kanban-col-value ${total>0?'':'zero'}">${total>0?money(total)+'/mes':'Sin ingresos recurrentes'}</div>
      <div class="kanban-cards">${items.map(kcardHtml).join('') || '<div class="mini" style="padding:8px">Sin clientes</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}
function kcardHtml(c){
  const s = stageInfo(c.pipelineStage);
  return `<div class="kcard" draggable="true" data-id="${c.id}" onclick="openClientDetail('${c.id}')" style="border-left-color:${s.color}">
    <div class="kcard-top">
      <span class="kavatar" style="background:${s.color}1f;color:${s.color}">${esc(initials(c.name))}</span>
      <h5>${esc(c.name)}</h5>
    </div>
    <div class="kmeta">${c.contactName?`<span>${esc(c.contactName)}</span>`:''}${c.email?`<span>${esc(c.email)}</span>`:''}</div>
    <div class="kcard-foot">
      <span class="kvalue ${num(c.monthlyValue)>0?'':'muted'}">${num(c.monthlyValue)>0?money(c.monthlyValue)+'/mes':'Sin ingresos recurrentes'}</span>
    </div>
  </div>`;
}
function wireKanbanDragDrop(){
  document.querySelectorAll('.kcard').forEach(card=>{
    card.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
  });
  document.querySelectorAll('.kanban-col').forEach(col=>{
    col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', ()=>col.classList.remove('dragover'));
    col.addEventListener('drop', async e=>{
      e.preventDefault(); col.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const stage = col.dataset.stage;
      await guarded(api(`/clients/${id}/stage`, {method:'PUT', body:{stage}}));
      toast('Cliente movido a "'+stageInfo(stage).label+'"');
      renderPipeline();
    });
  });
}
function pipelineTableHtml(clients){
  if(!clients.length) return '<div class="empty">No hay clientes que coincidan con la búsqueda.</div>';
  const total = clients.reduce((a,c)=>a+num(c.monthlyValue),0);
  return `<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Etapa</th><th>Ingresos/mes</th><th>Actualizado</th><th>Acciones</th></tr></thead><tbody>
  ${clients.map(c=>`<tr>
    <td><a href="#" onclick="openClientDetail('${c.id}');return false;"><strong>${esc(c.name)}</strong></a></td>
    <td>${esc(c.contactName||c.email||c.phone||'—')}</td>
    <td><select onchange="changeStage('${c.id}', this.value)">${STAGES.map(s=>`<option value="${s.key}" ${((c.pipelineStage||'nuevo_lead')===s.key)?'selected':''}>${esc(s.label)}</option>`).join('')}</select></td>
    <td>${num(c.monthlyValue)>0?money(c.monthlyValue):'—'}</td>
    <td>${c.updatedAt?esc(c.updatedAt.slice(0,10)):'—'}</td>
    <td><div class="row-actions"><button class="btn small" onclick="openClientModal('${c.id}')">Editar</button></div></td>
  </tr>`).join('')}
  <tr><td colspan="3" style="text-align:right;color:var(--muted);font-weight:700;background:transparent;border:none">Total</td><td style="font-weight:800;background:transparent;border:none">${money(total)}</td><td colspan="2" style="background:transparent;border:none"></td></tr>
  </tbody></table></div>`;
}
async function changeStage(id, stage){
  await guarded(api(`/clients/${id}/stage`, {method:'PUT', body:{stage}}));
  toast('Etapa actualizada');
  renderPipeline();
}

/* ===================== Clientes ===================== */
let clientsSearch = '';
let clientsStageFilter = '';
let clientsSort = {key:'', dir:'asc'};
const CLIENTS_SORT_ACCESSORS = { name:c=>c.name||'', pipelineStage:c=>stageInfo(c.pipelineStage).label||'', activeContractedCount:c=>num(c.activeContractedCount) };
function setClientsSort(key){ toggleSort(clientsSort, key); renderClients(); }
async function renderClients(){
  const q = clientsSearch ? `?search=${encodeURIComponent(clientsSearch)}` : '';
  const data = await guarded(api('/clients'+q));
  let rows = clientsStageFilter ? data.items.filter(c=>(c.pipelineStage||'nuevo_lead')===clientsStageFilter) : data.items;
  rows = sortRows(rows, clientsSort, CLIENTS_SORT_ACCESSORS);
  const el = document.getElementById('clients');
  el.innerHTML = `
  <div class="card">
    <div class="toolbar-row">
      <div class="toolbar-left"><h3>Listado de clientes</h3>
        <select id="clFilterStage" onchange="clientsStageFilter=this.value;renderClients()">
          <option value="">Todas las etapas</option>
          ${STAGES.map(s=>`<option value="${s.key}" ${clientsStageFilter===s.key?'selected':''}>${esc(s.label)}</option>`).join('')}
        </select>
      </div>
      <div class="searchbox"><input id="clSearch" placeholder="Buscar por nombre, email, teléfono o NIF..." value="${esc(clientsSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openClientModal(null)">+ Nuevo cliente</button></div>
    </div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr>${thSort('Nombre','name',clientsSort,'setClientsSort')}<th>Contacto</th><th>Email</th><th>Teléfono</th>${thSort('Etapa','pipelineStage',clientsSort,'setClientsSort')}${thSort('Servicios activos','activeContractedCount',clientsSort,'setClientsSort')}<th>Acciones</th></tr></thead><tbody>${rows.map(clientRowHtml).join('')}</tbody></table></div>` : '<div class="empty">No hay clientes que coincidan. Añade el primero con el botón de arriba.</div>'}
  </div>`;
  const s = document.getElementById('clSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ clientsSearch=s.value; renderClients(); }, 300); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
}
function clientRowHtml(c){
  return `<tr class="clickable">
    <td onclick="openClientDetail('${c.id}')"><strong>${esc(c.name)}</strong></td>
    <td onclick="openClientDetail('${c.id}')">${esc(c.contactName||'—')}</td>
    <td onclick="openClientDetail('${c.id}')">${esc(c.email||'—')}</td>
    <td onclick="openClientDetail('${c.id}')">${esc(c.phone||'—')}</td>
    <td onclick="openClientDetail('${c.id}')">${stagePill(c.pipelineStage)}</td>
    <td onclick="openClientDetail('${c.id}')">${c.activeContractedCount}</td>
    <td><div class="row-actions"><button class="btn small" onclick="openClientModal('${c.id}')">Editar</button><button class="btn danger small" onclick="deleteClient('${c.id}')">Eliminar</button></div></td>
  </tr>`;
}
function clientFormHtml(c){
  return `<div class="form">
    <div class="field full"><label>Nombre / razón social</label><input id="clName" value="${esc(c.name||'')}" placeholder="Ej. Restaurante Casa Marta"></div>
    <div class="field"><label>Persona de contacto</label><input id="clContact" value="${esc(c.contactName||'')}"></div>
    <div class="field"><label>Etapa del pipeline</label><select id="clStage">${STAGES.map(s=>`<option value="${s.key}" ${((c.pipelineStage||'nuevo_lead')===s.key)?'selected':''}>${esc(s.label)}</option>`).join('')}</select></div>
    <div class="field"><label>Email</label><input id="clEmail" type="email" value="${esc(c.email||'')}"></div>
    <div class="field"><label>Teléfono</label><input id="clPhone" value="${esc(c.phone||'')}"></div>
    <div class="field"><label>NIF/CIF</label><input id="clTax" value="${esc(c.taxId||'')}"></div>
    <div class="field"><label>Página web</label><input id="clWebsite" value="${esc(c.websiteUrl||'')}" placeholder="ejemplo.rcpdigital.es"></div>
    <div class="field full"><label>Origen del lead</label><input id="clSource" value="${esc(c.source||'')}" placeholder="Ej. Referido, Instagram, Google..."></div>
    <div class="field full"><label>Dirección de facturación</label><input id="clAddress" value="${esc(c.billingAddress||'')}"></div>
    <div class="field full"><label>Notas</label><textarea id="clNotes">${esc(c.notes||'')}</textarea></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveClient('${c.id||''}')">${c.id?'Guardar cambios':'Crear cliente'}</button>
      ${c.id?`<button class="btn danger" onclick="deleteClient('${c.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
async function openClientModal(id, defaultStage){
  if(id){
    const data = await guarded(api('/clients/'+id));
    openModal('Editar cliente', clientFormHtml(data.item), {wide:true});
  } else {
    openModal('Nuevo cliente', clientFormHtml({pipelineStage: defaultStage || 'nuevo_lead'}), {wide:true});
  }
}
async function saveClient(id){
  const body = {
    name: textVal('clName'), contactName: textVal('clContact'), pipelineStage: document.getElementById('clStage').value,
    email: textVal('clEmail'), phone: textVal('clPhone'), taxId: textVal('clTax'), websiteUrl: textVal('clWebsite'), source: textVal('clSource'),
    billingAddress: textVal('clAddress'), notes: textVal('clNotes')
  };
  if(blockIfMissing([[body.name,'Nombre / razón social']])) return;
  if(id) await guarded(api('/clients/'+id, {method:'PUT', body}));
  else await guarded(api('/clients', {method:'POST', body}));
  toast(id?'Cliente actualizado':'Cliente creado');
  closeModal();
  const active = document.querySelector('.section.active').id;
  if(RENDERERS[active]) RENDERERS[active]();
}
async function deleteClient(id){
  if(!confirm('¿Eliminar este cliente? Se perderá su información de contacto (los contratos y cobros quedarán sin cliente asociado).')) return;
  await guarded(api('/clients/'+id, {method:'DELETE'}));
  toast('Cliente eliminado');
  closeModal();
  const active = document.querySelector('.section.active').id;
  if(RENDERERS[active]) RENDERERS[active]();
}
async function openClientDetail(id){
  const data = await guarded(api('/clients/'+id));
  const c = data.item;
  const activeServices = data.contracted.filter(s=>s.status==='Activo');
  const otherServices = data.contracted.filter(s=>s.status!=='Activo');
  const finishedStatuses = ['Entregado','Facturado','Cobrado'];
  const finishedProjects = (data.budgets||[]).filter(b=>finishedStatuses.includes(b.status));
  const openProjects = (data.budgets||[]).filter(b=>!finishedStatuses.includes(b.status) && b.status!=='Rechazado');
  const serviceRowHtml = s => `<tr class="clickable" onclick="closeModal();goToContracted('${s.id}')"><td>${esc(s.name)}</td><td>${esc(s.periodicity)}</td><td>${money(s.price)}</td><td>${contractedDateRangeText(s)}</td><td><span class="status ${s.status==='Activo'?'ok':s.status==='Pausado'?'warn':'bad'}">${esc(s.status)}</span></td></tr>`;
  const projectRowHtml = b => `<tr class="clickable" onclick="closeModal();goToProject('${b.id}')"><td>${esc(b.date||'—')}</td><td>${esc(b.service||'—')}</td><td>${money(b.price)}</td><td>${money(b.net)}</td><td><span class="status ${statusClass(b.status)}">${esc(b.status)}</span></td></tr>`;
  const invoiceRows = (data.invoices||[]).map(i=>`<tr><td><strong>${esc(i.number)}</strong></td><td>${esc(i.date)}</td><td>${money2(i.total)}</td><td><span class="status ${i.status==='Pagada'?'ok':i.status==='Anulada'?'bad':'warn'}">${esc(i.status)}</span></td><td><button class="btn small" onclick="openInvoicePreview('${i.id}')">Ver</button></td></tr>`).join('');
  const servicesSection = (activeServices.length || otherServices.length) ? `
    <div style="margin-top:16px">
      <p class="mini"><strong>Servicios activos (${activeServices.length})</strong></p>
      ${activeServices.length? `<div class="table-scroll"><table><thead><tr><th>Servicio</th><th>Periodicidad</th><th>Precio</th><th>Vigencia</th><th>Estado</th></tr></thead><tbody>${activeServices.map(serviceRowHtml).join('')}</tbody></table></div>` : '<p class="mini">Sin servicios activos ahora mismo.</p>'}
      ${otherServices.length? `<details style="margin-top:8px"><summary class="mini" style="cursor:pointer">Ver ${otherServices.length} servicio(s) pausado(s)/cancelado(s)</summary><div class="table-scroll"><table><thead><tr><th>Servicio</th><th>Periodicidad</th><th>Precio</th><th>Vigencia</th><th>Estado</th></tr></thead><tbody>${otherServices.map(serviceRowHtml).join('')}</tbody></table></div></details>` : ''}
    </div>` : '';
  const openProjectsSection = openProjects.length ? `
    <div style="margin-top:16px">
      <p class="mini"><strong>Proyectos en curso (${openProjects.length})</strong></p>
      <div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Precio</th><th>Beneficio neto</th><th>Estado</th></tr></thead><tbody>${openProjects.map(projectRowHtml).join('')}</tbody></table></div>
    </div>` : '';
  const finishedProjectsSection = finishedProjects.length ? `
    <div style="margin-top:16px">
      <p class="mini"><strong>Proyectos finalizados (${finishedProjects.length})</strong></p>
      <div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Precio</th><th>Beneficio neto</th><th>Estado</th></tr></thead><tbody>${finishedProjects.map(projectRowHtml).join('')}</tbody></table></div>
    </div>` : '';
  const invoicesSection = (data.invoices||[]).length ? `
    <div style="margin-top:16px">
      <p class="mini"><strong>Facturas (${data.invoices.length})</strong></p>
      <div class="table-scroll"><table><thead><tr><th>Nº</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${invoiceRows}</tbody></table></div>
    </div>` : '';
  openModal(c.name, `
    <div class="grid two">
      <div class="card soft">
        <div class="metric"><span>Etapa</span><strong>${stagePill(c.pipelineStage)}</strong></div>
        <div class="metric"><span>Contacto</span><strong>${esc(c.contactName||'—')}</strong></div>
        <div class="metric"><span>Email</span><strong>${esc(c.email||'—')}</strong></div>
        <div class="metric"><span>Teléfono</span><strong>${esc(c.phone||'—')}</strong></div>
        <div class="metric"><span>NIF/CIF</span><strong>${esc(c.taxId||'—')}</strong></div>
        <div class="metric"><span>Página web</span><strong>${c.websiteUrl?`<a href="#" onclick="return false" style="color:inherit;text-decoration:none">${esc(c.websiteUrl)}</a>`:'—'}</strong></div>
        ${websiteThumbnailHtml(c)}
      </div>
      <div class="card soft">
        <p class="mini"><strong>Resumen económico</strong></p>
        <div class="metric"><span>Ingresos mensuales recurrentes</span><strong>${c.monthlyValue?money(c.monthlyValue)+'/mes':'—'}</strong></div>
        <div class="metric"><span>Facturado (histórico)</span><strong>${money2(c.totalBilled||0)}</strong></div>
        <div class="metric"><span>Cobrado (histórico)</span><strong>${money2(c.totalCollected||0)}</strong></div>
        <div class="metric"><span>Beneficio neto en proyectos finalizados</span><strong>${money2(c.totalProjectsNet||0)}</strong></div>
        <p class="mini" style="margin-top:10px"><strong>Notas</strong></p>
        <p class="sub">${esc(c.notes)||'Sin notas.'}</p>
      </div>
    </div>
    ${servicesSection}${openProjectsSection}${finishedProjectsSection}${invoicesSection}
    <div class="row-actions full" style="margin-top:16px">
      <button class="btn primary" onclick="closeModal();openClientModal('${c.id}')">Editar cliente</button>
      <button class="btn" onclick="closeModal();show('contracted')">Ir a Contratos</button>
      <button class="btn ghost" onclick="closeModal()">Cerrar</button>
    </div>
  `, {wide:true});
}
// Desde la ficha de cliente: ir directamente al proyecto (presupuesto) o al
// servicio contratado correspondiente, ya con su formulario de edición abierto.
async function goToProject(budgetId){
  await show('budgets');
  await openBudgetModal(budgetId);
}
async function goToContracted(contractedId){
  await show('contracted');
  await openContractedModal(contractedId);
}
// La captura de miniatura solo está disponible dentro de la app de escritorio
// (usa una ventana offscreen de Electron); en el navegador simplemente no aparece.
// Se muestra como una miniatura pequeña y clicable; al hacer clic se amplía en un lightbox.
function websiteThumbnailHtml(c){
  if(!window.electronAPI || !c.websiteUrl) return '';
  const src = `/thumbnails/${c.id}.png?t=${Date.now()}`;
  return `<div class="thumb-block">
    <div class="split-title" style="margin-bottom:8px"><p class="mini" style="margin:0"><strong>Captura de la web</strong></p><button class="btn small ghost" onclick="captureClientThumbnail('${c.id}','${escAttr(c.websiteUrl)}')">📷 Actualizar</button></div>
    <div id="thumbWrap_${c.id}" class="thumb-frame small" onclick="expandThumbnail('${c.id}')">
      <img id="thumbImg_${c.id}" src="${src}" onerror="this.closest('.thumb-frame').innerHTML='<p class=&quot;mini&quot;>Sin captura todavía.</p>'">
    </div>
  </div>`;
}
function expandThumbnail(id){
  const img = document.getElementById('thumbImg_'+id);
  if(!img || !img.currentSrc) return;
  openModal('Captura de la web', `<div class="thumb-lightbox"><img src="${img.currentSrc}"></div>`);
}
async function captureClientThumbnail(id, url){
  if(!window.electronAPI) return;
  try{
    toast('Capturando la web, un momento...');
    await window.electronAPI.captureWebsite(id, url);
    const wrap = document.getElementById('thumbWrap_'+id);
    if(wrap) wrap.innerHTML = `<img src="/thumbnails/${id}.png?t=${Date.now()}">`;
    toast('Captura actualizada');
  }catch(e){ toast(e.message || 'No se pudo capturar la web', 'error'); }
}

/* ===================== Contratos (servicios activos por cliente) ===================== */
let editingContractedId = null;
const PERIODICITY_HELP = {
  Mensual: 'Se lo cobras cada mes. Se generarán cobros automáticos cada mes desde la fecha de inicio.',
  Anual: 'Se lo cobras una vez al año. Se genera un cobro automático cada año desde la fecha de inicio.',
  Puntual: 'Es un pago único, no recurrente. Se genera un solo cobro en la fecha de inicio.'
};
let contractedSearch = '';
let contractedStatusFilter = '';
let contractedSort = {key:'', dir:'asc'};
function matchesContractedSearch(s, cl, q){
  if(!q) return true;
  const needle = q.toLowerCase();
  return [cl?cl.name:'', s.name, s.periodicity, s.status].some(v=>String(v||'').toLowerCase().includes(needle));
}
function setContractedSort(key){ toggleSort(contractedSort, key); renderContracted(); }
async function renderContracted(){
  const [clientsRes, contractedRes] = await Promise.all([api('/clients'), api('/contracted')]);
  window.__clientsCache = clientsRes.items;
  let rows = contractedRes.items.filter(s=>matchesContractedSearch(s, clientsRes.items.find(c=>c.id===s.clientId), contractedSearch));
  if(contractedStatusFilter) rows = rows.filter(s=>s.status===contractedStatusFilter);
  const CONTRACTED_SORT_ACCESSORS = { clientName:s=>{ const cl=clientsRes.items.find(c=>c.id===s.clientId); return cl?cl.name:''; }, name:s=>s.name||'', periodicity:s=>s.periodicity||'', price:s=>num(s.price), status:s=>s.status||'' };
  rows = sortRows(rows, contractedSort, CONTRACTED_SORT_ACCESSORS);
  const el = document.getElementById('contracted');
  el.innerHTML = `
  <div class="card">
    <div class="toolbar-row">
      <div class="toolbar-left"><h3>Contratos activos por cliente</h3>
        <select id="csFilterStatus" onchange="contractedStatusFilter=this.value;renderContracted()">
          <option value="">Todos los estados</option>
          ${['Activo','Pausado','Cancelado'].map(s=>`<option value="${s}" ${contractedStatusFilter===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="searchbox"><input id="csSearch" placeholder="Buscar por cliente, servicio, estado..." value="${esc(contractedSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openContractedModal(null)">+ Nuevo contrato</button></div>
    </div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr>${thSort('Cliente','clientName',contractedSort,'setContractedSort')}${thSort('Servicio','name',contractedSort,'setContractedSort')}${thSort('Periodicidad','periodicity',contractedSort,'setContractedSort')}${thSort('Precio','price',contractedSort,'setContractedSort')}<th>Vigencia</th>${thSort('Estado','status',contractedSort,'setContractedSort')}<th>Acciones</th></tr></thead><tbody>${rows.map(s=>contractedRowHtml(s,clientsRes.items)).join('')}</tbody></table></div>` : (contractedRes.items.length ? '<div class="empty">Ningún contrato coincide con la búsqueda o el filtro.</div>' : '<div class="empty">Todavía no hay contratos. Crea el primero con el botón "+ Nuevo contrato" de arriba.</div>')}
  </div>`;
  const s = document.getElementById('csSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ contractedSearch=s.value; renderContracted(); }, 250); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
}
function contractedFormHtml(d, clients){
  const clientsOpts = `<option value="">Selecciona un cliente...</option>` + clients.map(c=>`<option value="${c.id}" ${d.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const periodicity = d.periodicity || 'Mensual';
  const priceLabel = periodicity==='Mensual' ? 'Precio que le cobras cada mes (€)' : periodicity==='Anual' ? 'Precio que le cobras cada año (€)' : 'Precio de este servicio puntual (€)';
  return `<div class="form">
    <div class="field"><label>Cliente</label><select id="csClient">${clientsOpts}</select></div>
    <div class="field"><label>¿Qué le llevas?</label><input id="csName" value="${esc(d.name||'')}" placeholder="Ej. Hosting y mantenimiento, Bono de 5h/mes, Gestión redes"></div>
    <div class="field"><label>Periodicidad</label><select id="csPeriodicity" onchange="onContractedPeriodicityChange()">${['Mensual','Anual','Puntual'].map(p=>`<option ${periodicity===p?'selected':''}>${p}</option>`).join('')}</select></div>
    <div class="field"><label id="csPriceLabel">${priceLabel}</label><input id="csPrice" type="number" step="1" value="${num(d.price)}"></div>
    <div class="field full"><p class="mini" id="csPeriodicityHelp" style="margin:-6px 0 0">${PERIODICITY_HELP[periodicity]}</p></div>
    <div class="field"><label>Fecha de inicio</label><input id="csStart" type="date" value="${esc(d.startDate || today())}"></div>
    <div class="field"><label>Fecha de fin (opcional)</label><input id="csEnd" type="date" value="${esc(d.endDate || '')}"></div>
    <div class="field"><label>Estado</label><select id="csStatus">${['Activo','Pausado','Cancelado'].map(s=>`<option ${d.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="field full"><label>Notas</label><textarea id="csNotes">${esc(d.notes||'')}</textarea></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveContracted('${d.id||''}')">${d.id?'Guardar cambios':'Crear contrato'}</button>
      ${d.id?`<button class="btn" onclick="closeModal();generateInvoiceFrom('contracted','${d.id}')">Generar factura</button>`:''}
      ${d.id?`<button class="btn danger" onclick="deleteContracted('${d.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
function onContractedPeriodicityChange(){
  const p = document.getElementById('csPeriodicity').value;
  document.getElementById('csPriceLabel').textContent = p==='Mensual' ? 'Precio que le cobras cada mes (€)' : p==='Anual' ? 'Precio que le cobras cada año (€)' : 'Precio de este servicio puntual (€)';
  document.getElementById('csPeriodicityHelp').textContent = PERIODICITY_HELP[p];
}
function contractedDateRangeText(s){
  if(!s.startDate) return '—';
  if(s.endDate) return `${esc(s.startDate)} → ${esc(s.endDate)}`;
  return s.status==='Activo' ? `Desde ${esc(s.startDate)} · en curso` : `Desde ${esc(s.startDate)}`;
}
function contractedRowHtml(s, clients){
  const cl = clients.find(c=>c.id===s.clientId);
  return `<tr class="clickable" onclick="openContractedModal('${s.id}')"><td>${esc(cl?cl.name:'Cliente eliminado')}</td><td>${esc(s.name)}</td><td>${esc(s.periodicity)}</td><td>${money(s.price)}</td><td>${contractedDateRangeText(s)}</td><td><span class="status ${s.status==='Activo'?'ok':s.status==='Pausado'?'warn':'bad'}">${esc(s.status)}</span></td><td><div class="row-actions" onclick="event.stopPropagation()"><button class="btn small" onclick="openContractedModal('${s.id}')">Editar</button><button class="btn small" onclick="generateInvoiceFrom('contracted','${s.id}')">Generar factura</button><button class="btn danger small" onclick="deleteContracted('${s.id}')">Eliminar</button></div></td></tr>`;
}
async function openContractedModal(id){
  const [clientsRes, contractedRes] = await Promise.all([api('/clients'), api('/contracted')]);
  editingContractedId = id || null;
  const d = id ? (contractedRes.items.find(x=>x.id===id) || {}) : {periodicity:'Mensual', status:'Activo', startDate:today(), price:0};
  openModal(id?'Editar contrato':'Nuevo contrato', contractedFormHtml(d, clientsRes.items), {wide:true});
}
async function editContracted(id){ await openContractedModal(id); }
async function saveContracted(id){
  const d = {
    clientId: document.getElementById('csClient')?.value || '',
    name: textVal('csName'),
    periodicity: document.getElementById('csPeriodicity')?.value || 'Mensual',
    price: val('csPrice'),
    startDate: document.getElementById('csStart')?.value || today(),
    endDate: document.getElementById('csEnd')?.value || '',
    status: document.getElementById('csStatus')?.value || 'Activo',
    notes: textVal('csNotes')
  };
  if(blockIfMissing([[d.clientId,'Cliente'],[d.name,'¿Qué le llevas?']])) return;
  if(id) await guarded(api('/contracted/'+id, {method:'PUT', body:d}));
  else await guarded(api('/contracted', {method:'POST', body:d}));
  toast('Contrato guardado');
  editingContractedId=null; closeModal();
  if(document.getElementById('contracted').classList.contains('active')) renderContracted();
}
async function deleteContracted(id){
  if(!confirm('¿Eliminar este contrato?')) return;
  await guarded(api('/contracted/'+id, {method:'DELETE'}));
  toast('Eliminado');
  if(editingContractedId===id) editingContractedId=null;
  closeModal();
  if(document.getElementById('contracted').classList.contains('active')) renderContracted();
}

/* ===================== Calculadora ===================== */
async function renderCalculator(){
  const [servicesRes, clientsRes] = await Promise.all([api('/services'), api('/clients')]);
  const activeServices = servicesRes.items.filter(s=>s.active);
  window.__calcServices = activeServices;
  window.__calcClients = clientsRes.items;
  const opts = activeServices.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const clientsOpts = `<option value="">Selecciona un cliente...</option>` + clientsRes.items.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const el = document.getElementById('calculator');
  el.innerHTML = `
  <div class="grid two">
    <div class="card">
      <h3>Simulador de proyecto</h3>
      <div class="form">
        <div class="field full"><label>Servicio base</label><select id="cService" onchange="loadCalc()">${opts}</select></div>
        <div class="field"><label>Cliente</label><select id="cClientId">${clientsOpts}</select></div>
        <div class="field"><label>Estado</label>${statusSelect('cStatus','Pendiente')}</div>
        ${numberField('cHours','Horas propias',0,.5)}
        ${numberField('cTool','Herramientas / hosting',0,1)}
        ${numberField('cSub','Subcontratación',0,1)}
        ${numberField('cAds','Publicidad',0,1)}
        ${numberField('cOther','Otros costes',0,1)}
        ${numberField('cIndirect','% indirectos',0,1)}
        ${numberField('cMargin','Margen deseado %',0,1)}
        ${numberField('cCommission','Comisión sobre beneficio %',0,1)}
        <div class="field"><label>Precio final sin IVA manual</label><input id="cManualPrice" type="number" step="5" oninput="updateCalc()" placeholder="Vacío = recomendado"></div>
        <div class="field full"><label>Notas</label><textarea id="cNotes" placeholder="Alcance, condiciones, observaciones..."></textarea></div>
        <button class="btn primary full" onclick="addBudgetFromCalc()">Guardar como presupuesto</button>
      </div>
    </div>
    <div class="card"><h3>Resultado económico</h3><div id="calcResult"></div></div>
  </div>`;
  loadCalc();
}
function numberField(id,label,value,step){return `<div class="field"><label>${label}</label><input id="${id}" type="number" step="${step}" value="${value}" oninput="updateCalc()"></div>`}
function statusSelect(id,selected){ return `<select id="${id}">${['Pendiente','En proceso','Aceptado','Rechazado','Entregado','Facturado','Cobrado'].map(s=>`<option ${selected===s?'selected':''}>${s}</option>`).join('')}</select>`; }
function loadCalc(){
  const s = window.__calcServices.find(x=>x.id === document.getElementById('cService')?.value) || window.__calcServices[0];
  if(!s){document.getElementById('calcResult').innerHTML='<div class="empty">Crea un servicio activo para empezar a calcular.</div>';return;}
  document.getElementById('cHours').value = s.hours;
  document.getElementById('cTool').value = s.tool;
  document.getElementById('cSub').value = s.sub;
  document.getElementById('cAds').value = s.ads;
  document.getElementById('cOther').value = s.other;
  document.getElementById('cIndirect').value = Math.round(s.indirectPct*100);
  document.getElementById('cMargin').value = Math.round(s.margin*100);
  document.getElementById('cCommission').value = Math.round(s.commissionPct*100);
  document.getElementById('cManualPrice').value = '';
  updateCalc();
}
function currentCalc(){
  const s = window.__calcServices.find(x=>x.id === document.getElementById('cService')?.value) || window.__calcServices[0] || {name:'',category:'',unit:''};
  const x = clientCalcService(s, CONFIG, FIXED, {hours:val('cHours'),tool:val('cTool'),sub:val('cSub'),ads:val('cAds'),other:val('cOther'),indirectPct:val('cIndirect')/100,margin:val('cMargin')/100,commissionPct:val('cCommission')/100});
  const manual = val('cManualPrice');
  if(manual>0){
    x.rec = manual; x.iva = manual*num(CONFIG.iva); x.priceIva = manual*(1+num(CONFIG.iva));
    x.gross = manual-x.total; x.com = Math.max(0,x.gross)*x.commissionPct; x.net = x.gross-x.com; x.netMargin = manual?x.net/manual:0;
  }
  return x;
}
function updateCalc(){
  const x = currentCalc();
  document.getElementById('calcResult').innerHTML = `
    <span class="pill">${esc(x.category)} - ${esc(x.unit)}</span>
    ${x.client?`<p class="mini" style="margin-top:8px">Perfil objetivo del servicio: ${esc(x.client)}</p>`:''}
    <div class="bigprice">${money(x.rec)}</div>
    <p class="sub">Precio sin IVA. Total con IVA: <strong>${money(x.priceIva)}</strong></p>
    <div class="metric"><span>Coste horas</span><strong>${money2(x.costHours)}</strong></div>
    <div class="metric"><span>Coste directo</span><strong>${money2(x.direct)}</strong></div>
    <div class="metric"><span>Costes indirectos</span><strong>${money2(x.indirect)}</strong></div>
    <div class="metric"><span>Amortización equipo (${pct(x.amortizationPct)})</span><strong>${money2(x.amortization)}</strong></div>
    <div class="metric"><span>Coste total</span><strong>${money2(x.total)}</strong></div>
    <div class="metric"><span>Beneficio bruto</span><strong>${money2(x.gross)}</strong></div>
    <div class="metric"><span>Comisión</span><strong>${money2(x.com)}</strong></div>
    <div class="metric"><span>Beneficio neto</span><strong>${money2(x.net)}</strong></div>
    <div class="metric"><span>Margen neto real</span><strong>${pct(x.netMargin)}</strong></div>
    <p class="mini">Fórmula: coste total = horas × coste/hora + costes directos + indirectos + amortización del equipo. Precio recomendado = coste total / (1 - margen), redondeado a ${money(CONFIG.rounding)}.</p>`;
}
async function addBudgetFromCalc(){
  const x = currentCalc();
  const clientId = document.getElementById('cClientId').value;
  if(blockIfMissing([[clientId,'Cliente']])) return;
  const body = {date:today(),clientId,service:x.name,category:x.category,price:x.rec,cost:x.total,status:document.getElementById('cStatus').value,charged:'No',commissionPct:x.commissionPct,notes:textVal('cNotes')};
  await guarded(api('/budgets', {method:'POST', body}));
  toast('Presupuesto creado'); show('budgets');
}

/* ===================== Catálogo de servicios ===================== */
let activeServiceFilter = 'Todos';
let editingServiceId = null;
let servicesSearch = '';
let servicesStatusFilter = '';
let servicesSort = 'name';
const SERVICES_SORT_ACCESSORS = { name:s=>s.name||'', rec:s=>num(s.rec), category:s=>s.category||'' };
async function renderServices(){
  const servicesRes = await api('/services');
  const list = servicesRes.items;
  const cats = ['Todos',...new Set(list.map(s=>s.category || 'Sin categoría'))];
  if(!cats.includes(activeServiceFilter)) activeServiceFilter = 'Todos';
  const needle = servicesSearch.toLowerCase();
  let filtered = list.filter(s=>(activeServiceFilter==='Todos' || s.category===activeServiceFilter)
    && (!needle || [s.name, s.client, s.category].some(v=>String(v||'').toLowerCase().includes(needle)))
    && (!servicesStatusFilter || (servicesStatusFilter==='Activo') === (s.active!==false)));
  filtered = sortRows(filtered, {key:servicesSort, dir:'asc'}, SERVICES_SORT_ACCESSORS);
  document.getElementById('services').innerHTML = `
  <div class="card">
    <div class="toolbar-row">
      <div class="toolbar-left"><h3>Catálogo de servicios</h3>
        <select id="svFilterStatus" onchange="servicesStatusFilter=this.value;renderServices()">
          <option value="">Activos e inactivos</option>
          <option value="Activo" ${servicesStatusFilter==='Activo'?'selected':''}>Solo activos</option>
          <option value="Inactivo" ${servicesStatusFilter==='Inactivo'?'selected':''}>Solo inactivos</option>
        </select>
        <select id="svSort" onchange="servicesSort=this.value;renderServices()">
          <option value="name" ${servicesSort==='name'?'selected':''}>Ordenar: nombre</option>
          <option value="rec" ${servicesSort==='rec'?'selected':''}>Ordenar: precio</option>
          <option value="category" ${servicesSort==='category'?'selected':''}>Ordenar: categoría</option>
        </select>
      </div>
      <div class="searchbox"><input id="svSearch" placeholder="Buscar servicio..." value="${esc(servicesSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openServiceModal(null)">+ Nuevo servicio</button></div>
    </div>
    <div class="tabs">${cats.map(c=>`<button class="${c===activeServiceFilter?'active':''}" onclick="activeServiceFilter='${escAttr(c)}';renderServices()">${esc(c)}</button>`).join('')}</div>
    <p class="mini" style="margin-bottom:12px">Pulsa sobre un servicio para editarlo.</p>
    <div class="catalog-grid">${filtered.length ? filtered.map(serviceCardHtml).join('') : '<div class="empty">No hay servicios que coincidan.</div>'}</div>
  </div>`;
  const s = document.getElementById('svSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ servicesSearch=s.value; renderServices(); }, 250); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
}
function serviceCardHtml(s){
  return `<div class="service-card" onclick="openServiceModal('${s.id}')">
    <div class="service-head">
      <div><h4>${esc(s.name)}</h4><p class="sub">${esc(s.client || 'Sin cliente tipo')}</p></div>
      <div class="price">${s.rec ? money(s.rec) : 'Personalizado'}</div>
    </div>
    <div class="toolbar"><span class="pill">${esc(s.category)}</span><span class="pill">${esc(s.unit)}</span><span class="pill">${s.hours} h</span><span class="pill">Neto ${money(s.net)}</span><span class="status ${s.active?'ok':'bad'}">${s.active?'Activo':'Inactivo'}</span></div>
    <div class="row-actions" onclick="event.stopPropagation()">
      <button class="btn small" onclick="duplicateService('${s.id}')">Duplicar</button>
      <button class="btn small" onclick="simulateService('${s.id}')">Simular</button>
      <button class="btn danger small" onclick="deleteService('${s.id}')">Eliminar</button>
    </div>
  </div>`;
}
function serviceFormHtml(s){
  return `<div class="form">
    <div class="field full"><label>Nombre del servicio</label><input id="sName" value="${esc(s.name||'')}"></div>
    <div class="field"><label>Cliente tipo</label><input id="sClient" value="${esc(s.client||'')}"></div>
    <div class="field"><label>Categoría</label><input id="sCategory" value="${esc(s.category||'General')}"></div>
    <div class="field"><label>Unidad</label><select id="sUnit">${['Proyecto','Mes','Hora','Único'].map(u=>`<option ${s.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
    ${plainNumber('sHours','Horas propias',s.hours,.5)}
    ${plainNumber('sTool','Herramientas / hosting',s.tool,1)}
    ${plainNumber('sSub','Subcontratación',s.sub,1)}
    ${plainNumber('sAds','Publicidad',s.ads,1)}
    ${plainNumber('sOther','Otros costes',s.other,1)}
    ${plainNumber('sIndirect','% indirectos',Math.round(num(s.indirectPct)*100),1)}
    ${plainNumber('sMargin','Margen %',Math.round(num(s.margin)*100),1)}
    ${plainNumber('sCommission','Comisión %',Math.round(num(s.commissionPct)*100),1)}
    <div class="field full"><label>Notas internas</label><textarea id="sNotes">${esc(s.notes||'')}</textarea></div>
    <div class="field"><label><input id="sActive" type="checkbox" ${s.active!==false?'checked':''}> Servicio activo</label></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveService('${s.id||''}')">${s.id?'Guardar cambios':'Crear servicio'}</button>
      ${s.id?`<button class="btn" onclick="duplicateService('${s.id}')">Duplicar</button>`:''}
      ${s.id?`<button class="btn danger" onclick="deleteService('${s.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
async function openServiceModal(id){
  editingServiceId = id;
  if(id){ const r = await guarded(api('/services/'+id)); openModal('Editar servicio', serviceFormHtml(r.item), {wide:true}); }
  else openModal('Nuevo servicio', serviceFormHtml({active:true, indirectPct: CONFIG.defaultIndirectPct}), {wide:true});
}
async function saveService(id){
  const body = { name:textVal('sName'), client:textVal('sClient'), category:textVal('sCategory') || 'General', unit:document.getElementById('sUnit').value,
    hours:val('sHours'), tool:val('sTool'), sub:val('sSub'), ads:val('sAds'), other:val('sOther'), indirectPct:val('sIndirect')/100, margin:val('sMargin')/100, commissionPct:val('sCommission')/100, active:checked('sActive'), notes:textVal('sNotes') };
  if(blockIfMissing([[body.name,'Nombre del servicio']])) return;
  if(id) await guarded(api('/services/'+id, {method:'PUT', body})); else await guarded(api('/services', {method:'POST', body}));
  toast('Servicio guardado'); closeModal(); renderServices();
}
async function duplicateService(id){
  const r = await guarded(api('/services/'+id));
  const s = r.item;
  const body = { name:s.name+' copia', client:s.client, category:s.category, unit:s.unit, hours:s.hours, tool:s.tool, sub:s.sub, ads:s.ads, other:s.other, indirectPct:s.indirectPct, margin:s.margin, commissionPct:s.commissionPct, active:s.active, notes:s.notes };
  await guarded(api('/services', {method:'POST', body}));
  toast('Servicio duplicado'); closeModal(); renderServices();
}
async function deleteService(id){
  if(!confirm('¿Eliminar este servicio?')) return;
  await guarded(api('/services/'+id, {method:'DELETE'}));
  toast('Servicio eliminado'); closeModal(); renderServices();
}
function simulateService(id){ closeModal(); show('calculator').then(()=>{ document.getElementById('cService').value=id; loadCalc(); }); }

/* ===================== Presupuestos ===================== */
let editingBudgetId = null;
let budgetsView = 'kanban';
const PROJECT_STATUSES = [
  {key:'Pendiente', color:'#64748b'}, {key:'Aceptado', color:'#2563eb'}, {key:'En proceso', color:'#b45309'},
  {key:'Entregado', color:'#7c3aed'}, {key:'Facturado', color:'#0891b2'}, {key:'Cobrado', color:'#15803d'},
  {key:'Rechazado', color:'#be123c'}
];
function projectStatusInfo(key){ return PROJECT_STATUSES.find(s=>s.key===key) || {key:key||'Pendiente', color:'#64748b'}; }
let budgetsSearch = '';
let budgetsStatusFilter = '';
let budgetsSort = {key:'', dir:'asc'};
const BUDGETS_SORT_ACCESSORS = { date:b=>b.date||'', client:b=>b.client||'', price:b=>num(b.price), net:b=>num(b.net), netMargin:b=>num(b.netMargin), status:b=>b.status||'' };
function setBudgetsSort(key){ toggleSort(budgetsSort, key); renderBudgets(); }
function matchesBudgetSearch(b, q){
  if(!q) return true;
  const needle = q.toLowerCase();
  return [b.client, b.service, b.category, b.status].some(v=>String(v||'').toLowerCase().includes(needle));
}
async function renderBudgets(){
  const budgetsRes = await api('/budgets');
  const all = budgetsRes.items;
  let rows = all.filter(b=>matchesBudgetSearch(b, budgetsSearch));
  if(budgetsStatusFilter) rows = rows.filter(b=>(b.status||'Pendiente')===budgetsStatusFilter);
  document.getElementById('budgets').innerHTML = `
  <div class="card">
    <div class="toolbar-row">
      <div class="toolbar-left">
        <div class="tabs">
          <button class="${budgetsView==='kanban'?'active':''}" onclick="budgetsView='kanban';renderBudgets()">Kanban</button>
          <button class="${budgetsView==='tabla'?'active':''}" onclick="budgetsView='tabla';renderBudgets()">Tabla</button>
        </div>
        <select id="bgFilterStatus" onchange="budgetsStatusFilter=this.value;renderBudgets()">
          <option value="">Todos los estados</option>
          ${PROJECT_STATUSES.map(s=>`<option value="${s.key}" ${budgetsStatusFilter===s.key?'selected':''}>${esc(s.key)}</option>`).join('')}
        </select>
      </div>
      <div class="searchbox"><input id="bgSearch" placeholder="Buscar por cliente, servicio, estado..." value="${esc(budgetsSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openBudgetModal(null)">+ Añadir proyecto</button></div>
    </div>
    ${budgetsView==='kanban' ? budgetsKanbanHtml(rows) : budgetsTableHtml(sortRows(rows, budgetsSort, BUDGETS_SORT_ACCESSORS), all.length)}
  </div>`;
  if(budgetsView==='kanban') wireBudgetsKanbanDragDrop();
  const s = document.getElementById('bgSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ budgetsSearch=s.value; renderBudgets(); }, 250); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
}
function budgetsTableHtml(rows, totalCount){
  if(rows.length) return `<div class="table-scroll"><table><thead><tr>${thSort('Fecha','date',budgetsSort,'setBudgetsSort')}${thSort('Cliente','client',budgetsSort,'setBudgetsSort')}<th>Servicio</th>${thSort('Precio','price',budgetsSort,'setBudgetsSort')}<th>Coste</th><th>Comisión</th>${thSort('Beneficio neto','net',budgetsSort,'setBudgetsSort')}${thSort('Margen','netMargin',budgetsSort,'setBudgetsSort')}${thSort('Estado','status',budgetsSort,'setBudgetsSort')}<th>Cobrado</th><th>Acciones</th></tr></thead><tbody>${rows.map(budgetRowHtml).join('')}</tbody></table></div>`;
  return (totalCount>0) ? '<div class="empty">Ningún proyecto coincide con la búsqueda o el filtro.</div>' : '<div class="empty">No hay proyectos registrados. Crea el primero con el botón "+ Añadir proyecto" de arriba.</div>';
}
function budgetsKanbanHtml(rows){
  return `<div class="kanban">${PROJECT_STATUSES.map(s=>{
    const items = rows.filter(b=>(b.status||'Pendiente')===s.key);
    const total = items.reduce((a,b)=>a+num(b.net),0);
    return `<div class="kanban-col" data-status="${esc(s.key)}">
      <div class="kanban-col-head">
        <span class="kanban-col-title"><span class="dot" style="background:${s.color}"></span>${esc(s.key)}</span>
        <span class="count">${items.length}</span>
      </div>
      <div class="kanban-col-value ${total>0?'':'zero'}">${items.length?'Beneficio neto '+money(total):'Sin proyectos'}</div>
      <div class="kanban-cards">${items.map(bkcardHtml).join('') || '<div class="mini" style="padding:8px">Sin proyectos</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}
function bkcardHtml(b){
  const s = projectStatusInfo(b.status);
  return `<div class="kcard" draggable="true" data-id="${b.id}" onclick="editBudget('${b.id}')" style="border-left-color:${s.color}">
    <div class="kcard-top"><h5>${esc(b.client||'Sin cliente')}</h5></div>
    <div class="kmeta"><span>${esc(b.service||'—')}</span></div>
    <div class="kcard-foot">
      <span class="kvalue">${money(b.price)}</span>
      <span class="mini">${b.charged==='Sí'?'Cobrado':''}</span>
    </div>
  </div>`;
}
function wireBudgetsKanbanDragDrop(){
  document.querySelectorAll('#budgets .kcard').forEach(card=>{
    card.addEventListener('dragstart', e=>{ e.stopPropagation(); e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', ()=>card.classList.remove('dragging'));
  });
  document.querySelectorAll('#budgets .kanban-col').forEach(col=>{
    col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('dragover'); });
    col.addEventListener('dragleave', ()=>col.classList.remove('dragover'));
    col.addEventListener('drop', async e=>{
      e.preventDefault(); col.classList.remove('dragover');
      const id = e.dataTransfer.getData('text/plain');
      const status = col.dataset.status;
      await guarded(api(`/budgets/${id}`, {method:'PUT', body:{status}}));
      toast('Proyecto movido a "'+status+'"');
      renderBudgets();
    });
  });
}
function budgetFormHtml(b, activeServices, clients){
  const matched = activeServices.find(s=>s.name===b.service);
  const isCustom = Boolean(b.service) && !matched;
  const clientsOpts = `<option value="">Selecciona un cliente...</option>` + clients.map(c=>`<option value="${c.id}" ${b.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  return `<div class="form compact">
    <div class="field"><label>Fecha</label><input id="bDate" type="date" value="${esc(b.date || today())}"></div>
    <div class="field"><label>Cliente</label><select id="bClient">${clientsOpts}</select></div>
    <div class="field"><label>Servicio</label>
      <select id="bServiceSelect" onchange="onBudgetServiceSelect()">
        <option value="">Selecciona un servicio...</option>
        ${activeServices.map(s=>`<option value="${s.id}" ${matched && matched.id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        <option value="__custom__" ${isCustom?'selected':''}>Otro / personalizado</option>
      </select>
    </div>
    <div class="field ${isCustom?'':'hide'}" id="bServiceCustomWrap"><label>Nombre del servicio</label><input id="bServiceCustom" value="${esc(isCustom?b.service:'')}"></div>
    <div class="field"><label>Categoría</label><input id="bCategory" value="${esc(b.category||'')}"></div>
    ${plainNumber('bPrice','Precio sin IVA',b.price,1)}
    ${plainNumber('bCost','Coste estimado',b.cost,1)}
    ${plainNumber('bCommission','Comisión %',Math.round(num(b.commissionPct)*100),1)}
    <div class="field"><label>Estado</label>${statusSelect('bStatus',b.status||'Pendiente')}</div>
    <div class="field"><label>Cobrado</label><select id="bCharged"><option ${b.charged==='No'?'selected':''}>No</option><option ${b.charged==='Sí'?'selected':''}>Sí</option></select></div>
    <div class="field full"><label>Notas</label><input id="bNotes" value="${esc(b.notes||'')}"></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveBudget('${b.id||''}')">${b.id?'Guardar cambios':'Crear proyecto'}</button>
      ${b.id?`<button class="btn" onclick="closeModal();generateInvoiceFrom('budget','${b.id}')">Generar factura</button>`:''}
      ${b.id?`<button class="btn danger" onclick="deleteBudget('${b.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
async function openBudgetModal(id){
  const [budgetsRes, servicesRes, clientsRes] = await Promise.all([api('/budgets'), api('/services'), api('/clients')]);
  const activeServices = servicesRes.items.filter(s=>s.active);
  window.__clientsCache = clientsRes.items;
  editingBudgetId = id || null;
  const b = id ? (budgetsRes.items.find(x=>x.id===id) || {date:today()}) : {date:today(), status:'Pendiente', charged:'No'};
  openModal(id?'Editar proyecto':'Añadir proyecto', budgetFormHtml(b, activeServices, clientsRes.items), {wide:true});
}
async function onBudgetServiceSelect(){
  const sel = document.getElementById('bServiceSelect').value;
  const wrap = document.getElementById('bServiceCustomWrap');
  if(sel === '__custom__'){ wrap.classList.remove('hide'); return; }
  wrap.classList.add('hide');
  const servicesRes = await api('/services');
  const s = servicesRes.items.find(x=>x.id===sel);
  if(s){
    document.getElementById('bCategory').value = s.category;
    document.getElementById('bPrice').value = Math.round(s.rec*100)/100;
    document.getElementById('bCost').value = Math.round(s.total*100)/100;
    document.getElementById('bCommission').value = Math.round(num(s.commissionPct)*100);
  }
}
function statusClass(s){return ['Aceptado','Cobrado','Facturado'].includes(s)?'ok':s==='Rechazado'?'bad':'warn'}
function budgetRowHtml(b){
  return `<tr><td>${esc(b.date)}</td><td>${esc(b.client)}</td><td>${esc(b.service)}</td><td>${money(b.price)}</td><td>${money(b.cost)}</td><td>${money(b.com)}</td><td>${money(b.net)}</td><td>${pct(b.netMargin)}</td><td><span class="status ${statusClass(b.status)}">${esc(b.status)}</span></td><td>${esc(b.charged)}</td><td><div class="row-actions"><button class="btn small" onclick="editBudget('${b.id}')">Editar</button><button class="btn small" onclick="generateInvoiceFrom('budget','${b.id}')">Generar factura</button><button class="btn danger small" onclick="deleteBudget('${b.id}')">Eliminar</button></div></td></tr>`;
}
async function editBudget(id){ await openBudgetModal(id); }
async function saveBudget(id){
  const sel = document.getElementById('bServiceSelect').value;
  let serviceName = '';
  if(sel === '__custom__') serviceName = textVal('bServiceCustom');
  else { const servicesRes = await api('/services'); const s = servicesRes.items.find(x=>x.id===sel); serviceName = s ? s.name : ''; }
  const body = {date:document.getElementById('bDate').value || today(), clientId:document.getElementById('bClient').value, service:serviceName, category:textVal('bCategory'), price:val('bPrice'), cost:val('bCost'), commissionPct:val('bCommission')/100, status:document.getElementById('bStatus').value, charged:document.getElementById('bCharged').value, notes:textVal('bNotes')};
  if(blockIfMissing([[body.clientId,'Cliente'],[body.service,'Servicio']])) return;
  if(id) await guarded(api('/budgets/'+id, {method:'PUT', body})); else await guarded(api('/budgets', {method:'POST', body}));
  toast('Proyecto guardado'); editingBudgetId=null; closeModal();
  if(document.getElementById('budgets').classList.contains('active')) renderBudgets();
}
async function deleteBudget(id){
  if(!confirm('¿Eliminar este proyecto?')) return;
  await guarded(api('/budgets/'+id, {method:'DELETE'}));
  if(editingBudgetId===id) editingBudgetId=null;
  toast('Eliminado'); closeModal();
  if(document.getElementById('budgets').classList.contains('active')) renderBudgets();
}

/* ===================== Facturas ===================== */
let editingInvoiceId = null;
function invoicePaid(i){ return (i.payments||[]).reduce((a,p)=>a+num(p.amount),0); }
let invoicesSearch = '';
let invoicesStatusFilter = '';
let invoicesSort = {key:'', dir:'asc'};
const INVOICES_SORT_ACCESSORS = { date:i=>i.date||'', clientName:i=>i.clientName||'', total:i=>num(i.total), status:i=>i.status||'' };
function setInvoicesSort(key){ toggleSort(invoicesSort, key); renderInvoices(); }
function matchesInvoiceSearch(i, q){
  if(!q) return true;
  const needle = q.toLowerCase();
  return [i.number, i.clientName, i.concept, i.status].some(v=>String(v||'').toLowerCase().includes(needle));
}
async function renderInvoices(){
  const [invoicesRes, clientsRes] = await Promise.all([api('/invoices'), api('/clients')]);
  const all = invoicesRes.items;
  window.__clientsCache = clientsRes.items;
  let rows = all.filter(i=>matchesInvoiceSearch(i, invoicesSearch));
  if(invoicesStatusFilter) rows = rows.filter(i=>i.status===invoicesStatusFilter);
  rows = sortRows(rows, invoicesSort, INVOICES_SORT_ACCESSORS);
  const notCancelled = all.filter(i=>i.status!=='Anulada');
  const total = notCancelled.reduce((a,i)=>a+num(i.total),0);
  const cobrado = notCancelled.reduce((a,i)=>a+invoicePaid(i),0);
  const pending = Math.max(0, total - cobrado);
  document.getElementById('invoices').innerHTML = `
  <div class="grid kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
    <div class="card kpi"><span>Facturado (no anulado)</span><strong>${money(total)}</strong><small>${notCancelled.length} facturas</small></div>
    <div class="card kpi"><span>Pendiente de cobro</span><strong>${money(pending)}</strong><small>${all.filter(i=>['Emitida','Parcial'].includes(i.status)).length} sin cobrar del todo</small></div>
    <div class="card kpi"><span>Cobrado</span><strong>${money(cobrado)}</strong><small>${all.filter(i=>i.status==='Pagada').length} facturas pagadas del todo</small></div>
  </div>
  <div class="card">
    <div class="toolbar-row">
      <div class="toolbar-left"><h3>Listado de facturas</h3>
        <select id="ivFilterStatus" onchange="invoicesStatusFilter=this.value;renderInvoices()">
          <option value="">Todos los estados</option>
          ${['Emitida','Parcial','Pagada','Anulada'].map(s=>`<option value="${s}" ${invoicesStatusFilter===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="searchbox"><input id="ivSearch" placeholder="Buscar por nº, cliente, concepto..." value="${esc(invoicesSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openInvoiceModal(null)">+ Nueva factura</button></div>
    </div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Nº</th>${thSort('Fecha','date',invoicesSort,'setInvoicesSort')}${thSort('Cliente','clientName',invoicesSort,'setInvoicesSort')}<th>Concepto / proyecto</th>${thSort('Total','total',invoicesSort,'setInvoicesSort')}<th>Cobro</th>${thSort('Estado','status',invoicesSort,'setInvoicesSort')}<th></th></tr></thead><tbody>${rows.map(invoiceRowHtml).join('')}</tbody></table></div>` : (all.length ? '<div class="empty">Ninguna factura coincide con la búsqueda o el filtro.</div>' : '<div class="empty">No hay facturas todavía. Se generan solas desde tus contratos activos, o genera una desde un proyecto, o crea una manual con el botón de arriba.</div>')}
  </div>`;
  const s = document.getElementById('ivSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ invoicesSearch=s.value; renderInvoices(); }, 250); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
}
function invoiceFormHtml(d, clients, services){
  const clientsOpts = `<option value="">Selecciona un cliente...</option>` + clients.map(c=>`<option value="${c.id}" ${d.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const sourceLabel = d.sourceType==='contracted' ? 'Servicio contratado' : d.sourceType==='budget' ? 'Proyecto' : '';
  const sourceLinkHtml = (d.id && sourceLabel && d.sourceId) ? `<div class="field full">
      <label>Origen de esta factura</label>
      <button type="button" class="btn ghost small" style="width:fit-content" onclick="${d.sourceType==='contracted'?`closeModal();goToContracted('${d.sourceId}')`:`closeModal();goToProject('${d.sourceId}')`}">${icon('link')}${sourceLabel}: ${esc(d.concept||'')}</button>
    </div>` : '';
  const catalogOpts = `<option value="">Añadir servicio del catálogo...</option>` + (services||[]).filter(s=>s.active!==false).map(s=>`<option value="${s.id}">${esc(s.name)} — ${money2(s.rec)}</option>`).join('');
  return `<div class="form">
    <div class="field"><label>Cliente</label><select id="ivClient" onchange="onInvoiceClientChange()">${clientsOpts}</select></div>
    <div class="field"><label>Fecha</label><input id="ivDate" type="date" value="${esc(d.date||today())}"></div>
    <div class="field full"><label>Concepto (resumen para el listado)</label><input id="ivConcept" value="${esc(d.concept||'')}" placeholder="Se rellena solo con las líneas de abajo, pero puedes escribir el tuyo"></div>
    <div class="field full" id="ivSourceItemsWrap"></div>
    ${sourceLinkHtml}
    <div class="field full">
      <label>Líneas de la factura</label>
      <p class="mini" style="margin:0 0 8px">Añade tantas líneas como necesites: servicios de tu catálogo o conceptos manuales (ej. una instalación puntual que no esté en el catálogo). El total se calcula solo.</p>
      <div class="ivlines-toolbar">
        <select id="ivCatalogPick">${catalogOpts}</select>
        <button type="button" class="btn ghost small" onclick="addCatalogServiceLine()">+ Del catálogo</button>
        <button type="button" class="btn ghost small" onclick="addInvoiceLine()">+ Línea manual</button>
      </div>
      <div id="ivLinesWrap"></div>
    </div>
    <input type="hidden" id="ivBase" value="${num(d.baseAmount)}">
    ${plainNumber('ivIva','IVA %',Math.round(num(d.ivaPct ?? (CONFIG?.iva ?? .21))*100),1)}
    <div class="field"><label>Estado</label><select id="ivStatus">${['Emitida','Anulada'].map(s=>`<option ${(d.status===s || (d.status!=='Anulada' && s==='Emitida'))?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="field full"><p class="mini" style="margin:-6px 0 0">El estado "Pagada"/"Parcial" se calcula solo según los pagos que registres. Aquí solo se elige si la factura está activa o anulada.</p></div>
    <div class="field full"><label>Notas internas</label><input id="ivNotes" value="${esc(d.notes||'')}"></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveInvoice('${d.id||''}')">${d.id?'Guardar cambios':'Crear factura'}</button>
      ${d.id?`<button class="btn danger" onclick="deleteInvoice('${d.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
/* ===== Líneas de la factura manual (varios servicios/conceptos en una misma factura) =====
   El DOM es la fuente de verdad mientras se edita (para no perder el foco al escribir);
   invoiceLines solo se usa para sembrar las filas al abrir el modal o al añadir/quitar una. */
let invoiceLines = [];
function invoiceLinesHtml(lines){
  if(!lines.length) return '<p class="mini">Añade al menos una línea.</p>';
  const rows = lines.map((l,i)=>`
    <div class="ivline-row" data-i="${i}">
      <input id="ivLineConcept_${i}" value="${esc(l.concept||'')}" placeholder="Servicio o descripción" oninput="recalcInvoiceLines()">
      <input id="ivLineQty_${i}" type="number" min="0" step="1" value="${num(l.qty)||1}" oninput="recalcInvoiceLines()">
      <input id="ivLinePrice_${i}" type="number" min="0" step="0.01" value="${Math.round(num(l.unitPrice)*100)/100}" oninput="recalcInvoiceLines()">
      <span id="ivLineAmount_${i}" class="ivline-amount">${money2(num(l.qty||1)*num(l.unitPrice))}</span>
      <button type="button" class="icon-btn danger" title="Quitar línea" onclick="removeInvoiceLine(${i})">${icon('trash')}</button>
    </div>`).join('');
  return `<div class="ivlines-head"><span>Concepto</span><span>Cant.</span><span>Precio (€)</span><span>Importe</span><span></span></div>${rows}`;
}
function renderInvoiceLines(){
  const wrap = document.getElementById('ivLinesWrap');
  if(!wrap) return;
  wrap.innerHTML = invoiceLinesHtml(invoiceLines);
  recalcInvoiceLines();
}
function readInvoiceLinesFromDom(){
  const rows = document.querySelectorAll('#ivLinesWrap .ivline-row');
  return Array.from(rows).map(r=>{
    const i = r.dataset.i;
    const prev = invoiceLines[i] || {};
    return {
      concept: document.getElementById('ivLineConcept_'+i)?.value || '',
      qty: num(document.getElementById('ivLineQty_'+i)?.value) || 1,
      unitPrice: num(document.getElementById('ivLinePrice_'+i)?.value),
      sourceKey: prev.sourceKey // conserva el vínculo con el proyecto/contrato marcado arriba, si lo hay
    };
  });
}
function recalcInvoiceLines(){
  let total = 0;
  document.querySelectorAll('#ivLinesWrap .ivline-row').forEach(r=>{
    const i = r.dataset.i;
    const qty = num(document.getElementById('ivLineQty_'+i)?.value) || 0;
    const price = num(document.getElementById('ivLinePrice_'+i)?.value) || 0;
    const amt = qty*price;
    const amtEl = document.getElementById('ivLineAmount_'+i);
    if(amtEl) amtEl.textContent = money2(amt);
    total += amt;
  });
  const baseEl = document.getElementById('ivBase');
  if(baseEl) baseEl.value = Math.round(total*100)/100;
}
function addInvoiceLine(prefill){
  invoiceLines = readInvoiceLinesFromDom();
  invoiceLines.push(prefill || {concept:'', qty:1, unitPrice:0});
  renderInvoiceLines();
}
function removeInvoiceLine(i){
  invoiceLines = readInvoiceLinesFromDom();
  invoiceLines.splice(Number(i),1);
  renderInvoiceLines();
}
function addCatalogServiceLine(){
  const sel = document.getElementById('ivCatalogPick');
  if(!sel || !sel.value) return;
  const svc = (window.__servicesCache||[]).find(s=>s.id===sel.value);
  sel.value = '';
  if(!svc) return;
  addInvoiceLine({concept: svc.name, qty:1, unitPrice: Math.round(num(svc.rec)*100)/100});
}
function invoiceStatusClass(s){ return s==='Pagada'?'ok':s==='Anulada'?'bad':s==='Parcial'?'info':'warn'; }
/* ===== Juntar varios proyectos/contratos sin facturar en una misma factura manual =====
   Al elegir un cliente en el formulario de factura, se muestran sus proyectos sin
   facturar todavía y sus contratos activos como checkboxes; al marcar varios, el
   concepto y la base imponible se rellenan solos sumando lo seleccionado, así no
   hace falta crear una factura por cada proyecto/contrato del mismo cliente. */
let invoiceSourceSelection = [];
function invoiceSourceItemsHtml(budgets, contracted, selection){
  if(!budgets.length && !contracted.length) return '';
  const selectedKeys = new Set(selection.map(x=>x.type+':'+x.id));
  const itemRow = (type, id, label, sub, amount) => {
    const checked = selectedKeys.has(type+':'+id) ? 'checked' : '';
    return `<label class="ivsrc-item"><input type="checkbox" ${checked} onchange="toggleInvoiceSource(this,'${type}','${id}','${escAttr(label)}',${num(amount)})"><span>${esc(label)} <span class="mini">${esc(sub)}</span></span><strong>${money2(amount)}</strong></label>`;
  };
  const budgetRows = budgets.map(b=>itemRow('budget', b.id, b.service||'Proyecto', `Proyecto · ${b.status}`, b.price)).join('');
  const contractedRows = contracted.map(cs=>itemRow('contracted', cs.id, cs.name||'Servicio', `Contrato · ${cs.periodicity}`, cs.price)).join('');
  return `<div class="ivsrc-box">
    <p class="mini" style="margin:0 0 8px"><strong>Proyectos y contratos de este cliente</strong> — marca los que quieras juntar en esta misma factura.</p>
    ${budgetRows||contractedRows ? `${budgetRows}${contractedRows}` : '<p class="mini">Este cliente no tiene proyectos sin facturar ni contratos activos.</p>'}
  </div>`;
}
async function onInvoiceClientChange(resetSelection){
  const clientId = document.getElementById('ivClient')?.value || '';
  const wrap = document.getElementById('ivSourceItemsWrap');
  if(!wrap) return;
  if(resetSelection!==false){
    invoiceSourceSelection = [];
    // Al cambiar de cliente se sueltan las líneas que venían de proyectos/contratos
    // del cliente anterior; las líneas manuales o de catálogo que haya escrito se conservan.
    invoiceLines = readInvoiceLinesFromDom().filter(l=>!l.sourceKey);
    renderInvoiceLines();
  }
  if(!clientId){ wrap.innerHTML=''; return; }
  wrap.innerHTML = '<p class="mini">Buscando proyectos y contratos del cliente...</p>';
  try{
    const r = await api('/clients/'+clientId);
    const editingId = editingInvoiceId;
    const invoicedBudgetIds = new Set();
    (r.invoices||[]).forEach(inv=>{
      if(inv.id===editingId) return; // no ocultar lo que ya pertenece a esta misma factura
      if(inv.sourceType==='budget' && inv.sourceId) invoicedBudgetIds.add(inv.sourceId);
      (inv.sourceRefs||[]).forEach(ref=>{ if(ref.type==='budget') invoicedBudgetIds.add(ref.id); });
    });
    const unbilledBudgets = (r.budgets||[]).filter(b=>b.status!=='Rechazado' && !invoicedBudgetIds.has(b.id));
    const activeContracted = (r.contracted||[]).filter(cs=>cs.status==='Activo');
    wrap.innerHTML = invoiceSourceItemsHtml(unbilledBudgets, activeContracted, invoiceSourceSelection);
  }catch(e){ wrap.innerHTML=''; }
}
function toggleInvoiceSource(el, type, id, label, amount){
  const key = type+':'+id;
  if(el.checked){
    if(!invoiceSourceSelection.some(x=>x.type===type && x.id===id)) invoiceSourceSelection.push({type,id,label,amount:num(amount)});
    invoiceLines = readInvoiceLinesFromDom();
    // Quita una posible línea inicial totalmente vacía para no dejar una fila en blanco de sobra.
    invoiceLines = invoiceLines.filter(l => (l.concept||'').trim() || num(l.unitPrice));
    invoiceLines.push({concept: label, qty: 1, unitPrice: num(amount), sourceKey: key});
  } else {
    invoiceSourceSelection = invoiceSourceSelection.filter(x=>!(x.type===type && x.id===id));
    invoiceLines = readInvoiceLinesFromDom().filter(l => l.sourceKey !== key);
  }
  renderInvoiceLines();
}
/* Abre la previsualización de la factura (misma vista imprimible de siempre).
   Dentro de esa ventana, si es la app de escritorio, aparece además un botón
   "Guardar PDF" que guarda el archivo directamente sin pasar por el diálogo
   de impresión del sistema — ver server/routes/invoices.js (/:id/print). */
function openInvoicePreview(id){
  window.open('/api/invoices/'+id+'/print','_blank');
}
function invoiceSourceLinkHtml(i){
  const concept = esc(i.concept || '—');
  if(i.sourceType==='contracted' && i.sourceId) return `<button class="row-link" onclick="event.stopPropagation();goToContracted('${i.sourceId}')">${concept}</button><span class="row-sub">Servicio contratado</span>`;
  if(i.sourceType==='budget' && i.sourceId) return `<button class="row-link" onclick="event.stopPropagation();goToProject('${i.sourceId}')">${concept}</button><span class="row-sub">Proyecto</span>`;
  if(Array.isArray(i.sourceRefs) && i.sourceRefs.length){
    const links = i.sourceRefs.map(ref=>`<button class="row-link" onclick="event.stopPropagation();${ref.type==='contracted'?'goToContracted':'goToProject'}('${ref.id}')">${esc(ref.label)}</button>`).join(', ');
    return `${links}<span class="row-sub">${i.sourceRefs.length} elementos juntados</span>`;
  }
  return `${concept}<span class="row-sub">Factura manual</span>`;
}
function invoiceRowHtml(i){
  const paid = invoicePaid(i);
  const pct2 = i.total>0 ? Math.min(100, Math.round((paid/i.total)*100)) : 0;
  const showBar = i.status!=='Anulada';
  return `<tr><td><strong>${esc(i.number)}</strong></td><td>${esc(i.date)}</td><td>${esc(i.clientName)}</td><td>${invoiceSourceLinkHtml(i)}</td><td><strong>${money2(i.total)}</strong></td>
    <td>${showBar?`<div class="pbar-wrap"><div class="pbar"><b style="width:${pct2}%"></b></div><span class="pbar-label">${money2(paid)} / ${money2(i.total)}</span></div>`:'—'}</td>
    <td><span class="status ${invoiceStatusClass(i.status)}">${esc(i.status)}</span></td>
    <td><div class="icon-actions">
      <button class="icon-btn" title="Previsualizar factura" onclick="openInvoicePreview('${i.id}')">${icon('eye')}</button>
      ${i.status!=='Anulada'?`<button class="icon-btn" title="Pagos" onclick="openInvoicePayments('${i.id}')">${icon('coins')}</button>`:''}
      <button class="icon-btn" title="Editar" onclick="openInvoiceModal('${i.id}')">${icon('edit')}</button>
      <button class="icon-btn danger" title="Eliminar" onclick="deleteInvoice('${i.id}')">${icon('trash')}</button>
    </div></td></tr>`;
}
async function openInvoiceModal(id){
  const [invoicesRes, clientsRes, servicesRes] = await Promise.all([api('/invoices'), api('/clients'), api('/services')]);
  window.__clientsCache = clientsRes.items;
  window.__servicesCache = servicesRes.items;
  editingInvoiceId = id || null;
  const d = id ? (invoicesRes.items.find(x=>x.id===id) || {}) : {date:today(), ivaPct: CONFIG?.iva ?? .21, status:'Emitida'};
  invoiceSourceSelection = (d.sourceRefs||[]).slice();
  // Semilla de líneas: si la factura ya tiene líneas, se usan tal cual; si es una
  // factura antigua (o generada automáticamente desde un contrato/proyecto) con solo
  // concepto+base, se convierte en una única línea para poder seguir editándola aquí;
  // si es nueva, se empieza con una línea vacía.
  invoiceLines = (d.lines && d.lines.length) ? d.lines.map(l=>({concept:l.concept||'', qty:num(l.qty)||1, unitPrice:num(l.unitPrice)}))
    : (d.id ? [{concept:d.concept||'', qty:1, unitPrice:num(d.baseAmount)}] : [{concept:'', qty:1, unitPrice:0}]);
  openModal(id?'Editar factura':'Nueva factura manual', invoiceFormHtml(d, clientsRes.items, servicesRes.items), {wide:true});
  renderInvoiceLines();
  if(d.clientId) onInvoiceClientChange(false);
}
async function editInvoice(id){ await openInvoiceModal(id); }
async function setInvoiceCancelled(id,cancel){
  if(cancel && !confirm('¿Anular esta factura? Se mantiene en el listado pero deja de contar como pendiente de cobro.')) return;
  await guarded(api('/invoices/'+id,{method:'PUT', body:{status: cancel?'Anulada':'Emitida'}}));
  toast(cancel?'Factura anulada':'Factura reabierta'); renderInvoices();
}
async function saveInvoice(id){
  const lines = readInvoiceLinesFromDom()
    .map(l=>({concept:(l.concept||'').trim(), qty:num(l.qty)||1, unitPrice:num(l.unitPrice)}))
    .filter(l=>l.concept || l.unitPrice);
  let concept = textVal('ivConcept');
  if(!concept) concept = lines.map(l=>l.concept).filter(Boolean).join(' + ');
  const body = {
    clientId: document.getElementById('ivClient').value||'', date: document.getElementById('ivDate').value||today(),
    concept, ivaPct: val('ivIva')/100,
    status: document.getElementById('ivStatus').value, notes: textVal('ivNotes'),
    sourceRefs: invoiceSourceSelection.slice(), lines
  };
  if(blockIfMissing([[body.clientId,'Cliente'],[lines.length?'ok':'','Al menos una línea con concepto o importe'],[concept,'Concepto']])) return;
  if(id) await guarded(api('/invoices/'+id, {method:'PUT', body})); else await guarded(api('/invoices', {method:'POST', body}));
  toast('Factura guardada'); editingInvoiceId=null; invoiceSourceSelection=[]; invoiceLines=[]; closeModal();
  if(document.getElementById('invoices').classList.contains('active')) renderInvoices();
}
async function deleteInvoice(id){
  if(!confirm('¿Eliminar esta factura? Si ya se la enviaste al cliente, mejor márcala como "Anulada" en vez de borrarla.')) return;
  await guarded(api('/invoices/'+id, {method:'DELETE'}));
  if(editingInvoiceId===id) editingInvoiceId=null;
  toast('Eliminada'); closeModal();
  if(document.getElementById('invoices').classList.contains('active')) renderInvoices();
}
async function generateInvoiceFrom(sourceType, sourceId){
  if(!confirm('¿Generar una factura a partir de esto? Podrás revisarla y editarla antes de imprimirla.')) return;
  const r = await guarded(api('/invoices/generate', {method:'POST', body:{sourceType, sourceId}}));
  toast('Factura '+r.item.number+' creada');
  window.open('/api/invoices/'+r.item.id+'/print', '_blank');
  show('invoices');
}

/* --- Pagos parciales de una factura (modal) --- */
async function openInvoicePayments(id){
  const r = await guarded(api('/invoices/'+id));
  renderInvoicePaymentsModal(r.item);
}
function renderInvoicePaymentsModal(inv){
  const paid = invoicePaid(inv);
  const pending = Math.max(0, num(inv.total) - paid);
  const pct2 = inv.total>0 ? Math.min(100, Math.round((paid/inv.total)*100)) : 0;
  const payments = inv.payments||[];
  openModal(`Pagos — Factura ${inv.number}`, `
    <div class="metric"><span>Total factura</span><strong>${money2(inv.total)}</strong></div>
    <div class="metric"><span>Cobrado</span><strong>${money2(paid)}</strong></div>
    <div class="metric"><span>Pendiente</span><strong>${money2(pending)}</strong></div>
    <div class="pbar" style="height:8px;margin:10px 0 16px"><b style="width:${pct2}%"></b></div>
    ${payments.length ? payments.map(p=>`<div class="payment-row">
      <div><strong>${money2(p.amount)}</strong> <span class="mini">${esc(p.date)}${p.method?' · '+esc(p.method):''}</span>${p.notes?`<div class="mini">${esc(p.notes)}</div>`:''}</div>
      <button class="btn danger small" onclick="deleteInvoicePayment('${inv.id}','${p.id}')">Quitar</button>
    </div>`).join('') : '<p class="mini">Todavía no hay pagos registrados.</p>'}
    ${pending>0 ? `
    <div class="form" style="margin-top:16px">
      <div class="field"><label>Fecha del pago</label><input id="payDate" type="date" value="${today()}"></div>
      ${plainNumber('payAmount','Importe (€)', Math.round(pending*100)/100, 1)}
      <div class="field"><label>Método</label><select id="payMethod">${['Transferencia','Bizum','Efectivo','Tarjeta','Otro'].map(m=>`<option>${m}</option>`).join('')}</select></div>
      <div class="field full"><label>Notas</label><input id="payNotes" placeholder="Opcional"></div>
      <div class="row-actions full"><button class="btn primary" onclick="addInvoicePayment('${inv.id}')">Registrar pago</button></div>
    </div>` : '<p class="mini" style="margin-top:12px;color:var(--ok);font-weight:700">Factura cobrada del todo.</p>'}
    <div class="row-actions full" style="margin-top:16px">
      <button class="btn" onclick="window.open('/api/invoices/${inv.id}/print','_blank')">Ver / PDF</button>
      <button class="btn ghost" onclick="closeModal()">Cerrar</button>
    </div>
  `);
}
async function addInvoicePayment(invoiceId){
  const body = { date: document.getElementById('payDate').value||today(), amount: val('payAmount'), method: document.getElementById('payMethod').value, notes: textVal('payNotes') };
  if(blockIfMissing([[body.amount>0?1:'','Importe (mayor que 0)']])) return;
  const r = await guarded(api('/invoices/'+invoiceId+'/payments', {method:'POST', body}));
  toast('Pago registrado');
  renderInvoicePaymentsModal(r.item);
  renderInvoices();
}
async function deleteInvoicePayment(invoiceId, paymentId){
  if(!confirm('¿Quitar este pago?')) return;
  const r = await guarded(api('/invoices/'+invoiceId+'/payments/'+paymentId, {method:'DELETE'}));
  toast('Pago eliminado');
  renderInvoicePaymentsModal(r.item);
  renderInvoices();
}

/* ===================== Costes y precios ===================== */
// "Costes fijos" y "Configuración de precios" viven en un único punto del menú
// (Finanzas > Costes y precios) con dos pestañas, en vez de dos entradas
// separadas: son las dos caras de lo mismo (lo que determina tu coste/hora y
// tus precios) y así se editan y se consultan juntos.
let pricingTab = 'costs';
async function renderPricing(){
  document.getElementById('pricing').innerHTML = `
  <div class="tabs" style="margin-bottom:14px">
    <button class="${pricingTab==='costs'?'active':''}" onclick="switchPricingTab('costs')">Costes fijos</button>
    <button class="${pricingTab==='config'?'active':''}" onclick="switchPricingTab('config')">Parámetros de precio</button>
  </div>
  <div id="pricingBody"></div>`;
  if(pricingTab==='config') await renderConfig(); else await renderCosts();
}
function switchPricingTab(tab){ pricingTab = tab; renderPricing(); }

let editingFixedId = null;
let costsSearch = '';
let costsStatusFilter = '';
let costsSort = {key:'', dir:'asc'};
const COSTS_SORT_ACCESSORS = { concept:f=>f.concept||'', group:f=>f.group||'', provider:f=>f.provider||'', monthly:f=>num(f.monthly), active:f=>f.active!==false?1:0 };
function setCostsSort(key){ toggleSort(costsSort, key); renderCosts(); }
function matchesFixedSearch(f, q){
  if(!q) return true;
  const needle = q.toLowerCase();
  return [f.concept, f.group, f.provider].some(v=>String(v||'').toLowerCase().includes(needle));
}
async function renderCosts(){
  const [fixedRes, dashRes] = await Promise.all([api('/costs'), api('/dashboard')]);
  FIXED = fixedRes.items;
  let rows = fixedRes.items.filter(f=>matchesFixedSearch(f, costsSearch));
  if(costsStatusFilter) rows = rows.filter(f=>(costsStatusFilter==='Activo') === (f.active!==false));
  rows = sortRows(rows, costsSort, COSTS_SORT_ACCESSORS);
  document.getElementById('pricingBody').innerHTML = `
  <div class="card">
    <h3>Resumen de costes</h3>
    <div class="bigprice">${money(dashRes.activeFixedCosts)}</div>
    <p class="sub">Total mensual activo. Este importe entra automáticamente en el cálculo del coste/hora.</p>
    <div class="grid kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px">
      <div class="metric"><span>Coste anual activo</span><strong>${money(dashRes.activeFixedCosts*12)}</strong></div>
      <div class="metric"><span>Coste/hora actual</span><strong>${money2(dashRes.costHour)}</strong></div>
      <div class="metric"><span>Costes registrados</span><strong>${fixedRes.items.length}</strong></div>
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="toolbar-row">
      <div class="toolbar-left"><h3>Listado de costes fijos</h3>
        <select id="fFilterStatus" onchange="costsStatusFilter=this.value;renderCosts()">
          <option value="">Activos e inactivos</option>
          <option value="Activo" ${costsStatusFilter==='Activo'?'selected':''}>Solo activos</option>
          <option value="Inactivo" ${costsStatusFilter==='Inactivo'?'selected':''}>Solo inactivos</option>
        </select>
      </div>
      <div class="searchbox"><input id="fSearch" placeholder="Buscar por concepto, grupo, proveedor..." value="${esc(costsSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openFixedModal(null)">+ Nuevo coste</button></div>
    </div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr>${thSort('Concepto','concept',costsSort,'setCostsSort')}${thSort('Grupo','group',costsSort,'setCostsSort')}${thSort('Proveedor','provider',costsSort,'setCostsSort')}${thSort('Mes','monthly',costsSort,'setCostsSort')}<th>Año</th>${thSort('Estado','active',costsSort,'setCostsSort')}<th>Acciones</th></tr></thead><tbody>${rows.map(fixedRowHtml).join('')}</tbody></table></div>` : (fixedRes.items.length ? '<div class="empty">Ningún coste coincide con la búsqueda o el filtro.</div>' : '<div class="empty">No hay costes fijos todavía. Añade el primero con el botón de arriba.</div>')}
  </div>`;
  const s = document.getElementById('fSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ costsSearch=s.value; renderCosts(); }, 250); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
}
function fixedFormHtml(f){
  return `<div class="form">
    <div class="field full"><label>Concepto</label><input id="fConcept" value="${esc(f.concept||'')}"></div>
    <div class="field"><label>Grupo</label><input id="fGroup" value="${esc(f.group||'General')}"></div>
    <div class="field"><label>Proveedor</label><input id="fProvider" value="${esc(f.provider||'')}"></div>
    ${plainNumber('fMonthly','Coste mensual',f.monthly,1)}
    <div class="field"><label><input id="fActive" type="checkbox" ${f.active!==false?'checked':''}> Incluir en coste/hora</label></div>
    <div class="field full"><label>Notas</label><textarea id="fNotes">${esc(f.notes||'')}</textarea></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveFixed('${f.id||''}')">${f.id?'Guardar cambios':'Crear coste'}</button>
      ${f.id?`<button class="btn danger" onclick="deleteFixed('${f.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
function fixedRowHtml(f){
  return `<tr class="clickable" onclick="openFixedModal('${f.id}')"><td>${esc(f.concept)}</td><td>${esc(f.group)}</td><td>${esc(f.provider)}</td><td>${money(f.monthly)}</td><td>${money(num(f.monthly)*12)}</td><td><span class="status ${f.active?'ok':'bad'}">${f.active?'Activo':'Inactivo'}</span></td><td><div class="row-actions" onclick="event.stopPropagation()"><button class="btn small" onclick="openFixedModal('${f.id}')">Editar</button><button class="btn danger small" onclick="deleteFixed('${f.id}')">Eliminar</button></div></td></tr>`;
}
async function openFixedModal(id){
  editingFixedId = id || null;
  let f = {active:true};
  if(id){ const r = await api('/costs'); f = r.items.find(x=>x.id===id) || f; }
  openModal(id?'Editar coste fijo':'Nuevo coste fijo', fixedFormHtml(f), {wide:true});
}
async function editFixed(id){ await openFixedModal(id); }
async function saveFixed(id){
  const body = {concept:textVal('fConcept'), group:textVal('fGroup')||'General', provider:textVal('fProvider'), monthly:val('fMonthly'), active:checked('fActive'), notes:textVal('fNotes')};
  if(blockIfMissing([[body.concept,'Concepto']])) return;
  if(id) await guarded(api('/costs/'+id, {method:'PUT', body})); else await guarded(api('/costs', {method:'POST', body}));
  toast('Coste guardado'); editingFixedId=null; closeModal();
  if(pricingTab==='costs' && document.getElementById('pricing').classList.contains('active')) renderCosts();
}
async function deleteFixed(id){
  if(!confirm('¿Eliminar este coste fijo?')) return;
  await guarded(api('/costs/'+id, {method:'DELETE'}));
  if(editingFixedId===id) editingFixedId=null;
  toast('Eliminado'); closeModal();
  if(pricingTab==='costs' && document.getElementById('pricing').classList.contains('active')) renderCosts();
}

/* ===================== Horas ===================== */
let editingTimeId = null;
/* ---- Fichaje (cronómetro de horas) ---- */
let activeClock = null;
let clockTickTimer = null;
// Genera las mismas opciones de proyecto (contratos activos / presupuestos activos /
// manual) que usa el formulario de "Registrar horas", para reutilizarlas también en
// el selector de fichaje.
function projectOptionsHtml(contracted, clients, budgets, selectedId){
  const activeContracts = contracted.filter(cs=>cs.status==='Activo');
  const contractOpts = activeContracts.map(cs=>{
    const cl = clients.find(c=>c.id===cs.clientId);
    return `<option value="${cs.id}" ${selectedId===cs.id?'selected':''}>${esc(cl?cl.name:'Cliente eliminado')} — ${esc(cs.name)}</option>`;
  }).join('');
  const budgetOpts = (budgets||[]).map(b=>`<option value="${b.id}" ${selectedId===b.id?'selected':''}>${esc(b.client||'Cliente sin datos')} — ${esc(b.service)} (presupuesto)</option>`).join('');
  return `${contractOpts?`<optgroup label="Contratos activos">${contractOpts}</optgroup>`:''}${budgetOpts?`<optgroup label="Presupuestos activos">${budgetOpts}</optgroup>`:''}`;
}
// A partir del valor elegido en un selector de proyecto (id de contrato, id de
// presupuesto, o "__manual__"), calcula los datos {contractedId,budgetId,clientId,client,service}
// que hay que guardar. `manualClient` se usa solo cuando la opción es manual.
function resolveProjectSelection(sel, manualClient){
  if(sel && sel!=='__manual__' && sel.startsWith('bud_')){
    const b = (window.__hoursBudgets||[]).find(x=>x.id===sel);
    return {contractedId:'', budgetId:sel, clientId: b?b.clientId:'', client: b?b.client:'', service: b?b.service:''};
  }
  if(sel && sel!=='__manual__'){
    const cs = (window.__hoursContracted||[]).find(x=>x.id===sel);
    const cl = cs ? (window.__hoursClients||[]).find(c=>c.id===cs.clientId) : null;
    return {contractedId:sel, budgetId:'', clientId: cs?cs.clientId:'', client: cl?cl.name:'', service: cs?cs.name:''};
  }
  return {contractedId:'', budgetId:'', clientId:'', client:(manualClient||'').trim(), service:''};
}
function fmtElapsed(ms){
  const totalSec = Math.max(0, Math.floor(ms/1000));
  const h = String(Math.floor(totalSec/3600)).padStart(2,'0');
  const m = String(Math.floor((totalSec%3600)/60)).padStart(2,'0');
  const s = String(totalSec%60).padStart(2,'0');
  return `${h}:${m}:${s}`;
}
function stopClockTicker(){ if(clockTickTimer){ clearInterval(clockTickTimer); clockTickTimer=null; } }
function startClockTicker(){
  stopClockTicker();
  const tick = ()=>{
    const hoursEl = document.getElementById('hours');
    if(!activeClock || !hoursEl || !hoursEl.classList.contains('active')){ stopClockTicker(); return; }
    const el = document.getElementById('clockTimer');
    if(el) el.textContent = fmtElapsed(Date.now() - new Date(activeClock.startedAt).getTime());
  };
  tick();
  clockTickTimer = setInterval(tick, 1000);
}
function onClockProjectChange(){
  const wrap = document.getElementById('clockManualWrap');
  if(wrap) document.getElementById('clockProject').value==='__manual__' ? wrap.classList.remove('hide') : wrap.classList.add('hide');
}
function clockCardHtml(){
  if(activeClock){
    const proj = activeClock.client + (activeClock.service ? ' — '+activeClock.service : '');
    return `<div class="card clockcard running">
      <h3>Fichaje en curso</h3>
      <div class="clock-live">
        <div class="clock-live-info">
          <span class="clock-dot"></span>
          <div><div class="clock-project">${esc(proj)}</div><div class="mini">Iniciado a las ${esc(new Date(activeClock.startedAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}))}</div></div>
        </div>
        <div class="clock-timer" id="clockTimer">00:00:00</div>
        <div class="row-actions">
          <button class="btn primary" onclick="stopClock()">Finalizar fichaje</button>
          <button class="btn ghost" onclick="cancelClock()">Descartar</button>
        </div>
      </div>
    </div>`;
  }
  const opts = projectOptionsHtml(window.__hoursContracted||[], window.__hoursClients||[], window.__hoursBudgets||[], '');
  return `<div class="card clockcard">
    <h3>Fichaje</h3>
    <p class="mini">Selecciona el proyecto en el que vas a trabajar y pulsa "Iniciar fichaje". Cuando termines, vuelve aquí y pulsa "Finalizar fichaje": las horas se calculan y se guardan solas en el listado de abajo.</p>
    <div class="clock-start">
      <select id="clockProject" onchange="onClockProjectChange()">
        <option value="">Selecciona un proyecto...</option>
        ${opts}
        <option value="__manual__">Otro / cliente sin proyecto</option>
      </select>
      <div id="clockManualWrap" class="hide"><input id="clockManualClient" placeholder="Nombre del cliente o proyecto"></div>
      <button class="btn primary" onclick="startClock()">Iniciar fichaje</button>
    </div>
  </div>`;
}
async function startClock(){
  const sel = document.getElementById('clockProject').value;
  if(blockIfMissing([[sel,'Proyecto']])) return;
  const manualClient = textVal('clockManualClient');
  const body = resolveProjectSelection(sel, manualClient);
  if(blockIfMissing([[body.client,'Proyecto / cliente']])) return;
  const res = await guarded(api('/clock/start', {method:'POST', body}));
  activeClock = res.active;
  toast('Fichaje iniciado');
  if(document.getElementById('hours').classList.contains('active')) renderHours();
}
async function stopClock(){
  const res = await guarded(api('/clock/stop', {method:'POST', body:{}}));
  activeClock = null;
  stopClockTicker();
  toast(`Fichaje guardado: ${num(res.entry.hours).toLocaleString('es-ES')} h`);
  if(document.getElementById('hours').classList.contains('active')) renderHours();
}
async function cancelClock(){
  if(!confirm('¿Descartar el fichaje en curso sin guardar horas?')) return;
  const res = await guarded(api('/clock/cancel', {method:'POST'}));
  activeClock = null;
  stopClockTicker();
  toast('Fichaje descartado');
  if(document.getElementById('hours').classList.contains('active')) renderHours();
}
function timeSummary(entries){
  const byClient = {}; const byMonth = {};
  entries.forEach(t=>{
    const client = t.client || 'Sin cliente'; const month = String(t.date || '').slice(0,7) || 'Sin fecha';
    byClient[client] = (byClient[client]||0) + num(t.hours); byMonth[month] = (byMonth[month]||0) + num(t.hours);
  });
  const totalHours = entries.reduce((a,t)=>a+num(t.hours),0);
  const billableHours = entries.filter(t=>t.billable).reduce((a,t)=>a+num(t.hours),0);
  const monthHours = byMonth[today().slice(0,7)] || 0;
  return {byClient, totalHours, billableHours, monthHours};
}
let hoursSearch = '';
let hoursBillableFilter = '';
let hoursSort = {key:'', dir:'asc'};
const HOURS_SORT_ACCESSORS = { date:t=>t.date||'', client:t=>t.client||'', service:t=>t.service||'', hours:t=>num(t.hours) };
function setHoursSort(key){ toggleSort(hoursSort, key); renderHours(); }
function matchesHoursSearch(t, q){
  if(!q) return true;
  const needle = q.toLowerCase();
  return [t.client, t.service, t.notes].some(v=>String(v||'').toLowerCase().includes(needle));
}
async function renderHours(){
  const [hoursRes, contractedRes, clientsRes, budgetsRes, clockRes] = await Promise.all([api('/hours'), api('/contracted'), api('/clients'), api('/budgets'), api('/clock')]);
  window.__hoursClients = clientsRes.items; window.__hoursContracted = contractedRes.items;
  // "Activo" para presupuestos = mismo criterio que el Panel: aceptado, en curso o ya facturado
  // (todavía puede haber trabajo/horas pendientes aunque ya se haya facturado).
  window.__hoursBudgets = budgetsRes.items.filter(b=>['Aceptado','En proceso','Facturado'].includes(b.status));
  activeClock = clockRes.active;
  const sum = timeSummary(hoursRes.items);
  const allRows = [...hoursRes.items].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  let rows = allRows.filter(t=>matchesHoursSearch(t, hoursSearch));
  if(hoursBillableFilter) rows = rows.filter(t=>(hoursBillableFilter==='Sí') === Boolean(t.billable));
  rows = sortRows(rows, hoursSort, HOURS_SORT_ACCESSORS);
  const clientRows = Object.entries(sum.byClient).sort((a,b)=>b[1]-a[1]);
  document.getElementById('hours').innerHTML = `
  ${clockCardHtml()}
  <div class="grid kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="card kpi"><span>Horas registradas (total)</span><strong>${sum.totalHours.toLocaleString('es-ES')} h</strong><small>${hoursRes.items.length} registros</small></div>
    <div class="card kpi"><span>Horas facturables</span><strong>${sum.billableHours.toLocaleString('es-ES')} h</strong><small>Marcadas como facturables</small></div>
    <div class="card kpi"><span>Horas este mes</span><strong>${sum.monthHours.toLocaleString('es-ES')} h</strong><small>${today().slice(0,7)}</small></div>
    <div class="card kpi"><span>Clientes/proyectos con horas</span><strong>${clientRows.length}</strong><small>Distintos clientes o proyectos</small></div>
  </div>
  <div class="card">
    <h3>Horas por cliente / proyecto</h3>
    ${clientRows.length ? `<div class="table-scroll"><table><thead><tr><th>Cliente / proyecto</th><th>Horas</th></tr></thead><tbody>${clientRows.map(([c,h])=>`<tr><td>${esc(c)}</td><td>${h.toLocaleString('es-ES')} h</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay horas registradas.</div>'}
  </div>
  <div class="card" style="margin-top:14px">
    <div class="toolbar-row">
      <div class="toolbar-left"><h3>Listado de horas</h3>
        <select id="tFilterBillable" onchange="hoursBillableFilter=this.value;renderHours()">
          <option value="">Facturables y no facturables</option>
          <option value="Sí" ${hoursBillableFilter==='Sí'?'selected':''}>Solo facturables</option>
          <option value="No" ${hoursBillableFilter==='No'?'selected':''}>Solo no facturables</option>
        </select>
      </div>
      <div class="searchbox"><input id="tSearch" placeholder="Buscar por cliente, servicio, notas..." value="${esc(hoursSearch)}"></div>
      <div class="toolbar-right"><button class="btn primary" onclick="openTimeModal(null)">+ Registrar horas</button></div>
    </div>
    ${rows.length ? `<div class="table-scroll"><table><thead><tr>${thSort('Fecha','date',hoursSort,'setHoursSort')}${thSort('Cliente / proyecto','client',hoursSort,'setHoursSort')}${thSort('Servicio','service',hoursSort,'setHoursSort')}${thSort('Horas','hours',hoursSort,'setHoursSort')}<th>Facturable</th><th>Notas</th><th>Acciones</th></tr></thead><tbody>${rows.map(timeRowHtml).join('')}</tbody></table></div>` : (allRows.length ? '<div class="empty">Ningún registro coincide con la búsqueda o el filtro.</div>' : '<div class="empty">No hay horas registradas. Añade la primera con el botón de arriba.</div>')}
  </div>`;
  const s = document.getElementById('tSearch');
  let t=null;
  s.oninput = ()=>{ clearTimeout(t); t=setTimeout(()=>{ hoursSearch=s.value; renderHours(); }, 250); };
  s.focus(); s.setSelectionRange(s.value.length, s.value.length);
  if(activeClock) startClockTicker(); else stopClockTicker();
}
function timeFormHtml(t, contracted, clients, budgets){
  const activeContracts = contracted.filter(cs=>cs.status==='Activo');
  const isManual = !t.contractedId && !t.budgetId && Boolean(t.client);
  const contractOpts = activeContracts.map(cs=>{
    const cl = clients.find(c=>c.id===cs.clientId);
    return `<option value="${cs.id}" ${t.contractedId===cs.id?'selected':''}>${esc(cl?cl.name:'Cliente eliminado')} — ${esc(cs.name)}</option>`;
  }).join('');
  const budgetOpts = (budgets||[]).map(b=>`<option value="${b.id}" ${t.budgetId===b.id?'selected':''}>${esc(b.client||'Cliente sin datos')} — ${esc(b.service)} (presupuesto)</option>`).join('');
  return `<div class="form compact">
    <div class="field"><label>Fecha</label><input id="tDate" type="date" value="${esc(t.date || today())}"></div>
    <div class="field full"><label>Proyecto / contrato / presupuesto activo</label>
      <select id="tProject" onchange="onTimeProjectChange()">
        <option value="">Selecciona un proyecto activo...</option>
        ${contractOpts?`<optgroup label="Contratos activos">${contractOpts}</optgroup>`:''}
        ${budgetOpts?`<optgroup label="Presupuestos activos">${budgetOpts}</optgroup>`:''}
        <option value="__manual__" ${isManual?'selected':''}>Otro / cliente sin proyecto</option>
      </select>
    </div>
    <div class="field full ${isManual?'':'hide'}" id="tManualWrap"><label>Cliente / proyecto (manual)</label><input id="tClient" value="${esc(isManual?t.client:'')}" placeholder="Nombre del cliente o proyecto"></div>
    ${plainNumber('tHours','Horas',t.hours,.25)}
    <div class="field"><label><input id="tBillable" type="checkbox" ${t.billable?'checked':''}> Facturable</label></div>
    <div class="field full"><label>Notas</label><input id="tNotes" value="${esc(t.notes||'')}" placeholder="Qué se ha hecho"></div>
    <div class="row-actions full">
      <button class="btn primary" onclick="saveTimeEntry('${t.id||''}')">${t.id?'Guardar cambios':'Añadir registro'}</button>
      ${t.id?`<button class="btn danger" onclick="deleteTimeEntry('${t.id}')">Eliminar</button>`:''}
      <button class="btn ghost" onclick="closeModal()">Cancelar</button>
    </div>
  </div>`;
}
function onTimeProjectChange(){
  const wrap = document.getElementById('tManualWrap');
  document.getElementById('tProject').value==='__manual__' ? wrap.classList.remove('hide') : wrap.classList.add('hide');
}
function timeRowHtml(t){
  return `<tr class="clickable" onclick="openTimeModal('${t.id}')"><td>${esc(t.date)}</td><td>${esc(t.client)}</td><td>${esc(t.service||'—')}</td><td>${num(t.hours).toLocaleString('es-ES')} h</td><td><span class="status ${t.billable?'ok':'bad'}">${t.billable?'Sí':'No'}</span></td><td>${esc(t.notes)}</td><td><div class="row-actions" onclick="event.stopPropagation()"><button class="btn small" onclick="openTimeModal('${t.id}')">Editar</button><button class="btn danger small" onclick="deleteTimeEntry('${t.id}')">Eliminar</button></div></td></tr>`;
}
async function openTimeModal(id){
  editingTimeId = id || null;
  const [hoursRes, contractedRes, clientsRes, budgetsRes] = await Promise.all([api('/hours'), api('/contracted'), api('/clients'), api('/budgets')]);
  window.__hoursClients = clientsRes.items; window.__hoursContracted = contractedRes.items;
  window.__hoursBudgets = budgetsRes.items.filter(b=>['Aceptado','En proceso','Facturado'].includes(b.status));
  const t = id ? (hoursRes.items.find(x=>x.id===id) || {}) : {date:today(), billable:true};
  openModal(id?'Editar registro de horas':'Registrar horas', timeFormHtml(t, contractedRes.items, clientsRes.items, window.__hoursBudgets), {wide:true});
}
async function editTimeEntry(id){ await openTimeModal(id); }
async function saveTimeEntry(id){
  const sel = document.getElementById('tProject').value;
  let body;
  if(sel && sel!=='__manual__' && sel.startsWith('bud_')){
    const b = (window.__hoursBudgets||[]).find(x=>x.id===sel);
    body = {date:document.getElementById('tDate').value||today(), contractedId:'', budgetId:sel, clientId: b?b.clientId:'', client: b?b.client:'', service: b?b.service:'', hours:val('tHours'), billable:checked('tBillable'), notes:textVal('tNotes')};
  } else if(sel && sel!=='__manual__'){
    const cs = (window.__hoursContracted||[]).find(x=>x.id===sel);
    const cl = cs ? (window.__hoursClients||[]).find(c=>c.id===cs.clientId) : null;
    body = {date:document.getElementById('tDate').value||today(), contractedId:sel, budgetId:'', clientId: cs?cs.clientId:'', client: cl?cl.name:'', service: cs?cs.name:'', hours:val('tHours'), billable:checked('tBillable'), notes:textVal('tNotes')};
  } else {
    body = {date:document.getElementById('tDate').value||today(), contractedId:'', budgetId:'', clientId:'', client:textVal('tClient'), service:'', hours:val('tHours'), billable:checked('tBillable'), notes:textVal('tNotes')};
  }
  if(blockIfMissing([[body.client,'Cliente / proyecto'],[body.hours>0?1:'','Horas (mayor que 0)']])) return;
  if(id) await guarded(api('/hours/'+id, {method:'PUT', body})); else await guarded(api('/hours', {method:'POST', body}));
  toast('Registro guardado'); editingTimeId=null; closeModal();
  if(document.getElementById('hours').classList.contains('active')) renderHours();
}
async function deleteTimeEntry(id){
  if(!confirm('¿Eliminar este registro de horas?')) return;
  await guarded(api('/hours/'+id, {method:'DELETE'}));
  if(editingTimeId===id) editingTimeId=null;
  toast('Eliminado'); closeModal();
  if(document.getElementById('hours').classList.contains('active')) renderHours();
}

/* ===================== Rentabilidad ===================== */
async function renderProfitability(){
  const [profRes, dashRes, marginsRes] = await Promise.all([api('/dashboard/profitability'), api('/dashboard'), api('/dashboard/margins')]);
  const rows = profRes.rows;
  const projects = marginsRes.projects;
  const clientMargins = marginsRes.byClient;
  document.getElementById('profitability').innerHTML = `
  <div class="grid kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="card kpi"><span>Facturación recurrente mensual</span><strong>${money(profRes.totalRevenue)}</strong><small>Normalizada a mes (mensual + anual/12), solo contratos activos</small></div>
    <div class="card kpi"><span>Coste/hora del negocio</span><strong>${money2(dashRes.costHour)}</strong><small>Referencia general desde Costes fijos y Configuración</small></div>
    <div class="card kpi"><span>Margen real facturado</span><strong>${money(marginsRes.totalRealMargin)}</strong><small>Facturado menos coste de horas realmente registradas</small></div>
    <div class="card kpi"><span>Facturado (con horas o factura)</span><strong>${money(marginsRes.totalInvoiced)}</strong><small>Solo clientes con horas o facturas registradas</small></div>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>Margen real por proyecto/presupuesto</h3>
    <p class="mini">Compara lo presupuestado con las horas realmente registradas (a coste/hora del negocio) y lo realmente facturado. Solo cuenta si las horas y las facturas están enlazadas al presupuesto (desde Horas → "Proyecto / contrato / presupuesto activo" y Presupuestos → "Generar factura").</p>
    ${projects.length ? `<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Servicio</th><th>Estado</th><th>Precio estimado</th><th>Margen estimado</th><th>Horas reales</th><th>Coste real horas</th><th>Facturado</th><th>Cobrado</th><th>Margen real</th></tr></thead><tbody>${projects.map(p=>`<tr><td>${esc(p.clientName)}</td><td>${esc(p.service)}</td><td>${esc(p.status)}</td><td>${money2(p.estimatedPrice)}</td><td>${money2(p.estimatedMargin)} (${pct(p.estimatedMarginPct)})</td><td>${p.realHours.toLocaleString('es-ES')} h</td><td>${money2(p.realCost)}</td><td>${money2(p.invoiced)}</td><td>${money2(p.paid)}</td><td class="${p.realMargin<0?'neg':''}">${money2(p.realMargin)}${p.invoiced?` (${pct(p.realMarginPct)})`:''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay presupuestos activos con horas o facturas enlazadas para calcular el margen real.</div>'}
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card">
      <h3>Facturación recurrente por cliente (mensual)</h3>
      ${rows.length ? `<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Contratos activos</th><th>Facturación/mes</th><th>% del total</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.clientName)}</td><td>${r.contracts}</td><td>${money2(r.revenue)}</td><td>${pct(profRes.totalRevenue?r.revenue/profRes.totalRevenue:0)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Añade contratos activos (mensuales o anuales) a tus clientes para ver aquí cuánto te factura cada uno.</div>'}
    </div>
    <div class="card">
      <h3>Avisos de facturación</h3>
      <div class="metric"><span>Facturas pendientes de cobro</span><strong>${dashRes.invoicesPending}</strong></div>
      <div class="metric"><span>Pendientes atrasadas</span><strong>${dashRes.invoicesOverdue}</strong></div>
      <div class="metric"><span>Cobradas</span><strong>${dashRes.invoicesPaid}</strong></div>
      <button class="btn small full" style="margin-top:10px" onclick="show('invoices')">Ver facturas →</button>
    </div>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>Margen real por cliente</h3>
    <p class="mini">Toda la facturación real del cliente (cualquier origen) frente al coste de todas las horas registradas y enlazadas a ese cliente.</p>
    ${clientMargins.length ? `<div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Facturado</th><th>Cobrado</th><th>Horas</th><th>Coste horas</th><th>Margen real</th></tr></thead><tbody>${clientMargins.map(r=>`<tr><td>${esc(r.clientName)}</td><td>${money2(r.invoiced)}</td><td>${money2(r.paid)}</td><td>${r.hours.toLocaleString('es-ES')} h</td><td>${money2(r.cost)}</td><td class="${r.margin<0?'neg':''}">${money2(r.margin)}${r.invoiced?` (${pct(r.marginPct)})`:''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Aún no hay facturas ni horas enlazadas a clientes para calcular el margen real.</div>'}
  </div>`;
}

/* ===================== Configuración del escandallo ===================== */
async function renderConfig(){
  const [cfgRes, dashRes] = await Promise.all([api('/config'), api('/dashboard')]);
  CONFIG = cfgRes.config;
  const cfg = CONFIG;
  document.getElementById('pricingBody').innerHTML = `
  <div class="grid two">
    <div class="card">
      <h3>Parámetros generales</h3>
      <p class="mini" style="margin-bottom:12px">Estos ajustes solo afectan a la calculadora de precios y presupuestos, no a tu cuenta ni a tus usuarios.</p>
      <div class="form">
        ${plainNumber('cfg_productiveHours','Horas productivas al mes',cfg.productiveHours,1)}
        ${plainNumber('cfg_salaryTarget','Sueldo objetivo mensual neto',cfg.salaryTarget,1)}
        ${plainNumber('cfg_buffer','Colchón / beneficio mínimo mensual',cfg.buffer,1)}
        ${plainNumber('cfg_margin','Margen recomendado sobre coste %',Math.round(num(cfg.margin)*100),1)}
        ${plainNumber('cfg_amortizationPct','Amortización equipo %',Math.round(num(cfg.amortizationPct)*100),1)}
        ${plainNumber('cfg_iva','IVA general %',Math.round(num(cfg.iva)*100),1)}
        ${plainNumber('cfg_irpf','IRPF orientativo %',Math.round(num(cfg.irpf)*100),1)}
        ${plainNumber('cfg_rounding','Redondeo precios a euros',cfg.rounding,1)}
        ${plainNumber('cfg_defaultIndirectPct','% indirectos por defecto (nuevos servicios)',Math.round(num(cfg.defaultIndirectPct)*100),1)}
        <p class="mini" style="margin:-4px 0 4px">Se usa solo como valor de partida al crear un servicio nuevo. Cada servicio guarda su propio % y lo puedes ajustar sin que afecte a los demás, desde su ficha en el Catálogo.</p>
        <button class="btn primary full" onclick="saveConfig()">Guardar configuración</button>
      </div>
    </div>
    <div class="card">
      <h3>Resumen de datos</h3>
      <p class="sub">Estado actual de la información guardada en el CRM.</p>
      <div class="metric"><span>Servicios</span><strong>${dashRes.servicesTotal}</strong></div>
      <div class="metric"><span>Costes fijos</span><strong>${dashRes.fixedTotal}</strong></div>
      <div class="metric"><span>Presupuestos</span><strong>${dashRes.budgetsTotal}</strong></div>
      <div class="metric"><span>Clientes</span><strong>${dashRes.clientsTotal}</strong></div>
      <div class="metric"><span>Contratos</span><strong>${dashRes.contractedTotal}</strong></div>
      <button class="btn small full" style="margin-top:10px" onclick="show('settings')">Ir a Ajustes generales →</button>
    </div>
  </div>`;
}
async function saveConfig(){
  const body = { productiveHours:val('cfg_productiveHours'), salaryTarget:val('cfg_salaryTarget'), buffer:val('cfg_buffer'), margin:val('cfg_margin')/100, amortizationPct:val('cfg_amortizationPct')/100,
    iva:val('cfg_iva')/100, irpf:val('cfg_irpf')/100, rounding:Math.max(1,val('cfg_rounding')), defaultIndirectPct:val('cfg_defaultIndirectPct')/100 };
  const r = await guarded(api('/config', {method:'PUT', body}));
  CONFIG = r.config;
  toast('Configuración guardada'); renderConfig();
}

/* ===================== Mi perfil ===================== */
async function renderProfile(){
  const r = await api('/users/me');
  const u = r.user;
  document.getElementById('profile').innerHTML = `
  <div class="grid two">
    <div class="card">
      <h3>Tus datos</h3>
      <div class="form">
        <div class="field full"><label>Nombre</label><input id="pfName" value="${esc(u.name)}"></div>
        <div class="field full"><label>Email</label><input id="pfEmail" type="email" value="${esc(u.email)}"></div>
        <div class="row-actions full"><button class="btn primary" onclick="saveProfile()">Guardar cambios</button></div>
      </div>
    </div>
    <div class="card">
      <h3>Cambiar contraseña</h3>
      <div class="form">
        <div class="field full"><label>Contraseña actual</label><input id="pfCurrentPass" type="password"></div>
        <div class="field full"><label>Contraseña nueva (mín. 6 caracteres)</label><input id="pfNewPass" type="password"></div>
        <div class="row-actions full"><button class="btn primary" onclick="changePassword()">Actualizar contraseña</button></div>
      </div>
    </div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card">
      <h3>PIN de acceso rápido</h3>
      <p class="mini" style="margin-bottom:12px">Un PIN de 4 dígitos para entrar más rápido desde la pantalla de inicio de sesión, sin escribir tu contraseña completa. Se bloquea unos minutos tras varios intentos fallidos.</p>
      <div class="metric"><span>Estado</span><strong style="color:${u.hasPin?'#15803d':'inherit'}">${u.hasPin?'Activado':'Sin activar'}</strong></div>
      <div class="form" style="margin-top:10px">
        <div class="field full"><label>Contraseña actual</label><input id="pfPinCurrentPass" type="password"></div>
        <div class="field full"><label>${u.hasPin?'Nuevo PIN':'PIN'} (4 dígitos)</label><input id="pfPinValue" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="••••"></div>
        <div class="row-actions full">
          <button class="btn primary" onclick="setPin()">${u.hasPin?'Cambiar PIN':'Activar PIN'}</button>
          ${u.hasPin?'<button class="btn danger" onclick="removePin()">Desactivar PIN</button>':''}
        </div>
      </div>
    </div>
    <div class="card">
      <h3>Cuenta</h3>
      <div class="metric"><span>Rol</span><strong>${u.role==='admin'?'Administrador':'Colaborador'}</strong></div>
      <div class="metric"><span>Cuenta creada</span><strong>${esc((u.createdAt||'').slice(0,10))}</strong></div>
    </div>
  </div>`;
}
async function setPin(){
  const currentPassword = document.getElementById('pfPinCurrentPass').value;
  const pin = document.getElementById('pfPinValue').value;
  await guarded(api('/users/me/pin', {method:'PUT', body:{currentPassword, pin}}));
  toast('PIN guardado');
  renderProfile();
}
async function removePin(){
  if(!confirm('¿Desactivar el PIN de acceso rápido?')) return;
  const currentPassword = document.getElementById('pfPinCurrentPass').value;
  await guarded(api('/users/me/pin', {method:'DELETE', body:{currentPassword}}));
  toast('PIN desactivado');
  renderProfile();
}
async function saveProfile(){
  const body = { name:textVal('pfName'), email:textVal('pfEmail') };
  const r = await guarded(api('/users/me', {method:'PUT', body}));
  CURRENT_USER = r.user;
  document.getElementById('userName').textContent = CURRENT_USER.name;
  document.getElementById('userAvatar').textContent = initials(CURRENT_USER.name);
  toast('Perfil actualizado');
}
async function changePassword(){
  const currentPassword = document.getElementById('pfCurrentPass').value;
  const newPassword = document.getElementById('pfNewPass').value;
  await guarded(api('/users/me/password', {method:'PUT', body:{currentPassword, newPassword}}));
  document.getElementById('pfCurrentPass').value = ''; document.getElementById('pfNewPass').value = '';
  toast('Contraseña actualizada');
}

/* ===================== Usuarios (admin) ===================== */
async function renderUsers(){
  if(CURRENT_USER.role !== 'admin'){ document.getElementById('users').innerHTML = '<div class="empty">Solo un administrador puede gestionar usuarios.</div>'; return; }
  const r = await api('/users');
  document.getElementById('users').innerHTML = `
  <div class="card">
    <div class="split-title"><h3>Accesos al CRM</h3><button class="btn primary" onclick="openUserModal()">+ Nuevo usuario</button></div>
    <div class="table-scroll"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Creado</th><th>Acciones</th></tr></thead><tbody>
    ${r.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="status ${u.role==='admin'?'ok':''}">${u.role==='admin'?'Administrador':'Colaborador'}</span></td><td>${esc((u.createdAt||'').slice(0,10))}</td>
      <td><div class="row-actions">
        <button class="btn small" onclick="openUserModal('${u.id}')">Editar</button>
        <button class="btn small" onclick="resetUserPassword('${u.id}')">Restablecer contraseña</button>
        ${u.id!==CURRENT_USER.id?`<button class="btn danger small" onclick="deleteUser('${u.id}')">Eliminar</button>`:''}
      </div></td></tr>`).join('')}
    </tbody></table></div>
  </div>`;
}
async function openUserModal(id){
  let u = {name:'',email:'',role:'colaborador'};
  if(id){ const r = await api('/users'); u = r.users.find(x=>x.id===id) || u; }
  openModal(id?'Editar usuario':'Nuevo usuario', `<div class="form">
    <div class="field full"><label>Nombre</label><input id="usName" value="${esc(u.name)}"></div>
    <div class="field full"><label>Email</label><input id="usEmail" type="email" value="${esc(u.email)}"></div>
    ${id?'':`<div class="field full"><label>Contraseña inicial (mín. 6 caracteres)</label><input id="usPassword" type="password"></div>`}
    <div class="field full"><label>Rol</label><select id="usRole"><option value="colaborador" ${u.role==='colaborador'?'selected':''}>Colaborador</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option></select></div>
    <div class="row-actions full"><button class="btn primary" onclick="saveUser('${id||''}')">${id?'Guardar cambios':'Crear usuario'}</button><button class="btn ghost" onclick="closeModal()">Cancelar</button></div>
  </div>`);
}
async function saveUser(id){
  const body = { name:textVal('usName'), email:textVal('usEmail'), role:document.getElementById('usRole').value };
  if(blockIfMissing([[body.name,'Nombre'],[body.email,'Email']])) return;
  if(id){ await guarded(api('/users/'+id, {method:'PUT', body})); }
  else {
    body.password = document.getElementById('usPassword').value;
    if(blockIfMissing([[body.password && body.password.length>=6 ? 1 : '','Contraseña (mín. 6 caracteres)']])) return;
    await guarded(api('/users', {method:'POST', body}));
  }
  toast('Usuario guardado'); closeModal(); renderUsers();
}
async function resetUserPassword(id){
  const newPassword = prompt('Nueva contraseña para este usuario (mín. 6 caracteres):');
  if(!newPassword) return;
  await guarded(api(`/users/${id}/reset-password`, {method:'POST', body:{newPassword}}));
  toast('Contraseña restablecida');
}
async function deleteUser(id){
  if(!confirm('¿Eliminar este usuario? Perderá el acceso al CRM.')) return;
  await guarded(api('/users/'+id, {method:'DELETE'}));
  toast('Usuario eliminado'); renderUsers();
}

/* ===================== Ajustes generales de la app ===================== */
async function renderSettings(){
  const [r, backupsRes] = await Promise.all([api('/config'), api('/config/backups')]);
  const cfg = r.config;
  const backups = backupsRes.items;
  document.getElementById('settings').innerHTML = `
  <div class="grid two">
    <div class="card">
      <h3>Datos fiscales para tus facturas</h3>
      <p class="mini" style="margin-bottom:12px">Aparecen en la cabecera de cada factura que generes.</p>
      <div class="form">
        <div class="field full"><label>Nombre comercial / razón social</label><input id="stCompanyName" value="${esc(cfg.companyName||'')}"></div>
        <div class="field"><label>NIF/CIF</label><input id="stTaxId" value="${esc(cfg.businessTaxId||'')}"></div>
        <div class="field"><label>Teléfono</label><input id="stPhone" value="${esc(cfg.businessPhone||'')}"></div>
        <div class="field full"><label>Dirección fiscal</label><input id="stAddress" value="${esc(cfg.businessAddress||'')}"></div>
        <div class="field full"><label>Email de contacto</label><input id="stEmail" type="email" value="${esc(cfg.businessEmail||'')}"></div>
        <button class="btn primary full" onclick="saveSettings()">Guardar datos fiscales</button>
      </div>
    </div>
    <div class="grid" style="gap:14px">
      <div class="card">
        <h3>Copia de seguridad</h3>
        <p class="sub">Descarga un fichero con absolutamente todos tus datos: clientes, contratos, facturas, presupuestos, configuración...</p>
        <button class="btn full" style="margin-top:10px" onclick="exportBackup()">⬇ Descargar copia de seguridad</button>
      </div>
      <div class="card">
        <h3>Restaurar copia de seguridad</h3>
        <p class="sub">Sube un fichero descargado antes con "Copia de seguridad". <strong>Sustituye todos los datos actuales</strong> — no se puede deshacer.</p>
        <input type="file" id="stRestoreFile" accept="application/json" style="margin-top:10px">
        <button class="btn danger full" style="margin-top:10px" onclick="restoreBackup()">Restaurar desde fichero</button>
      </div>
      <div class="card">
        <h3>Copias de seguridad automáticas</h3>
        <p class="sub">Cada día que abras la app se guarda automáticamente una copia del fichero de datos en tu ordenador (además de las que descargues a mano arriba). Se conservan las últimas 30 copias; las más antiguas se borran solas.</p>
        ${backups.length ? `<div class="table-scroll" style="margin-top:10px;max-height:200px"><table><thead><tr><th>Fecha</th><th>Tamaño</th></tr></thead><tbody>${backups.map(b=>`<tr><td>${esc(b.date)}</td><td>${(b.size/1024).toFixed(0)} KB</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty" style="margin-top:10px">Todavía no hay copias automáticas (se crea la primera la próxima vez que abras la app).</div>'}
        <p class="mini" style="margin-top:8px">Se guardan en la carpeta de datos de la app, dentro de "backups". No sustituyen a tener una copia también fuera de este ordenador (nube, disco externo...).</p>
      </div>
      <div class="card">
        <h3>Sobre esta app</h3>
        <div class="metric"><span>Los datos se guardan en</span><strong style="text-align:right">tu ordenador, en local</strong></div>
        <div class="metric"><span>Acceso</span><strong>Con usuario y contraseña</strong></div>
        <div class="metric"><span>Fichero de datos</span><strong>Cifrado en disco</strong></div>
      </div>
    </div>
  </div>`;
}
async function saveSettings(){
  const body = { companyName:textVal('stCompanyName'), businessTaxId:textVal('stTaxId'), businessPhone:textVal('stPhone'), businessAddress:textVal('stAddress'), businessEmail:textVal('stEmail') };
  await guarded(api('/config', {method:'PUT', body}));
  toast('Datos fiscales guardados');
}
async function restoreBackup(){
  const input = document.getElementById('stRestoreFile');
  const file = input.files[0];
  if(!file){ toast('Elige primero un fichero de copia de seguridad.', 'error'); return; }
  if(!confirm('Esto sustituirá TODOS los datos actuales del CRM por los del fichero. ¿Seguro que quieres continuar?')) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    await guarded(api('/config/restore', {method:'POST', body:parsed}));
    toast('Copia restaurada. Volviendo a iniciar sesión...');
    setTimeout(()=>{ window.location.href = '/login.html'; }, 1500);
  }catch(e){
    toast(e.message || 'El fichero no es una copia de seguridad válida.', 'error');
  }
}

/* ===================== Guía rápida ===================== */
async function renderGuide(){
  document.getElementById('guide').innerHTML = `<div class="guide">
    <article><h4>Coste/hora</h4><p>Sale de sumar sueldo objetivo, colchón y costes fijos activos, dividido entre tus horas productivas reales. Si sube un coste fijo, todos los precios se recalculan.</p></article>
    <article><h4>Servicios editables</h4><p>Cada servicio tiene horas, costes directos, indirectos, margen y comisión. Editarlo cambia el precio recomendado sin tocar presupuestos ya guardados.</p></article>
    <article><h4>Amortización del equipo</h4><p>Reserva un porcentaje adicional sobre los costes directos para compensar el uso del ordenador y financiar su renovación. Un 3-8% suele ser una referencia práctica.</p></article>
    <article><h4>Comisión sobre beneficio</h4><p>La comisión se calcula sobre beneficio bruto, no sobre facturación. Así evitas pagar comisión sobre IVA o costes que no son ganancia.</p></article>
    <article><h4>Pipeline de clientes</h4><p>Cada cliente tiene una etapa (Nuevo lead, Contactado, Propuesta enviada, Negociación, Cliente activo, Pausado, Finalizado o Perdido/Descartado). Arrastra su tarjeta en el Kanban o cámbiala desde la tabla o su ficha. El valor en € que ves por columna se calcula solo, a partir de los contratos activos de cada cliente.</p></article>
    <article><h4>Contratos y facturas</h4><p>Cada contrato activo genera solo sus facturas según la periodicidad (mensual, anual o puntual). Cada factura puede cobrarse en varios pagos parciales: la barra de progreso muestra lo cobrado y lo pendiente, y el estado (Emitida, Parcial, Pagada, Anulada) se calcula solo a partir de esos pagos.</p></article>
    <article><h4>Datos del CRM</h4><p>Toda la información se guarda en el servidor local de tu equipo, protegida con tu usuario y contraseña. Descarga copias de seguridad periódicas desde "Ajustes generales" o el botón de la esquina superior.</p></article>
  </div>`;
}

/* ===================== Gráficos ===================== */
let chartServicesInstance = null, chartBudgetsInstance = null;
function drawCharts(topServices, statusGroups){
  setTimeout(()=>{
    const c1 = document.getElementById('chartServices');
    if(chartServicesInstance){chartServicesInstance.destroy(); chartServicesInstance=null;}
    if(c1 && topServices.length){
      chartServicesInstance = new Chart(c1, {
        type:'bar',
        data:{labels:topServices.map(x=>x.name), datasets:[{label:'Beneficio neto', data:topServices.map(x=>Math.round(x.net)), backgroundColor:'#0f766e', borderRadius:6, maxBarThickness:44}]},
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+money(c.raw)}}},
          scales:{x:{ticks:{autoSkip:false, maxRotation:0, callback:(v,i)=>String(topServices[i].name).length>14?String(topServices[i].name).slice(0,13)+'…':topServices[i].name}}, y:{beginAtZero:true, ticks:{callback:v=>money(v)}}}
        }
      });
    }
    const c2 = document.getElementById('chartBudgets');
    if(chartBudgetsInstance){chartBudgetsInstance.destroy(); chartBudgetsInstance=null;}
    const labels = Object.keys(statusGroups), vals = Object.values(statusGroups);
    if(c2 && labels.length){
      chartBudgetsInstance = new Chart(c2, {
        type:'doughnut',
        data:{labels, datasets:[{data:vals, backgroundColor:['#0f766e','#2563eb','#f59e0b','#be123c','#15803d','#7c3aed','#0891b2'], borderWidth:0}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:12, padding:14}}}}
      });
    }
  }, 30);
}
