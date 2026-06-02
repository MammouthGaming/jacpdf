// JacPaintToolIcons.jsx — icônes des outils Phase 2.

export function IconEyedropper() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 7l6 6" />
      <path d="M5 19l8.5-8.5" />
      <path d="M16 2l6 6" />
      <path d="M19 5l-3.5 3.5a2 2 0 0 1 0 2.8L15 12l-3-3 .7-.5a2 2 0 0 1 2.8 0z" />
      <path d="M2 22l3-3" />
    </svg>
  )
}

export function IconText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  )
}

export function IconMirror() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 3" />
      <path d="M4 6l6 6-6 6z" />
      <path d="M20 6l-6 6 6 6z" />
    </svg>
  )
}

export function IconStabilizer() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18c3 0 3-12 6-12s3 12 6 12 3-12 6-12" />
    </svg>
  )
}

// ── Phase 4 — sélections avancées ─────────────────────────────────

export function IconSelectLasso() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 14c0-4 3-7 7-7s7 3 7 6c0 3-2 5-5 5c-2 0-3-1-3-2c0-1 1-2 2-2" strokeDasharray="2 2" />
      <path d="M9 18l-2 4 4-1" />
    </svg>
  )
}

export function IconSelectPolygon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 19 8 17 19 6 18 3 10" strokeDasharray="2 2" />
      <circle cx="5" cy="4" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="17" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="3" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconSelectWand() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3l-1 3 3-1-1 3 3-1-1 3" />
      <line x1="14" y1="9" x2="4" y2="20" />
      <line x1="4" y1="20" x2="6" y2="22" />
    </svg>
  )
}

export function IconInvertSelection() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="2 2" />
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" opacity="0.6" />
    </svg>
  )
}

export function IconFeather() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  )
}

export function IconRotate() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}