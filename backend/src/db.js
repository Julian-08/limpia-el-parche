// Conexión a MySQL mediante un pool de conexiones (mysql2/promise)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'limpia_el_parche',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: 'local'
});

// Registro de auditoría (R5 - ISO 27001 control 8.15)
async function registrarLog({ idUsuario = null, accion, entidad, idEntidad = null, detalle = null, ip = null }) {
  try {
    await pool.query(
      'INSERT INTO log_auditoria (id_usuario, accion, entidad, id_entidad, detalle, ip) VALUES (?,?,?,?,?,?)',
      [idUsuario, accion, entidad, idEntidad, detalle ? String(detalle).slice(0, 500) : null, ip]
    );
  } catch (e) {
    console.error('No se pudo registrar el log:', e.message);
  }
}

module.exports = { pool, registrarLog };
