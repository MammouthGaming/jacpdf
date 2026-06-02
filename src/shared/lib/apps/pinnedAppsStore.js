// ─────────────────────────────────────────────────────────────────────────
// Store des apps épinglées — quelles apps apparaissent dans le menu principal
// (lanceur plein écran + menu ⋮⋮). Le reste est accessible via l'App Store.
//
// Persistance : localStorage clé `jacsuite_pinned_apps` (tableau d'ids).
// Défaut : les apps `pinnedByDefault` du catalogue (JacPDF, JacDoc, JacNote).
// Synchronisé entre onglets via l'event `storage`.
//
// API (calquée sur les autres stores maison : get / subscribe) :
//   get()            → string[] des ids épinglés (ordre = ordre d'épinglage)
//   isPinned(id)     → bool
//   subscribe(cb)    → cb(ids) à chaque changement ; renvoie un unsubscribe
//   pin(id) / unpin(id) / toggle(id)
//   reorder(ids)     → réordonne les épingles (glisser-déposer du menu)
//   replace(ids)     → remplace toute la liste (« Annuler » de l'éditeur)
//   reset()          → revient aux épingles par défaut
// ─────────────────────────────────────────────────────────────────────────

import { APPS_CATALOG, PINNED_APPS } from './appsCatalog'

const STORAGE_KEY = 'jacsuite_pinned_apps'

// Garde-fou : on ne garde que des ids réellement présents au catalogue (si une
// app est retirée, son id épinglé est ignoré au prochain chargement).
const VALID_IDS = new Set(APPS_CATALOG.map((a) => a.id))
const DEFAULT_PINNED = PINNED_APPS.map((a) => a.id)

function read() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return [...DEFAULT_PINNED]
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return [...DEFAULT_PINNED]
		const cleaned = parsed.filter((id) => typeof id === 'string' && VALID_IDS.has(id))
		// Dédoublonne en gardant le premier ordre rencontré.
		return [...new Set(cleaned)]
	} catch {
		return [...DEFAULT_PINNED]
	}
}

function write(ids) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
	} catch {
		/* quota / mode privé : on ignore, l'état mémoire reste cohérent */
	}
}

let current = read()
const listeners = new Set()

function emit() {
	for (const cb of listeners) {
		try { cb(current) } catch { /* un listener qui throw ne casse pas les autres */ }
	}
}

function set(ids) {
	current = ids
	write(current)
	emit()
}

// Synchronisation entre onglets : un autre onglet a modifié la clé.
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (e) => {
		if (e.key !== STORAGE_KEY) return
		current = read()
		emit()
	})
}

export const pinnedAppsStore = {
	get: () => current,
	isPinned: (id) => current.includes(id),
	subscribe(cb) {
		listeners.add(cb)
		return () => listeners.delete(cb)
	},
	pin(id) {
		if (!VALID_IDS.has(id) || current.includes(id)) return
		set([...current, id])
	},
	unpin(id) {
		if (!current.includes(id)) return
		set(current.filter((x) => x !== id))
	},
	toggle(id) {
		if (current.includes(id)) this.unpin(id)
		else this.pin(id)
	},
	// Réordonne les épingles (glisser-déposer du menu en mode édition). On ne
	// garde que des ids valides déjà épinglés, puis on complète avec les
	// éventuelles épingles manquantes pour ne jamais en perdre.
	reorder(ids) {
		const valid = ids.filter((id) => VALID_IDS.has(id) && current.includes(id))
		set([...new Set([...valid, ...current])])
	},
	// Remplace intégralement la liste — utilisé par « Annuler » de l'éditeur pour
	// restaurer l'instantané (ordre ET épingles retirées pendant l'édition).
	replace(ids) {
		set([...new Set(ids.filter((id) => VALID_IDS.has(id)))])
	},
	reset() {
		set([...DEFAULT_PINNED])
	},
}