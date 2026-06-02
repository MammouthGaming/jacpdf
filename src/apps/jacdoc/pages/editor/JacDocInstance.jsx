import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JacDocEditor from './JacDocEditor'
import { useJacDoc } from '@/apps/jacdoc/hooks/useJacDoc'
import { useJacdocRealtime } from '@/apps/jacdoc/hooks/cloud/useJacdocRealtime'
import Settings from '@/shared/components/ui/Settings'
import JacdocShareModal from '@/apps/jacdoc/components/cloud/JacdocShareModal'
import JacdocPresenceAvatars from '@/apps/jacdoc/components/cloud/JacdocPresenceAvatars'
import JacdocRemoteCursors from '@/apps/jacdoc/components/cloud/JacdocRemoteCursors'
import JacdocCollaboratorsSidebar from '@/apps/jacdoc/components/cloud/JacdocCollaboratorsSidebar'
import { useJacdocShares } from '@/apps/jacdoc/hooks/cloud/useJacdocShares'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { toastStore } from '@/shared/stores/ui/toastStore'

// JacDocInstance — composant monté par SuiteShell pour chaque onglet
// de type 'doc' de l'app JacDoc. Hydrate le doc via useJacDoc et rend
// JacDocEditor. Le commit du titre est aussi remonté au shell pour
// garder le label de l'onglet (tab.fileName) synchronisé.
//
// Phase 2 du refactor multi-apps JacSuite. Avant : EditorScreen vivait
// inline dans `src/apps/jacdoc/index.jsx` avec un state local openDocId
// (wrapper plein écran piloté par useLauncher().app). Maintenant : le
// shell pilote l'ouverture/fermeture des onglets et instancie ce
// composant par onglet visible (les onglets inactifs restent montés en
// display:none, comme JacPDF, pour préserver l'état Tiptap).
//
// Props :
//   tabId    : id de l'onglet (utile pour debug et futurs hooks).
//   docId    : id du doc IndexedDB à charger (passé en clé à useJacDoc).
//   isActive : true si l'onglet est l'onglet actif du shell. Phase 2 :
//              non utilisé par l'éditeur lui-même, mais réservé pour des
//              optimisations futures (ex. pause de l'autosave en arrière-
//              plan, pause des écouteurs de raccourcis, etc.).
//   onClose  : callback() appelé si l'éditeur détecte un état
//              irrécupérable (doc introuvable). N'est plus relié au
//              logo JacDoc (cf. onGoHome).
//   onGoHome : callback() appelé au clic sur le logo JacDoc dans la
//              topbar de l'éditeur. SuiteShell convertit l'onglet
//              courant en Accueil JacDoc (id préservé) — style Chrome
//              « retour à l'accueil » remplace la page courante au
//              lieu d'ouvrir un nouvel onglet.
//   onRename : callback(title) appelé après commit du nouveau titre dans
//              le store. SuiteShell met à jour tab.fileName pour que la
//              TabBar reflète immédiatement le rename.

// Styles inline en consts module pour éviter le double-{ JSX (même
// convention que SuiteShell.jsx / JacDocEditor.jsx).
const ERROR_BOX_STYLE = {
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  color: '#6b7280',
  fontFamily: 'Inter, system-ui, sans-serif',
}
const ERROR_BTN_STYLE = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #2a3347',
  background: 'transparent',
  color: '#d1d5db',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
}

