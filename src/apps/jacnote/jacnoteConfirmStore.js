// jacnoteConfirmStore.js
// Store léger pour la modal de confirmation custom de JacNote.

import { useSyncExternalStore } from 'react'

let listeners = new Set()
let state = null

function notify() {
	for (const l of listeners) l()
}

function subscribe(l) {
	listeners.add(l)
	return () => listeners.delete(l)
}

function getSnapshot() {
	return state
}

export function useConfirmState() {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function openConfirm(opts = {}) {
	return new Promise((resolve) => {
		if (state?.resolver) state.resolver(false)
		state = {
			title: opts.title ?? null,
			message: opts.message ?? '',
			confirmLabel: opts.confirmLabel ?? 'Confirmer',
			cancelLabel: opts.cancelLabel ?? 'Annuler',
			danger: !!opts.danger,
			resolver: resolve,
		}
		notify()
	})
}

export function resolveConfirm(value) {
	if (!state) return
	const r = state.resolver
	state = null
	notify()
	r?.(value)
}