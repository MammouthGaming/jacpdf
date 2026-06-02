import '../FullSettingsModal.css'
import { getAppVersion } from '../shared/appChangelogs'

const JACPDF_LOGO = new URL('../../../../../../logo/JacPDF.svg', import.meta.url).href

/**
 * Section À propos — logo JacPDF, numéro de version, crédits, copyright.
 *
 * Le modal de version (VersionModal) reste monté dans FullSettingsModal pour
 * deux raisons :
 *   1. Il s'affiche en surimpression de toute la modale settings (pas seulement
 *      de cette section), donc son rendu doit être au même niveau que la racine
 *      de FullSettingsModal pour le z-index.
 *   2. Ça évite de re-monter VersionModal à chaque switch d'onglet.
 *
 * On reçoit donc juste onOpenVersionModal pour ouvrir le modal au clic sur le
 * tag de version (même contrat que toutes les autres AproposSection de la
 * suite : JacCalendrier, JacTache, JacDoc, JacNote, JacSuite).
 *
 * @param {Object}   props
 * @param {Function} props.onOpenVersionModal - Callback fourni par
 *                                              FullSettingsModal qui ouvre
 *                                              le VersionModal partagé.
 */
export default function AproposSection({ onOpenVersionModal }) {
  return (
    <div className="fsm-section">
      <h3 className="fsm-section-title">À propos</h3>
      <p className="fsm-section-sub">Informations sur JacPDF</p>
      <div className="fsm-about-card">
        <div className="fsm-logo">
          <img src={JACPDF_LOGO} alt="" className="fsm-logo-img" draggable="false" />
          <span className="fsm-logo-jac">Jac</span>
          <span className="fsm-logo-pdf">PDF</span>
          <button className="fsm-version-tag" onClick={onOpenVersionModal}>Version {getAppVersion('jacpdf')}</button>
        </div>
        <p className="fsm-about-text">Éditeur PDF moderne et puissant pour annoter, dessiner et exporter vos documents en toute simplicité.</p>
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
      <p className="fsm-copyright">© 2026 JacPDF — Tous droits réservés</p>
    </div>
  )
}