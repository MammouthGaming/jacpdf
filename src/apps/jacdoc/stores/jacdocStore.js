// Persistance locale-first des documents JacDoc.
// IndexedDB via la lib `idb`. DB = "jacsuite", store object = "jacdocs".
//
// Forme d'un doc :
//   { id, title, doc (ProseMirror JSON), createdAt, updatedAt,
//     ownerId, classroomId, syncedAt,
//     cloudId, folderId, driveFileId, driveFileName,
//     source, revision, isShared, shareRole, canEdit }
//
// Phase Cloud : IndexedDB reste le cache/offline-first. Supabase devient le
// miroir réseau quand `cloudId` est présent. Ça permet d'ouvrir un doc JacDoc
// Cloud dans l'éditeur existant sans changer le contrat de JacDocEditor.

import { openDB } from 'idb'

const DB_NAME = 'jacsuite'
const STORE = 'jacdocs'
const STORE_VERSIONS = 'jacdocVersions'
const DB_VERSION = 3

// Document ProseMirror vide — exposé pour que JacDocEditor puisse fallback
// dessus quand le doc chargé n'a pas encore de contenu (première ouverture).
export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

let dbPromise = null
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        let store
        if (!db.objectStoreNames.contains(STORE)) {
          store = db.createObjectStore(STORE, { keyPath: 'id' })
          // Index utiles pour lister les récents sans tout charger,
          // et récupérer les docs d'une classe spécifique.
          store.createIndex('updatedAt', 'updatedAt')
          store.createIndex('classroomId', 'classroomId')
        } else {
          store = transaction.objectStore(STORE)
        }

        // v3 — Cloud JacDoc : on garde un id local stable (id) + l'id
        // Supabase (cloudId). L'index permet de retrouver rapidement le cache
        // local d'un document cloud rouvert depuis le picker.
        if (oldVersion < 3 && store && !store.indexNames.contains('cloudId')) {
          store.createIndex('cloudId', 'cloudId')
        }

        // Versions = snapshots du doc créés à chaque sauvegarde (max 1/min).
        // Alimente l'historique des versions style Google Docs visible via
        // l'icône « Historique » de la topbar de JacDocEditor.
        if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
          const vstore = db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' })
          vstore.createIndex('docId', 'docId')
          vstore.createIndex('createdAt', 'createdAt')
        }
      },
    })
  }
  return dbPromise
}

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `jacdoc-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeTitle(title) {
  return (title || '').trim() || 'Sans titre'
}

export const jacdocStore = {
  // Liste tous les docs triés par updatedAt desc.
  async list() {
    const db = await getDB()
    const all = await db.getAll(STORE)
    return (all || []).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  },

  // Récupère un doc par id, ou null s'il n'existe pas.
  async get(id) {
    if (!id) return null
    const db = await getDB()
    return (await db.get(STORE, id)) || null
  },

  // Récupère le cache local lié à un document Supabase.
  async getByCloudId(cloudId) {
    if (!cloudId) return null
    const db = await getDB()
    try {
      return (await db.getFromIndex(STORE, 'cloudId', cloudId)) || null
    } catch {
      // Fallback si l'utilisateur a une IndexedDB créée avant l'index et que
      // le navigateur n'a pas encore migré proprement.
      const all = await db.getAll(STORE)
      return (all || []).find((d) => d.cloudId === cloudId) || null
    }
  },

  // Crée un nouveau doc. Retourne l'objet complet (avec id + timestamps).
  //
  // `doc` (optionnel) :
  //   - JSON ProseMirror     → utilisé tel quel par Tiptap au mount
  //   - String HTML          → Tiptap setContent() la parse automatiquement
  //                            au mount via l'extension Image/StarterKit/etc.
  //   - undefined / non fourni → fallback sur EMPTY_DOC (création rapide).
  async create({
    title,
    classroomId,
    ownerId,
    doc: initialDoc,
    cloudId = null,
    folderId = null,
    driveFileId = null,
    driveFileName = null,
    source = cloudId ? 'jacdoc_cloud' : driveFileId ? 'google_drive' : 'local',
    syncedAt = null,
    revision = 1,
    isShared = false,
    shareRole = isShared ? 'viewer' : 'owner',
    canEdit = shareRole === 'owner' || shareRole === 'editor',
  } = {}) {
    const now = new Date().toISOString()
    const next = {
      id: uid(),
      title: normalizeTitle(title),
      doc: initialDoc !== undefined ? initialDoc : EMPTY_DOC,
      createdAt: now,
      updatedAt: now,
      ownerId: ownerId || null,
      classroomId: classroomId || null,
      syncedAt,
      cloudId,
      folderId,
      driveFileId,
      driveFileName,
      source,
      revision,
      isShared,
      shareRole,
      canEdit,
    }
    const db = await getDB()
    await db.put(STORE, next)
    return next
  },

  // Upsert local depuis JacDoc Cloud.
  // Utilisé quand l'utilisateur ouvre un doc depuis JacdocCloudFilePicker :
  //   - si déjà caché localement → on remplace par la version cloud fraîche
  //   - sinon → on crée une entrée locale liée au cloudId
  async upsertFromCloud(cloudDoc) {
    if (!cloudDoc?.cloudId && !cloudDoc?.id) return null
    const cloudId = cloudDoc.cloudId || cloudDoc.id
    const existing = await this.getByCloudId(cloudId)
    const now = new Date().toISOString()
    const patch = {
      title: normalizeTitle(cloudDoc.title),
      doc: cloudDoc.doc ?? EMPTY_DOC,
      ownerId: cloudDoc.ownerId || null,
      classroomId: cloudDoc.classroomId || null,
      syncedAt: cloudDoc.syncedAt || cloudDoc.updatedAt || now,
      cloudId,
      folderId: cloudDoc.folderId ?? null,
      source: 'jacdoc_cloud',
      revision: cloudDoc.revision || existing?.revision || 1,
      isShared: !!cloudDoc.isShared,
      shareRole: cloudDoc.shareRole || (cloudDoc.isShared ? 'viewer' : 'owner'),
      canEdit: cloudDoc.canEdit ?? (!cloudDoc.isShared || cloudDoc.shareRole === 'editor'),
      updatedAt: cloudDoc.updatedAt || now,
    }

    if (existing) {
      const merged = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt || cloudDoc.createdAt || now,
      }
      const db = await getDB()
      await db.put(STORE, merged)
      return merged
    }

    const db = await getDB()
    const next = {
      id: uid(),
      createdAt: cloudDoc.createdAt || now,
      ...patch,
    }
    await db.put(STORE, next)
    return next
  },

  // Upsert local depuis Google Drive.
  // Le fichier Drive reste un `.jacdoc.json` portable. On garde driveFileId
  // pour que l'autosave puisse réécrire le même fichier au lieu de créer une
  // nouvelle copie à chaque sauvegarde.
  async upsertFromDrive(driveDoc) {
    if (!driveDoc?.driveFileId) return null

    const db = await getDB()
    const all = await db.getAll(STORE)
    const existing = (all || []).find((d) => d.driveFileId === driveDoc.driveFileId)
    const now = new Date().toISOString()
    const patch = {
      title: normalizeTitle(driveDoc.title || driveDoc.driveFileName),
      doc: driveDoc.doc ?? EMPTY_DOC,
      driveFileId: driveDoc.driveFileId,
      driveFileName: driveDoc.driveFileName || driveDoc.title || null,
      source: 'google_drive',
      syncedAt: driveDoc.syncedAt || now,
      revision: driveDoc.revision || existing?.revision || 1,
      updatedAt: now,
    }

    if (existing) {
      const merged = {
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt || now,
      }
      await db.put(STORE, merged)
      return merged
    }

    const next = {
      id: uid(),
      createdAt: now,
      ownerId: null,
      classroomId: null,
      cloudId: driveDoc.cloudId || null,
      folderId: null,
      isShared: false,
      shareRole: 'owner',
      canEdit: true,
      ...patch,
    }
    await db.put(STORE, next)
    return next
  },

  // Patch partiel d'un doc existant. updatedAt est réécrit à chaque appel
  // sauf si options.touch === false (pratique pour migrations de schéma).
  async update(id, patch, options = {}) {
    if (!id) return null
    const db = await getDB()
    const existing = await db.get(STORE, id)
    if (!existing) return null
    const merged = {
      ...existing,
      ...patch,
      id, // immuable
      updatedAt: options.touch === false
        ? existing.updatedAt
        : new Date().toISOString(),
    }
    await db.put(STORE, merged)
    return merged
  },

  // Supprime un doc local.
  // Note : la suppression cloud est gérée dans JacdocCloudFilePicker /
  // jacdocCloud.js. Ici on supprime seulement le cache IndexedDB.
  async remove(id) {
    if (!id) return
    const db = await getDB()
    await db.delete(STORE, id)
    await this.versions.removeAll(id)
  },

  // ── Versions : snapshots du doc créés à la sauvegarde ─────────────
  // Alimente le panneau « Historique des versions » de JacDoc, calque
  // de l'historique Google Docs. Stockage IDB séparé pour ne pas
  // alourdir l'objet doc principal (un doc peut avoir N snapshots).
  versions: {
    // Liste les snapshots d'un doc, triés du plus récent au plus ancien.
    async list(docId) {
      if (!docId) return []
      const db = await getDB()
      const all = await db.getAllFromIndex(STORE_VERSIONS, 'docId', docId)
      return (all || []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    },
    // Crée un snapshot. `doc` = ProseMirror JSON. user* = métadonnées
    // d'auteur pour l'affichage dans la barre latérale d'historique.
    async create(docId, { doc, title, userId, userName, avatarUrl } = {}) {
      if (!docId) return null
      const now = new Date().toISOString()
      const next = {
        id: uid(),
        docId,
        doc: doc ?? null,
        title: (title || '').toString(),
        userId: userId || null,
        userName: userName || null,
        avatarUrl: avatarUrl || null,
        createdAt: now,
      }
      const db = await getDB()
      await db.put(STORE_VERSIONS, next)
      return next
    },
    async get(versionId) {
      if (!versionId) return null
      const db = await getDB()
      return (await db.get(STORE_VERSIONS, versionId)) || null
    },
    async remove(versionId) {
      if (!versionId) return
      const db = await getDB()
      await db.delete(STORE_VERSIONS, versionId)
    },
    // Purge toutes les versions d'un doc (utilisé quand on supprime le doc).
    async removeAll(docId) {
      if (!docId) return
      const db = await getDB()
      const keys = await db.getAllKeysFromIndex(STORE_VERSIONS, 'docId', docId)
      const tx = db.transaction(STORE_VERSIONS, 'readwrite')
      await Promise.all(keys.map((k) => tx.store.delete(k)))
      await tx.done
    },
  },
}

export default jacdocStore