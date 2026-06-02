import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { jacdocStore } from '../stores/jacdocStore'
import './JacDocHistoryView.css'

// Vue d'historique des versions style Google Docs. Affichée plein-cadre
// à la place de l'éditeur JacDoc quand l'utilisateur clique sur l'icône
// « Historique » de la topbar.
//
// Layout reproduit fidèlement Google Docs :
//   ┌────────────────────────────────────────────────────────────────┐
//   │ ←  Aujourd'hui, 17 h 30          [Restaurer cette version]    │
//   ├────────────────────────────────────────────────────────────────┤
//   │ 🖨  100%  Ff      Total : N modifications      ↑   ↓           │
//   ├──────────────────────────────────────────────────┬─────────────┤
//   │                                                  │ Historique  │
//   │      ┌───────────────────────────┐               │ des versions│
//   │      │  Aperçu lecture seule     │               │ [Toutes ▾]  │
//   │      │  de la version            │               │             │
//   │      │  sélectionnée             │               │ Aujourd'hui │
//   │      │                           │               │  19 h 43 *  │
//   │      └───────────────────────────┘               │  19 h 00    │
//   │                                                  │  17 h 30    │
//   │                                                  │ Lundi       │
//   │                                                  │  21 h 14    │
//   │                                                  ├─────────────┤
//   │                                                  │ ☑ Mettre en │
//   │                                                  │   évidence  │
//   └──────────────────────────────────────────────────┴─────────────┘

const WEEKDAYS_FR = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi',
]
const MONTHS_FR_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function fmtTime(d) { return pad2(d.getHours()) + ' h ' + pad2(d.getMinutes()) }
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
function dayHeading(d, today) {
  if (isSameDay(d, today)) return "Aujourd'hui"
  const yesterday = new Date(today.getTime() - 86400000)
  if (isSameDay(d, yesterday)) return 'Hier'
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const tStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diffDays = Math.floor((tStart - dStart) / 86400000)
  if (diffDays > 0 && diffDays < 7) return WEEKDAYS_FR[d.getDay()]
  return d.getDate() + ' ' + MONTHS_FR_SHORT[d.getMonth()] + ' ' + d.getFullYear()
}
function fmtItemTime(d) {
  return d.getDate() + ' ' + MONTHS_FR_SHORT[d.getMonth()].replace(/\.$/, '') + ', ' + fmtTime(d)
}
function getDisplayName(u) {
  return (
    u?.user_metadata?.full_name ||
    u?.user_metadata?.name ||
    u?.user_metadata?.user_name ||
    u?.email?.split('@')[0] ||
    'Utilisateur'
  )
}

