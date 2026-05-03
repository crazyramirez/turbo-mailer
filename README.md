# 🚀 TurboMailer

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**[English version](README.en.md)**

**Plataforma Completa de Email Marketing con CRM, Editor HTML, IA, Analytics, Tracking y mucho más.**

TurboMailer es una aplicación **self-hosted de cuenta única diseñada para VPS**, construida con **Nuxt 3**. Ofrece soberanía total de datos, gestión completa de contactos y listas, editor visual de plantillas HTML con bloques drag & drop, sistema de campañas con tracking de aperturas y clics, analytics en tiempo real, integración con IA para copywriting e interfaz multiidioma (ES/EN). Todo con persistencia en SQLite y envío masivo vía cualquier servicio SMTP (Gmail, Outlook, Amazon SES, etc.).

## 🛡️ Tu Información, Solo Tuya

Al ser una aplicación auto-alojada en tu propio servidor:

- **Eliminas Intermediarios**: No entregas la información de tus contactos a ninguna plataforma externa.
- **Privacidad Profesional**: Conexión directa entre tu instancia y tu servicio de correo.

![TurboMailer — Dashboard preview](public/images/ogimage.jpg)

## 📸 Interfaz

<table>
  <tr>
    <td><img src="public/images/sc_1.webp"></td>
    <td><img src="public/images/sc_2.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/sc_3.webp"></td>
    <td><img src="public/images/sc_4.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/sc_5.webp"></td>
    <td><img src="public/images/sc_6.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/sc_7.webp"></td>
    <td><img src="public/images/sc_8.webp"></td>
  </tr>
</table>

---

## ✨ Características Principales

### 👥 CRM de Contactos

- Base de datos SQLite con **contactos completos**: email, nombre, empresa, teléfono, LinkedIn, URL, YouTube, Instagram, tags y estado (`activo / dado de baja / rebotado`)
- Gestión de **listas de distribución** con nombre, descripción y color personalizable
- Búsqueda en tiempo real, filtrado por lista y estado, paginación (50/página), selección múltiple y drag-to-list
- **Importación masiva** desde Excel (`.xlsx`, `.xls`, `.csv`) con autodetección de columnas
- **Exportación CSV** completa y CRUD desde la UI

### 📣 Gestión de Campañas

- Wizard de 4 pasos: nombre + asunto → lista → plantilla → revisión y envío
- Estados: `borrador / programado / enviando / enviado / pausado`
- Inyección automática de **pixel de tracking** (aperturas) y **enlaces trackeados** (clics)
- Variables dinámicas: `{{Empresa}}`, `{{Nombre}}`, `{{URL}}`, `{{Linkedin}}`, `{{Instagram}}`, `{{Youtube}}`
- **Envío en segundo plano**: el overlay desaparece a los 4 segundos, el envío continúa sin mantener la ventana abierta
- **Badge de progreso persistente**: indicador flotante (inferior derecha) visible en toda la app con barra de progreso, botón de pausa y reanudación
- **Reintentos profesionales**: reintento automático a nivel SMTP + botón manual "Reintentar fallidos"
- **Reenvío individual**: botón por destinatario para reenviar emails fallidos o pendientes

### 📊 Analytics Avanzado

- KPIs en tiempo real: contactos totales, campañas enviadas, tasa media de apertura y clics
- **Embudo de Conversión**: Enviados → Abiertos → Clics
- Tendencia de 14 días, distribución por dispositivo (donut), rendimiento por campaña (barras)
- Listado de últimas aperturas con dispositivo, empresa, nombre y timestamp
- **Auto-refresco** cada 30 segundos

### 📡 Tracking de Emails

- Pixel 1×1 GIF en `/api/track/open` — registra apertura e incrementa contador
- Redirect trackeado en `/api/track/click` — registra clic y redirige al destino
- Tabla `trackingEvents` con `sendId`, `campaignId`, `contactId`, `eventType`, `url`, `ip`, `userAgent`

### 🔕 Gestión de Bajas

