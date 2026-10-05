# Limpia El Parche (LEP-BOG)

Plataforma web para reportar acumulación de residuos sólidos en Bogotá y visualizar las zonas críticas en un mapa de calor.
Proyecto de Ingeniería de Software · UNIMINUTO · NRC 10-84957 · Docente Sandra Consuelo Briceño López.

Equipo: Joseph Farut Caicedo Valderrama, Julián David Barreto Medina, Sara Ximena Jerez Carrillo, Juan Manuel Sanabria Portillo y Santiago Mora.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend (Cliente) | HTML5, CSS3, JavaScript, Leaflet 1.9 + Leaflet.heat (mapa de calor), OpenStreetMap / CARTO, Nominatim |
| Backend (Servidor Web / API) | Node.js 18+, Express 4, Multer (fotos), bcryptjs, JSON Web Token, express-rate-limit |
| Base de datos | MySQL 8 |

## Estructura

```
limpia-el-parche/
├── database/
│   ├── 01_esquema.sql        ← crea la base, tablas, vistas y catálogo
│   └── 02_datos_demo.sql     ← 70 reportes de prueba en 11 localidades
├── backend/
│   ├── .env.example          ← copiar como .env
│   ├── package.json
│   ├── uploads/              ← aquí se guardan las fotos
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/auth.js
│       └── routes/ (reportes.js, auth.js, admin.js)
└── frontend/
    ├── index.html            ← Home, Heat Map y Report Trash (mockup)
    ├── admin.html            ← Admin Dashboard
    ├── css/ (styles.css, admin.css)
    ├── js/  (config.js, api.js, app.js, admin.js, demo-data.js)
    └── img/logo.svg
```

## Cómo ejecutarlo en Visual Studio Code

### 1. Requisitos
- [Node.js 18 o superior](https://nodejs.org) (verifica con `node -v`)
- MySQL 8 (MySQL Workbench, XAMPP o MySQL Server)
- Visual Studio Code (al abrir la carpeta te sugerirá extensiones recomendadas)

### 2. Crear la base de datos
En MySQL Workbench abre y ejecuta (rayo ⚡), en este orden:
1. `database/01_esquema.sql`
2. `database/02_datos_demo.sql`

O desde la terminal de VS Code:
```bash
mysql -u root -p < database/01_esquema.sql
mysql -u root -p < database/02_datos_demo.sql
```

### 3. Configurar y encender el backend
En la terminal de VS Code (`Ctrl + ñ`):
```bash
cd backend
copy .env.example .env      # en Mac/Linux: cp .env.example .env
npm install
npm start
```
Abre `backend/.env` y escribe tu usuario y contraseña de MySQL (`DB_USER`, `DB_PASSWORD`).
Si todo está bien verás:
```
Conectado a MySQL
Administrador inicial creado: admin@limpiaelparche.co
Limpia el Parche corriendo en http://localhost:3000
```

### 4. Abrir la página
- Página pública: http://localhost:3000
- Panel administrativo: http://localhost:3000/admin.html
  - Correo: `admin@limpiaelparche.co`
  - Contraseña: `Admin2026*` (cámbiala en `.env` antes de crear la base si van a publicarlo)

> La contraseña se guarda cifrada con bcrypt; el administrador se crea solo la primera vez que arranca el servidor.

### Modo demostración (sin MySQL)
Para mostrar el diseño sin backend: en `frontend/js/config.js` cambia `MODO_DEMO: false` por `true` y abre `frontend/index.html` con **Live Server**. Los reportes se guardan solo en el navegador. Para las pruebas funcionales (PF) usa siempre el modo normal.

## API REST

| Método | Ruta | Descripción | Requerimiento |
|---|---|---|---|
| GET | `/api/reportes/tipos` | Catálogo de tipos de residuo | RF-002 |
| GET | `/api/reportes/mapa?tipo=` | Puntos para el mapa de calor | RF-006 |
| GET | `/api/reportes/resumen` | Cifras de la página de inicio | — |
| GET | `/api/reportes/:codigo` | Consultar estado de un reporte | RF-006 |
| POST | `/api/reportes` | Registrar reporte (multipart con `foto` opcional) | RF-002 a RF-006 |
| POST | `/api/auth/login` | Inicio de sesión de administrador | RNF-002 |
| GET | `/api/admin/reportes?estado=` | Listar reportes (requiere token) | R2 |
| PATCH | `/api/admin/reportes/:id/estado` | Cambiar estado de un reporte | R5 |
| GET | `/api/admin/estadisticas` | Estadísticas por estado, tipo y localidad | — |
| POST | `/api/admin/mapa/corte` | Registrar corte del mapa de calor | Clase MapaDeCalor |
| GET | `/api/admin/logs` | Últimos 50 eventos de auditoría | R5 |

## Trazabilidad requerimiento → código

| Requerimiento | Dónde está implementado |
|---|---|
| RF-001 Acceso al módulo de registro | Menú "Report Trash" y tarjeta del formulario (`index.html`, `mostrarVista()` en `app.js`) |
| RF-002 Captura de datos básicos | Select de tipos cargado desde la BD, descripción con límite de 500 caracteres; A1 con botón "Reintentar" |
| RF-003 Registro de la ubicación | Botón de geolocalización, clic en el mapa y búsqueda de dirección con Nominatim; A1/A2 piden selección manual |
| RF-004 Evidencia fotográfica | Botón "Subir Evidencia Fotográfica", JPG/PNG hasta 5 MB, validado en navegador y servidor (Multer) |
| RF-005 Validación de campos | `validar()` en `app.js` y validación en `routes/reportes.js`; mensajes por campo |
| RF-006 Confirmación de envío | Modal de resumen, código único `LEP-AAAAMMDD-XXXX`, notificación y punto nuevo en el mapa de calor |
| RNF-002 Seguridad | bcrypt, JWT, roles, bloqueo tras 5 intentos, cabeceras de seguridad |
| R4 / R6 Anti-spam | Límite de 5 reportes por IP cada 10 min, campo trampa (honeypot), detección de duplicados |
| R5 Integridad | Tabla `log_auditoria` con cada creación, cambio de estado e inicio de sesión |

## Notas
- Nominatim (OpenStreetMap) es gratuito pero limita a 1 búsqueda por segundo; para el prototipo académico es suficiente.
- En producción (RNF-002) el sitio debe publicarse con HTTPS. La geolocalización del navegador solo funciona en `https://` o en `localhost`.
