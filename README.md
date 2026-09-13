# Gobierno Cercano

Portal web para registrar problemas de la ciudad y gestionarlos desde un panel municipal.

## Puesta en marcha

1. Instala Node.js 18 o superior y MySQL 8.
2. Ejecuta el contenido de `schema.sql` en MySQL.
3. Copia `.env.example` a `.env` y completa los datos de conexión.
4. Ejecuta `npm install` y después `npm start`.
5. Abre `http://localhost:3000`.

El acceso interno usa por defecto `Gob2007` y `elgobiernopublico`, pero se pueden cambiar en `.env`. En producción también debes cambiar `SESSION_SECRET`, usar HTTPS y guardar las credenciales fuera del código.

## Secciones

- Formulario público: categoría, descripción, dirección, ubicación opcional, fotografía y datos de contacto opcionales.
- Panel interno: requiere sesión y muestra los casos agrupados por categoría.
- Estados: `pendiente`, `proceso`, `resuelto` y `denegado`; los botones actualizan el color y la clasificación del caso.
- MySQL: la tabla `reports` conserva el caso, fotografía, ubicación, estado y fechas.
