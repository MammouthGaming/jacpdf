// JacTacheApp.jsx
// Conteneur principal de JacTâche. Trois colonnes : sidebar, liste, détail.
// Gère les raccourcis globaux et les événements croisés JacSuite.

import React, { useEffect, useRef, useState } from 'react'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { useJacTacheStore } from './useJacTacheStore'
import { useJacSuiteEvent, setJacSuiteBridge, isJacSuiteBridgeEnabled } from './jacsuiteEvents'
import { useJacTacheViewPrefs } from '@/apps/jactache/hooks/useJacTacheViewPrefs'
import { useJacTacheShortcuts } from '@/apps/jactache/hooks/useJacTacheShortcuts'
import { useJacTacheReminderScheduler } from '@/apps/jactache/hooks/useJacTacheReminderScheduler'
import { useJacTacheDailyDigest } from '@/apps/jactache/hooks/useJacTacheDailyDigest'
import { useJacTacheCalendarBridge } from '@/apps/jactache/hooks/useJacTacheCalendarBridge'
import { useJacTacheDocBridge } from '@/apps/jactache/hooks/useJacTacheDocBridge'
import { useJacTacheClasseBridge } from '@/apps/jactache/hooks/useJacTacheClasseBridge'
import { JacTacheSidebar } from './JacTacheSidebar'
import { JacTacheList } from './JacTacheList'
import { JacTacheDetail } from './JacTacheDetail'
import './JacTache.css'

// Petit matcher d'accord clavier. Parse une combo "ctrl+shift+k" ou "n"
// et la compare à un KeyboardEvent. ctrl et meta sont interchangeables
// pour faire fonctionner les raccourcis sur Mac (cmd) et Windows/Linux
// (ctrl) sans avoir deux jeux séparés. Les touches fléchées sont
// normalisées en 'left'/'right'/'up'/'down', et ' ' en 'space'.
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

