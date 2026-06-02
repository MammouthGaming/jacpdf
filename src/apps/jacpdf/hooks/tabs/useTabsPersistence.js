import { useEffect, useRef } from 'react'
import { loadTabs, loadPersistedPdf, saveTabs } from "@/apps/jacpdf/lib/pdf/pdfTransfer"

// Lot 7 — étape E. Valide la shape d'un tab restauré depuis IDB avant de
// l'injecter dans React state. Si IDB est corrompu (extension malveillante,
// downgrade de schema, écriture interrompue), un onglet malformé crasherait
// au render (ex. fileBytes attendu Uint8Array, reçu null → react-pdf throw).
// On filtre silencieusement ; les survivants sont restaurés.
function isValidRestoredTab(t) {
  if (!t || typeof t !== 'object') return false
  if (typeof t.id !== 'string' || !t.id) return false
  if (t.type !== 'home' && t.type !== 'pdf' && t.type !== 'classroom') return false
  if (t.type === 'pdf') {
    if (typeof t.fileName !== 'string' || !t.fileName) return false
    // fileBytes peut être Uint8Array (cas normal) ou ArrayBuffer (sérialisation
    // structurée IDB). Tout le reste (null, string, objet vide) → invalide.
    const bytes = t.fileBytes
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) return false
  }
  return true
}

// Restauration session multi-onglets depuis IndexedDB au mount + persistance
// à chaque changement de tabs / activeId.
//
// recoveryCompleteRef bloque l'effet saveTabs tant que la récupération n'a
// pas terminé. Sans ce flag, race au refresh :
//   1. 1er render : tabs = état initial (1 onglet Accueil par défaut, créé
//      dans l'initializer de useState).
//   2. saveTabs s'exécute, persiste cet état → écrase la session sauvegardée.
//   3. loadTabs() renvoie tardivement les vrais onglets, mais c'est trop tard.
// Avec le flag, saveTabs n'écrit qu'APRÈS que loadTabs() ait lu la session.
//
// Avant : ce hook recevait aussi pendingPdfRef pour court-circuiter la
// récupération quand un PDF venait d'être transféré depuis /welcome. Plus
// nécessaire : l'Accueil est maintenant un onglet inline (style Chrome NTP),
// l'ouverture d'un fichier passe par convertHomeTabToPdf — pas de transfert
// inter-routes, donc rien à court-circuiter.
export function useTabsPersistence({ tabs, activeId, setTabs, setActiveId }) {
  const recoveryCompleteRef = useRef(false)
  // Lot 7 — étape G. Timer du debounce d'écriture IDB. Stocké en ref pour
  // qu'un changement rapide consécutif puisse clear le timer en cours.
  const saveTimerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1) Préférence : restaurer TOUS les onglets ouverts (multi-tab).
      const saved = await loadTabs()
      if (cancelled) return
      if (saved?.tabs?.length) {
        // Lot 7 — étape E. Filtre les tabs corrompus avant de toucher le state.
        const validTabs = saved.tabs.filter(isValidRestoredTab)
        if (validTabs.length) {
          if (import.meta.env.DEV && validTabs.length !== saved.tabs.length) {
            const dropped = saved.tabs.length - validTabs.length
            console.warn(`[useTabsPersistence] ${dropped} onglet(s) corrompu(s) ignoré(s) au restore`)
          }
          setTabs(validTabs)
          // Sécurité : si l'activeId sauvegardé ne correspond plus à aucun
          // onglet (filtré ou inexistant), bascule sur le premier valide.
          const wantedId = saved.activeId && validTabs.some(t => t.id === saved.activeId)
            ? saved.activeId
            : validTabs[0].id
          setActiveId(wantedId)
          recoveryCompleteRef.current = true
          return
        }
        // Tous les tabs sauvegardés étaient invalides → on tombe dans le
        // fallback ci-dessous (loadPersistedPdf), puis premier lancement.
        if (import.meta.env.DEV) {
          console.warn('[useTabsPersistence] saved.tabs trouvés mais tous invalides, fallback')
        }
      }
      // 2) Fallback : ancien stockage à un seul PDF (clé 'current'). Couvre
      // les sessions antérieures à la persistance multi-onglets.
      const persisted = await loadPersistedPdf()
      if (cancelled) return
      if (persisted) {
        const id = 'tab-' + Date.now()
        setTabs([{ id, type: 'pdf', fileName: persisted.fileName, fileBytes: persisted.bytes }])
        setActiveId(id)
      }
      // 3) Premier lancement (rien en IDB) : on garde l'onglet Accueil par
      // défaut créé dans l'initializer de useState.
      recoveryCompleteRef.current = true
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persiste la session multi-onglets avec un debounce 500 ms.
  //
  // Lot 7 — étape G. Coalesce les rafales de changements (fermer plusieurs
  // onglets d'affilée, drag-reorder, switch rapide d'activeId) en UNE
  // écriture IDB au lieu d'une par changement. Combiné au split bytes-par-
  // onglet de pdfTransfer.js, fermer un onglet est quasi-instantané :
  //   - le manifest fait quelques Ko (pas de Uint8Array dedans),
  //   - les bytes des onglets restants ne sont PAS ré-écrits (skip par ref),
  //   - le delete de la clé bytes du fermé est cheap.
  //
  // Le flush pagehide/beforeunload garantit qu'un changement < 500 ms avant
  // unload est quand même persisté (sinon refresh l'oublierait).
  useEffect(() => {
    if (!recoveryCompleteRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTabs(tabs, activeId)
      saveTimerRef.current = null
    }, 500)
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [tabs, activeId])

  // Flush avant déchargement de la page. pagehide est fiable partout (incluant
  // iOS Safari où beforeunload n'est pas tiré sur navigation arrière).
  // beforeunload couvre les vieux desktops. Fire-and-forget : pagehide n'attend
  // pas une promesse, mais l'IDB transaction est posée dans la microtask
  // suivante et le browser laisse les writes en cours se terminer.
  useEffect(() => {
    const flush = () => {
      if (!recoveryCompleteRef.current) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      saveTabs(tabs, activeId)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [tabs, activeId])
}