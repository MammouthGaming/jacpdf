// useJacTacheStore.js
// Store central de JacTâche : tâches, projets, sélection, filtres.
// Persistance localStorage + émission d'événements jacsuite:* pour
// que les autres apps du JacSuite (JacCalendrier, JacDoc) puissent réagir.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { emitJacSuite } from './jacsuiteEvents'

const STORAGE_KEY = 'jacsuite:jactache:v1'

// La boîte de réception est créée par défaut mais peut être renommée
// ou supprimée comme tout autre projet (plus de flag system).
// parentId = null indique un projet racine ; un id pointe vers le projet
// parent (pour les sous-dossiers).
const DEFAULT_PROJECTS = [
	{ id: 'inbox', name: 'Boîte de réception', icon: 'inbox', parentId: null },
]

export const useJacTacheStore = create(
	persist(
		(set, get) => ({
			// ---------- État ----------
			tasks: [],
			projects: DEFAULT_PROJECTS,
			// Vue par défaut : filtre « Tout » (toutes les tâches non terminées,
			// tous projets confondus). Aucun projet sélectionné.
			selectedProjectId: null,
			selectedTaskId: null,
			filter: 'all', // null | 'all' | 'today' | 'upcoming' | 'completed'
			// IDs des dossiers actuellement repliés. On stocke un tableau (et
			// non un Set) pour la sérialisation localStorage par zustand/persist :
			// JSON.stringify d'un Set donne `{}` et perd les données.
			collapsedProjectIds: [],

			// ---------- Tâches ----------
			addTask: (partial = {}) => {
				const task = {
					id: crypto.randomUUID(),
					title: partial.title?.trim() || 'Nouvelle tâche',
					description: partial.description ?? null,
					status: partial.status ?? 'todo',
					priority: partial.priority ?? 'medium',
					dueDate: partial.dueDate ?? null,
					// Fallback en cascade : projet passé → projet sélectionné →
				// premier projet existant → null (tâche orpheline, visible
				// uniquement depuis les filtres rapides).
				projectId:
					partial.projectId ?? get().selectedProjectId ?? get().projects[0]?.id ?? null,
					tags: partial.tags ?? [],
					subtasks: partial.subtasks ?? [],
					recurrence: partial.recurrence ?? null,
					createdAt: new Date().toISOString(),
					completedAt: null,
				}
				set((s) => ({ tasks: [task, ...s.tasks] }))
				emitJacSuite('task-created', { task })
				return task
			},

			updateTask: (id, patch) => {
				set((s) => ({
					tasks: s.tasks.map((t) =>
						t.id === id ? { ...t, ...patch } : t,
					),
				}))
				emitJacSuite('task-updated', { id, patch })
			},

			toggleTask: (id) => {
				const task = get().tasks.find((t) => t.id === id)
				if (!task) return
				const done = task.status !== 'done'
				const patch = {
					status: done ? 'done' : 'todo',
					completedAt: done ? new Date().toISOString() : null,
				}
				set((s) => ({
					tasks: s.tasks.map((t) =>
						t.id === id ? { ...t, ...patch } : t,
					),
				}))
				emitJacSuite(done ? 'task-completed' : 'task-reopened', {
					id,
					task: { ...task, ...patch },
				})
			},

			deleteTask: (id) => {
				set((s) => ({
					tasks: s.tasks.filter((t) => t.id !== id),
					selectedTaskId:
						s.selectedTaskId === id ? null : s.selectedTaskId,
				}))
				emitJacSuite('task-deleted', { id })
			},

			addSubtask: (taskId, title) => {
				const sub = { id: crypto.randomUUID(), title, done: false }
				set((s) => ({
					tasks: s.tasks.map((t) =>
						t.id === taskId
							? { ...t, subtasks: [...t.subtasks, sub] }
							: t,
					),
				}))
			},

			toggleSubtask: (taskId, subId) => {
				set((s) => ({
					tasks: s.tasks.map((t) =>
						t.id === taskId
							? {
									...t,
									subtasks: t.subtasks.map((sub) =>
										sub.id === subId
											? { ...sub, done: !sub.done }
											: sub,
									),
							  }
							: t,
					),
				}))
			},

			// ---------- Projets ----------
			// parentId optionnel : passe le projet parent pour créer un
			// sous-dossier ; null/omis = projet racine.
			addProject: (name, icon = 'folder', parentId = null) => {
				const project = {
					id: crypto.randomUUID(),
					name: name.trim() || 'Nouveau projet',
					icon,
					parentId: parentId ?? null,
					system: false,
				}
				set((s) => ({ projects: [...s.projects, project] }))
				return project
			},

			// Bascule l'état replié/déplié d'un dossier (utilisé par le chevron
			// affiché à côté des dossiers qui ont des sous-dossiers).
			toggleProjectCollapsed: (id) => {
				set((s) => ({
					collapsedProjectIds: s.collapsedProjectIds.includes(id)
						? s.collapsedProjectIds.filter((x) => x !== id)
						: [...s.collapsedProjectIds, id],
				}))
			},

			renameProject: (id, name) => {
				set((s) => ({
					projects: s.projects.map((p) =>
						p.id === id ? { ...p, name } : p,
					),
				}))
			},

			deleteProject: (id) => {
				const proj = get().projects.find((p) => p.id === id)
				if (!proj) return
				set((s) => {
					// Les tâches du projet supprimé sont réaffectées au premier
					// projet restant ; si aucun n'existe plus, elles passent en
					// orphelines (projectId: null) et restent visibles depuis
					// les filtres rapides (Tout, Aujourd'hui, etc.).
					const fallbackId = s.projects.find((p) => p.id !== id)?.id ?? null
					// Les sous-dossiers du projet supprimé remontent d'un niveau :
					// ils prennent le parentId du projet supprimé (donc racine si
					// le projet supprimé était lui-même racine).
					const nextParentId = proj.parentId ?? null
					return {
						projects: s.projects
							.filter((p) => p.id !== id)
							.map((p) =>
								p.parentId === id ? { ...p, parentId: nextParentId } : p,
							),
						tasks: s.tasks.map((t) =>
							t.projectId === id ? { ...t, projectId: fallbackId } : t,
						),
						// Si on vient de supprimer le projet sélectionné, on
						// bascule sur le filtre « Tout » pour ne pas montrer
						// une vue vide pointée sur un projet inexistant.
						selectedProjectId:
							s.selectedProjectId === id ? null : s.selectedProjectId,
						filter: s.selectedProjectId === id ? 'all' : s.filter,
					}
				})
			},

			// Déplacement d'un projet par drag & drop :
			//   - { targetId, position: 'inside' } -> devient enfant de targetId
			//     (placé à la fin de ses enfants existants).
			//   - { targetId, position: 'before' | 'after' } -> devient sibling
			//     de targetId (même parent), juste avant ou après dans l'ordre.
			//   - { targetId: null } -> remonté à la racine, en fin de liste.
			// L'ordre dans la sidebar dépend à la fois de parentId (arbre) et
			// de l'ordre du tableau (siblings), donc on reconstruit le tableau.
			// Tout déplacement qui créerait un cycle (vers un descendant) est
			// rejeté sans erreur.
			moveProject: (id, { targetId = null, position = 'inside' } = {}) => {
				set((s) => {
					const proj = s.projects.find((p) => p.id === id)
					if (!proj) return s
					if (targetId === id) return s
					// Calcule l'ensemble des descendants de id pour bloquer les cycles.
					const descendants = new Set([id])
					let added = true
					while (added) {
						added = false
						for (const p of s.projects) {
							if (
								p.parentId &&
								descendants.has(p.parentId) &&
								!descendants.has(p.id)
							) {
								descendants.add(p.id)
								added = true
							}
						}
					}
					if (targetId && descendants.has(targetId)) return s
					// Nouveau parentId selon la position demandée.
					let newParentId
					if (!targetId) newParentId = null
					else if (position === 'inside') newParentId = targetId
					else {
						const target = s.projects.find((p) => p.id === targetId)
						if (!target) return s
						newParentId = target.parentId ?? null
					}
					const without = s.projects.filter((p) => p.id !== id)
					const updated = { ...proj, parentId: newParentId }
					let insertIdx
					if (!targetId) {
						insertIdx = without.length
					} else if (position === 'before') {
						insertIdx = without.findIndex((p) => p.id === targetId)
					} else if (position === 'after') {
						insertIdx = without.findIndex((p) => p.id === targetId) + 1
					} else {
						// 'inside' : insère juste après le dernier enfant existant de
						// target dans le tableau (donc en fin de fratrie sous target).
						const targetIdx = without.findIndex((p) => p.id === targetId)
						let lastChildIdx = targetIdx
						for (let i = without.length - 1; i > targetIdx; i--) {
							if (without[i].parentId === targetId) {
								lastChildIdx = i
								break
							}
						}
						insertIdx = lastChildIdx + 1
					}
					return {
						...s,
						projects: [
							...without.slice(0, insertIdx),
							updated,
							...without.slice(insertIdx),
						],
					}
				})
				emitJacSuite('project-moved', { id })
			},

			// ---------- Navigation ----------
			selectProject: (id) =>
				set({ selectedProjectId: id, filter: null, selectedTaskId: null }),
			selectTask: (id) => set({ selectedTaskId: id }),
			setFilter: (filter) =>
				set({ filter, selectedProjectId: null, selectedTaskId: null }),
		}),
		{
			name: STORAGE_KEY,
			version: 1,
		},
	),
)

// ---------- Sélecteurs ----------

const todayISO = () => new Date().toISOString().slice(0, 10)

export const selectVisibleTasks = (state) => {
	const { tasks, selectedProjectId, filter } = state
	const today = todayISO()

	return tasks
		.filter((t) => {
			// « Tout » : toutes les tâches non terminées de tous les projets.
			if (filter === 'all') return t.status !== 'done'
			if (filter === 'today') {
				return (
					t.status !== 'done' &&
					t.dueDate &&
					t.dueDate.slice(0, 10) <= today
				)
			}
			if (filter === 'upcoming') {
				return (
					t.status !== 'done' &&
					t.dueDate &&
					t.dueDate.slice(0, 10) > today
				)
			}
			if (filter === 'completed') return t.status === 'done'
			if (selectedProjectId) return t.projectId === selectedProjectId
			return true
		})
		.sort(sortTasks)
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 }

function sortTasks(a, b) {
	// Terminées en bas
	if (a.status === 'done' && b.status !== 'done') return 1
	if (b.status === 'done' && a.status !== 'done') return -1
	// Puis par date d'échéance (les sans-date à la fin)
	if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
	if (a.dueDate) return -1
	if (b.dueDate) return 1
	// Puis par priorité
	return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
}