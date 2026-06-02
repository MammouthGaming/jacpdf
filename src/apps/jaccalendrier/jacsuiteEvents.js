// jacsuiteEvents.js
// Bus d'événements partagé entre les apps du JacSuite.
// Utilise CustomEvent sur window pour rester découplé (pas de dépendance partagée
// entre JacDoc, JacTâche, JacCalendrier, JacPDF).

import { useEffect } from 'react'

const NS = 'jacsuite'

export function emitJacSuite(type, detail = {}) {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new CustomEvent(`${NS}:${type}`, { detail }))
}

export function onJacSuite(type, handler) {
	if (typeof window === 'undefined') return () => {}
	const wrapped = (e) => handler(e.detail, e)
	window.addEventListener(`${NS}:${type}`, wrapped)
	return () => window.removeEventListener(`${NS}:${type}`, wrapped)
}

export function useJacSuiteEvent(type, handler, deps = []) {
	useEffect(() => {
		return onJacSuite(type, handler)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [type, ...deps])
}

export const JacSuiteEvents = Object.freeze({
	// JacTâche
	TASK_CREATED: 'task-created',
	TASK_UPDATED: 'task-updated',
	TASK_COMPLETED: 'task-completed',
	TASK_REOPENED: 'task-reopened',
	TASK_DELETED: 'task-deleted',
	// JacCalendrier
	EVENT_SCHEDULED: 'event-scheduled',
	EVENT_UPDATED: 'event-updated',
	EVENT_DELETED: 'event-deleted',
	// Cross-app
	TASK_TO_EVENT: 'task-to-event',
	EVENT_TO_TASK: 'event-to-task',
})