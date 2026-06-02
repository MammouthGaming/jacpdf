import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect, Component } from 'react'
import AuthGate from "@/shared/components/auth/AuthGate"
import Login from '@/pages/auth/Login'
import SuiteShell from '@/shell/SuiteShell'
import JacPaintShareView from '@/apps/jacpaint/pages/share/JacPaintShareView'
import { LAST_PATH_KEY } from "@/shared/lib/navigation/startupRoute"
import { useBatterySaver } from "@/shared/hooks/system/useBatterySaver"
import { toastStore } from "@/shared/stores/ui/toastStore"
import { performanceStore } from "@/shared/stores/system/performanceStore"
import Spotlight from "@/shared/components/ui/Spotlight"
import PremiumModal from "@/shared/components/ui/PremiumModal"
import CloudGraceBanner from "@/shared/components/ui/CloudGraceBanner"
import UpdateBanner from "@/shared/components/ui/UpdateBanner"
import { usePremiumGrantWatcher } from "@/shared/hooks/user/usePremiumGrantWatcher"

const errorShellStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0d1117',
  color: '#d1d5db',
  fontFamily: 'Inter, system-ui, sans-serif',
  padding: 24,
}

const errorCardStyle = {
  maxWidth: 760,
  width: '100%',
  border: '1px solid #2a3347',
  borderRadius: 12,
  background: '#161b27',
  padding: 20,
  boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
}

const errorTitleStyle = {
  fontSize: 18,
  color: '#fff',
  marginBottom: 8,
}

const errorTextStyle = {
  color: '#9ca3af',
  marginBottom: 12,
}

const errorPreStyle = {
  whiteSpace: 'pre-wrap',
  overflow: 'auto',
  maxHeight: 260,
  background: '#0a0e16',
  border: '1px solid #1e2535',
  borderRadius: 8,
  padding: 12,
  color: '#fca5a5',
  fontSize: 12,
}

const errorActionsStyle = {
  display: 'flex',
  gap: 8,
  marginTop: 14,
}

const errorPrimaryButtonStyle = {
  border: 'none',
  borderRadius: 8,
  padding: '8px 12px',
  background: 'var(--accent, #39FF14)',
  color: '#000',
  fontWeight: 700,
  cursor: 'pointer',
}

const errorSecondaryButtonStyle = {
  border: '1px solid #2a3347',
  borderRadius: 8,
  padding: '8px 12px',
  background: 'transparent',
  color: '#d1d5db',
  cursor: 'pointer',
}

// Boundary minimal pour éviter l'écran noir silencieux en dev/prod.
// Si une route JacDoc plante pendant le boot (module import, hook, IndexedDB,
// etc.), on affiche l'erreur au lieu de laisser seulement le fond sombre.
// Ça rend le prochain diagnostic immédiat dans l'UI.
class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[AppErrorBoundary] runtime crash', error, info)
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={errorShellStyle}>
        <div style={errorCardStyle}>
          <h1 style={errorTitleStyle}>
            JacSuite a rencontré une erreur au chargement
          </h1>
          <p style={errorTextStyle}>
            Recharge la page ou retourne à JacSuite/JacPDF. En mode développement, les détails sont aussi dans la console.
          </p>
          <pre style={errorPreStyle}>
            {this.state.error?.stack || this.state.error?.message || String(this.state.error)}
          </pre>
          <div style={errorActionsStyle}>
            <button
              type="button"
              onClick={() => window.location.assign('/jacsuite/accueil')}
              style={errorPrimaryButtonStyle}
            >
              Retour à l'accueil
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={errorSecondaryButtonStyle}
            >
              Recharger
            </button>
          </div>
        </div>
      </div>
    )
  }
}

// Tracker de « dernière app utilisée » pour le réglage JacSuite > Général >
// « Au démarrage, ouvrir → La dernière app utilisée ». Persiste le pathname
// courant dans localStorage chaque fois qu'on est sur une route JacSuite
// valide (on ignore /login, /, /editor, etc. pour ne jamais revenir sur le
// login à la prochaine session).
function LastAppTracker() {
  const location = useLocation()
  useEffect(() => {
    const p = location.pathname
    if (!p || !p.startsWith('/jacsuite/')) return
    if (p.startsWith('/jacsuite/login')) return
    try { localStorage.setItem(LAST_PATH_KEY, p) } catch {}
  }, [location.pathname])
  return null
}

