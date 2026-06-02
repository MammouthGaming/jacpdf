// Store JacNote — pages locales + page active. Pattern identique à
// launcherStore : module-level state, listeners Set, persistance
// localStorage best-effort, ZÉRO dépendance React.
//
// Phase 2 local-first : tout vit dans localStorage. Phase 3 ajoutera
// un miroir Supabase (sync optimiste + résolution de conflits par
// updatedAt), sur le même modèle que jacdocStore.
//
// Format d'une page :
//   { id, icon, title, content, parentId?, updatedAt, trashedAt? }
//
// - id        : string (généré côté client, préfixe 'note_')
// - icon      : string (emoji unique, libre)
// - title     : string (peut être vide)
// - content   : string (HTML léger — innerHTML du contentEditable, peut
//                contenir des <a class="jacnote-page-ref"> pour les
//                sous-pages inline créées via le slash menu)
// - parentId  : string | null (id de la page parente — pour sous-pages)
// - updatedAt : number (Date.now() au dernier set)
// - trashedAt : number (timestamp si en corbeille)
//
// Au premier load (localStorage vide), on injecte 5 pages de démo pour
// que l'utilisateur ait déjà du contenu à explorer.

const NOTES_KEY = 'jacnote_notes_v1'
const ACTIVE_KEY = 'jacnote_activeId_v1'

const SEED = [
  {
    id: 'note_seed_1',
    icon: '📝',
    title: 'Bienvenue dans JacNote',
    content:
      'Commence à écrire ici…\n\nClique sur « + Nouvelle page » dans la sidebar pour créer une page. Clic droit sur une page pour la supprimer.',
    updatedAt: Date.now(),
  },
  {
    id: 'note_seed_2',
    icon: '💡',
    title: 'Idées de fonctionnalités',
    content: 'Slash menu, drag & drop, sync temps réel…',
    updatedAt: Date.now(),
  },
  {
    id: 'note_seed_3',
    icon: '📚',
    title: 'Notes de cours',
    content: 'Math — chapitre 3',
    updatedAt: Date.now(),
  },
  {
    id: 'note_seed_4',
    icon: '✅',
    title: 'TODO — Semaine',
    content:
      '☐ Finir le visuel de JacNote\n☐ Brancher le store\n☐ Tester le bouton + Nouvelle page',
    updatedAt: Date.now(),
  },
  {
    id: 'note_seed_5',
    icon: '🧪',
    title: 'Brouillons',
    content: '',
    updatedAt: Date.now(),
  },
]

const listeners = new Set()

// Génère un id stable pour un bloc — même format que makeId() côté notes.
function makeBlockId() {
  return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

// Migration on-the-fly : si une note n'a pas de tableau `blocks`, on en
// génère un à partir du `content` legacy (split par \n). Permet de
// préserver le contenu existant des utilisateurs qui mettent à jour
// JacNote depuis une version sans modèle de blocs (Phase 15 et avant).
// Les liens inline <a class="jacnote-page-ref">... ne contiennent pas
// de \n donc ils survivent intacts à la migration.
function migrateNote(n) {
  if (!n || typeof n !== 'object') return n
  if (Array.isArray(n.blocks) && n.blocks.length > 0) return n
  const content = typeof n.content === 'string' ? n.content : ''
  if (!content) return { ...n, blocks: [{ id: makeBlockId(), html: '' }] }
  const lines = content.split('\n')
  const blocks = lines.map((line) => ({ id: makeBlockId(), html: line }))
  if (blocks.length === 0) blocks.push({ id: makeBlockId(), html: '' })
  return { ...n, blocks }
}

function readNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(migrateNote)
    }
  } catch {}
  // Premier load : on persiste le seed (après migration vers le modèle
  // de blocs) dès maintenant pour que la prochaine session démarre
  // directement sur la version stockée.
  const migrated = SEED.map(migrateNote)
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(migrated))
  } catch {}
  return migrated
}

function readActiveId(notes) {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    // L'active ne peut pas être une page en corbeille — si l'id
    // persé vise une note maintenant trashée, on bascule sur la
    // première note vivante.
    if (raw && notes.some((n) => n.id === raw && !n.trashedAt)) return raw
  } catch {}
  const firstAlive = notes.find((n) => !n.trashedAt)
  return firstAlive?.id ?? null
}

let notes = readNotes()
let activeId = readActiveId(notes)

// Différé + débouncé — localStorage.setItem est synchrone et bloque
// le thread principal (sérialisation JSON + écriture disque). Pour des
// notes volumineuses (beaucoup de blocs HTML), ça peut prendre 20-80ms,
// ce qui se sent comme un « délai » entre l'appui sur Delete et la dis-
// parition visuelle du bloc. En différant la persistance à un microtask,
// le render React arrive AVANT l'écriture disque — l'UI se rafraîchit
// instantanément et le sauvegarde se fait juste après, sans bloquer.
let persistTimer = null
function persist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
    } catch {}
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {}
  }, 0)
}

function notify() {
  listeners.forEach((fn) => {
    try { fn() } catch {}
  })
}

