import { useState, useRef, useEffect } from 'react'
import { useJacSuiteJson, useJacSuiteSetting, useJacSuiteBool } from '@/shared/hooks/useJacSuiteSetting'
import './SuiteSidebar.css'

// Logos résolus comme dans SuiteShell (new URL + import.meta.url → asset Vite).
// src/shell/ → ../../ = racine du projet → /logo/.
const LOGOS = {
	jacsuite: new URL('../../logo/JacSuite.svg', import.meta.url).href,
	jacpdf: new URL('../../logo/JacPDF.svg', import.meta.url).href,
	jacdoc: new URL('../../logo/JacDoc.svg', import.meta.url).href,
	jacpaint: new URL('../../logo/JacPaint.svg', import.meta.url).href,
	jacnote: new URL('../../logo/JacNote.svg', import.meta.url).href,
	jactache: new URL('../../logo/JacTâche.svg', import.meta.url).href,
	jaccalendrier: new URL('../../logo/JacCalendrier.svg', import.meta.url).href,
	classroom: new URL('../../logo/JacSuite Classroom.svg', import.meta.url).href,
}

const SIDEBAR_APPS = [
	{ id: 'launcher', name: 'Accueil JacSuite', logo: 'jacsuite' },
	{ id: 'jacpdf', name: 'JacPDF', logo: 'jacpdf' },
	{ id: 'jacdoc', name: 'JacDoc', logo: 'jacdoc' },
	{ id: 'jacpaint', name: 'JacPaint', logo: 'jacpaint' },
	{ id: 'jacnote', name: 'JacNote', logo: 'jacnote' },
	{ id: 'jactache', name: 'JacTâche', logo: 'jactache' },
	{ id: 'jaccalendrier', name: 'JacCalendrier', logo: 'jaccalendrier' },
	{ id: 'classroom', name: 'Classroom', logo: 'classroom' },
]
const DEFAULT_ORDER = SIDEBAR_APPS.map((a) => a.id)

// Écrit un réglage JacSuite + notifie les hooks consommateurs (même
// convention que settings/shared/useStoredSetting.js).
function writeSetting(key, value) {
	try {
		localStorage.setItem(key, value)
		window.dispatchEvent(new CustomEvent('jacsuite:settingsChanged'))
	} catch {}
}

// Réordonne SIDEBAR_APPS selon l'ordre stocké : d'abord les ids présents
// dans `order` (dans cet ordre), puis tout app non listé (nouveautés).
function orderedApps(order) {
	const safe = Array.isArray(order) ? order.filter((id) => SIDEBAR_APPS.some((a) => a.id === id)) : []
	const rest = DEFAULT_ORDER.filter((id) => !safe.includes(id))
	return [...safe, ...rest].map((id) => SIDEBAR_APPS.find((a) => a.id === id)).filter(Boolean)
}

// ── Aperçu au survol : lecture directe des stores persistés (localStorage) ──
// On lit le state zustand persist sans importer les stores des apps (couplage
// minimal). Format : { state: {...}, version }.
function readPersistedState(key) {
	try {
		const raw = localStorage.getItem(key)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		return parsed?.state ?? parsed
	} catch {
		return null
	}
}

const PREVIEW_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function previewDayLabel(value) {
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return ''
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const t = new Date(d)
	t.setHours(0, 0, 0, 0)
	const diff = Math.round((t - today) / 86400000)
	if (diff === 0) return "Aujourd'hui"
	if (diff === 1) return 'Demain'
	if (diff === -1) return 'Hier'
	return `${t.getDate()} ${PREVIEW_MONTHS[t.getMonth()]}`
}

function previewTimeLabel(value) {
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}

function isTaskLate(dueDate) {
	if (!dueDate) return false
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const d = new Date(dueDate)
	d.setHours(0, 0, 0, 0)
	return d < today
}

// 5 prochaines tâches à faire (non terminées), par échéance croissante.
function getUpcomingTasks(limit = 5) {
	const state = readPersistedState('jacsuite:jactache:v1')
	const tasks = Array.isArray(state?.tasks) ? state.tasks : []
	return tasks
		.filter((t) => t && t.status !== 'done')
		.sort((a, b) => {
			if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
			if (a.dueDate) return -1
			if (b.dueDate) return 1
			return 0
		})
		.slice(0, limit)
}

