# 🚀 TurboMailer

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**[English version](README.en.md)**

**Plataforma Completa de Email Marketing con CRM, Editor HTML, IA, Analytics, Tracking y mucho más.**

TurboMailer es una aplicación **self-hosted diseñada para VPS, con equipo y roles en tu propia instancia**, construida con **Nuxt 3**. Ofrece gestión de contactos y audiencias, un Editor Pro de plantillas HTML con módulos editables, un asistente IA para diseñar campañas, automatizaciones, tracking de aperturas y clics, analytics e interfaz multiidioma (ES/EN). Todo con persistencia en SQLite y envío mediante tus perfiles SMTP.

> If this tool saves you time, consider supporting its development — every contribution funds more experiments and free tools for the community. ☕
>
> <a href="https://www.buymeacoffee.com/drlerian" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50"></a>

## 🛡️ Tu Información, Solo Tuya

Al ser una aplicación auto-alojada en tu propio servidor:

- **Almacenamiento propio**: Contactos, campañas, plantillas y analíticas se guardan en tu servidor.
- **Proveedores elegidos por ti**: Tu instancia se conecta a los servicios SMTP e IA que configures; también puedes usar modelos IA locales.

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

## 💎 Edición Premium — lo nuevo

### 🤖 IA para diseñar y revisar campañas

- **Asistente guiado compartido** entre «+ Nueva Campaña → Crea la campaña completa con IA» y el Editor Pro: campaña, objetivo, audiencia, contenido, estilo y firma, con vista previa y revisiones por instrucciones
- **Campaña completa desde una idea o una URL de referencia**: asunto, preheader, módulos nativos editables, variantes de asunto y una sugerencia de horario; puedes guardar el borrador o programarlo expresamente
- **Kit de marca** extraído de tu web: logo, colores, tipografías, tono y propuestas de valor, con opción de usarlo en el asistente
- **Laboratorio de asuntos**: variantes con ángulos distintos puntuadas con análisis anti-spam y el historial real de tu audiencia; aplícalas como A o B
- **Revisión editorial previa al envío**, **análisis post-campaña** con recomendaciones y **"Pregunta a tus datos"** (con gráficas; solo ve cifras agregadas)
- **Segmentos descritos en lenguaje natural** y emails de automatización generados con tu marca
- Claude (Opus 5 por defecto, con fallback automático), OpenAI o **modelos locales** (Ollama, LM Studio, vLLM)

### 📬 Motor de envío a prueba de fallos
- Sin duplicados ni aunque el servidor se caiga a mitad de campaña; **reanudación automática** al arrancar
- Varios remitentes SMTP con **failover**, DKIM por remitente, límites por proveedor (Gmail/Outlook/Yahoo), **calentamiento de IP** y **hora óptima por contacto**
- **Freno de emergencia**: pausa sola la campaña si suben rebotes, bloqueos o quejas
- Clasificación precisa de errores SMTP: un bloqueo de política no marca al contacto como rebotado
- Test A/B con **significancia estadística** (clics → aperturas humanas), follow-ups automáticos a no-abridores

### ✅ Entregabilidad profesional
- **Baja en un clic RFC 8058** (exigida por Gmail/Yahoo), páginas seguras frente a escáneres de enlaces
- **Lista de supresión global** (bajas, rebotes, quejas) que sobrevive a borrados y reimportaciones
- VERP + procesado IMAP de rebotes, quejas ARF, bajas por email e **informes DMARC**
- Chequeo previo: SPF (límite de 10 lookups), DKIM, DMARC, BIMI, MTA-STS, listas negras, puntuación de spam (interna, rspamd o SpamAssassin), compatibilidad con clientes de correo
- **Prueba de bandeja de entrada** con buzones semilla (Principal / Promociones / Spam) y monitor de listas negras
- Aperturas de Apple Mail Privacy y proxies de Gmail separadas de las humanas; **sunset** automático de inactivos

### 👥 Audiencia y automatización
- **Segmentos dinámicos** con constructor visual (comportamiento, fechas, campos, etiquetas, listas)
- **Campos personalizados**, **temas de suscripción** en el centro de preferencias, **formularios alojados/incrustables** con anti-bots
- **Automatizaciones visuales**: bienvenida, carrito abandonado, post-compra, reactivación, aniversarios… con esperas, condiciones, etiquetas, webhooks
- Galería de automatizaciones con plantillas iniciales y flujo en blanco, recuentos de ejecuciones y duplicación de flujos
- Plantillas con `{{#if}}…{{else}}…{{/if}}`, valores por defecto `{{nombre | "amigo"}}` y variables personalizadas
- Verificación de emails (erratas, dominios sin correo, desechables) y **RGPD**: exportación y derecho al olvido

