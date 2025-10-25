const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ips_fulano',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const db = mysql.createPool(dbConfig);

// Función para verificar conexión
const testConnection = async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Base de datos conectada exitosamente');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error.message);
    return false;
  }
};

// Función para crear tablas si no existen
const createTables = async () => {
  try {
    // Tabla de usuarios
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'doctor', 'recepcionista') DEFAULT 'recepcionista',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Tabla de pacientes
    await db.execute(`
      CREATE TABLE IF NOT EXISTS patients (
        id INT PRIMARY KEY AUTO_INCREMENT,
        identification VARCHAR(20) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        date_of_birth DATE NOT NULL,
        gender ENUM('M', 'F', 'Otro') NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(100),
        address TEXT,
        emergency_contact VARCHAR(100),
        emergency_phone VARCHAR(20),
        blood_type VARCHAR(5),
        allergies TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Tabla de historias clínicas
    await db.execute(`
      CREATE TABLE IF NOT EXISTS clinical_histories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        reason_for_visit TEXT NOT NULL,
        symptoms TEXT,
        diagnosis TEXT,
        treatment TEXT,
        prescriptions TEXT,
        observations TEXT,
        vital_signs JSON,
        next_appointment DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctor_id) REFERENCES users(id)
      )
    `);

    console.log('✅ Tablas creadas/verificadas correctamente');
    
    // Crear usuario admin por defecto si no existe
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await db.execute(
      'INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      ['Administrador', 'admin@ipsfulano.com', hashedPassword, 'admin']
    );
    
    console.log('✅ Usuario admin creado (admin@ipsfulano.com / admin123)');
    
  } catch (error) {
    console.error('❌ Error creando tablas:', error);
  }
};

// Inicializar la base de datos
const initializeDatabase = async () => {
  const connected = await testConnection();
  if (connected) {
    await createTables();
  }
};

initializeDatabase();

module.exports = db;