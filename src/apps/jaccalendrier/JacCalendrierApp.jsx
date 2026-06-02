// JacCalendrierApp.jsx
// Conteneur racine de JacCalendrier. Trois zones : sidebar, toolbar, vue principale.
// Écoute jacsuite:task-to-event pour créer un événement depuis une tâche JacTâche.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { useJacCalendrierStore } from './useJacCalendrierStore'
import { useJacSuiteEvent } from './jacsuiteEvents'
import { useJacCalendrierViewPrefs } from '@/apps/jaccalendrier/hooks/useJacCalendrierViewPrefs'
import { useJacCalendrierSettings } from '@/apps/jaccalendrier/hooks/useJacCalendrierSettings'
import { useJacCalendrierShortcuts } from '@/apps/jaccalendrier/hooks/useJacCalendrierShortcuts'
import { useJacCalendrierReminderScheduler } from '@/apps/jaccalendrier/hooks/useJacCalendrierReminderScheduler'
import { useJacCalendrierDailyDigest } from '@/apps/jaccalendrier/hooks/useJacCalendrierDailyDigest'
import { JacCalendrierSidebar } from './JacCalendrierSidebar'
import { JacCalendrierMonth } from './JacCalendrierMonth'
import { JacCalendrierTimedView } from './JacCalendrierTimedView'
import { JacCalendrierEventModal } from './JacCalendrierEventModal'
import './JacCalendrier.css'

const VIEW_LABELS = { month: 'Mois', week: 'Semaine', day: 'Jour' }

// Même matcher d'accord clavier que JacTacheApp (dupliqué ici plutôt qu'extrait
// dans shared/ pour garder chaque app autonome). Parse "ctrl+shift+k" ou "n",
// avec ctrl/meta interchangeables (Mac vs Windows/Linux) et normalisation des
// flèches (arrowleft → left, etc.) + espace.
function matchShortcut(combo, e) {
	if (!combo) return false
	const parts = String(combo).toLowerCase().split('+').map((s) => s.trim())
	const key = parts[parts.length - 1]
	const needCtrl = parts.includes('ctrl') || parts.includes('meta') || parts.includes('cmd')
	const needShift = parts.includes('shift')
	const needAlt = parts.includes('alt')
	if (Boolean(e.ctrlKey || e.metaKey) !== needCtrl) return false
	if (Boolean(e.shiftKey) !== needShift) return false
	if (Boolean(e.altKey) !== needAlt) return false
	let actual = (e.key || '').toLowerCase()
	if (actual === 'arrowleft') actual = 'left'
	else if (actual === 'arrowright') actual = 'right'
	else if (actual === 'arrowup') actual = 'up'
	else if (actual === 'arrowdown') actual = 'down'
	else if (actual === ' ') actual = 'space'
	return actual === key
}

