// Store des couleurs récentes par outil (max 3 par outil)
const store = {
  text:      ['#111111', '#e74c3c', '#f39c12'],
  pencil:    ['#111111', '#e74c3c', '#f39c12'],
  highlight: ['#f39c12', '#2ecc71', '#3498db'],
  shapes:    ['#111111', '#2ecc71', '#e91e8c'],
  listeners: {},

  get(tool) {
    return this[tool] || []
  },

  add(tool, color) {
    if (!Array.isArray(this[tool])) this[tool] = []
    // Retirer si déjà présent, ajouter en premier
    this[tool] = [color, ...this[tool].filter(c => c !== color)].slice(0, 3)
    const fns = this.listeners[tool] || []
    fns.forEach(fn => fn(this[tool]))
  },

  subscribe(tool, fn) {
    if (!this.listeners[tool]) this.listeners[tool] = []
    this.listeners[tool].push(fn)
    return () => {
      this.listeners[tool] = this.listeners[tool].filter(l => l !== fn)
    }
  }
}

export const recentColorsStore = store