// Sélecteurs synchrones — pratiques pour des handlers non React.
// getNotes() filtre les pages dans la corbeille (trashedAt défini).
// Les consommateurs qui ont besoin de l'ensemble brut appellent
// getAllNotes() ; ceux qui veulent la corbeille appellent getTrashedNotes().
export function getNotes() { return notes.filter((n) => !n.trashedAt) }
export function getAllNotes() { return notes }
export function getTrashedNotes() {
  // Tri du plus récemment supprimé au plus ancien, comme Notion.
  return notes
    .filter((n) => n.trashedAt)
    .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
}
export function getActiveId() { return activeId }
export function getActiveNote() {
  return notes.find((n) => n.id === activeId) || null
}

export function setActive(id) {
  if (id === activeId) return
  if (id !== null) {
    const note = notes.find((n) => n.id === id)
    // Refuse d'activer une note inexistante OU dans la corbeille.
    if (!note || note.trashedAt) return
  }
  activeId = id
  persist()
  notify()
}

// Génère un id stable côté client. Pas crypto-grade — c'est juste un
// identifiant local unique pour la clé React et le lookup en mémoire.
function makeId() {
  return `note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function createNote(patch = {}) {
  const note = {
    id: makeId(),
    icon: patch.icon || '📄',
    title: patch.title || 'Sans titre',
    content: patch.content || '',
    parentId: patch.parentId || null,
    updatedAt: Date.now(),
  }
  // Nouvelles pages en haut de la liste (ordre chronologique inversé).
  notes = [note, ...notes]
  activeId = note.id
  persist()
  notify()
  return note
}

// Crée une sous-page (avec parentId) SANS basculer l'activeId — pour les
// références inline insérées via le slash menu « Nouvelle page ».
// L'utilisateur reste sur la page courante et clique sur la référence
// pour y naviguer manuellement (comme dans Notion).
export function createChildNote(parentId, patch = {}) {
  const note = {
    id: makeId(),
    icon: patch.icon || '📄',
    title: patch.title || 'Sans titre',
    content: patch.content || '',
    parentId: parentId || null,
    updatedAt: Date.now(),
  }
  notes = [note, ...notes]
  // PAS de mutation de activeId — c'est ce qui distingue de createNote.
  persist()
  notify()
  return note
}

export function updateNote(id, patch) {
  let changed = false
  notes = notes.map((n) => {
    if (n.id !== id) return n
    // No-op silencieux si le patch ne change rien (évite des re-renders
    // inutiles quand un onBlur fire avec la même valeur).
    let touched = false
    const next = { ...n }
    for (const k of ['icon', 'title', 'content', 'blocks']) {
      if (!(k in patch)) continue
      if (k === 'blocks') {
        // Comparaison structurelle (JSON) pour éviter les re-renders
        // inutiles quand un onBlur re-pousse le même tableau.
        const prev = Array.isArray(n[k]) ? n[k] : null
        let same = false
        try { same = JSON.stringify(patch[k]) === JSON.stringify(prev) } catch {}
        if (same) continue
        next[k] = patch[k]
        touched = true
      } else if (patch[k] !== n[k]) {
        next[k] = patch[k]
        touched = true
      }
    }
    if (!touched) return n
    next.updatedAt = Date.now()
    changed = true
    return next
  })
  if (changed) {
    persist()
    notify()
  }
}

// Soft delete : marque la note avec trashedAt et la déplace en
// corbeille. Les consommateurs lisent getNotes() (filtre les corbeillées)
// et getTrashedNotes() séparément, donc la note disparaît de la sidebar
// principale mais reste récupérable jusqu'à emptyTrash() ou
// permanentlyDeleteNote().
export function deleteNote(id) {
  // On calcule la liste des notes vivantes AVANT la mutation pour
  // déterminer la voisine si on supprime la page active.
  const aliveBefore = notes.filter((n) => !n.trashedAt)
  const idx = aliveBefore.findIndex((n) => n.id === id)
  if (idx === -1) return

  notes = notes.map((n) =>
    n.id === id ? { ...n, trashedAt: Date.now() } : n
  )

  if (activeId === id) {
    const aliveAfter = aliveBefore.filter((n) => n.id !== id)
    activeId = aliveAfter[idx]?.id || aliveAfter[idx - 1]?.id || aliveAfter[0]?.id || null
  }
  persist()
  notify()
}

// Restaure une note depuis la corbeille (efface trashedAt). Si aucune
// note n'était active (corbeille vidée puis dernière page restaurée),
// on active la note restaurée — cf. UX Notion.
export function restoreNote(id) {
  let changed = false
  notes = notes.map((n) => {
    if (n.id !== id) return n
    if (!n.trashedAt) return n
    changed = true
    const { trashedAt, ...rest } = n
    return rest
  })
  if (!changed) return
  if (!activeId) activeId = id
  persist()
  notify()
}

// Suppression définitive d'une page depuis la corbeille.
export function permanentlyDeleteNote(id) {
  const before = notes.length
  notes = notes.filter((n) => n.id !== id)
  if (notes.length === before) return
  // Garde-fou : si la note était active (ne devrait pas arriver puisque
  // active ne peut pas être en corbeille), bascule sur la première vivante.
  if (activeId === id) {
    const firstAlive = notes.find((n) => !n.trashedAt)
    activeId = firstAlive?.id || null
  }
  persist()
  notify()
}

// Vide la corbeille — supprime définitivement toutes les notes avec
// trashedAt. N'affecte pas les notes vivantes.
export function emptyTrash() {
  const before = notes.length
  notes = notes.filter((n) => !n.trashedAt)
  if (notes.length === before) return
  persist()
  notify()
}

// Subscribe pattern minimal — le hook useJacNote s'en charge côté React.
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}