// jacpaintStore.js
// Store IndexedDB local des toiles JacPaint.
//
// Modèle d'une toile :
//   { id, title, width, height, thumbnail, createdAt, updatedAt, ownerId, cloudId, source }
//
// API exposée :
//   - list()            : Promise<Toile[]> triées par updatedAt desc
//   - get(id)           : Promise<Toile|null>
//   - create({...})     : Promise<Toile>
//   - update(id, patch) : Promise<Toile>
//   - remove(id)        : Promise<void>
//
// Calque structurel de jacdocStore (DB dédiée, ouverture mise en cache au
// niveau module, helpers withStore() pour ouvrir une transaction).

const DB_NAME = 'jacpaint'
const DB_VERSION = 1
const STORE = 'jacpaint_paintings'

let _dbPromise = null

function openDb() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' })
        os.createIndex('updatedAt', 'updatedAt', { unique: false })
        os.createIndex('ownerId', 'ownerId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function uuid() {
  // crypto.randomUUID est dispo dans tous les browsers modernes ; fallback
  // simple base36+timestamp si jamais l'environnement ne le supporte pas.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const jacpaintStore = {
  // Liste complète triée par updatedAt desc. Sans `await` intermédiaire :
  // on charge tout puis on trie en mémoire (les toiles sont peu nombreuses
  // par utilisateur, l'overhead est négligeable).
  async list() {
    return new Promise(async (resolve, reject) => {
      const db = await openDb()
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => {
        const all = req.result || []
        all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        resolve(all)
      }
      req.onerror = () => reject(req.error)
    })
  },

  async get(id) {
    if (!id) return null
    return new Promise(async (resolve, reject) => {
      const db = await openDb()
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  },

  // Crée une nouvelle toile. Les dimensions sont clampées (64–8192 px) à la
  // création pour éviter les valeurs aberrantes. Pas de thumbnail au départ
  // — elle sera générée par l'éditeur à la première sauvegarde.
  async create({ title, width, height, ownerId = null, cloudId = null, source = cloudId ? 'jacpaint_cloud' : 'local' } = {}) {
    const now = new Date().toISOString()
    const painting = {
      id: uuid(),
      title: (title || '').trim() || 'Toile sans titre',
      width: clampDim(width, 1920),
      height: clampDim(height, 1080),
      thumbnail: null,
      createdAt: now,
      updatedAt: now,
      ownerId,
      cloudId,
      source,
    }
    await withStore('readwrite', (store) => store.put(painting))
    return painting
  },

  // Merge un patch dans la toile existante. updatedAt est toujours rafraîchi.
  // Renvoie la toile complète post-merge pour faciliter l'usage côté UI.
  async update(id, patch = {}) {
    const existing = await this.get(id)
    if (!existing) throw new Error(`jacpaintStore.update : toile ${id} introuvable`)
    const next = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    await withStore('readwrite', (store) => store.put(next))
    return next
  },

  async remove(id) {
    if (!id) return
    await withStore('readwrite', (store) => store.delete(id))
  },
}

function clampDim(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(64, Math.min(8192, Math.round(n)))
}