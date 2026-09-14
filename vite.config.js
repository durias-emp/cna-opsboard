import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true,                               // also reachable on LAN IP
    allowedHosts: ['.trycloudflare.com'],     // allow Cloudflare quick-tunnel URLs
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'cna-logo.png', 'helicopter.png'],
      manifest: {
        id: '/',
        start_url: '/',
        scope: '/',
        name: 'CNA OpsBoard',
        short_name: 'OpsBoard',
        description: 'Cielo Norte Aviación Operations Dashboard',
        theme_color: '#171717',
        background_color: '#171717',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      // The push handlers live in public/push-sw.js. The plugin GENERATES
      // /sw.js (the file usePushRegistration registers), which used to
      // silently clobber the hand-written sw.js — pushes were accepted by
      // FCM/APNs but no notification ever showed. importScripts folds the
      // handlers into the generated worker.
      workbox: {
        importScripts: ['push-sw.js'],
      },
    })
  ]
})