### 🏢 Plataforma
- **Equipo con roles** (propietario, admin, editor, lector) y **verificación en dos pasos** (TOTP + códigos de recuperación)
- **API REST pública** con claves por permisos e idempotencia: emails transaccionales, contactos, eventos
- **Ajustes desde la interfaz** con secretos cifrados, **copias automáticas** locales y en S3 cifradas, restauración guiada
- **Métricas Prometheus**, alertas por Slack/Telegram/email, registro de auditoría por usuario, **Docker** listo

---

## 🆕 Actualizaciones del 27 de septiembre de 2026

- Asistente unificado con recuperación de firmas anteriores y validación del diseño completo; admite **hasta 40 módulos finales**, incluidos firma y pie, y conserva la propuesta durante el reintento de reparación.
- Editor Pro con **23 módulos y 6 estilos**, botones internos editables, biblioteca con búsqueda, vistas a anchos reales y revisión de calidad del HTML.
- Generación de tarjetas en **filas de dos**; mejoras de Grid Trío/Quad, estilos responsive conservados al exportar y correcciones de historial y guardado.
- Idioma de la interfaz en **Ajustes → General** y envío SMTP de prueba con destinatario y remitente seleccionables.
- Contactos **inactivos** diferenciados de los rebotados, incluidos los pendientes de doble opt-in.
- Compatibilidad corregida con los parámetros de OpenAI y con el arranque ESM de Nodemailer y las importaciones de configuración/directorio de datos en producción.

Los apartados siguientes describen cómo utilizar estas funciones. La última validación de código de esta fecha pasó **549 pruebas automatizadas**, comprobación de tipos y compilación de producción.

---

## ✨ Características Principales

### 👥 CRM de Contactos

- Base de datos SQLite con **contactos completos**: email, nombre, empresa, teléfono, LinkedIn, URL, YouTube, Instagram, tags y estado (`activo / inactivo / dado de baja / rebotado`)
- Los contactos **inactivos**, que pueden estar pendientes de confirmar la suscripción, tienen etiqueta y filtro propios; no se muestran como rebotados
- Gestión de **listas de distribución** con nombre, descripción y color personalizable
- Búsqueda en tiempo real, filtrado por lista y estado, paginación (50/página), selección múltiple y drag-to-list
- **Importación masiva** desde Excel (`.xlsx`, `.xls`, `.csv`) con autodetección de columnas
- **Exportación CSV** completa y CRUD desde la UI

### 📣 Gestión de Campañas

- Wizard de 4 pasos: nombre + asunto → lista → plantilla → revisión y envío
- Creación con el **mismo asistente IA del Editor Pro**, añadiendo lista de destinatarios, URL de referencia e imágenes IA opcionales; genera también asunto B, asunto de seguimiento y horario sugerido
- La propuesta se revisa antes de crear el borrador o elegir **programar** con una lista; la hora sugerida se interpreta en la zona local del operador. Generar con IA por sí solo no inicia un envío ni programa la campaña
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

### 🎨 Editor Pro de Plantillas

- **23 módulos nativos**: Header Pro, Hero, Texto, Botón, Imagen, Tarjeta, Grid Dúo, Grid Trío, Grid Quad, Nota, Presencia, Testimonios, Precios, Video, Sociales, Separador, FAQ, Estadísticas, Espaciador, Producto, Cupón, Desuscribir y Firma
- Biblioteca con **búsqueda y categorías**; inserción por clic, teclado o drag & drop, y panel de capas para seleccionar y reordenar módulos
- Panel de edición de fuente, tamaño, colores, alineación, bordes y radio; **Botones del módulo** permite seleccionar cada botón dentro de Hero, Producto o Precios y cambiar texto, enlace, colores, tamaño, espaciado y redondeado, también en plantillas ya creadas. En el módulo Botón se pueden añadir o eliminar botones
- **6 estilos globales**: Modern Clean, Corporate Premium, Corporate Bold, Tech Noir, Lux Dark y Midnight Gold; al cargar una plantilla se conservan su ancho y sus estilos personalizados
- Vista previa de escritorio a **600, 700 y 820 px** y de móvil a **320, 375 y 414 px**, con ajuste al espacio disponible o **100 %**; la escala no cambia el ancho real del documento. Incluye simulación de modo oscuro
- Tarjetas, imágenes y tablas con ajustes responsive; Grid Trío y Quad siguen disponibles para edición manual. El HTML exportado y preparado para envío conserva las reglas de disposición de los módulos
- Panel **Revisión**: analiza el HTML a **320, 375, 600 y 820 px** y señala desbordamientos, enlaces vacíos o inválidos, imágenes sin texto alternativo o que no cargan, texto pequeño, contraste y contenido de ejemplo; permite ir al módulo afectado y avisa cuando hay cambios posteriores al análisis
- Gestor de imágenes con redimensionado a 1200 px, **texto alternativo** y opción de imagen decorativa
- **IA por bloque** e **IA masiva** para mejorar textos; historial de deshacer/rehacer del documento completo, incluidos estilos y metadatos
- Guardado coordinado antes de cambiar de plantilla y conservación del borrador si falla ese guardado; al aplicar una propuesta IA se guarda como plantilla nueva y se conserva el trabajo anterior
- Atajos: `Ctrl+S` guardar · `Ctrl+Z` deshacer · `Ctrl+Y` rehacer · `Delete` eliminar; exportación de HTML y gestión de versiones de plantillas

