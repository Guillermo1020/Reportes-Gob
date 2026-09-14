const reportForm = document.querySelector('#report-form');
const reportMessage = document.querySelector('#report-message');
const photoInput = document.querySelector('#photo-input');
const imagePreview = document.querySelector('#image-preview');
const previewImage = document.querySelector('#preview-image');
const previewName = document.querySelector('#preview-name');
const locationButton = document.querySelector('#location-button');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const reportGroups = document.querySelector('#report-groups');
const statusSummary = document.querySelector('#status-summary');
const trackingForm = document.querySelector('#tracking-form');
const trackingResult = document.querySelector('#tracking-result');
let trackingTimer;

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return;
  imagePreview.hidden = false;
  previewImage.src = URL.createObjectURL(file);
  previewName.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
});

locationButton.addEventListener('click', () => {
  if (!navigator.geolocation) return setMessage(reportMessage, 'Tu navegador no permite obtener ubicación.', 'error');
  locationButton.textContent = 'Obteniendo ubicación...';
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    reportForm.latitude.value = coords.latitude.toFixed(7);
    reportForm.longitude.value = coords.longitude.toFixed(7);
    locationButton.textContent = '✓ Ubicación agregada';
  }, () => {
    locationButton.textContent = '⊙  Usar mi ubicación actual';
    setMessage(reportMessage, 'No se pudo obtener la ubicación. Puedes escribir la dirección.', 'error');
  });
});

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = reportForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';
  try {
    const response = await fetch('/api/reports', { method: 'POST', body: new FormData(reportForm) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    reportForm.reset();
    imagePreview.hidden = true;
    previewImage.removeAttribute('src');
    previewName.textContent = '';
    locationButton.textContent = '⊙  Usar mi ubicación actual';
    setMessage(reportMessage, `Reporte recibido. Folio #${result.id}. Gracias por ayudar a cuidar tu ciudad.`, 'success');
  } catch (error) {
    setMessage(reportMessage, error.message || 'No se pudo enviar el reporte.', 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Enviar reporte <span>→</span>';
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(loginForm))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    loginForm.reset();
    loginView.hidden = true;
    dashboardView.hidden = false;
    loadReports();
  } catch (error) {
    setMessage(loginMessage, error.message, 'error');
  }
});

// Consulta un caso por folio y repite la consulta para reflejar cambios recientes.
trackingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const folio = String(new FormData(trackingForm).get('folio') || '').replace(/^\s*#/, '').trim();
  if (!/^\d+$/.test(folio)) {
    trackingResult.innerHTML = '<p class="form-message error">Escribe un folio válido, por ejemplo #24.</p>';
    return;
  }
  await loadPublicTracking(folio);
  clearInterval(trackingTimer);
  trackingTimer = setInterval(() => loadPublicTracking(folio), 5000);
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  dashboardView.hidden = true;
  loginView.hidden = false;
  reportGroups.innerHTML = '';
});

async function loadReports() {
  const response = await fetch('/api/reports');
  const reports = await response.json();
  if (!response.ok) return setMessage(loginMessage, reports.error, 'error');
  const counts = reports.reduce((result, report) => ({ ...result, [report.status]: (result[report.status] || 0) + 1 }), {});
  statusSummary.innerHTML = [['pendiente', 'Pendientes'], ['proceso', 'En proceso'], ['resuelto', 'Resueltos'], ['denegado', 'Denegados']].map(([key, label]) => `<span class="summary-pill"><strong>${counts[key] || 0}</strong> ${label}</span>`).join('');
  const statusGroups = [['pendiente', 'Pendientes', 'pending'], ['proceso', 'En proceso', 'process'], ['resuelto', 'Casos resueltos', 'resolved'], ['denegado', 'Casos denegados', 'denied']];
  reportGroups.innerHTML = reports.length ? statusGroups.map(([status, label, className]) => `<details class="status-group ${className}" ${status === 'pendiente' ? 'open' : ''}><summary>${label} (${counts[status] || 0})</summary><div class="report-grid">${reports.filter((report) => report.status === status).map(renderReport).join('') || '<p>No hay casos en este estado.</p>'}</div></details>`).join('') : '<p>Aún no hay reportes registrados.</p>';
  reportGroups.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => updateStatus(button.dataset.id, button.dataset.status)));
}

function renderReport(report) {
  const date = new Date(report.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  const reporterName = report.reporter_name ? escapeHtml(report.reporter_name) : 'Anónimo';
  const reporterPhone = report.reporter_phone ? escapeHtml(report.reporter_phone) : 'No proporcionado';

  return `<article class="report-card ${report.status}">
    <div class="report-photo" style="background-image:url('${report.photo_path}')"></div>
    <h4>#${report.id} · ${escapeHtml(report.address)}</h4>
    <p>${escapeHtml(report.description)}</p>
    <p class="card-meta"><strong>Reportó:</strong> ${reporterName} | <strong>Tel:</strong> ${reporterPhone}</p>
    <p class="card-meta">${report.status} · ${date}</p>
    <div class="status-buttons">
      <button data-id="${report.id}" data-status="resuelto">Caso resuelto</button>
      <button data-id="${report.id}" data-status="proceso">En proceso</button>
      <button data-id="${report.id}" data-status="denegado">Denegado</button>
    </div>
  </article>`;
}

// Muestra el estado actual de un folio sin pedir autenticación al ciudadano.
async function loadPublicTracking(folio) {
  trackingResult.innerHTML = '<p>Consultando tu caso...</p>';
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(folio)}/public`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('El servidor no devolvió una respuesta válida. Reinicia el backend.');
    const report = await response.json();
    if (!response.ok) throw new Error(report.error);
    const statusLabels = { pendiente: 'Pendiente de revisión', proceso: 'En proceso', resuelto: 'Caso resuelto', denegado: 'Caso denegado' };
    const updated = new Date(report.updated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    trackingResult.innerHTML = `<article class="tracking-card ${report.status}"><p class="tracking-status">Folio #${report.id} · ${statusLabels[report.status]}</p><h3>${escapeHtml(report.category)}</h3><p>${escapeHtml(report.description)}</p><p><strong>Ubicación:</strong> ${escapeHtml(report.address)}<br><strong>Última actualización:</strong> ${updated}</p></article>`;
  } catch (error) {
    trackingResult.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`;
  }
}

async function updateStatus(id, status) {
  const response = await fetch(`/api/reports/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  if (response.ok) loadReports();
}

function setMessage(element, message, type) {
  element.textContent = message;
  element.className = `form-message ${type}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}
