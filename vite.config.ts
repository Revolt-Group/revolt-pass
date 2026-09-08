import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'html-env-fallback',
      enforce: 'pre',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const domain = process.env.VITE_APP_DOMAIN || '';
          return html.replace(/%VITE_APP_DOMAIN%/g, domain);
        },
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
        'push-sw.js',
      ],
      manifest: {
        name: 'Revolt Pass',
        short_name: 'RevoltPass',
        description: 'Zero-Knowledge Password, 2FA & Secrets Manager. Self-hosted, $0/mes.',
        theme_color: '#090a0f',
        background_color: '#090a0f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,webmanifest}'],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.simpleicons\.org\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'simple-icons-cache',
              expiration: {
                maxEntries: 250,
                maxAgeSeconds: 15 * 24 * 60 * 60, // 15 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@zxing')) {
            return 'vendor-zxing';
          }
          if (
            id.includes('motion') ||
            id.includes('cmdk') ||
            id.includes('sonner') ||
            id.includes('@radix-ui')
          ) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        'src/main.tsx',
        'src/App.tsx',
        'src/i18n/**',
        'src/types/**',
        'src/constants/**',
        '**/*.test.ts',
        'scripts/**',
        'functions/**',
        'public/**',
      ],
      thresholds: {
        'src/lib/crypto/**': {
          lines: 75,
          functions: 80,
          branches: 65,
        },
        'src/lib/security/**': {
          lines: 80,
          functions: 80,
        },
        'src/lib/sync/**': {
          lines: 75,
          functions: 75,
        },
      },
    },
  },
})
