import { useEffect, useState, useCallback } from 'react'
import {
	getCurrentApp,
	setCurrentApp,
	subscribeCurrentApp,
	resetToLauncher,
} from '../../stores/system/launcherStore.js'

// Hook qui expose l'app actuellement ouverte (cf. launcherStore) et les
// fonctions pour en changer. À utiliser dans HomeContent.jsx (wrapper du
// rendu) et dans JacLauncher.jsx (handler de clic sur les cartes).
//
// Retourne :
//   app             → 'launcher' | 'jacpdf' | 'jacdoc' | 'jacslide' | 'jacnote'
//   openApp(id)     → ouvre l'app demandée (persisté dans localStorage)
//   backToLauncher  → raccourci vers resetToLauncher (pour le bouton « ← Apps »)
export function useLauncher() {
	const [app, setApp] = useState(() => getCurrentApp())

	useEffect(() => {
		// On s'abonne au store pour rester synchro si une autre partie
		// du code change l'app (ex. resetToLauncher après logout).
		const unsub = subscribeCurrentApp(setApp)
		return unsub
	}, [])

	const openApp = useCallback((next) => setCurrentApp(next), [])
	const backToLauncher = useCallback(() => resetToLauncher(), [])

	return { app, openApp, backToLauncher }
}