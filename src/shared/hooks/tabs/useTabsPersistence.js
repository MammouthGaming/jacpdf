import { useEffect, useRef } from 'react'
import { loadTabs, loadPersistedPdf, saveTabs } from "@/apps/jacpdf/lib/pdf/pdfTransfer"

// Promu de `src/apps/jacpdf/hooks/tabs/` vers `src/shared/hooks/tabs/` en
// Phase 1 du refactor multi-apps JacSuite. Le path d'import de pdfTransfer
// a été corrigé vers `@/apps/jacpdf/lib/pdf/pdfTransfer` (l'ancienne
// version utilisait `@/lib/pdf/pdfTransfer` qui datait d'avant la
// migration vers `src/apps/jacpdf/`).
//
// ⚠️ En Phase 2, pdfTransfer sera également promu vers shared/ (ou split
// par app) pour que JacDoc / JacNote aient aussi leur propre stockage IDB.
//
// Lot 7 — étape E. Valide la shape d'un tab restauré depuis IDB avant de
// l'injecter dans React state. Si IDB est corrompu (extension malveillante,
// downgrade de schema, écriture interrompue), un onglet malformé crasherait
// au render (ex. fileBytes attendu Uint8Array, reçu null → react-pdf throw).
// On filtre silencieusement ; les survivants sont restaurés.
//
// Migration silencieuse Phase 1 : les anciens onglets sans champ `app`
// retombent sur `app: 'jacpdf'` par défaut (cf. normalizeRestoredTab).
function normalizeRestoredTab(t) {
  if (!t || typeof t !== 'object') return null
  if (typeof t.id !== 'string' || !t.id) return null
  // app : nouveau champ Phase 1. Default 'jacpdf' pour les anciens onglets.
  const app = t.app && ['jacpdf', 'jacdoc', 'jacnote', 'suite'].includes(t.app) ? t.app : 'jacpdf'
  // type : Phase 1 = home/pdf/classroom (jacpdf). Phase 2 ajoute 'doc'
  // (jacdoc). Phase 3 ajoute 'workspace' (jacnote — onglet unique avec
  // sidebar interne). Phase 4 ajoute 'launcher' (suite — mini-page d'accueil
  // JacSuite, défaut du « + » et de Ctrl+T).
  const VALID_TYPES = new Set(['home', 'pdf', 'classroom', 'doc', 'workspace', 'launcher'])
  if (!VALID_TYPES.has(t.type)) return null
  if (t.type === 'pdf') {
    if (typeof t.fileName !== 'string' || !t.fileName) return null
    // fileBytes peut être Uint8Array (cas normal) ou ArrayBuffer (sérialisation
    // structurée IDB). Tout le reste (null, string, objet vide) → invalide.
    const bytes = t.fileBytes
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer)) return null
  }
  if (t.type === 'doc') {
    // Phase 2 — onglets JacDoc. docId = clé du document dans jacdocStore
    // (IndexedDB). On NE sérialise PAS le contenu ProseMirror dans la
    // session : il sera réhydraté par useJacDoc au mount de l'onglet.
    // Un onglet doc dans une autre app n'a pas de sens → on rejette.
    if (app !== 'jacdoc') return null
    if (typeof t.docId !== 'string' || !t.docId) return null
  }
  if (t.type === 'workspace') {
    // Phase 3 — onglet workspace JacNote. Un seul onglet pour toute
    // l'app (sidebar interne gère la note active, useJacNote relit ses
    // notes depuis localStorage au mount). Pas de payload à sérialiser.
    // Un onglet workspace dans une autre app n'a pas de sens → on rejette.
    if (app !== 'jacnote') return null
  }
  if (t.type === 'launcher') {
    // Phase 4 — onglet launcher JacSuite. État vide (les cartes du
    // launcher sont des choix d'app, pas du contenu persisté). On rejette
    // les launchers attachés à autre chose que 'suite' (devrait jamais
    // arriver, mais on reste strict).
    if (app !== 'suite') return null
  }
  return { ...t, app }
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
export function useTabsPersistence({ tabs, activeId, setTabs, setActiveId, onRecoveryComplete, onRecoveryStateChange }) {
  const recoveryCompleteRef = useRef(false)
  // Lot 7 — étape G. Timer du debounce d'écriture IDB. Stocké en ref pour
  // qu'un changement rapide consécutif puisse clear le timer en cours.
  const saveTimerRef = useRef(null)
  // Phase 5 — deep-link URL. Callback optionnel appelé UNE fois la
  // récupération terminée (session restaurée OU identifiée comme vide).
  // Le shell s'en sert pour appliquer un deep-link (/jacdoc/:id,
  // /document/:cloudId, /jacnote) sans race avec la restauration IDB :
  // si on appliquait le deep-link avant, la session restaurée écraserait
  // l'onglet ouvert par l'URL. Stocké en ref pour qu'un callback recréé
  // à chaque render n'oblige pas à re-exécuter l'effet d'init.
  const onRecoveryCompleteRef = useRef(onRecoveryComplete)
  const onRecoveryStateChangeRef = useRef(onRecoveryStateChange)
  useEffect(() => { onRecoveryCompleteRef.current = onRecoveryComplete })
  useEffect(() => { onRecoveryStateChangeRef.current = onRecoveryStateChange })

  useEffect(() => {
    let cancelled = false
    // Marque la recovery comme terminée + notifie le shell. Appelé dans
    // les 3 branches (restauration multi-tab réussie, fallback single-PDF,
    // premier lancement) pour garantir qu'aucun cas ne laisse le deep-link
    // en attente indéfiniment. try/catch pour ne pas casser la persistance
    // si le callback throw.
    //
    // ⚠️ setTimeout(0) crucial : on défère le callback jusqu'au prochain
    // macrotask, APRÈS que React ait commit les setTabs/setActiveId du
    // restore IDB ci-dessus. Sinon le shell lit `tabs` depuis le closure
    // du premier render (tabs=[launcher] initial) dans son handler
    // `jacsuite:openJacDoc` et ne voit pas l'onglet JacDoc qu'on vient
    // tout juste de restaurer — il créerait alors un doublon d'onglet
    // (même docId, fileName='Sans titre') au lieu de focuser l'existant.
    //
    // Symptôme observé sans ce defer : refresh sur /jacdoc/<docId> reste
    // bloqué sur le launcher (fond bleu indigo), il faut taper /accueil
    // dans la barre d'adresse pour récupérer la session.
    const finish = () => {
      recoveryCompleteRef.current = true
      setTimeout(() => {
        try { onRecoveryStateChangeRef.current?.(true) } catch (err) {
          if (import.meta.env.DEV) console.warn('[useTabsPersistence] onRecoveryStateChange a planté', err)
        }
        try { onRecoveryCompleteRef.current?.() } catch (err) {
          if (import.meta.env.DEV) console.warn('[useTabsPersistence] onRecoveryComplete a planté', err)
        }
      }, 0)
    }
    ;(async () => {
      // 1) Préférence : restaurer TOUS les onglets ouverts (multi-tab).
      const saved = await loadTabs()
      if (cancelled) return
      if (saved?.tabs?.length) {
        // Lot 7 — étape E. Normalise + filtre les tabs corrompus avant de toucher le state.
        const validTabs = saved.tabs.map(normalizeRestoredTab).filter(Boolean)
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
          finish()
          return
        }
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
        setTabs([{ id, app: 'jacpdf', type: 'pdf', fileName: persisted.fileName, fileBytes: persisted.bytes }])
        setActiveId(id)
      }
      // 3) Premier lancement (rien en IDB) : on garde l'onglet Accueil par
      // défaut créé dans l'initializer de useState.
      finish()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persiste la session multi-onglets avec un debounce 500 ms.
  //
  // Lot 7 — étape G. Coalesce les rafales de changements (fermer plusieurs
  // onglets d'affilée, drag-reorder, switch rapide d'activeId) en UNE
  // écriture IDB au lieu d'une par changement.
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