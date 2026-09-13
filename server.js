// Carga las variables de entorno desde el archivo .env.
require('dotenv').config();

// Importa las herramientas necesarias para crear el servidor web.
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Crea la aplicación y define las carpetas que usará para servir archivos.
const app = express();
const PORT = Number(process.env.PORT || 3000);
const uploadsDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDirectory, { recursive: true });

// Crea un grupo de conexiones reutilizables para MySQL.
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'portal_gobierno',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Configura la seguridad básica, el análisis de formularios y la sesión privada.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'clave-local-temporal',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
}));
app.use('/uploads', express.static(uploadsDirectory));
app.use(express.static(path.join(__dirname, 'public')));

// Configura la subida de imágenes en disco y limita el tipo y el tamaño del archivo.
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDirectory),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(null, true);
    }
    callback(new Error('Solo se aceptan imágenes JPG, PNG o WEBP.'));
  }
});

// Verifica que el usuario haya iniciado sesión antes de permitir acceso administrativo.
function requireAdmin(request, response, next) {
  if (!request.session.isAdmin) {
    return response.status(401).json({ error: 'Acceso administrativo requerido.' });
  }
  next();
}

// Devuelve las categorías y estados permitidos para mantener datos consistentes.
const allowedCategories = ['Baches', 'Luminarias', 'Lugares en mal estado', 'Basura y limpieza', 'Agua y drenaje', 'Otro'];
const allowedStatuses = ['pendiente', 'proceso', 'resuelto', 'denegado'];

// Crea un reporte público y guarda su fotografía y sus datos en MySQL.
app.post('/api/reports', upload.single('photo'), async (request, response) => {
  const { category, description, address, latitude, longitude, reporterName, reporterEmail } = request.body;
  if (!request.file || !allowedCategories.includes(category) || !description || !address) {
    if (request.file) fs.unlinkSync(request.file.path);
    return response.status(400).json({ error: 'Categoría, descripción, dirección y fotografía son obligatorias.' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO reports (category, description, address, latitude, longitude, reporter_name, reporter_email, photo_path, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`,
      [category, description.trim(), address.trim(), latitude || null, longitude || null,
        reporterName?.trim() || null, reporterEmail?.trim() || null, `/uploads/${request.file.filename}`]
    );
    response.status(201).json({ id: result.insertId, message: 'Reporte recibido correctamente.' });
  } catch (error) {
    fs.unlinkSync(request.file.path);
    console.error('Error al guardar el reporte:', error.message);
    response.status(503).json({ error: 'No se pudo guardar el reporte. Verifica la conexión con MySQL.' });
  }
});

// Inicia sesión únicamente con las credenciales administrativas configuradas.
app.post('/api/admin/login', (request, response) => {
  const { username, password } = request.body;
  const validUser = username === (process.env.ADMIN_USER || 'Gob2007');
  const validPassword = password === (process.env.ADMIN_PASSWORD || 'elgobiernopublico');
  if (!validUser || !validPassword) return response.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  request.session.isAdmin = true;
  response.json({ message: 'Sesión iniciada.' });
});

// Cierra la sesión administrativa actual.
app.post('/api/admin/logout', (request, response) => {
  request.session.destroy(() => response.json({ message: 'Sesión cerrada.' }));
});

// Permite al frontend saber si la sesión privada sigue activa.
app.get('/api/admin/session', (request, response) => response.json({ authenticated: Boolean(request.session.isAdmin) }));

// Permite que cualquier persona consulte el estado de su caso usando únicamente el folio.
app.get('/api/reports/:id/public', async (request, response) => {
  // Quita el símbolo opcional para aceptar folios escritos como "#24".
  const folio = String(request.params.id).replace(/^#/, '');
  if (!/^\d+$/.test(folio)) return response.status(400).json({ error: 'El folio debe ser un número, por ejemplo #24.' });
  try {
    const [reports] = await pool.execute(
      'SELECT id, category, description, address, status, created_at, updated_at FROM reports WHERE id = ?',
      [folio]
    );
    if (!reports.length) return response.status(404).json({ error: 'No encontramos un caso con ese folio.' });
    response.json(reports[0]);
  } catch (error) {
    console.error('Error al consultar seguimiento público:', error.message);
    response.status(503).json({ error: 'No se pudo consultar el seguimiento.' });
  }
});

// Lee todos los reportes solo después de validar la sesión privada.
app.get('/api/reports', requireAdmin, async (_request, response) => {
  try {
    const [reports] = await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
    response.json(reports);
  } catch (error) {
    console.error('Error al consultar reportes:', error.message);
    response.status(503).json({ error: 'No se pudieron consultar los reportes.' });
  }
});

// Cambia el estado de un caso desde los botones del tablero administrativo.
app.patch('/api/reports/:id/status', requireAdmin, async (request, response) => {
  const { status } = request.body;
  if (!allowedStatuses.includes(status)) return response.status(400).json({ error: 'Estado no válido.' });
  try {
    const [result] = await pool.execute('UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, request.params.id]);
    if (!result.affectedRows) return response.status(404).json({ error: 'Reporte no encontrado.' });
    response.json({ message: 'Estado actualizado.' });
  } catch (error) {
    console.error('Error al actualizar estado:', error.message);
    response.status(503).json({ error: 'No se pudo actualizar el estado.' });
  }
});

// Convierte los errores de subida en respuestas claras para el formulario.
app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError || error.message?.startsWith('Solo se aceptan')) {
    return response.status(400).json({ error: error.message });
  }
  response.status(500).json({ error: 'Ocurrió un error inesperado.' });
});

// Devuelve JSON cuando se solicita una ruta API que no existe, en vez de la página HTML.
app.use('/api', (_request, response) => response.status(404).json({ error: 'Ruta API no encontrada.' }));

// Entrega la página principal para cualquier ruta del frontend.
app.get('*', (_request, response) => response.sendFile(path.join(__dirname, 'public', 'index.html')));

// Inicia el servidor HTTP y avisa en qué dirección está disponible.
app.listen(PORT, '0.0.0.0', () => console.log(`Portal Gob abierto en el puerto ${PORT}`));
