// Envoltorio ligero para llamar a la API con sesión de cookies.
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let payload = null;
  try { payload = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error((payload && payload.error) || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}
function toast(msg, kind = 'ok') {
  const box = document.getElementById('toasts');
  if (!box) { alert(msg); return; }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
