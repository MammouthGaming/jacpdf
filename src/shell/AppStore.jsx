import { useState, useEffect, useMemo, useRef } from 'react'
import './AppStore.css'
import { APPS_CATALOG } from '@/shared/lib/apps/appsCatalog'
import { pinnedAppsStore } from '@/shared/lib/apps/pinnedAppsStore'
import { usePremium } from '@/shared/hooks/user/usePremium'
import { getFeatureTier, PLAN_LABELS } from '@/shared/lib/user/premiumFeatures'

// ╔═══ App Store JacSuite (Phase 4) ═══╗
// Onglet plein écran (app:'suite', type:'appstore') rendu par SuiteShell,
// ouvert via l'event `jacsuite:openAppStore` (bouton « Obtenir plus d'apps »
// du lanceur et du menu ⋮⋮) ou le deep-link /jacsuite/apps.
//
// Source unique : APPS_CATALOG. Aucune liste d'apps recopiée ici.
//  - Cliquer une tuile ouvre la FICHE DÉTAIL de l'app (description, éditeur,
//    catégorie, version, dates de publication / mise à jour) — façon vrai
//    App Store.
//  - « Ouvrir » dispatch l'openEvent de l'app → SuiteShell convertit l'onglet
//    courant (= l'App Store) en cette app, style Chrome. Les apps premium
//    déclenchent leur paywall côté shell ; les coming-soon sont désactivées.
//  - « Épingler » bascule l'app dans pinnedAppsStore → elle (dis)paraît du
//    lanceur et du menu ⋮⋮ en temps réel.

const STATUS_FILTERS = [
	{ id: 'all', label: 'Toutes' },
	{ id: 'stable', label: 'Stables' },
	{ id: 'beta', label: 'Beta' },
	{ id: 'alpha', label: 'Alpha' },
	{ id: 'coming-soon', label: 'Bientôt' },
]

// Badge dérivé du statut. 'stable' a aussi un libellé (affiché sur la fiche).
const STATUS_BADGE = {
	stable: { label: 'Stable', className: 'jac-appstore-badge--stable' },
	beta: { label: 'Beta', className: 'jac-appstore-badge--beta' },
	alpha: { label: 'Alpha', className: 'jac-appstore-badge--alpha' },
	'coming-soon': { label: 'Bientôt', className: 'jac-appstore-badge--soon' },
}

// Filtres par abonnement requis.
const PLAN_FILTERS = [
	{ id: 'all', label: 'Tous plans' },
	{ id: 'gratuit', label: 'Gratuit' },
	{ id: 'pro', label: 'Pro' },
	{ id: 'premium', label: 'Premium' },
]

// Options de tri de la grille.
const SORT_OPTIONS = [
	{ id: 'default', label: 'Par défaut' },
	{ id: 'name', label: 'Nom (A→Z)' },
	{ id: 'updated', label: 'Mise à jour récente' },
	{ id: 'published', label: 'Plus récemment publiée' },
]

// Palier d'abonnement requis pour une app (Gratuit si pas de gate premium).
const requiredTier = (app) => (app.feature ? getFeatureTier(app.feature) : 'gratuit')

// Parse une date FR du changelog ('14 février 2026') → timestamp pour le tri.
const FR_MONTHS = {
	janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
	juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
	décembre: 11, decembre: 11,
}
const dateValue = (str) => {
	if (!str) return 0
	const m = str.trim().toLowerCase().match(/(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})/)
	if (!m) return 0
	const month = FR_MONTHS[m[2]]
	if (month == null) return 0
	return new Date(Number(m[3]), month, Number(m[1])).getTime()
}

// Icône (logo SVG + fallback emoji) partagée par la grille et la fiche.
function AppIcon({ app }) {
	return (
		<>
			<img
				src={app.logo}
				alt=""
				draggable="false"
				onError={(e) => {
					e.currentTarget.style.display = 'none'
					const sib = e.currentTarget.nextElementSibling
					if (sib) sib.style.display = 'inline-flex'
				}}
			/>
			<span className="jac-appstore-card__emoji" aria-hidden="true">{app.icon}</span>
		</>
	)
}

