// Store global de toasts — bulles de feedback en bas à droite de l'écran.
// Permet à n'importe quel composant de notifier l'utilisateur (export
// terminé, modifications sauvegardées, erreur, etc.) sans propager des
// callbacks à travers l'arbre React.
//
// API :
//   add(text, options) → id     ajoute un toast et retourne son id
//   remove(id)                  ferme un toast
//   clear()                     ferme tous les toasts
//   subscribe(fn)               s'abonne aux changements (utilisé par ToastHost)
//   success / info / error      raccourcis pour le champ "type"
//
// options :
//   - type: 'success' | 'info' | 'error' (défaut 'info')
//   - duration: ms avant auto-dismiss (défaut 3500, 0 = persistant)
//   - action: { label, onClick } — bouton dans le toast (ex. "Annuler")
//
// Exemple :
//   toastStore.success('PDF exporté')
//   toastStore.info('Page supprimée', { action: { label: 'Annuler', onClick: restore } })

let toasts = []
let nextId = 1
const listeners = []

function notify() {
  listeners.forEach(fn => fn(toasts))
}

function add(text, options = {}) {
  const id = nextId++
  const toast = {
    id,
    text,
    type: options.type || 'info',
    duration: options.duration != null ? options.duration : 3500,
    action: options.action || null,
    createdAt: Date.now(),
  }
  toasts = [...toasts, toast]
  notify()
  if (toast.duration > 0) {
    setTimeout(() => remove(id), toast.duration)
  }
  return id
}

function remove(id) {
  const before = toasts.length
  toasts = toasts.filter(t => t.id !== id)
  if (toasts.length !== before) notify()
}

function clear() {
  if (toasts.length === 0) return
  toasts = []
  notify()
}

export const toastStore = {
  getAll() { return toasts },
  add,
  remove,
  clear,
  success(text, options) { return add(text, { ...options, type: 'success' }) },
  info(text, options) { return add(text, { ...options, type: 'info' }) },
  error(text, options) { return add(text, { ...options, type: 'error' }) },
  subscribe(fn) {
    listeners.push(fn)
    return () => {
      const i = listeners.indexOf(fn)
      if (i !== -1) listeners.splice(i, 1)
    }
  },
}
