import { useEffect } from 'react'

// Ferme un popover / menu / dropdown au clic extérieur ou à Escape.
// `refs` est un tableau de RefObject : tout clic dans l'un d'eux est
// IGNORé (sinon on fermerait au clic sur le bouton qui vient d'ouvrir).
// Le hook s'attache uniquement quand `open` est true pour ne pas polluer
// l'event loop quand rien n'est ouvert.
export function useClickOutsideToClose(open, refs, onClose) {
  useEffect(() => {
    if (!open || typeof onClose !== 'function') return
    const onDown = (e) => {
      for (const ref of refs) {
        if (ref?.current?.contains?.(e.target)) return
      }
      onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // Les refs sont stables (createRef / useRef) → inutile de les mettre
    // dans les deps, sinon on re-attach à chaque render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose])
}