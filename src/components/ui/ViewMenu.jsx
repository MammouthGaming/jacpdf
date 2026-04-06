import './ViewMenu.css'

export default function ViewMenu({ onPresentation, onRotateCW, onRotateCCW, onTwoPages, twoPages, onClose }) {
  const handle = (fn) => { fn(); onClose() }

  return (
    <>
      <div className="vm-backdrop" onClick={onClose} />
      <div className="vm-menu">
        <button className="vm-item" onClick={() => handle(onPresentation)}>
          <span className="vm-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </span>
          Mode Présentation
        </button>

        <button className="vm-item" onClick={() => handle(onRotateCW)}>
          <span className="vm-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
            </svg>
          </span>
          Tourner dans le sens horaire
        </button>

        <button className="vm-item" onClick={() => handle(onRotateCCW)}>
          <span className="vm-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-.49-3.5"/>
            </svg>
          </span>
          Tourner dans le sens antihoraire
        </button>

        <div className="vm-separator" />

        <button className={`vm-item ${twoPages ? 'vm-item-active' : ''}`} onClick={() => handle(onTwoPages)}>
          <span className="vm-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="9" height="18" rx="1"/>
              <rect x="13" y="3" width="9" height="18" rx="1"/>
            </svg>
          </span>
          Vue de deux pages
        </button>

        <button className="vm-item" onClick={onClose}>
          <span className="vm-item-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <rect x="6" y="7" width="12" height="6" rx="1"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </span>
          Masquage d'écran
        </button>
      </div>
    </>
  )
}