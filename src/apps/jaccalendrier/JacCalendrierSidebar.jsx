// JacCalendrierSidebar.jsx
// Barre latérale : bouton "+ Nouvel événement", mini-mois, liste des calendriers.
// Style sombre cohérent avec JacPDF/JacDoc.

import React, { useEffect, useRef, useState } from 'react'
import {
	useJacCalendrierStore,
	buildMonthGrid,
	sameDay,
} from './useJacCalendrierStore'
import { useJacCalendrierCalendarSources } from '@/apps/jaccalendrier/hooks/useJacCalendrierCalendarSources'
import { JacCalendrierTachePanel } from './JacCalendrierTachePanel'
import Settings from '@/shared/components/ui/Settings'
import ColorPicker from '@/shared/components/ui/ColorPicker'
import { JacCalendrierConfirmModal } from './JacCalendrierConfirmModal'
import { useAuth } from '@/shared/hooks/user/useAuth'
import PlanBadge from '@/shared/components/ui/PlanBadge'

const JACCALENDRIER_LOGO = new URL('../../../logo/JacCalendrier.svg', import.meta.url).href

const PALETTE = [
	'#3a86ff', '#ff9f1c', '#ff4d4f', '#06d6a0',
	'#8338ec', '#fb5607', '#118ab2', '#ffd166',
]

