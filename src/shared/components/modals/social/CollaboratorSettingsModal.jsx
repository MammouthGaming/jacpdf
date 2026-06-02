// Pop-up de paramètres par-collaborateur. Permet de :
//   1. Changer le rôle (éditeur / commentateur / lecteur).
//   2. Pour un éditeur, autoriser/retirer granulairement certaines
//      permissions (crayon, surligneur, formes, texte, images, commentaires,
//      gestion des pages, export, modification d'annotations d'autres).
//      UX style Google Docs : toggle COCHÉ = autorisé, DÉCOCHÉ = retiré.
//      Par défaut tous les toggles sont cochés (pas de restriction).
//   3. Retirer l'accès du collaborateur (DELETE physique de la share row).
//
// Branché sur documentSharesRepo via les callbacks onUpdateShare /
// onRevokeShare passées en props par CollaboratorsSidebar (qui les reçoit
// de useDocumentShares dans EditorInstance). Le modal ne touche pas
// directement Supabase — il appelle juste les callbacks et gère le
// loading/erreur localement.
//
// Les clés de rôle ('editor', 'commenter', 'viewer') et les feature keys
// ('pencil', 'highlighter', 'shapes', 'text', 'images', 'comments',
// 'pages', 'export') matchent celles utilisées par sharePermissions.js
// pour rester cohérent avec le calcul de permissions existant.

import { useEffect, useState } from 'react'
import { initialsFromName } from '@/shared/lib/social/presenceColor'
import { toastStore } from '@/shared/stores/ui/toastStore'