export function JacTacheApp() {
	const addTask = useJacTacheStore((s) => s.addTask)
	const selectedTaskId = useJacTacheStore((s) => s.selectedTaskId)

	// Lit en live les préférences d'apparence (densité, style de checkbox,
	// animation, avatar projet). Le hook re-render sur 'jacsuite:settingsChanged',
	// donc tout changement dans FullSettingsModal se propage immédiatement.
	// On expose les valeurs via data-attributes sur la racine .jactache-app
	// pour que le CSS pilote l'apparence sans prop drilling.
	const viewPrefs = useJacTacheViewPrefs()

	// Raccourcis utilisateur (live). Mapping action → combo, ex.
	// { newTask:'n', quickSearch:'ctrl+k', ... }. Re-render sur
	// 'jacsuite:settingsChanged' → le useEffect plus bas ré-attache
	// un handler à jour quand l'utilisateur remappe une touche.
	const shortcuts = useJacTacheShortcuts()

	// Scheduler de rappels. Le hook contient son propre kill-switch : si
	// l'utilisateur désactive « Rappels activés » dans Settings > Notifications,
	// aucun setInterval n'est créé et aucune permission n'est demandée. Branché
	// ici une seule fois pour que toutes les tâches avec dueDate bénéficient
	// d'un rappel, peu importe l'écran courant.
	useJacTacheReminderScheduler()

	// Digest quotidien : notification à dailyDigestTime résumant les tâches
	// dues du jour. Kill-switch via reminders.dailyDigest.
	useJacTacheDailyDigest()

	// === Ponts d'intégration JacSuite ===
	// Les hooks lisent les toggles de Settings > Intégrations en live. On
	// publie leur valeur dans le module jacsuiteEvents (gates module-level)
	// pour que `emitJacSuite` puisse les consulter à chaque émission depuis
	// le store Zustand, qui n'a pas accès aux hooks React.
	//
	//   - jactacheToJaccalendrier : coupe les events task-* vers JacCalendrier
	//     (les tâches datées n'apparaissent plus sur le calendrier en live).
	//   - jactacheToJacdoc : prévu pour l'extension Tiptap (cases JacTâche
	//     embarquées dans JacDoc) ; le gate est publié ici, le côté consommation
	//     vivra dans l'extension.
	//   - jactacheToClasse : prévu pour le module Classe (devoirs/évaluations).
	const calendarBridge = useJacTacheCalendarBridge()
	const docBridge = useJacTacheDocBridge()
	const classeBridge = useJacTacheClasseBridge()
	useEffect(() => {
		setJacSuiteBridge('jactacheToJaccalendrier', calendarBridge)
		setJacSuiteBridge('jactacheToJacdoc', docBridge)
		setJacSuiteBridge('jactacheToClasse', classeBridge)
	}, [calendarBridge, docBridge, classeBridge])

	// État de réduction de la sidebar — persisté en localStorage pour que
	// la préférence survive aux rechargements. Quand collapsed=true, la
	// première colonne de la grille passe de 240px à 48px et la sidebar
	// n'affiche plus que les icônes (voir JacTache.css, section « Sidebar
	// réduite »). On lift l'état ici pour pouvoir piloter aussi la grille
	// CSS de .jactache-app via data-sidebar-collapsed.
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		try { return localStorage.getItem('jacsuite:jactache:sidebarCollapsed') === '1' }
		catch { return false }
	})
	const toggleSidebar = () => {
		setSidebarCollapsed((v) => {
			const next = !v
			try { localStorage.setItem('jacsuite:jactache:sidebarCollapsed', next ? '1' : '0') } catch {}
			return next
		})
	}

	// Largeur personnalisable de la sidebar (en pixels). Clamp min 180 / max
	// 480 pour éviter des états inutilisables (trop étroit pour les libellés,
	// trop large pour la liste). Persisté dans localStorage à chaque changement
	// via un useEffect plutôt qu'à chaque mousemove pour ne pas spammer le
	// storage pendant le drag (et c'est un seul write à la fin du drag grâce
	// au batching React).
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		try {
			const v = parseInt(localStorage.getItem('jacsuite:jactache:sidebarWidth') || '', 10)
			return Number.isFinite(v) && v >= 180 && v <= 480 ? v : 240
		} catch { return 240 }
	})
	useEffect(() => {
		try { localStorage.setItem('jacsuite:jactache:sidebarWidth', String(sidebarWidth)) } catch {}
	}, [sidebarWidth])

	// Drag handler du handle de redimensionnement. On capture la position
	// initiale et la largeur de départ au mousedown, puis on calcule la
	// nouvelle largeur à chaque mousemove (clampée min/max). Les listeners
	// sont attachés à window pour continuer à fonctionner même quand la
	// souris quitte le handle (sinon le drag se casse dès qu'on bouge vite).
	// cursor + user-select sur <body> évitent un curseur qui flicker et la
	// sélection de texte parasite pendant le drag.
	const startSidebarResize = (e) => {
		if (sidebarCollapsed) return
		e.preventDefault()
		const startX = e.clientX
		const startW = sidebarWidth
		const onMove = (ev) => {
			const next = Math.max(180, Math.min(480, startW + (ev.clientX - startX)))
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
	// la tab bar JacSuite. Set de régions ('zone' + 'sidebar') : tant qu'au
	// moins une région est dedans, l'overlay reste ouvert. Évite le bug
	// pendant l'animation où la sidebar glisse sous un curseur immobile
	// dans la hover zone.
	const [sidebarFloating, setSidebarFloating] = useStoredSetting('jactache_settings_sidebar_floating', 'false')
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
		const sb = root.querySelector('.jactache-sidebar')
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

	// Raccourcis clavier globaux — pilotés en live par useJacTacheShortcuts.
	// On ignore les frappes faites dans un champ éditable (sinon on intercepte
	// l'utilisateur en train de taper le titre d'une tâche). On branche
	// directement les actions dont les handlers existent (newTask) ; pour les
	// autres on émet un événement custom 'jacsuite:jactache:shortcut' que des
	// composants périphériques (sidebar, recherche, modal de projet…) pourront
	// écouter quand ils seront prêts, sans avoir à remonter ici.
	useEffect(() => {
		const handler = (e) => {
			const tag = (e.target?.tagName || '').toLowerCase()
			const inField =
				tag === 'input' ||
				tag === 'textarea' ||
				e.target?.isContentEditable
			if (inField) return

			if (matchShortcut(shortcuts.newTask, e)) {
				e.preventDefault()
				addTask({ title: '' })
				return
			}
			for (const [action, combo] of Object.entries(shortcuts)) {
				if (action === 'newTask') continue
				if (matchShortcut(combo, e)) {
					e.preventDefault()
					window.dispatchEvent(
						new CustomEvent('jacsuite:jactache:shortcut', {
							detail: { action },
						}),
					)
					return
				}
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [addTask, shortcuts])

	// Exemple d'intégration cross-app : si JacCalendrier demande de transformer
	// un événement en tâche, on l'ajoute ici.
	// Reverse bridge : on respecte le même toggle « Intégrations » que les
	// events sortants. Si l'utilisateur a coupé `jactacheToJaccalendrier`,
	// on ignore les conversions d'événements en tâches (cohérence avec le
	// filtre EVENT_BRIDGE_REQUIREMENTS appliqué dans emitJacSuite).
	useJacSuiteEvent('event-to-task', ({ event }) => {
		if (!event) return
		if (!isJacSuiteBridgeEnabled('jactacheToJaccalendrier')) return
		addTask({
			title: event.title,
			dueDate: event.start,
			description: event.description ?? null,
		})
	})

	return (
		<div
			ref={appRootRef}
			className="jactache-app"
			data-has-detail={Boolean(selectedTaskId)}
			data-sidebar-collapsed={sidebarCollapsed}
			data-sidebar-floating={isFloating}
			data-sidebar-floating-open={isFloating && floatingOpen ? 'true' : 'false'}
			data-density={viewPrefs.density}
			data-checkbox-style={viewPrefs.checkboxStyle}
			data-check-animation={viewPrefs.checkAnimation ? 'on' : 'off'}
			data-show-project-avatar={viewPrefs.showProjectAvatar ? 'on' : 'off'}
			data-hide-completed={viewPrefs.hideCompleted ? 'on' : 'off'}
			data-show-sidebar-counts={viewPrefs.showSidebarCounts ? 'on' : 'off'}
			style={ { '--jt-sidebar-width': `${sidebarWidth}px` } }
		>
			<JacTacheSidebar
				collapsed={sidebarCollapsed}
				onToggle={toggleSidebar}
				isFloating={isFloating}
				onCloseFloating={() => setSidebarFloating('false')}
				onSettingsOpenChange={handleSettingsOpenChange}
			/>
			{isFloating && (
				<div
					className="jactache-app__floating-hover-zone"
					onMouseEnter={() => enterHoverRegion('zone')}
					onMouseLeave={() => leaveHoverRegion('zone')}
					aria-hidden="true"
				/>
			)}
			{/* Handle de redimensionnement — overlay absolu sur la frontière
			    entre sidebar et liste. position: absolute le sort du flux de la
			    grille (sinon il prendrait une colonne entière). Masqué quand la
			    sidebar est réduite : la largeur est fixée à 48px dans ce mode
			    et le redimensionnement n'a pas de sens. */}
			{!sidebarCollapsed && (
				<div
					className="jactache-app__sidebar-resize"
					title="Redimensionner la sidebar"
					onMouseDown={startSidebarResize}
				/>
			)}
			<JacTacheList />
			{selectedTaskId && <JacTacheDetail />}
		</div>
	)
}

export default JacTacheApp