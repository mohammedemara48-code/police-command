import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'قيادة الشرطة — POLICE COMMAND',
        short_name: 'Police Command',
        description:
          'لعبة شرطة ثلاثية الأبعاد بالعربي: حملة 12 مهمة، دورية حرة، مطاردات واعتقالات. تشتغل على الموبايل ومن غير نت بعد أول مرة.',
        categories: ['games'],
        theme_color: '#0a1628',
        background_color: '#050b14',
        display: 'standalone',
        orientation: 'any',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // HTML is never precached: navigations go to the network first, so one refresh picks up a new deploy.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        navigateFallback: null,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 4 }
          },
          { urlPattern: /\/(models|audio)\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'game-assets' } },
          // three.js comes from the CDN (import map) and fonts from Google: cache them so the game starts offline
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'three-cdn',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } }
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      external: ['three', /^three\//],
      output: {
        paths: {
          three: 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js'
        }
      }
    },
    chunkSizeWarningLimit: 800
  },
  server: { port: 5173, host: true }
});
