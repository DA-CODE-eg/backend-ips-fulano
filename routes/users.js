const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');

const router = express.Router();

// ✅ MODIFICADO: Endpoint público para creación de usuarios (SIEMPRE disponible)
router.post('/create-initial', [
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'doctor', 'nurse', 'recepcionista'])
], async (req, res) => {
  try {
    console.log('=== 🆕 CREACIÓN DE USUARIO ===');
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Errores de validación:', errors.array());
      return res.status(400).json({ 
        error: 'Datos inválidos',
        details: errors.array() 
      });
    }

    const { name, email, password, role } = req.body;

    console.log('🎉 Creando usuario...');

    // ✅ SOLO verificar si el email ya existe (única validación necesaria)
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      console.log('❌ Email ya registrado:', email);
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    console.log('✅ Usuario creado exitosamente con ID:', result.insertId);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      userId: result.insertId
    });

  } catch (error) {
    console.error('💥 Error creando usuario:', error);
    res.status(500).json({ 
      error: 'Error creando usuario',
      details: error.message 
    });
  }
});

// 🔐 TODAS LAS RUTAS DE ABAJO REQUIEREN AUTENTICACIÓN
router.use(auth);

// Obtener todos los usuarios (solo admin)
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

// Crear usuario (solo admin)
router.post('/', [
  authorize('admin'),
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'doctor', 'recepcionista'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    // Verificar si el email ya existe
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      userId: result.insertId
    });

  } catch (error) {
    console.error('Error creando usuario:', error);
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

// Actualizar usuario
router.put('/:id', [
  authorize('admin'),
  body('name').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'doctor', 'recepcionista']),
  body('is_active').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const { name, email, role, is_active } = req.body;

    // Construir query dinámica
    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (email) { updates.push('email = ?'); values.push(email); }
    if (role) { updates.push('role = ?'); values.push(role); }
    if (typeof is_active !== 'undefined') { 
      updates.push('is_active = ?'); 
      values.push(is_active); 
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(userId);

    await db.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'Usuario actualizado exitosamente' });

  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
});

// Eliminar usuario (soft delete)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const userId = req.params.id;

    await db.execute(
      'UPDATE users SET is_active = FALSE WHERE id = ?',
      [userId]
    );

    res.json({ message: 'Usuario desactivado exitosamente' });

  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
});

module.exports = router;