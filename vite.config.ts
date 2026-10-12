import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'قيادة الشرطة — POLICE COMMAND',
        short_name: 'Police Command',
        description: 'لعبة استراتيجية عمليات شرطة ثلاثية الأبعاد',
        theme_color: '#0a1628',
        background_color: '#050b14',
        display: 'standalone',
        orientation: 'any',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // HTML is never precached: navigations go to the network first, so one refresh picks up a new deploy.
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkFirst', options: { cacheName: 'pages', networkTimeoutSeconds: 4 } },
          { urlPattern: /\/(models|audio)\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'game-assets' } }
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