- Enlace de baja personalizado por destinatario en cada correo
- Página `/unsubscribe` con confirmación y manejo de errores
- Correo de confirmación automático al darse de baja
- Marca el contacto como `unsubscribed` en la base de datos

### 📧 Entregabilidad y Reputación

- **Cabeceras List-Unsubscribe**: desuscripción con un clic desde el cliente de correo
- **Gestión de Rebotes**: detección de errores permanentes (5xx) y marcado automático como `bounced`
- **Firmado DKIM Nativo**: soporte RSA-2048 configurable. Genera tus claves con `node scripts/generate-dkim.js tudominio.com`
- **Control de Cadencia**: delay y jitter configurables para evitar patrones de envío robótico

### 🎨 Editor Visual de Plantillas

- **Bloques**: Header Pro, Hero, Texto, Botón, Imagen, Tarjeta, Grid Dúo/Trío/Quad, Nota, Presencia, Testimonios, Precios, Video, Sociales, Separador, FAQ, Estadísticas, Desuscribir, Firma
- Panel de edición: fuente, tamaño, colores, alineación, bordes, radio
- Panel de capas con drag & drop
- **IA por bloque** e **IA masiva** para mejorar textos
- Atajos: `Ctrl+S` guardar · `Ctrl+Z` deshacer · `Ctrl+Y` rehacer · `Delete` eliminar
- Galería de plantillas, gestor de imágenes (redimensionado a 1200px con `sharp`), 5 estilos globales prediseñados
- Live Preview con toggle desktop / móvil / modo oscuro

### 🤖 IA Copywriting & Diseño Generativo

- **Asistente de Bloques**: mejora bloques individuales preservando HTML y variables dinámicas
- **Generador de Plantillas**: crea campañas completas mediante conversación guiada con IA
- **Imágenes por IA con Persistencia**: genera imágenes vía Pollinations.ai y las descarga al servidor local
- **Estilos Contextuales**: elige automáticamente el tema visual más adecuado a tu sector

### 🌐 Multiidioma (i18n)

- Interfaz completa en **Español** e **Inglés**
- Cambio de idioma en tiempo real sin recarga

### 🧹 Reseteo Selectivo

Desde el Dashboard → botón **Reset**:

- **Todo (Reset Agresivo)**: elimina todos los registros y archivos de plantillas
- **Solo Base de Datos**: limpia datos pero preserva plantillas
- **Por Módulo**: Contactos / Campañas / Analytics
- **Reconfiguración**: elimina `data/.installed` y `data/config.json` → redirige al wizard de instalación
- **Backup automático**: genera `.zip` antes de cualquier reset masivo

### 🔒 Privacidad y SEO

- Meta tags `noindex`, `nofollow`, `noarchive`
- `robots.txt` bloquea todos los rastreadores

---

## 🛠️ Tecnologías

