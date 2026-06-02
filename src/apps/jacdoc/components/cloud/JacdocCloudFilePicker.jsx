import { useEffect, useMemo, useRef, useState } from 'react'
import { useJacdocCloud } from '@/apps/jacdoc/hooks/cloud/useJacdocCloud'
import { useJacpdfCloud } from '@/apps/jacpdf/hooks/cloud/useJacpdfCloud'
import '@/apps/jacpdf/components/cloud/DriveFilePicker.css'
import '@/apps/jacpdf/components/cloud/JacpdfCloudFilePicker.css'
import './JacdocCloudFilePicker.css'

/**
 * Picker JacDoc Cloud — visuellement aligné sur JacpdfCloudFilePicker.
 *
 * Réutilise exactement les classes JacPDF (.dfp-* / .jpc-*) pour avoir
 * EXACTEMENT le même rendu : overlay, modal, header, toolbar
 * (search + Nouveau dossier + Trier + Ajouter), breadcrumb, list,
 * items, prompt modals.
 *
 * Les seules différences fonctionnelles :
 * - pas de quota / footer (JacDoc n'a pas de limite de stockage par doc) ;
 * - filtre de vue "Mes docs / Partagés / Récents" en petit segmented
 *   au-dessus de la toolbar ;
 * - "+ Ajouter" → ouvre un nouveau document JacDoc Cloud directement.
 */