La revisión visual utiliza un navegador y no sustituye una prueba en los clientes de correo de tus destinatarios. La matriz comprobada de módulos y estilos pasó **72 combinaciones sin desbordamientos en navegador**; no equivale a una certificación visual en bandejas reales de Gmail u Outlook. La interfaz de edición está orientada a escritorio, aunque los emails incluyan diseño móvil.

### 🤖 IA Copywriting & Diseño Generativo

- **Asistente de Bloques**: mejora bloques individuales preservando HTML y variables dinámicas
- **Asistente de campañas por pasos**: define campaña, objetivo y audiencia; después contenido y CTA, tono y dirección visual, firma y revisión de la propuesta
- **Firmas reutilizables**: recupera los bloques nativos de firma de campañas y plantillas anteriores, muestra su procedencia y permite revisarlos o excluirlos; si no encuentra uno, puede usar la identidad del remitente configurado. La firma aprobada se inserta sin inventar datos
- **Diseño con módulos reales**: el catálogo de la IA se deriva de los espacios editables del Editor Pro. La composición sigue el estilo elegido, el objetivo, la marca opcional y las imágenes disponibles
- **Tarjetas en pares**: tres elementos se distribuyen como Grid Dúo + Tarjeta; cuatro o más usan varios dúos y una tarjeta final si sobra un elemento
- **Validación antes de aplicar**: comprueba estructura y campos, filtra imágenes y enlaces sin referencia válida y solicita una propuesta completa corregida si hace falta. El diseño final admite **entre 3 y 40 módulos**, contando la firma y el pie automático; se pide redistribuir el exceso de contenido en lugar de cortar la lista de módulos. Si el reintento sigue siendo inválido, el asistente muestra el error y no aplica ese diseño
- **Imágenes IA opcionales en la creación de campañas**: genera imágenes vía Pollinations.ai y las descarga al servidor local; sin esa opción se utilizan las imágenes disponibles de las referencias
- Proveedores configurables en **Ajustes → IA**: Anthropic, OpenAI o un endpoint compatible. OpenAI usa `max_completion_tokens` sin imponer una temperatura fija; los endpoints compatibles conservan `max_tokens`

#### Flujo recomendado

1. Abre **+ Nueva Campaña → Crea la campaña completa con IA** o **Editor Pro → Crear con IA**.
2. Completa el brief, confirma el destino del CTA, elige el estilo y revisa la firma. Al crear una campaña puedes añadir lista, URL de referencia e imágenes IA opcionales.
3. Genera la propuesta, examina el diseño en escritorio y móvil y pide ajustes de contenido o composición.
4. Guarda la nueva plantilla o el borrador de campaña. En modo campaña, programar la hora sugerida es una acción explícita aparte.
5. En el Editor Pro, comprueba los anchos relevantes y ejecuta **Revisar plantilla**. Resuelve los avisos y comprueba un envío de prueba antes de lanzar la campaña.

### 🌐 Multiidioma (i18n)

- Interfaz completa en **Español** e **Inglés**
- Cambio de idioma en **Ajustes → General → Interfaz**, aplicado al momento; el selector ya no ocupa la barra de navegación
- El idioma de la interfaz es independiente del idioma por defecto de la instancia y del idioma del email elegido en el asistente

### ⚙️ Pruebas SMTP desde Ajustes