| Área          | Tecnología                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| Framework     | [Nuxt 3](https://nuxt.com/) — SPA mode (`ssr: false`)                          |
| Base de datos | [SQLite](https://www.sqlite.org/) vía [Drizzle ORM](https://orm.drizzle.team/) |
| Emailing      | [Nodemailer](https://nodemailer.com/) — SMTP (Gmail, Outlook, etc.)            |
| Data Handling | [XLSX (SheetJS)](https://sheetjs.com/)                                         |
| IA            | [OpenAI API](https://platform.openai.com/) — GPT-4o-mini (configurable)        |
| i18n          | [@nuxtjs/i18n](https://i18n.nuxtjs.org/)                                       |
| Iconos        | [Lucide Vue Next](https://lucide.dev/)                                         |
| PWA           | `@vite-pwa/nuxt`                                                               |

---

## 🗄️ Base de Datos (Zero-CLI)

TurboMailer gestiona la base de datos de forma **100% automática**.

- **Auto-Instalación**: crea el archivo SQLite y todas las tablas en el primer arranque
- **Auto-Migración**: detecta cambios de esquema y actualiza la base de datos al reiniciar
- **Auto-Recreación**: si borras el `.db`, la app lo regenera al instante

SQLite en `./data/turbomailer.db`. Tablas principales:

| Tabla            | Descripción                                             |
| ---------------- | ------------------------------------------------------- |
| `contacts`       | Contactos con todos sus campos y estado de suscripción  |
| `lists`          | Listas de distribución con nombre, descripción y color  |
| `listContacts`   | Relación M×N contactos ↔ listas (cascade delete)        |
| `campaigns`      | Campañas con estado, contadores y timestamps            |
| `sends`          | Envíos individuales por destinatario con estado y error |
| `trackingEvents` | Eventos de apertura y clic con metadata                 |

---

## 🧙 Wizard de Instalación

TurboMailer incluye un **wizard de configuración inicial** que te guía paso a paso al arrancar por primera vez. No necesitas editar archivos `.env` manualmente.

### Cómo funciona

Al acceder a la app sin configuración previa, el sistema redirige automáticamente a `/setup`. El wizard cubre **6 pasos**:

| Paso | Contenido |
|------|-----------|
| 1 | **Seguridad** — Contraseña de administrador (hasheada con BCrypt automáticamente) |
| 2 | **SMTP** — Host, puerto, usuario, contraseña, nombre y email de remitente. Incluye test de conexión en vivo y opciones avanzadas de cadencia |
| 3 | **Configuración de App** — URL base de tracking, secretos HMAC (autogenerados o manuales) |
| 4 | **OpenAI** *(opcional)* — API Key y modelo para IA de copywriting |
| 5 | **DKIM** *(opcional)* — Dominio, selector y clave privada RSA para firmado de correos |
| 6 | **Revisión e Instalación** — Resumen completo antes de instalar |

### Al completar el wizard

El sistema genera automáticamente:
- `data/config.json` — configuración en tiempo de ejecución (leída en cada request)
- `.env` — copia de referencia para modificaciones manuales
- `data/.installed` — centinela que marca la app como instalada

Después muestra instrucciones claras para **reiniciar la aplicación** en Plesk (o el entorno que uses) e **detecta automáticamente** cuando el servidor ha vuelto a arrancar para redirigirte al login.

### Reconfigurar

Desde **Dashboard → Reset → Reconfiguración**, el wizard vuelve a ejecutarse desde cero para actualizar cualquier configuración (SMTP, secretos, IA, DKIM).

---

## 🚀 Instalación Rápida

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/tu-usuario/TurboMailer.git
   cd TurboMailer
   ```

2. **Instalar dependencias**

   ```bash
   npm install
   ```

3. **Iniciar la aplicación**

   ```bash
   npm run dev        # desarrollo
   npm run build      # producción (luego node .output/server/index.mjs)
   ```

4. **Abrir en el navegador**

   La app detecta automáticamente que no está configurada y redirige a `/setup`. El wizard guía la configuración completa.

   > En Plesk u otros entornos Node.js: después de completar el wizard, reinicia la aplicación desde el panel para que los cambios surtan efecto. El wizard te indica exactamente los pasos y detecta automáticamente el reinicio.

---

## 🎯 Primer Uso — Base de Datos Demo

Tras la instalación, al abrir el dashboard por primera vez (base de datos vacía), aparece una pantalla de bienvenida con dos opciones:

**Opción A — Datos de ejemplo**: carga `data/turbomailer_demo.db` con contactos, campañas, estadísticas y eventos de tracking ya poblados para explorar todas las funciones.

**Opción B — Empezar desde cero**: base de datos vacía lista para importar tus propios contactos.

> `data/turbomailer_demo.db` nunca se elimina. Puedes recargar los datos demo en cualquier momento con **Reset → Todo**.

---

## 👻 Seguridad Invisible (Ghost Mode)

TurboMailer está diseñado para ser invisible ante visitantes o rastreadores.

1. **Raíz de Señuelo**: `/` muestra una página de estado técnica simulando un nodo SMTP. El panel está en `/dashboard`.
2. **Login Oculto**: `/login` directamente muestra un 404 falso (Apache/Ubuntu).
3. **Acceso**: `tudominio.com/login?portal=TU_PORTAL_KEY`

Una vez autenticado, puedes navegar con normalidad. Al cerrar sesión, vuelves al señuelo.

La clave `portal=` se guarda en `localStorage` y **se elimina inmediatamente de la URL** para no quedar expuesta.

### Variable GHOST_MODE

- **`GHOST_MODE=true`**: oculta la raíz por completo — cualquier acceso no autenticado va directo a `/login`
- **`GHOST_MODE=false`** (por defecto): muestra la página de señuelo en `/`

> El wizard genera `PORTAL_KEY=admin` y `GHOST_MODE=false` por defecto. Edita `.env` para cambiarlos y reinicia.

---

## 🔑 Ejemplo: Configuración con Gmail

Gmail SMTP requiere una contraseña de aplicación de 16 dígitos (no tu contraseña normal).

1. Activa **Verificación en 2 Pasos**: [Cuenta de Google → Seguridad](https://myaccount.google.com/security)
2. Genera contraseña en [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Escribe un nombre (ej. `TurboMailer`) y copia el código de 16 caracteres
4. En el wizard paso 2: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, pega el código en la contraseña SMTP

---

## 🔐 Contraseña (BCrypt)

El wizard hashea la contraseña automáticamente con BCrypt (coste 12). Si necesitas cambiarla manualmente:

```bash
npm run hash-password
# O directamente:
npm run hash-password mi-contraseña-segura
```

Pega el hash resultante en `APP_PASSWORD` de tu `.env` y reinicia.

---

## 📡 API Reference

### Auth

| Método | Ruta               | Descripción                  |
| ------ | ------------------ | ---------------------------- |
| POST   | `/api/auth/login`  | Login con contraseña maestra |
| GET    | `/api/auth/check`  | Verificar sesión activa      |
| POST   | `/api/auth/logout` | Cerrar sesión                |

### Contactos

| Método | Ruta                   | Descripción                              |
| ------ | ---------------------- | ---------------------------------------- |
| GET    | `/api/contacts`        | Listar con búsqueda, filtro y paginación |
| POST   | `/api/contacts`        | Crear contacto                           |
| GET    | `/api/contacts/[id]`   | Detalle con listas asociadas             |
| PUT    | `/api/contacts/[id]`   | Actualizar campos y tags                 |
| DELETE | `/api/contacts/[id]`   | Eliminar contacto                        |
| POST   | `/api/contacts/import` | Importación masiva desde array           |
| GET    | `/api/contacts/export` | Exportar CSV completo                    |

### Listas

| Método | Ruta                                   | Descripción                         |
| ------ | -------------------------------------- | ----------------------------------- |
| GET    | `/api/lists`                           | Listar con conteo de contactos      |
| POST   | `/api/lists`                           | Crear lista                         |
| PUT    | `/api/lists/[id]`                      | Actualizar nombre/descripción/color |
| DELETE | `/api/lists/[id]`                      | Eliminar lista (cascade)            |
| POST   | `/api/lists/[id]/contacts`             | Añadir contactos en batch           |
| DELETE | `/api/lists/[id]/contacts/[contactId]` | Quitar contacto de lista            |

### Campañas

| Método | Ruta                                        | Descripción                         |
| ------ | ------------------------------------------- | ----------------------------------- |
| GET    | `/api/campaigns`                            | Listar campañas (filtro por estado) |
| POST   | `/api/campaigns`                            | Crear borrador                      |
| GET    | `/api/campaigns/[id]`                       | Detalle con métricas                |
| PUT    | `/api/campaigns/[id]`                       | Actualizar campaña                  |
| DELETE | `/api/campaigns/[id]`                       | Eliminar campaña                    |
| POST   | `/api/campaigns/[id]/send`                  | Lanzar envío                        |
| POST   | `/api/campaigns/[id]/retry`                 | Reintentar envíos fallidos          |
| POST   | `/api/campaigns/[id]/pause`                 | Pausar envío en curso               |
| GET    | `/api/campaigns/[id]/progress`              | Progreso en tiempo real             |
| POST   | `/api/campaigns/[id]/sends/[sendId]/resend` | Reenviar destinatario individual    |
| GET    | `/api/campaigns/[id]/sends`                 | Listado de envíos individuales      |

### Tracking & Analytics

| Método | Ruta               | Descripción                 |
| ------ | ------------------ | --------------------------- |
| GET    | `/api/track/open`  | Pixel de apertura (GIF 1×1) |
| GET    | `/api/track/click` | Redirect trackeado          |
| GET    | `/api/analytics`   | KPIs del dashboard          |
| GET    | `/api/unsubscribe` | Baja de suscripción         |
| DELETE | `/api/reset`       | Reseteo selectivo de datos  |

### Recursos (Imágenes)

| Método | Ruta           | Descripción                                |
| ------ | -------------- | ------------------------------------------ |
| GET    | `/api/uploads` | Listar imágenes almacenadas en el servidor |
| POST   | `/api/uploads` | Subir y redimensionar imágenes (1200px)    |
| DELETE | `/api/uploads` | Eliminar archivo de imagen físicamente     |

---

## 🔑 Integración Externa (API Key)

Conecta formularios o aplicaciones externas directamente con TurboMailer.

### Autenticación

Incluye en todas las peticiones:

```http
X-API-Key: tu-api-secret-key
```

o

```http
Authorization: Bearer tu-api-secret-key
```

El valor es `API_SECRET` de tu `data/config.json` / `.env` (generado automáticamente por el wizard).

### Suscripción (`POST /api/subscribe`)

```bash
curl -X POST https://tu-dominio.com/api/subscribe \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-api-secret-key" \
  -d '{"email":"contacto@ejemplo.com","name":"Juan Pérez","tags":["lead"],"listIds":[1]}'
```

Parámetros: `email` (requerido), `name`, `company`, `phone`, `role`, `linkedin`, `url`, `tags[]`, `listIds[]`

### Baja (`POST /api/unsubscribe`)

```bash
curl -X POST https://tu-dominio.com/api/unsubscribe \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu-api-secret-key" \
  -d '{"email":"contacto@ejemplo.com"}'
```

---

## 📄 Plantillas de Demo

- Plantilla profesional de ejemplo: `data/demo/email_demo.html`
- Listas de contactos para pruebas: `data/demo/contacts_demo.csv` y `data/demo/contacts_demo.xlsx`

---

## 📝 ToDo / Pendiente

- [x] **Wizard de Instalación** — Configuración inicial guiada en `/setup`, sin edición manual de `.env`
- [x] **Campañas** — Wizard, envío, estados, tracking. Funcional y testeado básicamente
- [x] **Contactos** — CRUD, importación Excel, exportación CSV, drag-to-list, paginación y filtros
- [x] **Analíticas** — KPIs, últimas aperturas, top campañas y eventos de tracking
- [x] **Internacionalizar Editor** — Visor de editor internacionalizado (ES/EN)
- [ ] **Editor Responsive** — El editor está diseñado para escritorio; adaptación móvil compleja

---

## ⚖️ Licencia

Licenciado bajo **GNU Affero General Public License v3.0 (AGPL-3.0)**.

- **Copyleft**: modificaciones deben publicarse bajo la misma licencia
- **Interacción en Red**: si ejecutas una versión modificada como SaaS, debes proporcionar el código fuente a tus usuarios
- **Uso Comercial**: libre para proyectos personales y open-source. Para uso comercial sin abrir el código, se requiere una **licencia comercial privada**

Para consultas de licencia comercial, contáctame.

---

⚠️ **Uso Responsable:** Diseñado para envíos legítimos y con permiso (newsletters, B2B). **Prohibido para spam.** Al usarlo, aceptas las normas de Google y leyes de privacidad (GDPR, etc.) bajo tu propia responsabilidad.

**Desarrollado con ❤️ por Crazyramirez mientras me zampo tropecientos podcasts en Youtube de fondo.**
