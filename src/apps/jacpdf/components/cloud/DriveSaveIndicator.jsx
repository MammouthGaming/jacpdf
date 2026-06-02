// Finition 1 — Menu de sauvegarde dans la TopBar.
// Bouton icône (cloud-check) cliquable qui ouvre un popover avec :
//   1. Le statut courant + horodatage relatif (« il y a X min »).
//   2. Un bouton « Sauvegarder maintenant » qui bypass le debounce auto-save.
//   3. Un bouton « Paramètres de sauvegarde » (placeholder, branche la future
//      Finition 2 : onglet « Sauvegarde » dans FullSettingsModal).
//
// Cas particulier : si status === 'expired', le clic sur l'icône bypass le
// menu et déclenche directement la reconnexion Drive (raccourci pour le cas
// le plus urgent).

import { useEffect, useRef, useState } from 'react'
import './DriveSaveIndicator.css'

const GOOGLE_DRIVE_LOGO = new URL('../../../../../logo/Google Drive.svg', import.meta.url).href
const JACCLOUD_LOGO = new URL('../../../../../logo/JacCloud.svg', import.meta.url).href

// Refresh du « il y a X min » toutes les 30 s — pas besoin d'aller plus vite,
// le menu n'a pas vocation à montrer une horloge à la seconde.
const RELATIVE_REFRESH_MS = 30_000

