# 🚀 Turbo-Mailer PRO

**Plataforma Completa de Email Marketing con CRM, Analytics y Tracking**

**WIP -- En breve esta webapp va a cambiar radicalmente, si todo va bien voy a añadirle muchas opciones (Gestión de contactos, importador, Gestión de campañas, analíticas, tracking de visualización, tracking de clicks...)
Nada... Un par de días como mucho**

> ⚠️ **Uso Responsable — Leer antes de usar**
>
> Turbo-Mailer PRO es una herramienta diseñada exclusivamente para **envíos de email legítimos, controlados y con consentimiento previo**: comunicaciones corporativas, newsletters opt-in, campañas B2B entre contactos propios y notificaciones transaccionales.
>
> **No está diseñada, ni debe usarse, para spam o envíos masivos no solicitados.**
>
> El uso de esta aplicación implica la aceptación total de las políticas de uso de Gmail/Google, la normativa vigente (GDPR, CAN-SPAM Act, LSSI-CE) y las leyes de privacidad aplicables en tu país. **El desarrollador de Turbo-Mailer PRO no asume ninguna responsabilidad por el uso indebido de la herramienta**, incluyendo el incumplimiento de dichas normativas, bloqueos de cuenta o consecuencias legales derivadas de un uso no autorizado.

> 📱 **Nota sobre Responsividad:** Esta aplicación **aún no es Responsive**. La interfaz está diseñada para su uso en **Desktop**. El soporte completo para dispositivos móviles (responsividad) está planificado para futuras versiones.

Turbo-Mailer PRO es una plataforma de email marketing de alto rendimiento construida con **Nuxt 3**. Incluye gestión completa de contactos y listas, editor visual de plantillas HTML con bloques drag & drop, sistema de campañas con tracking de aperturas y clics, analytics en tiempo real, integración con IA para copywriting e interfaz multiidioma (ES/EN). Todo con persistencia real en base de datos SQLite y envío masivo vía Gmail SMTP.

![Turbo-Mailer PRO — Dashboard preview](public/images/ogimage.jpg)

## 📸 Interfaz del Proyecto

<table>
  <tr>
    <td><img src="public/images/screenshot_1.webp"></td>
    <td><img src="public/images/screenshot_2.webp"></td>
  </tr>
  <tr>
    <td><img src="public/images/screenshot_3.webp"></td>
    <td><img src="public/images/screenshot_4.webp"></td>
  </tr>
</table>

---

## ✨ Características Principales

### 👥 CRM de Contactos

- Base de datos SQLite con **contactos completos**: email, nombre, empresa, teléfono, LinkedIn, URL, YouTube, Instagram, etiquetas (tags) y estado (`activo / dado de baja / rebotado`)
- Gestión de **listas de distribución** con nombre, descripción y color personalizable
- Búsqueda en tiempo real por email, nombre o empresa
- Filtrado por lista y por estado de suscripción
- Paginación (50 por página), selección múltiple y drag-to-list
- **Importación masiva** desde Excel (`.xlsx`, `.xls`, `.csv`) con autodetección de columnas
- **Exportación CSV** de contactos completa
- CRUD completo de contactos y listas desde la UI

### 📣 Gestión de Campañas

- Wizard de 4 pasos: nombre + asunto → selección de lista → plantilla → revisión y envío
- Estados de campaña: `borrador / programado / enviando / enviado / pausado`
- Vista de detalle por campaña con listado de destinatarios, sus estados y métricas individuales
- Inyección automática de **pixel de tracking** (apertura) y **enlaces trackeados** (clics) en el HTML antes del envío
- Variables dinámicas: `{{Empresa}}`, `{{Contacto}}`, `{{URL}}`, `{{Linkedin}}`, `{{Instagram}}`, `{{Youtube}}`
- Envío masivo vía Gmail SMTP con reporte en tiempo real de éxitos y fallos

### 📊 Analytics

- Dashboard con KPIs: total de contactos, campañas enviadas, tasa media de apertura y tasa media de clics
- **Últimas 10 aperturas** con detección de dispositivo (desktop / móvil / tablet)
- **Top campañas** ordenadas por número de aperturas
- Tracking de eventos individuales: opens y clicks registrados con IP, user-agent y timestamp

### 📡 Tracking de Emails

- Pixel 1×1 transparente (GIF) servido por `/api/track/open` — registra apertura e incrementa contador de campaña
- Redirect trackeado en `/api/track/click` — registra clic, incrementa contador y redirige al destino original
- Tabla `trackingEvents` en SQLite con `sendId`, `campaignId`, `contactId`, `eventType`, `url`, `ip`, `userAgent`

