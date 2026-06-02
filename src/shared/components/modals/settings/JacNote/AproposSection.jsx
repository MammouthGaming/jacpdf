import { APP_LOGOS } from '../shared/appLogos'
import { getAppVersion } from '../shared/appChangelogs'

export default function AproposSection({ onOpenVersionModal }) {
	return (
		<div className="fsm-section">
			<h3 className="fsm-section-title">À propos</h3>
			<p className="fsm-section-sub">Informations sur JacNote.</p>

			<div className="fsm-about-card">
				<div className="fsm-logo">
					{APP_LOGOS.jacnote && (
						<img src={APP_LOGOS.jacnote} alt="" className="fsm-logo-img" draggable="false" />
					)}
					<span className="fsm-logo-jac">Jac</span>
					<span className="fsm-logo-pdf">Note</span>
					<button className="fsm-version-tag" onClick={onOpenVersionModal}>Version {getAppVersion('jacnote')}</button>
				</div>
				<p className="fsm-about-text">
					Application de prise de notes inspirée d’Apple Notes, intégrée à la JacSuite. Layout trois colonnes (dossiers / liste / éditeur), éditeur Tiptap avec autosave, dossiers imbriqués, favoris, corbeille et menus contextuels.
				</p>
				<p className="fsm-about-text">
					<strong>Statut :</strong> Stable. Éditeur Tiptap, dossiers imbriqués, favoris, corbeille, paramètres complets et synchronisation cloud multi-appareils via Supabase.
				</p>
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
					<p className="fsm-credit-name">Claude Opus 4.8
</p>
					<p className="fsm-credit-role">Assistant de développement</p>
				</div>
			</div>
			<p className="fsm-copyright">© 2026 JacSuite — Tous droits réservés</p>
		</div>
	)
}