import '../FullSettingsModal.css'
import { getAppVersion } from '../shared/appChangelogs'

const JACCLOUD_LOGO = new URL('../../../../../../logo/JacCloud.svg', import.meta.url).href

/**
 * Section À propos — logo JacSuite Cloud, version cliquable (ouvre le
 * VersionModal partagé), crédits et copyright. Même structure que les autres
 * AproposSection de la suite (JacPDF, JacDoc, JacNote…). On reçoit
 * onOpenVersionModal de FullSettingsModal pour ouvrir le VersionModal partagé
 * au clic sur le tag de version.
 *
 * @param {Object}   props
 * @param {Function} props.onOpenVersionModal - Ouvre le VersionModal partagé.
 */
export default function AproposSection({ onOpenVersionModal }) {
  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">À propos</h3>
      <p className="fsm-section-sub">Informations sur JacSuite Cloud</p>
      <div className="fsm-about-card">
        <div className="fsm-logo">
          <img src={JACCLOUD_LOGO} alt="" className="fsm-logo-img" draggable="false" />
          <span className="fsm-logo-jac">Jac</span>
          <span className="fsm-logo-pdf">Cloud</span>
          <button className="fsm-version-tag" onClick={onOpenVersionModal}>Version {getAppVersion('jaccloud')}</button>
        </div>
        <p className="fsm-about-text">Le cloud central de JacSuite : un espace unique qui rassemble les fichiers de toutes tes apps (JacPDF, JacDoc, JacPaint, JacNote) — comme un Drive, mais pensé pour JacSuite.</p>
      </div>
      <h4 className="fsm-group-title">Crédits</h4>
      <div className="fsm-credit-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <div>
          <p className="fsm-credit-name">Jacob Veilleux</p>
          <p className="fsm-credit-role">Créateur & Développeur</p>
        </div>
      </div>
      <div className="fsm-credit-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
        <div>
          <p className="fsm-credit-name">Claude Opus 4.8</p>
          <p className="fsm-credit-role">Assistant de développement</p>
        </div>
      </div>
      <p className="fsm-copyright">© 2026 JacSuite — Tous droits réservés</p>
    </div>
  )
}