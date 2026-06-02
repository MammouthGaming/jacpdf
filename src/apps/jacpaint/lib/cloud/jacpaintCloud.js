// jacpaintCloud.js — wrappers Supabase pour JacPaint Cloud.
//
// Architecture :
//   - DB : métadonnées des toiles/snapshots/dossiers (tables jacpaint_*)
//   - Storage : binaires .jacpaint + miniatures PNG + snapshots PNG
//     dans le bucket privé `jacpaint-canvases`
//
// Convention des chemins Storage :
//   <user_id>/<canvas_id>/canvas.jacpaint   — binaire courant
//   <user_id>/<canvas_id>/thumb.png         — miniature courante
//   <user_id>/<canvas_id>/snapshots/<snap_id>.png
//
// Les fonctions exportent en camelCase ; les colonnes DB sont en snake_case
// donc on mappe à la lecture (toCamel) et à l'écriture (toSnake).

import { supabase } from '@/shared/lib/infra/supabase'

const BUCKET = 'jacpaint-canvases'

// ─────── Helpers internes ───────

async function currentUserId() {
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('jacpaintCloud: not_authenticated')
	return user.id
}

function canvasToCamel(row) {
	if (!row) return null
	return {
		id: row.id,
		userId: row.user_id,
		title: row.title,
		folderId: row.folder_id,
		width: row.width,
		height: row.height,
		storagePath: row.storage_path,
		thumbPath: row.thumb_path,
		byteSize: row.byte_size,
		revision: row.revision,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastOpenedAt: row.last_opened_at,
	}
}

