import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Identifiant de build unique (horodatage YYYYMMDDHHMMSS). Sert à invalider le
// Service Worker à chaque déploiement : on l'injecte dans le SW généré
// (placeholder __BUILD_ID__) pour que ses octets changent → le navigateur
// détecte la nouvelle version et déclenche la bannière de mise à jour.
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

// Plugin : réécrit __BUILD_ID__ dans le Service Worker copié dans dist/ en fin
// de build. Le fichier vit dans public/ (copié verbatim, non transformé par
// Vite), d'où ce post-traitement manuel.
function serviceWorkerBuildId() {
  return {
    name: 'jacsuite-sw-build-id',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/service-worker.js')
      try {
        const code = fs.readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, BUILD_ID)
        fs.writeFileSync(swPath, code)
      } catch (err) {
        console.warn('[build] injection du build id dans le service worker échouée', err)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerBuildId()],
  // Expose le build id au runtime (utile si on veut l'afficher quelque part).
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Le gros du poids vient des libs tierces (pdf.js / pdf-lib pour JacPDF,
    // ProseMirror pour JacDoc, Supabase). On les isole dans des chunks
    // « vendor » séparés : chargés en parallèle, mieux mis en cache entre
    // déploiements, et chaque morceau repasse sous le seuil d'alerte.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('pdfjs') || id.includes('pdf-lib') || id.includes('pdf')) return 'vendor-pdf'
          if (id.includes('prosemirror')) return 'vendor-prosemirror'
          if (id.includes('@supabase') || id.includes('supabase')) return 'vendor-supabase'
          if (id.includes('react')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})