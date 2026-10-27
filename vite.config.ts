import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  // Production is served from the GitHub Pages project URL https://yewmeng28.github.io/magpie/.
  // Override with BASE_PATH (e.g. '/' for a custom domain); dev serves from the root, `vite preview` like production.
  base: command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/magpie/') : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-v4.svg', 'apple-touch-icon.png', 'mascot-v4.svg'],
      // Precache pdf.js and its .mjs worker (~1 MB, over Workbox's default patterns) so statement import works offline.
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        name: 'MagPie',
        short_name: 'MagPie',
        description: 'Spending tracker. Maggie sorts your shiny coins into slices.',
        theme_color: '#14181f',
        background_color: '#14181f',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-v4.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
