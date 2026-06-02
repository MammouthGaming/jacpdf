import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import JacDocMenuBar from './JacDocMenuBar'
import JacdocPresenceAvatars from './cloud/JacdocPresenceAvatars'
import JacdocDocumentSourceBadge from './cloud/JacdocDocumentSourceBadge'
import { SAVE_STATE_LABELS } from '../pages/editor/editorHelpers'
import { PremiumBadge } from '@/shared/components/ui/PremiumLock'
import PlanBadge from '@/shared/components/ui/PlanBadge'
import './JacDocTopbar.css'

const JACDOC_LOGO = new URL('../../../../logo/JacDoc.svg', import.meta.url).href

// Topbar de l'éditeur JacDoc — calque Google Docs avec skin JacDoc.
// Composé de deux colonnes :
//   • gauche  : logo cliquable (retour), nom du doc éditable inline,
//               indicateur de sauvegarde, et menus (JacDocMenuBar) ;
//   • droite  : historique, commentaires, partage, profil (paramètres).
//
// Le parent (JacDocEditor) garde l'état (titre en édition, save state,
// commentsOpen, etc.) et passe tout via props. La barre est purement
// présentationnelle — aucune logique de persistance / focus / hook ici.
//
// La classe `is-collapsed` est portée par le wrapper externe quand le
// bouton flèche de la toolbar masque la barre (mode compact Docs).
export default function JacDocTopbar({
  collapsed = false,
  title,
  readOnly = false,
  // ── Source du document (badge à gauche du nom de fichier) ──────────
  // 'local' | 'drive' | 'jacdocCloud' | null — calque du badge JacPDF.
  // Quand null/undefined, aucun badge n'est rendu et le séparateur entre
  // le logo JacDoc et le titre reste le « • » historique.
  documentSource,
  driveFolderName,
  onBack,
  onRename,
  // Édition inline du titre — vient du hook useTitleEditing du parent.
  isEditingTitle,
  titleDraft,
  setTitleDraft,
  commitTitle,
  startEditTitle,
  onTitleKey,
  titleInputRef,
  // Indicateur de save (cloud ✓ / spinner / ⚠️).
  saveState = 'saved',
  collaborationConnected = false,
  collaborationUsers = 0,
  // Liste complète des utilisateurs présents (name + avatarUrl) pour
  // afficher les avatars empilés à gauche du bouton Historique, calque
  // Google Docs. Vient du hook useJacdocRealtime via JacDocInstance.
  presenceUsers = [],
  // Clic sur la pile d'avatars → ouvre la sidebar Collaborateurs (calque
  // JacPDF). Quand non fourni, la pile reste un simple indicateur visuel.
  onShowCollaborators,
  // Passthrough vers JacDocMenuBar.
  editor,
  zoom,
  setZoom,
  onOpenHeaderFooter,
  readingMode,
  onToggleReadingMode,
  showRuler,
  onToggleRuler,
  liveWordCount,
  onToggleLiveWordCount,
  exportOptions,
  // Actions colonne droite.
  onOpenHistory,
  // Verrou Pro de l'historique : quand true, le bouton Historique (et son
  // entrée dans le menu ⋯) affiche un badge Pro. Le clic reste géré par
  // onOpenHistory, qui ouvre le paywall en amont.
  historyLocked = false,
  commentsOpen = false,
  onToggleComments,
  // Verrou Premium « Partage & collaboration avancés » : quand true, les
  // boutons Commentaires et Partager (topbar + menu ⋯) affichent un badge
  // Premium. Le clic reste géré par onToggleComments / onShare, qui ouvrent
  // le paywall en amont (cf. JacDocEditor).
  commentsLocked = false,
  shareLocked = false,
  onShare,
  onOpenSettings,
  // Menu de sauvegarde (popover style JacPDF). Tous optionnels :
  //  - onSaveNow         : bypass le debounce auto-save (sinon bouton disabled).
  //  - onOpenSaveSettings: ouvre l'onglet « Sauvegarde » des paramètres.
  onSaveNow,
  onOpenSaveSettings,
  // Profil — affiché à la place de l'engrenage classique.
  avatarUrl,
  avatarInitial = 'U',
  displayName = 'Utilisateur',
}) {
  // ── Badge d'abonnement (remplace l'ancien badge « DEV ») ───────────
  // PlanBadge est autonome : il lit le palier courant via usePremium() et
  // s'affiche à droite du logo. Plus de lecture de session ni de prop
  // drilling ici.

  // ── Menu de sauvegarde (popover style JacPDF) ─────────────────────
  // L'indicateur « Sauvegardé » devient un bouton qui ouvre un popover :
  //   ligne de statut (avec « il y a X min ») + « Sauvegarder maintenant »
  //   + « Paramètres de sauvegarde ». Mêmes patterns de fermeture que JacPDF
  //   (clic extérieur, Escape) et même auto-refresh 30 s pour l'horodatage.
  const saveMenuRef = useRef(null)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [, forceRelativeRefresh] = useState(0)

  // Mémorise l'horodatage du dernier save réussi à chaque transition vers
  // 'saved'. C'est notre source de vérité pour « Dernière sauvegarde : … ».
  useEffect(() => {
    if (saveState === 'saved') setLastSavedAt(Date.now())
  }, [saveState])

  // Fermeture du menu : clic extérieur OU touche Escape (calque JacPDF).
  useEffect(() => {
    if (!saveMenuOpen) return
    const onDown = (e) => {
      if (!saveMenuRef.current?.contains(e.target)) setSaveMenuOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setSaveMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [saveMenuOpen])

  // Rafraîchit le libellé « il y a X min » toutes les 30 s tant qu'on a un
  // timestamp à afficher. Inutile d'aller plus vite : le menu n'affiche
  // pas une horloge à la seconde.
  useEffect(() => {
    if (!lastSavedAt) return
    const t = setInterval(() => forceRelativeRefresh((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [lastSavedAt])

  // ── Responsive (calque JacPDF) ────────────────────────────────────
  // Mesure la VRAIE largeur de la topbar via ResizeObserver plutôt que
  // d'utiliser des breakpoints fixes : la place occupée par le titre, le
  // badge de source, la pile de présence, le badge DEV varie selon le
  // doc. Trois modes, exactement comme JacPDF :
  //   1. Normal           : tout visible.
  //   2. Compact (Kami)   : titre tronqué OU actions ne rentrent plus →
  //                         le texte « Sauvegardé » se cache (icône seule)
  //                         et Historique + Commentaires passent derrière ⋯.
  //                         Partager + Profil restent visibles.
  //   3. Ultra-compact    : largeur ≤ 560 px → on cache aussi le texte
  //                         « JacDoc », le badge DEV, le badge de source,
  //                         le fil d'Ariane, le nom du document et le
  //                         badge « Lecture seule ».
  const topbarRef = useRef(null)
  const topbarLeftRef = useRef(null)
  const topbarRightRef = useRef(null)
  const topbarMoreRef = useRef(null)
  const [topbarMoreOpen, setTopbarMoreOpen] = useState(false)
  const [kamiCompactTopbar, setKamiCompactTopbar] = useState(false)
  const [ultraCompactTopbar, setUltraCompactTopbar] = useState(false)
  // Étape 2 de dégradation : on cache UNIQUEMENT le mot « Sauvegardé »
  // (l'icône cloud reste) quand le bouton Historique commence à serrer
  // le texte de l'indicateur de save.
  const [tightSaveLabel, setTightSaveLabel] = useState(false)
  // Étape 3 de dégradation : une fois le texte caché, si Historique
  // arrive aussi sur l'ICÔNE de save, on retire le badge DEV + le badge
  // de source (et leurs séparateurs). Ça libère ~120 px côté gauche
  // avant de devoir collapser les actions sous ⋯.
  const [hideMetaBadges, setHideMetaBadges] = useState(false)
  // Snapshot des derniers états compacts pour la cascade.
  const compactStateRef = useRef({ ultra: false, tight: false, hideMeta: false, kami: false })
  // Seuils de bascule (en px de largeur de fenêtre) pour CHAQUE étape.
  //
  // Astuce clé pour la symétrie HIDE ↔ SHOW :
  //   On ne met à jour le seuil d'une étape que pendant qu'on est dans
  //   l'état où cette étape va se déclencher (donc avec les éléments de
  //   cette étape encore VISIBLES). Le seuil = largeur que devrait avoir
  //   la fenêtre pour que la topbar JUSTE rentre dans son état courant
  //   (saveGap = 24).
  //
  // Comme cette mesure est faite avec les bons éléments visibles, le
  // seuil ne dépend QUE de la fenêtre — plus de boucle de rétroaction.
  // Résultat : hide ET show se déclenchent à la MÊME largeur de
  // fenêtre. Symétrie parfaite, zero flicker.
  const thresholdsRef = useRef({ tight: 0, hideMeta: 0, kami: 0 })

  useLayoutEffect(() => {
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const topbar = topbarRef.current
        const left = topbarLeftRef.current
        const right = topbarRightRef.current
        if (!topbar || !left || !right) return

        const styles = window.getComputedStyle(topbar)
        const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)

        // Largeur réelle du contenu de la brand-row (logo + badges + titre
        // + save) — sans le `<JacDocMenuBar>` rangé sous, on ne mesure que
        // la ligne du haut.
        const leftRow = left.querySelector('.jacdoc-editor-brand-row') || left
        const leftChildren = Array.from(leftRow.children)
        const leftGap = parseFloat(window.getComputedStyle(leftRow).columnGap || window.getComputedStyle(leftRow).gap) || 0
        const leftW = leftChildren.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
          + Math.max(0, leftChildren.length - 1) * leftGap

        const rightW = right.getBoundingClientRect().width

        // Le nom du document a `text-overflow: ellipsis` quand son
        // scrollWidth dépasse son clientWidth — signal que la place se
        // resserre (calque JacPDF qui regarde `.topbar-filename`).
        const docNameEl = left.querySelector('.jacdoc-editor-doc-name')
        const docTruncated = docNameEl
          ? docNameEl.scrollWidth > docNameEl.clientWidth + 1
          : false

        const available = topbar.clientWidth - padX
        const overflow = leftW + rightW + 16 > available

        // Écart réel entre la droite de l'indicateur de save et la gauche
        // de la colonne de droite — c'est CE chiffre qui dit « le bouton
        // Historique arrive sur le texte Sauvegardé ». On ne se fie pas à
        // un breakpoint en px de la fenêtre : ça dépend du nom du doc, du
        // badge de source, de la pile de présence, du badge DEV, etc.
        const saveEl = left.querySelector('.jacdoc-editor-save-indicator')
        const saveRect = saveEl?.getBoundingClientRect()
        const rightRect = right.getBoundingClientRect()
        const saveGap = saveRect ? rightRect.left - saveRect.right : Infinity

        const nextUltra = topbar.clientWidth <= 560

        const wasTight = compactStateRef.current.tight
        const wasHideMeta = compactStateRef.current.hideMeta
        const wasKami = compactStateRef.current.kami
        // Largeur de la topbar = largeur de la fenêtre, INVARIANTE par
        // rapport à ce qu'on cache à l'intérieur.
        const W = topbar.clientWidth

        // « Largeur nécessaire » : la largeur de topbar à laquelle on
        // bascule vers l'état plus compact suivant. C'est notre seuil.
        //
        // Pourquoi PAS saveGap ? Parce que doc-name a `flex: 0 1 auto`
        // + `min-width: 0` : il absorbe TOUTE la pression dès que la
        // brand-row dépasse topbar-left. Du coup saveGap reste pinné à
        // 16 px (= grid-column-gap) PENDANT QUE LE TITRE RÉTRÉCIT. Si
        // on attend que saveGap < 24, on rate le bon moment et le titre
        // s'écrase AVANT que « Sauvegardé » se cache — inverse de ce que
        // veut l'utilisateur.
        //
        // À la place, on calcule directement : brand-row a besoin de
        // leftW px de contenu ; topbar-right occupe rightW ; entre les
        // deux il y a padX (32 px) + grid-column-gap (16 px) = 48 px de
        // chrome incompressible. À W = leftW + rightW + 48, brand-row
        // est JUSTE au taquet et le titre s'apprête à être tronqué. On
        // veut bouger AVANT ça, donc + TIGHT_BUFFER px de marge visuelle.
        // Résultat : « Sauvegardé » disparaît juste avant que le titre
        // ne commence à se tronquer. Et puisqu'on calcule le seuil quand
        // les bons éléments sont visibles, hide/show restent symétriques.
        //
        // TIGHT_BUFFER règle à quel point Historique doit être proche des
        // éléments de gauche AVANT que la prochaine étape de dégradation
        // se déclenche. Le moment où saveGap atteint 16 px correspond au
        // moment exact où brand-row remplit toute la colonne de gauche
        // (= moment où le titre VA commencer à se tronquer). En mettant
        // TIGHT_BUFFER = 0, on déclenche pile à cet instant : Historique
        // est physiquement collé à « Sauvegardé » avant qu'il ne se cache,
        // et le titre n'a pas le temps de se tronquer parce que la même
        // frame masque le label (⋯légère économie de ~70 px). À chaque
        // étape suivante, même logique : Historique arrive sur les badges,
        // puis sur l'icône, etc.
        const TIGHT_BUFFER = 0
        const neededW = leftW + rightW + padX + 16 + TIGHT_BUFFER

        // On met à jour le seuil de l'étape qui va se déclencher PROCHE,
        // càd celle dont les éléments sont encore visibles maintenant.
        // Cf. commentaire de `thresholdsRef` : c'est le truc qui donne
        // une symétrie hide/show sans flicker.
        if (!nextUltra) {
          if (!wasTight && !wasHideMeta && !wasKami) {
            thresholdsRef.current.tight = neededW
          } else if (wasTight && !wasHideMeta && !wasKami) {
            thresholdsRef.current.hideMeta = neededW
          } else if (wasHideMeta && !wasKami) {
            thresholdsRef.current.kami = neededW
          }
        }

        // Application en cascade. Chaque étape n'est active que si la
        // précédente l'est aussi. Seuil non encore mesuré (== 0) → on
        // garde simplement l'état courant (le seuil sera renseigné au
        // prochain cycle de mesure quand l'état approprié sera atteint).
        let nextTight, nextHideMeta, nextKami
        if (nextUltra) {
          nextTight = true
          nextHideMeta = true
          nextKami = false
        } else {
          nextTight = thresholdsRef.current.tight > 0
            ? W < thresholdsRef.current.tight
            : wasTight
          nextHideMeta = nextTight && (thresholdsRef.current.hideMeta > 0
            ? W < thresholdsRef.current.hideMeta
            : wasHideMeta)
          nextKami = nextHideMeta && (thresholdsRef.current.kami > 0
            ? W < thresholdsRef.current.kami
            : wasKami)
        }

        compactStateRef.current = { ultra: nextUltra, tight: nextTight, hideMeta: nextHideMeta, kami: nextKami }
        setUltraCompactTopbar((prev) => (prev === nextUltra ? prev : nextUltra))
        setTightSaveLabel((prev) => (prev === nextTight ? prev : nextTight))
        setHideMetaBadges((prev) => (prev === nextHideMeta ? prev : nextHideMeta))
        setKamiCompactTopbar((prev) => (prev === nextKami ? prev : nextKami))
        if (!nextUltra && !nextKami) setTopbarMoreOpen(false)
      })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro) {
      if (topbarRef.current) ro.observe(topbarRef.current)
      if (topbarLeftRef.current) ro.observe(topbarLeftRef.current)
      if (topbarRightRef.current) ro.observe(topbarRightRef.current)
    }
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [title, documentSource, driveFolderName, readOnly, presenceUsers?.length, saveState])

  // Fermeture du menu ⋯ : clic extérieur OU Escape (calque JacPDF).
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

  // Dérivés lus dans le JSX. compactSaveLabel masque le texte de la
  // sauvegarde (icône seule) ; actionsCollapsed bascule Historique +
  // Commentaires derrière le bouton ⋯.
  const compactSaveLabel = ultraCompactTopbar || kamiCompactTopbar || tightSaveLabel
  const actionsCollapsed = ultraCompactTopbar || kamiCompactTopbar

  const formatRelativeSave = (ts) => {
    if (!ts) return null
    const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
    if (seconds < 5) return "à l'instant"
    if (seconds < 60) return `il y a ${seconds} s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `il y a ${hours} h`
    const days = Math.floor(hours / 24)
    return `il y a ${days} j`
  }

  // Ligne de statut principale du menu. Mêmes branches que JacPDF.
  let saveStatusLine
  if (saveState === 'saving') {
    saveStatusLine = 'Sauvegarde en cours…'
  } else if (saveState === 'error') {
    saveStatusLine = 'Échec de la dernière sauvegarde'
  } else if (lastSavedAt) {
    saveStatusLine = `Dernière sauvegarde : ${formatRelativeSave(lastSavedAt)}`
  } else {
    saveStatusLine = 'Tous les changements enregistrés sur cet appareil'
  }

  const canSaveNow = typeof onSaveNow === 'function' && saveState !== 'saving'

  return (
    <div
      ref={topbarRef}
      className={
        'jacdoc-editor-topbar'
        + (collapsed ? ' is-collapsed' : '')
        + (ultraCompactTopbar ? ' is-ultra-compact' : '')
        + (kamiCompactTopbar ? ' is-kami-compact' : '')
        + (hideMetaBadges ? ' is-hide-meta' : '')
      }
    >
      <div className="jacdoc-editor-topbar-left" ref={topbarLeftRef}>
        <div className="jacdoc-editor-brand-row">
          <button
            type="button"
            className="jacdoc-editor-brand"
            onClick={onBack}
            disabled={typeof onBack !== 'function'}
            title={typeof onBack === 'function' ? "Retour à l'accueil JacDoc" : 'JacDoc'}
            aria-label={typeof onBack === 'function' ? "Retour à l'accueil JacDoc" : 'JacDoc'}
          >
            <span className="jacdoc-editor-brand-icon" aria-hidden="true">
              <img src={JACDOC_LOGO} alt="" draggable="false" />
            </span>
            <span className="jacdoc-editor-brand-text">
              Jac<span className="jacdoc-editor-brand-accent">Doc</span>
            </span>
          </button>
          {/* Badge d'abonnement — remplace l'ancien badge « DEV ». Affiche le
              palier courant (Gratuit / Pro / Premium) à droite du logo et
              ouvre la modale d'abonnement au clic. On garde la classe
              jacdoc-editor-dev-badge pour réutiliser le masquage responsive. */}
          <PlanBadge className="jacdoc-editor-dev-badge" />
          {/* Séparateur vertical entre le logo JacDoc et le badge de
              source — même esprit que `.topbar-separator` de JacPDF.
              Conditionnel : on ne le rend que s'il y a une destination à
              afficher, sinon on aurait une barre flottante toute seule. */}
          {documentSource && (
            <span className="jacdoc-editor-topbar-vsep" aria-hidden="true" />
          )}
          {/* Badge « source du document » — affiche d'où vient le doc
              (Ordinateur / Google Drive / JacDoc Cloud), calque exact du
              DocumentSourceBadge de JacPDF. Reste à gauche du nom du
              fichier comme dans Google Docs / Kami. */}
          <JacdocDocumentSourceBadge
            source={documentSource}
            driveFolderName={driveFolderName}
          />
          {title !== undefined && (
            <>
              {/* Quand on a un badge de source, on suit le pattern fil
                  d'Ariane de JacPDF (« JacDoc Cloud / Mon doc »). Sinon
                  on garde le séparateur « • » historique pour ne pas
                  changer le rendu des docs qui n'ont pas encore de
                  source bien définie. */}
              {documentSource ? (
                <span className="jacdoc-editor-breadcrumb-sep" aria-hidden="true">/</span>
              ) : (
                <span className="jacdoc-editor-doc-sep" aria-hidden="true">•</span>
              )}
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  className="jacdoc-editor-doc-name-input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={onTitleKey}
                  maxLength={200}
                  placeholder="Document sans titre"
                  aria-label="Nom du document"
                />
              ) : (
                <button
                  type="button"
                  className="jacdoc-editor-doc-name"
                  onClick={startEditTitle}
                  disabled={readOnly || typeof onRename !== 'function'}
                  title={
                    readOnly || typeof onRename !== 'function'
                      ? (title || 'Document sans titre')
                      : 'Renommer le document'
                  }
                >
                  {title || 'Document sans titre'}
                </button>
              )}
              {/* Indicateur de sauvegarde style JacPDF : icône + label.
                  « Sauvegardé » par défaut, « Sauvegarde… » pendant l'écriture,
                  « Erreur » en cas d'échec. */}
              {/* Indicateur de sauvegarde cliquable — ouvre un popover
                  calque JacPDF (statut + Sauvegarder maintenant + Paramètres). */}
              <div className="jacdoc-save-menu-wrapper" ref={saveMenuRef}>
                <button
                  type="button"
                  className={
                    'jacdoc-editor-save-indicator is-' + saveState
                    + (saveMenuOpen ? ' is-open' : '')
                    + (compactSaveLabel ? ' is-compact-label' : '')
                  }
                  title={SAVE_STATE_LABELS[saveState] || SAVE_STATE_LABELS.saved}
                  aria-label={SAVE_STATE_LABELS[saveState] || SAVE_STATE_LABELS.saved}
                  aria-haspopup="menu"
                  aria-expanded={saveMenuOpen}
                  onClick={() => setSaveMenuOpen((v) => !v)}
                >
                  {saveState === 'saving' ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      <span className="jacdoc-editor-save-label">Sauvegarde…</span>
                    </>
                  ) : saveState === 'error' ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <circle cx="12" cy="16" r="0.6" fill="currentColor"/>
                      </svg>
                      <span className="jacdoc-editor-save-label">Erreur</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                        <polyline points="9 14 11 16 15 12"/>
                      </svg>
                      <span className="jacdoc-editor-save-label">Sauvegardé</span>
                    </>
                  )}
                </button>
                {saveMenuOpen && (
                  <div className="jacdoc-save-menu" role="menu">
                    <div className={'jacdoc-save-menu-status is-' + saveState}>
                      {saveStatusLine}
                    </div>
                    <button
                      type="button"
                      className="jacdoc-save-menu-action is-primary"
                      disabled={!canSaveNow}
                      onClick={() => { if (canSaveNow) onSaveNow() }}
                      role="menuitem"
                    >
                      {saveState === 'saving' ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
                    </button>
                    <button
                      type="button"
                      className="jacdoc-save-menu-action is-secondary"
                      onClick={() => { setSaveMenuOpen(false); onOpenSaveSettings?.() }}
                      disabled={typeof onOpenSaveSettings !== 'function'}
                      role="menuitem"
                    >
                      Paramètres de sauvegarde
                    </button>
                  </div>
                )}
              </div>
              {readOnly && (
                <span
                  className="jacdoc-editor-readonly-pill"
                  title="Ce document est partagé en lecture seule"
                >
                  Lecture seule
                </span>
              )}
            </>
          )}
        </div>
        {!readOnly && (
          <JacDocMenuBar
            editor={editor}
            title={title}
            zoom={zoom}
            setZoom={setZoom}
            onRename={onRename}
            onOpenHeaderFooter={onOpenHeaderFooter}
            readingMode={readingMode}
            onToggleReadingMode={onToggleReadingMode}
            showRuler={showRuler}
            onToggleRuler={onToggleRuler}
            liveWordCount={liveWordCount}
            onToggleLiveWordCount={onToggleLiveWordCount}
            exportOptions={exportOptions}
          />
        )}
      </div>

      <div className="jacdoc-editor-topbar-right" ref={topbarRightRef}>
        {/* Avatars des autres collaborateurs (présence Realtime).
            Placés juste à gauche du bouton Historique comme Google Docs.
            Cliquables : ouvrent la sidebar Collaborateurs calque JacPDF. */}
        {presenceUsers.length > 0 && (
          <JacdocPresenceAvatars
            users={presenceUsers}
            onClick={typeof onShowCollaborators === 'function' ? onShowCollaborators : undefined}
          />
        )}
        {!actionsCollapsed && (
          <button
            type="button"
            className={'jacdoc-editor-history-btn' + (historyLocked ? ' is-locked' : '')}
            title={historyLocked ? 'Historique des versions (Pro)' : 'Historique des versions'}
            aria-label={historyLocked ? 'Historique des versions (fonctionnalité Pro)' : 'Historique des versions'}
            onClick={onOpenHistory}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
              <polyline points="3 3 3 8 8 8"/>
              <line x1="12" y1="7" x2="12" y2="12"/>
              <line x1="12" y1="12" x2="15" y2="15"/>
            </svg>
            {historyLocked && <PremiumBadge tier="pro" label="" />}
          </button>
        )}
        {!actionsCollapsed && (
          <button
            type="button"
            className={'jacdoc-editor-comments-btn' + (commentsOpen ? ' is-active' : '') + (commentsLocked ? ' is-locked' : '')}
            title={commentsLocked ? 'Commentaires (Premium)' : 'Commentaires'}
            aria-label={commentsLocked ? 'Commentaires (fonctionnalité Premium)' : 'Commentaires'}
            aria-pressed={commentsOpen}
            onClick={onToggleComments}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {commentsLocked && <PremiumBadge tier="premium" label="" />}
          </button>
        )}
        {actionsCollapsed && (
          <div className="jacdoc-editor-topbar-more" ref={topbarMoreRef}>
            <button
              type="button"
              className={'jacdoc-editor-more-btn' + (topbarMoreOpen ? ' is-open' : '')}
              title="Plus d'actions"
              aria-label="Plus d'actions"
              aria-haspopup="menu"
              aria-expanded={topbarMoreOpen}
              onClick={() => setTopbarMoreOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
              </svg>
            </button>
            {topbarMoreOpen && (
              <div className="jacdoc-editor-more-menu" role="menu">
                <button
                  type="button"
                  className="jacdoc-editor-more-item"
                  onClick={() => { setTopbarMoreOpen(false); onOpenHistory?.() }}
                  role="menuitem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
                    <polyline points="3 3 3 8 8 8"/>
                    <line x1="12" y1="7" x2="12" y2="12"/>
                    <line x1="12" y1="12" x2="15" y2="15"/>
                  </svg>
                  <span>Historique</span>
                  {historyLocked && <PremiumBadge tier="pro" label="" />}
                </button>
                <button
                  type="button"
                  className={'jacdoc-editor-more-item' + (commentsOpen ? ' is-active' : '')}
                  onClick={() => { setTopbarMoreOpen(false); onToggleComments?.() }}
                  role="menuitem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>Commentaires</span>
                  {commentsLocked && <PremiumBadge tier="premium" label="" />}
                </button>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={'jacdoc-editor-share-btn' + (shareLocked ? ' is-locked' : '')}
          title={shareLocked ? 'Partager le document (Premium)' : (readOnly ? 'Voir ton accès au document' : 'Partager le document')}
          aria-label={shareLocked ? 'Partager (fonctionnalité Premium)' : (readOnly ? 'Voir l’accès' : 'Partager')}
          onClick={onShare || (() => window.dispatchEvent(new CustomEvent('jacsuite:openJacDocShare')))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span>{readOnly ? 'Accès' : 'Partager'}</span>
          {shareLocked && <PremiumBadge tier="premium" label="" />}
        </button>
        <button
          type="button"
          className="jacdoc-editor-settings-btn jacdoc-editor-profile-btn"
          title={'Paramètres — ' + displayName}
          aria-label="Paramètres"
          onClick={onOpenSettings}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="jacdoc-editor-profile-img"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <span className="jacdoc-editor-profile-initial">{avatarInitial}</span>
          )}
        </button>
      </div>
    </div>
  )
}