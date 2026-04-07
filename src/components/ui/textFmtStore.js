// Store partagé entre Toolbar et TextBox — sans Redux ni Context
export const textFmtStore = {
  fmt: {
    font: 'Inter',
    size: 14,
    lineHeight: 1.5,
    color: '#111111',
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
  },
  listeners: [],
  get() { return this.fmt },
  set(updates) {
    this.fmt = { ...this.fmt, ...updates }
    this.listeners.forEach(fn => fn(this.fmt))
  },
  subscribe(fn) {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }
}
