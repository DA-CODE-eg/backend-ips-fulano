const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');

const router = express.Router();

// Todos los endpoints requieren autenticación
router.use(auth);

// Obtener todos los pacientes
router.get('/', authorize('admin', 'doctor', 'recepcionista'), async (req, res) => {
  try {
    const [patients] = await db.execute(`
      SELECT p.*, u.name as created_by_name 
      FROM patients p 
      LEFT JOIN users u ON p.created_by = u.id 
      ORDER BY p.created_at DESC
    `);
    res.json(patients);
  } catch (error) {
    console.error('Error obteniendo pacientes:', error);
    res.status(500).json({ error: 'Error obteniendo pacientes' });
  }
});

// Obtener paciente por ID
router.get('/:id', authorize('admin', 'doctor', 'recepcionista'), async (req, res) => {
  try {
    const [patients] = await db.execute(`
      SELECT p.*, u.name as created_by_name 
      FROM patients p 
      LEFT JOIN users u ON p.created_by = u.id 
      WHERE p.id = ?
    `, [req.params.id]);

    if (patients.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json(patients[0]);
  } catch (error) {
    console.error('Error obteniendo paciente:', error);
    res.status(500).json({ error: 'Error obteniendo paciente' });
  }
});

// Crear paciente
// Crear paciente - VERSIÓN CORREGIDA
// Crear paciente - CON TIPO DE DOCUMENTO
router.post('/', [
  authorize('admin', 'doctor', 'recepcionista'),
  body('identification').notEmpty(),
  body('document_type').isIn(['CC', 'CE', 'TI', 'PASAPORTE', 'OTRO']),
  body('first_name').notEmpty(),
  body('last_name').notEmpty(),
  body('date_of_birth').isDate(),
  body('gender').isIn(['M', 'F', 'Otro'])
], async (req, res) => {
  try {
    console.log('📨 Body recibido para paciente:', req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Errores de validación:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      identification,
      document_type = 'CC', // Valor por defecto
      first_name,
      last_name,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      emergency_contact,
      emergency_phone,
      blood_type,
      allergies
    } = req.body;

    // Verificar si la identificación ya existe
    const [existingPatients] = await db.execute(
      'SELECT id FROM patients WHERE identification = ?',
      [identification]
    );

    if (existingPatients.length > 0) {
      return res.status(400).json({ error: 'La identificación ya está registrada' });
    }

    // Datos del paciente con tipo de documento
    const patientData = [
      identification,
      document_type,        // Nuevo campo
      first_name, 
      last_name, 
      date_of_birth, 
      gender,
      phone || null,
      email || null,
      address || null,
      emergency_contact || null,
      emergency_phone || null,
      blood_type || null,
      allergies || null,
      req.user.userId
    ];

    console.log('📊 Datos del paciente a insertar:', patientData);

    // Crear paciente con tipo de documento
    const [result] = await db.execute(
      `INSERT INTO patients (
        identification, document_type, first_name, last_name, date_of_birth, gender,
        phone, email, address, emergency_contact, emergency_phone,
        blood_type, allergies, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      patientData
    );

    console.log('✅ Paciente creado con ID:', result.insertId);

    res.status(201).json({
      message: 'Paciente creado exitosamente',
      patientId: result.insertId
    });

  } catch (error) {
    console.error('💥 Error creando paciente:', error);
    res.status(500).json({ 
      error: 'Error creando paciente',
      details: error.message 
    });
  }
});

// Actualizar paciente
router.put('/:id', [
  authorize('admin', 'doctor', 'recepcionista'),
  body('first_name').optional().notEmpty(),
  body('last_name').optional().notEmpty(),
  body('date_of_birth').optional().isDate(),
  body('gender').optional().isIn(['M', 'F', 'Otro'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const patientId = req.params.id;
    const updates = [];
    const values = [];

    const allowedFields = [
      'identification', 'first_name', 'last_name', 'date_of_birth', 'gender',
      'phone', 'email', 'address', 'emergency_contact', 'emergency_phone',
      'blood_type', 'allergies'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(patientId);

    const [result] = await db.execute(
      `UPDATE patients SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json({ message: 'Paciente actualizado exitosamente' });

  } catch (error) {
    console.error('Error actualizando paciente:', error);
    res.status(500).json({ error: 'Error actualizando paciente' });
  }
});

// Eliminar paciente (solo admin)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM patients WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json({ message: 'Paciente eliminado exitosamente' });

  } catch (error) {
    console.error('Error eliminando paciente:', error);
    res.status(500).json({ error: 'Error eliminando paciente' });
  }
});

module.exports = router;