// =====================================================================
//  LIMPIA EL PARCHE - Servidor Web / API Service (Node.js + Express)
// =====================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en el archivo .env (copia .env.example como .env).');
  process.exit(1);
}

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Cabeceras básicas de seguridad (RNF-002)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// API REST
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.get('/api/salud', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

// Archivos estáticos: fotos subidas y frontend
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Rutas inexistentes de la API
app.use('/api', (req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada.' }));

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ mensaje: 'Ocurrió un error en el servidor. Inténtalo de nuevo en unos minutos.' });
});

// Crea el administrador inicial si no existe ninguno
async function asegurarAdministrador() {
  const [admins] = await pool.query("SELECT id_usuario FROM usuario WHERE rol = 'ADMINISTRADOR' LIMIT 1");
  if (admins.length) return;
  const correo = (process.env.ADMIN_EMAIL || 'admin@limpiaelparche.co').toLowerCase();
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin2026*', 10);
  const [r] = await pool.query(
    "INSERT INTO usuario (nombre_completo, correo_electronico, password_hash, rol) VALUES (?,?,?,'ADMINISTRADOR')",
    [process.env.ADMIN_NOMBRE || 'Administrador LEP', correo, hash]);
  await pool.query(
    "INSERT INTO administrador (id_usuario, area_asignada, fecha_asignacion, nivel_permisos) VALUES (?, 'Coordinación general', CURDATE(), 'TOTAL')",
    [r.insertId]);
  console.log(`Administrador inicial creado: ${correo}`);
}

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('Conectado a MySQL');
    await asegurarAdministrador();
  } catch (e) {
    console.error('\nNo se pudo conectar a MySQL:', e.message);
    console.error('Revisa que MySQL esté encendido, que hayas ejecutado database/01_esquema.sql y los datos de .env\n');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Limpia el Parche corriendo en http://localhost:${PORT}`));
})();
