// Panel administrativo (clase Administrador): moderar reportes, estadísticas, mapa
const express = require('express');
const { pool, registrarLog } = require('../db');
const { requiereAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereAdmin);

const ESTADOS = ['PENDIENTE', 'EN_REVISION', 'ATENDIDO', 'RECHAZADO'];

// GET /api/admin/reportes?estado=PENDIENTE&localidad=Kennedy
router.get('/reportes', async (req, res, next) => {
  try {
    const params = [];
    let sql = 'SELECT * FROM v_reportes_detalle WHERE 1=1';
    if (req.query.estado && ESTADOS.includes(req.query.estado)) { sql += ' AND estado_reporte = ?'; params.push(req.query.estado); }
    if (req.query.localidad) { sql += ' AND localidad = ?'; params.push(req.query.localidad); }
    sql += ' ORDER BY fecha_hora DESC LIMIT 500';
    const [filas] = await pool.query(sql, params);
    res.json(filas);
  } catch (e) { next(e); }
});

// PATCH /api/admin/reportes/:id/estado  { estado }
router.patch('/reportes/:id/estado', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const estado = String(req.body.estado || '');
    if (!ESTADOS.includes(estado)) return res.status(400).json({ mensaje: 'Estado no válido.' });
    const [actual] = await pool.query('SELECT codigo_unico, estado_reporte FROM reporte WHERE id_reporte = ?', [id]);
    if (!actual.length) return res.status(404).json({ mensaje: 'El reporte no existe.' });
    await pool.query('UPDATE reporte SET estado_reporte = ? WHERE id_reporte = ?', [estado, id]);
    await registrarLog({
      idUsuario: req.usuario.id, accion: 'CAMBIAR_ESTADO', entidad: 'reporte', idEntidad: actual[0].codigo_unico,
      detalle: `${actual[0].estado_reporte} -> ${estado}`, ip: req.ip
    });
    res.json({ mensaje: 'Estado actualizado', estado });
  } catch (e) { next(e); }
});

// GET /api/admin/estadisticas
router.get('/estadisticas', async (req, res, next) => {
  try {
    const [porEstado] = await pool.query('SELECT estado_reporte AS estado, COUNT(*) AS total FROM reporte GROUP BY estado_reporte');
    const [porTipo] = await pool.query(
      `SELECT t.nombre AS tipo, COUNT(r.id_reporte) AS total FROM tipo_residuo t
       LEFT JOIN reporte r ON r.id_tipo = t.id_tipo AND r.estado_reporte <> 'RECHAZADO'
       GROUP BY t.id_tipo ORDER BY total DESC`);
    const [porLocalidad] = await pool.query('SELECT localidad, total FROM v_reportes_por_localidad LIMIT 8');
    res.json({ porEstado, porTipo, porLocalidad });
  } catch (e) { next(e); }
});

// POST /api/admin/mapa/corte  -> registra un corte del mapa de calor (clase MapaDeCalor)
router.post('/mapa/corte', async (req, res, next) => {
  try {
    const filtro = String(req.body.filtro || 'TODOS').slice(0, 30);
    const zoom = Math.min(Math.max(Number(req.body.zoom) || 12, 1), 20);
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM reporte WHERE estado_reporte <> 'RECHAZADO'");
    const [r] = await pool.query(
      'INSERT INTO mapa_calor (tipo_filtro, zoom_level, total_puntos, id_usuario) VALUES (?,?,?,?)',
      [filtro, zoom, total, req.usuario.id]);
    await registrarLog({ idUsuario: req.usuario.id, accion: 'CORTE_MAPA', entidad: 'mapa_calor', idEntidad: String(r.insertId), ip: req.ip });
    res.status(201).json({ mensaje: 'Corte registrado', id: r.insertId, total_puntos: total });
  } catch (e) { next(e); }
});

// GET /api/admin/logs -> últimos 50 eventos de auditoría
router.get('/logs', async (req, res, next) => {
  try {
    const [filas] = await pool.query(
      `SELECT l.fecha, l.accion, l.entidad, l.id_entidad, l.detalle, l.ip, u.nombre_completo AS usuario
       FROM log_auditoria l LEFT JOIN usuario u ON u.id_usuario = l.id_usuario
       ORDER BY l.id_log DESC LIMIT 50`);
    res.json(filas);
  } catch (e) { next(e); }
});

module.exports = router;