function formatRelative(ts) {
  if (!ts) return null
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 5)   return "à l'instant"
  if (seconds < 60)  return `il y a ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)  return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}

// Mappe le status métier (renvoyé par useGoogleDrive / EditorInstance) sur la
// variante visuelle utilisée par les classes CSS (.dsi-btn-<variant>).
function statusToVariant(status) {
  switch (status) {
    case 'saving':  return 'saving'
    case 'saved':   return 'saved'
    case 'dirty':   return 'dirty'
    case 'error':   return 'error'
    case 'expired': return 'expired'
    default:        return 'idle'
  }
}

function CloudCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>
      <polyline points="9 15 12 18 17 13"/>
    </svg>
  )
}

// Icône cloud-upload utilisée quand le fichier est local — invite explicite
// au téléversement (vs. CloudCheckIcon qui suggère un état déjà sauvegardé).
function CloudUploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>
      <polyline points="16 16 12 12 8 16"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
    </svg>
  )
}

// Logos cloud officiels depuis le dossier racine /logo.
function GoogleDriveIcon() {
  return (
    <img
      className="dsi-cloud-logo dsi-cloud-logo-drive"
      src={GOOGLE_DRIVE_LOGO}
      alt=""
      draggable="false"
      aria-hidden="true"
    />
  )
}

function JacpdfCloudIcon() {
  return (
    <img
      className="dsi-cloud-logo dsi-cloud-logo-jaccloud"
      src={JACCLOUD_LOGO}
      alt=""
      draggable="false"
      aria-hidden="true"
    />
  )
}

export default function DriveSaveIndicator({
  status,
  lastSavedAt,
  error,
  onSaveNow,
  onOpenSaveSettings,
  onReconnect,
  // ── Téléversement local → cloud ──
  // Quand documentSource === 'local', le menu affiche des actions de
  // téléversement (Google Drive / JacPDF Cloud) au lieu du statut de sauvegarde.
  // - driveConnected         : true si une session Google Drive est active.
  // - onUploadToDrive        : callback déclenchant la connexion (si besoin) puis
  //                            le 1er upload du fichier local vers Drive.
  // - jacpdfCloudConnected   : true si l'utilisateur est connecté à JacPDF
  //                            (session Supabase active).
  // - onUploadToJacpdfCloud  : callback déclenchant la connexion (si besoin)
  //                            puis le 1er upload du fichier local vers JacPDF Cloud.
  documentSource,
  driveConnected,
  onUploadToDrive,
  jacpdfCloudConnected,
  onUploadToJacpdfCloud,
  // Quand true : garde l'icône cloud visible, mais cache le texte inline
  // (« Sauvegardé », « Non sauvegardé », etc.) pour libérer de l'espace dans
  // la topbar responsive.
  compactLabel = false,
}) {
  const [open, setOpen] = useState(false)
  // Force re-render pour rafraîchir l'horodatage relatif sans changer de prop.
  const [, force] = useState(0)
  const wrapperRef = useRef(null)

  // Auto-refresh du « il y a X min » tant qu'on a un timestamp à afficher.
  useEffect(() => {
    if (!lastSavedAt) return
    const t = setInterval(() => force((n) => n + 1), RELATIVE_REFRESH_MS)
    return () => clearInterval(t)
  }, [lastSavedAt])

  // Fermeture du menu : clic extérieur OU touche Escape.
  useEffect(() => {
    if (!open) return
    const onDocDown = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Pour les fichiers LOCAUX : on rend toujours le bouton (même si Drive
  // déconnecté) pour proposer le téléversement vers Google Drive / JacPDF Cloud.
  // Pour les fichiers Drive : on garde le comportement existant (rien si
  // pas de session — l'utilisateur travaille hors-ligne).
  const isLocal = documentSource === 'local'
  if (!isLocal && (status === 'disconnected' || !status)) return null

  const variant = isLocal ? 'idle' : statusToVariant(status)

  // Texte principal du menu, dérivé du statut.
  // Note : le statut 'saved' ne dure que 1.6 s avant de revenir à 'idle'
  // (cf. setTimeout dans EditorInstance). On utilise donc lastSavedAt comme
  // source de vérité pour « Dernière sauvegarde » : tant qu'un save a réussi
  // dans cette session, on l'affiche peu importe le statut courant. Sinon le
  // menu retombait sur « Aucune sauvegarde » 1.6 s après un save réussi, ce
  // qui faisait croire que la sauvegarde n'avait pas eu lieu.
  let statusLine
  if (status === 'saving') {
    statusLine = 'Sauvegarde en cours…'
  } else if (status === 'expired') {
    statusLine = 'Session Google Drive expirée — reconnecte-toi'
  } else if (status === 'error') {
    statusLine = `Échec de la dernière sauvegarde${error?.message ? ' : ' + error.message : ''}`
  } else if (status === 'dirty') {
    statusLine = lastSavedAt
      ? `Modifications non sauvegardées — dernière sauvegarde ${formatRelative(lastSavedAt)}`
      : 'Modifications non sauvegardées'
  } else if (lastSavedAt) {
    // Couvre 'saved' (juste après un save réussi) ET 'idle' (1.6 s plus tard)
    // tant qu'on a une preuve d'un save réussi dans cette session.
    statusLine = `Dernière sauvegarde : ${formatRelative(lastSavedAt)}`
  } else {
    statusLine = 'Aucune sauvegarde pour ce document'
  }

  // Libellé court affiché à droite de l'icône dans la topbar (mode non-local).
  // Le statut visuel est porté par la couleur de l'icône + ce texte ; c'est ce
  // qui remplace les anciennes pastilles colorées (.dsi-dot-*).
  let buttonLabel
  if (status === 'saving')        buttonLabel = 'Sauvegarde en cours…'
  else if (status === 'dirty')    buttonLabel = 'Non sauvegardé'
  else if (status === 'error')    buttonLabel = 'Erreur de sauvegarde'
  else if (status === 'expired')  buttonLabel = 'Session expirée'
  else                            buttonLabel = 'Sauvegardé'

  // Conditions d'activation du bouton « Sauvegarder maintenant » :
  //  - une fonction de save est fournie
  //  - on n'est pas déjà en train de sauvegarder
  //  - la session n'est pas expirée
  const canSaveNow =
    typeof onSaveNow === 'function' &&
    status !== 'saving' &&
    status !== 'expired'

  const handleIconClick = () => {
    // Raccourci UX : sur token expiré, on saute le menu et on file directement
    // au flow de re-login Google.
    if (status === 'expired' && onReconnect) {
      onReconnect()
      return
    }
    setOpen((v) => !v)
  }

  const handleSaveNow = () => {
    if (!canSaveNow) return
    onSaveNow()
    // On laisse le menu ouvert volontairement : l'user voit le statut basculer
    // vers « Sauvegarde en cours… » puis « Dernière sauvegarde : à l'instant ».
  }

  const handleOpenSettings = () => {
    setOpen(false)
    onOpenSaveSettings?.()
  }

  return (
    <div className="dsi-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={`dsi-btn dsi-btn-${variant} ${open ? 'dsi-btn-open' : ''} ${compactLabel ? 'dsi-btn-compact' : ''}`}
        aria-label={isLocal ? 'Téléverser sur le cloud' : 'Menu de sauvegarde'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleIconClick}
        title={isLocal ? 'Téléverser sur le cloud' : 'Sauvegarde'}
      >
        {isLocal ? <CloudUploadIcon /> : <CloudCheckIcon />}
        {!isLocal && <span className="dsi-btn-label">{buttonLabel}</span>}
      </button>

      {open && isLocal && (
        // Fichier local — propose le téléversement vers les services cloud.
        // Google Drive et JacPDF Cloud sont les deux destinations actives.
        <div className="dsi-menu" role="menu">
          <div className="dsi-menu-status dsi-menu-status-idle">
            Ce document est local. Téléverse-le sur :
          </div>

          <button
            type="button"
            className="dsi-menu-action dsi-menu-action-primary dsi-menu-action-cloud"
            onClick={() => { setOpen(false); onUploadToDrive?.() }}
            disabled={typeof onUploadToDrive !== 'function'}
            role="menuitem"
          >
            <GoogleDriveIcon />
            <span>{driveConnected ? 'Téléverser sur Google Drive' : 'Connecter Google Drive et téléverser'}</span>
          </button>

          <button
            type="button"
            className="dsi-menu-action dsi-menu-action-secondary dsi-menu-action-cloud"
            onClick={() => { setOpen(false); onUploadToJacpdfCloud?.() }}
            disabled={typeof onUploadToJacpdfCloud !== 'function'}
            role="menuitem"
          >
            <JacpdfCloudIcon />
            <span>{jacpdfCloudConnected ? 'Téléverser sur JacPDF Cloud' : 'Connecter JacPDF Cloud et téléverser'}</span>
          </button>
        </div>
      )}

      {open && !isLocal && (
        <div className="dsi-menu" role="menu">
          <div className={`dsi-menu-status dsi-menu-status-${variant}`}>
            {statusLine}
          </div>

          <button
            type="button"
            className="dsi-menu-action dsi-menu-action-primary"
            disabled={!canSaveNow}
            onClick={handleSaveNow}
            role="menuitem"
          >
            {status === 'saving' ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
          </button>

          <button
            type="button"
            className="dsi-menu-action dsi-menu-action-secondary"
            onClick={handleOpenSettings}
            role="menuitem"
          >
            Paramètres de sauvegarde
          </button>
        </div>
      )}
    </div>
  )
}