### 🔕 Baja de Suscripción

- Enlace de baja personalizado por destinatario en cada correo
- Página `/unsubscribe` con confirmación de baja, estado ya-dado-de-baja y manejo de errores
- Correo de confirmación automático al darse de baja
- Marca el contacto como `unsubscribed` en la base de datos

### 🎨 Editor Visual de Plantillas

- Accesible desde `/editor`
- **Bloques disponibles**: Header, Hero, Card (standard/premium), Botones, Imagen, Texto, Separador, Footer
- Panel de edición: fuente, tamaño, color de texto y fondo, alineación por bloque
- Panel de capas: árbol visual con reordenamiento drag & drop
- **IA por bloque**: mejora el texto de un bloque individual con un clic
- **IA masiva**: mejora todos los bloques de la plantilla a la vez
- **Atajos de teclado**: `Ctrl+S` guardar · `Ctrl+Z` deshacer · `Ctrl+Y` rehacer · `Delete` eliminar bloque
- Autosave al detectar cambios
- **Galería de Plantillas**: biblioteca para guardar, cargar, renombrar y eliminar plantillas HTML propias
- Live Preview con toggle desktop / móvil / modo oscuro

### 🤖 IA Copywriting Assistant

- Integración con OpenAI (GPT-4o-mini configurable a GPT-4o)
- Mejora bloques individuales preservando el HTML y las variables dinámicas

### 🌐 Multiidioma (i18n)

- Interfaz completa en **Español** e **Inglés**
- Cambio de idioma en tiempo real sin recarga
- Traducción de toda la UI: navegación, pasos, contactos, campañas, analytics, baja de suscripción

### 🔒 Seguridad y Acceso

- Login con contraseña maestra configurable en variable de entorno
- Sesión en cookie `httpOnly` + `SameSite=strict` con TTL de 24 horas
- Rate limiting por IP: 10 intentos fallidos → bloqueo de 15 minutos con contador visible
- Middleware global que redirige a `/login` si la sesión no es válida

### 📱 PWA & Mobile First

- Instalable como app nativa en Windows, iOS y Android
- Soporte offline vía Service Worker (autoUpdate + workbox navigation fallback)

---

## 🛠️ Tecnologías

