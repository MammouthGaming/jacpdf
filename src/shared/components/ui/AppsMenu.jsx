import { useState, useEffect } from 'react'
import ComingSoonModal from '@/shared/components/modals/system/ComingSoonModal'
import { APPS_CATALOG, APP_LOGOS } from '@/shared/lib/apps/appsCatalog'
import { pinnedAppsStore } from '@/shared/lib/apps/pinnedAppsStore'

// Menu « Applications » partagé — calque du bouton grille 9 points de
// JacSuite Cloud, réutilisable dans n'importe quelle topbar (JacPDF, JacDoc,
// JacPaint…). Chaque tuile dispatch un CustomEvent déjà écouté par SuiteShell
// (style Chrome : convertit l'onglet courant en l'app cible, ou focus
// l'existant). JacSlide n'est pas encore dispo → ComingSoonModal.
//
// Tuiles du menu dérivées du catalogue central (src/shared/lib/apps).
// `event` = openEvent du catalogue ; comingSoon / beta dérivés du statut.
// APP_LOGOS provient aussi du catalogue (logos résolus à un seul endroit).
const APPS_MENU = APPS_CATALOG.map((a) => ({
  id: a.id,
  label: a.name,
  event: a.openEvent,
  comingSoon: a.status === 'coming-soon',
  beta: a.status === 'beta',
}))

// Styles inline (consts module — évite le double-accolade JSX et toute
// dépendance CSS). Thème sombre aligné sur les menus JacCloud / JacPaint.
const WRAPPER_STYLE = { position: 'relative', display: 'inline-flex' }
const BTN_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }
const BTN_ACTIVE_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, border: 'none', background: '#1e2535', color: '#e5e7eb', cursor: 'pointer' }
const BACKDROP_STYLE = { position: 'fixed', inset: 0, zIndex: 190 }
const MENU_STYLE = { position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 300, background: '#161b27', border: '1px solid #2a3347', borderRadius: 12, padding: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', zIndex: 200 }
const GRID_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 252, overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }
const TILE_STYLE = { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 6px', borderRadius: 10, border: 'none', background: 'transparent', color: '#e5e7eb', cursor: 'pointer' }
const TILE_ICON_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34 }
const TILE_IMG_STYLE = { width: 30, height: 30, objectFit: 'contain', pointerEvents: 'none' }
const TILE_LABEL_STYLE = { fontSize: 12, color: '#d1d5db', textAlign: 'center', lineHeight: 1.2 }
const TILE_BADGE_STYLE = { position: 'absolute', top: 4, right: 4, fontSize: 9, padding: '1px 5px', borderRadius: 999, background: '#2a3347', color: '#9ca3af' }
const TILE_BADGE_BETA_STYLE = { position: 'absolute', top: 4, right: 4, fontSize: 9, padding: '1px 5px', borderRadius: 999, background: '#f97316', color: '#fff' }
const DIVIDER_STYLE = { height: 1, background: '#2a3347', margin: '8px 4px' }
const MORE_BTN_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
// En-tête « Vos favoris » + bouton crayon (calque du lanceur Google).
const HEADER_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px 10px' }
const HEADER_TITLE_STYLE = { fontSize: 15, fontWeight: 700, color: '#f3f4f6' }
const EDIT_BTN_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999, border: 'none', background: '#1e2535', color: '#9ca3af', cursor: 'pointer' }
const EDIT_BTN_ACTIVE_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }
const REMOVE_BADGE_STYLE = { position: 'absolute', top: 2, right: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, fontSize: 13, fontWeight: 700, lineHeight: 1, borderRadius: 999, background: '#ef4444', color: '#fff', border: '2px solid #161b27', cursor: 'pointer' }
// Barre d'édition « Annuler / Terminé » + sous-titre (calque du lanceur Google).
const EDIT_BAR_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 4px' }
const CANCEL_BTN_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 16px', borderRadius: 999, border: 'none', background: '#1e2535', color: '#e5e7eb', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const DONE_BTN_STYLE = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 18px', borderRadius: 999, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const EDIT_HINT_STYLE = { textAlign: 'center', fontSize: 13, color: '#d1d5db', padding: '2px 0 10px' }

