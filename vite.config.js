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
        name: 'CNA OpsBoard',
        short_name: 'OpsBoard',
        description: 'Cielo Norte Aviación Operations Dashboard',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      }
    })
  ]
})
