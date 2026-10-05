// Rutas públicas de reportes ciudadanos (RF-001 a RF-006)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { pool, registrarLog } = require('../db');

const router = express.Router();

// Límites geográficos de Bogotá D.C. (zona urbana)
const BOGOTA = { latMin: 4.45, latMax: 4.85, lngMin: -74.25, lngMax: -73.98 };
const MAX_FOTO_MB = 5;

// ---------- Subida de fotografía (RF-004) ----------
const carpetaUploads = path.join(__dirname, '..', '..', 'uploads');
const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => cb(null, carpetaUploads),
  filename: (req, file, cb) => {
    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const subirFoto = multer({
  storage: almacenamiento,
  limits: { fileSize: MAX_FOTO_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
    const err = new Error('Solo se permiten imágenes JPG o PNG.');
    err.code = 'TIPO_ARCHIVO';
    cb(err);
  }
}).single('foto');

// ---------- Anti-spam (R4, R6): máximo 5 reportes por IP cada 10 minutos ----------
const limiteReportes = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    registrarLog({ accion: 'SPAM_BLOQUEADO', entidad: 'reporte', detalle: 'Límite de 5 reportes / 10 min', ip: req.ip });
    res.status(429).json({ mensaje: 'Enviaste varios reportes seguidos. Espera unos minutos e inténtalo de nuevo.' });
  }
});

function borrarArchivo(file) {
  if (file) fs.unlink(file.path, () => {});
}