export default function JacDocInstance({
  tabId,
  docId,
  isActive,
  classroomReadOnly = false,
  onClose,
  onGoHome,
  onRename,
}) {
  const {
    loading,
    doc,
    error,
    updateDoc,
    updateTitle,
    saveState,
    applyRemoteDoc,
    publishToCloud,
    publishToDrive,
  } = useJacDoc(docId)
  // Panneau Paramètres (même composant partagé que JacPDF). Phase 2 :
  // disableFullSettings=true car la modale FullSettings n'est pas encore
  // adaptée pour JacDoc. Le bouton « Version » continue de marcher.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Sidebar Collaborateurs (calque JacPDF) — s'ouvre au clic sur la pile
  // d'avatars de présence dans la topbar.
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  // Set<string> des user_id dont les annotations/curseurs sont masqués
  // dans la sidebar. Pour l'instant la couche curseurs distants est
  // désactivée (JacdocRemoteCursors renvoie null), donc l'effet est
  // purement état + visuel (ligne grisée). Quand on rebranchera une
  // couche d'overlays (cursors, highlights), il suffira de la filtrer
  // via ce Set. Calque exact de hiddenUserIds dans EditorInstance JacPDF.
  const [hiddenUserIds, setHiddenUserIds] = useState(() => new Set())
  const { user: currentUser } = useAuth()

  // Partages JacDoc (table jacdoc_shares) — sert à la sidebar pour le
  // bouton Réglages par-collaborateur (changer le rôle, retirer l'accès).
  // Le hook gère sa propre subscription Realtime (refresh auto quand on
  // ajoute / change / retire une share row), donc on n'a rien à pousser
  // manuellement après onUpdateShare/onRevokeShare.
  const {
    shares,
    updateRole: updateShareRole,
    revoke: revokeShare,
  } = useJacdocShares(doc?.cloudId || null)

  // Rôle LIVE de l'utilisateur courant sur ce document.
  // useJacdocShares est abonné aux postgres_changes de jacdoc_shares pour
  // ce document, donc dès que l'owner modifie la row (via le modal de
  // réglages), `shares` est rafraîchi automatiquement côté collaborateur.
  // En dérivant le rôle depuis `shares` (et non depuis la valeur figée
  // `doc.shareRole` issue du chargement initial), l'éditeur passe en
  // read-only et le badge « Lecture seule » apparaît immédiatement
  // côté destinataire dès que l'owner change son rôle.
  //
  // Note RLS : un non-propriétaire ne voit que sa propre row dans `shares`
  // (filtre Supabase). Un propriétaire les voit toutes mais n'a pas sa
  // propre row → myLiveShare reste null → rôle effectif = owner.
  const myLiveShare = useMemo(() => {
    if (!currentUser || !Array.isArray(shares) || shares.length === 0) return null
    const byId = shares.find((s) => s.shared_with_user_id === currentUser.id)
    if (byId) return byId
    const email = (currentUser.email || '').toLowerCase()
    if (!email) return null
    return shares.find((s) => (s.shared_with_email || '').toLowerCase() === email) || null
  }, [shares, currentUser])

  // Rôle effectif : la share row live > la valeur initiale du doc > null.
  // null signifie propriétaire (pas de share row pour soi-même).
  const liveShareRole = myLiveShare?.role || doc?.shareRole || null

  // canEdit live : seul un editor ou le propriétaire (pas de rôle)
  // peut modifier le doc. viewer / commenter → read-only.
  const liveCanEdit = !liveShareRole || liveShareRole === 'editor' || liveShareRole === 'owner'

  // viewerIsOwner : seul le propriétaire peut piloter les permissions des
  // autres collaborateurs depuis la sidebar (roue de réglages au survol).
  const viewerIsOwner = !liveShareRole || liveShareRole === 'owner'

  // Toggle individuel d'un user dans hiddenUserIds.
  const handleToggleUser = useCallback((id) => {
    if (!id) return
    setHiddenUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Toggle « Tout masquer / Tout afficher » : si tous les ids cliquables
  // sont déjà masqués → on remet à vide ; sinon → on masque tous les ids
  // cliquables. La sidebar nous passe la liste d'ids à considérer.
  const handleToggleHideAll = useCallback((ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return
    setHiddenUserIds((prev) => {
      const allHidden = ids.every((id) => prev.has(id))
      if (allHidden) return new Set()
      return new Set(ids)
    })
  }, [])

  // Adapter onUpdateShare(shareId, { role, featurePermissions }) vers le
  // hook JacDoc qui n'expose que updateRole(shareId, role). On ignore
  // silencieusement featurePermissions : la table jacdoc_shares n'a pas
  // (encore) la colonne feature_permissions comme jacpdf_document_shares.
  // Si on l'ajoute un jour, il suffira d'élargir cet adapter.
  const handleUpdateShare = useCallback(async (shareId, patch) => {
    if (!shareId) return null
    const nextRole = patch?.role
    if (!nextRole) return null
    return updateShareRole(shareId, nextRole)
  }, [updateShareRole])

  const handleRevokeShare = useCallback(async (shareId) => {
    if (!shareId) return null
    return revokeShare(shareId)
  }, [revokeShare])
  const lastRemoteSyncToastRef = useRef(0)

  const handleRemoteDoc = useCallback(async (remoteDoc) => {
    const synced = await applyRemoteDoc(remoteDoc)
    if (!synced) return

    if (typeof onRename === 'function' && synced.title) {
      onRename(synced.title)
    }

    const now = Date.now()
    if (now - lastRemoteSyncToastRef.current > 7000) {
      lastRemoteSyncToastRef.current = now
      toastStore.info('Document JacDoc mis à jour depuis la collaboration.')
    }
  }, [applyRemoteDoc, onRename])

  // Collaboration live — présence + fondation Realtime.
  // Activée seulement pour les documents JacDoc Cloud, parce qu'un doc local
  // n'a pas d'id Supabase stable à rejoindre. La synchro de contenu fine
  // viendra ensuite (Yjs/Hocuspocus ou patches CRDT), mais cette couche donne
  // déjà le canal Supabase + les avatars de présence comme JacPDF.
  const { connected, presenceUsers, remoteCursors, broadcastCursor } = useJacdocRealtime({
    documentId: doc?.cloudId,
    localRevision: doc?.revision || 0,
    enabled: isActive && !!doc?.cloudId,
    onRemoteDoc: handleRemoteDoc,
  })

  // Le bouton « Partager » vit dans JacDocTopbar, rendu à l'intérieur de
  // JacDocEditor. Pour éviter de prop-driller une modale lourde dans
  // l'éditeur, la topbar dispatch `jacsuite:openJacDocShare` quand aucun
  // onShare direct n'est fourni. Chaque instance écoute seulement si son
  // onglet est actif, donc le bon document ouvre sa modale.
  useEffect(() => {
    if (!isActive) return
    const handler = () => setShareOpen(true)
    window.addEventListener('jacsuite:openJacDocShare', handler)
    return () => window.removeEventListener('jacsuite:openJacDocShare', handler)
  }, [isActive])

  const getStoredClassroomReadOnly = useCallback(() => {
    if (!doc?.cloudId) return false

    try {
      const stored = localStorage.getItem(`jacdoc_classroom_readonly:${doc.cloudId}`)
      const parsed = stored ? JSON.parse(stored) : null
      if (typeof parsed?.readOnly === 'boolean') return parsed.readOnly
    } catch {}

    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key?.startsWith('jacpdf-classroom-student-attachments:')) continue

        const draft = JSON.parse(localStorage.getItem(key) || '{}')
        const attachments = Array.isArray(draft?.attachments) ? draft.attachments : []
        const hasDocument = attachments.some((attachment) => (
          attachment?.source === 'jacdoc-cloud' &&
          (
            attachment?.documentId === doc.cloudId ||
            attachment?.document_id === doc.cloudId ||
            attachment?.id === doc.cloudId
          )
        ))
        const isSubmitted = draft?.status === 'submitted' || draft?.status === 'done'

        if (hasDocument && isSubmitted) return true
      }
    } catch {}

    return false
  }, [doc?.cloudId])

  const [storedClassroomReadOnly, setStoredClassroomReadOnly] = useState(() => getStoredClassroomReadOnly())

  useEffect(() => {
    setStoredClassroomReadOnly(getStoredClassroomReadOnly())
  }, [getStoredClassroomReadOnly])

  useEffect(() => {
    if (!doc?.cloudId) return

    const applyClassroomReadOnly = (detail = {}) => {
      const { documentId, readOnly } = detail
      if (documentId !== doc.cloudId || typeof readOnly !== 'boolean') return
      setStoredClassroomReadOnly(readOnly)
    }

    const readOnlyHandler = (event) => {
      applyClassroomReadOnly(event.detail || {})
    }

    const storageHandler = (event) => {
      if (event.key !== `jacdoc_classroom_readonly:${doc.cloudId}` || !event.newValue) return

      try {
        applyClassroomReadOnly(JSON.parse(event.newValue))
      } catch {}
    }

    let channel = null
    try {
      channel = new BroadcastChannel('jacdoc-classroom-readonly')
      channel.onmessage = (event) => applyClassroomReadOnly(event.data || {})
    } catch {
      channel = null
    }

    window.addEventListener('jacsuite:setJacDocClassroomReadOnly', readOnlyHandler)
    window.addEventListener('storage', storageHandler)

    return () => {
      window.removeEventListener('jacsuite:setJacDocClassroomReadOnly', readOnlyHandler)
      window.removeEventListener('storage', storageHandler)
      channel?.close()
    }
  }, [doc?.cloudId])

  // isReadOnly utilise le canEdit LIVE pour basculer l'éditeur en
  // read-only dès que l'owner rabaisse le rôle du collaborateur en
  // viewer/commenter — sans attendre un rechargement du doc.
  const isReadOnly = useMemo(() => (
    !liveCanEdit || classroomReadOnly || storedClassroomReadOnly
  ), [classroomReadOnly, liveCanEdit, storedClassroomReadOnly])

  // Avatars de la topbar — on fusionne deux sources pour montrer TOUS les
  // collaborateurs du doc (calque Google Docs) :
  //   1) presenceUsers       → ceux qui sont actuellement en ligne ;
  //   2) shares              → ceux qui ont accès mais ne sont pas connectés.
  // Chaque entrée porte un flag `isOnline` que le composant d'avatars
  // utilise pour afficher (ou non) le point vert. L'utilisateur courant
  // est filtré dans les deux sources — on sait déjà qu'on est dans le doc.
  // Dédup par userId, sinon par email (cas invitation pending non redeemée).
  //
  // ⚠️ Doit rester AVANT les early returns (if loading / if error)
  // pour respecter les Rules of Hooks — le nombre et l'ordre des hooks
  // doivent être stables entre les rendus.
  const collaboratorAvatars = useMemo(() => {
    const myId = currentUser?.id
    const myEmail = (currentUser?.email || '').toLowerCase()
    const isMe = (id, email) => {
      if (myId && id === myId) return true
      if (myEmail && (email || '').toLowerCase() === myEmail) return true
      return false
    }

    const list = []
    const seen = new Set()

    // 1) En ligne — depuis la présence Realtime. On garde l'objet tel quel
    //    (name, avatarUrl, email, userId) et on marque isOnline: true.
    const onlineList = Array.isArray(presenceUsers) ? presenceUsers : []
    for (const u of onlineList) {
      if (isMe(u?.userId, u?.email)) continue
      const key = u?.userId || (u?.email ? `email:${u.email.toLowerCase()}` : null)
      if (!key || seen.has(key)) continue
      seen.add(key)
      list.push({ ...u, isOnline: true })
    }

    // 2) Hors ligne — depuis les shares. Les rows jacdoc_shares ne portent
    //    pas le nom/avatar du destinataire, donc on retombe sur la partie
    //    locale de l'email comme libellé (« jacob » pour jacob@x.com). Quand
    //    le collaborateur se connectera, sa row de présence remplacera
    //    cette entrée (dédup par userId) et apportera nom + avatar.
    const sharesList = Array.isArray(shares) ? shares : []
    for (const s of sharesList) {
      const sUserId = s?.shared_with_user_id || null
      const sEmail = ((s?.shared_with_email || '') + '').toLowerCase() || null
      if (isMe(sUserId, sEmail)) continue
      const key = sUserId || (sEmail ? `email:${sEmail}` : null)
      if (!key || seen.has(key)) continue
      seen.add(key)
      list.push({
        userId: sUserId || key,
        name: sEmail ? sEmail.split('@')[0] : 'Collaborateur',
        email: sEmail,
        avatarUrl: null,
        isOnline: false,
      })
    }

    return list
  }, [presenceUsers, shares, currentUser?.id, currentUser?.email])

  // Menu Fichier > Enregistrer dans Google Drive.
  // Le menu dispatch un event global ; seule l'instance active le traite.
  useEffect(() => {
    if (!isActive) return

    const handler = async () => {
      if (isReadOnly) {
        toastStore.error('Ce document est en lecture seule.')
        return
      }

      try {
        const synced = await publishToDrive()
        if (synced?.driveFileId) {
          toastStore.success('Document JacDoc enregistré dans Google Drive.')
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[JacDocInstance] save to Drive failed', err)
        toastStore.error('Impossible d’enregistrer ce document dans Google Drive.')
      }
    }

    window.addEventListener('jacsuite:saveJacDocGoogleDrive', handler)
    return () => window.removeEventListener('jacsuite:saveJacDocGoogleDrive', handler)
  }, [isActive, isReadOnly, publishToDrive])

  if (loading) {
    return <div className="jacdoc-loading">Chargement…</div>
  }

  if (error || !doc) {
    return (
      <div className="jacdoc-loading" style={ERROR_BOX_STYLE}>
        <span>Document introuvable.</span>
        <button type="button" style={ERROR_BTN_STYLE} onClick={onClose}>
          Fermer l'onglet
        </button>
      </div>
    )
  }

  // Wrapper updateTitle : on commit dans le store ET on remonte au shell
  // pour que la TabBar (tab.fileName) reflète immédiatement le rename.
  // Même règle de cleanup que dans useJacDoc.updateTitle pour éviter une
  // désynchro temporaire (TabBar = 'Sans titre' / éditeur = vide).
  const handleRename = (newTitle) => {
    if (isReadOnly) return
    updateTitle(newTitle)
    if (typeof onRename === 'function') {
      const clean = (newTitle || '').trim() || 'Sans titre'
      onRename(clean)
    }
  }

  const handleUploadBeforeShare = async () => {
    const synced = await publishToCloud()
    return synced
  }

  // Source du document — badge à gauche du nom de fichier dans la topbar
  // (calque exact de JacPDF). On la dérive depuis l'IndexedDB local :
  //   - cloudId présent      → 'jacdocCloud' (Supabase)
  //   - driveFileId présent  → 'drive'       (.jacdoc.json dans Drive)
  //   - sinon                → 'local'       (uniquement IDB)
  // JacDoc Cloud prime sur Drive : un doc publié dans le cloud reste
  // identifié comme Cloud même s'il est aussi mirrored dans Drive. C'est
  // cohérent avec useJacDoc.js qui patche `source = 'jacdoc_cloud'` dans
  // ce cas-là.
  const documentSource = doc?.cloudId
    ? 'jacdocCloud'
    : doc?.driveFileId
      ? 'drive'
      : 'local'

  // Compteur pour `collaborationUsers` — seuls les utilisateurs en ligne
  // comptent comme « personnes actuellement dans le doc ». Les hors-ligne
  // sont affichés dans la pile mais ne gonflent pas le compteur.
  // (collaboratorAvatars est calculé plus haut, AVANT les early returns,
  // pour respecter les Rules of Hooks.)
  const onlineCollaboratorCount = collaboratorAvatars.reduce(
    (n, u) => n + (u.isOnline ? 1 : 0),
    0,
  )

  return (
    <>
      <JacDocEditor
        docId={doc.id}
        initialDoc={doc.doc}
        title={doc.title}
        documentSource={documentSource}
        onChange={updateDoc}
        onRename={isReadOnly ? undefined : handleRename}
        saveState={saveState}
        readOnly={isReadOnly}
        cloudDocumentId={doc.cloudId || null}
        canComment={
          !!doc.cloudId &&
          !classroomReadOnly &&
          !storedClassroomReadOnly &&
          (!liveShareRole || liveShareRole === 'owner' || liveShareRole === 'editor' || liveShareRole === 'commenter')
        }
        collaborationConnected={connected}
        collaborationUsers={onlineCollaboratorCount}
        presenceUsers={collaboratorAvatars}
        onOpenSettings={() => setSettingsOpen(true)}
        onShare={() => setShareOpen(true)}
        onShowCollaborators={() => setCollaboratorsOpen((v) => !v)}
        onBack={onGoHome}
        onCursorChange={broadcastCursor}
      />
      <JacdocCollaboratorsSidebar
        open={collaboratorsOpen}
        onClose={() => setCollaboratorsOpen(false)}
        users={collaboratorAvatars}
        currentUserId={currentUser?.id}
        viewerIsOwner={viewerIsOwner}
        shares={shares}
        onUpdateShare={handleUpdateShare}
        onRevokeShare={handleRevokeShare}
        hiddenUserIds={hiddenUserIds}
        onToggleUser={handleToggleUser}
        onToggleHideAll={handleToggleHideAll}
      />
      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          inEditor
          appName="JacDoc"
        />
      )}
      {/* Les avatars de présence sont rendus directement dans la topbar
          à gauche du bouton Historique (calque Google Docs). On ne garde
          plus la couche flottante au-dessus de l'éditeur. */}
      {doc.cloudId && <JacdocRemoteCursors cursors={remoteCursors} />}
      <JacdocShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        documentId={doc.cloudId}
        documentTitle={doc.title}
        canManageSharing={!isReadOnly}
        shareRole={liveShareRole}
        onUploadToCloud={handleUploadBeforeShare}
      />
    </>
  )
}