import { useState } from 'react'
import './VersionModal.css'
import { getChangelogByAppName } from '@/shared/components/modals/settings/shared/appChangelogs'

// Logos des apps — affichés dans le header de la modale. Inchangé par
// rapport à la version précédente.
const VERSION_LOGOS = {
	JacSuite: new URL('../../../../../logo/JacSuite.svg', import.meta.url).href,
	JacPDF: new URL('../../../../../logo/JacPDF.svg', import.meta.url).href,
	JacDoc: new URL('../../../../../logo/JacDoc.svg', import.meta.url).href,
	JacSlide: new URL('../../../../../logo/JacSlide.svg', import.meta.url).href,
	JacPaint: new URL('../../../../../logo/JacPaint.svg', import.meta.url).href,
	JacNote: new URL('../../../../../logo/JacNote.svg', import.meta.url).href,
	'JacTâche': new URL('../../../../../logo/JacTâche.svg', import.meta.url).href,
	JacCalendrier: new URL('../../../../../logo/JacCalendrier.svg', import.meta.url).href,
	'JacSuite Cloud': new URL('../../../../../logo/JacCloud.svg', import.meta.url).href,
	'Classe': new URL('../../../../../logo/JacSuite Classroom.svg', import.meta.url).href,
}

// Helper : rendu d'un bloc version (header + titre optionnel + changes).
// Factorisé pour ne pas dupliquer entre la version actuelle et la liste
// des précédentes.
function VersionBlock({ entry, isCurrent }) {
	return (
		<div className="vm-version-block">
			<div className="vm-version-header">
				<span className="vm-version-tag">{entry.version}</span>
				<span className="vm-version-date">{entry.date}</span>
				{isCurrent && <span className="vm-actuelle">ACTUELLE</span>}
			</div>
			{entry.title && (
				<p className="vm-version-title">{entry.title}</p>
			)}
			{entry.changes.map((change, j) => (
				<div key={j} className="vm-note-row">
					<span className={`vm-badge vm-badge-${change.type.toLowerCase()}`}>
						{change.type.toUpperCase()}
					</span>
					<span className="vm-note-text">{change.text}</span>
				</div>
			))}
		</div>
	)
}

export default function VersionModal({ onClose, appName = 'JacPDF' }) {
	const [showPrevious, setShowPrevious] = useState(false)

	// Source de vérité unique : appChangelogs.js. La 1ʳᵉ entrée du tableau est
	// automatiquement marquée « ACTUELLE » ; les autres sont les versions
	// précédentes révélées via le bouton toggle.
	const changelog = getChangelogByAppName(appName)
	const entries = changelog?.entries || []
	const [currentEntry, ...previousEntries] = entries
	const versionLogo = VERSION_LOGOS[appName] || VERSION_LOGOS.JacPDF

	return (
		<div className="vm-overlay" onClick={onClose}>
			<div className="vm-card" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<div className="vm-header">
					<div className="vm-header-left">
						<div className="vm-icon">
							<img src={versionLogo} alt="" draggable="false" />
						</div>
						<div>
							<p className="vm-title">Notes de version</p>
							<p className="vm-subtitle">{appName}</p>
						</div>
					</div>
					<button className="vm-close" onClick={onClose}>✕</button>
				</div>

				{/* Liste : version actuelle + toggle + précédentes animées */}
				<div className="vm-list">
					{currentEntry && (
						<VersionBlock entry={currentEntry} isCurrent={true} />
					)}

					{previousEntries.length > 0 && (
						<>
							<button
								type="button"
								className={`vm-toggle-prev${showPrevious ? ' is-open' : ''}`}
								onClick={() => setShowPrevious(s => !s)}
								aria-expanded={showPrevious}
							>
								<span>{showPrevious ? 'Masquer les versions précédentes' : 'Voir les versions précédentes'}</span>
								<svg className="vm-toggle-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
									<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
								</svg>
							</button>

							<div className={`vm-previous-wrap${showPrevious ? ' is-open' : ''}`} aria-hidden={!showPrevious}>
								<div className="vm-previous-inner">
									{previousEntries.map((entry, i) => (
										<VersionBlock key={`prev-${i}`} entry={entry} isCurrent={false} />
									))}
								</div>
							</div>
						</>
					)}

					{!currentEntry && (
						<p className="vm-empty">Aucune note de version disponible pour cette app.</p>
					)}
				</div>
			</div>
		</div>
	)
}