function folderToCamel(row) {
	if (!row) return null
	return {
		id: row.id,
		userId: row.user_id,
		name: row.name,
		parentId: row.parent_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function snapshotToCamel(row) {
	if (!row) return null
	return {
		id: row.id,
		canvasId: row.canvas_id,
		userId: row.user_id,
		name: row.name,
		kind: row.kind,
		storagePath: row.storage_path,
		byteSize: row.byte_size,
		createdAt: row.created_at,
	}
}

function canvasStoragePath(userId, canvasId) {
	return `${userId}/${canvasId}/canvas.jacpaint`
}
function thumbStoragePath(userId, canvasId) {
	return `${userId}/${canvasId}/thumb.png`
}
function snapshotStoragePath(userId, canvasId, snapshotId) {
	return `${userId}/${canvasId}/snapshots/${snapshotId}.png`
}

// ─────── Canvases ───────

export async function listCanvases({ folderId = undefined } = {}) {
	const userId = await currentUserId()
	let q = supabase.from('jacpaint_canvases')
		.select('*')
		.eq('user_id', userId)
		.order('updated_at', { ascending: false })
	if (folderId === null) q = q.is('folder_id', null)
	else if (folderId) q = q.eq('folder_id', folderId)
	const { data, error } = await q
	if (error) throw error
	return (data || []).map(canvasToCamel)
}

export async function getCanvas(id) {
	if (!id) return null
	const { data, error } = await supabase
		.from('jacpaint_canvases')
		.select('*')
		.eq('id', id)
		.maybeSingle()
	if (error) throw error
	return canvasToCamel(data)
}

export async function createCanvas({ title, width = 1920, height = 1080, folderId = null } = {}) {
	const userId = await currentUserId()
	const { data, error } = await supabase
		.from('jacpaint_canvases')
		.insert({
			user_id: userId,
			title: (title || 'Toile sans titre').trim(),
			width,
			height,
			folder_id: folderId,
		})
		.select('*')
		.single()
	if (error) throw error
	return canvasToCamel(data)
}

export async function updateCanvas(id, patch = {}) {
	const toSnake = {}
	if (patch.title !== undefined) toSnake.title = patch.title
	if (patch.folderId !== undefined) toSnake.folder_id = patch.folderId
	if (patch.width !== undefined) toSnake.width = patch.width
	if (patch.height !== undefined) toSnake.height = patch.height
	if (patch.lastOpenedAt !== undefined) toSnake.last_opened_at = patch.lastOpenedAt
	toSnake.updated_at = new Date().toISOString()
	const { data, error } = await supabase
		.from('jacpaint_canvases')
		.update(toSnake)
		.eq('id', id)
		.select('*')
		.single()
	if (error) throw error
	return canvasToCamel(data)
}

export async function renameCanvas(id, title) {
	return updateCanvas(id, { title })
}

export async function moveCanvas(id, folderId) {
	return updateCanvas(id, { folderId })
}

export async function deleteCanvas(id) {
	const canvas = await getCanvas(id)
	if (!canvas) return
	const paths = []
	if (canvas.storagePath) paths.push(canvas.storagePath)
	if (canvas.thumbPath) paths.push(canvas.thumbPath)
	// Snapshots vivent dans <user>/<canvas>/snapshots/ — listons-les explicitement.
	try {
		const { data: list } = await supabase.storage
			.from(BUCKET)
			.list(`${canvas.userId}/${canvas.id}/snapshots`, { limit: 1000 })
		if (list && list.length) {
			for (const item of list) {
				paths.push(`${canvas.userId}/${canvas.id}/snapshots/${item.name}`)
			}
		}
	} catch { /* bucket vide, on s'en fout */ }
	if (paths.length) {
		await supabase.storage.from(BUCKET).remove(paths)
	}
	const { error } = await supabase
		.from('jacpaint_canvases')
		.delete()
		.eq('id', id)
	if (error) throw error
}

// Pousse le binaire `.jacpaint` + miniature dans Storage et met à jour la row.
// `canvasBlob` est un Blob/ArrayBuffer du fichier .jacpaint courant.
// `thumbBlob`  est un Blob PNG (optionnel).
export async function saveCanvasBinary(id, { canvasBlob, thumbBlob } = {}) {
	const canvas = await getCanvas(id)
	if (!canvas) throw new Error(`jacpaintCloud.saveCanvasBinary: ${id} introuvable`)
	const path = canvasStoragePath(canvas.userId, canvas.id)
	const thumb = thumbStoragePath(canvas.userId, canvas.id)
	let byteSize = canvas.byteSize || 0
	if (canvasBlob) {
		const { error } = await supabase.storage
			.from(BUCKET)
			.upload(path, canvasBlob, { upsert: true, contentType: 'application/octet-stream' })
		if (error) throw error
		byteSize = canvasBlob.size || canvasBlob.byteLength || byteSize
	}
	if (thumbBlob) {
		const { error } = await supabase.storage
			.from(BUCKET)
			.upload(thumb, thumbBlob, { upsert: true, contentType: 'image/png' })
		if (error) throw error
	}
	const { data, error } = await supabase
		.from('jacpaint_canvases')
		.update({
			storage_path: path,
			thumb_path: thumbBlob ? thumb : (canvas.thumbPath || null),
			byte_size: byteSize,
			revision: (canvas.revision || 1) + 1,
			updated_at: new Date().toISOString(),
		})
		.eq('id', id)
		.select('*')
		.single()
	if (error) throw error
	return canvasToCamel(data)
}

export async function downloadCanvasBinary(id) {
	const canvas = await getCanvas(id)
	if (!canvas || !canvas.storagePath) return { canvas, blob: null }
	const { data, error } = await supabase.storage
		.from(BUCKET)
		.download(canvas.storagePath)
	if (error) throw error
	return { canvas, blob: data }
}

export async function getCanvasThumbUrl(id, { expiresIn = 60 * 60 } = {}) {
	const canvas = await getCanvas(id)
	if (!canvas || !canvas.thumbPath) return null
	const { data, error } = await supabase.storage
		.from(BUCKET)
		.createSignedUrl(canvas.thumbPath, expiresIn)
	if (error) throw error
	return data?.signedUrl || null
}

// ─────── Snapshots ───────

export async function listSnapshots(canvasId) {
	const { data, error } = await supabase
		.from('jacpaint_snapshots')
		.select('*')
		.eq('canvas_id', canvasId)
		.order('created_at', { ascending: false })
	if (error) throw error
	return (data || []).map(snapshotToCamel)
}

export async function uploadSnapshot(canvasId, { name = 'Snapshot', kind = 'manual', pngBlob }) {
	if (!pngBlob) throw new Error('jacpaintCloud.uploadSnapshot: pngBlob requis')
	const userId = await currentUserId()
	const { data: row, error: rowErr } = await supabase
		.from('jacpaint_snapshots')
		.insert({
			canvas_id: canvasId,
			user_id: userId,
			name,
			kind,
			storage_path: 'pending', // ré-écrit juste après
			byte_size: pngBlob.size || 0,
		})
		.select('*')
		.single()
	if (rowErr) throw rowErr
	const path = snapshotStoragePath(userId, canvasId, row.id)
	const { error: upErr } = await supabase.storage
		.from(BUCKET)
		.upload(path, pngBlob, { upsert: true, contentType: 'image/png' })
	if (upErr) {
		await supabase.from('jacpaint_snapshots').delete().eq('id', row.id)
		throw upErr
	}
	const { data: updated, error: updErr } = await supabase
		.from('jacpaint_snapshots')
		.update({ storage_path: path })
		.eq('id', row.id)
		.select('*')
		.single()
	if (updErr) throw updErr
	return snapshotToCamel(updated)
}

export async function deleteSnapshot(id) {
	const { data: row } = await supabase
		.from('jacpaint_snapshots')
		.select('*')
		.eq('id', id)
		.maybeSingle()
	if (row?.storage_path) {
		try { await supabase.storage.from(BUCKET).remove([row.storage_path]) } catch { /* noop */ }
	}
	const { error } = await supabase
		.from('jacpaint_snapshots')
		.delete()
		.eq('id', id)
	if (error) throw error
}

export async function getSnapshotUrl(id, { expiresIn = 60 * 60 } = {}) {
	const { data: row } = await supabase
		.from('jacpaint_snapshots')
		.select('storage_path')
		.eq('id', id)
		.maybeSingle()
	if (!row?.storage_path) return null
	const { data, error } = await supabase.storage
		.from(BUCKET)
		.createSignedUrl(row.storage_path, expiresIn)
	if (error) throw error
	return data?.signedUrl || null
}

// ─────── Folders ───────

export async function listFolders({ parentId = undefined } = {}) {
	const userId = await currentUserId()
	let q = supabase.from('jacpaint_folders')
		.select('*')
		.eq('user_id', userId)
		.order('name', { ascending: true })
	if (parentId === null) q = q.is('parent_id', null)
	else if (parentId) q = q.eq('parent_id', parentId)
	const { data, error } = await q
	if (error) throw error
	return (data || []).map(folderToCamel)
}

export async function createFolder({ name, parentId = null }) {
	const userId = await currentUserId()
	const { data, error } = await supabase
		.from('jacpaint_folders')
		.insert({ user_id: userId, name: (name || 'Dossier').trim(), parent_id: parentId })
		.select('*')
		.single()
	if (error) throw error
	return folderToCamel(data)
}

export async function renameFolder(id, name) {
	const { data, error } = await supabase
		.from('jacpaint_folders')
		.update({ name, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select('*')
		.single()
	if (error) throw error
	return folderToCamel(data)
}

export async function moveFolder(id, parentId) {
	const { data, error } = await supabase
		.from('jacpaint_folders')
		.update({ parent_id: parentId, updated_at: new Date().toISOString() })
		.eq('id', id)
		.select('*')
		.single()
	if (error) throw error
	return folderToCamel(data)
}

export async function deleteFolder(id) {
	const { error } = await supabase
		.from('jacpaint_folders')
		.delete()
		.eq('id', id)
	if (error) throw error
}

export async function getFolderPath(id) {
	if (!id) return []
	const path = []
	let currentId = id
	while (currentId) {
		const { data, error } = await supabase
			.from('jacpaint_folders')
			.select('*')
			.eq('id', currentId)
			.maybeSingle()
		if (error || !data) break
		path.unshift(folderToCamel(data))
		currentId = data.parent_id
	}
	return path
}

// ─────── Shares (liens publics lecture seule) ───────
//
// On stocke un token aléatoire dans `jacpaint_shares` avec `token_enabled`
// et `token_expires_at`. Le visiteur publique appelle un RPC `security<br>// definer` (`get_jacpaint_shared_canvas`) qui valide le token et retourne
// les métadonnées + chemins Storage. Les chemins sont lisibles en anon
// grâce à la policy `jacpaint_storage_select_via_share_token`.

function shareToCamel(row) {
	if (!row) return null
	return {
		id: row.id,
		canvasId: row.canvas_id,
		role: row.role,
		sharedWithUserId: row.shared_with_user_id,
		sharedWithEmail: row.shared_with_email,
		token: row.token,
		tokenEnabled: row.token_enabled,
		tokenExpiresAt: row.token_expires_at,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

function generateShareToken() {
	// 32 caractères hex — ni devinable, ni indexable par moteur de recherche.
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID().replace(/-/g, '')
	}
	const buf = new Uint8Array(16)
	crypto.getRandomValues(buf)
	return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// URL publique destinée à la page de visualisation `/jacsuite/jacpaint/share/:token`.
export function buildShareLinkUrl(token) {
	if (!token) return null
	if (typeof window === 'undefined') return `/jacsuite/jacpaint/share/${token}`
	return `${window.location.origin}/jacsuite/jacpaint/share/${token}`
}

// Crée un nouveau lien public lecture seule.
// expiresInDays : number | null ; null = jamais expirer.
export async function createShareLink(canvasId, { expiresInDays = null } = {}) {
	if (!canvasId) throw new Error('jacpaintCloud.createShareLink: canvasId requis')
	const userId = await currentUserId()
	const token = generateShareToken()
	const expiresAt = expiresInDays
		? new Date(Date.now() + expiresInDays * 86400000).toISOString()
		: null
	const { data, error } = await supabase
		.from('jacpaint_shares')
		.insert({
			canvas_id: canvasId,
			token,
			token_enabled: true,
			token_expires_at: expiresAt,
			role: 'viewer',
			created_by: userId,
		})
		.select('*')
		.single()
	if (error) throw error
	return shareToCamel(data)
}

// Liste les liens publics (token != null) pour une toile.
export async function listShareLinks(canvasId) {
	if (!canvasId) return []
	const { data, error } = await supabase
		.from('jacpaint_shares')
		.select('*')
		.eq('canvas_id', canvasId)
		.not('token', 'is', null)
		.order('created_at', { ascending: false })
	if (error) throw error
	return (data || []).map(shareToCamel)
}

// Met à jour un lien existant (activer/désactiver, ou changer l'expiration).
export async function updateShareLink(shareId, { enabled, expiresInDays } = {}) {
	if (!shareId) throw new Error('jacpaintCloud.updateShareLink: shareId requis')
	const patch = { updated_at: new Date().toISOString() }
	if (enabled !== undefined) patch.token_enabled = !!enabled
	if (expiresInDays !== undefined) {
		patch.token_expires_at = expiresInDays
			? new Date(Date.now() + expiresInDays * 86400000).toISOString()
			: null
	}
	const { data, error } = await supabase
		.from('jacpaint_shares')
		.update(patch)
		.eq('id', shareId)
		.select('*')
		.single()
	if (error) throw error
	return shareToCamel(data)
}

// Révoque un lien (suppression définitive).
export async function revokeShareLink(shareId) {
	if (!shareId) return
	const { error } = await supabase
		.from('jacpaint_shares')
		.delete()
		.eq('id', shareId)
	if (error) throw error
}

// ─── Accès public (anon) via token ───

// Renvoie les métadonnées + chemins Storage si le token est valide,
// sinon null. Appelable par un visiteur non connecté.
export async function getPublicSharedCanvas(token) {
	if (!token) return null
	const { data, error } = await supabase.rpc('get_jacpaint_shared_canvas', { p_token: token })
	if (error) throw error
	const row = Array.isArray(data) ? data[0] : data
	if (!row) return null
	return {
		id: row.id,
		title: row.title,
		width: row.width,
		height: row.height,
		storagePath: row.storage_path,
		thumbPath: row.thumb_path,
		updatedAt: row.updated_at,
		role: row.role,
	}
}

// Télécharge un binaire (PNG ou .jacpaint) accessible à un visiteur via
// la storage policy publique. À utiliser avec un `storagePath` ou
// `thumbPath` retourné par `getPublicSharedCanvas`.
export async function downloadPublicBlob(path) {
	if (!path) return null
	const { data, error } = await supabase.storage.from(BUCKET).download(path)
	if (error) throw error
	return data
}

// Génère une URL Object pour <img> à partir d'un chemin Storage public.
export async function getPublicBlobObjectUrl(path) {
	const blob = await downloadPublicBlob(path)
	if (!blob) return null
	return URL.createObjectURL(blob)
}