const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { generateToken } = require('../utils/generateToken');

const router = express.Router();

// Login mejorado con mejor debug
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    console.log('=== 🔐 INTENTO DE LOGIN ===');
    console.log('📨 Body recibido:', JSON.stringify(req.body, null, 2));
    console.log('📧 Email recibido:', req.body.email);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Errores de validación:', errors.array());
      return res.status(400).json({ 
        error: 'Datos inválidos',
        details: errors.array() 
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Email o password vacíos');
      return res.status(400).json({ error: 'Email y password son requeridos' });
    }

    console.log('🔍 Buscando usuario en BD...');
    
    // Buscar usuario
    const [users] = await db.execute(
      'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );
      
    console.log('👤 Usuarios encontrados:', users.length);

    if (users.length === 0) {
      console.log('❌ Usuario no encontrado o inactivo:', email);
      
      // Verificar si el usuario existe pero está inactivo
      const [inactiveUsers] = await db.execute(
        'SELECT * FROM users WHERE email = ? AND is_active = FALSE',
        [email]
      );
      
      if (inactiveUsers.length > 0) {
        console.log('⚠️  Usuario existe pero está inactivo');
        return res.status(401).json({ error: 'Usuario desactivado' });
      }
      
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = users[0];
    console.log('✅ Usuario encontrado:', user.email);
    console.log('🔑 Hash en BD:', user.password.substring(0, 20) + '...');

    // Verificar contraseña
    console.log('🔐 Comparando contraseñas...');
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('🎯 Contraseña coincide:', isMatch);

    if (!isMatch) {
      console.log('❌ Contraseña incorrecta');
      
      // Debug: mostrar qué se está comparando
      console.log('📝 Password recibido:', password);
      console.log('🗃️  Hash en BD:', user.password);
      
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token
    const token = generateToken(user.id);
    console.log('🎉 Login exitoso para:', user.email);

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('💥 Error en login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// Verificar token
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const { verifyToken } = require('../utils/generateToken');
    const decoded = verifyToken(token);
    
    const [users] = await db.execute(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user: users[0] });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;