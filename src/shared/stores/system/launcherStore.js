// Store qui mémorise quelle « app JacPDF » (JacPDF / JacDoc / JacSlide /
// JacNote) est ouverte par-dessus la page d'accueil. Local-first :
// la préférence vit dans localStorage, aucune sync Supabase — c'est
// purement de la nav UI côté client.
//
// Valeurs valides :
//   'launcher' → écran avec les 4 boutons d'apps (transitoire, NON persisté).
//   'jacpdf'   → home actuelle (HomeContent existant) — défaut.
//   'jacdoc' / 'jacslide' / 'jacnote' → placeholder « Bientôt disponible ».
//
// IMPORTANT — 'launcher' est un écran dev/test, jamais l'accueil par
// défaut. Les nouveaux onglets et les reloads démarrent TOUJOURS sur
// 'jacpdf'. Le launcher s'ouvre uniquement via le bouton « 🚀 Tester
// launcher » (cf. HomeContent.jsx) et est réinitialisé dès qu'on clique
// une app dans l'écran launcher.
const KEY = 'jacpdf_currentApp'
const VALID = ['launcher', 'jacpdf', 'jacdoc', 'jacslide', 'jacnote']
// Valeurs autorisées à être persistées — 'launcher' est volontairement
// exclu pour que l'écran 4 apps ne devienne jamais le « home par défaut ».
const PERSISTABLE = ['jacpdf', 'jacdoc', 'jacslide', 'jacnote']

const listeners = new Set()

// Lecture initiale au load du module. On wrap dans try/catch parce que
// localStorage peut throw en mode private/Safari ou si le quota est plein.
// Si la valeur stockée est 'launcher' (cas d'une ancienne installation
// avant ce changement), on l'ignore et on tombe sur 'jacpdf' — le bon
// défaut.
function read() {
	try {
		const raw = localStorage.getItem(KEY)
		if (raw && PERSISTABLE.includes(raw)) return raw
	} catch {}
	return 'jacpdf'
}

let currentApp = read()

export function getCurrentApp() {
	return currentApp
}

// Setter contrôlé — reject toute valeur hors VALID, no-op si la valeur ne
// change pas (évite des notifs inutiles aux subscribers). On écrit dans
// localStorage de façon best-effort UNIQUEMENT pour les apps réelles ;
// 'launcher' reste en mémoire seulement (écran transitoire — cf. note en
// haut du fichier).
export function setCurrentApp(next) {
	if (!VALID.includes(next)) return
	if (next === currentApp) return
	currentApp = next
	if (PERSISTABLE.includes(next)) {
		try {
			localStorage.setItem(KEY, next)
		} catch {}
	}
	listeners.forEach((fn) => {
		try { fn(currentApp) } catch {}
	})
}

// Subscribe pattern minimal : retourne un unsubscriber qu'on appelle
// dans le cleanup d'un useEffect. Pas de wrapping React-specécifique —
// le hook useLauncher s'en charge.
export function subscribeCurrentApp(fn) {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

// Helper pratique pour le bouton « ← Apps » dans HomeContent et pour
// les flows qui veulent forcer le retour au launcher (ex. après logout
// + relogin sur un autre compte).
export function resetToLauncher() {
	setCurrentApp('launcher')
}