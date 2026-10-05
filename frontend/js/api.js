// =====================================================================
//  Capa de comunicación con la API REST (Controlador API)
// =====================================================================
class ErrorApi extends Error {
  constructor(mensaje, status = 0, errores = null) {
    super(mensaje);
    this.status = status;
    this.errores = errores;
  }
}

const API = (() => {
  const { API_URL, MODO_DEMO } = window.LEP_CONFIG;

  async function peticion(ruta, opciones = {}) {
    const headers = opciones.headers || {};
    const token = sessionStorage.getItem('lep_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opciones.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(opciones.json);
    }
    let res;
    try {
      res = await fetch(API_URL + ruta, { method: opciones.method || 'GET', headers, body: opciones.body });
    } catch {
      throw new ErrorApi('No hay conexión con el servidor. Verifica que el backend esté encendido (npm start).');
    }
    let datos = null;
    try { datos = await res.json(); } catch { /* respuesta sin cuerpo */ }
    if (!res.ok) {
      throw new ErrorApi((datos && datos.mensaje) || 'Revisa los campos marcados.', res.status, datos && datos.errores);
    }
    return datos;
  }

  // ---------------- Modo demostración (sin backend) ----------------
  const demo = {
    clave: 'lep_demo',
    leer() {
      try { return JSON.parse(localStorage.getItem(this.clave)) || { nuevos: [], estados: {} }; }
      catch { return { nuevos: [], estados: {} }; }
    },
    guardar(d) { try { localStorage.setItem(this.clave, JSON.stringify(d)); } catch { /* sin almacenamiento */ } },
    todos() {
      const d = this.leer();
      return [...window.LEP_DEMO.reportes, ...d.nuevos].map((r, i) => ({
        ...r, id_reporte: i + 1, estado: d.estados[r.codigo] || r.estado
      }));
    },
    esperar: (ms = 250) => new Promise(r => setTimeout(r, ms))
  };

  const demoApi = {
    async tipos() { await demo.esperar(); return window.LEP_DEMO.tipos; },
    async mapa() {
      return demo.todos().filter(r => r.estado !== 'RECHAZADO')
        .map(r => ({ lat: r.lat, lng: r.lng, peso: r.estado === 'ATENDIDO' ? 0.3 : 1 }));
    },
    async resumen() {
      const v = demo.todos().filter(r => r.estado !== 'RECHAZADO');
      const conteo = {};
      v.forEach(r => { conteo[r.localidad || 'Sin localidad'] = (conteo[r.localidad || 'Sin localidad'] || 0) + 1; });
      const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
      return { total: v.length, atendidos: v.filter(r => r.estado === 'ATENDIDO').length, localidadTop: top ? top[0] : null };
    },
    async consultar(codigo) {
      const r = demo.todos().find(x => x.codigo === codigo.toUpperCase());
      if (!r) throw new ErrorApi('No existe un reporte con ese código.', 404);
      return { codigo_unico: r.codigo, tipo_residuo: r.tipo_nombre, localidad: r.localidad, estado_reporte: r.estado, fecha_hora: r.fecha };
    },
    async crearReporte(fd) {
      await demo.esperar(500);
      const d = demo.leer();
      const hoy = new Date();
      const codigo = `LEP-${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
      const tipo = window.LEP_DEMO.tipos.find(t => String(t.id_tipo) === fd.get('id_tipo'));
      d.nuevos.push({
        codigo, tipo: Number(fd.get('id_tipo')), tipo_nombre: tipo ? tipo.nombre : '',
        descripcion: fd.get('descripcion'), lat: Number(fd.get('latitud')), lng: Number(fd.get('longitud')),
        direccion: fd.get('direccion'), localidad: fd.get('localidad') || null, estado: 'PENDIENTE',
        fecha: hoy.toISOString().slice(0, 19).replace('T', ' ')
      });
      demo.guardar(d);
      return { mensaje: 'Reporte enviado', codigo };
    },
    async login(correo, password) {
      await demo.esperar();
      if (correo.trim().toLowerCase() === 'admin@limpiaelparche.co' && password === 'Admin2026*') {
        return { token: 'demo', usuario: { nombre: 'Administrador LEP (demo)', rol: 'ADMINISTRADOR' } };
      }
      throw new ErrorApi('Correo o contraseña incorrectos. Verifica e inténtalo de nuevo.', 401);
    },
    async adminReportes(estado) {
      return demo.todos().filter(r => !estado || r.estado === estado)
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map(r => ({
          id_reporte: r.codigo, codigo_unico: r.codigo, tipo_residuo: r.tipo_nombre, descripcion: r.descripcion,
          latitud: r.lat, longitud: r.lng, direccion_texto: r.direccion, localidad: r.localidad,
          imagen_url: null, estado_reporte: r.estado, fecha_hora: r.fecha
        }));
    },
    async cambiarEstado(codigo, estado) {
      const d = demo.leer(); d.estados[codigo] = estado; demo.guardar(d);
      return { mensaje: 'Estado actualizado', estado };
    },
    async estadisticas() {
      const t = demo.todos();
      const agrupar = (lista, campo) => Object.entries(lista.reduce((a, r) => { a[r[campo] || 'Sin localidad'] = (a[r[campo] || 'Sin localidad'] || 0) + 1; return a; }, {}));
      const v = t.filter(r => r.estado !== 'RECHAZADO');
      return {
        porEstado: agrupar(t, 'estado').map(([estado, total]) => ({ estado, total })),
        porTipo: agrupar(v, 'tipo_nombre').map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
        porLocalidad: agrupar(v, 'localidad').map(([localidad, total]) => ({ localidad, total })).sort((a, b) => b.total - a.total).slice(0, 8)
      };
    },
    async corteMapa() { return { mensaje: 'Corte registrado (demo)', total_puntos: (await this.mapa()).length }; },
    async logs() { return []; }
  };

  // ---------------- API real ----------------
  const apiReal = {
    tipos: () => peticion('/api/reportes/tipos'),
    mapa: (tipo) => peticion('/api/reportes/mapa' + (tipo ? `?tipo=${encodeURIComponent(tipo)}` : '')),
    resumen: () => peticion('/api/reportes/resumen'),
    consultar: (codigo) => peticion('/api/reportes/' + encodeURIComponent(codigo.trim())),
    crearReporte: (formData) => peticion('/api/reportes', { method: 'POST', body: formData }),
    login: (correo, password) => peticion('/api/auth/login', { method: 'POST', json: { correo, password } }),
    adminReportes: (estado) => peticion('/api/admin/reportes' + (estado ? `?estado=${estado}` : '')),
    cambiarEstado: (id, estado) => peticion(`/api/admin/reportes/${id}/estado`, { method: 'PATCH', json: { estado } }),
    estadisticas: () => peticion('/api/admin/estadisticas'),
    corteMapa: (filtro, zoom) => peticion('/api/admin/mapa/corte', { method: 'POST', json: { filtro, zoom } }),
    logs: () => peticion('/api/admin/logs')
  };

  return { ...(MODO_DEMO ? demoApi : apiReal), modoDemo: MODO_DEMO, URL: API_URL };
})();
