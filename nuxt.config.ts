// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: false },
  ssr: false,

  runtimeConfig: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  modules: ["@vite-pwa/nuxt"],

  app: {
    head: {
      title: "Turbo-Mailer PRO",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
        { name: "theme-color", content: "#05060b" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "format-detection", content: "telephone=no" },
        { name: "description", content: "Premium Email Marketing Dashboard" },
        // Open Graph / Facebook
        { property: "og:type", content: "website" },
        { property: "og:title", content: "Turbo-Mailer PRO" },
        { property: "og:description", content: "Premium Email Marketing & Campaign Management Dashboard" },
        { property: "og:image", content: "/images/ogimage.jpg" },
        // Twitter
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Turbo-Mailer PRO" },
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
      enabled: true,
      type: "module",
      suppressWarnings: true
    }
  },
  
  vite: {
    server: {
      watch: {
        ignored: ['**/data/templates/**']
      }
    }
  }
});
