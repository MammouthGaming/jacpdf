// snapshots.js — Historique de versions locales pour JacPaint.
// Phase 9 étape 3. Persistance en IndexedDB (table 'snapshots').
//
// Chaque snapshot contient :
//   { id, paintingId, label, createdAt, manual, width, height,
//     project, thumbnail }
//
// 'project' a la même structure qu'un export .jacpaint :
//   { format, version, name, width, height, layers: [...] }
// 'thumbnail' est une dataURL PNG ≤ 160 px (pour l'aperçu dans la modal).
//
// Règles :
//   • Snapshots manuels (manual: true) : illimités, ne sont jamais
//     supprimés automatiquement.
//   • Snapshots automatiques (manual: false) : max 10 par painting,
//     les plus vieux sont prunés en FIFO.

const DB_NAME = 'jacpaint'
const DB_VERSION = 1
const STORE = 'snapshots'
const MAX_AUTO_PER_PAINTING = 10

// Cache de la connexion DB.
let dbPromise = null

function openDB() {
	if (dbPromise) return dbPromise
	dbPromise = new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB indisponible dans ce navigateur.'))
			return
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION)
		req.onupgradeneeded = (e) => {
			const db = e.target.result
			if (!db.objectStoreNames.contains(STORE)) {
				const store = db.createObjectStore(STORE, { keyPath: 'id' })
				store.createIndex('paintingId', 'paintingId', { unique: false })
				store.createIndex('createdAt', 'createdAt', { unique: false })
			}
		}
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
	return dbPromise
}

// Promisifie un IDBRequest.
function reqToPromise(req) {
	return new Promise((res, rej) => {
		req.onsuccess = () => res(req.result)
		req.onerror = () => rej(req.error)
	})
}

// Sérialise les calques actuels en même format qu'un .jacpaint export.
function serializeProject({ painting, layers }) {
	const serializedLayers = (layers || []).map((l) => {
		let dataURL = null
		if (l && l.canvas) {
			try { dataURL = l.canvas.toDataURL('image/png') } catch { dataURL = null }
		}
		return {
			id: l && l.id,
			name: (l && l.name) || '',
			blendMode: (l && l.blendMode) || 'normal',
			opacity: l && typeof l.opacity === 'number' ? l.opacity : 1,
			visible: !(l && l.visible === false),
			locked: !!(l && l.locked),
			groupId: (l && l.groupId) || null,
			dataURL,
		}
	})
	return {
		format: 'jacpaint',
		version: 1,
		name: (painting && painting.name) || 'Peinture',
		width: (painting && painting.width) | 0,
		height: (painting && painting.height) | 0,
		layers: serializedLayers,
	}
}

// Génère une miniature du composite (max 160 px). Compose les calques
// visibles avec leur opacité.
function buildThumbnail({ painting, layers }, maxSize = 160) {
	if (!painting || !painting.width || !painting.height) return null
	const composite = document.createElement('canvas')
	composite.width = painting.width
	composite.height = painting.height
	const ctx = composite.getContext('2d')
	if (!ctx) return null
	for (const l of layers || []) {
		if (!l || l.visible === false || !l.canvas) continue
		ctx.globalAlpha = typeof l.opacity === 'number' ? l.opacity : 1
		ctx.globalCompositeOperation = l.blendMode && l.blendMode !== 'normal' ? l.blendMode : 'source-over'
		try { ctx.drawImage(l.canvas, 0, 0) } catch {}
	}
	ctx.globalAlpha = 1
	ctx.globalCompositeOperation = 'source-over'

	const ratio = composite.width / composite.height
	let tw, th
	if (ratio >= 1) { tw = Math.min(maxSize, composite.width); th = Math.round(tw / ratio) }
	else { th = Math.min(maxSize, composite.height); tw = Math.round(th * ratio) }
	const tc = document.createElement('canvas')
	tc.width = Math.max(1, tw)
	tc.height = Math.max(1, th)
	const tctx = tc.getContext('2d')
	if (!tctx) return null
	tctx.imageSmoothingEnabled = true
	tctx.imageSmoothingQuality = 'high'
	tctx.drawImage(composite, 0, 0, tc.width, tc.height)
	try { return tc.toDataURL('image/png') } catch { return null }
}

// Crée et persiste un snapshot. Si manual:false, prune les vieux auto.
export async function createSnapshot({ paintingId, painting, layers, label, manual = false }) {
	if (!paintingId) throw new Error('paintingId requis pour créer un snapshot.')
	const project = serializeProject({ painting, layers })
	const thumbnail = buildThumbnail({ painting, layers })
	const snapshot = {
		id: 'snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
		paintingId,
		label: label || (manual ? 'Snapshot manuel' : 'Auto-snapshot'),
		createdAt: new Date().toISOString(),
		manual: !!manual,
		width: project.width,
		height: project.height,
		layersCount: project.layers.length,
		project,
		thumbnail,
	}
	const db = await openDB()
	await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite')
		tx.objectStore(STORE).put(snapshot)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
	if (!manual) await pruneAutoSnapshots(paintingId)
	return snapshot
}

// Liste tous les snapshots d'un painting, triés du plus récent au plus vieux.
export async function listSnapshots(paintingId) {
	if (!paintingId) return []
	const db = await openDB()
	const tx = db.transaction(STORE, 'readonly')
	const index = tx.objectStore(STORE).index('paintingId')
	const all = await reqToPromise(index.getAll(paintingId))
	return (all || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

// Charge un snapshot complet par id.
export async function loadSnapshot(id) {
	if (!id) return null
	const db = await openDB()
	const tx = db.transaction(STORE, 'readonly')
	return reqToPromise(tx.objectStore(STORE).get(id))
}

// Supprime un snapshot par id.
export async function deleteSnapshot(id) {
	if (!id) return
	const db = await openDB()
	await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite')
		tx.objectStore(STORE).delete(id)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

// Renomme un snapshot (label uniquement).
export async function renameSnapshot(id, newLabel) {
	const snap = await loadSnapshot(id)
	if (!snap) return
	snap.label = newLabel || snap.label
	const db = await openDB()
	await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite')
		tx.objectStore(STORE).put(snap)
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
	})
}

// Supprime les vieux snapshots automatiques au-delà de la limite.
async function pruneAutoSnapshots(paintingId) {
	const all = await listSnapshots(paintingId)
	const autos = all.filter((s) => !s.manual)
	if (autos.length <= MAX_AUTO_PER_PAINTING) return
	const toDelete = autos.slice(MAX_AUTO_PER_PAINTING)
	for (const s of toDelete) {
		try { await deleteSnapshot(s.id) } catch {}
	}
}

// Dérive un paintingId stable depuis un objet painting (id direct,
// url, ou pathname comme fallback).
export function getPaintingId(painting) {
	if (!painting) return 'default'
	return (
		painting.id ||
		painting.paintingId ||
		painting.url ||
		(typeof window !== 'undefined' && window.location ? window.location.pathname.split('/').filter(Boolean).pop() : '') ||
		'default'
	)
}