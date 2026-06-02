import { useState, useEffect, useRef } from 'react'

// ── Recherche de texte dans le PDF ──
// Quatre sources de texte par page, TOUTES concaténées (pas en fallback) :
//   1. Couche texte native (pdf.js getTextContent).
//   2. Annotations Widget / FreeText / Stamp / Ink / Highlight notes —
//      les valeurs tapées dans des champs de formulaire ne sont PAS dans
//      la couche texte native.
//   3. OCR (si l'utilisateur a lancé Outils > OCR) — TOUJOURS ajouté, pas
//      en fallback : une page peut avoir une couche texte partielle.
//   4. TextBoxes utilisateur.
//
// Regex tolérant aux espaces (\s* entre chaque caractère de la requête)
// — pdf.js découpe parfois un mot en plusieurs items, donc "Jacob" peut
// devenir "J a c o b" dans le haystack.
//
// Debouncé à 200ms.
//
// ⚠️ NE PAS mettre `visiblePages` dans les deps : c'est un nouveau tableau
// à chaque render → boucle infinie. On dépend des inputs primitifs
// (pageOrder, deletedPages, numPages) qui le génèrent.
export function usePdfSearch({ pdf, ocrText, textBoxes, visiblePages, pageOrder, deletedPages, numPages, goToPage }) {
  // Lot 7 — cache du texte natif de chaque page. La 1re recherche d'un PDF
  // appelle getTextContent() pour chaque page (coûteux : ~50ms/page sur un
  // gros PDF) ; les recherches suivantes du MÊME pdf réutilisent le cache.
  // Réinitialisé quand pdf change (chargement d'un autre fichier).
  const nativeTextCacheRef = useRef({ pdf: null, byPage: new Map() })
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [currentResultIdx, setCurrentResultIdx] = useState(0)
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (!showSearch) return
    if (!pdf || !searchQuery.trim()) {
      setSearchResults(prev => (prev.length === 0 ? prev : []))
      setCurrentResultIdx(prev => (prev === 0 ? prev : 0))
      return
    }
    let cancelled = false
    const handle = setTimeout(async () => {
      const escapedChars = searchQuery
        .split('')
        .map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const pattern = escapedChars.join('\\s*')
      let re
      try { re = new RegExp(pattern, 'gi') } catch { return }
      // Lot 7 — invalide le cache si le pdf a changé (autre fichier).
      const cache = nativeTextCacheRef.current
      if (cache.pdf !== pdf) { cache.pdf = pdf; cache.byPage = new Map() }
      const out = []
      for (let p = 1; p <= pdf.numPages; p++) {
        if (cancelled) return
        const sources = []
        try {
          const page = await pdf.getPage(p)
          try {
            // Cache hit ? On évite getTextContent() (le plus coûteux du loop).
            let native = cache.byPage.get(p)
            if (native === undefined) {
              const tc = await page.getTextContent()
              native = tc.items.map(it => it.str || '').join(' ')
              cache.byPage.set(p, native)
            }
            if (native.trim()) sources.push(native)
          } catch {}
          try {
            const annots = await page.getAnnotations()
            const annotText = (annots || [])
              .map(a => {
                const parts = []
                if (a.subtype === 'Widget') {
                  const v = a.fieldValue ?? a.buttonValue
                  if (v != null) parts.push(Array.isArray(v) ? v.join(' ') : String(v))
                }
                if (a.contents) parts.push(String(a.contents))
                if (a.contentsObj?.str) parts.push(String(a.contentsObj.str))
                if (a.richText?.str) parts.push(String(a.richText.str))
                if (a.titleObj?.str) parts.push(String(a.titleObj.str))
                return parts.join(' ')
              })
              .filter(t => t.trim())
              .join(' ')
            if (annotText) sources.push(annotText)
          } catch {}
        } catch {}
        if (ocrText[p] && ocrText[p].trim()) sources.push(ocrText[p])
        const boxesText = textBoxes
          .filter(b => visiblePages[b.pageIndex || 0] === p)
          .map(b => b.text || '')
          .filter(t => t.trim())
          .join(' ')
        if (boxesText) sources.push(boxesText)
        const text = sources.join(' ')
        if (!text) continue
        re.lastIndex = 0
        let m
        while ((m = re.exec(text)) !== null) {
          const idx = m.index
          const matchLen = m[0].length
          const s = Math.max(0, idx - 30)
          const e = Math.min(text.length, idx + matchLen + 30)
          out.push({
            pageNum: p,
            snippet: (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : ''),
          })
          if (matchLen === 0) re.lastIndex++
        }
      }
      if (!cancelled) {
        setSearchResults(out)
        setCurrentResultIdx(0)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(handle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, pdf, showSearch, ocrText, textBoxes, pageOrder, deletedPages, numPages])

  // Saute à la page du résultat courant chaque fois que l'index change.
  useEffect(() => {
    if (!showSearch) return
    const r = searchResults[currentResultIdx]
    if (r) goToPage(r.pageNum)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentResultIdx, searchResults])

  // Auto-focus de l'input à l'ouverture du panneau.
  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus()
  }, [showSearch])

  const closeSearch = () => {
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
    setCurrentResultIdx(0)
  }

  return {
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults,
    currentResultIdx, setCurrentResultIdx,
    searchInputRef,
    closeSearch,
  }
}