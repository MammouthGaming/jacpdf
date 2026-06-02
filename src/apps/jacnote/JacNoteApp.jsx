// JacNoteApp.jsx
// Conteneur principal de JacNote. Trois colonnes : sidebar, liste, détail.
// Calque structurel de JacTacheApp.jsx.

import React, { useEffect, useRef, useState } from 'react'
import { useJacNoteStore } from './useJacNoteStore'
import { JacNoteSidebar } from './JacNoteSidebar'
import { JacNoteList } from './JacNoteList'
import { JacNoteDetail } from './JacNoteDetail'
import { JacNoteConfirm } from './JacNoteConfirm'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import { useJacNoteCloud } from './useJacNoteCloud'
import './JacNote.css'

export function JacNoteApp() {
	const addNote = useJacNoteStore((s) => s.addNote)

	// ---------- Sync cloud Supabase ----------
	// Monté une seule fois ici. Le hook pull au login, pousse les diffs en
	// débounce, et s'abonne au Realtime pour recevoir les mises à jour des
	// autres appareils. Sans session : no-op silencieux.
	useJacNoteCloud()

	// ---------- Réglages JacNote (modal Paramètres globale) ----------
	const [density] = useStoredSetting('jacnote_settings_density', 'comfortable')
	const [sidebarPosition] = useStoredSetting('jacnote_settings_sidebar_position', 'left')
	const [sidebarFloating, setSidebarFloating] = useStoredSetting('jacnote_settings_sidebar_floating', 'false')
	const [textSize] = useStoredSetting('jacnote_settings_ui_text_size', 'medium')
	const [reducedMotion] = useStoredSetting('jacnote_settings_reduced_motion', 'false')
	const [newNoteKey] = useStoredSetting('jacnote_settings_shortcut_new_note', 'n')
	const [autoEmptyTrash] = useStoredSetting('jacnote_settings_auto_empty_trash', 'never')
	const [reopenLastNote] = useStoredSetting('jacnote_settings_reopen_last_note', 'true')

	// Si « rouvrir la dernière note » est désactivé : on efface la sélection au
	// montage. Le store conserve la valeur via persist, donc sans ce reset
	// l'app reprendrait toujours sur la note précédente.
	useEffect(() => {
		if (reopenLastNote === 'false') {
			useJacNoteStore.setState({ selectedNoteId: null })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Vidage automatique de la corbeille : tourne au montage puis toutes les
	// heures. Supprime définitivement les notes corbeillées depuis plus de
	// N jours (7, 30 ou 90). Setting 'never' = pas d'effet.
	useEffect(() => {
		if (autoEmptyTrash === 'never') return
		const days = parseInt(autoEmptyTrash, 10)
		if (!Number.isFinite(days) || days <= 0) return
		const sweep = () => {
			const cutoff = Date.now() - days * 86_400_000
			useJacNoteStore.setState((s) => ({
				notes: s.notes.filter(
					(n) => !n.trashedAt || new Date(n.trashedAt).getTime() > cutoff,
				),
			}))
		}
		sweep()
		const id = setInterval(sweep, 60 * 60 * 1000)
		return () => clearInterval(id)
	}, [autoEmptyTrash])

	// Réduction de la sidebar persistée en localStorage — voir JacTacheApp.
	const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
		try { return localStorage.getItem('jacsuite:jacnote:sidebarCollapsed') === '1' }
		catch { return false }
	})
	const toggleSidebar = () => {
		setSidebarCollapsed((v) => {
			const next = !v
			try { localStorage.setItem('jacsuite:jacnote:sidebarCollapsed', next ? '1' : '0') } catch {}
			return next
		})
	}

	// ---------- Mode « sidebar flottante » (façon Notion) ----------
	// Quand le setting Apparence est activé, la sidebar ne pousse plus le
	// contenu : elle disparaît du flux (en CSS via grid-template-columns) et
	// se révèle en overlay quand la souris :
	//   • entre dans la zone de hover invisible (12 px) au bord de l'écran,
	//   • entre sur le bouton hamburger fixe (top-left/right),
	//   • ou directement sur la sidebar (mouseenter sur le DOM .jacnote-sidebar).
	// Elle se referme dès que la souris quitte la sidebar, avec un délai
	// de tolérance de 150 ms (évite les fermetures involontaires lorsqu'on
	// traverse un popover/contextmenu enfant).
	const isFloating = sidebarFloating === 'true'
	const [floatingOpen, setFloatingOpen] = useState(false)
	const floatingCloseTimerRef = useRef(null)
	const appRootRef = useRef(null)
	// Verrou « Paramètres ouvert » : tant que la sidebar a son modal Paramètres
	// affiché, on empêche la fermeture automatique de l'overlay flottant
	// (le mouseleave de la sidebar déclenche normalement scheduleHide…, ce qui
	// ferait disparaître la sidebar pendant que l'utilisateur configure).
	const settingsOpenRef = useRef(false)
	// Ensemble des régions actuellement survolées ('zone' = bande de hover
	// au bord de l'écran, 'sidebar' = sidebar elle-même). Tant qu'au moins
	// une région est dedans, l'overlay reste ouvert. Évite le bug pendant
	// l'animation où la sidebar glisse sous un curseur immobile dans la
	// hover zone : la sidebar déclenche son propre mouseenter/leave, mais
	// la zone est toujours « dedans » dans le Set, donc on ne ferme pas.
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
	const toggleFloatingSidebar = () => {
		if (floatingOpen) {
			if (floatingCloseTimerRef.current) {
				clearTimeout(floatingCloseTimerRef.current)
				floatingCloseTimerRef.current = null
			}
			setFloatingOpen(false)
		} else {
			revealFloatingSidebar()
		}
	}

	// Si le setting est désactivé en cours de route, on referme l'overlay
	// (sinon il pourrait rester ouvert visuellement alors que le mode change).
	useEffect(() => {
		if (!isFloating) setFloatingOpen(false)
	}, [isFloating])
	// Nettoyage du timer au démontage.
	useEffect(() => () => {
		if (floatingCloseTimerRef.current) clearTimeout(floatingCloseTimerRef.current)
	}, [])

	// Mouseenter/leave directement sur le DOM de la sidebar. On évite de
	// wrapper <JacNoteSidebar /> dans un div supplémentaire, qui casserait
	// l'`order` CSS du grid quand la position est à droite. On enregistre
	// la sidebar dans le Set partagé — si elle glisse sous un curseur
	// stationnaire dans la hover zone, on aura {zone, sidebar} puis
	// {zone} après passage, jamais Set vide → pas de fermeture.
	useEffect(() => {
		if (!isFloating) return
		const root = appRootRef.current
		if (!root) return
		const sb = root.querySelector('.jacnote-sidebar')
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

	// Le bouton « hamburger » vit dans la barre d'onglets JacSuite
	// (cf. TabBar.jsx). Il dispatche ces deux events window que l'app
	// écoute pour piloter sa sidebar overlay. Filtre sur detail.app pour
	// ne réagir qu'aux events qui concernent JacNote.
	useEffect(() => {
		if (!isFloating) return
		const onReveal = (e) => {
			if (e?.detail?.app !== 'jacnote') return
			revealFloatingSidebar()
		}
		const onToggle = (e) => {
			if (e?.detail?.app !== 'jacnote') return
			if (floatingCloseTimerRef.current) {
				clearTimeout(floatingCloseTimerRef.current)
				floatingCloseTimerRef.current = null
			}
			setFloatingOpen((prev) => !prev)
		}
		window.addEventListener('jacsuite:floatingSidebar:reveal', onReveal)
		window.addEventListener('jacsuite:floatingSidebar:toggle', onToggle)
		return () => {
			window.removeEventListener('jacsuite:floatingSidebar:reveal', onReveal)
			window.removeEventListener('jacsuite:floatingSidebar:toggle', onToggle)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isFloating])

	// Largeur personnalisable de la sidebar (clamp 180-480px, persistée).
	const [sidebarWidth, setSidebarWidth] = useState(() => {
		try {
			const v = parseInt(localStorage.getItem('jacsuite:jacnote:sidebarWidth') || '', 10)
			return Number.isFinite(v) && v >= 180 && v <= 480 ? v : 240
		} catch { return 240 }
	})
	useEffect(() => {
		try { localStorage.setItem('jacsuite:jacnote:sidebarWidth', String(sidebarWidth)) } catch {}
	}, [sidebarWidth])

	const startSidebarResize = (e) => {
		if (sidebarCollapsed) return
		e.preventDefault()
		const startX = e.clientX
		const startW = sidebarWidth
		// Quand la sidebar est à droite, la poignée est sur le bord GAUCHE de
		// la sidebar : glisser à droite rétrécit la sidebar (sens inversé).
		const sign = sidebarPosition === 'right' ? -1 : 1
		const onMove = (ev) => {
			const next = Math.max(180, Math.min(480, startW + sign * (ev.clientX - startX)))
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

	// Modèle Apple Notes : la LISTE a une largeur préférée sauvegardée,
	// l'éditeur prend tout le reste (1fr dans la grille). Conséquence directe :
	// quand la fenêtre du navigateur s'agrandit, c'est l'éditeur qui absorbe
	// la place — la liste reste à la largeur choisie par l'utilisateur.
	// (Avant on traquait la largeur de l'éditeur, donc la liste absorbait
	// la place : c'était l'inverse d'Apple Notes.)
	const [listWidth, setListWidth] = useState(() => {
		try {
			const v = parseInt(localStorage.getItem('jacsuite:jacnote:listWidth') || '', 10)
			return Number.isFinite(v) && v >= 240 && v <= 800 ? v : 360
		} catch { return 360 }
	})
	useEffect(() => {
		try { localStorage.setItem('jacsuite:jacnote:listWidth', String(listWidth)) } catch {}
	}, [listWidth])

	// La poignée est entre la liste et l'éditeur. Drag à droite = liste plus
	// large (donc éditeur plus étroit). Minima : 240 px pour la liste,
	// 400 px pour l'éditeur (sinon on bloque le drag).
	const startDetailResize = (e) => {
		e.preventDefault()
		const startX = e.clientX
		const startW = listWidth
		const appEl = e.currentTarget.parentElement // .jacnote-app
		const sidebarPx = sidebarCollapsed ? 48 : sidebarWidth
		const minList = 240
		const minEditor = 400
		// Quand la sidebar est à droite, la poignée est sur le bord GAUCHE de
		// la liste (et non plus le bord droit) : glisser à droite rétrécit la
		// liste au lieu de l'agrandir.
		const sign = sidebarPosition === 'right' ? -1 : 1
		const onMove = (ev) => {
			const containerW = appEl?.clientWidth || window.innerWidth
			const maxList = Math.max(minList, containerW - sidebarPx - minEditor)
			const next = Math.max(
				minList,
				Math.min(Math.min(800, maxList), startW + sign * (ev.clientX - startX)),
			)
			setListWidth(next)
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

	// Raccourci global "N" -> nouvelle note (sauf dans un champ).
	useEffect(() => {
		const handler = (e) => {
			const tag = (e.target?.tagName || '').toLowerCase()
			const inField =
				tag === 'input' ||
				tag === 'textarea' ||
				e.target?.isContentEditable
			if (inField) return
			// Touche configurée (par défaut « n »), pressée seule sans modificateur.
			if (
				e.key.toLowerCase() === (newNoteKey || 'n').toLowerCase() &&
				!e.metaKey && !e.ctrlKey && !e.altKey
			) {
				e.preventDefault()
				addNote({ title: '' })
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [addNote, newNoteKey])

	return (
		<div
			ref={appRootRef}
			className="jacnote-app"
			data-has-detail="true"
			data-sidebar-collapsed={isFloating ? false : sidebarCollapsed}
			data-density={density}
			data-sidebar-position={sidebarPosition}
			data-sidebar-floating={isFloating}
			data-sidebar-floating-open={floatingOpen}
			data-text-size={textSize}
			data-reduced-motion={reducedMotion}
			style={ {
				'--jn-sidebar-width': `${sidebarWidth}px`,
				'--jn-list-width': `${listWidth}px`,
			} }
		>
			{/* En mode flottant on force collapsed=false : quand la sidebar est
			    révélée en overlay, on veut sa version complète (pas l'étroite). */}
			<JacNoteSidebar
				collapsed={isFloating ? false : sidebarCollapsed}
				onToggle={toggleSidebar}
				isFloating={isFloating}
				onCloseFloating={() => {
					// La flèche dans la sidebar désactive complètement le mode
					// flottant (équivalent du toggle dans la tab bar). Le useEffect
					// qui surveille `isFloating` se chargera de refermer l'overlay.
					setSidebarFloating('false')
				}}
				onSettingsOpenChange={handleSettingsOpenChange}
			/>
			{!sidebarCollapsed && !isFloating && (
				<div
					className="jacnote-app__sidebar-resize"
					title="Redimensionner la sidebar"
					onMouseDown={startSidebarResize}
				/>
			)}
			{/* Zone de hover invisible collée au bord de l'écran : révèle la
			    sidebar dès que la souris s'approche. Le bouton hamburger lui
			    n'est plus rendu ici — il est intégré à la barre d'onglets
			    JacSuite (cf. TabBar.jsx). L'app réagit aux events window
			    `jacsuite:floatingSidebar:reveal/toggle` (cf. useEffect plus haut). */}
			{isFloating && (
				<div
					className="jacnote-app__floating-hover-zone"
					onMouseEnter={() => enterHoverRegion('zone')}
					onMouseLeave={() => leaveHoverRegion('zone')}
					aria-hidden="true"
				/>
			)}
			<JacNoteList />
			{/* L'éditeur est toujours monté (façon Apple Notes). Quand aucune
			    note n'est sélectionnée, JacNoteDetail affiche une surface vide
			    cliquable qui crée une nouvelle note au clic. */}
			<div
				className="jacnote-app__detail-resize"
				title="Redimensionner l'éditeur"
				onMouseDown={startDetailResize}
			/>
			<JacNoteDetail />
			<JacNoteConfirm />
		</div>
	)
}

export default JacNoteApp