// src/shared/stores/user/clipboardStore.js
// Historique du presse-papier JacSuite.
// Capture globale des copies/coupes (le texte sélectionné) + persistance
// localStorage. Consommé par le Spotlight (catégorie « Presse-papier »).
//
// NB : on ne lit JAMAIS le presse-papier système en arrière-plan (bloqué par
// le navigateur sans geste utilisateur). On enregistre uniquement ce que
// l'utilisateur copie DANS l'app via les évènements 'copy' / 'cut'.

const STORAGE_KEY = 'jacsuite_clipboardHistory'
const MAX_ITEMS = 25

let items = loadFromStorage()
const listeners = new Set()

function loadFromStorage() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

function saveToStorage() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
	} catch (e) {
		console.warn('[clipboardStore] localStorage write failed', e)
	}
}

function emit() {
	for (const fn of listeners) {
		try { fn(items) } catch {}
	}
}

export const clipboardStore = {
	getAll() {
		return items
	},
	add(text) {
		const value = (text || '').trim()
		if (!value) return
		// Dédoublonne : on remonte une entrée identique en tête plutôt que
		// d'empiler des doublons.
		items = items.filter((it) => it.text !== value)
		items.unshift({
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			text: value,
			time: new Date().toISOString(),
		})
		if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS)
		saveToStorage()
		emit()
	},
	remove(id) {
		items = items.filter((it) => it.id !== id)
		saveToStorage()
		emit()
	},
	clear() {
		items = []
		saveToStorage()
		emit()
	},
	subscribe(fn) {
		listeners.add(fn)
		return () => listeners.delete(fn)
	},
}

// ── Capture globale (une seule fois par session) ──
if (typeof document !== 'undefined' && !window.__jacClipboardInit) {
	window.__jacClipboardInit = true
	const capture = () => {
		try {
			const sel = document.getSelection?.().toString()
			if (sel) clipboardStore.add(sel)
		} catch {}
	}
	document.addEventListener('copy', capture)
	document.addEventListener('cut', capture)
}