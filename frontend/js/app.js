// =====================================================================
//  LIMPIA EL PARCHE - Lógica de la página pública
//  RF-001 acceso al formulario · RF-002 datos básicos · RF-003 ubicación
//  RF-004 foto · RF-005 validación · RF-006 confirmación + mapa de calor
// =====================================================================
(() => {
  const CFG = window.LEP_CONFIG;
  const $ = (id) => document.getElementById(id);

  const estado = { lat: null, lng: null, localidad: null, foto: null, puntos: [] };

  // ---------------------------------------------------------------
  //  Notificaciones
  // ---------------------------------------------------------------
  let temporizadorToast;
  function toast(mensaje, tipo = '', duracion = 4000) {
    const t = $('toast');
    t.textContent = mensaje;
    t.className = `toast visible ${tipo}`;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.className = 'toast'; }, duracion);
  }

  // ---------------------------------------------------------------
  //  Mapa (Leaflet + OpenStreetMap/CARTO) y capa de calor
  // ---------------------------------------------------------------
  const mapa = L.map('mapa-calor', { zoomControl: false, minZoom: 10 }).setView(CFG.CENTRO, CFG.ZOOM);
  L.control.zoom({ position: 'bottomright' }).addTo(mapa);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);

  const capaCalor = L.heatLayer([], {
    radius: 30,
    blur: 24,
    maxZoom: 14,
    minOpacity: 0.35,
    gradient: { 0.2: '#7ed957', 0.45: '#c6e04a', 0.6: '#f4e04d', 0.8: '#f6a623', 1.0: '#e53935' }
  }).addTo(mapa);

  async function cargarMapaCalor() {
    try {
      const puntos = await API.mapa();
      estado.puntos = puntos.map(p => [p.lat, p.lng, p.peso]);
      capaCalor.setLatLngs(estado.puntos);
    } catch (e) {
      toast(e.message, 'error', 6000);
    }
  }

  let marcador = null;
  const iconoMarcador = L.divIcon({ className: '', html: '<div class="marcador-reporte"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

  function dentroDeBogota(lat, lng) {
    const b = CFG.BOGOTA;
    return lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
  }

  function fijarUbicacion(lat, lng, { centrar = false, buscarDireccion = true } = {}) {
    if (!dentroDeBogota(lat, lng)) {
      mostrarError('ubicacion', 'La ubicación debe estar dentro de Bogotá.');
      return;
    }
    estado.lat = Number(lat.toFixed(6));
    estado.lng = Number(lng.toFixed(6));
    if (!marcador) marcador = L.marker([lat, lng], { icon: iconoMarcador, keyboard: false }).addTo(mapa);
    else marcador.setLatLng([lat, lng]);
    if (centrar) mapa.setView([lat, lng], Math.max(mapa.getZoom(), 15));
    $('coords').textContent = `Coordenadas: ${estado.lat}, ${estado.lng}`;
    limpiarError('ubicacion');
    if (buscarDireccion) direccionDesdeCoordenadas(lat, lng);
  }

  function limpiarUbicacion() {
    estado.lat = estado.lng = estado.localidad = null;
    $('coords').textContent = '';
    if (marcador) { mapa.removeLayer(marcador); marcador = null; }
  }

  // Clic en el mapa -> selección manual (RF-003 A1/A2)
  mapa.on('click', (e) => fijarUbicacion(e.latlng.lat, e.latlng.lng));

  // ---------------------------------------------------------------
  //  Geocodificación con Nominatim (OpenStreetMap) - CC-002
  // ---------------------------------------------------------------
  const NOMINATIM = 'https://nominatim.openstreetmap.org';

  function extraerLocalidad(addr = {}) {
    return addr.city_district || addr.borough || addr.suburb || null;
  }

  async function direccionDesdeCoordenadas(lat, lng) {
    try {
      const r = await fetch(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`);
      if (!r.ok) return;
      const d = await r.json();
      const a = d.address || {};
      const via = [a.road, a.house_number].filter(Boolean).join(' # ');
      const barrio = a.neighbourhood || a.suburb || '';
      $('ubicacion').value = [via, barrio].filter(Boolean).join(', ') || (d.display_name || '').split(',').slice(0, 2).join(',');
      ultimaDireccionBuscada = $('ubicacion').value;
      estado.localidad = extraerLocalidad(a);
    } catch { /* sin dirección: las coordenadas son suficientes */ }
  }

  let ultimaDireccionBuscada = '';
  async function coordenadasDesdeDireccion() {
    const texto = $('ubicacion').value.trim();
    if (!texto || texto === ultimaDireccionBuscada) return;
    ultimaDireccionBuscada = texto;
    const b = CFG.BOGOTA;
    const url = `${NOMINATIM}/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=co&accept-language=es` +
      `&viewbox=${b.lngMin},${b.latMax},${b.lngMax},${b.latMin}&bounded=1&q=${encodeURIComponent(texto + ', Bogotá')}`;
    try {
      const r = await fetch(url);
      const lista = await r.json();
      if (!lista.length) {
        limpiarUbicacion();
        mostrarError('ubicacion', 'No encontramos esa dirección. Marca el punto directamente en el mapa.');
        return;
      }
      estado.localidad = extraerLocalidad(lista[0].address);
      fijarUbicacion(Number(lista[0].lat), Number(lista[0].lon), { centrar: true, buscarDireccion: false });
    } catch {
      mostrarError('ubicacion', 'No se pudo buscar la dirección. Marca el punto directamente en el mapa.');
    }
  }

  $('ubicacion').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); coordenadasDesdeDireccion(); }
  });
  $('ubicacion').addEventListener('change', coordenadasDesdeDireccion);

  // Geolocalización automática (RF-003 flujo principal)
  $('btn-gps').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      mostrarError('ubicacion', 'Tu navegador no permite obtener la ubicación. Selecciona el punto en el mapa.');
      return;
    }
    $('coords').textContent = 'Obteniendo tu ubicación…';
    navigator.geolocation.getCurrentPosition(
      (pos) => fijarUbicacion(pos.coords.latitude, pos.coords.longitude, { centrar: true }),
      (err) => {
        $('coords').textContent = estado.lat ? `Coordenadas: ${estado.lat}, ${estado.lng}` : '';
        mostrarError('ubicacion', err.code === 1
          ? 'No diste permiso de ubicación. Selecciona el punto manualmente en el mapa.'      // A2
          : 'No pudimos obtener tu ubicación. Selecciona el punto manualmente en el mapa.');  // A1
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });

  // ---------------------------------------------------------------
  //  Catálogo de tipos de residuo (RF-002 + A1)
  // ---------------------------------------------------------------
  async function cargarTipos() {
    const select = $('tipo');
    const aviso = $('error-catalogo');
    select.innerHTML = '<option value="">Cargando tipos…</option>';
    aviso.hidden = true;
    try {
      const tipos = await API.tipos();
      select.innerHTML = tipos.map(t => `<option value="${t.id_tipo}">${t.nombre}</option>`).join('');
      // El primer tipo queda seleccionado, igual que en el mockup ("Household Trash")
    } catch (e) {
      select.innerHTML = '<option value="">No disponible</option>';
      aviso.innerHTML = 'No se pudo cargar la lista de tipos de residuo.<button type="button" id="btn-reintentar">Reintentar</button>';
      aviso.hidden = false;
      $('btn-reintentar').addEventListener('click', cargarTipos);
    }
  }

  // Contador de caracteres
  $('descripcion').addEventListener('input', (e) => {
    $('contador').textContent = `${e.target.value.length} / 500`;
    if (e.target.value.trim().length >= 10) limpiarError('descripcion');
  });
  $('tipo').addEventListener('change', () => limpiarError('id_tipo'));

  // ---------------------------------------------------------------
  //  Evidencia fotográfica (RF-004)
  // ---------------------------------------------------------------
  $('btn-foto').addEventListener('click', () => $('foto').click());
  $('foto').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!['image/jpeg', 'image/png'].includes(archivo.type)) {
      quitarFoto();
      mostrarError('foto', 'Solo se permiten imágenes JPG o PNG.');
      return;
    }
    if (archivo.size > CFG.MAX_FOTO_MB * 1024 * 1024) {
      quitarFoto();
      mostrarError('foto', `La foto pesa ${(archivo.size / 1048576).toFixed(1)} MB. El máximo permitido es ${CFG.MAX_FOTO_MB} MB.`);
      return;
    }
    limpiarError('foto');
    estado.foto = archivo;
    $('foto-mini').src = URL.createObjectURL(archivo);
    $('foto-nombre').textContent = archivo.name.length > 22 ? archivo.name.slice(0, 20) + '…' : archivo.name;
    $('foto-preview').hidden = false;
  });
  function quitarFoto() {
    estado.foto = null;
    $('foto').value = '';
    $('foto-preview').hidden = true;
  }
  $('btn-quitar-foto').addEventListener('click', quitarFoto);

  // ---------------------------------------------------------------
  //  Validación (RF-005)
  // ---------------------------------------------------------------
  const camposPorClave = { id_tipo: 'campo-tipo', descripcion: 'campo-descripcion', ubicacion: 'campo-ubicacion', foto: 'campo-foto' };

  function mostrarError(clave, mensaje) {
    const span = $(`err-${clave}`);
    if (span) span.textContent = mensaje;
    const campo = $(camposPorClave[clave]);
    if (campo) campo.classList.add('invalido');
  }
  function limpiarError(clave) {
    const span = $(`err-${clave}`);
    if (span) span.textContent = '';
    const campo = $(camposPorClave[clave]);
    if (campo) campo.classList.remove('invalido');
  }

  function validar() {
    const errores = {};
    if (!$('tipo').value) errores.id_tipo = 'Selecciona el tipo de residuo.';
    const desc = $('descripcion').value.trim();
    if (!desc) errores.descripcion = 'Escribe una descripción del problema.';
    else if (desc.length < 10) errores.descripcion = 'Describe el problema con al menos 10 caracteres.';
    if (estado.lat === null) errores.ubicacion = 'Marca la ubicación en el mapa, escribe una dirección o usa tu ubicación.';
    return errores;
  }

  function aplicarErrores(errores) {
    Object.keys(camposPorClave).forEach(limpiarError);
    Object.entries(errores).forEach(([k, v]) => mostrarError(k, v));
    const primero = Object.keys(errores)[0];
    if (primero) {
      const foco = { id_tipo: 'tipo', descripcion: 'descripcion', ubicacion: 'ubicacion', foto: 'btn-foto' }[primero];
      $(foco).focus();
    }
  }

  // ---------------------------------------------------------------
  //  Resumen y confirmación (RF-006)
  // ---------------------------------------------------------------
  const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  $('form-reporte').addEventListener('submit', (e) => {
    e.preventDefault();
    const errores = validar();
    if (Object.keys(errores).length) { aplicarErrores(errores); return; }
    aplicarErrores({});
    const tipoTexto = $('tipo').selectedOptions[0].textContent;
    const filas = [
      ['Tipo', tipoTexto],
      ['Descripción', $('descripcion').value.trim()],
      ['Ubicación', $('ubicacion').value.trim() || 'Punto marcado en el mapa'],
      ['Coordenadas', `${estado.lat}, ${estado.lng}`]
    ];
    if (estado.localidad) filas.push(['Localidad', estado.localidad]);
    let html = filas.map(([k, v]) => `<dt>${k}</dt><dd>${escapar(v)}</dd>`).join('');
    html += `<dt>Foto</dt><dd>${estado.foto ? `<img src="${$('foto-mini').src}" alt="Foto adjunta">` : 'Sin foto (opcional)'}</dd>`;
    $('resumen').innerHTML = html;
    $('modal-resumen').showModal();
  });

  // A1: cancelar antes de confirmar -> no se almacena
  $('btn-cancelar').addEventListener('click', () => {
    $('modal-resumen').close();
    toast('El reporte no se envió. Puedes seguir editándolo.');
  });

  $('btn-confirmar').addEventListener('click', async () => {
    const boton = $('btn-confirmar');
    boton.disabled = true;
    boton.textContent = 'Enviando…';
    const fd = new FormData();
    fd.append('id_tipo', $('tipo').value);
    fd.append('descripcion', $('descripcion').value.trim());
    fd.append('latitud', estado.lat);
    fd.append('longitud', estado.lng);
    fd.append('direccion', $('ubicacion').value.trim());
    if (estado.localidad) fd.append('localidad', estado.localidad);
    fd.append('website', $('website').value);
    if (estado.foto) fd.append('foto', estado.foto);

    try {
      const r = await API.crearReporte(fd);
      $('modal-resumen').close();
      estado.puntos.push([estado.lat, estado.lng, 1]);
      capaCalor.setLatLngs(estado.puntos);
      toast(`Reporte enviado. Tu código es ${r.codigo}. Guárdalo para consultar el estado.`, 'exito', 9000);
      reiniciarFormulario();
    } catch (err) {
      $('modal-resumen').close();
      if (err.errores) aplicarErrores(err.errores);
      toast(err.message, 'error', 6000);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Confirmar envío';
    }
  });

  function reiniciarFormulario() {
    $('form-reporte').reset();
    if ($('tipo').options.length) $('tipo').selectedIndex = 0;
    $('contador').textContent = '0 / 500';
    ultimaDireccionBuscada = '';
    quitarFoto();
    limpiarUbicacion();
  }

  // ---------------------------------------------------------------
  //  Navegación entre vistas (RF-001)
  // ---------------------------------------------------------------
  function mostrarVista() {
    const vista = (location.hash || '#mapa').slice(1);
    const esInicio = vista === 'inicio';
    $('vista-inicio').hidden = !esInicio;
    $('vista-mapa').hidden = esInicio;
    document.querySelectorAll('.nav a[data-vista]').forEach(a => a.classList.toggle('activo', a.dataset.vista === vista));
    $('nav').classList.remove('abierto');
    $('nav-toggle').setAttribute('aria-expanded', 'false');

    if (esInicio) { cargarResumen(); return; }
    setTimeout(() => mapa.invalidateSize(), 0);
    if (vista === 'reportar') {
      const tarjeta = $('tarjeta-reporte');
      tarjeta.classList.add('resaltada');
      tarjeta.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => $('tipo').focus({ preventScroll: true }), 200);
      setTimeout(() => tarjeta.classList.remove('resaltada'), 1600);
    }
  }
  window.addEventListener('hashchange', mostrarVista);

  $('nav-toggle').addEventListener('click', () => {
    const abierto = $('nav').classList.toggle('abierto');
    $('nav-toggle').setAttribute('aria-expanded', String(abierto));
  });

  // ---------------------------------------------------------------
  //  Inicio: cifras y consulta de estado
  // ---------------------------------------------------------------
  async function cargarResumen() {
    try {
      const r = await API.resumen();
      $('cifra-total').textContent = r.total;
      $('cifra-atendidos').textContent = r.atendidos;
      $('cifra-localidad').textContent = r.localidadTop || '—';
    } catch { /* las cifras quedan con guion */ }
  }

  const NOMBRE_ESTADO = { PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', ATENDIDO: 'Atendido', RECHAZADO: 'Rechazado' };
  async function consultarCodigo() {
    const codigo = $('codigo-consulta').value.trim();
    const salida = $('resultado-consulta');
    if (!codigo) { salida.textContent = 'Escribe el código que recibiste al enviar el reporte.'; return; }
    salida.textContent = 'Buscando…';
    try {
      const r = await API.consultar(codigo);
      salida.innerHTML = `<strong>${escapar(r.codigo_unico)}</strong>: ${NOMBRE_ESTADO[r.estado_reporte] || r.estado_reporte}<br>` +
        `${escapar(r.tipo_residuo)}${r.localidad ? ' · ' + escapar(r.localidad) : ''} · ${new Date(String(r.fecha_hora).replace(' ', 'T')).toLocaleDateString('es-CO')}`;
    } catch (e) {
      salida.textContent = e.message;
    }
  }
  $('btn-consultar').addEventListener('click', consultarCodigo);
  $('codigo-consulta').addEventListener('keydown', (e) => { if (e.key === 'Enter') consultarCodigo(); });

  // ---------------------------------------------------------------
  //  Arranque
  // ---------------------------------------------------------------
  if (API.modoDemo) $('cinta-demo').hidden = false;
  cargarTipos();
  cargarMapaCalor();
  mostrarVista();
})();
