// JacTacheSidebar.jsx
// Barre latérale : filtres rapides + liste des projets.
// Style inspiré de JacPDF (sombre, compact, accents bleus).

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useJacTacheStore } from './useJacTacheStore'
import { Icon } from './JacTacheIcons'
import { JacTacheConfirmModal } from './JacTacheConfirmModal'
import { JacTacheCalendarPanel } from './JacTacheCalendarPanel'
import { useJacTacheViewPrefs } from '@/apps/jactache/hooks/useJacTacheViewPrefs'
import Settings from '@/shared/components/ui/Settings'
import { useAuth } from '@/shared/hooks/user/useAuth'
import PlanBadge from '@/shared/components/ui/PlanBadge'

const JACTACHE_LOGO = new URL('../../../logo/JacTâche.svg', import.meta.url).href

// Les icônes sont des noms résolus par <Icon name=...> (cf. JacTacheIcons).
const QUICK_FILTERS = [
	{ id: 'all', label: 'Tout', icon: 'list' },
	{ id: 'today', label: "Aujourd'hui", icon: 'sun' },
	{ id: 'upcoming', label: 'À venir', icon: 'calendar' },
	{ id: 'completed', label: 'Terminées', icon: 'check-square' },
]

// Props :
//  - collapsed : si true, la sidebar n'affiche que les icônes (largeur 48px).
//  - onToggle  : handler appelé par le bouton chevron pour basculer l'état.
// L'état lui-même est conservé dans JacTacheApp pour piloter aussi la
// grille CSS via data-sidebar-collapsed sur .jactache-app.
export function JacTacheSidebar({ collapsed = false, onToggle, isFloating = false, onCloseFloating, onSettingsOpenChange }) {
	const projects = useJacTacheStore((s) => s.projects)
	const selectedProjectId = useJacTacheStore((s) => s.selectedProjectId)
	const filter = useJacTacheStore((s) => s.filter)
	const tasks = useJacTacheStore((s) => s.tasks)
	const selectProject = useJacTacheStore((s) => s.selectProject)
	const setFilter = useJacTacheStore((s) => s.setFilter)
	const addProject = useJacTacheStore((s) => s.addProject)
	const deleteProject = useJacTacheStore((s) => s.deleteProject)
	const addTask = useJacTacheStore((s) => s.addTask)
	const moveProject = useJacTacheStore((s) => s.moveProject)
	const collapsedProjectIds = useJacTacheStore((s) => s.collapsedProjectIds)
	const toggleProjectCollapsed = useJacTacheStore((s) => s.toggleProjectCollapsed)
	const collapsedSet = useMemo(
		() => new Set(collapsedProjectIds),
		[collapsedProjectIds],
	)

	// Aplatit l'arbre des projets en pré-ordre (parent puis enfants),
	// chaque entrée enrichie d'un `depth` utilisé pour l'indentation.
	// Les projets dont le parent n'existe pas (données héritées / orphelines)
	// sont traités comme racines.
	const orderedProjects = useMemo(() => {
		const ids = new Set(projects.map((p) => p.id))
		const childrenByParent = {}
		for (const p of projects) {
			const key = p.parentId && ids.has(p.parentId) ? p.parentId : '__root__'
			if (!childrenByParent[key]) childrenByParent[key] = []
			childrenByParent[key].push(p)
		}
		const result = []
		const visit = (key, depth) => {
			for (const p of childrenByParent[key] ?? []) {
				const hasChildren = (childrenByParent[p.id] ?? []).length > 0
				result.push({ ...p, depth, hasChildren })
				// Ne descend dans les enfants que si le dossier n'est pas replié.
				if (!collapsedSet.has(p.id)) visit(p.id, depth + 1)
			}
		}
		visit('__root__', 0)
		return result
	}, [projects, collapsedSet])

	const [creating, setCreating] = useState(false)
	const [draft, setDraft] = useState('')
	const [showSettings, setShowSettings] = useState(false)

	// Notifie le parent (JacTacheApp) quand le modal Paramètres s'ouvre/ferme.
	// En mode sidebar flottante, le parent verrouille l'overlay tant que le
	// modal est affiché pour éviter une fermeture parasite quand la souris
	// glisse vers le modal (rendu hors de la sidebar).
	useEffect(() => {
		onSettingsOpenChange?.(showSettings)
	}, [showSettings, onSettingsOpenChange])

	// Panneau Calendrier déplié depuis le bouton de pied de sidebar.
	// Deux comportements selon l'état de la sidebar :
	//  - sidebar étendue : panneau déplié *inline* dans le footer entre
	//    les boutons Calendrier et Paramètres (le footer s'étire).
	//  - sidebar réduite : panneau *flottant* à droite du bouton, car
	//    la sidebar ne fait que 48px et ne peut pas accueillir le panneau.
	//    On capture la position du bouton au moment de l'ouverture pour le
	//    placer en position: fixed.
	const calendarBtnRef = useRef(null)
	const [showCalendar, setShowCalendar] = useState(false)
	const [calendarPos, setCalendarPos] = useState(null)
	const toggleCalendar = () => {
		if (showCalendar) {
			setShowCalendar(false)
			return
		}
		// On capture la position uniquement quand on est en mode réduit ;
		// en mode étendu le panneau est inline donc n'en a pas besoin.
		if (collapsed) {
			const rect = calendarBtnRef.current?.getBoundingClientRect()
			if (rect) {
				setCalendarPos({
					left: rect.right + 8,
					bottom: window.innerHeight - rect.bottom,
				})
			}
		}
		setShowCalendar(true)
	}

	// Si la sidebar se réduit/déplie pendant que le panneau est ouvert, on
	// le ferme pour éviter un panneau flottant calculé avec une mauvaise
	// position ou un panneau inline qui ne tient pas dans 48px.
	useEffect(() => {
		if (showCalendar) setShowCalendar(false)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [collapsed])

	// === Sélection multiple par rectangle élastique (marquee) ===
	// selectedIds : ensemble des projets cochés par drag-select.
	// projectsNavRef : conteneur de la liste, sert d'origine de coordonnées
	//   et de zone de capture des mousedown.
	// itemRefs : map id -> noeud DOM du bouton, sert au hit-test à chaque
	//   mousemove pour savoir quels projets le rectangle traverse.
	// dragRef : info de drag courante (point de départ + base de sélection
	//   au moment du clic), stockée en ref pour éviter les recreations
	//   d'effect inutiles.
	// marquee : géométrie du rectangle dessiné à l'écran, ou null si on
	//   n'est pas en drag.
	const [selectedIds, setSelectedIds] = useState(() => new Set())
	const projectsNavRef = useRef(null)
	const itemRefs = useRef({})
	const dragRef = useRef(null)
	const [marquee, setMarquee] = useState(null)
	const clearMultiSelection = () => setSelectedIds(new Set())

	// === Drag & drop des projets ===
	// draggingId : id du projet en cours de tirage (HTML5 DnD).
	// dropTarget : { id, position } où position ∈ 'before' | 'after' |
	//   'inside' | 'root-end'. id=null + position='root-end' = drop dans
	//   le vide du nav (remise à la racine).
	const [draggingId, setDraggingId] = useState(null)
	const [dropTarget, setDropTarget] = useState(null)

	// Vérifie si candidateId est un descendant d'ancestorId dans l'arbre
	// des projets. Sert à empêcher de déposer un dossier dans l'un de
	// ses propres sous-dossiers (créerait un cycle).
	const isDescendantOf = (candidateId, ancestorId) => {
		let current = projects.find((p) => p.id === candidateId)
		while (current && current.parentId) {
			if (current.parentId === ancestorId) return true
			current = projects.find((p) => p.id === current.parentId)
		}
		return false
	}

	const onNavMouseDown = (e) => {
		// Bouton gauche uniquement. Si on est sur un input (renommage ou
		// création), on laisse passer sans interférer.
		if (e.button !== 0) return
		// Le marquee ne démarre que depuis le vide pur du nav : les boutons
		// de projet gèrent eux-mêmes le drag & drop HTML5, et mélanger les
		// deux causerait des conflits. La nav remplit toute la hauteur
		// restante (flex: 1) pour garantir une zone vide cliquable.
		if (e.target !== e.currentTarget) return
		const nav = projectsNavRef.current
		if (!nav) return
		const navRect = nav.getBoundingClientRect()
		const startClientX = e.clientX
		const startClientY = e.clientY
		const startX = e.clientX - navRect.left
		const startY = e.clientY - navRect.top
		const additive = e.metaKey || e.ctrlKey || e.shiftKey
		// Si on a cliqué dans le vide pur du nav, on démarre le rectangle
		// dès le premier pixel de mouvement. Si on a cliqué sur un bouton
		// (ou n'importe quel enfant), on exige un mouvement minimum pour
		// ne pas hijacker les clics simples. Le seuil convertit ensuite la
		// pression en drag-select et le clic sera « avalé » sur mouseup.
		const onEmpty = e.target === e.currentTarget
		const threshold = onEmpty ? 0 : 4
		const baseSelected = additive ? new Set(selectedIds) : new Set()
		let started = false

		const onMove = (me) => {
			if (!started) {
				const dx = me.clientX - startClientX
				const dy = me.clientY - startClientY
				if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) return
				started = true
				dragRef.current = { startX, startY, baseSelected }
				if (!additive) setSelectedIds(new Set())
			}
			const nr = nav.getBoundingClientRect()
			const cx = me.clientX - nr.left
			const cy = me.clientY - nr.top
			const x = Math.min(startX, cx)
			const y = Math.min(startY, cy)
			const w = Math.abs(cx - startX)
			const h = Math.abs(cy - startY)
			setMarquee({ x, y, w, h })
			const selLeft = nr.left + x
			const selTop = nr.top + y
			const selRight = selLeft + w
			const selBottom = selTop + h
			const next = new Set(baseSelected)
			for (const id of Object.keys(itemRefs.current)) {
				const node = itemRefs.current[id]
				if (!node) continue
				const r = node.getBoundingClientRect()
				const overlaps = !(
					selRight < r.left ||
					selLeft > r.right ||
					selBottom < r.top ||
					selTop > r.bottom
				)
				if (overlaps) next.add(id)
			}
			setSelectedIds(next)
		}
		const onUp = () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp)
			if (started) {
				// Avale le click qui va suivre le mouseup pour ne pas naviguer
				// vers le projet juste « effleuré » par le drag-select.
				const swallow = (ce) => {
					ce.stopPropagation()
					ce.preventDefault()
				}
				document.addEventListener('click', swallow, {
					capture: true,
					once: true,
				})
				setTimeout(
					() => document.removeEventListener('click', swallow, true),
					0,
				)
			}
			dragRef.current = null
			setMarquee(null)
		}
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
	}

	// Menu contextuel sur clic droit sur un projet. Coordonnées en clientX/Y
	// pour pouvoir positionner le menu en position: fixed n'importe où sur
	// l'écran (pas seulement dans la sidebar). Renommage in-place via
	// renamingId : l'item du projet est remplacé par un <input>.
	const [contextMenu, setContextMenu] = useState(null) // { projectId, x, y }
	const [renamingId, setRenamingId] = useState(null)
	const [renameDraft, setRenameDraft] = useState('')
	const [confirmState, setConfirmState] = useState(null)
	const renameProject = useJacTacheStore((s) => s.renameProject)

	// Raccourci clavier global :
	//  - Delete / Backspace : supprime tous les projets multi-sélectionnés
	//    (sinon le projet en cours si pas de multi-sélection). Confirmation
	//    dans les deux cas.
	//  - Escape : vide la multi-sélection.
	// On ignore l'événement si l'utilisateur tape dans un champ, ou s'il
	// est en train de renommer / créer / interagir avec un menu contextuel.
	useEffect(() => {
		const onKeyDown = (e) => {
			const t = e.target
			const inField =
				t &&
				(t.tagName === 'INPUT' ||
					t.tagName === 'TEXTAREA' ||
					t.tagName === 'SELECT' ||
					t.isContentEditable)

			if (e.key === 'Escape' && !inField && selectedIds.size > 0) {
				clearMultiSelection()
				return
			}
			if (e.key !== 'Delete' && e.key !== 'Backspace') return
			if (inField) return
			if (contextMenu || renamingId || creating) return

			// Cas prioritaire : on a une multi-sélection → on supprime tout.
			if (selectedIds.size > 0) {
				const toDelete = projects.filter((p) => selectedIds.has(p.id))
				if (toDelete.length === 0) {
					clearMultiSelection()
					return
				}
				e.preventDefault()
				const single = toDelete.length === 1
				setConfirmState({
					title: single ? 'Supprimer cette liste ?' : `Supprimer ${toDelete.length} listes ?`,
					message: single
						? `« ${toDelete[0].name} » et toutes les tâches qu'elle contient seront supprimées.`
						: `Les ${toDelete.length} listes sélectionnées et toutes les tâches qu'elles contiennent seront supprimées.`,
					confirmLabel: 'Supprimer',
					danger: true,
					onConfirm: () => {
						for (const p of toDelete) deleteProject(p.id)
						clearMultiSelection()
					},
				})
				return
			}

			// Sinon : suppression du projet courant si on en visualise un.
			if (filter || !selectedProjectId) return
			const proj = projects.find((p) => p.id === selectedProjectId)
			if (!proj) return
			e.preventDefault()
			setConfirmState({
				title: 'Supprimer cette liste ?',
				message: `« ${proj.name} » et toutes les tâches qu'elle contient seront supprimées.`,
				confirmLabel: 'Supprimer',
				danger: true,
				onConfirm: () => deleteProject(proj.id),
			})
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [
		selectedIds,
		selectedProjectId,
		filter,
		projects,
		contextMenu,
		renamingId,
		creating,
		deleteProject,
	])

	// Fermeture du menu contextuel : clic n'importe où, défilement, ou Escape.
	// L'event listener n'est attaché que quand le menu est ouvert pour
	// éviter de polluer document en permanence.
	useEffect(() => {
		if (!contextMenu) return
		const close = () => setContextMenu(null)
		const onKey = (e) => { if (e.key === 'Escape') setContextMenu(null) }
		document.addEventListener('mousedown', close)
		document.addEventListener('scroll', close, true)
		document.addEventListener('keydown', onKey)
		return () => {
			document.removeEventListener('mousedown', close)
			document.removeEventListener('scroll', close, true)
			document.removeEventListener('keydown', onKey)
		}
	}, [contextMenu])

	const startRename = (p) => {
		setRenamingId(p.id)
		setRenameDraft(p.name)
		setContextMenu(null)
	}
	const commitRename = () => {
		const name = renameDraft.trim()
		if (name && renamingId) renameProject(renamingId, name)
		setRenamingId(null)
		setRenameDraft('')
	}
	const requestDelete = (p) => {
		setContextMenu(null)
		setConfirmState({
			title: 'Supprimer cette liste ?',
			message: `« ${p.name} » et toutes les tâches qu'elle contient seront supprimées.`,
			confirmLabel: 'Supprimer',
			danger: true,
			onConfirm: () => deleteProject(p.id),
		})
	}

	// Ajout depuis le menu contextuel : on bascule sur le projet ciblé
	// puis on crée la tâche (titre par défaut, l'utilisateur peut cliquer
	// dessus pour la renommer grâce à l'édition inline).
	const handleAddTaskHere = (p) => {
		setContextMenu(null)
		selectProject(p.id)
		addTask({ projectId: p.id })
	}
	// Sous-dossier : on crée un projet enfant avec un nom par défaut puis
	// on entre directement en mode renommage pour qu'il soit nommé sans
	// devoir refaire un clic droit.
	const handleAddSubFolder = (p) => {
		setContextMenu(null)
		const created = addProject('Nouveau dossier', 'folder', p.id)
		if (created) {
			setRenamingId(created.id)
			setRenameDraft(created.name)
		}
	}

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

	// Compte de tâches non terminées par projet (pour les badges).
	// Court-circuité quand Settings > Vues & filtres > « Compteurs sidebar » est
	// off : on évite même le reduce (qui balaie toutes les tâches à chaque
	// rendu) ; le CSS masque déjà les badges, mais autant ne pas faire le
	// calcul pour rien sur un store avec beaucoup de tâches.
	const { showSidebarCounts } = useJacTacheViewPrefs()
	const countByProject = useMemo(() => {
		if (!showSidebarCounts) return {}
		return tasks.reduce((acc, t) => {
			if (t.status !== 'done') acc[t.projectId] = (acc[t.projectId] || 0) + 1
			return acc
		}, {})
	}, [tasks, showSidebarCounts])

	const commitProject = () => {
		const name = draft.trim()
		if (name) addProject(name)
		setDraft('')
		setCreating(false)
	}

	return (
		<>
		<aside className="jactache-sidebar" data-collapsed={collapsed}>
			{/* Brand + bouton de réduction. Quand la sidebar est réduite, on
			    n'affiche plus que le bouton chevron centré (qui pointe à droite
			    pour signifier « déplier ») ; quand elle est étendue, on montre
			    logo + nom + chevron qui pointe à gauche pour « réduire ». */}
			<div className="jactache-sidebar__brand">
				{!collapsed && (
					<>
						<span className="jactache-sidebar__logo">
							<img src={JACTACHE_LOGO} alt="" draggable="false" />
						</span>
						<span className="jactache-sidebar__brand-name">JacTâche</span>
						<PlanBadge />
					</>
				)}
				{isFloating && (
					<button
						type="button"
						className="jactache-sidebar__toggle"
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

			<nav className="jactache-sidebar__section">
				{QUICK_FILTERS.map((f) => (
					<button
						key={f.id}
						type="button"
						className="jactache-sidebar__item"
						data-active={filter === f.id}
						onClick={() => setFilter(f.id)}
					>
						<span className="jactache-sidebar__icon">
							<Icon name={f.icon} size={16} />
						</span>
						<span>{f.label}</span>
					</button>
				))}
			</nav>

			<div className="jactache-sidebar__heading">
				<span>Listes</span>
				<button
					type="button"
					className="jactache-sidebar__add"
					title="Nouvelle liste"
					onClick={() => setCreating(true)}
				>
					+
				</button>
			</div>

			<nav
				ref={projectsNavRef}
				className="jactache-sidebar__section jactache-sidebar__section--projects"
				onMouseDown={onNavMouseDown}
				data-drop-root={
					draggingId && dropTarget && dropTarget.id === null
						? 'true'
						: undefined
				}
				onDragOver={(e) => {
					if (!draggingId) return
					// On ne traite que le drag-over sur le vide du nav lui-même ;
					// si l'événement vient d'un bouton enfant, c'est son propre
					// handler qui s'en charge.
					if (e.target !== e.currentTarget) return
					e.preventDefault()
					e.dataTransfer.dropEffect = 'move'
					if (!dropTarget || dropTarget.id !== null) {
						setDropTarget({ id: null, position: 'root-end' })
					}
				}}
				onDrop={(e) => {
					if (e.target !== e.currentTarget) return
					e.preventDefault()
					if (draggingId) {
						moveProject(draggingId, { targetId: null, position: 'root-end' })
					}
					setDraggingId(null)
					setDropTarget(null)
				}}
			>
				{orderedProjects.map((p) => {
					// Indentation proportionnelle à la profondeur dans l'arbre.
					const indentStyle = { paddingLeft: 12 + p.depth * 14 }
					// Mode renommage : remplace l'item par un input, Entrée valide,
					// Escape ou blur sans contenu annule, blur avec contenu valide.
					if (renamingId === p.id) {
						return (
							<input
								key={p.id}
								autoFocus
								className="jactache-sidebar__input"
								style={indentStyle}
								value={renameDraft}
								onChange={(e) => setRenameDraft(e.target.value)}
								onBlur={commitRename}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitRename()
									if (e.key === 'Escape') {
										setRenamingId(null)
										setRenameDraft('')
									}
								}}
							/>
						)
					}
					return (
						<button
							key={p.id}
							ref={(node) => {
								if (node) itemRefs.current[p.id] = node
								else delete itemRefs.current[p.id]
							}}
							type="button"
							className="jactache-sidebar__item"
							style={indentStyle}
							data-active={!filter && selectedProjectId === p.id}
							data-multi-selected={selectedIds.has(p.id)}
							data-dragging={draggingId === p.id ? 'true' : undefined}
							data-drop-position={
								dropTarget && dropTarget.id === p.id
									? dropTarget.position
									: undefined
							}
							data-depth={p.depth}
							draggable={true}
							onDragStart={(e) => {
								setDraggingId(p.id)
								e.dataTransfer.effectAllowed = 'move'
								e.dataTransfer.setData('text/plain', p.id)
							}}
							onDragEnd={() => {
								setDraggingId(null)
								setDropTarget(null)
							}}
							onDragOver={(e) => {
								if (!draggingId || draggingId === p.id) return
								if (isDescendantOf(p.id, draggingId)) return
								e.preventDefault()
								e.dataTransfer.dropEffect = 'move'
								// Zone haute (25%) = insérer avant ; zone basse (25%)
								// = insérer après ; milieu = nicher dedans (sous-dossier).
								const rect = e.currentTarget.getBoundingClientRect()
								const y = e.clientY - rect.top
								const h = rect.height
								let position
								if (y < h * 0.25) position = 'before'
								else if (y > h * 0.75) position = 'after'
								else position = 'inside'
								if (
									!dropTarget ||
									dropTarget.id !== p.id ||
									dropTarget.position !== position
								) {
									setDropTarget({ id: p.id, position })
								}
							}}
							onDrop={(e) => {
								e.preventDefault()
								if (!draggingId || draggingId === p.id) return
								if (isDescendantOf(p.id, draggingId)) return
								if (dropTarget && dropTarget.id === p.id) {
									moveProject(draggingId, {
										targetId: p.id,
										position: dropTarget.position,
									})
									// Si on dépose dans un dossier replié, on le déplie
									// automatiquement pour que l'utilisateur voie le résultat.
									if (
										dropTarget.position === 'inside' &&
										collapsedSet.has(p.id)
									) {
										toggleProjectCollapsed(p.id)
									}
								}
								setDraggingId(null)
								setDropTarget(null)
							}}
							onClick={(e) => {
								// Cmd/Ctrl/Shift+clic = bascule l'état dans la
								// multi-sélection sans naviguer. Clic simple =
								// efface la multi-sélection et navigue vers le projet.
								if (e.metaKey || e.ctrlKey || e.shiftKey) {
									setSelectedIds((prev) => {
										const next = new Set(prev)
										if (next.has(p.id)) next.delete(p.id)
										else next.add(p.id)
										return next
									})
								} else {
									clearMultiSelection()
									selectProject(p.id)
								}
							}}
							onContextMenu={(e) => {
								e.preventDefault()
								setContextMenu({
									projectId: p.id,
									x: e.clientX,
									y: e.clientY,
								})
							}}
						>
							{/* Lignes verticales reliant chaque sous-dossier à ses
							    ancêtres dans l'arbre. Une ligne par niveau de profondeur
							    antérieur, placée dans la colonne du chevron de l'ancêtre
							    correspondant. À chaque rangée, les lignes traversent la
							    pleine hauteur de la ligne ; collées bout à bout entre
							    siblings, elles forment un trait continu à l'écran. */}
							{p.depth > 0 &&
								Array.from({ length: p.depth }, (_, i) => (
									<span
										key={`tree-line-${i}`}
										className="jactache-sidebar__tree-line"
										style={ { left: 12 + i * 14 + 7 } }
										aria-hidden="true"
									/>
								))}
							{/* Chevron de pli/dépli. Visible uniquement pour les dossiers
							    qui ont des enfants ; sinon placé mais invisible pour
							    préserver l'alignement de la colonne d'icônes. Le clic est
							    capturé (stopPropagation) pour ne pas naviguer vers le
							    projet quand on plie/déplie. */}
							<span
								className="jactache-sidebar__chevron"
								data-visible={p.hasChildren ? 'true' : 'false'}
								data-collapsed={
									p.hasChildren && collapsedSet.has(p.id) ? 'true' : 'false'
								}
								onMouseDown={(e) => {
									// Empêche le drag HTML5 de démarrer depuis le chevron.
									if (p.hasChildren) e.stopPropagation()
								}}
								onClick={(e) => {
									if (!p.hasChildren) return
									e.stopPropagation()
									toggleProjectCollapsed(p.id)
								}}
							>
								{p.hasChildren && (
									<svg
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polyline points="6 9 12 15 18 9" />
									</svg>
								)}
							</span>
							<span className="jactache-sidebar__icon">
								<Icon name={p.icon} size={16} />
							</span>
							<span className="jactache-sidebar__name">{p.name}</span>
							{countByProject[p.id] > 0 && (
								<span className="jactache-sidebar__count">
									{countByProject[p.id]}
								</span>
							)}
						</button>
					)
				})}

				{creating && (
					<input
						autoFocus
						className="jactache-sidebar__input"
						placeholder="Nom de la liste…"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={commitProject}
						onKeyDown={(e) => {
							if (e.key === 'Enter') commitProject()
							if (e.key === 'Escape') {
								setDraft('')
								setCreating(false)
							}
						}}
					/>
				)}
				{/* Rectangle de sélection visible pendant un drag-select.
				    Positionné dans le repère local du nav (qui est en
				    position: relative via .jactache-sidebar__section--projects). */}
				{marquee && (
					<div
						className="jactache-sidebar__marquee"
						style={ {
							left: marquee.x,
							top: marquee.y,
							width: marquee.w,
							height: marquee.h,
						} }
					/>
				)}
			</nav>

			{/* Pied de la sidebar — empilé verticalement : d'abord le bouton
			    « Calendrier » qui déplie un mini-panneau JacCalendrier, puis le
			    bouton avec avatar qui ouvre le panneau Paramètres. Les notes
			    de version sont accessibles depuis Settings → bouton « Version »
			    en bas, via le VersionModal partagé de la JacSuite. */}
			<div className="jactache-sidebar__footer">
				<button
					ref={calendarBtnRef}
					type="button"
					className="jactache-sidebar__footer-btn"
					data-active={showCalendar || undefined}
					title="Calendrier"
					onClick={toggleCalendar}
				>
					<span className="jactache-sidebar__footer-btn-icon">
						<Icon name="calendar" size={18} />
					</span>
					<span className="jactache-sidebar__footer-btn-label">Calendrier</span>
				</button>
				{/* Panneau Calendrier inline (sidebar étendue) : entre les deux
				    boutons du footer. En mode réduit il est rendu hors du footer
				    plus bas (mode flottant). */}
				{!collapsed && (
					<JacTacheCalendarPanel open={showCalendar} />
				)}
				<button
					type="button"
					className="jactache-sidebar__profile"
					title="Paramètres"
					onClick={() => setShowSettings(true)}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt=""
							className="jactache-sidebar__avatar"
							referrerPolicy="no-referrer"
							onError={(e) => { e.currentTarget.style.display = 'none' }}
						/>
					) : (
						<span className="jactache-sidebar__avatar jactache-sidebar__avatar--initial">
							{avatarInitial}
						</span>
					)}
					<span className="jactache-sidebar__profile-label">Paramètres</span>
				</button>
			</div>
		</aside>

		{/* Menu contextuel projet — rendu hors de l'aside pour pouvoir
		    déborder de la sidebar sans être clippé. position: fixed avec
		    clientX/Y. onMouseDown stoppe la propagation pour ne pas
		    déclencher la fermeture par le listener document. */}
		{contextMenu && (() => {
			const p = projects.find((x) => x.id === contextMenu.projectId)
			if (!p) return null
			return (
				<div
					className="jactache-context-menu"
					style={ { left: contextMenu.x, top: contextMenu.y } }
					onMouseDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						className="jactache-context-menu__item"
						onClick={() => handleAddTaskHere(p)}
					>
						<Icon name="check-square" size={14} />
						<span>Ajouter une tâche</span>
					</button>
					<button
						type="button"
						className="jactache-context-menu__item"
						onClick={() => handleAddSubFolder(p)}
					>
						<Icon name="folder" size={14} />
						<span>Ajouter un sous-dossier</span>
					</button>
					<div className="jactache-context-menu__sep" />
					<button
						type="button"
						className="jactache-context-menu__item"
						onClick={() => startRename(p)}
					>
						<Icon name="pencil" size={14} />
						<span>Renommer</span>
					</button>
					<button
						type="button"
						className="jactache-context-menu__item jactache-context-menu__item--danger"
						onClick={() => requestDelete(p)}
					>
						<Icon name="trash" size={14} />
						<span>Supprimer</span>
					</button>
				</div>
			)
		})()}

		{showSettings && (
			<Settings onClose={() => setShowSettings(false)} appName="JacTâche" />
		)}

		{/* Panneau Calendrier flottant (sidebar réduite uniquement) : rendu
		    hors de l'aside pour pouvoir déborder du rail de 48px. */}
		{collapsed && (
			<JacTacheCalendarPanel
				open={showCalendar}
				floating={true}
				anchorRef={calendarBtnRef}
				position={calendarPos}
				onClose={() => setShowCalendar(false)}
			/>
		)}

		<JacTacheConfirmModal
			state={confirmState}
			onClose={() => setConfirmState(null)}
		/>
		</>
	)
}

export default JacTacheSidebar