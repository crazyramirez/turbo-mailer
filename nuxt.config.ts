// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: false },
  ssr: false,

  runtimeConfig: {
    appPassword: process.env.APP_PASSWORD,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT || '465',
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpSecure: process.env.SMTP_SECURE !== 'false', // Default to true
    smtpFromName: process.env.SMTP_FROM_NAME || 'TurboMailer',
    smtpFromEmail: process.env.SMTP_FROM_EMAIL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    trackingBaseUrl: process.env.TRACKING_BASE_URL || 'http://localhost:3000',
    unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET,
    apiSecret: process.env.API_SECRET,
    smtpSendDelayMs: Number(process.env.SMTP_SEND_DELAY_MS || 2000),
    smtpSendJitterMs: Number(process.env.SMTP_SEND_JITTER_MS || 500),
    smtpMaxEmailsPerSecond: Number(process.env.SMTP_MAX_EMAILS_PER_SECOND || 0),
    smtpMaxRetries: Number(process.env.SMTP_MAX_RETRIES || 3),
    smtpRetryDelayMs: Number(process.env.SMTP_RETRY_DELAY_MS || 5000),
    dkimDomain: process.env.DKIM_DOMAIN,
    dkimSelector: process.env.DKIM_SELECTOR || 'default',
    dkimPrivateKey: process.env.DKIM_PRIVATE_KEY,
    public: {
      portalKey: process.env.PORTAL_KEY || 'admin',
      ghostMode: process.env.GHOST_MODE === 'true',
    }
  },

  css: [
    '@/assets/css/main.css',
    '@/assets/css/bg-orbs.css',
  ],

  modules: ["@vite-pwa/nuxt", "@nuxtjs/i18n"],

  i18n: {
    locales: [
      { code: 'es', file: 'es.json', name: 'Español' },
      { code: 'en', file: 'en.json', name: 'English' },
    ],
    defaultLocale: 'es',
    strategy: 'no_prefix',
    langDir: 'locales/',
  },

  app: {
    head: {
      title: "TurboMailer",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
        { name: "theme-color", content: "#05060b" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "format-detection", content: "telephone=no" },
        { name: "description", content: "Premium Email Marketing Dashboard" },
        { name: "robots", content: "noindex, nofollow, noarchive" },
        { name: "googlebot", content: "noindex, nofollow, noarchive" },
        // Open Graph / Facebook
        { property: "og:type", content: "website" },
        { property: "og:title", content: "TurboMailer" },
        { property: "og:description", content: "Premium Email Marketing & Campaign Management Dashboard" },
        { property: "og:image", content: "/images/ogimage.jpg" },
        // Twitter
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "TurboMailer" },
        { name: "twitter:description", content: "Premium Email Marketing Dashboard" },
        { name: "twitter:image", content: "/images/ogimage.jpg" }
      ],
      link: [
        { rel: "icon", type: "image/x-icon", href: "/images/icons/favicon.ico" },
        { rel: "apple-touch-icon", href: "/images/icons/apple-touch-icon.png" },
        { rel: "icon", type: "image/svg+xml", href: "/images/icons/favicon.svg" },
        { rel: "icon", type: "image/png", sizes: "96x96", href: "/images/icons/favicon-96x96.png" },
        { rel: "manifest", href: "/images/icons/site.webmanifest" }
      ]
    }
  },

  pwa: {
    manifest: false, // We use the manual manifest from public/
    registerType: "autoUpdate",
    workbox: {
      navigateFallback: "/",
      globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
    },
    client: {
      installPrompt: true
    },
    devOptions: {
      enabled: false,
      type: "module",
      suppressWarnings: true
    }
  },
  
  vite: {
    plugins: [
      {
        name: 'stub-app-manifest',
        resolveId(id: string) { if (id === '#app-manifest') return '\0#app-manifest' },
        load(id: string) { if (id === '\0#app-manifest') return 'export default {}' },
      },
    ],
    server: {
      allowedHosts: true,
      watch: {
        ignored: ['**/data/templates/**', '**/data/*.db', '**/data/*.db-wal', '**/data/*.db-shm']
      }
    }
  },

  hooks: {
    'ready': async () => {
      if (process.env.NODE_ENV === 'development') {
        const { execSync } = await import('node:child_process')
        try {
          console.log('自动 [DB] Generating migrations...')
          execSync('npx drizzle-kit generate', { stdio: 'inherit' })
        } catch (e) {
          console.error('Failed to auto-generate migrations:', e)
        }
      }
    },
    'build:before': async () => {
      try {
        console.log('自动 [DB] Generating migrations for build...')
        const { execSync } = await import('node:child_process')
        execSync('npx drizzle-kit generate', { stdio: 'inherit' })
      } catch (e) {
        console.error('Failed to auto-generate migrations during build:', e)
      }
    }
  },

  nitro: {
    // Ensure migrations are copied to the build output
    serverAssets: [
      {
        baseName: 'migrations',
        dir: './server/db/migrations'
      }
    ]
  }
});