| Área          | Tecnología                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| Framework     | [Nuxt 3](https://nuxt.com/) — SPA mode (`ssr: false`)                          |
| Base de datos | [SQLite](https://www.sqlite.org/) vía [Drizzle ORM](https://orm.drizzle.team/) |
| Emailing      | [Nodemailer](https://nodemailer.com/) — Gmail SMTP                             |
| Data Handling | [XLSX (SheetJS)](https://sheetjs.com/)                                         |
| IA            | [OpenAI API](https://platform.openai.com/) — GPT-4o-mini (configurable)        |
| i18n          | [@nuxtjs/i18n](https://i18n.nuxtjs.org/)                                       |
| Icons         | [Lucide Vue Next](https://lucide.dev/)                                         |
| PWA           | `@vite-pwa/nuxt`                                                               |

---

## 🗄️ Base de Datos

SQLite en `./data/turbomailer.db` gestionada con Drizzle ORM. Tablas principales:

| Tabla            | Descripción                                             |
| ---------------- | ------------------------------------------------------- |
| `contacts`       | Contactos con todos sus campos y estado de suscripción  |
| `lists`          | Listas de distribución con nombre, descripción y color  |
| `listContacts`   | Relación M×N contactos ↔ listas (cascade delete)        |
| `campaigns`      | Campañas con estado, contadores y timestamps            |
| `sends`          | Envíos individuales por destinatario con estado y error |
| `trackingEvents` | Eventos de apertura y clic con metadata                 |

---

## 🚀 Flujo de Trabajo

1. **Contactos** — Importa desde Excel o añade manualmente. Organiza en listas con colores.
2. **Campaña** — Crea una campaña en el wizard de 4 pasos: nombre, lista, plantilla, revisión.
3. **Editor** — Diseña tu plantilla en el editor visual o carga una existente de la galería.
4. **Envío** — Previsualiza y envía. El tracking se inyecta automáticamente.
5. **Analytics** — Monitoriza aperturas, clics y rendimiento por campaña en el dashboard.

---

## 🚀 Instalación Rápida

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/tu-usuario/turbo-mailer.git
   cd turbo-mailer
   ```

2. **Instalar dependencias**

   ```bash
   npm install
   ```

3. **Configurar el entorno**

   Renombra `.env.template` a `.env` en la raíz del proyecto y completa los campos:

   ```env
   # Acceso a la Aplicación (requerido)
   APP_PASSWORD=tu-contraseña-de-acceso

   # Gmail SMTP (requerido para enviar)
   GMAIL_USER=tu-correo@gmail.com
   GMAIL_APP_PASSWORD=tu-app-password-de-16-caracteres

   # Inteligencia Artificial (opcional)
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini

   # Tracking (URL base de la app, para generar pixels y links trackeados)
   TRACKING_BASE_URL=http://localhost:3000
   ```

4. **Base de datos — dos opciones**

   **Opción A — Demo preconfigurada** (recomendado para probar la app rápidamente):

   Renombra el archivo de demo incluido en el repositorio:

   ```bash
   mv data/turbomailer_demo.db data/turbomailer.db
   ```

   Contiene 15 contactos, 3 listas, 4 campañas (3 enviadas + 1 borrador) y eventos de tracking listos para explorar el dashboard.

   **Opción B — Base de datos vacía** (para uso real):

   ```bash
   npx drizzle-kit push
   ```

5. **Iniciar en desarrollo**

   ```bash
   npm run dev
   ```

---

## 🔑 Cómo crear una App Password de Gmail

La app usa Gmail SMTP con una contraseña de aplicación de 16 dígitos (no tu contraseña normal).

1. **Activar Verificación en 2 Pasos**: [Cuenta de Google → Seguridad](https://myaccount.google.com/security)
2. **Generar contraseña**: Accede a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Escribe un nombre (ej. `Turbo Mailer PRO`) y haz clic en **Crear**
4. Copia el código de 16 caracteres (sin espacios) y pégalo en `GMAIL_APP_PASSWORD`

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

| Método | Ruta                        | Descripción                         |
| ------ | --------------------------- | ----------------------------------- |
| GET    | `/api/campaigns`            | Listar campañas (filtro por estado) |
| POST   | `/api/campaigns`            | Crear borrador                      |
| GET    | `/api/campaigns/[id]`       | Detalle con métricas                |
| PUT    | `/api/campaigns/[id]`       | Actualizar campaña                  |
| DELETE | `/api/campaigns/[id]`       | Eliminar campaña                    |
| POST   | `/api/campaigns/[id]/send`  | Lanzar envío                        |
| GET    | `/api/campaigns/[id]/sends` | Listado de envíos individuales      |

### Tracking & Analytics

| Método | Ruta               | Descripción                 |
| ------ | ------------------ | --------------------------- |
| GET    | `/api/track/open`  | Pixel de apertura (GIF 1×1) |
| GET    | `/api/track/click` | Redirect trackeado          |
| GET    | `/api/analytics`   | KPIs del dashboard          |
| GET    | `/api/unsubscribe` | Baja de suscripción         |

---

## 🛡️ Seguridad

- Contraseña maestra almacenada en variable de entorno (nunca en código)
- Sesión en cookie `httpOnly` + `SameSite=strict` con TTL de 24 horas
- Rate limiting por IP: 10 intentos fallidos → bloqueo de 15 minutos con contador visible
- Middleware global que redirige a `/login` si la sesión no es válida
- Los datos de contactos persisten en SQLite local — no salen del servidor

---

## 📄 Plantillas de Demo

Encuentra una plantilla de ejemplo profesional en: `docs/email_demo.html`

---

## 📝 ToDo / Pendiente

- [ ] **Campañas** — Revisar funcionalidades completas (wizard, envío, estados, tracking inyectado). Funcional y testeado básicamente, pero requiere testing en profundidad.
- [ ] **Contactos** — Revisar CRUD, importación Excel, exportación CSV, drag-to-list, paginación y filtros. Funcional y testeado básicamente, pero requiere testing en profundidad.
- [ ] **Analíticas** — Revisar KPIs, últimas aperturas, top campañas y eventos de tracking. Funcional y testeado básicamente, pero requiere testing en profundidad.
- [ ] **Responsividad** — Adaptar toda la interfaz para dispositivos móviles (actualmente optimizado para Desktop).

---

## ⚖️ Aviso Legal

Este proyecto es una herramienta de desarrollo. El uso indebido para comunicaciones no solicitadas (SPAM) está prohibido. Asegúrate de cumplir con las normativas locales (GDPR, CAN-SPAM Act, LSSI-CE) antes de realizar envíos masivos.

---

**Desarrollado con ❤️ por crazyramirez mientras me zampo tropecientos podcasts en Youtube de fondo.**
