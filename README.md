# EduTrack – I.E. 81665 AKE

Sistema PWA de asistencia y evaluación.

**Docente:** Manuel L. Ruiz Valderrama

## Contenido

- Aplicación web instalable.
- Escáner QR.
- Registro de asistencia: PRESENTE, TARDANZA y FALTA.
- Evaluación rápida: C, B, A y AD.
- Historial local y sincronización posterior.
- Tema claro y oscuro.
- Backend para Google Apps Script.

## Instalación resumida

### 1. Subir a GitHub

Suba a la raíz del repositorio:

- `index.html`
- `manifest.webmanifest`
- `service-worker.js`
- las carpetas `css`, `js` e `icons`

La carpeta `apps-script` se usa únicamente para copiar el backend a Apps Script; no es necesaria para la página publicada.

### 2. Repositorio público para GitHub Pages

GitHub Pages en una cuenta gratuita requiere que el repositorio sea público. En GitHub:

`Settings → General → Danger Zone → Change repository visibility → Public`

No coloque en el repositorio datos de estudiantes, fotografías, DNI, claves ni URL privadas.

### 3. Publicar GitHub Pages

`Settings → Pages → Build and deployment`

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/(root)`
- Save

### 4. Instalar el backend

Abra la hoja de Google Sheets:

`Extensiones → Apps Script`

Reemplace el contenido de `Código.gs` por el archivo:

`apps-script/Codigo.gs`

Cambie esta línea por una clave privada:

```javascript
const APP_PRIVATE_KEY = 'CAMBIAR-ESTA-CLAVE-PRIVADA';
```

Ejemplo:

```javascript
const APP_PRIVATE_KEY = 'AKE-2026-MANUEL-CLAVE-LARGA';
```

No publique esa clave en GitHub.

### 5. Implementar Apps Script

`Implementar → Nueva implementación → Aplicación web`

- Ejecutar como: `Yo`
- Quién tiene acceso: `Cualquier usuario`

Copie la URL que termina en `/exec`.

### 6. Conectar EduTrack

Abra la dirección de GitHub Pages. Entre en `Configuración` y escriba:

- URL de Apps Script.
- La misma clave privada.

Pulse `Guardar configuración` y luego `Probar conexión`.

## Estructura esperada de Google Sheets

La plantilla usa encabezados en la fila 2 y datos desde la fila 3.

### ESTUDIANTES

`CODIGO_QR | APELLIDOS_Y_NOMBRES | GRADO | SECCION | ESTADO`

### MATRICULA

`ID_MATRICULA | CODIGO_QR | APELLIDOS_Y_NOMBRES | GRADO | SECCION | AREA | ACTIVO`

### SESIONES

`ID_SESION | FECHA | AREA | GRADO | SECCION | HORA_INICIO | TOLERANCIA | ESTADO | FECHA_CIERRE`

### REGISTRO_ASISTENCIA

`ID_REGISTRO | FECHA | HORA_REGISTRO | CODIGO_QR | ESTUDIANTE | GRADO | SECCION | AREA | ESTADO | ID_SESION | OBSERVACION`

La pestaña `REGISTRO_EVALUACION` se crea automáticamente.

## Seguridad

Los códigos QR deben contener identificadores internos como `EST-001`, nunca DNI. La aplicación no debe publicarse con nombres, fotos ni datos personales dentro de los archivos de GitHub.
