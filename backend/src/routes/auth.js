// Autenticación de administradores (RNF-002, R1)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool, registrarLog } = require('../db');

const router = express.Router();
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

// POST /api/auth/login
router.post('/login', limiteLogin, async (req, res, next) => {
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!correo || !password) {
      return res.status(400).json({ mensaje: 'Escribe tu correo y tu contraseña.' });
    }

    const [filas] = await pool.query(
      `SELECT u.id_usuario, u.nombre_completo, u.password_hash, u.rol, u.estado,
              u.intentos_fallidos, u.bloqueado_hasta, a.area_asignada
       FROM usuario u LEFT JOIN administrador a ON a.id_usuario = u.id_usuario
       WHERE u.correo_electronico = ?`, [correo]);
    const u = filas[0];
    const credencialesInvalidas = () =>
      res.status(401).json({ mensaje: 'Correo o contraseña incorrectos. Verifica e inténtalo de nuevo.' });

    if (!u) {
      await registrarLog({ accion: 'LOGIN_FALLIDO', entidad: 'usuario', detalle: correo, ip: req.ip });
      return credencialesInvalidas();
    }
    if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
      return res.status(423).json({ mensaje: `Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en ${MINUTOS_BLOQUEO} minutos.` });
    }
    if (u.estado !== 'ACTIVO' || u.rol !== 'ADMINISTRADOR') {
      await registrarLog({ idUsuario: u.id_usuario, accion: 'LOGIN_DENEGADO', entidad: 'usuario', ip: req.ip });
      return res.status(403).json({ mensaje: 'Esta cuenta no tiene acceso al panel administrativo.' });
    }

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      const intentos = u.intentos_fallidos + 1;
      if (intentos >= MAX_INTENTOS) {
        await pool.query(
          'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL ? MINUTE WHERE id_usuario = ?',
          [MINUTOS_BLOQUEO, u.id_usuario]);
        await registrarLog({ idUsuario: u.id_usuario, accion: 'CUENTA_BLOQUEADA', entidad: 'usuario', ip: req.ip });
        return res.status(423).json({ mensaje: `Cuenta bloqueada ${MINUTOS_BLOQUEO} minutos por ${MAX_INTENTOS} intentos fallidos.` });
      }
      await pool.query('UPDATE usuario SET intentos_fallidos = ? WHERE id_usuario = ?', [intentos, u.id_usuario]);
      await registrarLog({ idUsuario: u.id_usuario, accion: 'LOGIN_FALLIDO', entidad: 'usuario', ip: req.ip });
      return credencialesInvalidas();
    }

    await pool.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = ?', [u.id_usuario]);
    const token = jwt.sign(
      { id: u.id_usuario, nombre: u.nombre_completo, rol: u.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    await registrarLog({ idUsuario: u.id_usuario, accion: 'LOGIN', entidad: 'usuario', ip: req.ip });
    res.json({ token, usuario: { nombre: u.nombre_completo, rol: u.rol, area: u.area_asignada } });
  } catch (e) { next(e); }
});

module.exports = router;
