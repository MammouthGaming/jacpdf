// useKeyboardShortcuts.js — registre central des raccourcis clavier.
//
// Pourquoi un hook dédié ? L'undo/redo, le zoom, le changement
// d'outil, la sélection, l'opacité… tous écoutent `keydown` sur
// `window`. Avoir N effets séparés au fil du fichier `JacPaintInstance`
// devient ingérable (et déclenche des bugs : l'ordre d'écoute compte,
// preventDefault doit être centralisé, etc.).
//
// Ce hook prend une **liste de raccourcis** déclaratifs et installe
// un seul listener global. Chaque raccourci a la forme :
//
//   {
//     keys: 'b' | ['1','2','3'] | { key: 'z', meta: true, shift: true }
//     handler: (e) => void
//     when?: () => boolean   // garde optionnelle (default : actif si onglet actif)
//     preventDefault?: boolean (default true)
//   }
//
// `keys` peut être :
//   • une string : la touche minuscule, sans modificateur (ex. 'b', 'i')
//   • un tableau de strings : plusieurs touches qui déclenchent le même handler
//   • un objet { key, meta?, ctrl?, shift?, alt? } : raccourci avec modificateurs
//
// Convention : `meta: true` = Cmd sur macOS, Ctrl sur Windows/Linux
// (on accepte `e.metaKey || e.ctrlKey` indifféremment, comme l'undo
// existant). Si tu veux distinguer strictement Cmd vs Ctrl, utilise
// `metaOnly` ou `ctrlOnly`.
//
// Le hook respecte la même politique d'inhibition que l'undo/redo :
//   • Désactivé si `isActive` (paramètre global) est faux.
//   • Désactivé si le focus est dans un INPUT / TEXTAREA / contenteditable.
//   • Désactivé si la propre garde `when()` du raccourci retourne false.

import { useEffect } from 'react'

// Normalise un descripteur de raccourci en tableau d'objets canoniques.
function normalize(keys) {
  const wrap = (key) => {
    if (typeof key === 'string') return { key: key.toLowerCase() }
    return {
      key: (key.key || '').toLowerCase(),
      meta: !!key.meta,
      metaOnly: !!key.metaOnly,
      ctrlOnly: !!key.ctrlOnly,
      shift: !!key.shift,
      alt: !!key.alt,
    }
  }
  if (Array.isArray(keys)) return keys.map(wrap)
  return [wrap(keys)]
}

// Teste si un événement clavier matche un descripteur normalisé.
function matches(e, desc) {
  if ((e.key || '').toLowerCase() !== desc.key) return false
  const metaOrCtrl = e.metaKey || e.ctrlKey
  if (desc.metaOnly) {
    if (!e.metaKey) return false
  } else if (desc.ctrlOnly) {
    if (!e.ctrlKey) return false
  } else if (desc.meta) {
    if (!metaOrCtrl) return false
  } else {
    if (metaOrCtrl) return false
  }
  if (!!desc.shift !== e.shiftKey) return false
  if (!!desc.alt !== e.altKey) return false
  return true
}

// Détecte un champ texte (input, textarea, contenteditable) — on ne
// veut pas que B / E / I / etc. changent d'outil pendant le renommage
// d'une toile, ni que ⌘Z annule plusieurs toiles à la fois.
function isTextTarget(target) {
  if (!target) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(shortcuts, { isActive = true } = {}) {
  useEffect(() => {
    if (!isActive) return
    // Pré-normalise les descripteurs une seule fois pour éviter de le
    // refaire à chaque keydown.
    const compiled = (shortcuts || [])
      .filter((s) => s && typeof s.handler === 'function' && s.keys)
      .map((s) => ({
        descs: normalize(s.keys),
        handler: s.handler,
        when: s.when,
        preventDefault: s.preventDefault !== false,
      }))
    if (compiled.length === 0) return
    const onKey = (e) => {
      if (isTextTarget(e.target)) return
      for (const s of compiled) {
        if (!s.descs.some((d) => matches(e, d))) continue
        if (s.when && !s.when()) continue
        if (s.preventDefault) e.preventDefault()
        s.handler(e)
        return // un seul handler par event (pas de fall-through)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, isActive])
}

// ── Helpers de descripteurs ──────────────────────────────────────
// Sucre syntaxique pour rendre la liste plus lisible côté appelant.
//
//   key('b', () => setActiveBrush('pencil'))
//   mod('z', undo, { shift: false })
//   mod('z', redo, { shift: true })
//   mod('=', zoomIn) // = / + sont la même touche US

export const key = (k, handler, opts) => ({
  keys: opts ? { key: k, ...opts } : k,
  handler,
})

export const mod = (k, handler, opts = {}) => ({
  keys: { key: k, meta: true, shift: !!opts.shift, alt: !!opts.alt },
  handler,
  preventDefault: opts.preventDefault !== false,
})