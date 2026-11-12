require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const express = require('express');
const session = require('express-session');
const { db, persist, THUMBS_DIR } = require('./store');
const { requireAuth, requireSection } = require('./middleware');

const data = db(); // fuerza la carga/creación inicial del fichero de datos

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

// Si publicas el CRM detrás de un proxy inverso con HTTPS (Nginx, Nginx Proxy
// Manager, Caddy, el reverse proxy de un NAS...), define estas dos variables de
// entorno para que las cookies de sesión solo viajen por HTTPS y Express confíe
// en la cabecera que le indica el proxy. En local / app de escritorio (HTTP
// plano) se dejan sin definir y todo sigue funcionando igual que antes.
//   RCP_TRUST_PROXY=1
//   RCP_COOKIE_SECURE=1
if (process.env.RCP_TRUST_PROXY === '1') app.set('trust proxy', 1);

// Cabeceras de seguridad básicas. No sustituyen a un reverse proxy con HTTPS,
// pero cuestan cero y reducen el riesgo de clickjacking / MIME sniffing si el
// CRM acaba expuesto a internet.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json());
app.use(session({
  name: 'crm_rcp_sid',
  secret: data.meta.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.RCP_COOKIE_SECURE === '1',
    maxAge: 1000 * 60 * 60 * 24 * 14 // 14 días
  }
}));

// --- API ---
// requireSection('<clave>') bloquea la ruta (403) para un usuario no-admin al
// que se le haya quitado esa sección del menú (AC9) — /api/auth y /api/users
// se quedan fuera porque /me (perfil propio) tiene que seguir accesible a
// cualquiera, y la gestión de usuarios ya está protegida por requireAdmin.
app.use('/api/auth', require('./routes/auth').router);
app.use('/api/users', require('./routes/users'));
app.use('/api/config', requireSection('settings'), require('./routes/config'));
app.use('/api/pipeline', requireSection('clients'), require('./routes/pipeline'));
app.use('/api/clients', requireSection('clients'), require('./routes/clients'));
app.use('/api/services', requireSection('catalog'), require('./routes/services'));
app.use('/api/budgets', requireSection('budgets'), require('./routes/budgets'));
app.use('/api/budget-templates', requireSection('budgets'), require('./routes/budget-templates'));
app.use('/api/hours', requireSection('hours'), require('./routes/hours'));
app.use('/api/clock', requireSection('hours'), require('./routes/clock'));
app.use('/api/costs', requireSection('catalog'), require('./routes/costs'));
app.use('/api/contracted', requireSection('contracted'), require('./routes/contracted'));
// Nota: "Cobros" (routes/charges.js) se fusionó dentro de Facturas (pagos parciales
// por factura). El fichero se deja sin usar por si hiciera falta consultar el
// histórico antiguo, igual que routes/resources.js.
app.use('/api/invoices', requireSection('invoices'), require('./routes/invoices'));
app.use('/api/dashboard', requireSection('dashboard'), require('./routes/dashboard'));
app.use('/api/ai', requireSection('budgets'), require('./routes/ai'));
app.use('/api/kanban', requireSection('kanban'), require('./routes/kanban'));
app.use('/api/emails', requireSection('email'), require('./routes/emails'));

app.get('/api/export', requireAuth, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="copia_seguridad_crm.json"');
  res.json(db());
});

// --- Frontend estático ---
// El frontend nuevo (React, plan Fase 3) es el principal; la interfaz antigua
// sigue disponible en /legacy mientras se completa su paridad funcional
// (checklist en plan.md). Si todavía no se ha hecho `npm run build --prefix web`,
// PUBLIC_REACT_DIR no existe y la app cae automáticamente a la interfaz antigua.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PUBLIC_REACT_DIR = path.join(__dirname, '..', 'public-react');
const hasReactBuild = require('fs').existsSync(path.join(PUBLIC_REACT_DIR, 'index.html'));

app.use('/legacy', express.static(PUBLIC_DIR));
app.use(express.static(hasReactBuild ? PUBLIC_REACT_DIR : PUBLIC_DIR));
if (hasReactBuild) {
  // La página de /legacy/ referencia sus assets con rutas absolutas (/css/..,
  // /js/..), no relativas a /legacy/. Este estático de respaldo en la raíz hace
  // que esas rutas sigan resolviendo bien aunque React sea ahora el principal
  // (sin esto, el catch-all de React las interceptaría y servirían su index.html
  // en vez del CSS/JS real). No hay colisión de nombres: React solo usa /assets.
  app.use(express.static(PUBLIC_DIR));
}
// Miniaturas de la web de cada cliente, capturadas desde la app de escritorio.
app.use('/thumbnails', requireAuth, express.static(THUMBS_DIR));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No encontrado.' });
  if (req.path.startsWith('/legacy')) return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  res.sendFile(path.join(hasReactBuild ? PUBLIC_REACT_DIR : PUBLIC_DIR, 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
  console.log('==============================================');
  console.log('  CRM RCP Digital funcionando');
  console.log(`  Abre en tu navegador: http://localhost:${PORT}`);
  console.log('  Para detenerlo, cierra esta ventana o pulsa Ctrl+C');
  console.log('==============================================');
});

// Exportado para poder embeber el servidor dentro de la app de escritorio Electron:
// así sabe cuándo el servidor ya está escuchando antes de cargar la ventana.
module.exports = { app, server, PORT };