// 5 prochains événements (aujourd'hui et après), par début croissant.
function getUpcomingEvents(limit = 5) {
	const state = readPersistedState('jacsuite:jaccalendrier:v1')
	const events = Array.isArray(state?.events) ? state.events : []
	const calendars = Array.isArray(state?.calendars) ? state.calendars : []
	const calById = {}
	calendars.forEach((c) => { calById[c.id] = c })
	const todayStart = new Date()
	todayStart.setHours(0, 0, 0, 0)
	return events
		.filter((e) => {
			if (!e || !e.start) return false
			const end = e.end ? new Date(e.end) : new Date(e.start)
			return end >= todayStart
		})
		.map((e) => ({ ...e, _calColor: calById[e.calendarId]?.color || '#39FF14' }))
		.sort((a, b) => new Date(a.start) - new Date(b.start))
		.slice(0, limit)
}

// Barre latérale d'apps style Microsoft Edge : rail fixe d'icônes présent
// partout dans le shell JacSuite. Un clic OUVRE l'app dans le panneau ancré
// (cf. SuiteAppPanel rendu par SuiteShell). Entièrement configurable via
// Paramètres > JacSuite > Général > Barre latérale : côté, taille des icônes,
// libellés, apps visibles, ordre (glisser-déposer) et bouton +.
export default function SuiteSidebar({ activeApp, onSelectApp, side = 'right' }) {
	const order = useJacSuiteJson('jacsuite_sidebar_app_order', DEFAULT_ORDER)
	const visibleJson = useJacSuiteJson('jacsuite_sidebar_visible_apps', null)
	const iconSize = useJacSuiteSetting('jacsuite_sidebar_icon_size', 'medium')
	const showLabels = useJacSuiteBool('jacsuite_sidebar_show_labels', false)
	const showAddButton = useJacSuiteBool('jacsuite_sidebar_show_add_button', false)
	const hoverPreview = useJacSuiteBool('jacsuite_sidebar_hover_preview', true)

	const [dragId, setDragId] = useState(null)
	const [addOpen, setAddOpen] = useState(false)
	const [preview, setPreview] = useState(null) // { app, top } | null
	const previewTimer = useRef(null)

	useEffect(() => () => clearTimeout(previewTimer.current), [])

	// Ouvre l'aperçu pour JacTâche / JacCalendrier au survol de leur icône.
	const openPreview = (app, e) => {
		clearTimeout(previewTimer.current)
		if (!hoverPreview || (app !== 'jactache' && app !== 'jaccalendrier')) {
			setPreview(null)
			return
		}
		const r = e.currentTarget.getBoundingClientRect()
		const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - 348))
		setPreview({ app, top })
	}
	const scheduleClosePreview = () => {
		clearTimeout(previewTimer.current)
		previewTimer.current = setTimeout(() => setPreview(null), 140)
	}
	const cancelClosePreview = () => clearTimeout(previewTimer.current)

	// Liste d'ids visibles : null/[] = toutes visibles (défaut).
	const visibleSet = Array.isArray(visibleJson) && visibleJson.length > 0 ? new Set(visibleJson) : null
	const isVisible = (id) => (visibleSet ? visibleSet.has(id) : true)

	const apps = orderedApps(order)
	const shownApps = apps.filter((a) => isVisible(a.id))
	const hiddenApps = apps.filter((a) => !isVisible(a.id))

	const commitOrder = (ids) => writeSetting('jacsuite_sidebar_app_order', JSON.stringify(ids))

	const onDrop = (targetId) => {
		if (!dragId || dragId === targetId) { setDragId(null); return }
		const ids = apps.map((a) => a.id)
		const from = ids.indexOf(dragId)
		const to = ids.indexOf(targetId)
		if (from === -1 || to === -1) { setDragId(null); return }
		ids.splice(to, 0, ids.splice(from, 1)[0])
		commitOrder(ids)
		setDragId(null)
	}

	const addApp = (id) => {
		const next = shownApps.map((a) => a.id)
		if (!next.includes(id)) next.push(id)
		writeSetting('jacsuite_sidebar_visible_apps', JSON.stringify(next))
		setAddOpen(false)
	}

	// Données d'aperçu lues à la volée depuis les stores persistés.
	const previewTasks = preview?.app === 'jactache' ? getUpcomingTasks() : []
	const previewEvents = preview?.app === 'jaccalendrier' ? getUpcomingEvents() : []
	const previewStyle = preview
		? (side === 'left'
			? { top: `${preview.top}px`, left: '60px' }
			: { top: `${preview.top}px`, right: '60px' })
		: null

	return (
		<nav
			className="suite-sidebar"
			aria-label="Applications JacSuite"
			data-side={side}
			data-size={iconSize}
			data-labels={showLabels ? 'true' : 'false'}
		>
			<div className="suite-sidebar__apps">
				{shownApps.map((a) => (
					<button
						key={a.id}
						type="button"
						draggable
						className={`suite-sidebar__btn${activeApp === a.id ? ' suite-sidebar__btn--active' : ''}${dragId === a.id ? ' suite-sidebar__btn--dragging' : ''}`}
						title={a.name}
						aria-label={a.name}
						aria-pressed={activeApp === a.id}
						onClick={() => onSelectApp?.(a.id)}
						onMouseEnter={(e) => openPreview(a.id, e)}
						onMouseLeave={scheduleClosePreview}
						onDragStart={() => setDragId(a.id)}
						onDragOver={(e) => e.preventDefault()}
						onDrop={() => onDrop(a.id)}
						onDragEnd={() => setDragId(null)}
					>
						<img src={LOGOS[a.logo]} alt="" draggable="false" />
						{showLabels && <span className="suite-sidebar__label">{a.name}</span>}
						{!(hoverPreview && (a.id === 'jactache' || a.id === 'jaccalendrier')) && (
							<span className="suite-sidebar__tooltip">{a.name}</span>
						)}
					</button>
				))}
			</div>

			{showAddButton && (
				<div className="suite-sidebar__addwrap">
					<button
						type="button"
						className="suite-sidebar__add"
						title="Ajouter une app au rail"
						aria-label="Ajouter une app au rail"
						onClick={() => setAddOpen((v) => !v)}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="12" y1="5" x2="12" y2="19" />
							<line x1="5" y1="12" x2="19" y2="12" />
						</svg>
					</button>
					{addOpen && (
						<div className="suite-sidebar__addmenu" role="menu">
							{hiddenApps.length === 0 ? (
								<div className="suite-sidebar__addmenu-empty">Toutes les apps sont déjà affichées.</div>
							) : (
								hiddenApps.map((a) => (
									<button
										key={a.id}
										type="button"
										role="menuitem"
										className="suite-sidebar__addmenu-item"
										onClick={() => addApp(a.id)}
									>
										<img src={LOGOS[a.logo]} alt="" draggable="false" />
										<span>{a.name}</span>
									</button>
								))
							)}
						</div>
					)}
				</div>
			)}
			{preview && (
				<div
					className="suite-sidebar__preview"
					data-side={side}
					style={previewStyle}
					role="dialog"
					onMouseEnter={cancelClosePreview}
					onMouseLeave={scheduleClosePreview}
				>
					{preview.app === 'jactache' ? (
						<>
							<div className="suite-sidebar__preview-head">
								<img src={LOGOS.jactache} alt="" />
								<span>JacTâche · À faire</span>
							</div>
							{previewTasks.length === 0 ? (
								<div className="suite-sidebar__preview-empty">Aucune tâche en cours 🎉</div>
							) : (
								<ul className="suite-sidebar__preview-list">
									{previewTasks.map((t) => (
										<li key={t.id} className="suite-sidebar__preview-item">
											<span className="suite-sidebar__preview-dot" data-prio={t.priority} />
											<span className="suite-sidebar__preview-title">{t.title}</span>
											{t.dueDate && (
												<span className="suite-sidebar__preview-meta" data-late={isTaskLate(t.dueDate) ? 'true' : 'false'}>
													{previewDayLabel(t.dueDate)}
												</span>
											)}
										</li>
									))}
								</ul>
							)}
							<button type="button" className="suite-sidebar__preview-open" onClick={() => { onSelectApp?.('jactache'); setPreview(null) }}>
								Ouvrir JacTâche
							</button>
						</>
					) : (
						<>
							<div className="suite-sidebar__preview-head">
								<img src={LOGOS.jaccalendrier} alt="" />
								<span>JacCalendrier · À venir</span>
							</div>
							{previewEvents.length === 0 ? (
								<div className="suite-sidebar__preview-empty">Aucun événement à venir</div>
							) : (
								<ul className="suite-sidebar__preview-list">
									{previewEvents.map((ev) => {
										const dotStyle = { background: ev._calColor }
										return (
											<li key={ev.id} className="suite-sidebar__preview-item">
												<span className="suite-sidebar__preview-dot" style={dotStyle} />
												<span className="suite-sidebar__preview-title">{ev.title}</span>
												<span className="suite-sidebar__preview-meta">
													{ev.allDay ? `${previewDayLabel(ev.start)} · Journée` : `${previewDayLabel(ev.start)} ${previewTimeLabel(ev.start)}`}
												</span>
											</li>
										)
									})}
								</ul>
							)}
							<button type="button" className="suite-sidebar__preview-open" onClick={() => { onSelectApp?.('jaccalendrier'); setPreview(null) }}>
								Ouvrir JacCalendrier
							</button>
						</>
					)}
				</div>
			)}
		</nav>
	)
}