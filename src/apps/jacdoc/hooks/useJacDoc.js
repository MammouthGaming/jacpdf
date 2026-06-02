import { useCallback, useEffect, useRef, useState } from 'react'
import { jacdocStore } from '../stores/jacdocStore'
import { saveDoc as saveCloudDoc } from '@/apps/jacdoc/lib/cloud/jacdocCloud'
import {
  saveJacdocDriveFile,
  getOrCreateJacDocDriveFolder,
} from '@/apps/jacdoc/lib/cloud/jacdocGoogleDrive'

const SAVE_DEBOUNCE_MS = 500

// Lit les réglages « Cloud & sauvegarde » depuis Paramètres → JacDoc → Cloud.
// Re-lu à chaque flush/intervalle pour que les changements prennent effet sans recharger.
//
// Source de vérité actuelle : un blob JSON dans localStorage.jacdoc_cloudSettings
// (écrit par CloudSection.jsx, broadcast via l'event 'jacdoc_settingsChange').
// On garde une lecture de l'ancien format à plat (jacdoc_settings_cloud_*) en
// fallback pour les utilisateurs qui n'ont pas encore touché la nouvelle modale.
function readJacdocCloudSettings() {
  // Format historique à plat (avant le refactor CloudSection → useJacdocCloud).
  const legacy = () => ({
    autosave:        (localStorage.getItem('jacdoc_settings_cloud_autosave') || 'true') !== 'false',
    syncMode:         localStorage.getItem('jacdoc_settings_cloud_sync_mode')         || 'wifi',
    conflictMode:     localStorage.getItem('jacdoc_settings_cloud_conflict_mode')     || 'ask',
    offlineCopies:    localStorage.getItem('jacdoc_settings_cloud_offline_copies')    || 'recent',
    backupFrequency:  localStorage.getItem('jacdoc_settings_cloud_backup_frequency')  || 'daily',
    backupLocation:   localStorage.getItem('jacdoc_settings_cloud_backup_location')   || 'jacsuite',
  })

  try {
    const raw = localStorage.getItem('jacdoc_cloudSettings')
    if (!raw) return legacy()

    const blob = JSON.parse(raw)
    if (!blob || typeof blob !== 'object') return legacy()

    // Mapping nouveau format → forme attendue par shouldAutoSync /
    // resolveBackupTargets / backupIntervalMs.
    //
    // « autosave » correspond à « Auto-sync activé ».
    // « syncMode » est déduit du nouvel intervalle (option "Manuel" = -1).
    //   Les autres intervalles laissent la valeur 'wifi' historique pour
    //   conserver le filtrage éco-data du mode anciens utilisateurs.
    // « backupLocation » 'drive' n'existe pas encore dans la nouvelle UI
    //   (CloudSection ne propose que 'jacsuite' / 'local' / 'both'). On le
    //   reconnait quand même ici en cas d'utilisation programmatique future.
    const autosave = blob.autoSyncEnabled !== false
    const interval = typeof blob.autoSyncInterval === 'number'
      ? blob.autoSyncInterval
      : 0
    const syncMode = interval === -1 ? 'manual' : 'wifi'

    return {
      autosave,
      syncMode,
      conflictMode:    blob.conflictMode    || 'ask',
      offlineCopies:   blob.offlineCopies   || 'recent',
      backupFrequency: blob.backupFrequency || 'daily',
      backupLocation:  blob.backupLocation  || 'jacsuite',
      // Champs additionnels exposés pour permettre à d'autres modules
      // (notifications, share UI) de lire la même config sans dupliquer.
      defaultProvider:      blob.defaultProvider      || 'jacsuite',
      autoSyncInterval:     interval,
      autoSyncNotification: !!blob.autoSyncNotification,
      versioningEnabled:    blob.versioningEnabled !== false,
      versioningMax:        typeof blob.versioningMax === 'number' ? blob.versioningMax : 25,
      encryptBackups:       blob.encryptBackups !== false,
      clearTokensOnClose:   !!blob.clearTokensOnClose,
      confirmDeleteSync:    blob.confirmDeleteSync !== false,
    }
  } catch {
    return legacy()
  }
}

// Décide si le mirror cloud/drive doit s'exécuter automatiquement.
//   - autosave=false      → jamais (l'utilisateur a désactivé la sauvegarde auto)
//   - syncMode='manual'   → jamais (déclenchements explicites uniquement)
//   - syncMode='wifi'     → uniquement quand la connexion est wifi/ethernet/4g
//   - syncMode='always'   → toujours
function shouldAutoSync(settings) {
  if (!settings.autosave) return false
  if (settings.syncMode === 'manual') return false
  if (settings.syncMode === 'wifi' && typeof navigator !== 'undefined') {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn) {
      if (conn.type && conn.type !== 'wifi' && conn.type !== 'ethernet') return false
      if (conn.effectiveType && conn.effectiveType !== '4g' && conn.effectiveType !== 'wifi') return false
    }
  }
  return true
}

