import { useCallback, useEffect, useState } from 'react'

// Préférences de notification par document, façon Google Docs.
// - commentsScope: 'all' | 'mentions' | 'none'
// - editsScope:    'added_removed' | 'none'
// Stockées séparément dans localStorage pour qu'on puisse les changer
// indépendamment sans relire / réécrire un blob JSON.
const COMMENT_SCOPES = new Set(['all', 'mentions', 'none'])
const EDIT_SCOPES = new Set(['added_removed', 'none'])

export function useNotifPrefs(docId) {
  const [commentsScope, setCommentsScope] = useState('all')
  const [editsScope, setEditsScope] = useState('none')

  useEffect(() => {
    if (typeof localStorage === 'undefined' || !docId) return
    try {
      const c = localStorage.getItem('jacdoc:notifComments:' + docId)
      const e = localStorage.getItem('jacdoc:notifEdits:' + docId)
      if (COMMENT_SCOPES.has(c)) setCommentsScope(c)
      if (EDIT_SCOPES.has(e)) setEditsScope(e)
    } catch (_) {}
  }, [docId])

  const persistCommentsScope = useCallback((next) => {
    if (!COMMENT_SCOPES.has(next)) return
    setCommentsScope(next)
    if (typeof localStorage !== 'undefined' && docId) {
      try { localStorage.setItem('jacdoc:notifComments:' + docId, next) } catch (_) {}
    }
  }, [docId])

  const persistEditsScope = useCallback((next) => {
    if (!EDIT_SCOPES.has(next)) return
    setEditsScope(next)
    if (typeof localStorage !== 'undefined' && docId) {
      try { localStorage.setItem('jacdoc:notifEdits:' + docId, next) } catch (_) {}
    }
  }, [docId])

  return {
    commentsScope,
    editsScope,
    setCommentsScope: persistCommentsScope,
    setEditsScope: persistEditsScope,
  }
}