// Props :
//  - className : classe additionnelle posée sur le wrapper (responsive, etc.).
//  - buttonClassName : classe du bouton déclencheur ⋮⋮. Permet de réutiliser
//    le style des boutons top-bar de chaque app (cercle sombre) pour que le
//    bouton ait la même apparence que ses voisins. Si fourni, le style inline
//    est retiré pour laisser le CSS de l'app gouverner l'apparence.
export default function AppsMenu({ className = '', buttonClassName = '', dragProps = {} }) {
  const [open, setOpen] = useState(false)
  const [comingSoon, setComingSoon] = useState(null)
  const [editing, setEditing] = useState(false)
  // Glisser-déposer : id de la tuile en cours de drag + tuile survolée.
  const [dragId, setDragId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  // Instantané de l'ordre à l'entrée en édition (pour « Annuler »).
  const [snapshot, setSnapshot] = useState([])

  // N'affiche que les apps épinglées (menu principal personnalisable). Le
  // catalogue complet est accessible via « Obtenir plus d'apps » → App Store.
  const [pinnedIds, setPinnedIds] = useState(() => pinnedAppsStore.get())
  useEffect(() => pinnedAppsStore.subscribe(setPinnedIds), [])
  const tiles = pinnedIds
    .map((id) => APPS_MENU.find((t) => t.id === id))
    .filter(Boolean)

  const handleOpenStore = () => {
    setOpen(false)
    setEditing(false)
    window.dispatchEvent(new CustomEvent('jacsuite:openAppStore'))
  }

  const handleTile = (app) => {
    setOpen(false)
    if (app.comingSoon) { setComingSoon(app.label); return }
    if (app.event) window.dispatchEvent(new CustomEvent(app.event))
  }

  // Mode édition (clic sur le crayon) : chaque favori affiche un « × » qui le
  // retire via pinnedAppsStore.unpin. stopPropagation évite de déclencher
  // l'ouverture de l'app derrière le badge.
  const handleRemove = (e, app) => {
    e.stopPropagation()
    pinnedAppsStore.unpin(app.id)
  }

  // Glisser-déposer (mode édition) : déplace l'id source à la position de la
  // tuile cible, puis persiste le nouvel ordre via pinnedAppsStore.reorder.
  const reorderIds = (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return
    const ids = tiles.map((t) => t.id)
    const from = ids.indexOf(sourceId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    pinnedAppsStore.reorder(ids)
  }

  // Édition : entrer mémorise l'ordre actuel ; Annuler le restaure ; Terminé
  // conserve les changements. Dans tous les cas on sort du mode édition.
  const enterEdit = () => { setSnapshot(pinnedIds); setEditing(true) }
  const cancelEdit = () => { pinnedAppsStore.replace(snapshot); setEditing(false); setDragId(null); setDragOverId(null) }
  const doneEdit = () => { setEditing(false); setDragId(null); setDragOverId(null) }

  return (
    <div className={'appsmenu' + (className ? ' ' + className : '')} style={ WRAPPER_STYLE }>
      <button
        type="button"
        className={'appsmenu__btn' + (buttonClassName ? ' ' + buttonClassName : '')}
        title="Applications"
        aria-label="Applications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => { if (v) { setEditing(false); setDragId(null); setDragOverId(null) } return !v })}
        style={ buttonClassName ? undefined : (open ? BTN_ACTIVE_STYLE : BTN_STYLE) }
        {...dragProps}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          <div style={ BACKDROP_STYLE } onClick={() => { setOpen(false); setEditing(false); setDragId(null); setDragOverId(null) }} />
          <div style={ MENU_STYLE } role="menu" aria-label="Applications JacSuite">
            {editing ? (
              <>
                <div style={ EDIT_BAR_STYLE }>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={ CANCEL_BTN_STYLE }
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#2a3347' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#1e2535' }}
                  >Annuler</button>
                  <button
                    type="button"
                    onClick={doneEdit}
                    style={ DONE_BTN_STYLE }
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#1d4ed8' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#2563eb' }}
                  >Terminé</button>
                </div>
                <div style={ EDIT_HINT_STYLE }>Glissez-déposez des applis</div>
              </>
            ) : (
              <div style={ HEADER_STYLE }>
                <span style={ HEADER_TITLE_STYLE }>Vos favoris</span>
                <button
                  type="button"
                  title="Modifier les favoris"
                  aria-label="Modifier les favoris"
                  onClick={enterEdit}
                  style={ EDIT_BTN_STYLE }
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#2a3347' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#1e2535' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </button>
              </div>
            )}
            <div style={ GRID_STYLE }>
              {tiles.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  role="menuitem"
                  title={app.comingSoon ? app.label + ' — bientôt disponible' : app.label}
                  draggable={editing}
                  onClick={() => { if (!editing) handleTile(app) }}
                  onDragStart={(e) => { if (editing) { setDragId(app.id); e.dataTransfer.effectAllowed = 'move' } }}
                  onDragOver={(e) => { if (editing && dragId) { e.preventDefault(); setDragOverId(app.id) } }}
                  onDrop={(e) => { if (editing) { e.preventDefault(); reorderIds(dragId, app.id); setDragId(null); setDragOverId(null) } }}
                  onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                  style={ editing ? { ...TILE_STYLE, cursor: 'grab', opacity: dragId === app.id ? 0.4 : 1, outline: (dragOverId === app.id && dragId !== app.id) ? '2px dashed #2563eb' : 'none', outlineOffset: -2 } : TILE_STYLE }
                  onMouseEnter={(e) => { if (!editing) e.currentTarget.style.background = '#1e2535' }}
                  onMouseLeave={(e) => { if (!editing) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={ TILE_ICON_STYLE }>
                    <img src={APP_LOGOS[app.id]} alt="" draggable="false" style={ TILE_IMG_STYLE } />
                  </span>
                  <span style={ TILE_LABEL_STYLE }>{app.label}</span>
                  {!editing && app.comingSoon && <span style={ TILE_BADGE_STYLE }>Bientôt</span>}
                  {!editing && app.beta && <span style={ TILE_BADGE_BETA_STYLE }>Beta</span>}
                  {editing && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={'Retirer ' + app.label + ' des favoris'}
                      aria-label={'Retirer ' + app.label + ' des favoris'}
                      onClick={(e) => handleRemove(e, app)}
                      style={ REMOVE_BADGE_STYLE }
                    >×</span>
                  )}
                </button>
              ))}
            </div>
            <div style={ DIVIDER_STYLE } />
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenStore}
              style={ MORE_BTN_STYLE }
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1e2535' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Obtenir plus d'apps
            </button>
          </div>
        </>
      )}
      {comingSoon && <ComingSoonModal title={comingSoon} onClose={() => setComingSoon(null)} />}
    </div>
  )
}