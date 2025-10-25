const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');

const router = express.Router();

// Todos los endpoints requieren autenticación
router.use(auth);

// ✅ CORREGIDO: Cualquier usuario autenticado puede VER las historias
// Obtener todas las historias clínicas
router.get('/', async (req, res) => {
  try {
    const [histories] = await db.execute(`
      SELECT ch.*, 
            p.first_name, p.last_name, p.identification,
            u.name as doctor_name
      FROM clinical_histories ch
      JOIN patients p ON ch.patient_id = p.id
      JOIN users u ON ch.doctor_id = u.id
      ORDER BY ch.visit_date DESC
    `);
    res.json(histories);
  } catch (error) {
    console.error('Error obteniendo historias:', error);
    res.status(500).json({ error: 'Error obteniendo historias clínicas' });
  }
});

// Obtener historias de un paciente
router.get('/patient/:patientId', async (req, res) => {
  try {
    const [histories] = await db.execute(`
      SELECT ch.*, u.name as doctor_name
      FROM clinical_histories ch
      JOIN users u ON ch.doctor_id = u.id
      WHERE ch.patient_id = ?
      ORDER BY ch.visit_date DESC
    `, [req.params.patientId]);

    res.json(histories);
  } catch (error) {
    console.error('Error obteniendo historias del paciente:', error);
    res.status(500).json({ error: 'Error obteniendo historias del paciente' });
  }
});

// Buscar historias clínicas por número de documento del paciente
router.get('/search/by-document/:document', async (req, res) => {
  try {
    const documentNumber = req.params.document;
    
    console.log('🔍 Buscando historias por documento:', documentNumber);

    // Buscar paciente por documento
    const [patients] = await db.execute(
      'SELECT id, first_name, last_name, identification, document_type FROM patients WHERE identification = ?',
      [documentNumber]
    );

    if (patients.length === 0) {
      console.log('❌ Paciente no encontrado con documento:', documentNumber);
      return res.status(404).json({ 
        error: 'Paciente no encontrado',
        message: 'No se encontró ningún paciente con ese número de documento'
      });
    }

    const patient = patients[0];
    console.log('✅ Paciente encontrado:', patient.first_name, patient.last_name);

    // Buscar historias clínicas del paciente
    const [histories] = await db.execute(`
      SELECT ch.*, u.name as doctor_name
      FROM clinical_histories ch
      JOIN users u ON ch.doctor_id = u.id
      WHERE ch.patient_id = ?
      ORDER BY ch.visit_date DESC
    `, [patient.id]);

    console.log('📋 Historias encontradas:', histories.length);

    res.json({
      patient: {
        id: patient.id,
        identification: patient.identification,
        document_type: patient.document_type,
        first_name: patient.first_name,
        last_name: patient.last_name,
        full_name: `${patient.first_name} ${patient.last_name}`
      },
      histories: histories,
      total: histories.length
    });

  } catch (error) {
    console.error('💥 Error buscando historias por documento:', error);
    res.status(500).json({ 
      error: 'Error buscando historias clínicas',
      details: error.message 
    });
  }
});

// Buscar historias clínicas por nombre del paciente
router.get('/search/by-name/:name', async (req, res) => {
  try {
    const name = req.params.name;
    
    console.log('🔍 Buscando historias por nombre:', name);

    // Buscar pacientes por nombre (búsqueda parcial)
    const [patients] = await db.execute(
      `SELECT id, first_name, last_name, identification, document_type 
      FROM patients 
      WHERE CONCAT(first_name, ' ', last_name) LIKE ? 
          OR first_name LIKE ? 
          OR last_name LIKE ?`,
      [`%${name}%`, `%${name}%`, `%${name}%`]
    );

    if (patients.length === 0) {
      console.log('❌ No se encontraron pacientes con nombre:', name);
      return res.status(404).json({ 
        error: 'Pacientes no encontrados',
        message: 'No se encontraron pacientes con ese nombre'
      });
    }

    console.log('✅ Pacientes encontrados:', patients.length);

    // Para cada paciente, obtener sus historias
    const results = await Promise.all(
      patients.map(async (patient) => {
        const [histories] = await db.execute(`
          SELECT ch.*, u.name as doctor_name
          FROM clinical_histories ch
          JOIN users u ON ch.doctor_id = u.id
          WHERE ch.patient_id = ?
          ORDER BY ch.visit_date DESC
        `, [patient.id]);

        return {
          patient: {
            id: patient.id,
            identification: patient.identification,
            document_type: patient.document_type,
            first_name: patient.first_name,
            last_name: patient.last_name,
            full_name: `${patient.first_name} ${patient.last_name}`
          },
          histories: histories,
          total_histories: histories.length
        };
      })
    );

    res.json({
      search_term: name,
      total_patients: patients.length,
      results: results
    });

  } catch (error) {
    console.error('💥 Error buscando historias por nombre:', error);
    res.status(500).json({ 
      error: 'Error buscando historias clínicas',
      details: error.message 
    });
  }
});

