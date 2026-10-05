// Verifica el token JWT y exige rol ADMINISTRADOR (RNF-002, R1, R2)
const jwt = require('jsonwebtoken');

function requiereAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ mensaje: 'Inicia sesión para acceder al panel.' });
  try {
    const datos = jwt.verify(token, process.env.JWT_SECRET);
    if (datos.rol !== 'ADMINISTRADOR') {
      return res.status(403).json({ mensaje: 'Tu cuenta no tiene permisos de administrador.' });
    }
    req.usuario = datos;
    next();
  } catch {
    return res.status(401).json({ mensaje: 'La sesión expiró. Inicia sesión de nuevo.' });
  }
}

module.exports = { requiereAdmin };
