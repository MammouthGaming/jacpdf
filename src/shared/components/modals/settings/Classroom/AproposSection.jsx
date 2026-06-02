import '../FullSettingsModal.css'
import { getAppVersion } from '../shared/appChangelogs'

const CLASSROOM_LOGO = new URL('../../../../../../logo/JacSuite Classroom.svg', import.meta.url).href

/**
 * Section À propos — logo Classroom, version cliquable (ouvre le VersionModal
 * partagé), crédits et copyright. Même structure que les autres AproposSection
 * de la suite (JacPDF, JacDoc, JacCloud…). La version vient du changelog
 * central via getAppVersion('classroom'), donc toujours synchro.
 *
 * @param {Object}   props
 * @param {Function} props.onOpenVersionModal - Ouvre le VersionModal partagé.
 */
export default function AproposSection({ onOpenVersionModal }) {
  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">À propos</h3>
      <p className="fsm-section-sub">Informations sur Classroom</p>
      <div className="fsm-about-card">
        <div className="fsm-logo">
          <img src={CLASSROOM_LOGO} alt="" className="fsm-logo-img" draggable="false" />
          <span className="fsm-logo-jac">Class</span>
          <span className="fsm-logo-pdf">room</span>
          <button className="fsm-version-tag" onClick={onOpenVersionModal}>Version {getAppVersion('classroom')}</button>
        </div>
        <p className="fsm-about-text">L'espace de cours de JacSuite : crée des classes, distribue des devoirs et corrige les copies de tes élèves directement dans JacPDF et JacDoc. Encore en bêta — de nouvelles fonctions arrivent régulièrement.</p>
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