export function JacCalendrierApp() {
	const view = useJacCalendrierStore((s) => s.view)
	const cursorDate = useJacCalendrierStore((s) => s.cursorDate)
	const setView = useJacCalendrierStore((s) => s.setView)
	const shiftCursor = useJacCalendrierStore((s) => s.shiftCursor)
	const goToday = useJacCalendrierStore((s) => s.goToday)
	const addEvent = useJacCalendrierStore((s) => s.addEvent)

	// Préférences live depuis FullSettingsModal. Le hook re-render sur
	// 'jacsuite:settingsChanged' → toute modification dans Settings se voit
	// instantanément. On expose tout via data-attributes + CSS variables au
	// root .jaccalendrier-app pour que la grille, les bordures, le mini-mois
	// et la timed view se restylent sans prop drilling.
	const viewPrefs = useJacCalendrierViewPrefs()
	const settings = useJacCalendrierSettings()

	// Raccourcis utilisateur (live) — mapping action → combo. Re-render sur
	// 'jacsuite:settingsChanged' quand l'utilisateur remappe une touche.
	const shortcuts = useJacCalendrierShortcuts()

	// Scheduler de rappels d'événements. Kill-switch interne via
	// useJacCalendrierReminders().enabled : quand off, aucun setInterval,
	// aucune permission Notification, rien. Branché ici pour couvrir tous
	// les événements du store quelle que soit la vue active.
	useJacCalendrierReminderScheduler()

	// Digest quotidien : notification à dailyDigestTime résumant les
	// événements visibles du jour. Kill-switch via reminders.dailyDigest.
	useJacCalendrierDailyDigest()

	// === Remember last view ===
	// Persiste la vue active (month / week / day) quand le toggle Settings
	// > Général > « Se souvenir de la dernière vue » est on. Restaure au
	// montage. Si off, c'est la vue par défaut (settings.defaultView, gérée
	// par le store) qui est utilisée. Clé localStorage stable, isolée par
	// app pour qu'un futur JacAgenda partage le pattern sans collision.
	const LAST_VIEW_KEY = 'jacsuite:jaccalendrier:lastView'
	useEffect(() => {
		if (!settings.rememberLastView) return
		try {
			const last = localStorage.getItem(LAST_VIEW_KEY)
			if (last && ['month', 'week', 'day'].includes(last) && last !== view) {
				setView(last)
			}
		} catch {}
		// On ne veut restaurer qu'au montage initial — sinon une bascule manuelle
		// déclencherait un re-restore en boucle. Dépendances volontairement vides.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	useEffect(() => {
		if (!settings.rememberLastView) return
		try { localStorage.setItem(LAST_VIEW_KEY, view) } catch {}
	}, [view, settings.rememberLastView])

	// État local : modal d'édition (création ou édition)
	const [modal, setModal] = useState(null)
	// null | { mode: 'create' | 'edit', defaultDate?: string, eventId?: string }

	// État de réduction de la sidebar — persisté en localStorage pour que
	// la préférence survive aux rechargements. Quand collapsed=true, la
	// première colonne de la grille passe de --jc-sidebar-width à 48px et
	// la sidebar n'affiche plus que les icônes (voir JacCalendrier.css,
	// section « Sidebar réduite »). Même pattern que JacTacheApp.
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		try { return localStorage.getItem('jacsuite:jaccalendrier:sidebarCollapsed') === '1' }
		catch { return false }
	})
	const toggleSidebar = () => {
		setSidebarCollapsed((v) => {
			const next = !v
			try { localStorage.setItem('jacsuite:jaccalendrier:sidebarCollapsed', next ? '1' : '0') } catch {}
			return next
		})
	}

	// Largeur personnalisable de la sidebar (en pixels). Clamp min 200 / max
	// 480 — min un peu plus large que JacTâche (180) car le mini-mois a
	// besoin de place pour rester lisible. Persisté à chaque changement via
	// useEffect ; React batche les writes pendant le drag, donc le storage
	// n'est pas spammé.
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		try {
			const v = parseInt(localStorage.getItem('jacsuite:jaccalendrier:sidebarWidth') || '', 10)
			return Number.isFinite(v) && v >= 200 && v <= 480 ? v : 260
		} catch { return 260 }
	})
	useEffect(() => {
		try { localStorage.setItem('jacsuite:jaccalendrier:sidebarWidth', String(sidebarWidth)) } catch {}
	}, [sidebarWidth])

	// Drag handler du handle de redimensionnement. Même pattern que JacTache :
	// listeners attachés à window pour ne pas casser quand la souris quitte
	// le handle ; cursor + user-select sur <body> pendant le drag pour
	// éviter les effets parasites (curseur qui flicker, sélection de texte).
	const startSidebarResize = (e) => {
		if (sidebarCollapsed) return
		e.preventDefault()
		const startX = e.clientX
		const startW = sidebarWidth
		const onMove = (ev) => {
			const next = Math.max(200, Math.min(480, startW + (ev.clientX - startX)))
			setSidebarWidth(next)
		}
		const onUp = () => {
			window.removeEventListener('mousemove', onMove)
			window.removeEventListener('mouseup', onUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}
		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'
		window.addEventListener('mousemove', onMove)
		window.addEventListener('mouseup', onUp)
	}

	// === Mode « Sidebar flottante » (calque sur le pattern JacNote) ===
	// La sidebar disparaît du flux et apparaît en superposition au survol
	// du bord de l'écran ou en cliquant le bouton « panneau latéral » de
	// la tab bar JacSuite. Set de régions ('zone' + 'sidebar') pour
	// neutraliser les events parasites pendant l'animation de glissement.
	const [sidebarFloating, setSidebarFloating] = useStoredSetting('jaccalendrier_settings_sidebar_floating', 'false')
	const isFloating = sidebarFloating === 'true'
	const [floatingOpen, setFloatingOpen] = useState(false)
	const floatingCloseTimerRef = useRef(null)
	const appRootRef = useRef(null)
	const settingsOpenRef = useRef(false)
	const hoverRegionsRef = useRef(new Set())
	const revealFloatingSidebar = () => {
		if (floatingCloseTimerRef.current) {
			clearTimeout(floatingCloseTimerRef.current)
			floatingCloseTimerRef.current = null
		}
		setFloatingOpen(true)
	}
	const scheduleHideFloatingSidebar = () => {
		if (settingsOpenRef.current) return
		if (floatingCloseTimerRef.current) clearTimeout(floatingCloseTimerRef.current)
		floatingCloseTimerRef.current = setTimeout(() => {
			setFloatingOpen(false)
			floatingCloseTimerRef.current = null
		}, 150)
	}
	const enterHoverRegion = (region) => {
		hoverRegionsRef.current.add(region)
		revealFloatingSidebar()
	}
	const leaveHoverRegion = (region) => {
		hoverRegionsRef.current.delete(region)
		if (hoverRegionsRef.current.size === 0) scheduleHideFloatingSidebar()
	}
	const handleSettingsOpenChange = (open) => {
		settingsOpenRef.current = open
		if (open) {
			if (floatingCloseTimerRef.current) {
				clearTimeout(floatingCloseTimerRef.current)
				floatingCloseTimerRef.current = null
			}
			if (isFloating) setFloatingOpen(true)
		}
	}
	useEffect(() => {
		if (!isFloating) setFloatingOpen(false)
	}, [isFloating])
	useEffect(() => {
		if (!isFloating) return
		const root = appRootRef.current
		if (!root) return
		const sb = root.querySelector('.jaccalendrier-sidebar')
		if (!sb) return
		const onEnter = () => enterHoverRegion('sidebar')
		const onLeave = () => leaveHoverRegion('sidebar')
		sb.addEventListener('mouseenter', onEnter)
		sb.addEventListener('mouseleave', onLeave)
		return () => {
			sb.removeEventListener('mouseenter', onEnter)
			sb.removeEventListener('mouseleave', onLeave)
			hoverRegionsRef.current.delete('sidebar')
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isFloating])

	// Raccourcis clavier globaux — pilotés par useJacCalendrierShortcuts.
	// Sept actions ont un handler direct (newEvent, goToToday, prev/next,
	// view day/week/month). Les actions encore non implémentées (goToDate,
	// viewAgenda, quickSearch) sont relayées via un événement custom que des
	// composants futurs (palette de commande, modal Go-to-date…) pourront
	// écouter. Tous les ignorés si la frappe vient d'un champ éditable.
	useEffect(() => {
		const handler = (e) => {
			const tag = (e.target?.tagName || '').toLowerCase()
			const inField =
				tag === 'input' ||
				tag === 'textarea' ||
				e.target?.isContentEditable
			if (inField) return

			if (matchShortcut(shortcuts.newEvent, e)) {
				e.preventDefault()
				setModal({ mode: 'create' })
				return
			}
			if (matchShortcut(shortcuts.goToToday, e)) {
				e.preventDefault()
				goToday()
				return
			}
			if (matchShortcut(shortcuts.prevPeriod, e)) {
				e.preventDefault()
				shiftCursor(-1)
				return
			}
			if (matchShortcut(shortcuts.nextPeriod, e)) {
				e.preventDefault()
				shiftCursor(1)
				return
			}
			if (matchShortcut(shortcuts.viewDay, e)) {
				e.preventDefault()
				setView('day')
				return
			}
			if (matchShortcut(shortcuts.viewWeek, e)) {
				e.preventDefault()
				setView('week')
				return
			}
			if (matchShortcut(shortcuts.viewMonth, e)) {
				e.preventDefault()
				setView('month')
				return
			}
			const handled = new Set([
				'newEvent', 'goToToday', 'prevPeriod', 'nextPeriod',
				'viewDay', 'viewWeek', 'viewMonth',
			])
			for (const [action, combo] of Object.entries(shortcuts)) {
				if (handled.has(action)) continue
				if (matchShortcut(combo, e)) {
					e.preventDefault()
					window.dispatchEvent(
						new CustomEvent('jacsuite:jaccalendrier:shortcut', {
							detail: { action },
						}),
					)
					return
				}
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [shortcuts, goToday, shiftCursor, setView])

	// Cross-app : convertir une tâche JacTâche en événement
	useJacSuiteEvent('task-to-event', ({ task }) => {
		if (!task) return
		const start = task.dueDate ?? new Date().toISOString()
		addEvent({
			title: task.title,
			description:
				typeof task.description === 'string'
					? task.description
					: task.description?.text ?? null,
			start,
			allDay: true,
			linkedTaskId: task.id,
		})
	})

	// Libellé central de la toolbar — dépend de la vue active :
	//   - month : « mai 2026 »
	//   - week  : « 12–18 mai 2026 » (ou « 28 avril – 4 mai 2026 » si à cheval)
	//   - day   : « mardi 14 mai 2026 »
	const titleLabel = useMemo(() => {
		const cur = new Date(cursorDate)
		if (view === 'month') {
			return cur.toLocaleDateString('fr-CA', {
				month: 'long',
				year: 'numeric',
			})
		}
		if (view === 'day') {
			return cur.toLocaleDateString('fr-CA', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			})
		}
		// view === 'week' : on calcule lundi → dimanche autour du curseur.
		const offset = (cur.getDay() + 6) % 7
		const monday = new Date(cur)
		monday.setDate(cur.getDate() - offset)
		const sunday = new Date(monday)
		sunday.setDate(monday.getDate() + 6)
		const sameMonth = monday.getMonth() === sunday.getMonth()
		if (sameMonth) {
			const monthYear = monday.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })
			return `${monday.getDate()}–${sunday.getDate()} ${monthYear}`
		}
		const mondayLabel = monday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
		const sundayLabel = sunday.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
		return `${mondayLabel} – ${sundayLabel}`
	}, [cursorDate, view])

	return (
		<div
			ref={appRootRef}
			className="jaccalendrier-app"
			data-sidebar-collapsed={sidebarCollapsed}
			data-sidebar-floating={isFloating}
			data-sidebar-floating-open={isFloating && floatingOpen ? 'true' : 'false'}
			data-density={viewPrefs.density}
			data-show-week-numbers={viewPrefs.showWeekNumbers ? 'on' : 'off'}
			data-show-weekends={viewPrefs.showWeekends ? 'on' : 'off'}
			data-grid-style={viewPrefs.gridStyle}
			data-highlight-current-time={viewPrefs.highlightCurrentTime ? 'on' : 'off'}
			data-time-format={settings.timeFormat}
			data-week-start={settings.weekStart}
			style={ {
				'--jc-sidebar-width': `${sidebarWidth}px`,
				'--jc-hour-height': `${viewPrefs.hourHeight}px`,
				'--jc-default-event-color': viewPrefs.defaultEventColor,
				'--jc-day-start-hour': settings.dayStartHour,
				'--jc-day-end-hour': settings.dayEndHour,
			} }
		>
			<JacCalendrierSidebar
				onCreate={() => setModal({ mode: 'create' })}
				collapsed={sidebarCollapsed}
				onToggle={toggleSidebar}
				isFloating={isFloating}
				onCloseFloating={() => setSidebarFloating('false')}
				onSettingsOpenChange={handleSettingsOpenChange}
			/>
			{isFloating && (
				<div
					className="jaccalendrier-app__floating-hover-zone"
					onMouseEnter={() => enterHoverRegion('zone')}
					onMouseLeave={() => leaveHoverRegion('zone')}
					aria-hidden="true"
				/>
			)}
			{/* Handle de redimensionnement — overlay absolu sur la frontière
			    entre sidebar et zone principale. Hors flux de la grille grâce à
			    position: absolute. Masqué quand la sidebar est réduite (largeur
			    fixée à 48px dans ce mode). */}
			{!sidebarCollapsed && (
				<div
					className="jaccalendrier-app__sidebar-resize"
					title="Redimensionner la sidebar"
					onMouseDown={startSidebarResize}
				/>
			)}

			<section className="jaccalendrier-main">
				<header className="jaccalendrier-toolbar">
					<div className="jaccalendrier-toolbar__nav">
						<button
							type="button"
							className="jaccalendrier-toolbar__today"
							onClick={goToday}
						>
							Aujourd'hui
						</button>
						<button
							type="button"
							className="jaccalendrier-toolbar__arrow"
							onClick={() => shiftCursor(-1)}
							aria-label="Précédent"
						>
							‹
						</button>
						<button
							type="button"
							className="jaccalendrier-toolbar__arrow"
							onClick={() => shiftCursor(1)}
							aria-label="Suivant"
						>
							›
						</button>
						<h1 className="jaccalendrier-toolbar__title">
							{titleLabel}
						</h1>
					</div>

					<div className="jaccalendrier-toolbar__views">
						{Object.entries(VIEW_LABELS).map(([k, label]) => (
							<button
								key={k}
								type="button"
								className="jaccalendrier-toolbar__view"
								data-active={view === k}
								onClick={() => setView(k)}
							>
								{label}
							</button>
						))}
					</div>
				</header>

				{/* Routage vue → composant. Month garde sa grille 6×7 ; Week
				    et Day partagent JacCalendrierTimedView qui dérive sa colonne
				    count depuis le store. Les deux handlers (création + édition)
				    sont identiques pour toutes les vues. */}
				{view === 'month' ? (
					<JacCalendrierMonth
						onCellClick={(iso) =>
							setModal({ mode: 'create', defaultDate: iso })
						}
						onEventClick={(eventId) =>
							setModal({ mode: 'edit', eventId })
						}
					/>
				) : (
					<JacCalendrierTimedView
						onCellClick={(iso) =>
							setModal({ mode: 'create', defaultDate: iso })
						}
						onEventClick={(eventId) =>
							setModal({ mode: 'edit', eventId })
						}
					/>
				)}
			</section>

			{modal && (
				<JacCalendrierEventModal
					mode={modal.mode}
					defaultDate={modal.defaultDate}
					eventId={modal.eventId}
					onClose={() => setModal(null)}
				/>
			)}
		</div>
	)
}

export default JacCalendrierApp