const STYLE_ID = 'collab-settings-modal-css'
function injectCSS() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) existing.remove()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .csm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      font-family: 'Inter', sans-serif;
      animation: csmFadeIn 0.15s ease-out;
    }
    @keyframes csmFadeIn { from { opacity: 0 } to { opacity: 1 } }
    .csm-modal {
      width: 460px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 64px);
      background: #0d1117;
      border: 1px solid #2a3347;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    }
    .csm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px;
      border-bottom: 1px solid #2a3347;
      flex-shrink: 0;
    }
    .csm-user {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }
    .csm-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
      overflow: hidden;
      user-select: none;
    }
    .csm-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .csm-user-info { display: flex; flex-direction: column; min-width: 0; }
    .csm-user-name {
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .csm-user-email {
      color: #9ca3af;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .csm-close {
      width: 32px;
      height: 32px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: #9ca3af;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    .csm-close:hover { background: #1e2535; color: #fff; }
    .csm-body {
      padding: 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .csm-section { display: flex; flex-direction: column; gap: 8px; }
    .csm-section-title { color: #fff; font-size: 13px; font-weight: 600; }
    .csm-section-hint {
      color: #9ca3af;
      font-size: 12px;
      line-height: 1.45;
      margin-top: -4px;
      margin-bottom: 4px;
    }
    .csm-roles { display: flex; flex-direction: column; gap: 6px; }
    .csm-role {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 10px 12px;
      background: #1a1f2c;
      border: 1px solid #2a3347;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      text-align: left;
      font-family: inherit;
      width: 100%;
    }
    .csm-role:hover { background: #232a3a; }
    .csm-role.selected { border-color: #6366f1; background: #1f243a; }
    .csm-role-label { color: #fff; font-size: 13px; font-weight: 600; }
    .csm-role-desc { color: #9ca3af; font-size: 12px; margin-top: 2px; }
    .csm-tools { display: flex; flex-direction: column; gap: 4px; }
    .csm-tool {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      background: #1a1f2c;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
      user-select: none;
    }
    .csm-tool:hover { background: #232a3a; }
    .csm-tool-label { color: #d1d5db; font-size: 13px; font-weight: 500; }
    .csm-toggle {
      position: relative;
      width: 32px;
      height: 18px;
      border-radius: 999px;
      background: #2a3347;
      transition: background 0.15s;
      flex-shrink: 0;
    }
    .csm-toggle.on { background: #22c55e; }
    .csm-toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.15s;
    }
    .csm-toggle.on .csm-toggle-knob { transform: translateX(14px); }
    .csm-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 18px;
      border-top: 1px solid #2a3347;
      flex-shrink: 0;
    }
    .csm-btn {
      height: 36px;
      padding: 0 16px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      border: 1px solid transparent;
    }
    .csm-btn-ghost {
      background: transparent;
      color: #d1d5db;
      border-color: #2a3347;
    }
    .csm-btn-ghost:hover { background: #1e2535; color: #fff; }
    .csm-btn-primary { background: #6366f1; color: #fff; }
    .csm-btn-primary:hover { background: #4f46e5; }
    .csm-btn-primary:disabled,
    .csm-btn-danger:disabled,
    .csm-btn-ghost:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .csm-btn-danger {
      background: transparent;
      color: #f87171;
      border-color: rgba(248, 113, 113, 0.4);
    }
    .csm-btn-danger:hover { background: rgba(248, 113, 113, 0.12); color: #fca5a5; }
    /* Bouton retirer l'accès : aligné à gauche du footer pour le séparer
       visuellement des actions principales (Annuler / Enregistrer à droite). */
    .csm-footer-spacer { flex: 1; }
    .csm-error-wrap { padding: 0 18px 12px; }
    .csm-error {
      color: #f87171;
      font-size: 12px;
      padding: 8px 12px;
      background: rgba(248, 113, 113, 0.08);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 8px;
    }
    .csm-success {
      color: #4ade80;
      font-size: 12px;
      padding: 8px 12px;
      background: rgba(74, 222, 128, 0.08);
      border: 1px solid rgba(74, 222, 128, 0.3);
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    [data-theme="light"] .csm-success {
      color: #15803d;
      background: rgba(34, 197, 94, 0.08);
      border-color: rgba(34, 197, 94, 0.3);
    }

    [data-theme="light"] .csm-modal { background: #ffffff; border-color: #d1d5db; }
    [data-theme="light"] .csm-header { border-bottom-color: #e5e7eb; }
    [data-theme="light"] .csm-user-name { color: #0d1117; }
    [data-theme="light"] .csm-user-email { color: #6b7280; }
    [data-theme="light"] .csm-close { color: #4b5563; }
    [data-theme="light"] .csm-close:hover { background: #f0f1f5; color: #0d1117; }
    [data-theme="light"] .csm-section-title { color: #0d1117; }
    [data-theme="light"] .csm-section-hint { color: #6b7280; }
    [data-theme="light"] .csm-role { background: #f5f6f8; border-color: #d1d5db; }
    [data-theme="light"] .csm-role:hover { background: #ebecf0; }
    [data-theme="light"] .csm-role.selected { background: #eef0ff; border-color: #6366f1; }
    [data-theme="light"] .csm-role-label { color: #0d1117; }
    [data-theme="light"] .csm-role-desc { color: #6b7280; }
    [data-theme="light"] .csm-tool { background: #f5f6f8; }
    [data-theme="light"] .csm-tool:hover { background: #ebecf0; }
    [data-theme="light"] .csm-tool-label { color: #1f2937; }
    [data-theme="light"] .csm-toggle { background: #d1d5db; }
    [data-theme="light"] .csm-footer { border-top-color: #e5e7eb; }
    [data-theme="light"] .csm-btn-ghost { color: #1f2937; border-color: #d1d5db; }
    [data-theme="light"] .csm-btn-ghost:hover { background: #f0f1f5; color: #0d1117; }
    [data-theme="light"] .csm-btn-danger { color: #dc2626; border-color: rgba(220, 38, 38, 0.35); }
    [data-theme="light"] .csm-btn-danger:hover { background: rgba(220, 38, 38, 0.08); color: #b91c1c; }
    [data-theme="light"] .csm-error {
      color: #b91c1c;
      background: rgba(220, 38, 38, 0.06);
      border-color: rgba(220, 38, 38, 0.25);
    }
  `
  document.head.appendChild(style)
}
injectCSS()

const ROLES = [
  { key: 'editor', label: 'Éditeur', desc: 'Peut modifier le document' },
  { key: 'commenter', label: 'Commentateur', desc: 'Peut uniquement commenter' },
  { key: 'viewer', label: 'Lecteur', desc: 'Lecture seule' },
]

// Liste des permissions PAR DÉFAUT (JacPDF) — les clés matchent
// sharePermissions.js. UX : toggle COCHÉ (vert) = autorisé, DÉCOCHÉ
// (gris) = retiré. Par défaut tout est coché (éditeur sans restriction).
// Décocher une clé fait passer la row de partage à
// feature_permissions = { allowed: […sans cette clé] }.
//
// `editOthers` n'est pas un outil de création : c'est une permission de
// MANIPULATION (déplacer, redimensionner, supprimer) des annotations qui
// existent déjà sur le doc — incluant celles créées par d'autres collaborateurs
// ou par le propriétaire. Décoché = bloqué : l'editor pourra créer ses
// propres annotations selon ses autres outils mais ne pourra rien toucher
// de ce qui est déjà là — EditorInstance ouvre alors ReadOnlyBlockedModal.
//
// Ce modal est partagé entre JacPDF et JacDoc. Pour qu'un appelant n'affiche
// PAS la section Permissions (cas JacDoc : pas d'outils d'annotation),
// il suffit de passer `tools={[]}`. Quand `tools.length === 0` :
//   - la section n'est pas rendue ;
//   - featurePermissions est toujours envoyé à null au save (pas de whitelist).
const DEFAULT_TOOLS = [
  { key: 'pencil', label: 'Crayon' },
  { key: 'highlighter', label: 'Surligneur' },
  { key: 'shapes', label: 'Formes' },
  { key: 'text', label: 'Texte' },
  { key: 'images', label: 'Images' },
  { key: 'comments', label: 'Commentaires' },
  { key: 'pages', label: 'Gestion des pages' },
  { key: 'addPages', label: 'Ajout de pages' },
  { key: 'export', label: 'Export' },
  { key: 'editOthers', label: "Modification des annotations d'autres personnes" },
]

export default function CollaboratorSettingsModal({
  user,
  share = null,
  onUpdateShare = null,
  onRevokeShare = null,
  onClose,
  // Permissions granulaires (JacPDF). Passe `tools={[]}` pour cacher la
  // section Permissions et neutraliser featurePermissions (cas JacDoc).
  tools = DEFAULT_TOOLS,
}) {
  // Drapeau interne : true quand l'appelant a fourni une liste vide,
  // ce qui signifie « pas de granularité de permissions ici ».
  const hasTools = Array.isArray(tools) && tools.length > 0
  const [role, setRole] = useState('editor')
  // enabledTools : Set des clés actuellement AUTORISÉES (toggles cochés).
  // Par défaut au mount = tous les TOOLS (= pas de restriction = allowed:null
  // côté SQL). Décocher une clé la retire du Set ; au save, si le Set
  // contient toutes les clés on écrit null en SQL (= pas de whitelist), sinon
  // on écrit le tableau des clés cochées comme whitelist explicite.
  const [enabledTools, setEnabledTools] = useState(() => new Set((tools || []).map(t => t.key)))
  // États UI : busy bloque les boutons pendant un appel réseau ; error
  // affiche un message rouge ; success affiche une confirmation verte
  // pendant ~1 s avant de fermer le modal — sans ça, on dépendait
  // uniquement du toast qui peut être silencieux si toastStore.success
  // n'est pas wired, et l'utilisateur voyait « rien ».
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // À chaque changement de cible, on resync depuis la share row réelle.
  // Source de vérité = la row Supabase (share.role + share.feature_permissions),
  // pas l'objet user qui peut ne pas porter ces infos pour les hors-ligne.
  // Fallback sur les champs user.* si la share manque (cas de bord), sinon
  // on part sur « editor sans restriction ».
  useEffect(() => {
    if (!user) return
    const sourceRole = share?.role || user.role || 'editor'
    setRole(sourceRole)
    const allowed = share?.feature_permissions?.allowed ?? user.featurePermissions?.allowed
    if (Array.isArray(allowed)) {
      // Whitelist SQL explicite → ce sont exactement les clés cochées.
      setEnabledTools(new Set(allowed))
    } else {
      // null/undefined → pas de restriction → tout est coché par défaut.
      setEnabledTools(new Set((tools || []).map(t => t.key)))
    }
    setError(null)
  }, [user, share, tools])

  if (!user) return null

  const toggleTool = (key) => {
    setEnabledTools((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)  // décocher = retirer
      else next.add(key)                    // cocher = autoriser
      return next
    })
  }

  const handleSave = async () => {
    if (!share?.id) {
      setError("Impossible de retrouver le partage pour ce collaborateur. Recharge la page et réessaie.")
      return
    }
    if (typeof onUpdateShare !== 'function') {
      setError("L'édition des partages n'est pas disponible ici.")
      return
    }
    // featurePermissions :
    //   - role !== 'editor' → on stocke null (jsonb {}) pour ne pas garder une
    //     ancienne whitelist orpheline qui se réactiverait si le rôle repasse
    //     à editor plus tard.
    //   - role === 'editor' + tous les toggles cochés → null = pas de
    //     restriction (par défaut tout est autorisé).
    //   - role === 'editor' + au moins un toggle décoché → whitelist des clés
    //     cochées (sharePermissions.js stocke la liste blanche, pas la noire).
    let featurePermissions = null
    // Quand l'appelant n'a pas de tools (JacDoc), on garde featurePermissions
    // à null en permanence : pas de whitelist, le rôle suffit à tout décrire.
    if (hasTools && role === 'editor' && enabledTools.size < tools.length) {
      featurePermissions = tools.map((t) => t.key).filter((k) => enabledTools.has(k))
    }
    // Logs diagnostic V2-MSG126 — visibles dans DevTools pour comprendre
    // exactement ce qui est envoyé à Supabase ET ce qui revient. Le marqueur
    // V2-MSG126 sert à vérifier que le fichier local est bien synchronisé
    // avec la dernière version (l'ancien log disait simplement
    // '[CollabSettings] save' sans version). Si tu vois 'V2-MSG126' dans la
    // console, le fichier est à jour ; sinon le fichier local n'a pas été
    // re-synchronisé depuis Notion.
    // eslint-disable-next-line no-console
    console.log('[CollabSettings V2-MSG126] save → patching share', {
      shareId: share.id,
      patch: { role, featurePermissions },
      previousRole: share.role,
      previousFeaturePermissions: share.feature_permissions,
      enabledToolsArray: Array.from(enabledTools),
    })
    setBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const updatedRow = await onUpdateShare(share.id, { role, featurePermissions })
      // eslint-disable-next-line no-console
      console.log('[CollabSettings V2-MSG126] save → OK, row from Supabase:', updatedRow)
      // eslint-disable-next-line no-console
      console.log('[CollabSettings V2-MSG126] persisted feature_permissions:', updatedRow?.feature_permissions, 'persisted role:', updatedRow?.role)
      toastStore?.success?.('Réglages enregistrés')
      // Affiche « Enregistré ✓ » pendant 900 ms avant de fermer pour donner
      // un retour visuel même si le toast est silencieux. Sans ça, l'utilisateur
      // ne sait pas si son clic Save a pris ou non.
      setSuccess(true)
      setTimeout(() => onClose?.(), 900)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CollabSettings] updateShare failed', err)
      const detail = err?.details?.message || err?.details?.code || err?.code
      setError(
        (err?.message || "Échec de l'enregistrement.")
        + (detail ? ` (${detail})` : ''),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    if (!share?.id) {
      setError("Impossible de retrouver le partage pour ce collaborateur.")
      return
    }
    if (typeof onRevokeShare !== 'function') {
      setError("Le retrait d'accès n'est pas disponible ici.")
      return
    }
    // Confirmation native — simple et suffisante pour une action destructive.
    // Si on voulait quelque chose de plus joli, il faudrait un mini
    // sub-modal (cf. ShareConfirmModal) ; pour l'instant on garde minimal.
    const ok = window.confirm(
      `Retirer l'accès de ${user.name || 'ce collaborateur'} à ce document ?\n\nIl ne pourra plus ouvrir ni modifier le PDF.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await onRevokeShare(share.id)
      toastStore?.success?.('Accès retiré')
      onClose?.()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CollabSettings] revoke failed', err)
      setError(err?.message || "Échec du retrait d'accès.")
    } finally {
      setBusy(false)
    }
  }

  const handleOverlayClick = (e) => {
    if (busy) return
    if (e.target === e.currentTarget) onClose?.()
  }

  const initials = user.initials || initialsFromName(user.name, user.email)
  const avatarBg = { background: user.color || '#4a5568' }

  return (
    <div className="csm-overlay" onClick={handleOverlayClick}>
      <div className="csm-modal" role="dialog" aria-modal="true">
        <div className="csm-header">
          <div className="csm-user">
            <div className="csm-avatar" style={avatarBg}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : initials}
            </div>
            <div className="csm-user-info">
              <span className="csm-user-name">{user.name || 'Collaborateur'}</span>
              {user.email && <span className="csm-user-email">{user.email}</span>}
            </div>
          </div>
          <button
            type="button"
            className="csm-close"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="csm-body">
          {!share?.id && (
            <div className="csm-error">
              ⚠️ Aucune row de partage trouvée pour ce collaborateur.
              {' '}Le bouton Enregistrer affichera une erreur. Ouvre la console
              {' '}DevTools pour voir les logs `[CollabSettings]`.
            </div>
          )}
          <div className="csm-section">
            <div className="csm-section-title">Rôle</div>
            <div className="csm-roles">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`csm-role${role === r.key ? ' selected' : ''}`}
                  onClick={() => setRole(r.key)}
                >
                  <span className="csm-role-label">{r.label}</span>
                  <span className="csm-role-desc">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {hasTools && role === 'editor' && (
            <div className="csm-section">
              <div className="csm-section-title">Permissions</div>
              <div className="csm-section-hint">
                Décochez une permission pour la retirer à ce collaborateur. Par défaut, tout est autorisé.
              </div>
              <div className="csm-tools">
                {tools.map((t) => {
                  const enabled = enabledTools.has(t.key)
                  return (
                    <div
                      key={t.key}
                      className="csm-tool"
                      onClick={() => toggleTool(t.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleTool(t.key)
                        }
                      }}
                    >
                      <span className="csm-tool-label">{t.label}</span>
                      <span className={`csm-toggle${enabled ? ' on' : ''}`}>
                        <span className="csm-toggle-knob" />
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="csm-error-wrap">
            <div className="csm-error">{error}</div>
          </div>
        )}

        {success && (
          <div className="csm-error-wrap">
            <div className="csm-success">✓ Réglages enregistrés</div>
          </div>
        )}

        <div className="csm-footer">
          {/* Retirer l'accès — à gauche, isolé des actions principales pour
              éviter les clics accidentels. Caché si on n'a pas de share row
              (rien à révoquer). */}
          {share?.id && (
            <button
              type="button"
              className="csm-btn csm-btn-danger"
              onClick={handleRevoke}
              disabled={busy}
            >
              Retirer l'accès
            </button>
          )}
          <div className="csm-footer-spacer" />
          <button
            type="button"
            className="csm-btn csm-btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="button"
            className="csm-btn csm-btn-primary"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}