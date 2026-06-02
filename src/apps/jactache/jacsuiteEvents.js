// jacsuiteEvents.js
// Bus d'événements partagé entre les apps du JacSuite.
// Utilise CustomEvent sur window pour rester découplé (pas de dépendance partagée
// entre JacDoc, JacTâche, JacCalendrier, JacPDF).

const NS = 'jacsuite'

// === Gates de ponts d'intégration ===
//
// Les Settings > Intégrations laissent l'utilisateur couper les ponts entre
// JacTâche et les autres apps (JacCalendrier, JacDoc, Classe). Comme le store
// Zustand n'est pas un composant React, il ne peut pas lire un hook ;
// `JacTacheApp` lit les hooks bridge et publie l'état ici via
// `setJacSuiteBridge`, qui le mémorise dans cet objet module-level.
//
// Par défaut tous les ponts sont ouverts (true) pour que les events
// circulent normalement tant que personne n'a explicitement publié l'état.
const bridges = {
	jactacheToJaccalendrier: true,
	jactacheToJacdoc: true,
	jactacheToClasse: true,
}

export function setJacSuiteBridge(name, enabled) {
	bridges[name] = enabled !== false
}

export function isJacSuiteBridgeEnabled(name) {
	return bridges[name] !== false
}

// Table d'équivalence type d'event → liste des ponts requis pour le laisser
// passer. Un event sans entrée ici est toujours émis (events internes à une
// app, comme `project-moved`). Les events `task-*` sont coupés dès que le pont
// JacCalendrier est fermé : pas de fuite vers le calendrier.
const EVENT_BRIDGE_REQUIREMENTS = {
	'task-created': ['jactacheToJaccalendrier'],
	'task-updated': ['jactacheToJaccalendrier'],
	'task-completed': ['jactacheToJaccalendrier'],
	'task-reopened': ['jactacheToJaccalendrier'],
	'task-deleted': ['jactacheToJaccalendrier'],
}

/**
 * Émet un événement JacSuite.
 * Court-circuité si l'un des ponts requis pour ce type d'event est fermé.
 * @param {string} type   - ex: 'task-created', 'event-scheduled'
 * @param {object} detail - charge utile (sérialisable de préférence)
 */
export function emitJacSuite(type, detail = {}) {
	if (typeof window === 'undefined') return
	const required = EVENT_BRIDGE_REQUIREMENTS[type]
	if (required && !required.every((b) => bridges[b])) return
	window.dispatchEvent(new CustomEvent(`${NS}:${type}`, { detail }))
}

/**
 * Écoute un événement JacSuite. Retourne une fonction de désabonnement.
 * @param {string} type
 * @param {(detail:any, event:CustomEvent)=>void} handler
 */
export function onJacSuite(type, handler) {
	if (typeof window === 'undefined') return () => {}
	const wrapped = (e) => handler(e.detail, e)
	window.addEventListener(`${NS}:${type}`, wrapped)
	return () => window.removeEventListener(`${NS}:${type}`, wrapped)
}

/**
 * Hook React : abonne le composant à un événement JacSuite.
 * Usage:
 *   useJacSuiteEvent('task-created', ({ task }) => { ... })
 */
import { useEffect } from 'react'
export function useJacSuiteEvent(type, handler, deps = []) {
	useEffect(() => {
		return onJacSuite(type, handler)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [type, ...deps])
}

// Catalogue des types d'événements (pour autocomplétion / référence)
export const JacSuiteEvents = Object.freeze({
	// JacTâche
	TASK_CREATED: 'task-created',
	TASK_UPDATED: 'task-updated',
	TASK_COMPLETED: 'task-completed',
	TASK_REOPENED: 'task-reopened',
	TASK_DELETED: 'task-deleted',
	// JacCalendrier (à venir)
	EVENT_SCHEDULED: 'event-scheduled',
	EVENT_UPDATED: 'event-updated',
	EVENT_DELETED: 'event-deleted',
	// Cross-app
	TASK_TO_EVENT: 'task-to-event',
})