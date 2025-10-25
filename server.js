console.log('🔍 VARIABLES DE ENTORNO:');
console.log('PORT:', process.env.PORT);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
// Cargar variables de entorno
dotenv.config();

const app = express();

// Middlewares - CORS optimizado para producción
app.use(cors({
  origin: function(origin, callback) {
    // Permitir requests sin origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Lista de orígenes permitidos
    const allowedOrigins = [
      'http://localhost:4200',
      'http://localhost:3000',
      'https://*.railway.app', // Permitir cualquier app de Railway
      process.env.CORS_ORIGIN
    ].filter(Boolean);
    
    // En producción, verificar orígenes específicos
    if (process.env.NODE_ENV === 'production') {
      const isAllowed = allowedOrigins.some(allowed => {
        return origin === allowed || 
               (allowed.includes('*') && origin.includes(allowed.replace('*', '')));
      });
      
      if (isAllowed || origin.includes('ngrok-free.app') || origin.includes('ngrok.io')) {
        callback(null, true);
      } else {
        console.log('🚫 Origen bloqueado por CORS:', origin);
        callback(new Error('Origen no permitido por CORS'));
      }
    } else {
      // En desarrollo, permitir todo
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend (si existe)
app.use(express.static(path.join(__dirname, '../frontend-ips-limpio/dist/frontend-ips-limpio/browser')));

// Importar rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const patientRoutes = require('./routes/patients');
const clinicalHistoryRoutes = require('./routes/clinicalHistory');

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/clinical-history', clinicalHistoryRoutes);

// Ruta de prueba mejorada
app.get('/api/health', (req, res) => {
  res.json({ 
    message: '🚀 Backend IPS Fulano funcionando!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    database: process.env.DB_HOST ? 'Configurada' : 'No configurada'
  });
});

// Ruta de prueba de base de datos mejorada
app.get('/api/test-db', async (req, res) => {
  try {
    const db = require('./config/database');
    const [rows] = await db.execute('SELECT NOW() as server_time, VERSION() as mysql_version');
    res.json({ 
      database: '✅ Conectada correctamente a Railway MySQL',
      server_time: rows[0].server_time,
      mysql_version: rows[0].mysql_version,
      connection: {
        host: process.env.DB_HOST,
        database: process.env.DB_NAME
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: '❌ Error de base de datos',
      message: error.message,
      details: 'Verifica las variables de entorno en Railway'
    });
  }
});

// Ruta para resetear contraseña del admin (SEGURIDAD - SOLO EN DESARROLLO)
app.post('/api/reset-admin-password', async (req, res) => {
  // En producción, deshabilitar esta ruta
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ 
      error: 'Esta función está deshabilitada en producción' 
    });
  }
  
  try {
    const db = require('./config/database');
    const bcrypt = require('bcryptjs');
    
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log('🔄 Reseteando contraseña...');
    
    const [result] = await db.execute(
      'UPDATE users SET password = ? WHERE email = ?',
      [hashedPassword, 'admin@ipsfulano.com']
    );
    
    res.json({
      message: '✅ Contraseña reseteada exitosamente',
      newPassword: newPassword,
      affectedRows: result.affectedRows,
      note: 'Recuerda eliminar esta ruta en producción'
    });
  } catch (error) {
    console.error('❌ Error reseteando contraseña:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ruta para servir frontend (si existe)
app.get('*', (req, res) => {
  const frontendPath = path.join(__dirname, '../frontend-ips-limpio/dist/frontend-ips-limpio/browser/index.html');
  
  // Verificar si el archivo existe antes de enviarlo
  if (require('fs').existsSync(frontendPath)) {
    res.sendFile(frontendPath);
  } else {
    res.json({ 
      message: '🚀 Backend IPS Fulano API',
      status: 'Running',
      frontend: 'No encontrado - Solo API disponible',
      documentation: '/api/health para más información'
    });
  }
});

// Middleware de errores mejorado
app.use((error, req, res, next) => {
  console.error('❌ Error del servidor:', error);
  
  // Manejar errores de CORS
  if (error.message.includes('CORS')) {
    return res.status(403).json({ 
      error: 'Origen no permitido',
      message: 'Tu dominio no está autorizado para acceder a esta API'
    });
  }
  
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'production' ? 'Contacta al administrador' : error.message
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏥 Servidor IPS Fulano corriendo en puerto ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Base de datos: ${process.env.DB_HOST || 'No configurada'}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🚀 MODO PRODUCCIÓN - Railway`);
    console.log(`🔒 CORS: Restringido a orígenes autorizados`);
  } else {
    console.log(`🔑 Credenciales por defecto:`);
    console.log(`   Email: admin@ipsfulano.com`);
    console.log(`   Password: admin123`);
  }
  console.log('');
});