function App() {
  // Mode économie de batterie (Lot 7 — étape 5). Surveille la préférence
  // utilisateur + l'état de charge (navigator.getBattery) et bascule sur le
  // preset 'performance' quand le saver doit être actif. Voir le hook pour
  // la logique snapshot/restore.
  useBatterySaver()

  // Premium en temps réel : quand l'owner accepte une demande premium, la
  // notif `premium_granted` arrive → on rafraîchit la session (premium live)
  // et on ouvre la PremiumModal en état « Premium actif », sans reload.
  usePremiumGrantWatcher()

  // Toggle global des animations (Lot 7 — étape F). Pose body.animations-off
  // quand animationsEnabled=false → les règles CSS dans index.css coupent
  // toutes les transitions/animations. Inclut aussi un short-circuit sur
  // prefers-reduced-motion via respectReducedMotion (standalone setting).
  // Subscribe au store + mediaQuery → réagit en temps réel aux changements
  // de preset OU aux changements OS-level de la préférence d'accessibilité.
  useEffect(() => {
    const apply = () => {
      const s = performanceStore.get()
      const reduce = s.respectReducedMotion &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const off = !s.animationsEnabled || reduce
      document.body.classList.toggle('animations-off', off)
      // Lot 7 — étape F : animationSpeed. data-anim-speed lu par index.css.
      // Cas "0" (= Instantané) coupe la durée des transitions tout en
      // gardant la logique d'apparition. Valeurs intermédiaires (0.5/1.5)
      // ne peuvent pas être modulées en CSS pur sans refactor global des
      // transition-duration en calc(... * var(--anim-speed-mul)) — punté
      // pour un futur lot UI si besoin.
      document.body.dataset.animSpeed = String(s.animationSpeed)
      // Lot 7 — étape F : annotationHoverEffects. body.no-annotation-hover
      // coupe les halos/transforms au survol des ancres de commentaires et
      // des marks de recherche (preset Performance).
      document.body.classList.toggle('no-annotation-hover', !s.annotationHoverEffects)
    }
    apply()
    const unsub = performanceStore.subscribe(apply)
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    mq?.addEventListener?.('change', apply)
    return () => {
      unsub?.()
      mq?.removeEventListener?.('change', apply)
    }
  }, [])

  // Toast post-premier-lancement : initFirstLaunch (appelé dans main.jsx) a
  // déposé le preset choisi en sessionStorage si c'était bien le 1er run.
  // On affiche le toast ICI parce que ToastHost ne mount qu'à l'arrivée sur
  // /editor — un toast émis depuis main.jsx n'aurait pas de host.
  useEffect(() => {
    const preset = sessionStorage.getItem('jacpdf_firstLaunchToast')
    if (!preset) return
    sessionStorage.removeItem('jacpdf_firstLaunchToast')
    const labels = { beauty: 'Beauté', balanced: 'Équilibré', performance: 'Performance' }
    const name = labels[preset] || preset
    // Léger délai pour laisser ToastHost monter même si l'utilisateur arrive
    // directement sur /editor au refresh.
    setTimeout(() => {
      toastStore.success(`Preset performance « ${name} » recommandé pour ton appareil`)
    }, 800)
  }, [])

  // Phase 4.5 — Auto-ouverture des docs partagés via lien.
  // shareTokenRedemption.js dispatch `jacpdf:openSharedDoc` après un redeem
  // réussi (B clique le lien de partage envoyé par A). Comportement :
  //   - Si on n'est PAS sur une route shell : full navigate vers /document.
  //     Le flag localStorage `jacpdf_pendingSharedDoc` posé par
  //     shareTokenRedemption sera lu par SuiteShell au mount.
  //   - Si on est DÉJÀ sur une route shell : SuiteShell capte l'event via
  //     son propre listener et ouvre le doc dans un nouveau tab sans naviguer.
  // Listener placé ici (App.jsx) plutôt que dans SuiteShell pour qu'il soit
  // actif même quand l'user est encore sur /login.
  useEffect(() => {
    const handler = (e) => {
      const { documentId } = e.detail || {}
      if (!documentId) return
      if (import.meta.env.DEV) console.log('[app] jacpdf:openSharedDoc reçu pour', documentId)
      const path = window.location.pathname
      const shellPath =
        path === '/jacsuite/accueil' ||
        path === '/jacsuite/jacpdf' ||
        path === '/jacsuite/classroom' ||
        path === '/jacsuite/jacdoc' ||
        path === '/jacsuite/jacnote' ||
        path === '/jacpdf/accueil' ||
        path === '/jacpdf/classroom' ||
        path === '/classroom' ||
        path === '/accueil' ||
        path === '/document' ||
        path.startsWith('/jacsuite/jacpdf/document/') ||
        path.startsWith('/jacpdf/document/') ||
        path.startsWith('/document/') ||
        path.startsWith('/jacsuite/jacdoc') ||
        path.startsWith('/jacdoc') ||
        path === '/jacnote'

      if (!shellPath) {
        // Full navigation : SuiteShell mount, lit le flag localStorage,
        // ouvre le doc partagé dans un onglet via useJacpdfCloud.openFile.
        window.location.assign(`/jacsuite/jacpdf/document/${encodeURIComponent(documentId)}`)
      }
      // Sinon, SuiteShell capte l'event en parallèle via son propre listener.
    }
    window.addEventListener('jacpdf:openSharedDoc', handler)
    return () => window.removeEventListener('jacpdf:openSharedDoc', handler)
  }, [])

  return (
    <BrowserRouter>
      <AppErrorBoundary>
        <LastAppTracker />
        {/* Spotlight JacSuite — overlay global de recherche universelle.
            Monté ici (dans BrowserRouter, hors Routes) pour être dispo dans
            toutes les apps et pouvoir utiliser useNavigate. S'ouvre au
            raccourci configurable (défaut Cmd/Ctrl+Espace). */}
        <Spotlight />
        {/* PremiumModal — paywall mock global. Monté ici (comme Spotlight) pour
            s'ouvrir depuis n'importe quelle app via l'event
            'jacsuite:openPremium' (openPremiumModal()). */}
        <PremiumModal />
        {/* CloudGraceBanner — enforcement du downgrade JacPDF Cloud : compte à
            rebours + purge auto (retour Gratuit) et trim des plus gros fichiers
            (Premium → Pro). Monté ici pour être actif dans toute la suite. */}
        <CloudGraceBanner />
        {/* UpdateBanner — bannière « nouvelle version disponible ». Écoute
            jacsuite:sw-update-ready (émis quand un nouveau Service Worker est
            prêt) et propose à l'utilisateur de rafraîchir. Montée ici pour
            être visible dans toute la suite. */}
        <UpdateBanner />
        <Routes>
          <Route path="/" element={<Navigate to="/jacsuite/login" replace />} />
          <Route path="/jacsuite/login" element={<Login />} />
          <Route path="/login" element={<Login />} />
          {/* Phase 1.2 — partage par lien JacPaint.
              Page publique HORS AuthGate : un visiteur anonyme peut
              consulter la toile via le token. La RPC `security definer`
              + storage policy par token actif autorisent l'accès. */}
          <Route path="/jacsuite/jacpaint/share/:token" element={<JacPaintShareView />} />
          <Route path="/jacpaint/share/:token" element={<JacPaintShareView />} />
          {/* Routes JacSuite propres et précises.
              - Login JacSuite : /jacsuite/login
              - Accueil JacSuite : /jacsuite/accueil
              - JacSuite/JacPDF : /jacsuite/jacpdf
              - Document JacPDF : /jacsuite/jacpdf/document/:cloudId
              - JacSuite/Classroom : /jacsuite/classroom
              Compatibilité :
              - /jacpdf/accueil, /jacpdf/document/:cloudId, /accueil,
                /document/:cloudId et /classroom restent acceptés puis
                normalisés par SuiteShell vers les routes JacSuite. */}
          <Route path="/jacsuite/accueil" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/jacpdf" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/jacpdf/document" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/jacpdf/document/:cloudId" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/classroom" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/*" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpdf/accueil" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpdf/document" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpdf/document/:cloudId" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpdf/classroom" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpdf/*" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/accueil" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/classroom" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/document" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/document/:cloudId" element={<AuthGate><SuiteShell /></AuthGate>} />
          {/* Phase 5 — deep-link JacDoc.
              Routes propres et précises :
              - JacSuite/JacDoc : /jacsuite/jacdoc
              - Document JacDoc : /jacsuite/jacdoc/document/:docId
              Compatibilité :
              - /jacdoc, /jacdoc/accueil et /jacdoc/acceuil restent acceptés
                puis normalisés par SuiteShell vers /jacsuite/jacdoc
              - /jacdoc/:docId et /jacdoc/document/:docId restent acceptés
                puis normalisés vers /jacsuite/jacdoc/document/:docId */}
          <Route path="/jacsuite/jacdoc" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/jacdoc/document/:docId" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacdoc" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacdoc/acceuil" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacdoc/accueil" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacdoc/document/:docId" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacdoc/:docId" element={<AuthGate><SuiteShell /></AuthGate>} />
          {/* Sécurité refresh / liens partagés : si un lien JacDoc ajoute un
              segment de plus (ou un slash final que React Router ne normalise
              pas comme attendu), on monte quand même le shell. SuiteShell lit
              window.location.pathname et applique la route réelle. */}
          <Route path="/jacdoc/*" element={<AuthGate><SuiteShell /></AuthGate>} />
          {/* Phase 5 — deep-link JacNote (un seul onglet workspace par session). */}
          <Route path="/jacsuite/jacnote" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacnote" element={<AuthGate><SuiteShell /></AuthGate>} />
          {/* JacPaint — routes explicites pour que le refresh sur une toile
              ou sur l'accueil JacPaint ne tombe pas dans le catch-all
              `/jacsuite/*` (qui marchait, mais on reste conséquent avec
              les autres apps). */}
          <Route path="/jacsuite/jacpaint" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacsuite/jacpaint/painting/:paintingId" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpaint" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/jacpaint/painting/:paintingId" element={<AuthGate><SuiteShell /></AuthGate>} />
          <Route path="/editor" element={<Navigate to="/jacsuite/accueil" replace />} />
          {/* Legacy : /welcome n'a plus de page dédiée — l'Accueil est un onglet
              inline dans SuiteShell (style Chrome NTP). On redirige les anciens liens. */}
          <Route path="/welcome" element={<Navigate to="/jacsuite/accueil" replace />} />
          {/* Anti-écran vide : une route inconnue ne doit jamais rendre un
              <Routes> vide. On revient vers JacSuite/JacPDF au lieu de laisser
              seulement le fond de l'app. */}
          <Route path="*" element={<Navigate to="/jacsuite/accueil" replace />} />
        </Routes>
      </AppErrorBoundary>
    </BrowserRouter>
  )
}

export default App