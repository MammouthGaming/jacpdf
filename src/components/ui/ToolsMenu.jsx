import './ToolsMenu.css'

export default function ToolsMenu({ onClose }) {
  return (
    <>
      <div className="tm-backdrop" onClick={onClose} />
      <div className="tm-menu">
        <button className="tm-item" onClick={onClose}>
          <span className="tm-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <path d="M14 17h7M17 14v7"/>
            </svg>
          </span>
          <span>Exécuter la reconnaissance de texte</span>
        </button>
      </div>
    </>
  )
}
