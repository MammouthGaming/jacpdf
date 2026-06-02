// Visibilité des sections de la page d'accueil.
// Persistée dans localStorage. Tous les éléments sont visibles par défaut ;
// l'utilisateur peut masquer individuellement chaque section depuis
// EditSidebar. Pas d'I/O réseau — strictement local par profil navigateur.

const STORAGE_KEY = 'jacpdf:home-visibility'

// Clés correspondant aux sections de HomeContent.jsx :
//   notifications  : bouton 🔔 en haut-droite
//   friends        : bouton 👥 en haut-droite
//   apps           : bouton ⋮⋮ (menu Applications style Google Apps)
//   drive          : carte Google Drive (grille principale)
//   jacpdfCloud    : carte JacPDF Cloud (grille principale)
//   friendActivity : section Activité des amis (style Spotify)
//   recents        : section Fichiers récents
const DEFAULTS = {
  notifications: true,
  friends: true,
  apps: true,
  friendActivity: true,
  recents: true,
  drive: true,
  jacpdfCloud: true,
  // Mode réorganisation — quand true, les éléments de la home (boutons en
  // haut, cartes, sections) deviennent draggables pour réorganiser. OFF par
  // défaut pour ne pas interférer avec les clicks normaux. Toggle dans la
  // sidebar EditSidebar (toggle mis en avant tout en haut).
  dragMode: false,
  // Ordre des items dans chaque groupe de la sidebar de personnalisation.
  // Drag-and-drop dans EditSidebar met à jour ces tableaux. La home rend
  // les éléments dans cet ordre (filtrés par leur flag de visibilité).
  topActionsOrder: ['notifications', 'friends', 'apps'],
  sectionsOrder: ['drive', 'jacpdfCloud', 'friendActivity', 'recents'],
}

// Cache mémoire pour éviter un parse JSON à chaque getAll(). Initialisé
// au premier read() puis mis à jour synchroneously par write().
let cache = null
let listeners = []

function read() {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    // Merge avec DEFAULTS pour qu'une nouvelle clé ajoutée plus tard ait
    // une valeur par défaut sans casser les anciens profils.
    cache = { ...DEFAULTS, ...parsed }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

function write(next) {
  cache = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (err) {
    if (import.meta.env.DEV) console.error('[homeVisibility] write failed', err)
  }
  listeners.forEach((fn) => fn(next))
}

export const homeVisibilityStore = {
  /** État complet (tous les flags). */
  getAll() {
    return read()
  },
  /** True si la section est visible (true par défaut si la clé manque). */
  isVisible(key) {
    return read()[key] !== false
  },
  /** Force une valeur précise. */
  setVisible(key, value) {
    write({ ...read(), [key]: !!value })
  },
  /** Inverse la valeur courante. */
  toggle(key) {
    const current = read()
    write({ ...current, [key]: !current[key] })
  },
  /** Met à jour l'ordre d'un groupe ('topActionsOrder' ou 'sectionsOrder').
   *  Le tableau passé doit contenir exactement les mêmes clés, juste
   *  dans un ordre différent. */
  setOrder(orderKey, order) {
    write({ ...read(), [orderKey]: [...order] })
  },
  /** S'abonne aux changements ; renvoie une fonction de désabonnement. */
  subscribe(fn) {
    listeners.push(fn)
    return () => {
      listeners = listeners.filter((l) => l !== fn)
    }
  },
}

// Labels affichés dans la sidebar EditSidebar (français Québec).
export const HOME_VISIBILITY_LABELS = {
  notifications: 'Notifications',
  friends: 'Amis',
  apps: 'Applications',
  friendActivity: 'Activité des amis',
  recents: 'Fichiers récents',
  drive: 'Google Drive',
  jacpdfCloud: 'JacPDF Cloud',
}