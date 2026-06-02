import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_HF_TEXTS,
  DEFAULT_HF_OPTIONS,
  normalizeHfTexts,
  readJsonValue,
  renderHF,
} from '../editorHelpers'

// En-tête / pied de page Word-like : 4 variantes (all, first, odd, even) +
// options de configuration (différent 1ère page, différent pair/impair).
// Stocké sous `jacdoc:headers:<docId>` et `jacdoc:footers:<docId>` (JSON).
// Migration auto depuis les anciennes clés `jacdoc:header:` / `jacdoc:footer:`
// qui contenaient une simple chaîne (= variante "all").
export function useHeaderFooterTexts(docId, documentTitle) {
  const [headerTexts, setHeaderTexts] = useState(DEFAULT_HF_TEXTS)
  const [footerTexts, setFooterTexts] = useState(DEFAULT_HF_TEXTS)
  const [hfOptions, setHfOptions] = useState(DEFAULT_HF_OPTIONS)

  useEffect(() => {
    if (typeof localStorage === 'undefined' || !docId) return
    try {
      const oldHeader = localStorage.getItem('jacdoc:header:' + docId) || ''
      const oldFooter = localStorage.getItem('jacdoc:footer:' + docId) || ''
      const storedHeaders = readJsonValue(localStorage.getItem('jacdoc:headers:' + docId), null)
      const storedFooters = readJsonValue(localStorage.getItem('jacdoc:footers:' + docId), null)
      const storedOptions = readJsonValue(localStorage.getItem('jacdoc:hfOptions:' + docId), null)
      setHeaderTexts(normalizeHfTexts(storedHeaders, oldHeader))
      setFooterTexts(normalizeHfTexts(storedFooters, oldFooter))
      if (storedOptions && typeof storedOptions === 'object') {
        setHfOptions({ ...DEFAULT_HF_OPTIONS, ...storedOptions })
      }
    } catch (_) {}
  }, [docId])

  // Détermine quelle variante d'en-tête / pied utiliser pour la page
  // numéro `pageNum`, en fonction des options actives.
  const getHfVariant = useCallback((pageNum) => {
    if (hfOptions.differentFirstPage && pageNum === 1) return 'first'
    if (hfOptions.differentOddEven) return pageNum % 2 === 0 ? 'even' : 'odd'
    return 'all'
  }, [hfOptions.differentFirstPage, hfOptions.differentOddEven])

  const persist = useCallback((kind, value) => {
    if (typeof localStorage === 'undefined' || !docId) return
    try { localStorage.setItem('jacdoc:' + kind + ':' + docId, JSON.stringify(value)) } catch (_) {}
  }, [docId])

  const updateHeaderVariant = useCallback((variant, value) => {
    setHeaderTexts((prev) => {
      const next = { ...DEFAULT_HF_TEXTS, ...prev, [variant]: value }
      persist('headers', next)
      return next
    })
  }, [persist])

  const updateFooterVariant = useCallback((variant, value) => {
    setFooterTexts((prev) => {
      const next = { ...DEFAULT_HF_TEXTS, ...prev, [variant]: value }
      persist('footers', next)
      return next
    })
  }, [persist])

  const updateHfOptions = useCallback((patch) => {
    setHfOptions((prev) => {
      const next = { ...prev, ...patch }
      persist('hfOptions', next)
      return next
    })
  }, [persist])

  // Helpers prêt-à-rendre : retournent le texte final (tokens résolus)
  // pour la page demandée. Le composant n'a qu'à brancher ça au JSX.
  const renderHeaderFor = useCallback(
    (pageNum, totalPages) => renderHF(headerTexts[getHfVariant(pageNum)], pageNum, totalPages, documentTitle),
    [headerTexts, getHfVariant, documentTitle],
  )
  const renderFooterFor = useCallback(
    (pageNum, totalPages) => renderHF(footerTexts[getHfVariant(pageNum)], pageNum, totalPages, documentTitle),
    [footerTexts, getHfVariant, documentTitle],
  )

  return useMemo(() => ({
    headerTexts,
    footerTexts,
    hfOptions,
    getHfVariant,
    updateHeaderVariant,
    updateFooterVariant,
    updateHfOptions,
    renderHeaderFor,
    renderFooterFor,
  }), [
    headerTexts, footerTexts, hfOptions,
    getHfVariant, updateHeaderVariant, updateFooterVariant, updateHfOptions,
    renderHeaderFor, renderFooterFor,
  ])
}