export default function JacDocHistoryView({
  docId,
  currentDoc,
  currentTitle,
  currentUser,
  onClose,
  onRestore,
}) {
  const [versions, setVersions] = useState([])
  const [selectedId, setSelectedId] = useState('current')
  const [highlightChanges, setHighlightChanges] = useState(true)
  // Zoom figé à 100 % pour la Phase 1 — Google Docs propose le réglage
  // mais on garde l'affichage statique tant qu'on n'a pas la logique de
  // zoom dans la preview Tiptap read-only.
  const [zoom] = useState(100)

  // Chargement des snapshots du doc au mount.
  useEffect(() => {
    let cancelled = false
    if (!docId) return
    jacdocStore.versions
      .list(docId)
      .then((list) => { if (!cancelled) setVersions(list || []) })
      .catch(() => { if (!cancelled) setVersions([]) })
    return () => { cancelled = true }
  }, [docId])

  // « Version actuelle » : doc en mémoire + métadonnées utilisateur.
  // Toujours en tête de la liste, comme Google Docs.
  const currentMeta = useMemo(
    () => ({
      id: 'current',
      docId,
      doc: currentDoc,
      title: currentTitle || '',
      createdAt: new Date().toISOString(),
      userName: getDisplayName(currentUser),
      avatarUrl: currentUser?.user_metadata?.avatar_url || null,
    }),
    [docId, currentDoc, currentTitle, currentUser],
  )

  const displayed = useMemo(
    () => [currentMeta, ...versions],
    [currentMeta, versions],
  )
  const selected = displayed.find((v) => v.id === selectedId) || currentMeta
  const selectedDate = new Date(selected.createdAt)
  const today = new Date()
  const isCurrentSelected = selected.id === 'current'

  // Groupement par jour relatif (Aujourd'hui / Hier / nom du jour / date).
  const groups = useMemo(() => {
    const t = new Date()
    const out = []
    let lastKey = null
    let cur = null
    for (const v of displayed) {
      const key = dayHeading(new Date(v.createdAt), t)
      if (key !== lastKey) {
        cur = { key, items: [] }
        out.push(cur)
        lastKey = key
      }
      cur.items.push(v)
    }
    return out
  }, [displayed])

  // Éditeur Tiptap read-only pour la preview de la version sélectionnée.
  // Set d'extensions volontairement réduit (pas de pagination, pas de
  // breaks visuels, pas de fontSize custom) : on n'édite pas, on lit.
  const previewEditor = useEditor({
    editable: false,
    content: selected.doc || { type: 'doc', content: [{ type: 'paragraph' }] },
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      FontFamily.configure({ types: ['textStyle'] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: false, allowBase64: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
  })

  // Remplace le contenu de la preview à chaque changement de sélection.
  useEffect(() => {
    if (!previewEditor || previewEditor.isDestroyed) return
    try {
      previewEditor.commands.setContent(
        selected.doc || { type: 'doc', content: [{ type: 'paragraph' }] },
        { emitUpdate: false },
      )
    } catch (_) { /* défensif */ }
  }, [previewEditor, selected])

  const modificationsCount = Math.max(1, versions.length)

  return (
    <div className="jacdoc-history-root" data-doc-id={docId}>
      <header className="jacdoc-history-topbar">
        <button
          type="button"
          className="jacdoc-history-back"
          onClick={onClose}
          title="Retour à l'éditeur"
          aria-label="Retour à l'éditeur"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="jacdoc-history-version-label">
          {dayHeading(selectedDate, today)}, {fmtTime(selectedDate)}
        </div>
        <button
          type="button"
          className="jacdoc-history-restore-btn"
          onClick={() => {
            if (isCurrentSelected) { onClose(); return }
            if (typeof onRestore === 'function') onRestore(selected)
          }}
          disabled={isCurrentSelected}
          title={
            isCurrentSelected
              ? 'Vous êtes déjà sur la version actuelle'
              : 'Restaurer cette version comme version actuelle'
          }
        >
          Restaurer cette version
        </button>
      </header>

      <div className="jacdoc-history-toolbar">
        <button
          type="button"
          className="jacdoc-history-tb-btn"
          title="Imprimer"
          aria-label="Imprimer"
          onClick={() => { if (typeof window !== 'undefined') window.print() }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
        <div className="jacdoc-history-tb-zoom">{zoom}%</div>
        <div className="jacdoc-history-tb-sep" />
        <div className="jacdoc-history-tb-font" aria-hidden="true">F<sub>F</sub></div>
        <div className="jacdoc-history-tb-spacer" />
        <div className="jacdoc-history-tb-mods">
          Total : {modificationsCount}{' '}
          {modificationsCount === 1 ? 'modification' : 'modifications'}
        </div>
        <button
          type="button"
          className="jacdoc-history-tb-btn"
          title="Modification précédente"
          aria-label="Modification précédente"
          disabled
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
        <button
          type="button"
          className="jacdoc-history-tb-btn"
          title="Modification suivante"
          aria-label="Modification suivante"
          disabled
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      <div className="jacdoc-history-body">
        <div className="jacdoc-history-preview-wrap">
          <div className="jacdoc-history-page">
            <EditorContent editor={previewEditor} className="jacdoc-history-content" />
          </div>
        </div>

        <aside className="jacdoc-history-sidebar" aria-label="Historique des versions">
          <header className="jacdoc-history-sidebar-header">
            <h2 className="jacdoc-history-sidebar-title">Historique des versions</h2>
            <button type="button" className="jacdoc-history-filter-btn" disabled>
              <span>Toutes les versions</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </header>
          <div className="jacdoc-history-sidebar-scroll">
            {groups.map((g) => (
              <section key={g.key} className="jacdoc-history-group">
                <h3 className="jacdoc-history-group-heading">{g.key}</h3>
                <ul className="jacdoc-history-list">
                  {g.items.map((v) => {
                    const d = new Date(v.createdAt)
                    const isSel = v.id === selectedId
                    const isCur = v.id === 'current'
                    const initial = (v.userName || 'U').charAt(0).toUpperCase()
                    return (
                      <li
                        key={v.id}
                        className={'jacdoc-history-item' + (isSel ? ' is-selected' : '')}
                        onClick={() => setSelectedId(v.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedId(v.id)
                          }
                        }}
                      >
                        <div className="jacdoc-history-item-time">{fmtItemTime(d)}</div>
                        {isCur && (
                          <div className="jacdoc-history-item-sub">Version actuelle</div>
                        )}
                        <div className="jacdoc-history-item-author">
                          {v.avatarUrl ? (
                            <img
                              className="jacdoc-history-item-avatar"
                              src={v.avatarUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                          ) : (
                            <span className="jacdoc-history-item-avatar jacdoc-history-item-avatar-initial">
                              {initial}
                            </span>
                          )}
                          <span className="jacdoc-history-item-name">
                            {v.userName || 'Utilisateur'}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
            {versions.length === 0 && (
              <div className="jacdoc-history-empty">
                Aucune version sauvegardée précédente.
                <br />
                Les versions sont créées automatiquement à chaque sauvegarde.
              </div>
            )}
          </div>
          <footer className="jacdoc-history-sidebar-footer">
            <label className="jacdoc-history-checkbox">
              <input
                type="checkbox"
                checked={highlightChanges}
                onChange={(e) => setHighlightChanges(e.target.checked)}
              />
              <span>Mettre en évidence les changements</span>
            </label>
          </footer>
        </aside>
      </div>
    </div>
  )
}