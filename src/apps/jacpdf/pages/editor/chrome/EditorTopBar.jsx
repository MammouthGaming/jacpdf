// Topbar de l'éditeur — extrait de Editor.jsx (Lot B).
// Bandeau du haut : logo JacPDF (ouvre nouvel onglet Accueil), undo/redo,
// nom de fichier éditable inline, menu de sauvegarde Drive (Finition 1),
// et boutons Export / Tools / View / Settings.
//
// Toute la logique d'état (undo/redo, édition du nom, ouverture des modals,
// auto-save Drive) reste dans EditorInstance — ce composant ne fait que
// rendre la barre et déléguer les actions via callbacks.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DriveSaveIndicator from "@/apps/jacpdf/components/cloud/DriveSaveIndicator"
import DocumentSourceBadge from '@/apps/jacpdf/pages/editor/panels/DocumentSourceBadge'
import PresenceAvatars from "@/shared/components/social/PresenceAvatars"
import { useAuth } from "@/shared/hooks/user/useAuth"
import { usePremium } from "@/shared/hooks/user/usePremium"
import { PremiumBadge } from "@/shared/components/ui/PremiumLock"
import PlanBadge from "@/shared/components/ui/PlanBadge"

const JACPDF_LOGO = new URL('../../../../../../logo/JacPDF.svg', import.meta.url).href

const STUB_BTN_STYLE = { opacity: 0.4, cursor: 'not-allowed' }

