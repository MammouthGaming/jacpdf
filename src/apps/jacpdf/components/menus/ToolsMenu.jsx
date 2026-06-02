import './ToolsMenu.css'

export default function ToolsMenu({ onMerge, onSearch, onOcr, onClose }) {
  return (
    <>
      <div className="tm-backdrop" onClick={onClose} />
      <div className="tm-menu">
        <button className="tm-item" onClick={() => { onSearch?.(); onClose() }}>
          <span className="tm-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <span className="tm-label-row">
            <span>Rechercher dans le PDF</span>
            <span className="tm-note">Instable</span>
          </span>
        </button>
        <button className="tm-item" onClick={() => { onOcr?.(); onClose() }}>
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
        <button className="tm-item" onClick={() => { onMerge?.(); onClose() }}>
          <span className="tm-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="18" r="3"/>
              <circle cx="6" cy="6" r="3"/>
              <path d="M6 21V9a9 9 0 0 0 9 9"/>
            </svg>
          </span>
          <span>Fusionner des PDF</span>
        </button>
      </div>
    </>
  )
}