// Props :
//  - onCreate  : appelé par le bouton « + Nouvel événement ».
//  - collapsed : si true, la sidebar n'affiche que les icônes (~48px).
//  - onToggle  : handler appelé par le chevron pour basculer collapsed.
// L'état collapsed lui-même est conservé dans JacCalendrierApp pour
// piloter aussi la grille CSS via data-sidebar-collapsed.
export function JacCalendrierSidebar({ onCreate, collapsed = false, onToggle, isFloating = false, onCloseFloating, onSettingsOpenChange }) {
	const calendars = useJacCalendrierStore((s) => s.calendars)
	const cursorDate = useJacCalendrierStore((s) => s.cursorDate)
	const setCursorDate = useJacCalendrierStore((s) => s.setCursorDate)
	const toggleCalendarVisibility = useJacCalendrierStore(
		(s) => s.toggleCalendarVisibility,
	)
	const addCalendar = useJacCalendrierStore((s) => s.addCalendar)
	const deleteCalendar = useJacCalendrierStore((s) => s.deleteCalendar)
	const renameCalendar = useJacCalendrierStore((s) => s.renameCalendar)
	const reorderCalendars = useJacCalendrierStore((s) => s.reorderCalendars)

	// Abonnements iCal déclarés dans Settings > Sources. Ils ne vivent pas
	// dans le store (qui ne gère que les calendriers locaux modifiables
	// depuis la sidebar) mais dans le setting JSON `jaccalendrier_calendars`.
	// On les rend sous une section séparée « Abonnements iCal », en lecture
	// seule : pour les modifier, l'utilisateur passe par Settings > Sources.
	const { icalSubscriptions } = useJacCalendrierCalendarSources()

	// État du modal de confirmation custom (remplace window.confirm).
	// On stocke un objet { title, message, confirmLabel, danger, onConfirm }
	// ou null quand fermé. Le composant <JacCalendrierConfirmModal> gère
	// le focus auto, Enter pour confirmer, Escape pour annuler.
	const [confirmState, setConfirmState] = useState(null)

	// === Drag-and-drop pour réordonner les calendriers ===
	// draggedId : id du calendrier en cours de drag.
	// dragOverId : id du calendrier sur lequel on survole (cible de drop).
	//   Quand non-null, on dessine une ligne horizontale au-dessus de ce
	//   calendrier pour indiquer où sera inséré le drag.
	const [draggedId, setDraggedId] = useState(null)
	const [dragOverId, setDragOverId] = useState(null)
	const handleDragStart = (e, c) => {
		setDraggedId(c.id)
		e.dataTransfer.effectAllowed = 'move'
		// Nécessaire dans Firefox sinon dragstart est ignoré.
		e.dataTransfer.setData('text/plain', c.id)
	}
	const handleDragOver = (e, c) => {
		if (!draggedId || draggedId === c.id) return
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		if (dragOverId !== c.id) setDragOverId(c.id)
	}
	const handleDrop = (e, c) => {
		e.preventDefault()
		if (draggedId && draggedId !== c.id) {
			reorderCalendars(draggedId, c.id)
		}
		setDraggedId(null)
		setDragOverId(null)
	}
	const handleDragEnd = () => {
		setDraggedId(null)
		setDragOverId(null)
	}

	const [creating, setCreating] = useState(false)
	const [draftName, setDraftName] = useState('')
	const [draftColor, setDraftColor] = useState(PALETTE[0])
	const [showSettings, setShowSettings] = useState(false)

	// Notifie le parent (JacCalendrierApp) quand le modal Paramètres s'ouvre/
	// ferme. En mode sidebar flottante, le parent verrouille l'overlay tant
	// que le modal est affiché pour éviter une fermeture parasite.
	useEffect(() => {
		onSettingsOpenChange?.(showSettings)
	}, [showSettings, onSettingsOpenChange])

	// ColorPicker (cercle chromatique partagé avec JacPDF/JacDoc) ouvert
	// via le bouton « Autre couleur » à la fin de la palette. On capture le
	// rect du bouton au clic pour positionner le popup juste en dessous (ou
	// au-dessus si pas de place).
	const [showColorPicker, setShowColorPicker] = useState(false)
	const [colorPickerAnchor, setColorPickerAnchor] = useState(null)
	const openColorPicker = (e) => {
		setColorPickerAnchor(e.currentTarget.getBoundingClientRect())
		setShowColorPicker(true)
	}

	// === Menu contextuel (clic droit) sur un calendrier ===
	// State : null quand fermé, sinon { calendar, x, y } où (x,y) sont les
	// coordonnées viewport pour positionner le menu en position: fixed.
	const [calContextMenu, setCalContextMenu] = useState(null)
	const openCalContextMenu = (e, c) => {
		e.preventDefault()
		setCalContextMenu({ calendar: c, x: e.clientX, y: e.clientY })
	}
	useEffect(() => {
		if (!calContextMenu) return
		const close = () => setCalContextMenu(null)
		const onKey = (e) => { if (e.key === 'Escape') close() }
		// On ferme au prochain clic n'importe où (le menu lui-même absorbe
		// les clics avec stopPropagation, donc cliquer une option déclenche
		// l'action sans fermer prématurément via ce listener).
		document.addEventListener('mousedown', close)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('keydown', onKey)
		}
	}, [calContextMenu])

	// État de renommage : id du calendrier en cours de renommage + valeur
	// du brouillon. Quand renamingId === c.id, on remplace le span du nom
	// par un input contrôlé. Enter = commit, Escape = cancel, blur = commit.
	const [renamingId, setRenamingId] = useState(null)
	const [renameDraft, setRenameDraft] = useState('')
	const startRename = (c) => {
		setRenamingId(c.id)
		setRenameDraft(c.name)
		setCalContextMenu(null)
	}
	const commitRename = () => {
		const name = renameDraft.trim()
		if (renamingId && name) renameCalendar(renamingId, name)
		setRenamingId(null)
		setRenameDraft('')
	}
	const cancelRename = () => {
		setRenamingId(null)
		setRenameDraft('')
	}
	const confirmDelete = (c) => {
		setCalContextMenu(null)
		setConfirmState({
			title: 'Supprimer le calendrier',
			message: `Êtes-vous sûr de vouloir supprimer « ${c.name} » ? Tous les événements qu'il contient seront également supprimés.`,
			confirmLabel: 'Supprimer',
			danger: true,
			onConfirm: () => deleteCalendar(c.id),
		})
	}

	// Panneau Tâches déplié depuis le bouton de pied de sidebar.
	// Deux comportements selon l'état de la sidebar (symétrique du
	// JacTacheCalendarPanel côté JacTâche) :
	//  - sidebar étendue : panneau déplié *inline* dans le footer entre
	//    le bouton Tâches et le bouton Paramètres (le footer s'étire).
	//  - sidebar réduite : panneau *flottant* à droite du bouton, car
	//    la sidebar ne fait que 48px et ne peut pas accueillir le panneau.
	//    On capture la position du bouton au moment de l'ouverture pour
	//    le placer en position: fixed.
	const tachesBtnRef = useRef(null)
	const [showTaches, setShowTaches] = useState(false)
	const [tachesPos, setTachesPos] = useState(null)
	const toggleTaches = () => {
		if (showTaches) {
			setShowTaches(false)
			return
		}
		if (collapsed) {
			const rect = tachesBtnRef.current?.getBoundingClientRect()
			if (rect) {
				setTachesPos({
					left: rect.right + 8,
					bottom: window.innerHeight - rect.bottom,
				})
			}
		}
		setShowTaches(true)
	}

	// Si la sidebar se réduit/déplie pendant que le panneau est ouvert, on
	// le ferme pour éviter un panneau flottant calculé avec une mauvaise
	// position ou un panneau inline qui ne tient pas dans 48px.
	useEffect(() => {
		if (showTaches) setShowTaches(false)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [collapsed])

	// Auth — affiche l'avatar (URL Google) ou l'initiale du nom de l'utilisateur,
	// exactement comme les accueils JacPDF / JacDoc / JacNote. Cohérence visuelle
	// entre toutes les apps JacSuite, et un seul point d'entrée pour les paramètres.
	const { user: currentUser } = useAuth()
	const displayName =
		currentUser?.user_metadata?.full_name ||
		currentUser?.user_metadata?.name ||
		currentUser?.user_metadata?.user_name ||
		currentUser?.email?.split('@')[0] ||
		'Utilisateur'
	const avatarUrl = currentUser?.user_metadata?.avatar_url
	const avatarInitial = (displayName || 'U').charAt(0).toUpperCase()

	const today = new Date()
	const cursor = new Date(cursorDate)
	const grid = buildMonthGrid(cursorDate, true)
	const miniLabel = cursor.toLocaleDateString('fr-CA', {
		month: 'long',
		year: 'numeric',
	})

	const commitCalendar = () => {
		const name = draftName.trim()
		if (name) addCalendar(name, draftColor)
		setDraftName('')
		setDraftColor(PALETTE[0])
		setCreating(false)
	}

	return (
		<>
		<aside className="jaccalendrier-sidebar" data-collapsed={collapsed}>
			{/* Brand + bouton de réduction. Quand la sidebar est réduite, on
			    n'affiche plus que le bouton chevron centré (pointant à droite
			    = « déplier ») ; quand elle est étendue, on montre logo + nom +
			    chevron qui pointe à gauche pour « réduire ». */}
			<div className="jaccalendrier-sidebar__brand">
				{!collapsed && (
					<>
						<span className="jaccalendrier-sidebar__logo"><img src={JACCALENDRIER_LOGO} alt="" draggable="false" /></span>
						<span className="jaccalendrier-sidebar__brand-name">JacCalendrier</span>
						<PlanBadge />
					</>
				)}
				{isFloating && (
					<button
						type="button"
						className="jaccalendrier-sidebar__toggle"
						title="Désactiver la sidebar flottante"
						aria-label="Désactiver la sidebar flottante"
						onClick={onCloseFloating}
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				)}
			</div>

			<button
				type="button"
				className="jaccalendrier-sidebar__create"
				onClick={onCreate}
			>
				+ Nouvel événement
			</button>

			<div className="jaccalendrier-sidebar__mini">
				<div className="jaccalendrier-sidebar__mini-label">
					{miniLabel}
				</div>
				<div className="jaccalendrier-sidebar__mini-weekdays">
					{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
						<span key={i}>{d}</span>
					))}
				</div>
				<div className="jaccalendrier-sidebar__mini-grid">
					{grid.map((d, i) => {
						const inMonth = d.getMonth() === cursor.getMonth()
						const isToday = sameDay(d, today)
						return (
							<button
								key={i}
								type="button"
								className="jaccalendrier-sidebar__mini-cell"
								data-out={!inMonth}
								data-today={isToday}
								onClick={() => setCursorDate(d.toISOString())}
							>
								{d.getDate()}
							</button>
						)
					})}
				</div>
			</div>

			<div className="jaccalendrier-sidebar__heading">
				<span>Calendriers</span>
				<button
					type="button"
					className="jaccalendrier-sidebar__add"
					onClick={() => setCreating(true)}
					title="Nouveau calendrier"
				>
					+
				</button>
			</div>

			<ul className="jaccalendrier-sidebar__cals">
				{calendars.map((c) => {
					// Case à cocher custom : on cache l'input natif (toujours
					// présent pour l'a11y et le focus clavier) et on dessine une
					// case carrée colorée qui combine « indicateur de calendrier »
					// et « toggle de visibilité ». Cochée = remplie avec la couleur
					// du calendrier et coche blanche ; décochée = juste un cadre
					// de la même couleur, intérieur transparent.
					const checkStyle = c.visible
						? { backgroundColor: c.color, borderColor: c.color }
						: { backgroundColor: 'transparent', borderColor: c.color }
					const isRenaming = renamingId === c.id
					const isDragging = draggedId === c.id
					const isDragOver = dragOverId === c.id
					return (
						<li
							key={c.id}
							className="jaccalendrier-sidebar__cal-item"
							data-dragging={isDragging || undefined}
							data-drag-over={isDragOver || undefined}
							draggable={!isRenaming}
							onDragStart={(e) => handleDragStart(e, c)}
							onDragOver={(e) => handleDragOver(e, c)}
							onDragLeave={() => {
								if (dragOverId === c.id) setDragOverId(null)
							}}
							onDrop={(e) => handleDrop(e, c)}
							onDragEnd={handleDragEnd}
						>
							<label
								className="jaccalendrier-sidebar__cal"
								onContextMenu={(e) => openCalContextMenu(e, c)}
							>
								<input
									type="checkbox"
									className="jaccalendrier-sidebar__cal-input"
									checked={c.visible}
									onChange={() => toggleCalendarVisibility(c.id)}
								/>
								<span
									className="jaccalendrier-sidebar__cal-check"
									data-checked={c.visible || undefined}
									style={checkStyle}
									aria-hidden="true"
								/>
								{isRenaming ? (
									<input
										autoFocus
										className="jaccalendrier-sidebar__cal-rename"
										value={renameDraft}
										onChange={(e) => setRenameDraft(e.target.value)}
										onBlur={commitRename}
										onClick={(e) => {
											e.preventDefault()
											e.stopPropagation()
										}}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault()
												commitRename()
											} else if (e.key === 'Escape') {
												e.preventDefault()
												cancelRename()
											}
										}}
									/>
								) : (
									<span className="jaccalendrier-sidebar__cal-name">
										{c.name}
									</span>
								)}
								{!c.system && !isRenaming && (
									<button
										type="button"
										className="jaccalendrier-sidebar__cal-del"
										onClick={(e) => {
											e.preventDefault()
											confirmDelete(c)
										}}
										aria-label="Supprimer"
									>
										×
									</button>
								)}
							</label>
						</li>
					)
				})}
			</ul>

			{/* Abonnements iCal venant de Settings > Sources. Section optionnelle :
			    masquée tant qu'aucun abonnement n'a été déclaré. Pas de drag, pas
			    de menu contextuel, pas de bouton supprimer : tout passe par les
			    réglages pour rester un seul point de vérité. La case sert juste
			    d'indicateur visuel de couleur ; la visibilité réelle est définie
			    côté Settings (champ `visible` du JSON). */}
			{icalSubscriptions.length > 0 && (
				<>
					<div className="jaccalendrier-sidebar__heading">
						<span>Abonnements iCal</span>
					</div>
					<ul className="jaccalendrier-sidebar__cals">
						{icalSubscriptions.map((c) => {
							const checkStyle = c.visible
								? { backgroundColor: c.color, borderColor: c.color }
								: { backgroundColor: 'transparent', borderColor: c.color }
							return (
								<li
									key={c.id}
									className="jaccalendrier-sidebar__cal-item"
									data-ical="true"
								>
									<label className="jaccalendrier-sidebar__cal" title="Géré dans Paramètres > Sources">
										<span
											className="jaccalendrier-sidebar__cal-check"
											data-checked={c.visible || undefined}
											style={checkStyle}
											aria-hidden="true"
										/>
										<span className="jaccalendrier-sidebar__cal-name">
											{c.name}
										</span>
									</label>
								</li>
							)
						})}
					</ul>
				</>
			)}

			{creating && (
				<div className="jaccalendrier-sidebar__cal-create">
					<input
						autoFocus
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						placeholder="Nom du calendrier…"
						onKeyDown={(e) => {
							if (e.key === 'Enter') commitCalendar()
							if (e.key === 'Escape') {
								setDraftName('')
								setCreating(false)
							}
						}}
					/>
					<div className="jaccalendrier-sidebar__palette">
						{PALETTE.map((color) => {
							const swatchStyle = { backgroundColor: color }
							return (
								<button
									key={color}
									type="button"
									className="jaccalendrier-sidebar__swatch"
									data-active={draftColor === color}
									style={swatchStyle}
									onClick={() => setDraftColor(color)}
									aria-label={`Couleur ${color}`}
								/>
							)
						})}
						{/* Bouton « Autre couleur » : même format qu'un swatch,
						 * mais rempli d'un dégradé conique arc-en-ciel pour
						 * signaler qu'il ouvre le ColorPicker complet. data-active
						 * passe à true si la couleur courante n'est pas dans la
						 * palette prédéfinie (= couleur custom choisie via le
						 * cercle chromatique). */}
						<button
							type="button"
							className="jaccalendrier-sidebar__swatch jaccalendrier-sidebar__swatch--more"
							data-active={!PALETTE.includes(draftColor) || undefined}
							onClick={openColorPicker}
							aria-label="Autre couleur"
							title="Autre couleur"
						/>
					</div>
					<div className="jaccalendrier-sidebar__cal-actions">
						<button type="button" onClick={commitCalendar}>
							Créer
						</button>
						<button
							type="button"
							onClick={() => {
								setDraftName('')
								setCreating(false)
							}}
						>
							Annuler
						</button>
					</div>
				</div>
			)}

			{/* Pied de la sidebar — empilé verticalement : d'abord le bouton
			    « Tâches » qui déplie un mini-panneau JacTâche (symétrique du
			    bouton « Calendrier » côté JacTâche), puis le bouton avec
			    avatar qui ouvre le panneau Paramètres. */}
			<div className="jaccalendrier-sidebar__footer">
				<button
					ref={tachesBtnRef}
					type="button"
					className="jaccalendrier-sidebar__footer-btn"
					data-active={showTaches || undefined}
					title="Tâches"
					onClick={toggleTaches}
				>
					<span className="jaccalendrier-sidebar__footer-btn-icon">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="9 11 12 14 22 4" />
							<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
						</svg>
					</span>
					<span className="jaccalendrier-sidebar__footer-btn-label">Tâches</span>
				</button>
				{/* Panneau Tâches inline (sidebar étendue) : entre les boutons
				    Tâches et Paramètres. En mode réduit il est rendu hors du
				    footer plus bas (mode flottant). */}
				{!collapsed && (
					<JacCalendrierTachePanel open={showTaches} />
				)}
				<button
					type="button"
					className="jaccalendrier-sidebar__profile"
					title="Paramètres"
					onClick={() => setShowSettings(true)}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt=""
							className="jaccalendrier-sidebar__avatar"
							referrerPolicy="no-referrer"
							onError={(e) => { e.currentTarget.style.display = 'none' }}
						/>
					) : (
						<span className="jaccalendrier-sidebar__avatar jaccalendrier-sidebar__avatar--initial">
							{avatarInitial}
						</span>
					)}
					<span className="jaccalendrier-sidebar__profile-label">Paramètres</span>
				</button>
			</div>
		</aside>

		{showSettings && (
			<Settings onClose={() => setShowSettings(false)} appName="JacCalendrier" />
		)}

		{/* Cercle chromatique partagé (même composant que JacPDF/JacDoc).
		    Rendu hors de l'aside pour pouvoir déborder librement. onInsert
		    reçoit le hex final et l'applique à draftColor ; onClose ferme
		    juste le popup. */}
		{showColorPicker && (
			<ColorPicker
				color={draftColor}
				onInsert={(hex) => setDraftColor(hex)}
				onClose={() => setShowColorPicker(false)}
				anchorRect={colorPickerAnchor}
			/>
		)}

		{/* Modal de confirmation custom (remplace window.confirm pour la
		    suppression des calendriers). */}
		<JacCalendrierConfirmModal
			state={confirmState}
			onClose={() => setConfirmState(null)}
		/>

		{/* Menu contextuel clic droit sur un calendrier. Position: fixed
		    aux coordonnées du clic. Les calendriers système n'ont pas
		    l'option Supprimer (même règle que le bouton × du hover). */}
		{calContextMenu && (
			<ul
				className="jaccalendrier-sidebar__ctx-menu"
				role="menu"
				style={ { top: calContextMenu.y, left: calContextMenu.x } }
				onMouseDown={(e) => e.stopPropagation()}
			>
				<li>
					<button
						type="button"
						role="menuitem"
						className="jaccalendrier-sidebar__ctx-item"
						onClick={() => startRename(calContextMenu.calendar)}
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 20h9" />
							<path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
						</svg>
						Renommer
					</button>
				</li>
				{!calContextMenu.calendar.system && (
					<li>
						<button
							type="button"
							role="menuitem"
							className="jaccalendrier-sidebar__ctx-item jaccalendrier-sidebar__ctx-item--danger"
							onClick={() => confirmDelete(calContextMenu.calendar)}
						>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6M14 11v6" />
								<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
							</svg>
							Supprimer
						</button>
					</li>
				)}
			</ul>
		)}

		{/* Panneau Tâches flottant (sidebar réduite uniquement) : rendu
		    hors de l'aside pour pouvoir déborder du rail de 48px. */}
		{collapsed && (
			<JacCalendrierTachePanel
				open={showTaches}
				floating={true}
				anchorRef={tachesBtnRef}
				position={tachesPos}
				onClose={() => setShowTaches(false)}
			/>
		)}
		</>
	)
}

export default JacCalendrierSidebar