// Shell partagé pour les modales JacDoc. Il conserve les classes CSS
// historiques (.jacdoc-*-modal-overlay / .jacdoc-*-modal) pour éviter
// toute régression visuelle, tout en centralisant la fermeture par clic
// backdrop et la structure overlay → modal.
export default function ModalShell({
  open = true,
  overlayClassName,
  modalClassName,
  overlayRole = 'presentation',
  modalRole = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  closeOnBackdropClick = false,
  closeOnBackdropMouseDown = false,
  onClose,
  children,
}) {
  if (!open) return null

  const closeIfBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose?.()
  }

  return (
    <div
      className={overlayClassName}
      role={overlayRole}
      aria-modal={overlayRole === 'dialog' ? 'true' : undefined}
      aria-label={overlayRole === 'dialog' ? ariaLabel : undefined}
      onClick={closeOnBackdropClick ? closeIfBackdrop : undefined}
      onMouseDown={closeOnBackdropMouseDown ? closeIfBackdrop : undefined}
    >
      <div
        className={modalClassName}
        onClick={(e) => e.stopPropagation()}
        role={modalRole}
        aria-modal={modalRole === 'dialog' ? 'true' : undefined}
        aria-label={modalRole === 'dialog' ? ariaLabel : undefined}
        aria-labelledby={modalRole === 'dialog' ? ariaLabelledBy : undefined}
      >
        {children}
      </div>
    </div>
  )
}