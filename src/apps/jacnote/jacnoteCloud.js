// jacnoteCloud.js
// Couche d'accès Supabase pour JacNote (tables jacnote_folders + jacnote_notes).
// Le store Zustand reste source de vérité local-first ; ce module fait le
// miroir cloud (pull/push/upsert/delete) et expose les serializers utilisés
// par useJacNoteCloud.
//
// Pattern calqué sur jactacheCloud.js, simplifié pour le scope solo-user
// (pas de partage, pas de rôles, RLS user_id = auth.uid()).

import { supabase } from '@/shared/lib/infra/supabase'

export const JACNOTE_SOURCE = 'jacnote_cloud'

// ID local du dossier « Boîte de réception ». Système, jamais persisté
// dans Postgres (chaque appareil recrée son inbox via DEFAULT_FOLDERS).
// Les notes dans l'inbox sont stockées avec folder_id = null en cloud,
// et remappées sur 'inbox' au pull.
export const INBOX_ID = 'inbox'

export class JacnoteCloudError extends Error {
	constructor(message, { details } = {}) {
		super(message)
		this.name = 'JacnoteCloudError'
		this.details = details
	}
}

// ─── Helpers ─────────────────────────────────────────

function isUuid(v) {
	return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function getCurrentUserId() {
	const { data: { user } } = await supabase.auth.getUser()
	return user?.id || null
}

// ─── Sérialisation note locale ↔ ligne Postgres ──────

export function serializeNote(note, userId) {
	return {
		id: note.id,
		user_id: userId,
		// inbox local → null cloud (le dossier système n'existe pas en cloud)
		folder_id: !note.folderId || note.folderId === INBOX_ID || !isUuid(note.folderId)
			? null
			: note.folderId,
		title: note.title || '',
		content: note.content || '',
		tags: Array.isArray(note.tags) ? note.tags : [],
		favorite: !!note.favorite,
		created_at: note.createdAt || new Date().toISOString(),
		updated_at: note.updatedAt || new Date().toISOString(),
		trashed_at: note.trashedAt || null,
	}
}

export function deserializeNote(row) {
	return {
		id: row.id,
		folderId: row.folder_id ?? INBOX_ID,
		title: row.title ?? '',
		content: row.content ?? '',
		tags: row.tags || [],
		favorite: !!row.favorite,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		trashedAt: row.trashed_at,
	}
}

export function serializeFolder(folder, userId, position) {
	return {
		id: folder.id,
		user_id: userId,
		name: folder.name || 'Sans titre',
		icon: folder.icon || 'folder',
		// inbox jamais en parent (filtré upstream)
		parent_id: folder.parentId && folder.parentId !== INBOX_ID && isUuid(folder.parentId)
			? folder.parentId
			: null,
		position: typeof position === 'number' ? position : (folder.position ?? 0),
		system: !!folder.system,
		updated_at: folder.updatedAt || new Date().toISOString(),
	}
}

export function deserializeFolder(row) {
	return {
		id: row.id,
		name: row.name,
		icon: row.icon || 'folder',
		parentId: row.parent_id ?? null,
		position: row.position ?? 0,
		system: !!row.system,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

// ─── Lectures ────────────────────────────────────────

/** Pull complet de l'utilisateur courant (notes + dossiers). */
export async function pullAll() {
	const userId = await getCurrentUserId()
	if (!userId) throw new JacnoteCloudError('not authenticated')

	const [foldersRes, notesRes] = await Promise.all([
		supabase
			.from('jacnote_folders')
			.select('*')
			.eq('user_id', userId)
			.order('parent_id', { ascending: true, nullsFirst: true })
			.order('position', { ascending: true }),
		supabase
			.from('jacnote_notes')
			.select('*')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false }),
	])

	if (foldersRes.error) throw new JacnoteCloudError('pullAll folders failed', { details: foldersRes.error })
	if (notesRes.error) throw new JacnoteCloudError('pullAll notes failed', { details: notesRes.error })

	return {
		folders: (foldersRes.data || []).map(deserializeFolder),
		notes: (notesRes.data || []).map(deserializeNote),
	}
}

/** Compte les rows distants pour l'écran Cloud (badges). */
export async function getCloudStats() {
	const userId = await getCurrentUserId()
	if (!userId) return null

	const [notesCount, foldersCount] = await Promise.all([
		supabase.from('jacnote_notes').select('id', { count: 'exact', head: true }).eq('user_id', userId),
		supabase.from('jacnote_folders').select('id', { count: 'exact', head: true }).eq('user_id', userId),
	])

	return {
		noteCount: notesCount.count || 0,
		folderCount: foldersCount.count || 0,
	}
}

// ─── Écritures ───────────────────────────────────────

/** Upsert une note (insert si nouvelle, update sinon — clé : id UUID). */
export async function upsertNote(note) {
	const userId = await getCurrentUserId()
	if (!userId) throw new JacnoteCloudError('not authenticated')
	if (!isUuid(note.id)) return // skip pseudo-IDs (sécurité)

	const { error } = await supabase
		.from('jacnote_notes')
		.upsert(serializeNote(note, userId), { onConflict: 'id' })
	if (error) throw new JacnoteCloudError('upsertNote failed', { details: error })
}

export async function upsertFolder(folder, position) {
	if (!folder || folder.id === INBOX_ID || folder.system) return // jamais sync
	if (!isUuid(folder.id)) return
	const userId = await getCurrentUserId()
	if (!userId) throw new JacnoteCloudError('not authenticated')

	const { error } = await supabase
		.from('jacnote_folders')
		.upsert(serializeFolder(folder, userId, position), { onConflict: 'id' })
	if (error) throw new JacnoteCloudError('upsertFolder failed', { details: error })
}

export async function deleteNoteCloud(id) {
	if (!isUuid(id)) return
	const { error } = await supabase.from('jacnote_notes').delete().eq('id', id)
	if (error) throw new JacnoteCloudError('deleteNoteCloud failed', { details: error })
}

export async function deleteFolderCloud(id) {
	if (!isUuid(id) || id === INBOX_ID) return
	const { error } = await supabase.from('jacnote_folders').delete().eq('id', id)
	if (error) throw new JacnoteCloudError('deleteFolderCloud failed', { details: error })
}

/**
 * Push batch en bulk — utilisé par le pull initial pour envoyer les items
 * local-only et par le bouton « Forcer la sync » dans CloudSection.
 */
export async function pushAll({ notes = [], folders = [] } = {}) {
	const userId = await getCurrentUserId()
	if (!userId) throw new JacnoteCloudError('not authenticated')

	const folderRows = folders
		.filter((f) => f && f.id !== INBOX_ID && !f.system && isUuid(f.id))
		.map((f, idx) => serializeFolder(f, userId, f.position ?? idx))

	const noteRows = notes
		.filter((n) => n && isUuid(n.id))
		.map((n) => serializeNote(n, userId))

	if (folderRows.length > 0) {
		const { error } = await supabase
			.from('jacnote_folders')
			.upsert(folderRows, { onConflict: 'id' })
		if (error) throw new JacnoteCloudError('pushAll folders failed', { details: error })
	}
	if (noteRows.length > 0) {
		const { error } = await supabase
			.from('jacnote_notes')
			.upsert(noteRows, { onConflict: 'id' })
		if (error) throw new JacnoteCloudError('pushAll notes failed', { details: error })
	}
}