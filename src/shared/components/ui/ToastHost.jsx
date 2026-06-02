import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toastStore } from '@/shared/stores/ui//toastStore'
import './ToastHost.css'

// Conteneur unique des toasts — à monter UNE fois quelque part dans l'app
// (ex. dans Editor.jsx, juste avant la fermeture du root). S'abonne au
// toastStore et rend les toasts dans un portal sur document.body pour rester
// au-dessus des modals, du masquage d'écran, etc.
//
// N'importe quel composant peut déclencher un toast :
//   import { toastStore } from '@/shared/stores/ui//toastStore'
//   toastStore.success('PDF exporté')
//   toastStore.info('Page supprimée', { action: { label: 'Annuler', onClick: restore } })
export default function ToastHost() {
  const [toasts, setToasts] = useState(() => toastStore.getAll())
  useEffect(() => toastStore.subscribe(setToasts), [])

  if (toasts.length === 0) return null

  return createPortal(
    <div className="toast-host">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{iconFor(t.type)}</span>
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => { t.action.onClick?.(); toastStore.remove(t.id) }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className="toast-close"
            title="Fermer"
            onClick={() => toastStore.remove(t.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

// Icône par type — définie en dehors du composant pour éviter de la
// ré-instancier à chaque rendu.
function iconFor(type) {
  if (type === 'success') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
  if (type === 'error') return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  )
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  )
}