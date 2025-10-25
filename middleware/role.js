const authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      const db = require('../config/database');
      const [users] = await db.execute(
        'SELECT role FROM users WHERE id = ?',
        [req.user.userId]
      );
      
      if (users.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const userRole = users[0].role;
      
      if (!roles.includes(userRole)) {
        return res.status(403).json({ error: 'No tienes permisos para esta acción' });
      }

      next();
    } catch (error) {
      res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
};

module.exports = authorize;