export default function EditorTopBar({
  // Logo / Accueil
  onOpenHome,
  // Undo / Redo (cf. hooks/pdf/useHistory)
  undo, redo, canUndo, canRedo,
  // Nom de fichier (édition inline)
  fileName,
  editingName,
  nameDraft,
  setNameDraft,
  nameInputRef,
  startEditingName,
  commitName,
  cancelEditingName,
  // ── Source du document (badge à droite du nom de fichier) ────────
  // documentSource    : 'local' | 'drive' | 'jacpdfCloud' | null/undefined
  // driveFolderName   : nom du dossier parent dans Drive (uniquement si
  //                     documentSource === 'drive').
  documentSource,
  driveFolderName,
  // ── Téléversement local → cloud ─────────────────────────────────────
  // driveConnected         : true si une session Google Drive est active.
  // onUploadToDrive        : déclenche la connexion Drive (si nécessaire) et le
  //                          1er upload du fichier local. Affiché dans le menu
  //                          de l'indicateur quand documentSource === 'local'.
  // jacpdfCloudConnected   : true si l'utilisateur est connecté à JacPDF (session Supabase).
  // onUploadToJacpdfCloud  : déclenche le 1er upload du fichier local vers JacPDF Cloud.
  // jacpdfCloudStatus      : statut de la sauvegarde JacPDF Cloud (mirror de driveStatus).
  driveConnected,
  onUploadToDrive,
  jacpdfCloudConnected,
  onUploadToJacpdfCloud,
  jacpdfCloudStatus,
  // ── Finition 1 — Menu de sauvegarde Drive ────────────────────────────
  // driveStatus       : 'disconnected' | 'idle' | 'saving' | 'saved' |
  //                     'dirty' | 'error' | 'expired'
  // driveLastSavedAt  : timestamp ms du dernier save réussi (pour le « il y a X min »)
  // onSaveNow         : déclenche un save immédiat (bypass debounce auto-save 3 s).
  //                     Doit appeler la même fonction que l'auto-save (pas dupliquer
  //                     bake + upload) — cf. EditorInstance.handleDriveSave.
  // onOpenSaveSettings: ouvre les paramètres de sauvegarde (Finition 2 à venir —
  //                     onglet « Sauvegarde » dans FullSettingsModal).
  // onReconnectDrive  : flow de re-login Google quand le token est expiré.
  driveStatus,
  driveLastSavedAt,
  driveError,
  onSaveNow,
  onOpenSaveSettings,
  onReconnectDrive,
  // Boutons à droite
  onOpenExport,
  onOpenTools,
  onOpenView,
  // ── Phase 3 — Sharing ────────────────────────────────────────────
  // onShare : ouvre la modal de partage du document courant.
  onShare,
  // ── Classroom — remise directe depuis l'éditeur ───────────────────
  classroomTurnIn = false,
  classroomTurnInSubmitted = false,
  classroomTurnInSubmitting = false,
  onClassroomTurnIn,
  // ── Phase 3.C — Permissions de fonctionnalités ───────────────────
  // canExport : true si l'utilisateur a la permission 'export' selon le
  // share courant. Quand false, le bouton de téléchargement est grisé et le
  // clic est bloqué par disabled. Calculé dans EditorInstance via
  // canUseFeature(mySharePermissions, 'export'). Default à true côté
  // composant pour ne pas casser les owners (où la prop n'est pas passée).
  // Le bouton onShare lui-même reste toujours actif — un editor restreint
  // peut quand même voir avec qui le doc est partagé sans pouvoir modifier
  // les permissions (la modal lui montrera les rows en lecture seule).
  canExport = true,
  // ── Phase 3.C — Badge du rôle restrictif (style Kami) ───────────
  // Rôle du user courant pour ce doc : 'owner' | 'viewer' | 'commenter' | 'editor'.
  // Quand 'viewer' ou 'commenter', on affiche un badge à gauche de l'indicateur
  // de sauvegarde pour que l'utilisateur sache qu'il ne peut pas éditer. Calculé
  // dans EditorInstance via mySharePermissions.role.
  myRole,
  classroomReadOnly = false,
  // ── Phase 4 — Présence ───────────────────────────────────────────
  // presentUsers : tableau d'utilisateurs présents dans le doc (cf. usePresence).
  // currentUserId : id du user courant (filtré — on ne se voit pas soi-même).
  presentUsers,
  currentUserId,
  // Clic sur la pile d'avatars → ouvre/ferme la sidebar Collaborateurs.
  // Passé à PresenceAvatars qui rend la pile cliquable (cf. EditorInstance).
  onToggleCollaborators,
  onOpenSettings,
}) {
  // Lecture du user courant pour le nom/avatar des Paramètres. Le badge
  // d'abonnement (PlanBadge) est autonome et lit le palier via usePremium().
  const { user: currentAuthUser } = useAuth()
  // Partage & collaboration avancés = fonctionnalité Premium (gate transverse
  // partagée avec JacDoc). Verrouillé pour Gratuit/Pro → le bouton Partager
  // affiche un cadenas Premium et son clic ouvre le paywall au lieu de la
  // modale de partage. Le verrou ne s'applique PAS au mode « Remettre »
  // (Classroom), qui n'est pas du partage.
  const { isFeatureLocked, openPremiumModal } = usePremium()
  const shareLocked = isFeatureLocked('sharing_collaboration')
  const settingsDisplayName = currentAuthUser?.user_metadata?.full_name
    || currentAuthUser?.user_metadata?.name
    || currentAuthUser?.user_metadata?.user_name
    || currentAuthUser?.email?.split('@')[0]
    || 'Utilisateur'
  const settingsAvatarUrl = currentAuthUser?.user_metadata?.avatar_url
  const settingsAvatarInitial = (settingsDisplayName || 'U').charAt(0).toUpperCase()

  const topbarRef = useRef(null)
  const topbarLeftRef = useRef(null)
  const topbarRightRef = useRef(null)
  const topbarMoreRef = useRef(null)
  const fileNameScrollRef = useRef(null)
  const fileNameDragRef = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false, pointerId: null })
  const [topbarMoreOpen, setTopbarMoreOpen] = useState(false)
  const [visibleTopbarActionLimit, setVisibleTopbarActionLimit] = useState(Infinity)
  const [compactSaveLabel, setCompactSaveLabel] = useState(false)
  const [ultraCompactTopbar, setUltraCompactTopbar] = useState(false)
  const [localSharePromptOpen, setLocalSharePromptOpen] = useState(false)
  const [classroomTurnInOpen, setClassroomTurnInOpen] = useState(false)

  // Responsive style Kami : quand les boutons de droite ne rentrent plus,
  // les actions qui dépassent passent derrière un bouton ⋯.
  // Mesure RÉELLE de la topbar plutôt que breakpoints fixes : un titre PDF
  // long, un badge Drive/JacPDF Cloud, le rôle lecture seule ou les avatars
  // peuvent tous prendre une largeur différente. Le nombre de boutons visibles
  // dépend donc de l'espace restant après la zone de gauche, pas seulement de
  // window.innerWidth.
  useLayoutEffect(() => {
    let raf = 0
    const measureTopbarActions = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const topbar = topbarRef.current
        const left = topbarLeftRef.current
        const right = topbarRightRef.current
        const actionGroup = topbarMoreRef.current
        if (!topbar || !left || !right || !actionGroup) return

        const total = 3 // Export, Outils, Vue. Partager + Paramètres restent visibles comme Kami.
        const actionW = 30
        const gap = 2
        const moreW = 30
        const styles = window.getComputedStyle(topbar)
        const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)

        // Largeur occupée par le côté droit SANS les actions compactables
        // (présence, séparateurs, undo/redo). On soustrait le groupe d'actions
        // courant pour ne garder que le "fixe".
        const rightW = right.getBoundingClientRect().width
        const actionGroupW = actionGroup.getBoundingClientRect().width
        const fixedRightW = Math.max(0, rightW - actionGroupW)
        // IMPORTANT : .topbar-left est un flex item qui peut occuper tout
        // l'espace restant même si son contenu réel est plus court. Lire
        // getBoundingClientRect().width OU scrollWidth sur le parent donne
        // donc souvent une largeur trop grande. On mesure plutôt la largeur
        // réelle des enfants visibles (logo + badges + titre tronqué +
        // sauvegarde) + les gaps CSS entre eux.
        const leftChildren = Array.from(left.children)
        const leftGap = parseFloat(window.getComputedStyle(left).columnGap || window.getComputedStyle(left).gap) || 0
        const leftW = leftChildren.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
          + Math.max(0, leftChildren.length - 1) * leftGap

        const fullActionsW = total * actionW + Math.max(0, total - 1) * gap
        const saveLabel = left.querySelector('.dsi-btn-label')
        // Étape responsive AVANT le ⋯ : quand on arrive au bloc sauvegarde,
        // on cache seulement le texte ("Sauvegardé", "Non sauvegardé", etc.)
        // et on garde le logo cloud visible. Si ça ne suffit plus, ensuite
        // seulement on commence à pousser les actions de droite dans ⋯.
        const saveLabelExtraW = saveLabel ? saveLabel.scrollWidth + 8 : 0
        const expandedLeftW = compactSaveLabel ? leftW + saveLabelExtraW : leftW
        const availableExpanded = Math.max(0, topbar.clientWidth - padX - expandedLeftW - fixedRightW - 8)

        const fileNameEl = left.querySelector('.topbar-filename')
        const fileNameIsTruncated = fileNameEl
          ? fileNameEl.scrollWidth > fileNameEl.clientWidth + 1
          : false
        const saveLabelRect = saveLabel?.getBoundingClientRect()
        // Comportement Kami demandé :
        // 1) le titre du PDF raccourcit en premier (géré par le flex CSS)
        // 2) seulement quand le titre commence à être tronqué, on passe en
        //    compact d'un coup : badge DEV/source cachés, texte sauvegarde
        //    caché, et boutons remplacés par ⋯.
        const actionsAreCollapsed = Number.isFinite(visibleTopbarActionLimit) && visibleTopbarActionLimit < total
        const shouldEnterKamiCompact = fileNameIsTruncated || fullActionsW > availableExpanded
        // Hystérésis : quand on est déjà compact, on garde le mode compact
        // jusqu'à ce qu'il y ait franchement assez de place pour tout remettre.
        // Ça évite le clignotement au point de bascule.
        const shouldStayKamiCompact = actionsAreCollapsed && fullActionsW + 72 > availableExpanded

        // 3 modes comme Kami :
        // 1) normal : tout visible
        // 2) compact : titre/source encore visibles, mais DEV + save texte + actions passent en compact
        // 3) ultra-compact : logo icône + save icône seulement à gauche
        const nextUltraCompactTopbar = topbar.clientWidth <= 560

        let next = Infinity
        if (nextUltraCompactTopbar || shouldEnterKamiCompact || shouldStayKamiCompact) {
          next = 0
        }

        let nextCompactSaveLabel = next === 0 && saveLabelExtraW > 0
        let available = availableExpanded
        if (nextCompactSaveLabel) {
          const compactLeftW = compactSaveLabel
            ? leftW
            : Math.max(0, leftW - saveLabelExtraW)
          available = Math.max(0, topbar.clientWidth - padX - compactLeftW - fixedRightW - 8)
        }

        if (next !== 0 && fullActionsW > available) {
          next = 0
          nextCompactSaveLabel = saveLabelExtraW > 0
        }

        setUltraCompactTopbar(prev => prev === nextUltraCompactTopbar ? prev : nextUltraCompactTopbar)
        setCompactSaveLabel(prev => prev === nextCompactSaveLabel ? prev : nextCompactSaveLabel)
        setVisibleTopbarActionLimit(prev => prev === next ? prev : next)
        if (next === Infinity) setTopbarMoreOpen(false)
      })
    }

    measureTopbarActions()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureTopbarActions) : null
    if (ro) {
      if (topbarRef.current) ro.observe(topbarRef.current)
      if (topbarLeftRef.current) ro.observe(topbarLeftRef.current)
      if (topbarRightRef.current) ro.observe(topbarRightRef.current)
    }
    window.addEventListener('resize', measureTopbarActions)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', measureTopbarActions)
    }
  }, [fileName, editingName, nameDraft, documentSource, driveFolderName, myRole, presentUsers?.length, compactSaveLabel, visibleTopbarActionLimit, ultraCompactTopbar])

  useEffect(() => {
    if (!topbarMoreOpen) return
    const onDown = (e) => {
      if (topbarMoreRef.current?.contains(e.target)) return
      setTopbarMoreOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setTopbarMoreOpen(false) }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [topbarMoreOpen])

  const readOnlyBadgeRole = classroomReadOnly ? 'viewer' : myRole

  const topbarActions = [
    {
      id: 'export',
      className: 'topbar-icon-btn topbar-export-btn',
      title: canExport ? 'Exporter' : 'Export désactivé pour ce partage',
      onClick: onOpenExport,
      disabled: !canExport,
      style: canExport ? undefined : STUB_BTN_STYLE,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
    },
    {
      id: 'tools',
      className: 'topbar-icon-btn',
      title: 'Outils',
      onClick: onOpenTools,
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      ),
    },
    {
      id: 'view',
      className: 'topbar-icon-btn',
      title: 'Vue',
      onClick: onOpenView,
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
    },

  ]

  // Seuls Export/Outils/Vue entrent dans le menu ⋯. Partager et Paramètres restent toujours visibles à droite, comme Kami.
  const hasTopbarOverflow = Number.isFinite(visibleTopbarActionLimit) && visibleTopbarActionLimit < topbarActions.length
  // 3 modes séparés :
  // - normal : actions visibles
  // - compact : actions dans ⋯, mais source + titre restent encore visibles
  // - ultra-compact : source + titre disparaissent aussi (géré par la classe CSS)
  const visibleTopbarActions = hasTopbarOverflow ? [] : topbarActions
  const overflowTopbarActions = hasTopbarOverflow ? topbarActions : []
  const renderTopbarAction = (action, inOverflow = false) => (
    <button
      key={action.id}
      className={`${action.className} ${inOverflow ? 'topbar-more-item' : ''}`}
      onClick={() => {
        action.onClick?.()
        if (inOverflow) setTopbarMoreOpen(false)
      }}
      disabled={action.disabled}
      style={action.style}
      title={action.title}
    >
      {action.icon}
    </button>
  )

  // Style Kami : quand le nom du PDF est tronqué, on peut "slider" le titre
  // gauche/droite pour voir le reste sans devoir renommer le fichier. Un clic
  // simple garde le comportement actuel (renommer), mais un drag horizontal
  // scrolle seulement le texte et bloque le clic de renommage.
  const handleFileNamePointerDown = (e) => {
    const el = fileNameScrollRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    fileNameDragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    }
    el.setPointerCapture?.(e.pointerId)
  }

  const handleFileNamePointerMove = (e) => {
    const drag = fileNameDragRef.current
    const el = fileNameScrollRef.current
    if (!drag.active || !el) return

    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 3) drag.moved = true
    if (drag.moved) {
      el.scrollLeft = drag.scrollLeft - dx
      e.preventDefault()
    }
  }

  const handleFileNamePointerUp = (e) => {
    const drag = fileNameDragRef.current
    const el = fileNameScrollRef.current
    if (el && drag.pointerId != null) el.releasePointerCapture?.(drag.pointerId)
    fileNameDragRef.current = { ...drag, active: false, pointerId: null }
  }

  const handleFileNameClick = (e) => {
    if (fileNameDragRef.current.moved) {
      e.preventDefault()
      fileNameDragRef.current.moved = false
      return
    }
    startEditingName()
  }

  return (
    <div className={`editor-topbar ${hasTopbarOverflow ? 'topbar-save-compact topbar-kami-compact' : ''} ${ultraCompactTopbar ? 'topbar-ultra-compact' : ''}`} ref={topbarRef}>
      {/* ┌───────────────────────────────────────────────────────────────┐
          GAUCHE : Logo JacPDF → nom du fichier → indicateur de sauvegarde Drive
          └───────────────────────────────────────────────────────────────┘ */}
      <div className="topbar-left" ref={topbarLeftRef}>
        <button className="topbar-logo" onClick={onOpenHome}>
          <img src={JACPDF_LOGO} alt="" className="topbar-logo-img" draggable="false" />
          <span className="topbar-logo-text">Jac<span className="logo-green">PDF</span></span>
        </button>

        {/* Badge d'abonnement — remplace l'ancien badge « DEV ». Affiche le
            palier courant (Gratuit / Pro / Premium) à droite du logo et ouvre
            la modale d'abonnement au clic. Caché en mode compact comme avant. */}
        {!hasTopbarOverflow && !ultraCompactTopbar && (
          <PlanBadge className="topbar-dev-badge" />
        )}

        {/* Séparateur vertical entre le logo JacPDF et le badge de
            destination — même style `topbar-separator` que les autres
            barres verticales de la topbar. Conditionnel : on ne le rend
            que s'il y a effectivement une destination à montrer (sinon
            le DocumentSourceBadge retourne null et on aurait une barre
            qui flotte toute seule contre le logo). */}
        {documentSource && <div className="topbar-separator" aria-hidden="true" />}

        {/* Badge « source du document » — affiche d'où vient le PDF
            (Ordinateur ou Google Drive + dossier). Il reste visible même en
            mode compact Kami : seuls le badge DEV, le texte sauvegarde et les
            boutons partent. */}
        <DocumentSourceBadge
          source={documentSource}
          driveFolderName={driveFolderName}
        />

        {/* Slash de fil d'Ariane entre la destination et le nom du fichier
            (style Kami : « Google Drive / Mon dossier / Rapport.pdf »). */}
        {documentSource && (
          <span
            aria-hidden="true"
            className="topbar-breadcrumb-sep"
            style={ { color: '#4b5563', fontSize: 14, margin: '0 4px', userSelect: 'none' } }
          >/</span>
        )}

        {/* Nom du fichier (éditable inline) — déplacé du centre vers la gauche,
            juste après le badge de provenance. */}
        {editingName ? (
          <div className="topbar-filename topbar-filename-editing">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <input
              ref={nameInputRef}
              className="topbar-filename-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitName() }
                else if (e.key === 'Escape') { e.preventDefault(); cancelEditingName() }
              }}
            />
            <span className="topbar-filename-ext">.pdf</span>
          </div>
        ) : (
          <button
            className="topbar-filename"
            onClick={handleFileNameClick}
            onPointerDown={handleFileNamePointerDown}
            onPointerMove={handleFileNamePointerMove}
            onPointerUp={handleFileNamePointerUp}
            onPointerCancel={handleFileNamePointerUp}
            title="Renommer le fichier"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span className="topbar-filename-text" ref={fileNameScrollRef}>{fileName || 'Nouveau_Document.pdf'}</span>
          </button>
        )}

        {/* Phase 3.C — Badge du rôle restrictif (style Kami). Affiché à
            gauche de l'indicateur de sauvegarde quand le user courant est
            viewer ou commenter. Owner et editor (même partiellement restreint
            sur certains outils) ne voient pas ce badge — ils peuvent toujours
            éditer quelque chose, donc « Lecture seule » serait trompeur.
            Couleurs : jaune (warning-ish) pour viewer, bleu (info) pour
            commenter — différenciation visuelle nette des deux niveaux. */}
        {(classroomReadOnly || readOnlyBadgeRole === 'viewer' || readOnlyBadgeRole === 'commenter') && (
          <div
            className="topbar-role-badge"
            style={ {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              marginLeft: 4,
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.2,
              background: readOnlyBadgeRole === 'viewer' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(96, 165, 250, 0.15)',
              color: readOnlyBadgeRole === 'viewer' ? '#fbbf24' : '#60a5fa',
              border: readOnlyBadgeRole === 'viewer' ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(96, 165, 250, 0.3)',
              fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            } }
            title={readOnlyBadgeRole === 'viewer' ? 'Tu peux uniquement consulter ce document' : 'Tu peux ajouter des commentaires mais pas modifier le contenu'}
          >
            {readOnlyBadgeRole === 'viewer' ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            )}
            {readOnlyBadgeRole === 'viewer' ? 'Lecture seule' : 'Commentaires seulement'}
          </div>
        )}

        {/* Séparateur vertical entre le nom du fichier (et le badge de rôle
            s'il est affiché) et l'indicateur de sauvegarde — même style que
            les autres `topbar-separator` de la barre. */}
        <div className="topbar-separator topbar-save-separator" aria-hidden="true" />
        {/* Finition 1 — indicateur de sauvegarde Drive, **toujours rendu**
            (même si driveStatus est absent/disconnected). Le composant gère
            lui-même ce qu'il affiche selon l'état — cf. DriveSaveIndicator.jsx.
            TODO (Jacob expliquera plus tard) : faire que le composant rende
            quelque chose pour 'disconnected' au lieu de retourner null. */}
        <DriveSaveIndicator
          status={documentSource === 'jacpdfCloud' ? jacpdfCloudStatus : driveStatus}
          lastSavedAt={driveLastSavedAt}
          error={driveError}
          onSaveNow={onSaveNow}
          onOpenSaveSettings={onOpenSaveSettings}
          onReconnect={onReconnectDrive}
          documentSource={documentSource}
          driveConnected={driveConnected}
          onUploadToDrive={onUploadToDrive}
          jacpdfCloudConnected={jacpdfCloudConnected}
          onUploadToJacpdfCloud={onUploadToJacpdfCloud}
          compactLabel={hasTopbarOverflow || ultraCompactTopbar}
        />
      </div>

      {/* ┌───────────────────────────────────────────────────────────────┐
          DROITE : Undo / Redo → Export / Tools / View / Settings
          └───────────────────────────────────────────────────────────────┘ */}
      <div className="topbar-right" ref={topbarRightRef}>
        {/* Phase 4 — Avatars des users présents dans le doc.
            Placés à gauche de Annuler/Rétablir (style Google Docs / Figma :
            indicateur de collaborateurs en première position du groupe droite,
            avant les contrôles d'édition). */}
        <PresenceAvatars users={presentUsers} currentUserId={currentUserId} onClick={onToggleCollaborators} />
        {/* Séparateur vertical entre les avatars de présence et Annuler/Rétablir
            — même style que celui posé entre Annuler/Rétablir et le groupe
            Exporter/Outils/Vue/Partager/Paramètres pour aligner visuellement
            les trois zones de la topbar droite. */}
        <div className="topbar-separator" aria-hidden="true" />
        <div className="topbar-undo-redo">
          {/* Branchés sur l'historique (Lot 2) — grisés via STUB_BTN_STYLE quand canUndo/canRedo est false. */}
          <button className="topbar-icon-btn" title="Annuler (Cmd/Ctrl+Z)" onClick={undo} disabled={!canUndo} style={canUndo ? undefined : STUB_BTN_STYLE}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
          <button className="topbar-icon-btn" title="Rétablir (Cmd/Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} style={canRedo ? undefined : STUB_BTN_STYLE}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
            </svg>
          </button>
        </div>
        {/* Séparateur vertical entre Annuler/Rétablir et le groupe Exporter/Outils/Vue/Partager/Paramètres */}
        <div className="topbar-separator" aria-hidden="true" />
        <div className="topbar-right-group" ref={topbarMoreRef}>
          {/* Phase 3.C — gate canExport : owner et editor sans restrictions
              passent ; les viewers/commenters/editors sans permission 'export'
              voient le bouton grisé et inutilisable. */}
          {visibleTopbarActions.map(action => renderTopbarAction(action))}
          {overflowTopbarActions.length > 0 && (
            <>
              <button
                className={`topbar-icon-btn topbar-more-btn ${topbarMoreOpen ? 'active' : ''}`}
                onClick={() => setTopbarMoreOpen(o => !o)}
                title="Plus d’actions"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
              {topbarMoreOpen && (
                <div className="topbar-more-menu">
                  {overflowTopbarActions.map(action => renderTopbarAction(action, true))}
                </div>
              )}
            </>
          )}
        </div>
        <button
          className={`topbar-share-btn ${shareLocked && !classroomTurnIn ? 'is-locked' : ''}`}
          title={classroomTurnIn ? (classroomTurnInSubmitted ? 'Annuler la remise' : 'Remettre le devoir') : (shareLocked ? 'Partager (Premium)' : 'Partager')}
          onClick={() => {
            if (classroomTurnIn) {
              setClassroomTurnInOpen(true)
              return
            }
            // Verrou Premium : partage & collaboration avancés réservés à Premium.
            if (shareLocked) {
              openPremiumModal('sharing_collaboration')
              return
            }
            if (documentSource === 'local') {
              setLocalSharePromptOpen(true)
              return
            }
            onShare?.()
          }}
          disabled={classroomTurnIn ? classroomTurnInSubmitting : (!onShare && documentSource !== 'local')}
          style={(classroomTurnIn || onShare || documentSource === 'local') ? undefined : STUB_BTN_STYLE}
        >
          {classroomTurnIn ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          )}
          <span>{classroomTurnIn ? (classroomTurnInSubmitted ? 'Annuler' : 'Remettre') : 'Partager'}</span>
          {shareLocked && !classroomTurnIn && <PremiumBadge tier="premium" label="" />}
        </button>
        <button className="topbar-icon-btn topbar-settings-btn topbar-profile-btn" title="Paramètres" onClick={onOpenSettings}>
          {settingsAvatarUrl ? (
            <img
              src={settingsAvatarUrl}
              alt=""
              className="topbar-profile-img"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="topbar-profile-initial">{settingsAvatarInitial}</span>
          )}
        </button>
      </div>

      {classroomTurnInOpen && (
        <div className="local-share-upload-overlay" onClick={() => classroomTurnInSubmitting ? undefined : setClassroomTurnInOpen(false)}>
          <div
            className="local-share-upload-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={classroomTurnInSubmitted ? 'Annuler la remise' : 'Remettre le devoir'}
          >
            <button
              type="button"
              className="local-share-upload-close"
              onClick={() => setClassroomTurnInOpen(false)}
              aria-label="Fermer"
              disabled={classroomTurnInSubmitting}
            >
              ✕
            </button>

            <div className="local-share-upload-icon">{classroomTurnInSubmitted ? '↩️' : '📤'}</div>
            <h2>{classroomTurnInSubmitted ? 'Annuler la remise ?' : 'Remettre le devoir ?'}</h2>
            <p>
              {classroomTurnInSubmitted
                ? 'Le devoir repassera en mode édition. Tu pourras continuer à annoter puis le remettre à nouveau.'
                : 'Ce fichier sera remis dans JacPDF Classroom. Ton enseignant pourra voir le fichier et tes annotations.'}
            </p>

            <div className="local-share-upload-actions">
              <button
                type="button"
                className="local-share-upload-option local-share-upload-option-accent"
                onClick={async () => {
                  await onClassroomTurnIn?.()
                  setClassroomTurnInOpen(false)
                }}
                disabled={classroomTurnInSubmitting || !onClassroomTurnIn}
              >
                <span className="local-share-upload-option-icon">{classroomTurnInSubmitted ? '↩️' : '📤'}</span>
                <span>
                  <strong>
                    {classroomTurnInSubmitting
                      ? (classroomTurnInSubmitted ? 'Annulation…' : 'Remise…')
                      : (classroomTurnInSubmitted ? 'Annuler la remise' : 'Remettre')}
                  </strong>
                  <small>{classroomTurnInSubmitted ? 'Repasser ce fichier en édition' : 'Envoyer ce fichier dans Classroom'}</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {localSharePromptOpen && (
        <div className="local-share-upload-overlay" onClick={() => setLocalSharePromptOpen(false)}>
          <div
            className="local-share-upload-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Téléverser avant de partager"
          >
            <button
              type="button"
              className="local-share-upload-close"
              onClick={() => setLocalSharePromptOpen(false)}
              aria-label="Fermer"
            >
              ✕
            </button>

            <div className="local-share-upload-icon">☁️</div>
            <h2>Téléverser avant de partager</h2>
            <p>
              Ce PDF est encore sur ton ordinateur. Pour le partager, téléverse-le d’abord dans le cloud.
            </p>

            <div className="local-share-upload-actions">
              <button
                type="button"
                className="local-share-upload-option"
                onClick={() => {
                  setLocalSharePromptOpen(false)
                  onUploadToDrive?.()
                }}
                disabled={!onUploadToDrive}
              >
                <span className="local-share-upload-option-icon">📁</span>
                <span>
                  <strong>Google Drive</strong>
                  <small>{driveConnected ? 'Téléverser sur Drive' : 'Connecter puis téléverser'}</small>
                </span>
              </button>

              <button
                type="button"
                className="local-share-upload-option local-share-upload-option-accent"
                onClick={() => {
                  setLocalSharePromptOpen(false)
                  onUploadToJacpdfCloud?.()
                }}
                disabled={!onUploadToJacpdfCloud}
              >
                <span className="local-share-upload-option-icon">☁️</span>
                <span>
                  <strong>JacPDF Cloud</strong>
                  <small>{jacpdfCloudConnected ? 'Téléverser sur JacPDF Cloud' : 'Connecte-toi à JacPDF d’abord'}</small>
                </span>
              </button>
            </div>

            <div className="local-share-upload-hint">
              Après le téléversement, clique à nouveau sur Partager pour inviter des personnes.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}