// =====================================================================
//  Panel administrativo: login, estadísticas, mapa y moderación
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const NOMBRE_ESTADO = { PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', ATENDIDO: 'Atendido', RECHAZADO: 'Rechazado' };
  const COLOR_ESTADO = { PENDIENTE: '#e53935', EN_REVISION: '#f6a623', ATENDIDO: '#3da35d', RECHAZADO: '#9ca3af' };
  const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fecha = (f) => new Date(String(f).replace(' ', 'T')).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

  let temporizador;
  function toast(msg, tipo = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast visible ${tipo}`;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  $('nav-toggle').addEventListener('click', () => {
    const abierto = $('nav').classList.toggle('abierto');
    $('nav-toggle').setAttribute('aria-expanded', String(abierto));
  });

  // ---------------- Sesión ----------------
  function haySesion() { return !!sessionStorage.getItem('lep_token'); }

  function mostrarDashboard() {
    $('vista-login').hidden = true;
    $('vista-dashboard').hidden = false;
    $('sesion').hidden = false;
    document.querySelector('.app-frame').classList.add('dashboard');
    $('nombre-admin').textContent = sessionStorage.getItem('lep_nombre') || '';
    iniciarMapa();
    cargarTodo();
  }
  function mostrarLogin() {
    sessionStorage.removeItem('lep_token');
    sessionStorage.removeItem('lep_nombre');
    $('vista-login').hidden = false;
    $('vista-dashboard').hidden = true;
    $('sesion').hidden = true;
    document.querySelector('.app-frame').classList.remove('dashboard');
  }

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('error-login');
    err.hidden = true;
    const correo = $('correo').value.trim();
    const password = $('password').value;
    if (!correo || !password) {
      err.textContent = 'Escribe tu correo y tu contraseña.';
      err.hidden = false;
      return;
    }
    $('btn-login').disabled = true;
    try {
      const r = await API.login(correo, password);
      sessionStorage.setItem('lep_token', r.token);
      sessionStorage.setItem('lep_nombre', r.usuario.nombre);
      $('password').value = '';
      mostrarDashboard();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      $('btn-login').disabled = false;
    }
  });

  $('btn-salir').addEventListener('click', mostrarLogin);

  // Si el token expiró o no es válido, vuelve al login
  function manejarError(ex) {
    if (ex.status === 401 || ex.status === 403) {
      mostrarLogin();
      $('error-login').textContent = ex.message;
      $('error-login').hidden = false;
    } else {
      toast(ex.message, 'error');
    }
  }

  // ---------------- Mapa ----------------
  let mapa, capaPuntos;
  function iniciarMapa() {
    if (mapa) { setTimeout(() => mapa.invalidateSize(), 0); return; }
    mapa = L.map('mapa-admin').setView(window.LEP_CONFIG.CENTRO, 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);
    capaPuntos = L.layerGroup().addTo(mapa);
  }

  function pintarPuntos(reportes) {
    capaPuntos.clearLayers();
    reportes.forEach(r => {
      L.circleMarker([r.latitud, r.longitud], {
        radius: 6, color: '#fff', weight: 1.5, fillColor: COLOR_ESTADO[r.estado_reporte], fillOpacity: 0.9
      }).bindPopup(`<strong>${escapar(r.codigo_unico)}</strong><br>${escapar(r.tipo_residuo)} · ${NOMBRE_ESTADO[r.estado_reporte]}<br>${escapar(r.descripcion)}`)
        .addTo(capaPuntos);
    });
  }

  // ---------------- Datos ----------------
  async function cargarTodo() {
    await Promise.all([cargarEstadisticas(), cargarReportes(), cargarLogs()]);
  }

  function barras(contenedor, filas, etiqueta) {
    const max = Math.max(1, ...filas.map(f => Number(f.total)));
    $(contenedor).innerHTML = filas.map(f => `
      <div class="barra"><span>${escapar(f[etiqueta])}</span>
        <div class="barra-fondo"><div class="barra-relleno" style="width:${(Number(f.total) / max) * 100}%"></div></div>
        <b>${f.total}</b></div>`).join('') || '<p class="vacio">Sin datos</p>';
  }

  async function cargarEstadisticas() {
    try {
      const e = await API.estadisticas();
      const cont = Object.fromEntries(e.porEstado.map(x => [x.estado, Number(x.total)]));
      const total = Object.values(cont).reduce((a, b) => a + b, 0);
      $('kpis').innerHTML = [
        ['TOTAL', total, 'reportes recibidos'],
        ['PENDIENTE', cont.PENDIENTE || 0, 'pendientes'],
        ['EN_REVISION', cont.EN_REVISION || 0, 'en revisión'],
        ['ATENDIDO', cont.ATENDIDO || 0, 'atendidos']
      ].map(([c, n, t]) => `<div class="kpi ${c}"><strong>${n}</strong><span>${t}</span></div>`).join('');
      barras('barras-localidad', e.porLocalidad, 'localidad');
      barras('barras-tipo', e.porTipo, 'tipo');
    } catch (ex) { manejarError(ex); }
  }

  async function cargarReportes() {
    try {
      const reportes = await API.adminReportes($('filtro-estado').value);
      pintarPuntos(reportes);
      const opciones = (actual) => Object.entries(NOMBRE_ESTADO)
        .map(([v, t]) => `<option value="${v}" ${v === actual ? 'selected' : ''}>${t}</option>`).join('');
      $('tabla-reportes').innerHTML = reportes.map(r => `
        <tr>
          <td><strong>${escapar(r.codigo_unico)}</strong></td>
          <td>${fecha(r.fecha_hora)}</td>
          <td>${escapar(r.tipo_residuo)}</td>
          <td>${escapar(r.localidad || '—')}</td>
          <td class="desc">${escapar(r.descripcion)}${r.direccion_texto ? `<br><small>${escapar(r.direccion_texto)}</small>` : ''}</td>
          <td>${r.imagen_url ? `<a href="${API.URL}${escapar(r.imagen_url)}" target="_blank" rel="noopener">Ver</a>` : '—'}</td>
          <td><select class="control" data-id="${escapar(r.id_reporte)}" aria-label="Estado de ${escapar(r.codigo_unico)}">${opciones(r.estado_reporte)}</select></td>
        </tr>`).join('') || '<tr><td colspan="7" class="vacio">No hay reportes con este estado.</td></tr>';
    } catch (ex) { manejarError(ex); }
  }

  async function cargarLogs() {
    try {
      const logs = await API.logs();
      $('tabla-logs').innerHTML = logs.map(l => `
        <tr><td>${fecha(l.fecha)}</td><td>${escapar(l.accion)}</td><td>${escapar(l.entidad)}</td>
        <td>${escapar(l.id_entidad || '')}</td><td>${escapar(l.detalle || '')}</td>
        <td>${escapar(l.usuario || 'Ciudadano / sistema')}</td><td>${escapar(l.ip || '')}</td></tr>`).join('')
        || '<tr><td colspan="7" class="vacio">Sin eventos registrados.</td></tr>';
    } catch (ex) { manejarError(ex); }
  }

  // Cambio de estado (moderarReportes)
  $('tabla-reportes').addEventListener('change', async (e) => {
    if (e.target.tagName !== 'SELECT') return;
    const sel = e.target;
    sel.disabled = true;
    try {
      await API.cambiarEstado(sel.dataset.id, sel.value);
      toast(`Estado actualizado a "${NOMBRE_ESTADO[sel.value]}".`, 'exito');
      cargarTodo();
    } catch (ex) { manejarError(ex); }
    finally { sel.disabled = false; }
  });

  $('filtro-estado').addEventListener('change', cargarReportes);

  $('btn-corte').addEventListener('click', async () => {
    try {
      const r = await API.corteMapa($('filtro-estado').value || 'TODOS', mapa.getZoom());
      toast(`Corte del mapa registrado con ${r.total_puntos} puntos.`, 'exito');
      cargarLogs();
    } catch (ex) { manejarError(ex); }
  });

  // Arranque
  if (haySesion()) mostrarDashboard(); else mostrarLogin();
})();
