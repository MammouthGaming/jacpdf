import { useEffect } from 'react'

// Petit effet : quand `open` passe à true, on écoute Escape global et on
// appelle `onClose`. Utilisé par toutes les modales JacDoc (notif, word
// count, header/footer) et par les menus contextuels (zoom, page menu).
export function useEscapeToClose(open, onClose) {
  useEffect(() => {
    if (!open || typeof onClose !== 'function') return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
}