function formatRelative(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!t) return ''
  const diff = Math.max(0, Date.now() - t)
  const mn = Math.floor(diff / 60000)
  if (mn < 1) return "à l'instant"
  if (mn < 60) return `il y a ${mn} min`
  const h = Math.floor(mn / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Affichage des tailles (footer stockage) — même logique que JacPDF.
function formatBytes(b, sys = 'fr') {
  const isFr = sys !== 'en'
  if (b < 1024) return `${b} ${isFr ? 'o' : 'B'}`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} ${isFr ? 'Ko' : 'KB'}`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} ${isFr ? 'Mo' : 'MB'}`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} ${isFr ? 'Go' : 'GB'}`
}

// ─── Mode de tri (bouton « Trier », repris de JacPDF) ───
const SORT_KEY = 'jacdoc_cloud_sort_mode_v1'
const VALID_SORT_MODES = ['recent', 'oldest', 'name_asc', 'name_desc']
const SORT_LABELS = {
  recent:    'Plus récent',
  oldest:    'Plus ancien',
  name_asc:  'Nom (A → Z)',
  name_desc: 'Nom (Z → A)',
}

function readSortMode() {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return VALID_SORT_MODES.includes(v) ? v : 'recent'
  } catch { return 'recent' }
}

function writeSortMode(mode) {
  try { localStorage.setItem(SORT_KEY, mode) } catch {}
}

function docTime(d) {
  return new Date(d.lastOpenedAt || d.updatedAt || 0).getTime()
}

function applySort(arr, mode) {
  if (!arr || arr.length === 0) return arr
  const out = [...arr]
  switch (mode) {
    case 'recent':    return out.sort((a, b) => docTime(b) - docTime(a))
    case 'oldest':    return out.sort((a, b) => docTime(a) - docTime(b))
    case 'name_asc':  return out.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'fr'))
    case 'name_desc': return out.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'fr'))
    default: return out
  }
}

const ROLE_LABELS = {
  owner: 'Propriétaire',
  editor: 'Édition',
  commenter: 'Commentaire',
  viewer: 'Lecture',
}

const VIEW_LABELS = {
  mine: 'Mes docs',
  shared: 'Partagés',
  recent: 'Récents',
}

export default function JacdocCloudFilePicker({
  open,
  onClose,
  onSelect,
  brandName = 'JacSuite Cloud',
}) {
  const {
    connected,
    loading,
    listDocs,
    openDoc,
    createDoc,
    removeDoc,
    renameDoc,
    moveDoc,
    listFolders,
    createFolder,
    renameFolder,
    removeFolder,
    moveFolder,
  } = useJacdocCloud()

  // Stockage utilisé : on réutilise l'usage suite-wide de JacPDF Cloud
  // (même quota JacSuite Cloud central, sources à blob).
  const { usage, quotaUsedRatio } = useJacpdfCloud()

  const [docs, setDocs] = useState(null)
  const [sortMode, setSortMode] = useState(() => readSortMode())
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [folders, setFolders] = useState([])
  const [viewMode, setViewMode] = useState('mine') // 'mine' | 'shared' | 'recent'
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [openingId, setOpeningId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [createFolderPrompt, setCreateFolderPrompt] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [renamePrompt, setRenamePrompt] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef(null)
  const sortMenuRef = useRef(null)

  const reload = async () => {
    if (!connected) return
    setBusy(true)
    setError(null)
    try {
      const loadFolders = viewMode === 'mine'
        ? listFolders({ parentId: currentFolderId })
        : Promise.resolve([])
      const loadDocs = viewMode === 'mine'
        ? listDocs({ folderId: currentFolderId, scope: 'mine' })
        : listDocs({ sort: 'recent', scope: viewMode === 'shared' ? 'shared' : 'all' })

      const [nextFolders, nextDocs] = await Promise.all([loadFolders, loadDocs])
      setFolders(nextFolders || [])
      setDocs(nextDocs || [])
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open || !connected) return
    let cancelled = false
    setBusy(true)
    setError(null)
    const loadFolders = viewMode === 'mine'
      ? listFolders({ parentId: currentFolderId })
      : Promise.resolve([])
    const loadDocs = viewMode === 'mine'
      ? listDocs({ folderId: currentFolderId, scope: 'mine' })
      : listDocs({ sort: 'recent', scope: viewMode === 'shared' ? 'shared' : 'all' })

    Promise.all([loadFolders, loadDocs]).then(([nextFolders, nextDocs]) => {
      if (cancelled) return
      setFolders(nextFolders || [])
      setDocs(nextDocs || [])
    }, (err) => {
      if (!cancelled) setError(err)
    }).finally(() => {
      if (!cancelled) setBusy(false)
    })
    return () => { cancelled = true }
  }, [open, connected, currentFolderId, viewMode, listDocs, listFolders])

  useEffect(() => {
    if (!open) {
      setDocs(null)
      setFolders([])
      setViewMode('mine')
      setCurrentFolderId(null)
      setBreadcrumb([])
      setSearch('')
      setBusy(false)
      setOpeningId(null)
      setError(null)
      setNotice(null)
      setCreateFolderPrompt(false)
      setFolderName('')
      setRenamePrompt(null)
      setSelectedKey(null)
      setAddMenuOpen(false)
      setSortMenuOpen(false)
    }
  }, [open])

  // Add menu : ferme sur click extérieur ou Escape (même pattern que JacPDF)
  useEffect(() => {
    if (!addMenuOpen) return
    const onDown = (e) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setAddMenuOpen(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setAddMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [addMenuOpen])

  // Sort menu : ferme sur click extérieur ou Escape (repris de JacPDF)
  useEffect(() => {
    if (!sortMenuOpen) return
    const onDown = (e) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) {
        setSortMenuOpen(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setSortMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortMenuOpen])

  const filteredFolders = useMemo(() => {
    if (viewMode !== 'mine') return []
    if (!search.trim()) return folders
    const q = search.trim().toLowerCase()
    return folders.filter((f) => (f.name || '').toLowerCase().includes(q))
  }, [folders, search, viewMode])

  const filteredDocs = useMemo(() => {
    let list = docs || []

    if (viewMode === 'shared') {
      list = list.filter((d) => d.isShared)
    } else if (viewMode === 'recent') {
      list = [...list]
        .sort((a, b) => new Date(b.lastOpenedAt || b.updatedAt || 0) - new Date(a.lastOpenedAt || a.updatedAt || 0))
        .slice(0, 30)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((d) => (d.title || '').toLowerCase().includes(q))
    }

    // Le tri choisi s'applique partout sauf en « Récents » (qui garde son
    // ordre par dernière ouverture).
    return viewMode === 'recent' ? list : applySort(list, sortMode)
  }, [docs, search, viewMode, sortMode])

  const switchViewMode = (nextMode) => {
    setViewMode(nextMode)
    setCurrentFolderId(null)
    setBreadcrumb([])
    setSearch('')
    setSelectedKey(null)
  }

  const enterFolder = (folder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
    setSelectedKey(null)
  }

  const navigateBreadcrumb = (index) => {
    if (index === -1) {
      setCurrentFolderId(null)
      setBreadcrumb([])
    } else {
      setCurrentFolderId(breadcrumb[index].id)
      setBreadcrumb((prev) => prev.slice(0, index + 1))
    }
    setSearch('')
    setSelectedKey(null)
  }

  const handleCreateFolder = async (e) => {
    e.preventDefault()
    const name = folderName.trim()
    if (!name) return
    try {
      const folder = await createFolder({ name, parentId: currentFolderId })
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      setCreateFolderPrompt(false)
      setFolderName('')
      setNotice(`✅ Dossier « ${folder.name} » créé.`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err)
    }
  }

  const handleCreateDoc = async () => {
    setAddMenuOpen(false)
    try {
      setBusy(true)
      const doc = await createDoc({
        title: 'Sans titre',
        folderId: currentFolderId,
        doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      })
      await reload()
      onSelect?.(doc)
      onClose?.()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const handleOpenDoc = async (doc) => {
    if (openingId) return
    setOpeningId(doc.id)
    setError(null)
    try {
      const full = await openDoc(doc.id)
      onSelect?.(full)
      onClose?.()
    } catch (err) {
      setError(err)
    } finally {
      setOpeningId(null)
    }
  }

  const submitRename = async (e) => {
    e.preventDefault()
    if (!renamePrompt) return
    const name = renamePrompt.value.trim()
    if (!name) return
    try {
      if (renamePrompt.kind === 'folder') {
        await renameFolder(renamePrompt.target.id, name)
        setBreadcrumb((prev) => prev.map((b) => (
          b.id === renamePrompt.target.id ? { ...b, name } : b
        )))
      } else {
        await renameDoc(renamePrompt.target.id, name)
      }
      setRenamePrompt(null)
      await reload()
    } catch (err) {
      setError(err)
    }
  }

  const handleDelete = async (kind, target) => {
    const label = kind === 'folder' ? 'ce dossier' : 'ce document'
    if (!confirm(`Supprimer ${label} ?`)) return

    try {
      if (kind === 'folder') {
        await removeFolder(target.id)
        if (currentFolderId === target.id || breadcrumb.some((b) => b.id === target.id)) {
          setCurrentFolderId(null)
          setBreadcrumb([])
        }
      } else {
        await removeDoc(target.id)
      }
      await reload()
    } catch (err) {
      setError(err)
    }
  }

  const handleMoveToRoot = async (kind, target) => {
    try {
      if (kind === 'folder') await moveFolder(target.id, null)
      else await moveDoc(target.id, null)
      await reload()
    } catch (err) {
      setError(err)
    }
  }

  if (!open) return null
  if (loading) return null

  if (!connected) {
    return (
      <div className="dfp-overlay" onClick={onClose}>
        <div className="dfp-modal" onClick={(e) => e.stopPropagation()}>
          <div className="dfp-header">
            <h2>{brandName}</h2>
            <button className="dfp-close" onClick={onClose}>✕</button>
          </div>
          <div className="dfp-empty">
            <p>Connecte-toi pour accéder à tes documents cloud.</p>
            <small style={ { color: '#6b7280', fontSize: 12 } }>
              JacDoc Cloud utilise la même connexion que JacPDF Cloud.
            </small>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dfp-overlay" onClick={onClose}>
      <div
        className="dfp-modal jpc-modal jdc-modal"
        onClick={(e) => {
          e.stopPropagation()
          if (!e.target.closest('.jpc-item')) setSelectedKey(null)
        }}
      >
        <div className="dfp-header">
          <h2 className="jpc-title">{brandName}</h2>
          <button className="dfp-close" onClick={onClose}>✕</button>
        </div>

        {/* Mini segmented "Mes docs / Partagés / Récents" — discret, juste sous le header. */}
        <div className="jdc-view-switch">
          {Object.entries(VIEW_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`jdc-view-chip${viewMode === mode ? ' is-active' : ''}`}
              onClick={() => switchViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="jpc-toolbar">
          <input
            type="text"
            className="jpc-search-input"
            placeholder="Rechercher un document…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="jpc-sort-wrap" ref={sortMenuRef}>
            <button
              type="button"
              className={`jpc-sort-btn${sortMenuOpen ? ' jpc-sort-btn-open' : ''}`}
              onClick={() => setSortMenuOpen((s) => !s)}
              title={`Trier les documents — ${SORT_LABELS[sortMode]}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M6 12h12M10 18h4" />
              </svg>
              <span>Trier</span>
            </button>
            {sortMenuOpen && (
              <div className="jpc-sort-menu">
                {VALID_SORT_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`jpc-sort-option${sortMode === mode ? ' jpc-sort-option-active' : ''}`}
                    onClick={() => {
                      setSortMode(mode)
                      writeSortMode(mode)
                      setSortMenuOpen(false)
                    }}
                  >
                    <span className="jpc-sort-option-check">{sortMode === mode ? '✓' : ''}</span>
                    <span>{SORT_LABELS[mode]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {viewMode === 'mine' && (
            <button
              type="button"
              className="jpc-new-folder-btn"
              onClick={() => setCreateFolderPrompt(true)}
              title="Créer un nouveau dossier"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              <span>Nouveau dossier</span>
            </button>
          )}
          {viewMode === 'mine' && (
            <div className="jpc-add-wrap" ref={addMenuRef}>
              <button
                type="button"
                className={`jpc-add-btn${addMenuOpen ? ' jpc-add-btn-open' : ''}`}
                onClick={() => setAddMenuOpen((s) => !s)}
                title="Créer un nouveau document JacDoc"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Ajouter</span>
              </button>
              {addMenuOpen && (
                <div className="jpc-add-menu">
                  <button type="button" className="jpc-add-option" onClick={handleCreateDoc}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    <span>Nouveau document JacDoc</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {viewMode === 'mine' && (
          <nav className="jpc-breadcrumb">
            <button
              type="button"
              className={`jpc-crumb${breadcrumb.length === 0 ? ' jpc-crumb-current' : ''}`}
              onClick={() => navigateBreadcrumb(-1)}
              disabled={breadcrumb.length === 0}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span>Racine</span>
            </button>
            {breadcrumb.map((b, i) => (
              <span key={b.id} className="jpc-crumb-wrap">
                <span className="jpc-crumb-sep">›</span>
                <button
                  type="button"
                  className={`jpc-crumb ${i === breadcrumb.length - 1 ? 'jpc-crumb-current' : ''}`}
                  onClick={() => navigateBreadcrumb(i)}
                  disabled={i === breadcrumb.length - 1}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        {notice && <div className="jpc-notice">{notice}</div>}
        {error && <div className="jpc-error">Erreur : {error.message}</div>}
        {busy && <div className="jpc-loading">Chargement de tes documents…</div>}

        {!busy && filteredFolders.length === 0 && filteredDocs.length === 0 && (
          <div className="jpc-empty-state">
            {search.trim()
              ? 'Aucun résultat pour cette recherche.'
              : viewMode === 'shared'
                ? 'Aucun document partagé avec toi pour le moment.'
                : viewMode === 'recent'
                  ? 'Aucun document récent pour le moment.'
                  : currentFolderId === null
                    ? <>Aucun document dans ton cloud pour le moment.<br />Crée ton premier JacDoc via « Ajouter », ou crée un dossier pour t'organiser.</>
                    : <>Ce dossier est vide.<br />Crée un sous-dossier ou un nouveau JacDoc ici.</>}
          </div>
        )}

        {!busy && (filteredFolders.length > 0 || filteredDocs.length > 0) && (
          <ul className="jpc-list">
            {filteredFolders.map((folder) => (
              <li
                key={`folder-${folder.id}`}
                data-jpc-key={`folder-${folder.id}`}
                className={`jpc-item jpc-folder-item${selectedKey === `folder-${folder.id}` ? ' jpc-item-selected' : ''}`}
                onClick={() => {
                  if (selectedKey === `folder-${folder.id}`) enterFolder(folder)
                  else setSelectedKey(`folder-${folder.id}`)
                }}
                onDoubleClick={() => enterFolder(folder)}
              >
                <div className="jpc-item-icon jpc-folder-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="jpc-item-meta">
                  <div className="jpc-item-name">{folder.name}</div>
                  <div className="jpc-item-info">Dossier</div>
                </div>
                <div className="jdc-row-actions" onClick={(e) => e.stopPropagation()}>
                  {currentFolderId && (
                    <button type="button" onClick={() => handleMoveToRoot('folder', folder)}>Racine</button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRenamePrompt({ kind: 'folder', target: folder, value: folder.name })}
                  >
                    Renommer
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete('folder', folder)}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
            {filteredDocs.map((doc) => (
              <li
                key={`doc-${doc.id}`}
                data-jpc-key={`doc-${doc.id}`}
                className={`jpc-item${openingId === doc.id ? ' jpc-item-loading' : ''}${selectedKey === `doc-${doc.id}` ? ' jpc-item-selected' : ''}`}
                onClick={() => {
                  if (selectedKey === `doc-${doc.id}`) handleOpenDoc(doc)
                  else setSelectedKey(`doc-${doc.id}`)
                }}
                onDoubleClick={() => handleOpenDoc(doc)}
                title={doc.isShared
                  ? 'Document partagé avec toi'
                  : 'Cliquer pour ouvrir le document'}
              >
                <div className="jpc-item-icon" title={doc.isShared ? 'Partagé avec toi' : undefined}>
                  {doc.isShared ? '👥' : '📝'}
                </div>
                <div className="jpc-item-meta">
                  <div className="jpc-item-name">
                    {doc.title || 'Sans titre'}
                    {doc.isShared && (
                      <span
                        style={ { marginLeft: 8, padding: '2px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', borderRadius: 4, background: 'rgba(57, 255, 20, 0.12)', color: '#39FF14', border: '1px solid rgba(57, 255, 20, 0.45)', verticalAlign: 'middle', textTransform: 'uppercase' } }
                      >
                        Partagé
                      </span>
                    )}
                  </div>
                  <div className="jpc-item-info">
                    {viewMode === 'recent' ? 'Récent' : doc.isShared ? 'Partagé avec toi' : 'JacDoc Cloud'}
                    {' · '}
                    {formatRelative(doc.lastOpenedAt || doc.updatedAt)}
                    {doc.shareRole && doc.shareRole !== 'owner' && (
                      <span style={ { marginLeft: 6, opacity: 0.85 } }>· {ROLE_LABELS[doc.shareRole] || doc.shareRole}</span>
                    )}
                  </div>
                </div>
                {!doc.isShared && (
                  <div className="jdc-row-actions" onClick={(e) => e.stopPropagation()}>
                    {currentFolderId && (
                      <button type="button" onClick={() => handleMoveToRoot('doc', doc)}>Racine</button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRenamePrompt({ kind: 'doc', target: doc, value: doc.title })}
                    >
                      Renommer
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete('doc', doc)}>
                      Supprimer
                    </button>
                  </div>
                )}
                {openingId === doc.id && (
                  <div className="jpc-item-spinner">…</div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ── Footer : stockage utilisé (même quota suite-wide que JacPDF) ── */}
        <div className="jpc-footer">
          <div className="jpc-footer-row">
            <span className="jpc-footer-label">Stockage utilisé</span>
            <span className="jpc-footer-usage">
              {formatBytes(usage.totalBytes, 'fr')} / {formatBytes(1024 ** 3, 'fr')}
              {quotaUsedRatio >= 0.8 && <span className="jpc-quota-warn"> ⚠</span>}
            </span>
          </div>
          <div className="jpc-quota-bar">
            <div
              className={`jpc-quota-bar-fill ${quotaUsedRatio >= 0.8 ? 'warn' : quotaUsedRatio >= 0.5 ? 'mid' : 'ok'}`}
              style={{ width: `${Math.min(100, Math.round(quotaUsedRatio * 100))}%` }}
            />
          </div>
        </div>

        {createFolderPrompt && (
          <div
            className="jpc-prompt-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateFolderPrompt(false) }}
          >
            <form
              className="jpc-prompt-modal"
              onMouseDown={(e) => e.stopPropagation()}
              onSubmit={handleCreateFolder}
            >
              <h3 className="jpc-prompt-title">Nouveau dossier</h3>
              <input
                type="text"
                className="jpc-prompt-input"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Nom du dossier"
                autoFocus
                maxLength={120}
              />
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={() => setCreateFolderPrompt(false)}>
                  Annuler
                </button>
                <button type="submit" className="jpc-prompt-btn jpc-prompt-submit">
                  Créer
                </button>
              </div>
            </form>
          </div>
        )}

        {renamePrompt && (
          <div
            className="jpc-prompt-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setRenamePrompt(null) }}
          >
            <form
              className="jpc-prompt-modal"
              onMouseDown={(e) => e.stopPropagation()}
              onSubmit={submitRename}
            >
              <h3 className="jpc-prompt-title">
                {renamePrompt.kind === 'folder' ? 'Renommer le dossier' : 'Renommer le document'}
              </h3>
              <input
                type="text"
                className="jpc-prompt-input"
                value={renamePrompt.value}
                onChange={(e) => setRenamePrompt((p) => p && ({ ...p, value: e.target.value }))}
                onFocus={(e) => e.target.select()}
                autoFocus
                maxLength={120}
              />
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={() => setRenamePrompt(null)}>
                  Annuler
                </button>
                <button type="submit" className="jpc-prompt-btn jpc-prompt-submit">
                  Renommer
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}