function generarCodigo() {
  const f = new Date();
  const fecha = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
  return `LEP-${fecha}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// GET /api/reportes/tipos  -> catálogo de tipos de residuo (RF-002)
router.get('/tipos', async (req, res, next) => {
  try {
    const [filas] = await pool.query(
      'SELECT id_tipo, nombre, descripcion FROM tipo_residuo WHERE activo = 1 ORDER BY orden, nombre'
    );
    res.json(filas);
  } catch (e) { next(e); }
});

// GET /api/reportes/mapa?tipo=ID -> puntos para el mapa de calor
router.get('/mapa', async (req, res, next) => {
  try {
    const params = [];
    let sql = "SELECT latitud AS lat, longitud AS lng, estado_reporte AS estado FROM reporte WHERE estado_reporte <> 'RECHAZADO'";
    if (req.query.tipo) { sql += ' AND id_tipo = ?'; params.push(Number(req.query.tipo)); }
    const [filas] = await pool.query(sql, params);
    // Los reportes ya atendidos pesan menos en el mapa de calor
    res.json(filas.map(f => ({ lat: f.lat, lng: f.lng, peso: f.estado === 'ATENDIDO' ? 0.3 : 1 })));
  } catch (e) { next(e); }
});

// GET /api/reportes/resumen -> cifras de la página de inicio
router.get('/resumen', async (req, res, next) => {
  try {
    const [[totales]] = await pool.query(`
      SELECT COUNT(*) AS total,
             SUM(estado_reporte = 'ATENDIDO') AS atendidos,
             SUM(estado_reporte IN ('PENDIENTE','EN_REVISION')) AS abiertos
      FROM reporte WHERE estado_reporte <> 'RECHAZADO'`);
    const [top] = await pool.query('SELECT localidad, total FROM v_reportes_por_localidad LIMIT 1');
    res.json({
      total: Number(totales.total || 0),
      atendidos: Number(totales.atendidos || 0),
      abiertos: Number(totales.abiertos || 0),
      localidadTop: top[0] ? top[0].localidad : null
    });
  } catch (e) { next(e); }
});

// GET /api/reportes/:codigo -> consulta pública del estado de un reporte
router.get('/:codigo', async (req, res, next) => {
  try {
    const [filas] = await pool.query(
      'SELECT codigo_unico, tipo_residuo, localidad, estado_reporte, fecha_hora FROM v_reportes_detalle WHERE codigo_unico = ?',
      [req.params.codigo.toUpperCase()]
    );
    if (!filas.length) return res.status(404).json({ mensaje: 'No existe un reporte con ese código.' });
    res.json(filas[0]);
  } catch (e) { next(e); }
});

// POST /api/reportes -> registrar un reporte (RF-005 validación + RF-006 confirmación)
router.post('/', limiteReportes, (req, res, next) => {
  subirFoto(req, res, async (errSubida) => {
    if (errSubida) {
      const msg = errSubida.code === 'LIMIT_FILE_SIZE'
        ? `La foto supera el tamaño máximo de ${MAX_FOTO_MB} MB.`
        : errSubida.message;
      return res.status(400).json({ errores: { foto: msg } });
    }

    try {
      const b = req.body;

      // Campo trampa (honeypot): los bots lo llenan, las personas no lo ven
      if (b.website) {
        borrarArchivo(req.file);
        registrarLog({ accion: 'SPAM_BLOQUEADO', entidad: 'reporte', detalle: 'Honeypot diligenciado', ip: req.ip });
        return res.status(400).json({ mensaje: 'No se pudo registrar el reporte.' });
      }

      const idTipo = Number(b.id_tipo);
      const descripcion = String(b.descripcion || '').trim();
      const lat = Number(b.latitud);
      const lng = Number(b.longitud);
      const direccion = String(b.direccion || '').trim().slice(0, 255) || null;
      const localidad = String(b.localidad || '').trim().slice(0, 60) || null;

      // ---- Validación de campos obligatorios (RF-005) ----
      const errores = {};
      if (!Number.isInteger(idTipo) || idTipo <= 0) errores.id_tipo = 'Selecciona el tipo de residuo.';
      if (descripcion.length < 10) errores.descripcion = 'Describe el problema con al menos 10 caracteres.';
      if (descripcion.length > 500) errores.descripcion = 'La descripción admite máximo 500 caracteres.';
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        errores.ubicacion = 'Marca la ubicación en el mapa o usa tu ubicación actual.';
      } else if (lat < BOGOTA.latMin || lat > BOGOTA.latMax || lng < BOGOTA.lngMin || lng > BOGOTA.lngMax) {
        errores.ubicacion = 'La ubicación debe estar dentro de Bogotá.';
      }
      if (!errores.id_tipo) {
        const [t] = await pool.query('SELECT id_tipo FROM tipo_residuo WHERE id_tipo = ? AND activo = 1', [idTipo]);
        if (!t.length) errores.id_tipo = 'El tipo de residuo no es válido.';
      }
      if (Object.keys(errores).length) {
        borrarArchivo(req.file);
        return res.status(400).json({ errores });
      }

      // ---- Duplicado: misma IP y misma descripción en los últimos 10 minutos ----
      const [dup] = await pool.query(
        'SELECT id_reporte FROM reporte WHERE ip_origen = ? AND descripcion = ? AND fecha_hora > NOW() - INTERVAL 10 MINUTE',
        [req.ip, descripcion]
      );
      if (dup.length) {
        borrarArchivo(req.file);
        return res.status(409).json({ mensaje: 'Ya registraste este mismo reporte hace unos minutos.' });
      }

      // ---- Guardar con identificador único (RF-006) ----
      const imagenUrl = req.file ? `/uploads/${req.file.filename}` : null;
      let codigo, insertado;
      for (let intento = 0; intento < 5 && !insertado; intento++) {
        codigo = generarCodigo();
        try {
          const [r] = await pool.query(
            `INSERT INTO reporte (codigo_unico, id_tipo, descripcion, latitud, longitud, direccion_texto, localidad, imagen_url, ip_origen)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [codigo, idTipo, descripcion, lat, lng, direccion, localidad, imagenUrl, req.ip]
          );
          insertado = r.insertId;
        } catch (e) {
          if (e.code !== 'ER_DUP_ENTRY') throw e;
        }
      }
      if (!insertado) throw new Error('No se pudo generar un código único.');

      await registrarLog({ accion: 'CREAR_REPORTE', entidad: 'reporte', idEntidad: codigo, ip: req.ip });
      res.status(201).json({ mensaje: 'Reporte enviado', codigo, id: insertado });
    } catch (e) {
      borrarArchivo(req.file);
      next(e);
    }
  });
});

module.exports = router;
