// Préférences de la barre d'outils — orientation, boutons masqués, position.
// Persistant via localStorage. Toolbar et FullSettings y sont abonnés.

const KEY = 'jacpdf_toolbar_settings'

export const ALL_TOOLS = [
  { id: 'select',    label: 'Sélection' },
  { id: 'text',      label: 'Texte' },
  { id: 'comment',   label: 'Commentaire' },
  { id: 'pencil',    label: 'Crayon' },
  { id: 'highlight', label: 'Surligneur' },
  { id: 'shapes',    label: 'Formes' },
  { id: 'image',     label: 'Image' },
  { id: 'eraser',    label: 'Gomme' },
]

const DEFAULT_ORDER = ALL_TOOLS.map(t => t.id)

const DEFAULT = {
  orientation: 'vertical',          // 'vertical' | 'horizontal'
  hiddenTools: [],                  // ['image', 'eraser', ...]
  position: { x: null, y: null },   // null = ancrage par défaut
  toolOrder: [...DEFAULT_ORDER],    // ordre des boutons (drag-and-drop dans Apparence)
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT, toolOrder: [...DEFAULT_ORDER] }
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULT, ...parsed }
    // Migration : si toolOrder absent ou outils ajoutés/retirés, on normalise.
    const known = new Set(DEFAULT_ORDER)
    const existing = Array.isArray(merged.toolOrder) ? merged.toolOrder.filter(id => known.has(id)) : []
    merged.toolOrder = [...existing, ...DEFAULT_ORDER.filter(id => !existing.includes(id))]
    return merged
  } catch {
    return { ...DEFAULT, toolOrder: [...DEFAULT_ORDER] }
  }
}

export const toolbarSettingsStore = {
  settings: read(),
  listeners: [],
  get() { return this.settings },
  set(updates) {
    this.settings = { ...this.settings, ...updates }
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)) } catch {}
    this.listeners.forEach(fn => fn(this.settings))
  },
  toggleTool(id) {
    const hidden = this.settings.hiddenTools.includes(id)
      ? this.settings.hiddenTools.filter(t => t !== id)
      : [...this.settings.hiddenTools, id]
    this.set({ hiddenTools: hidden })
  },
  resetPosition() { this.set({ position: { x: null, y: null } }) },
  resetToolOrder() { this.set({ toolOrder: [...DEFAULT_ORDER] }) },
  moveTool(fromId, toId) {
    if (!fromId || fromId === toId) return
    const order = [...this.settings.toolOrder]
    const fromIdx = order.indexOf(fromId)
    const toIdx = order.indexOf(toId)
    if (fromIdx < 0 || toIdx < 0) return
    order.splice(fromIdx, 1)
    order.splice(toIdx, 0, fromId)
    this.set({ toolOrder: order })
  },
  subscribe(fn) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  },
}
