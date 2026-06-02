import './ComingSoonModal.css'

const GOOGLE_DRIVE_LOGO = new URL('../../../../../logo/Google Drive.svg', import.meta.url).href

function GoogleDriveIcon() {
  return <img src={GOOGLE_DRIVE_LOGO} alt="" className="csm-logo-img" draggable="false" />
}

export default function ComingSoonModal({ title, onClose }) {
  return (
    <div className="csm-overlay" onClick={onClose}>
      <div className="csm-card" onClick={(e) => e.stopPropagation()}>
        <div className="csm-icon">
          {title === 'Google Drive' ? <GoogleDriveIcon /> : null}
        </div>
        <h2 className="csm-title">{title}</h2>
        <p className="csm-text">L'intégration {title} arrive bientôt !</p>
        <button className="csm-btn" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}