// Búsqueda flexible de historias clínicas
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = req.params.term;
    
    console.log('🔍 Búsqueda flexible con término:', searchTerm);

    // Buscar pacientes por documento o nombre
    const [patients] = await db.execute(
      `SELECT id, first_name, last_name, identification, document_type 
      FROM patients 
      WHERE identification = ? 
          OR CONCAT(first_name, ' ', last_name) LIKE ? 
          OR first_name LIKE ? 
          OR last_name LIKE ?`,
      [searchTerm, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
    );

    if (patients.length === 0) {
      return res.status(404).json({ 
        error: 'No se encontraron resultados',
        message: 'No se encontraron pacientes con ese criterio de búsqueda'
      });
    }

    // Para cada paciente, obtener sus historias
    const results = await Promise.all(
      patients.map(async (patient) => {
        const [histories] = await db.execute(`
          SELECT ch.id, ch.visit_date, ch.reason_for_visit, ch.diagnosis,
                u.name as doctor_name
          FROM clinical_histories ch
          JOIN users u ON ch.doctor_id = u.id
          WHERE ch.patient_id = ?
          ORDER BY ch.visit_date DESC
          LIMIT 10
        `, [patient.id]);

        return {
          patient: {
            id: patient.id,
            identification: patient.identification,
            document_type: patient.document_type,
            first_name: patient.first_name,
            last_name: patient.last_name,
            full_name: `${patient.first_name} ${patient.last_name}`
          },
          recent_histories: histories,
          total_histories: histories.length
        };
      })
    );

    res.json({
      search_term: searchTerm,
      total_patients: patients.length,
      results: results
    });

  } catch (error) {
    console.error('💥 Error en búsqueda flexible:', error);
    res.status(500).json({ 
      error: 'Error en búsqueda',
      details: error.message 
    });
  }
});

// Obtener historia por ID
router.get('/:id', async (req, res) => {
  try {
    const [histories] = await db.execute(`
      SELECT ch.*, 
            p.first_name, p.last_name, p.identification, p.date_of_birth, p.gender,
            u.name as doctor_name
      FROM clinical_histories ch
      JOIN patients p ON ch.patient_id = p.id
      JOIN users u ON ch.doctor_id = u.id
      WHERE ch.id = ?
    `, [req.params.id]);

    if (histories.length === 0) {
      return res.status(404).json({ error: 'Historia clínica no encontrada' });
    }

    res.json(histories[0]);
  } catch (error) {
    console.error('Error obteniendo historia:', error);
    res.status(500).json({ error: 'Error obteniendo historia clínica' });
  }
});

// ✅ CORREGIDO: Cualquier usuario autenticado puede CREAR historias
router.post('/', [
  // ELIMINADO: authorize('admin', 'doctor') - Cualquier rol puede crear
  body('patient_id').isInt(),
  body('reason_for_visit').notEmpty(),
  body('symptoms').optional(),
  body('diagnosis').optional(),
  body('treatment').optional(),
  body('prescriptions').optional(),
  body('observations').optional(),
  body('vital_signs').optional(),
  body('next_appointment').optional().isDate()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      patient_id,
      reason_for_visit,
      symptoms,
      diagnosis,
      treatment,
      prescriptions,
      observations,
      vital_signs,
      next_appointment
    } = req.body;

    // Verificar que el paciente existe
    const [patients] = await db.execute(
      'SELECT id FROM patients WHERE id = ?',
      [patient_id]
    );

    if (patients.length === 0) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    // Crear historia clínica
    const [result] = await db.execute(
      `INSERT INTO clinical_histories (
        patient_id, doctor_id, reason_for_visit, symptoms, diagnosis,
        treatment, prescriptions, observations, vital_signs, next_appointment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patient_id,
        req.user.userId, // El ID del usuario autenticado (cualquier rol)
        reason_for_visit,
        symptoms,
        diagnosis,
        treatment,
        prescriptions,
        observations,
        vital_signs ? JSON.stringify(vital_signs) : null,
        next_appointment
      ]
    );

    res.status(201).json({
      message: 'Historia clínica creada exitosamente',
      historyId: result.insertId
    });

  } catch (error) {
    console.error('Error creando historia clínica:', error);
    res.status(500).json({ error: 'Error creando historia clínica' });
  }
});

// ✅ CORREGIDO: Cualquier usuario autenticado puede ACTUALIZAR historias
router.put('/:id', [
  // ELIMINADO: authorize('admin', 'doctor') - Cualquier rol puede actualizar
  body('reason_for_visit').optional().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const historyId = req.params.id;
    const updates = [];
    const values = [];

    const allowedFields = [
      'reason_for_visit', 'symptoms', 'diagnosis', 'treatment',
      'prescriptions', 'observations', 'vital_signs', 'next_appointment'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'vital_signs') {
          updates.push(`${field} = ?`);
          values.push(JSON.stringify(req.body[field]));
        } else {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(historyId);

    const [result] = await db.execute(
      `UPDATE clinical_histories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Historia clínica no encontrada' });
    }

    res.json({ message: 'Historia clínica actualizada exitosamente' });

  } catch (error) {
    console.error('Error actualizando historia:', error);
    res.status(500).json({ error: 'Error actualizando historia clínica' });
  }
});

// ✅ ELIMINAR solo para admin (mantener por seguridad)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM clinical_histories WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Historia clínica no encontrada' });
    }

    res.json({ message: 'Historia clínica eliminada exitosamente' });

  } catch (error) {
    console.error('Error eliminando historia:', error);
    res.status(500).json({ error: 'Error eliminando historia clínica' });
  }
});

module.exports = router;