export default function AppStore() {
	const { isFeatureLocked } = usePremium()
	const [query, setQuery] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [pinnedIds, setPinnedIds] = useState(() => pinnedAppsStore.get())
	const [selectedId, setSelectedId] = useState(null)
	const [planFilter, setPlanFilter] = useState('all')
	const [sortBy, setSortBy] = useState('default')
	const [sortOpen, setSortOpen] = useState(false)
	const sortRef = useRef(null)
	useEffect(() => pinnedAppsStore.subscribe(setPinnedIds), [])
	// Fermer le menu de tri custom au clic extérieur ou sur Échap.
	useEffect(() => {
		if (!sortOpen) return
		const onDown = (e) => {
			if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false)
		}
		const onKey = (e) => { if (e.key === 'Escape') setSortOpen(false) }
		document.addEventListener('mousedown', onDown)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', onDown)
			document.removeEventListener('keydown', onKey)
		}
	}, [sortOpen])

	// Filtre combiné recherche (nom + tagline + description) × statut × abonnement,
	// puis tri optionnel.
	const apps = useMemo(() => {
		const q = query.trim().toLowerCase()
		let list = APPS_CATALOG.filter((a) => {
			if (statusFilter !== 'all' && a.status !== statusFilter) return false
			if (planFilter !== 'all' && requiredTier(a) !== planFilter) return false
			if (!q) return true
			return (
				a.name.toLowerCase().includes(q) ||
				(a.tagline || '').toLowerCase().includes(q) ||
				(a.description || '').toLowerCase().includes(q)
			)
		})
		if (sortBy === 'name') {
			list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
		} else if (sortBy === 'updated') {
			list = [...list].sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
		} else if (sortBy === 'published') {
			list = [...list].sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt))
		}
		return list
	}, [query, statusFilter, planFilter, sortBy])

	const selected = selectedId ? APPS_CATALOG.find((a) => a.id === selectedId) : null

	// Ouvre l'app via son openEvent (SuiteShell convertit l'onglet courant).
	const handleOpen = (app) => {
		if (app.status === 'coming-soon' || !app.openEvent) return
		window.dispatchEvent(new CustomEvent(app.openEvent))
	}

	// ── Boutons Ouvrir / Épingler, partagés grille + fiche ──
	const OpenButton = ({ app, comingSoon }) => (
		<button
			type="button"
			className="jac-appstore-card__open"
			onClick={(e) => { e.stopPropagation(); handleOpen(app) }}
			disabled={comingSoon}
			title={comingSoon ? 'Bientôt disponible' : `Ouvrir ${app.name}`}
		>
			{comingSoon ? 'Bientôt' : 'Ouvrir'}
		</button>
	)
	const PinButton = ({ app, pinned }) => (
		<button
			type="button"
			className={'jac-appstore-card__pin' + (pinned ? ' jac-appstore-card__pin--active' : '')}
			onClick={(e) => { e.stopPropagation(); pinnedAppsStore.toggle(app.id) }}
			title={pinned ? 'Désépingler du menu principal' : 'Épingler au menu principal'}
			aria-pressed={pinned}
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
				<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
			</svg>
			{pinned ? 'Épinglée' : 'Épingler'}
		</button>
	)

	// ╭─────────────── FICHE DÉTAIL ───────────────╮
	if (selected) {
		const app = selected
		const pinned = pinnedIds.includes(app.id)
		const comingSoon = app.status === 'coming-soon'
		const locked = !comingSoon && app.feature && isFeatureLocked(app.feature)
		const badge = STATUS_BADGE[app.status]
		const infos = [
			{ label: 'Catégorie', value: app.category || '—' },
			{ label: 'Version', value: app.version && app.version !== '0.0.0' ? app.version : '—' },
			{ label: 'Développeur', value: app.developer || '—' },
			{ label: 'Date de publication', value: app.publishedAt || '—' },
			{ label: 'Dernière mise à jour', value: app.updatedAt || '—' },
			{ label: 'Statut', value: badge ? badge.label : '—' },
			{ label: 'Abonnement requis', value: PLAN_LABELS[requiredTier(app)] || '—' },
		]
		return (
			<div className="jac-appstore">
				<div className="jac-appstore__inner">
					<button type="button" className="jac-appstore-detail__back" onClick={() => setSelectedId(null)}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="19" y1="12" x2="5" y2="12" />
							<polyline points="12 19 5 12 12 5" />
						</svg>
						Toutes les applications
					</button>

					<header className={`jac-appstore-detail__hero jac-appstore-card--${app.color}`}>
						<span className="jac-appstore-detail__icon jac-appstore-card__icon">
							<AppIcon app={app} />
						</span>
						<div className="jac-appstore-detail__head">
							<h1 className="jac-appstore-detail__name">{app.name}</h1>
							<p className="jac-appstore-detail__meta">{app.developer || 'JacSuite'} · {app.category || '—'}</p>
							<p className="jac-appstore-detail__tagline">{app.tagline}</p>
							<div className="jac-appstore-detail__badges">
								{badge && <span className={`jac-appstore-badge ${badge.className}`}>{badge.label}</span>}
								{locked && <span className="jac-appstore-badge jac-appstore-badge--premium" title="Réservé à un abonnement">🔒 Premium</span>}
							</div>
							<div className="jac-appstore-detail__actions">
								<OpenButton app={app} comingSoon={comingSoon} />
								<PinButton app={app} pinned={pinned} />
							</div>
						</div>
					</header>

					<section className="jac-appstore-detail__section">
						<h2 className="jac-appstore-detail__h2">Description</h2>
						<p className="jac-appstore-detail__desc">{app.description || app.tagline}</p>
					</section>

					<section className="jac-appstore-detail__section">
						<h2 className="jac-appstore-detail__h2">Informations</h2>
						<div className="jac-appstore-detail__info">
							{infos.map((it) => (
								<div key={it.label} className="jac-appstore-detail__info-item">
									<span className="jac-appstore-detail__info-label">{it.label}</span>
									<span className="jac-appstore-detail__info-value">{it.value}</span>
								</div>
							))}
						</div>
					</section>
				</div>
			</div>
		)
	}

	// ╭─────────────── GRILLE ───────────────╮
	return (
		<div className="jac-appstore">
			<div className="jac-appstore__inner">
				<header className="jac-appstore__header">
					<h1 className="jac-appstore__title">App Store</h1>
					<p className="jac-appstore__subtitle">
						Toutes les applications de JacSuite. Clique une tuile pour voir sa fiche, et épingle tes favoris pour les retrouver dans le lanceur et le menu Applications.
					</p>
					<div className="jac-appstore__search">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<circle cx="11" cy="11" r="8" />
							<line x1="21" y1="21" x2="16.65" y2="16.65" />
						</svg>
						<input
							type="search"
							className="jac-appstore__search-input"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Rechercher une application…"
							aria-label="Rechercher une application"
						/>
					</div>
					<div className="jac-appstore__filters">
						{STATUS_FILTERS.map((f) => (
							<button
								key={f.id}
								type="button"
								className={'jac-appstore__filter' + (statusFilter === f.id ? ' jac-appstore__filter--active' : '')}
								onClick={() => setStatusFilter(f.id)}
							>
								{f.label}
							</button>
						))}
					</div>
					<div className="jac-appstore__toolbar">
						<div className="jac-appstore__filters jac-appstore__filters--plan">
							{PLAN_FILTERS.map((f) => (
								<button
									key={f.id}
									type="button"
									className={'jac-appstore__filter' + (planFilter === f.id ? ' jac-appstore__filter--active' : '')}
									onClick={() => setPlanFilter(f.id)}
								>
									{f.label}
								</button>
							))}
						</div>
						<div className="jac-appstore__sort" ref={sortRef}>
							<span className="jac-appstore__sort-label">Trier&nbsp;:</span>
							<div className="jac-appstore__sort-menu">
								<button
									type="button"
									className={'jac-appstore__sort-trigger' + (sortOpen ? ' jac-appstore__sort-trigger--open' : '')}
									onClick={() => setSortOpen((v) => !v)}
									aria-haspopup="listbox"
									aria-expanded={sortOpen}
								>
									<span>{SORT_OPTIONS.find((o) => o.id === sortBy)?.label || 'Trier'}</span>
									<svg className="jac-appstore__sort-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<polyline points="6 9 12 15 18 9" />
									</svg>
								</button>
								{sortOpen && (
									<ul className="jac-appstore__sort-list" role="listbox">
										{SORT_OPTIONS.map((o) => (
											<li key={o.id} role="option" aria-selected={sortBy === o.id}>
												<button
													type="button"
													className={'jac-appstore__sort-option' + (sortBy === o.id ? ' jac-appstore__sort-option--active' : '')}
													onClick={() => { setSortBy(o.id); setSortOpen(false) }}
												>
													<span>{o.label}</span>
													{sortBy === o.id && (
														<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
															<polyline points="20 6 9 17 4 12" />
														</svg>
													)}
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					</div>
				</header>

				{apps.length === 0 ? (
					<div className="jac-appstore__empty">Aucune application ne correspond à ta recherche.</div>
				) : (
					<div className="jac-appstore__grid">
						{apps.map((app) => {
							const pinned = pinnedIds.includes(app.id)
							const comingSoon = app.status === 'coming-soon'
							const locked = !comingSoon && app.feature && isFeatureLocked(app.feature)
							const badge = STATUS_BADGE[app.status]
							return (
								<div
									key={app.id}
									className={`jac-appstore-card jac-appstore-card--${app.color}`}
									role="button"
									tabIndex={0}
									onClick={() => setSelectedId(app.id)}
									onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(app.id) } }}
									title={`Voir la fiche de ${app.name}`}
								>
									<div className="jac-appstore-card__top">
										<span className="jac-appstore-card__icon">
											<AppIcon app={app} />
										</span>
										<div className="jac-appstore-card__badges">
											{badge && app.status !== 'stable' && <span className={`jac-appstore-badge ${badge.className}`}>{badge.label}</span>}
											{locked && (
												<span className="jac-appstore-badge jac-appstore-badge--premium" title="Réservé à un abonnement">🔒 Premium</span>
											)}
										</div>
									</div>
									<h2 className="jac-appstore-card__name">{app.name}</h2>
									<p className="jac-appstore-card__tagline">{app.tagline}</p>
									<div className="jac-appstore-card__actions">
										<OpenButton app={app} comingSoon={comingSoon} />
										<PinButton app={app} pinned={pinned} />
									</div>
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}