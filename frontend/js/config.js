// =====================================================================
//  Configuración del frontend
// =====================================================================
window.LEP_CONFIG = {
  // Si abres la página desde el servidor (http://localhost:3000) se usa la misma dirección.
  // Si la abres con Live Server u otro puerto, apunta al backend en el puerto 3000.
  API_URL: location.port === '3000' ? '' : 'http://localhost:3000',

  // true = funciona sin backend ni MySQL (datos de demostración guardados en el navegador).
  // Úsalo solo para mostrar el diseño; para las pruebas funcionales déjalo en false.
  MODO_DEMO: false,

  // Centro y zoom inicial del mapa (Bogotá)
  CENTRO: [4.651, -74.105],
  ZOOM: 12,

  // Límites de Bogotá para validar ubicaciones
  BOGOTA: { latMin: 4.45, latMax: 4.85, lngMin: -74.25, lngMax: -73.98 },

  MAX_FOTO_MB: 5
};