// Convertit « Fréquence des sauvegardes » en intervalle en ms (null = off).
function backupIntervalMs(frequency) {
  if (frequency === 'hourly') return 60 * 60 * 1000
  if (frequency === 'daily')  return 24 * 60 * 60 * 1000
  if (frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000
  return null
}

// Décide vers quelles destinations le flush peut écrire en fonction de
// « Emplacement de sauvegarde » (Paramètres → JacDoc → Cloud) :
//   - 'jacsuite' → toutes les destinations connectées (cloudId, driveFileId)
//   - 'local'    → IndexedDB uniquement, aucun mirror réseau
//   - 'drive'    → uniquement Google Drive (le mirror Supabase est sauté
//                  même si le doc a un cloudId)
//   - 'ask'      → demande une fois par session, mémorise dans sessionStorage
// IndexedDB n'est jamais désactivé : c'est le filet anti-perte locale.
function resolveBackupTargets(settings) {
  const loc = settings.backupLocation || 'jacsuite'
  if (loc === 'local') return { cloud: false, drive: false }
  if (loc === 'drive') return { cloud: false, drive: true }
  if (loc === 'ask') {
    try {
      let answer = sessionStorage.getItem('jacdoc_settings_backup_location_ask')
      if (!answer) {
        const wantCloud = typeof window !== 'undefined' && window.confirm(
          'Où sauvegarder vos documents JacDoc pour cette session ?\n\n' +
          'OK : JacSuite Cloud (synchronisé entre vos appareils).\n' +
          'Annuler : Local seulement (ce navigateur uniquement).'
        )
        answer = wantCloud ? 'jacsuite' : 'local'
        try { sessionStorage.setItem('jacdoc_settings_backup_location_ask', answer) } catch {}
      }
      if (answer === 'local') return { cloud: false, drive: false }
      return { cloud: true, drive: true }
    } catch {
      return { cloud: true, drive: true }
    }
  }
  // 'jacsuite' (défaut) — mirror sur n'importe quelle destination déjà reliée.
  return { cloud: true, drive: true }
}

// Hook utilisé par le composant qui rend un onglet de type 'jacdoc'.
//
// Paramètre :
//   docId : id du document IndexedDB (la création a déjà été faite par
//           HomeContent/NewJacDocModal avant l'ouverture de l'onglet).
//
// Retourne :
//   { loading, doc, error, updateDoc(json), updateTitle(string), applyRemoteDoc(remoteDoc) }
//
// L'autosave est débouncé à 500 ms. Phase Cloud :
//   - toujours sauvegarde locale IndexedDB en premier
//   - si doc.cloudId existe → mirror Supabase via jacdocCloud.saveDoc()
//   - si le cloud échoue, le doc local reste sauvé et saveState passe à error
export function useJacDoc(docId) {
  const [state, setState] = useState({ loading: true, doc: null, error: null })
  // État sauvegarde pour l'indicateur dans le topbar de l'éditeur :
  //   'saved'  : IndexedDB synchronisé (+ cloud si cloudId)
  //   'saving' : un patch a été schedulé, attente du flush débouncé
  //   'error'  : dernière tentative cloud/local échouée
  const [saveState, setSaveState] = useState('saved')

  // Refs pour le pipeline d'autosave :
  //   timer  : id du setTimeout débouncé en cours (null si aucun).
  //   latest : dernière version connue du doc (titre + contenu fusionnés).
  //   pending: patch non encore écrit.
  const timer = useRef(null)
  const latest = useRef(null)
  const pending = useRef(null) // { title?, doc? }

  const flush = useCallback(async (opts) => {
    if (!latest.current) return
    if (!pending.current && opts?.forceSync !== true) return

    const patch = pending.current || {}
    pending.current = null

    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    // Lit les réglages Cloud à chaque flush pour que l'utilisateur n'ait pas
    // à recharger après avoir modifié un toggle. `forceSync` permet à la
    // sauvegarde périodique de pousser même si l'auto-sync est désactivé.
    const cloudSettings = readJacdocCloudSettings()
    const allowSync = opts?.forceSync === true || shouldAutoSync(cloudSettings)
    const targets = resolveBackupTargets(cloudSettings)

    try {
      // 1) Sauvegarde locale-first : même si Supabase tombe, l'utilisateur
      // ne perd pas son contenu dans l'onglet courant. La couche locale
      // IndexedDB n'est jamais désactivée par les réglages (sécurité anti-perte).
      const updatedLocal = await jacdocStore.update(latest.current.id, patch)
      if (updatedLocal) latest.current = updatedLocal

      // 2) Mirror cloud seulement pour les documents déjà liés à JacDoc Cloud,
      // et seulement si l'auto-sync est autorisé par les réglages utilisateur.
      // Les docs locaux restent locaux tant que l'utilisateur ne les envoie pas
      // explicitement dans le cloud depuis l'accueil / picker.
      if (allowSync && targets.cloud && latest.current?.cloudId && latest.current?.canEdit !== false) {
        const updatedCloud = await saveCloudDoc({
          documentId: latest.current.cloudId,
          title: latest.current.title,
          doc: latest.current.doc,
          folderId: latest.current.folderId ?? null,
          classroomId: latest.current.classroomId ?? null,
        })

        // On remet à jour le cache local avec la revision/syncedAt retournées
        // par Supabase. `touch: false` évite de re-bumper updatedAt juste pour
        // une métadonnée de sync.
        const synced = await jacdocStore.update(
          latest.current.id,
          {
            syncedAt: updatedCloud.syncedAt || updatedCloud.updatedAt || new Date().toISOString(),
            revision: updatedCloud.revision || latest.current.revision,
            folderId: updatedCloud.folderId ?? latest.current.folderId ?? null,
            source: 'jacdoc_cloud',
          },
          { touch: false },
        )
        if (synced) latest.current = synced
      }

      // 3) Mirror Google Drive pour les documents ouverts depuis Drive.
      // Le format Drive JacDoc est un JSON portable (`.jacdoc.json`) qui
      // contient le doc ProseMirror complet. On réécrit le même fichier.
      // Gaté par le même `allowSync` que JacDoc Cloud (autosave + syncMode).
      if (allowSync && targets.drive && latest.current?.driveFileId) {
        const driveSaved = await saveJacdocDriveFile({
          fileId: latest.current.driveFileId,
          title: latest.current.title,
          doc: latest.current.doc,
          localId: latest.current.id,
          cloudId: latest.current.cloudId || null,
          revision: latest.current.revision || 1,
        })

        const syncedDrive = await jacdocStore.update(
          latest.current.id,
          {
            driveFileName: driveSaved.name || latest.current.driveFileName || null,
            syncedAt: driveSaved.modifiedTime || new Date().toISOString(),
            source: latest.current.cloudId ? 'jacdoc_cloud' : 'google_drive',
          },
          { touch: false },
        )
        if (syncedDrive) latest.current = syncedDrive
      }

      setSaveState('saved')
    } catch (err) {
      // Best-effort : on log mais on ne casse pas l'UI. Le prochain edit
      // réessaiera d'écrire l'état complet.
      if (typeof console !== 'undefined') {
        console.error('[useJacDoc] flush failed', err)
      }
      setSaveState('error')
    }
  }, [])

  const schedule = useCallback((patch) => {
    pending.current = { ...(pending.current || {}), ...patch }
    if (timer.current) clearTimeout(timer.current)
    setSaveState('saving')
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }, [flush])

  // Hydration : charge le doc depuis IndexedDB à chaque changement de docId.
  useEffect(() => {
    let cancelled = false
    setState({ loading: true, doc: null, error: null })
    ;(async () => {
      try {
        const saved = await jacdocStore.get(docId)
        if (cancelled) return
        if (!saved) {
          // Cas anormal : l'onglet existe mais le doc a été supprimé ailleurs.
          setState({ loading: false, doc: null, error: 'not_found' })
          return
        }
        latest.current = saved
        setState({ loading: false, doc: saved, error: null })
      } catch (err) {
        if (cancelled) return
        setState({ loading: false, doc: null, error: err })
      }
    })()
    return () => { cancelled = true }
  }, [docId])

  // Flush sur changement de doc (= changement d'onglet) ou unmount.
  useEffect(() => () => { flush() }, [docId, flush])

  // Flush sur fermeture navigateur / passage en arrière-plan.
  useEffect(() => {
    const onUnload = () => { flush() }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  // Sauvegarde périodique programmée (Paramètres → JacDoc → Cloud → Fréquence).
  //   off                      → aucun intervalle
  //   hourly / daily / weekly  → flush forcé même si auto-sync désactivé
  // Le contenu est déjà sauvé localement à chaque frappe ; cette routine
  // garantit un envoi régulier vers la destination JacSuite/Drive même quand
  // l'utilisateur a désactivé l'auto-sync ou choisi le mode manuel.
  // Note : la fréquence est lue au montage. Pour qu'un changement prenne
  // effet, l'utilisateur doit recharger l'onglet.
  // « Emplacement de sauvegarde » = 'local' coupe la sauvegarde périodique
  // (aucun intérêt à planifier un mirror réseau si tout doit rester local).
  // Pour 'drive' / 'ask' / 'jacsuite', resolveBackupTargets() tri les
  // destinations directement dans le flush.
  // « Copies hors ligne » : pas de gating ici. La sémantique 'none' /
  // 'recent' / 'favorites' / 'all' nécessite une routine de prefetch dédiée
  // (cataloguer les docs cloud d'un classroom et les hydrater dans IDB)
  // qui n'est pas encore implémentée — voir backlog.
  useEffect(() => {
    const settings = readJacdocCloudSettings()
    if (settings.backupLocation === 'local') return undefined
    const ms = backupIntervalMs(settings.backupFrequency)
    if (!ms) return undefined
    const id = setInterval(() => {
      if (!latest.current) return
      // Force un flush + mirror, en bypassant autosave=off / syncMode=manual.
      flush({ forceSync: true }).catch(() => {})
    }, ms)
    return () => clearInterval(id)
  }, [flush])

  // API publique : modif du contenu ProseMirror.
  const updateDoc = useCallback((nextDoc) => {
    if (!latest.current || latest.current.canEdit === false) return
    latest.current = { ...latest.current, doc: nextDoc }
    schedule({ doc: nextDoc })
  }, [schedule])

  // API publique : modif du titre (édité dans le TabBar).
  const updateTitle = useCallback((title) => {
    if (!latest.current || latest.current.canEdit === false) return
    const clean = (title || '').trim() || 'Sans titre'
    latest.current = { ...latest.current, title: clean }
    setState((s) => (s.doc ? { ...s, doc: { ...s.doc, title: clean } } : s))
    schedule({ title: clean })
  }, [schedule])

  // Applique une version distante reçue via Supabase Realtime.
  //
  // Ce n'est pas encore du merge CRDT : on accepte seulement les révisions
  // cloud plus récentes que la révision locale connue. Si l'utilisateur a
  // des modifications locales en attente, on flush d'abord pour éviter de
  // perdre un patch déjà tapé pendant le debounce.
  const applyRemoteDoc = useCallback(async (remoteDoc) => {
    if (!latest.current || !remoteDoc?.doc) return null

    const remoteRevision = remoteDoc.revision || 0
    if (remoteRevision <= (latest.current.revision || 0)) {
      return null
    }

    // Détecte un conflit : modifs locales non encore poussées au moment où
    // la révision distante arrive. On capture la valeur avant le flush.
    const hadLocalPending = !!pending.current

    await flush()

    if (remoteRevision <= (latest.current?.revision || 0)) {
      return null
    }

    // Applique « Conflits de version » (Paramètres → JacDoc → Cloud).
    if (hadLocalPending) {
      const { conflictMode } = readJacdocCloudSettings()
      if (conflictMode === 'ask') {
        const accept = typeof window !== 'undefined' && window.confirm(
          'Conflit de version sur « ' + (latest.current.title || 'Sans titre') + ' ».\n\n' +
          'OK : garder la version distante (vos modifs locales seront écrasées).\n' +
          'Annuler : garder votre version locale (la version distante sera ignorée).'
        )
        if (!accept) return null
      } else if (conflictMode === 'keep-both') {
        // Duplique la version locale dans un nouveau document avant d'écraser
        // avec la version distante. Si la création échoue, on retombe sur
        // « latest » (la version distante sera quand même appliquée).
        try {
          if (typeof jacdocStore.create === 'function') {
            await jacdocStore.create({
              title: (latest.current.title || 'Sans titre') + ' (copie locale)',
              doc: latest.current.doc,
              cloudId: null,
              folderId: latest.current.folderId ?? null,
            })
          }
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.warn('[useJacDoc] keep-both duplicate failed, falling back to latest', err)
          }
        }
      }
      // conflictMode === 'latest' : comportement par défaut, on laisse passer.
    }

    const synced = await jacdocStore.update(latest.current.id, {
      title: (remoteDoc.title || latest.current.title || 'Sans titre').trim() || 'Sans titre',
      doc: remoteDoc.doc,
      ownerId: remoteDoc.ownerId || latest.current.ownerId || null,
      classroomId: remoteDoc.classroomId ?? latest.current.classroomId ?? null,
      syncedAt: remoteDoc.syncedAt || remoteDoc.updatedAt || new Date().toISOString(),
      cloudId: remoteDoc.cloudId || remoteDoc.id || latest.current.cloudId,
      folderId: remoteDoc.folderId ?? latest.current.folderId ?? null,
      source: 'jacdoc_cloud',
      revision: remoteRevision,
      isShared: remoteDoc.isShared ?? latest.current.isShared ?? false,
      shareRole: remoteDoc.shareRole || latest.current.shareRole || 'viewer',
      canEdit: remoteDoc.canEdit ?? latest.current.canEdit ?? false,
    })

    if (synced) {
      latest.current = synced
      setState((s) => ({ ...s, doc: synced }))
      setSaveState('saved')
    }

    return synced
  }, [flush])

  // Envoie / rattache un document JacDoc à Google Drive.
  //
  // Si le document a déjà un `driveFileId`, on réécrit ce fichier. Sinon,
  // on crée un `.jacdoc.json` dans le dossier Drive `JacDoc/`, puis on garde
  // le fileId dans IndexedDB pour que l'autosave continue sur le même fichier.
  const publishToDrive = useCallback(async () => {
    if (!latest.current) return null

    setSaveState('saving')

    try {
      await flush()

      const source = latest.current
      const parentId = source.driveFileId ? null : await getOrCreateJacDocDriveFolder()
      const driveSaved = await saveJacdocDriveFile({
        fileId: source.driveFileId || null,
        title: source.title,
        doc: source.doc,
        localId: source.id,
        cloudId: source.cloudId || null,
        revision: source.revision || 1,
        parentId,
      })

      const synced = await jacdocStore.update(
        source.id,
        {
          driveFileId: driveSaved.id || source.driveFileId || null,
          driveFileName: driveSaved.name || source.driveFileName || `${source.title || 'Document JacDoc'}.jacdoc.json`,
          syncedAt: driveSaved.modifiedTime || new Date().toISOString(),
          source: source.cloudId ? 'jacdoc_cloud' : 'google_drive',
        },
        { touch: false },
      )

      if (synced) {
        latest.current = synced
        setState((s) => ({ ...s, doc: synced }))
      }

      setSaveState('saved')
      return synced
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.error('[useJacDoc] publishToDrive failed', err)
      }
      setSaveState('error')
      throw err
    }
  }, [flush])

  // Envoie un document local dans JacDoc Cloud.
  //
  // Utilisé par la modale Partager : un document local n'a pas de `cloudId`,
  // donc Supabase ne peut pas appliquer de RLS/partage dessus. On crée d'abord
  // la row `jacdocs`, puis on rattache le doc local à ce cloudId. Après ça,
  // l'autosave existant mirrorera automatiquement les prochaines modifications.
  const publishToCloud = useCallback(async () => {
    if (!latest.current) return null
    if (latest.current.cloudId) return latest.current

    setSaveState('saving')

    try {
      // Important : flush avant création cloud pour envoyer le contenu local
      // le plus récent, même si l'utilisateur clique Partager pendant le
      // debounce d'autosave.
      await flush()

      const source = latest.current
      const cloudDoc = await saveCloudDoc({
        title: source.title,
        doc: source.doc,
        folderId: source.folderId ?? null,
        classroomId: source.classroomId ?? null,
        assignmentId: source.assignmentId ?? null,
        submissionId: source.submissionId ?? null,
      })

      const synced = await jacdocStore.update(
        source.id,
        {
          cloudId: cloudDoc.cloudId || cloudDoc.id,
          folderId: cloudDoc.folderId ?? source.folderId ?? null,
          source: 'jacdoc_cloud',
          syncedAt: cloudDoc.syncedAt || cloudDoc.updatedAt || new Date().toISOString(),
          revision: cloudDoc.revision || source.revision || 1,
          isShared: !!cloudDoc.isShared,
          shareRole: cloudDoc.shareRole || 'owner',
          canEdit: cloudDoc.canEdit ?? true,
        },
        { touch: false },
      )

      if (synced) {
        latest.current = synced
        setState((s) => ({ ...s, doc: synced }))
      }

      setSaveState('saved')
      return synced
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.error('[useJacDoc] publishToCloud failed', err)
      }
      setSaveState('error')
      throw err
    }
  }, [flush])

  return { ...state, saveState, updateDoc, updateTitle, applyRemoteDoc, publishToCloud, publishToDrive }
}