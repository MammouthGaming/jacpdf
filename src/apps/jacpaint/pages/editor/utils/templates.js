// templates.js — Catalogue de modèles JacPaint
// Phase 9 étape 1 : presets de dimensions + couleur de fond. Choisir un
// modèle redimensionne la toile courante. Les modèles personnels sont
// stockés dans localStorage sous "jacpaint:templates:custom".

export const BUILTIN_TEMPLATES = [
	// ── Papier ──────────────────────────────
	{ id: 'paper-a4', cat: 'Papier', name: 'Papier blanc A4', w: 2480, h: 3508, bg: '#ffffff', icon: '📄' },
	{ id: 'paper-letter', cat: 'Papier', name: 'Papier blanc Letter', w: 2550, h: 3300, bg: '#ffffff', icon: '📄' },
	{ id: 'paper-a5', cat: 'Papier', name: 'Papier blanc A5', w: 1748, h: 2480, bg: '#ffffff', icon: '📄' },
	{ id: 'postcard', cat: 'Papier', name: 'Carte postale', w: 1748, h: 1240, bg: '#fafafa', icon: '✉️' },
	{ id: 'business-card', cat: 'Papier', name: "Carte d'affaires", w: 1050, h: 600, bg: '#ffffff', icon: '💼' },

	// ── Réseaux sociaux ─────────────────────
	{ id: 'insta-square', cat: 'Réseaux sociaux', name: 'Post Instagram carré', w: 1080, h: 1080, bg: '#ffffff', icon: '📷' },
	{ id: 'insta-portrait', cat: 'Réseaux sociaux', name: 'Post Instagram portrait', w: 1080, h: 1350, bg: '#ffffff', icon: '📷' },
	{ id: 'insta-story', cat: 'Réseaux sociaux', name: 'Story Instagram / TikTok', w: 1080, h: 1920, bg: '#000000', icon: '📱' },
	{ id: 'youtube-thumb', cat: 'Réseaux sociaux', name: 'Miniature YouTube', w: 1280, h: 720, bg: '#0a0a0a', icon: '🎬' },
	{ id: 'twitter-header', cat: 'Réseaux sociaux', name: 'Bannière Twitter / X', w: 1500, h: 500, bg: '#0a0a0a', icon: '🐦' },
	{ id: 'facebook-cover', cat: 'Réseaux sociaux', name: 'Couverture Facebook', w: 1640, h: 924, bg: '#ffffff', icon: '👥' },
	{ id: 'linkedin-banner', cat: 'Réseaux sociaux', name: 'Bannière LinkedIn', w: 1584, h: 396, bg: '#0a0a0a', icon: '💼' },

	// ── Fonds d'écran ───────────────────────
	{ id: 'wallpaper-iphone', cat: "Fonds d'écran", name: "Fond d'écran iPhone", w: 1170, h: 2532, bg: '#0a0a0a', icon: '📱' },
	{ id: 'wallpaper-android', cat: "Fonds d'écran", name: "Fond d'écran Android", w: 1080, h: 2340, bg: '#0a0a0a', icon: '📱' },
	{ id: 'wallpaper-fhd', cat: "Fonds d'écran", name: 'Desktop Full HD', w: 1920, h: 1080, bg: '#0a0a0a', icon: '🖥️' },
	{ id: 'wallpaper-4k', cat: "Fonds d'écran", name: 'Desktop 4K', w: 3840, h: 2160, bg: '#0a0a0a', icon: '🖥️' },

	// ── Créatif ─────────────────────────────
	{ id: 'mood-board', cat: 'Créatif', name: 'Mood board', w: 2000, h: 2000, bg: '#1a1f2e', icon: '🎨' },
	{ id: 'sketch-square', cat: 'Créatif', name: 'Sketchbook carré', w: 1500, h: 1500, bg: '#f5f1e8', icon: '✏️' },
	{ id: 'comic-page', cat: 'Créatif', name: 'Page BD', w: 2480, h: 3508, bg: '#ffffff', icon: '💭' },
	{ id: 'pixel-art-32', cat: 'Créatif', name: 'Pixel art 32×32', w: 32, h: 32, bg: '#1a1f2e', icon: '👾' },
	{ id: 'pixel-art-64', cat: 'Créatif', name: 'Pixel art 64×64', w: 64, h: 64, bg: '#1a1f2e', icon: '👾' },
]

export const TEMPLATE_CATEGORIES = ['Papier', 'Réseaux sociaux', "Fonds d'écran", 'Créatif']

const CUSTOM_KEY = 'jacpaint:templates:custom'

// Charge les modèles personnels depuis localStorage. Retourne toujours
// un tableau (vide en cas d'erreur ou d'absence).
export function loadCustomTemplates() {
	try {
		const raw = localStorage.getItem(CUSTOM_KEY)
		if (!raw) return []
		const arr = JSON.parse(raw)
		return Array.isArray(arr) ? arr : []
	} catch {
		return []
	}
}

// Persiste la liste complète. Renvoie true en cas de succès, false sinon
// (ex. quota localStorage atteint).
export function saveCustomTemplates(templates) {
	try {
		localStorage.setItem(CUSTOM_KEY, JSON.stringify(templates))
		return true
	} catch {
		return false
	}
}

// Ajoute un modèle personnel. Limite à 50 entrées (FIFO sur les plus
// vieux). Génère un id unique.
export function addCustomTemplate({ name, w, h, bg, thumbnail }) {
	const list = loadCustomTemplates()
	const tpl = {
		id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
		cat: 'Mes modèles',
		name: name || 'Modèle sans nom',
		w: w | 0,
		h: h | 0,
		bg: bg || '#ffffff',
		thumbnail: thumbnail || null,
		icon: '⭐',
		custom: true,
		createdAt: new Date().toISOString(),
	}
	list.unshift(tpl)
	saveCustomTemplates(list.slice(0, 50))
	return tpl
}

// Supprime un modèle personnel par id. No-op si introuvable.
export function deleteCustomTemplate(id) {
	const list = loadCustomTemplates().filter((t) => t.id !== id)
	saveCustomTemplates(list)
}

// Renomme un modèle personnel. No-op si introuvable.
export function renameCustomTemplate(id, newName) {
	const list = loadCustomTemplates().map((t) => (t.id === id ? { ...t, name: newName } : t))
	saveCustomTemplates(list)
}

// Génère une miniature PNG (data URL) à partir d'un canvas source.
// Préserve le ratio, taille max contrôlée par `maxSize`.
export function generateTemplateThumbnail(sourceCanvas, maxSize = 240) {
	if (!sourceCanvas) return null
	const sw = sourceCanvas.width
	const sh = sourceCanvas.height
	if (sw <= 0 || sh <= 0) return null
	const ratio = sw / sh
	let tw, th
	if (ratio >= 1) {
		tw = Math.min(maxSize, sw)
		th = Math.round(tw / ratio)
	} else {
		th = Math.min(maxSize, sh)
		tw = Math.round(th * ratio)
	}
	const tc = document.createElement('canvas')
	tc.width = Math.max(1, tw)
	tc.height = Math.max(1, th)
	const ctx = tc.getContext('2d')
	if (!ctx) return null
	ctx.imageSmoothingEnabled = true
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(sourceCanvas, 0, 0, tc.width, tc.height)
	try {
		return tc.toDataURL('image/png')
	} catch {
		return null
	}
}

// Retourne un modèle (intégré ou personnel) par id, ou null.
export function getTemplateById(id) {
	const all = [...BUILTIN_TEMPLATES, ...loadCustomTemplates()]
	return all.find((t) => t.id === id) || null
}