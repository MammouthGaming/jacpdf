// cloudMapping.js — mapping IndexedDB ↔ Supabase pour les toiles JacPaint.
//
// JacPaint est local-first : chaque toile a un `id` IndexedDB (string
// genre 'painting-1716...'). Quand le cloud est activé, on crée en miroir
// une row Supabase (`jacpaint_canvases.id` = UUID). Ce module garde le
// pont entre les deux dans localStorage :
//
//   localStorage.jacpaint_cloud_mapping = JSON.stringify({
//     'painting-1716...': '0b3e...-uuid',
//     ...
//   })
//
// Une seule clé — tout passer par get/set évite les bugs de
// concurrence (lecture + écriture parallelèles corrompraient le JSON).

const KEY = 'jacpaint_cloud_mapping'

function readAll() {
	try {
		return JSON.parse(localStorage.getItem(KEY) || '{}') || {}
	} catch {
		return {}
	}
}

function writeAll(map) {
	try {
		localStorage.setItem(KEY, JSON.stringify(map))
	} catch (err) {
		console.warn('JacPaint cloudMapping: persistance échouée', err)
	}
}

export function getCloudId(localId) {
	if (!localId) return null
	const map = readAll()
	return map[localId] || null
}

export function setCloudId(localId, cloudId) {
	if (!localId || !cloudId) return
	const map = readAll()
	map[localId] = cloudId
	writeAll(map)
}

export function removeCloudId(localId) {
	if (!localId) return
	const map = readAll()
	if (localId in map) {
		delete map[localId]
		writeAll(map)
	}
}

// Renvoie le mapping inverse : { cloudId: localId } — pratique quand on
// pull depuis le cloud et qu'on cherche à savoir si une row cloud a déjà
// une contrepartie locale.
export function getReverseMapping() {
	const map = readAll()
	const reverse = {}
	for (const [localId, cloudId] of Object.entries(map)) {
		if (cloudId) reverse[cloudId] = localId
	}
	return reverse
}

export function getAllMappings() {
	return readAll()
}

// Écrase intégralement le mapping — réservé aux outils de migration
// (par exemple : import d'un export complet, reset depuis les paramètres).
export function replaceAllMappings(map) {
	writeAll(map || {})
}

export function clearAllMappings() {
	try { localStorage.removeItem(KEY) } catch { /* noop */ }
}