En **Ajustes → Envío**, guarda primero los cambios del perfil SMTP que quieras probar. El botón de conexión de cada fila comprueba conexión y autenticación, sin mandar un correo. Para entregar un mensaje real, rellena **Enviar email de prueba a**, elige el **remitente** y pulsa **Enviar email de prueba**. La interfaz distingue los fallos de conexión de los de envío y muestra la confirmación del servidor SMTP.

Esta prueba utiliza el perfil guardado y su DKIM, si está configurado. Comprueba la recepción y las cabeceras en el buzón de destino; que SMTP acepte el mensaje no determina en qué carpeta aparecerá.

### 📨 Formularios, confirmación y bienvenida

- En **Audiencia → Formularios**, el **mensaje de éxito** se muestra en la página después del alta; no es el cuerpo de un correo
- Con **doble opt-in y SMTP configurado**, las altas nuevas quedan inactivas hasta confirmar el email. Sin doble opt-in, una nueva alta válida puede quedar activa directamente; las supresiones y restricciones de contactos existentes siguen aplicándose
- El correo de confirmación y una **bienvenida de automatización** son envíos distintos. Para personalizar la bienvenida, crea o abre **Automatizaciones → Serie de bienvenida → paso Email**: edita asunto y preheader, y utiliza una plantilla guardada del Editor Pro o la opción de escritura con IA para el cuerpo. Configura el disparador **Suscripción**, opcionalmente limitado a la lista del formulario, y activa la automatización; ese evento también se emite al confirmar el doble opt-in
- Eliminar una automatización conserva el historial de sus envíos. Un formulario no tiene un mensaje de bienvenida independiente: para enviar esa bienvenida debe existir una automatización activa que corresponda al alta

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
| IA            | Anthropic, [OpenAI API](https://platform.openai.com/) y endpoints compatibles; proveedor y modelo configurables |
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

Para cambios habituales en una instalación existente, utiliza **Ajustes**: General, Envío, IA, Kit de marca y las demás secciones disponibles para tu rol. No hace falta reiniciar el asistente de instalación para cambiar de proveedor IA o probar un remitente.

---

## 🐳 Instalación con Docker

```bash
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" > .env   # guarda una copia: descifra tus secretos
docker compose up -d                                   # http://localhost:3000/setup
docker compose --profile spam up -d                    # opcional: rspamd para el análisis de spam
```

Los datos viven en el volumen `turbomailer-data` (`/data`). Pon delante un proxy con HTTPS (Caddy, Traefik, nginx) y usa su URL como URL pública de la app.

## 🚀 Instalación Rápida

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/crazyramirez/turbo-mailer.git
   cd turbo-mailer
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

### Actualizar una instalación existente en Plesk / Node.js

Conserva una copia de los datos y la configuración de la instancia. En el directorio del proyecto, actualiza el código y reconstruye la aplicación:

```bash
git pull --ff-only origin main
npm ci
npm run build
```

Reinicia después la aplicación Node.js desde Plesk con `.output/server/index.mjs` como entrada de producción (`npm start`) y conserva el mismo directorio de trabajo y almacenamiento de datos. Por defecto se utiliza `./data`; puedes fijar `DATA_DIR` a un directorio persistente con permisos de escritura. Actualizar Git sin reconstruir y reiniciar no activa los cambios del servidor.

Las correcciones del 27 de septiembre incluyen las importaciones de `dataDir` y configuración usadas por el procesador de rebotes y el motor de envío, además de la entrada explícita `nodemailer/lib/mail-composer/index.js` para evitar `ERR_UNSUPPORTED_DIR_IMPORT` en ESM. No es necesario editar archivos generados dentro de `.output`.

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
| POST   | `/api/auth/login`  | Acceso con contraseña maestra o email/contraseña y segundo factor si el equipo lo requiere |
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

### Asistente IA y ajustes

Estas rutas pertenecen a la interfaz autenticada y respetan los permisos del usuario; no sustituyen la API pública `/api/v1`.

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/api/ai/editor-context` | Kit de marca y firmas reutilizables con su procedencia |
| POST | `/api/ai/generate-template` | Propuesta de módulos nativos a partir de `brief`; acepta `previous` e `instruction` para revisar y `campaignOptions` para la creación de campañas |
| POST | `/api/ai/campaign` | Generador de campañas mediante eventos SSE; el asistente guiado compartido utiliza `/api/ai/generate-template` |
| GET | `/api/ai/status` | Consultar proveedor, modelo configurado y uso de IA |
| POST | `/api/ai/improve` | Mejorar el texto de un email existente |
| POST | `/api/ai/download-image` | Guardar una imagen remota permitida para la plantilla |
| GET | `/api/templates` | Listar plantillas o leer una mediante `name` |
| POST | `/api/templates` | Guardar el HTML de una plantilla |
| GET / PUT | `/api/settings` | Consultar y actualizar ajustes según permisos |
| PUT / DELETE | `/api/settings/senders` | Guardar o eliminar un perfil SMTP |
| POST | `/api/settings/test-smtp` | Probar un perfil SMTP guardado (`id`); con `to`, enviar además un mensaje de prueba |

Generar una propuesta no la envía: la creación de la plantilla/campaña y la programación se realizan al aplicar la opción elegida en el asistente.

### Formularios y automatizaciones

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| POST | `/api/forms/[publicId]/submit` | Alta mediante un formulario público con consentimiento y controles anti-bots |
| GET / POST | `/api/confirm` | Mostrar la confirmación del doble opt-in / confirmar la suscripción |
| GET / POST | `/api/automations` | Listar flujos / crear un flujo en borrador |
| GET / PUT / DELETE | `/api/automations/[id]` | Consultar, editar, cambiar el estado o eliminar un flujo |
| POST | `/api/automations/[id]/enroll` | Inscribir contactos manualmente en un flujo activo |

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

### API pública `/api/v1` con permisos

Crea una clave en **Ajustes → Integraciones** con los permisos que necesite tu aplicación. Las claves empiezan por `tm_`, se muestran una sola vez y se pueden revocar. Envíala mediante `Authorization: Bearer tm_…` o `X-API-Key: tm_…`.

| Método | Ruta | Permiso | Uso |
| ------ | ---- | ------- | --- |
| GET | `/api/v1/ping` | Cualquier permiso válido | Comprobar clave y permisos |
| GET | `/api/v1/campaigns` | `campaigns:read` | Consultar campañas y métricas |
| GET | `/api/v1/contacts?email=…` | `contacts:read` | Consultar contacto, listas y supresión |
| POST | `/api/v1/contacts` | `contacts:write` | Crear o actualizar una suscripción respetando confirmaciones y supresiones |
| DELETE | `/api/v1/contacts?email=…` | `contacts:write` | Borrado RGPD del contacto; no es una baja de suscripción |
| POST | `/api/v1/events` | `events` | Emitir un evento para las automatizaciones de un contacto |
| POST | `/api/v1/send` | `send` | Encolar un email transaccional con HTML o plantilla y variables |
| GET | `/api/v1/sends/[id]` | `send` | Consultar el estado y los eventos de un envío |

`POST /api/v1/send` y `POST /api/v1/contacts` admiten `Idempotency-Key` para repetir una petición sin duplicar la operación. Usa un valor distinto para cada operación lógica.

### Integración anterior: suscripción y baja con `API_SECRET`

Los ejemplos siguientes de `/api/subscribe` y `/api/unsubscribe` utilizan `API_SECRET`, no las claves con permisos `tm_` de `/api/v1`.

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

Si se requiere confirmación, la respuesta puede incluir `pendingConfirmation: true` y el contacto permanece inactivo. Las bajas anteriores requieren confirmar la nueva suscripción; los contactos suprimidos por rebote, queja o dirección inválida no se reactivan mediante el formulario o esta petición.

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
- [x] **Asistente IA unificado** — Pasos guiados, firmas reutilizables y módulos nativos con revisión previa
- [x] **Edición de botones internos** — Selección y controles de cada botón dentro de módulos compuestos
- [x] **Emails responsive y revisión visual** — Vistas a anchos reales y análisis de calidad del HTML
- [ ] **Validación visual en buzones reales** — Completar las comprobaciones en Gmail, Outlook y otros clientes objetivo
- [ ] **Interfaz del editor en móvil** — La edición completa sigue orientada a escritorio

## 🧪 Desarrollo y validación

```bash
npm test             # pruebas unitarias e integración incluidas en Vitest
npm run typecheck    # comprobación de tipos Vue/TypeScript
npm run build        # compilación de producción
```

La cobertura añadida incluye el asistente y sus reparaciones, capacidad de módulos, generación en pares, edición de botones internos, composición y exportación HTML, revisión visual, historial y cambios de plantilla, envío SMTP de prueba y estados de suscripción de formularios. Las pruebas automatizadas de IA usan respuestas simuladas y no equivalen a una generación real con todos los proveedores ni a pruebas de recepción en clientes de correo.

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
