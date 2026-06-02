import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { accentColorStore } from "@/shared/stores/ui/accentColorStore"
import { themeStore } from "@/shared/stores/ui/themeStore"
import { densityStore } from "@/shared/stores/ui/densityStore"
import { registerServiceWorker } from "@/shared/lib/infra/registerServiceWorker"

// Applique la couleur d'accent persistée (--accent / --accent-hover sur :root)
// AVANT le premier render — sinon l'app flash en couleur par défaut puis
// re-paint avec la couleur sauvegardée.
accentColorStore.init()
// Pose data-theme="dark|light" sur <html> selon le mode persisté
// (Sombre / Clair / Auto) et attache l'écoute prefers-color-scheme si Auto.
themeStore.init()
// Pose data-density="compact|comfortable" sur <html> selon la densité
// persistée — évite un flash d'espacement par défaut.
densityStore.init()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Enregistrement du Service Worker (PWA — item 5 du plan).
// Effectué après le premier render pour ne pas compétitionner avec le critical
// path. No-op en dev (le helper désinscrit aussi un éventuel SW résiduel).
// Les composants qui veulent écouter la mise à jour disponible peuvent écouter
// l'event `jacsuite:sw-update-ready` et appeler `applyServiceWorkerUpdate()`.
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    registerServiceWorker().catch((err) => console.warn('[SW] init failed', err))
  })
}