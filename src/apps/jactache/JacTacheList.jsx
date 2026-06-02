// JacTacheList.jsx
// Colonne centrale : en-tête dynamique + champ d'ajout rapide + liste.
// La liste affichée est filtrée/triée par selectVisibleTasks.

import React, { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import {
	useJacTacheStore,
	selectVisibleTasks,
} from './useJacTacheStore'
import { JacTacheItem } from './JacTacheItem'
import { Icon } from './JacTacheIcons'

const FILTER_TITLES = {
	all: 'Toutes les tâches',
	today: "Aujourd'hui",
	upcoming: 'À venir',
	completed: 'Terminées',
}

// Options du popover de filtre de priorité. La couleur correspond à celle
// utilisée dans JacTacheItem (PRIORITY_COLORS) pour le contour du checkbox.
const PRIORITY_OPTIONS = [
	{ id: 'urgent', label: 'Urgent', color: '#ff4d4f' },
	{ id: 'high', label: 'Haute', color: '#ff9f1c' },
	{ id: 'medium', label: 'Moyenne', color: '#39FF14' },
	{ id: 'low', label: 'Basse', color: '#8d99ae' },
]

export function JacTacheList() {
	// ⚠️ IMPORTANT : `selectVisibleTasks` fait .filter().sort() et retourne donc
	// un NOUVEAU tableau à chaque appel. Le passer directement à useJacTacheStore
	// casse l'égalité de référence d'useSyncExternalStore et déclenche une
	// boucle infinie ("Maximum update depth exceeded"). On s'abonne aux valeurs
	// brutes (refs stables) et on dérive la liste filtrée avec useMemo.
	const rawTasks = useJacTacheStore((s) => s.tasks)
	const projects = useJacTacheStore((s) => s.projects)
	const selectedProjectId = useJacTacheStore((s) => s.selectedProjectId)
	const filter = useJacTacheStore((s) => s.filter)
	const addTask = useJacTacheStore((s) => s.addTask)
	const renameProject = useJacTacheStore((s) => s.renameProject)
	const selectProject = useJacTacheStore((s) => s.selectProject)

	// Filtrage de base via le store (projet/filtre rapide), comme avant.
	const baseTasks = useMemo(
		() =>
			selectVisibleTasks({
				tasks: rawTasks,
				selectedProjectId,
				filter,
			}),
		[rawTasks, selectedProjectId, filter],
	)

	// Recherche locale (le titre contient la requête, insensible à la casse).
	const [search, setSearch] = useState('')

	// Filtres locaux : priorités (multi-sélection). Set vide = aucun filtre.
	const [priorityFilter, setPriorityFilter] = useState(() => new Set())
	const [showFilter, setShowFilter] = useState(false)
	const filterPopoverRef = useRef(null)
	// Click hors du popover → ferme le menu de filtre. On n'attache l'event
	// listener que quand le popover est ouvert pour ne pas spammer document.
	useEffect(() => {
		if (!showFilter) return
		const onDocClick = (e) => {
			if (!filterPopoverRef.current) return
			if (!filterPopoverRef.current.contains(e.target)) setShowFilter(false)
		}
		document.addEventListener('mousedown', onDocClick)
		return () => document.removeEventListener('mousedown', onDocClick)
	}, [showFilter])

	const togglePriority = (id) => {
		setPriorityFilter((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	// Composition finale : base + recherche + priorité.
	const tasks = useMemo(() => {
		const q = search.trim().toLowerCase()
		return baseTasks.filter((t) => {
			if (q && !t.title.toLowerCase().includes(q)) return false
			if (priorityFilter.size > 0 && !priorityFilter.has(t.priority)) return false
			return true
		})
	}, [baseTasks, search, priorityFilter])

	// Ajout d'une nouvelle tâche, déclenché par le bouton + de la toolbar.
	// On garde un champ INLINE (sans modal) pour rester rapide : Escape ou
	// blur sans contenu = annulation, Entrée ou blur avec contenu = ajout.
	const [adding, setAdding] = useState(false)
	const [addDraft, setAddDraft] = useState('')

	// Titre = icône + libellé. Pour un filtre, on prend le titre dans
	// FILTER_TITLES ; pour un projet, on prend son nom et son icône. JSX
	// pour pouvoir mixer SVG et texte dans le h1.
	const titleProject = !filter
		? projects.find((p) => p.id === selectedProjectId)
		: null
	const titleText = filter
		? FILTER_TITLES[filter] ?? 'Tâches'
		: titleProject?.name ?? 'Tâches'

	// Fil d'Ariane : on remonte la chaîne des parentId jusqu'à la racine.
	// Le dernier élément de `breadcrumb` est le projet courant ; les
	// précédents sont les ancestors cliquables pour y naviguer.
	const breadcrumb = useMemo(() => {
		if (!titleProject) return []
		const chain = []
		let current = titleProject
		const seen = new Set()
		while (current && !seen.has(current.id)) {
			seen.add(current.id)
			chain.unshift(current)
			current = current.parentId
				? projects.find((p) => p.id === current.parentId)
				: null
		}
		return chain
	}, [titleProject, projects])

	// Renommage inline du projet affiché en tête. Disponible uniquement
	// quand on visualise un projet (pas un filtre rapide comme « Tout »).
	// Le brouillon se resync sur le nom du projet quand on change de
	// projet ou que le nom est modifié depuis ailleurs (sidebar).
	const [titleEditing, setTitleEditing] = useState(false)
	const [titleDraft, setTitleDraft] = useState(titleProject?.name ?? '')
	useEffect(() => {
		if (!titleEditing) setTitleDraft(titleProject?.name ?? '')
	}, [titleProject?.id, titleProject?.name, titleEditing])

	const commitTitleRename = () => {
		if (!titleProject) {
			setTitleEditing(false)
			return
		}
		const next = titleDraft.trim()
		if (next && next !== titleProject.name) renameProject(titleProject.id, next)
		else setTitleDraft(titleProject.name)
		setTitleEditing(false)
	}

	const submitAdd = (e) => {
		e?.preventDefault()
		const title = addDraft.trim()
		if (!title) {
			setAdding(false)
			return
		}
		addTask({ title })
		setAddDraft('')
	}

	return (
		<section className="jactache-list">
			<header className="jactache-list__header">
				<h1 className="jactache-list__title">
					{/* Fil d'Ariane : tous les ancêtres avant le projet courant
					    sont rendus en boutons cliquables, suivis d'un séparateur
					    « / ». On rend uniquement quand on a au moins 1 parent. */}
					{breadcrumb.length > 1 &&
						breadcrumb.slice(0, -1).map((ancestor) => (
							<Fragment key={ancestor.id}>
								<button
									type="button"
									className="jactache-list__crumb"
									onClick={() => selectProject(ancestor.id)}
									title={`Aller à ${ancestor.name}`}
								>
									<Icon name={ancestor.icon} size={16} />
									<span>{ancestor.name}</span>
								</button>
								<span className="jactache-list__crumb-sep" aria-hidden>
									/
								</span>
							</Fragment>
						))}
					{titleProject && (
						<Icon name={titleProject.icon} size={22} />
					)}
					{titleProject && titleEditing ? (
						<input
							autoFocus
							value={titleDraft}
							onChange={(e) => setTitleDraft(e.target.value)}
							onBlur={commitTitleRename}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault()
									commitTitleRename()
								}
								if (e.key === 'Escape') {
									setTitleDraft(titleProject.name)
									setTitleEditing(false)
								}
							}}
							className="jactache-list__title-input"
						/>
					) : titleProject ? (
						<button
							type="button"
							className="jactache-list__title-button"
							onClick={() => setTitleEditing(true)}
							title="Renommer la liste"
						>
							{titleText}
						</button>
					) : (
						<span>{titleText}</span>
					)}
				</h1>
				<span className="jactache-list__count">{tasks.length}</span>
			</header>

			{/* Barre d'outils : recherche + bouton + + bouton filtre.
			    La recherche filtre le titre des tâches (insensible à la
			    casse). Le bouton + déplie un champ d'ajout inline juste
			    en dessous. Le bouton filtre ouvre un popover de priorités
			    multi-sélection (badge = nombre de priorités cochées). */}
			<div className="jactache-list__toolbar">
				<input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Rechercher…"
					className="jactache-list__search"
				/>
				<button
					type="button"
					className="jactache-list__tool"
					title="Ajouter une tâche"
					onClick={() => setAdding((v) => !v)}
					data-active={adding}
				>
					+
				</button>
				<div className="jactache-list__filter-wrap" ref={filterPopoverRef}>
					<button
						type="button"
						className="jactache-list__tool"
						title="Filtrer"
						onClick={() => setShowFilter((v) => !v)}
						data-active={showFilter || priorityFilter.size > 0}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden
						>
							<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
						</svg>
						{priorityFilter.size > 0 && (
							<span className="jactache-list__filter-badge">
								{priorityFilter.size}
							</span>
						)}
					</button>
					{showFilter && (
						<div
							className="jactache-list__filter-popover"
							role="menu"
						>
							<div className="jactache-list__filter-heading">
								Priorité
							</div>
							{PRIORITY_OPTIONS.map((opt) => {
								const checked = priorityFilter.has(opt.id)
								// La case custom prend la couleur de la priorité :
								// bordure colorate quand vide, remplie quand cochée.
								// L'input natif reste présent (caché visuellement) pour
								// l'accessibilité clavier / lecteurs d'écran.
								const boxStyle = {
									borderColor: opt.color,
									backgroundColor: checked ? opt.color : 'transparent',
								}
								return (
									<label
										key={opt.id}
										className="jactache-list__filter-row"
										data-checked={checked}
									>
										<input
											type="checkbox"
											className="jactache-list__filter-input"
											checked={checked}
											onChange={() => togglePriority(opt.id)}
										/>
										<span
											className="jactache-list__filter-check"
											style={boxStyle}
											aria-hidden
										>
											{checked && (
												<svg
													width="10"
													height="10"
													viewBox="0 0 24 24"
													fill="none"
													stroke="#fff"
													strokeWidth="4"
													strokeLinecap="round"
													strokeLinejoin="round"
												>
													<polyline points="20 6 9 17 4 12" />
												</svg>
											)}
										</span>
										<span>{opt.label}</span>
									</label>
								)
							})}
							{priorityFilter.size > 0 && (
								<button
									type="button"
									className="jactache-list__filter-clear"
									onClick={() => setPriorityFilter(new Set())}
								>
									Effacer
								</button>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Champ d'ajout, déplié uniquement quand adding=true. Réutilise
			    les styles .jactache-list__add / __input existants. */}
			{adding && (
				<form className="jactache-list__add" onSubmit={submitAdd}>
					<input
						autoFocus
						value={addDraft}
						onChange={(e) => setAddDraft(e.target.value)}
						onBlur={submitAdd}
						onKeyDown={(e) => {
							if (e.key === 'Escape') {
								setAddDraft('')
								setAdding(false)
							}
						}}
						placeholder="Nouvelle tâche… (Entrée pour valider)"
						className="jactache-list__input"
					/>
				</form>
			)}

			<ul className="jactache-list__items">
				{tasks.length === 0 && (
					<li className="jactache-list__empty">
						{search.trim() || priorityFilter.size > 0
							? 'Aucune tâche ne correspond à votre recherche.'
							: 'Aucune tâche ici. Souffle un peu, ou ajoute-en une.'}
					</li>
				)}
				{tasks.map((task) => (
					<JacTacheItem key={task.id} task={task} />
				))}
			</ul>
		</section>
	)
}

export default JacTacheList