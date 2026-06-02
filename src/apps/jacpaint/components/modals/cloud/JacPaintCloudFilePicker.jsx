import { useEffect, useMemo, useState } from 'react'
import { useJacpaintCloud } from '@/apps/jacpaint/hooks/cloud/useJacpaintCloud'
import { useJacpdfCloud } from '@/apps/jacpdf/hooks/cloud/useJacpdfCloud'
import {
  listFiles as cloudListFiles,
  renameFile as cloudRenameFile,
  deleteFile as cloudDeleteFile,
  moveFile as cloudMoveFile,
  listFolders as cloudListFolders,
  createFolder as cloudCreateFolder,
  renameFolder as cloudRenameFolder,
  deleteFolder as cloudDeleteFolder,
  moveFolder as cloudMoveFolder,
} from '@/shared/lib/cloud/jacCloud'
import './JacPaintCloudFilePicker.css'

// Picker JacPaint Cloud — calque sur le picker maison JacPDF
// (JacpdfCloudFilePicker) pour un look identique : sections, toolbar Trier +
// Nouvelle toile, fil d'Ariane, footer quota. Branche sur le cloud CENTRAL :
// fichiers/dossiers via les fonctions partagees jacCloud.js (sourceType
// 'jacpaint_cloud'), exactement comme CloudBrowser. Ouverture/creation de
// toile via useJacpaintCloud().canvases (get/create). Quota suite-wide via
// useJacpdfCloud (meme JacSuite Cloud central, agrege PDF + Paint).
//
// Contrat conserve : props { open, onClose, onSelect, brandName }. onSelect
// recoit la toile COMPLETE (canvases.get / canvases.create), prete a ouvrir.

const SOURCE = 'jacpaint_cloud'

function formatBytes(b, sys = 'fr') {
  const isFr = sys !== 'en'
  if (b == null) return '—'
  if (b < 1024) return `${b} ${isFr ? 'o' : 'B'}`
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} ${isFr ? 'Ko' : 'KB'}`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} ${isFr ? 'Mo' : 'MB'}`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} ${isFr ? 'Go' : 'GB'}`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Mode de tri (bouton Trier) — persiste en localStorage ───
const SORT_KEY = 'jacpaint_cloud_sort_mode_v1'
const VALID_SORT_MODES = ['recent', 'oldest', 'name_asc', 'name_desc', 'size_desc', 'size_asc']
const SORT_LABELS = {
  recent:    'Plus recent',
  oldest:    'Plus ancien',
  name_asc:  'Nom (A → Z)',
  name_desc: 'Nom (Z → A)',
  size_desc: 'Plus gros',
  size_asc:  'Plus petit',
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

function fileTime(f) {
  return f.last_opened_at || f.created_at || null
}

function applySort(arr, mode) {
  if (!arr || arr.length === 0) return arr
  const out = [...arr]
  switch (mode) {
    case 'recent':    return out.sort((a, b) => new Date(fileTime(b) || 0).getTime() - new Date(fileTime(a) || 0).getTime())
    case 'oldest':    return out.sort((a, b) => new Date(fileTime(a) || 0).getTime() - new Date(fileTime(b) || 0).getTime())
    case 'name_asc':  return out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))
    case 'name_desc': return out.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'fr'))
    case 'size_desc': return out.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
    case 'size_asc':  return out.sort((a, b) => (a.size_bytes || 0) - (b.size_bytes || 0))
    default:          return out
  }
}

// Sections du picker (segmented sous le header). Pas de Partagees : les toiles
// JacPaint ne se partagent que par lien public, jamais injectees dans la liste
// d'un autre user (donc l'onglet serait toujours vide).
const VIEW_LABELS = {
  mine: 'Mes toiles',
  recent: 'Recentes',
}

export default function JacPaintCloudFilePicker({ open, onClose, onSelect, brandName = 'JacSuite Cloud' }) {
  const { connected, loading, canvases } = useJacpaintCloud()
  const { usage, quotaUsedRatio } = useJacpdfCloud()
  const totalBytes = usage?.totalBytes || 0
  const ratio = quotaUsedRatio || 0

  const [files, setFiles] = useState(null)
  const [folders, setFolders] = useState([])
  const [viewMode, setViewMode] = useState('mine') // 'mine' | 'recent'
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([]) // [{id, name}, ...] sans la racine
  const [search, setSearch] = useState('')
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [pickingId, setPickingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, kind, target }
  const [renamePrompt, setRenamePrompt] = useState(null)
  const [createPrompt, setCreatePrompt] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [draggingItem, setDraggingItem] = useState(null)
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null)
  const [dropTargetRoot, setDropTargetRoot] = useState(false)
  const [sortMode, setSortMode] = useState(() => readSortMode())
  const [sortMenuOpen, setSortMenuOpen] = useState(false)

  // Charge dossiers + toiles du dossier courant a l'ouverture / changement.
  useEffect(() => {
    if (!open || !connected) return
    let cancelled = false
    setLoadingFiles(true)
    setError(null)
    const loadFolders = viewMode === 'mine'
      ? cloudListFolders({ parentId: currentFolderId })
      : Promise.resolve([])
    const loadFiles = viewMode === 'mine'
      ? cloudListFiles({ sourceType: SOURCE, folderId: currentFolderId })
      : cloudListFiles({ sourceType: SOURCE }) // recent : toutes les toiles
    Promise.all([loadFolders, loadFiles]).then(
      ([fs, fls]) => {
        if (cancelled) return
        setFolders(fs)
        setFiles(fls)
      },
      (err) => { if (!cancelled) setError(err) },
    ).finally(() => { if (!cancelled) setLoadingFiles(false) })
    return () => { cancelled = true }
  }, [open, connected, currentFolderId, viewMode])

  // Reset au close.
  useEffect(() => {
    if (!open) {
      setSearch('')
      setViewMode('mine')
      setPickingId(null)
      setBusy(false)
      setError(null)
      setNotice(null)
      setCurrentFolderId(null)
      setBreadcrumb([])
      setFolders([])
      setFiles(null)
      setDraggingItem(null)
      setDropTargetFolderId(null)
      setDropTargetRoot(false)
      setSortMenuOpen(false)
      setContextMenu(null)
      setRenamePrompt(null)
      setCreatePrompt(null)
      setDeleteConfirm(null)
    }
  }, [open])

  const filteredFolders = useMemo(() => {
    if (!folders || viewMode !== 'mine') return []
    if (!search.trim()) return folders
    const q = search.toLowerCase()
    return folders.filter(f => (f.name || '').toLowerCase().includes(q))
  }, [folders, search, viewMode])

  const filteredFiles = useMemo(() => {
    if (!files) return []
    let arr = files
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(f => (f.name || '').toLowerCase().includes(q))
    }
    if (viewMode === 'recent') {
      return [...arr]
        .sort((a, b) => new Date(fileTime(b) || 0).getTime() - new Date(fileTime(a) || 0).getTime())
        .slice(0, 30)
    }
    return applySort(arr, sortMode)
  }, [files, search, sortMode, viewMode])

  // Refetch (apres rename / delete / move).
  const reload = async () => {
    if (!connected) return
    setLoadingFiles(true)
    setError(null)
    try {
      const [fs, fls] = await Promise.all([
        viewMode === 'mine' ? cloudListFolders({ parentId: currentFolderId }) : Promise.resolve([]),
        viewMode === 'mine' ? cloudListFiles({ sourceType: SOURCE, folderId: currentFolderId }) : cloudListFiles({ sourceType: SOURCE }),
      ])
      setFolders(fs)
      setFiles(fls)
    } catch (err) {
      setError(err)
    } finally {
      setLoadingFiles(false)
    }
  }

  const flashNotice = (msg, ms = 2500) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), ms)
  }

  const switchViewMode = (next) => {
    setViewMode(next)
    setCurrentFolderId(null)
    setBreadcrumb([])
    setSearch('')
  }

  const enterFolder = (folder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
  }

  const navigateBreadcrumb = (index) => {
    if (index === -1) {
      setCurrentFolderId(null)
      setBreadcrumb([])
    } else {
      setCurrentFolderId(breadcrumb[index].id)
      setBreadcrumb(prev => prev.slice(0, index + 1))
    }
    setSearch('')
  }

  // Ouvre une toile : recupere l'objet complet puis remonte via onSelect.
  const handlePick = async (file) => {
    if (pickingId) return
    setPickingId(file.id)
    try {
      const full = await canvases.get(file.id)
      onSelect?.(full)
      onClose?.()
    } catch (err) {
      setError(err)
      setPickingId(null)
    }
  }

  // Cree une nouvelle toile (dans le dossier courant) et l'ouvre.
  const handleCreateCanvas = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const canvas = await canvases.create({
        title: 'Toile sans titre',
        width: 1920,
        height: 1080,
        folderId: viewMode === 'mine' ? currentFolderId : null,
      })
      onSelect?.(canvas)
      onClose?.()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  // ─── Nouveau dossier ───
  const handleCreateFolder = () => setCreatePrompt({ value: '', error: null })
  const closeCreatePrompt = () => setCreatePrompt(null)
  const submitCreatePrompt = async (e) => {
    e.preventDefault()
    if (!createPrompt) return
    const trimmed = (createPrompt.value || '').trim()
    if (!trimmed) {
      setCreatePrompt(p => p && { ...p, error: 'Le nom ne peut pas etre vide.' })
      return
    }
    try {
      const folder = await cloudCreateFolder({ name: trimmed, parentId: currentFolderId })
      setFolders(prev => [...prev, folder].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr')))
      closeCreatePrompt()
      flashNotice(`✅ Dossier « ${folder.name} » cree.`)
    } catch (err) {
      if (err?.details?.duplicateName) {
        setCreatePrompt(p => p && { ...p, error: `Un dossier nomme « ${trimmed} » existe deja ici.` })
      } else {
        closeCreatePrompt()
        setError(err)
      }
    }
  }

  // ─── Menu contextuel (click droit) ───
  const openContextMenu = (e, target, kind) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 208)
    const y = Math.min(e.clientY, window.innerHeight - 138)
    setContextMenu({ x, y, kind, target })
  }
  const closeContextMenu = () => setContextMenu(null)

  useEffect(() => {
    if (!contextMenu) return
    const onDown = () => closeContextMenu()
    const onKey = (e) => { if (e.key === 'Escape') closeContextMenu() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!sortMenuOpen) return
    const onDown = () => setSortMenuOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') setSortMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortMenuOpen])

  useEffect(() => {
    if (!renamePrompt && !createPrompt && !deleteConfirm) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setRenamePrompt(null)
        setCreatePrompt(null)
        setDeleteConfirm(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [renamePrompt, createPrompt, deleteConfirm])

  // ─── Renommer ───
  const handleRename = () => {
    const cm = contextMenu
    closeContextMenu()
    if (!cm) return
    setRenamePrompt({ kind: cm.kind, target: cm.target, value: cm.target.name, error: null })
  }
  const closeRenamePrompt = () => setRenamePrompt(null)
  const submitRenamePrompt = async (e) => {
    e.preventDefault()
    if (!renamePrompt) return
    const { kind, target, value } = renamePrompt
    const trimmed = (value || '').trim()
    if (!trimmed) {
      setRenamePrompt(p => p && { ...p, error: 'Le nom ne peut pas etre vide.' })
      return
    }
    if (trimmed === target.name) {
      closeRenamePrompt()
      return
    }
    try {
      if (kind === 'folder') {
        await cloudRenameFolder(target.id, trimmed)
        setBreadcrumb(prev => prev.map(b => b.id === target.id ? { ...b, name: trimmed } : b))
      } else {
        await cloudRenameFile({ id: target.id, source_type: SOURCE }, trimmed)
      }
      closeRenamePrompt()
      await reload()
      flashNotice(`✅ Renomme en « ${trimmed} ».`)
    } catch (err) {
      if (err?.details?.duplicateName) {
        setRenamePrompt(p => p && {
          ...p,
          error: `Un ${kind === 'folder' ? 'dossier' : 'fichier'} nomme « ${trimmed} » existe deja ici.`,
        })
      } else {
        closeRenamePrompt()
        setError(err)
      }
    }
  }

  // ─── Supprimer ───
  const handleDelete = () => {
    const cm = contextMenu
    closeContextMenu()
    if (!cm) return
    setDeleteConfirm({ kind: cm.kind, target: cm.target })
  }
  const closeDeleteConfirm = () => setDeleteConfirm(null)
  const confirmDelete = async () => {
    if (!deleteConfirm) return
    const { kind, target } = deleteConfirm
    try {
      if (kind === 'folder') {
        await cloudDeleteFolder(target.id)
        const wasInside = currentFolderId === target.id || breadcrumb.some(b => b.id === target.id)
        closeDeleteConfirm()
        if (wasInside) {
          setCurrentFolderId(null)
          setBreadcrumb([])
        } else {
          await reload()
        }
        flashNotice(`🗑 Dossier « ${target.name} » supprime.`)
      } else {
        await cloudDeleteFile({ id: target.id, source_type: SOURCE })
        closeDeleteConfirm()
        await reload()
        flashNotice(`🗑 « ${target.name} » supprime.`)
      }
    } catch (err) {
      closeDeleteConfirm()
      setError(err)
    }
  }

  // ─── Drag-and-drop (deplacer une toile / un dossier dans un dossier) ───
  const onItemDragStart = (e, kind, item) => {
    setDraggingItem({ kind, id: item.id, name: item.name })
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', `${kind}:${item.id}`) } catch {}
  }
  const onItemDragEnd = () => {
    setDraggingItem(null)
    setDropTargetFolderId(null)
    setDropTargetRoot(false)
  }
  const onFolderDragOver = (e, folder) => {
    if (!draggingItem) return
    if (draggingItem.kind === 'folder' && draggingItem.id === folder.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTargetFolderId !== folder.id) setDropTargetFolderId(folder.id)
  }
  const onFolderDragLeave = (e, folder) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropTargetFolderId(prev => prev === folder.id ? null : prev)
  }
  const onFolderDrop = async (e, folder) => {
    e.preventDefault()
    e.stopPropagation()
    const item = draggingItem
    setDraggingItem(null)
    setDropTargetFolderId(null)
    if (!item) return
    if (item.kind === 'folder' && item.id === folder.id) return
    try {
      if (item.kind === 'file') await cloudMoveFile({ id: item.id, source_type: SOURCE }, folder.id)
      else await cloudMoveFolder(item.id, folder.id)
      await reload()
      flashNotice(`✅ « ${item.name} » deplace dans « ${folder.name} ».`)
    } catch (err) {
      setError(err)
    }
  }
  const onRootDragOver = (e) => {
    if (!draggingItem) return
    if (currentFolderId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dropTargetRoot) setDropTargetRoot(true)
  }
  const onRootDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropTargetRoot(false)
  }
  const onRootDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const item = draggingItem
    setDraggingItem(null)
    setDropTargetRoot(false)
    if (!item || currentFolderId === null) return
    try {
      if (item.kind === 'file') await cloudMoveFile({ id: item.id, source_type: SOURCE }, null)
      else await cloudMoveFolder(item.id, null)
      await reload()
      flashNotice(`✅ « ${item.name} » deplace a la racine.`)
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
            <p>Connecte-toi pour acceder a tes toiles cloud.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dfp-overlay" onClick={onClose}>
      <div className="dfp-modal jpc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dfp-header">
          <h2 className="jpc-title">{brandName}</h2>
          <button className="dfp-close" onClick={onClose}>✕</button>
        </div>

        {/* Sections : Mes toiles / Recentes */}
        <div className="jpc-view-switch">
          {Object.entries(VIEW_LABELS).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`jpc-view-chip${viewMode === mode ? ' is-active' : ''}`}
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
            placeholder="Rechercher une toile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {viewMode === 'mine' && (
            <button type="button" className="jpc-new-folder-btn" onClick={handleCreateFolder} title="Creer un nouveau dossier">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <span>Nouveau dossier</span>
            </button>
          )}
          <div className="jpc-sort-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" className={`jpc-sort-btn${sortMenuOpen ? ' jpc-sort-btn-open' : ''}`} onClick={() => setSortMenuOpen(s => !s)} title={`Trier les toiles — ${SORT_LABELS[sortMode]}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M6 12h12M10 18h4"/>
              </svg>
              <span>Trier</span>
            </button>
            {sortMenuOpen && (
              <div className="jpc-sort-menu">
                {VALID_SORT_MODES.map((mode) => (
                  <button key={mode} type="button" className={`jpc-sort-option${sortMode === mode ? ' jpc-sort-option-active' : ''}`} onClick={() => { setSortMode(mode); writeSortMode(mode); setSortMenuOpen(false) }}>
                    <span className="jpc-sort-option-check">{sortMode === mode ? '✓' : ''}</span>
                    <span>{SORT_LABELS[mode]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="jpc-add-btn" onClick={handleCreateCanvas} disabled={busy} title="Creer une nouvelle toile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>Nouvelle toile</span>
          </button>
        </div>

        {/* Breadcrumb : Racine › Sous-dossier › Dossier courant */}
        {viewMode === 'mine' && (
          <nav className="jpc-breadcrumb">
            <button
              type="button"
              className={`jpc-crumb${breadcrumb.length === 0 ? ' jpc-crumb-current' : ''}${dropTargetRoot ? ' jpc-crumb-drop' : ''}`}
              onClick={() => navigateBreadcrumb(-1)}
              onDragOver={onRootDragOver}
              onDragLeave={onRootDragLeave}
              onDrop={onRootDrop}
              disabled={breadcrumb.length === 0}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              <span>Racine</span>
            </button>
            {breadcrumb.map((b, i) => (
              <span key={b.id} className="jpc-crumb-wrap">
                <span className="jpc-crumb-sep">›</span>
                <button type="button" className={`jpc-crumb ${i === breadcrumb.length - 1 ? 'jpc-crumb-current' : ''}`} onClick={() => navigateBreadcrumb(i)} disabled={i === breadcrumb.length - 1}>
                  {b.name}
                </button>
              </span>
            ))}
          </nav>
        )}

        {notice && <div className="jpc-notice">{notice}</div>}
        {error && <div className="jpc-error">Erreur : {error.message || String(error)}</div>}
        {loadingFiles && <div className="jpc-loading">Chargement de tes toiles…</div>}

        {!loadingFiles && filteredFolders.length === 0 && filteredFiles.length === 0 && (
          <div className="jpc-empty-state">
            {search.trim()
              ? 'Aucun resultat pour cette recherche.'
              : viewMode === 'recent'
                ? 'Aucune toile recente pour le moment.'
                : (currentFolderId === null
                  ? <>Aucune toile ni dossier dans ton cloud pour le moment.<br />Cree ta premiere toile avec « + Nouvelle toile ».</>
                  : <>Ce dossier est vide.<br />Cree un sous-dossier ou une nouvelle toile ici.</>)}
          </div>
        )}

        {!loadingFiles && (filteredFolders.length > 0 || filteredFiles.length > 0) && (
          <ul className="jpc-list">
            {filteredFolders.map((folder) => (
              <li
                key={`folder-${folder.id}`}
                className={`jpc-item jpc-folder-item${draggingItem?.kind === 'folder' && draggingItem.id === folder.id ? ' jpc-item-dragging' : ''}${dropTargetFolderId === folder.id ? ' jpc-item-drop' : ''}`}
                draggable
                onDragStart={(e) => onItemDragStart(e, 'folder', folder)}
                onDragEnd={onItemDragEnd}
                onDragOver={(e) => onFolderDragOver(e, folder)}
                onDragLeave={(e) => onFolderDragLeave(e, folder)}
                onDrop={(e) => onFolderDrop(e, folder)}
                onClick={() => enterFolder(folder)}
                onContextMenu={(e) => openContextMenu(e, folder, 'folder')}
                title="Click droit : renommer ou supprimer · glisser pour deplacer"
              >
                <div className="jpc-item-icon jpc-folder-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="jpc-item-meta">
                  <div className="jpc-item-name">{folder.name}</div>
                  <div className="jpc-item-info">Dossier</div>
                </div>
                <div className="jpc-folder-arrow">›</div>
              </li>
            ))}
            {filteredFiles.map((file) => (
              <li
                key={`file-${file.id}`}
                className={`jpc-item${pickingId === file.id ? ' jpc-item-loading' : ''}${draggingItem?.kind === 'file' && draggingItem.id === file.id ? ' jpc-item-dragging' : ''}`}
                draggable
                onDragStart={(e) => onItemDragStart(e, 'file', file)}
                onDragEnd={onItemDragEnd}
                onClick={() => handlePick(file)}
                onContextMenu={(e) => openContextMenu(e, file, 'file')}
                title="Click droit : renommer ou supprimer · glisser sur un dossier"
              >
                <div className="jpc-item-icon">🎨</div>
                <div className="jpc-item-meta">
                  <div className="jpc-item-name">{file.name}</div>
                  <div className="jpc-item-info">{formatBytes(file.size_bytes || 0)} · {formatDate(fileTime(file))}</div>
                </div>
                {pickingId === file.id && <div className="jpc-item-spinner">…</div>}
              </li>
            ))}
          </ul>
        )}

        {/* Footer : stockage utilise (quota suite-wide central) */}
        <div className="jpc-footer">
          <div className="jpc-footer-row">
            <span className="jpc-footer-label">Stockage utilise</span>
            <span className="jpc-footer-usage">
              {formatBytes(totalBytes)} / {formatBytes(1024 ** 3)}
              {ratio >= 0.8 && <span className="jpc-quota-warn"> ⚠</span>}
            </span>
          </div>
          <div className="jpc-quota-bar">
            <div className={`jpc-quota-bar-fill ${ratio >= 0.8 ? 'warn' : ratio >= 0.5 ? 'mid' : 'ok'}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
          </div>
        </div>

        {/* Menu contextuel */}
        {contextMenu && (
          <div className="jpc-context-menu" style={ { left: contextMenu.x, top: contextMenu.y } } onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className="jpc-context-header">{contextMenu.kind === 'folder' ? '📁 ' : '🎨 '}{contextMenu.target.name}</div>
            <button type="button" className="jpc-context-item" onClick={handleRename}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
              </svg>
              <span>Renommer</span>
            </button>
            <button type="button" className="jpc-context-item jpc-context-item-danger" onClick={handleDelete}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
              </svg>
              <span>Supprimer</span>
            </button>
          </div>
        )}

        {/* Modal : nouveau dossier */}
        {createPrompt && (
          <div className="jpc-prompt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeCreatePrompt() }}>
            <form className="jpc-prompt-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submitCreatePrompt}>
              <h3 className="jpc-prompt-title">Nouveau dossier</h3>
              <input type="text" className="jpc-prompt-input" value={createPrompt.value} onChange={(e) => setCreatePrompt(p => p && { ...p, value: e.target.value, error: null })} autoFocus maxLength={120} placeholder="Nom du dossier" />
              {createPrompt.error && <div className="jpc-prompt-error">{createPrompt.error}</div>}
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={closeCreatePrompt}>Annuler</button>
                <button type="submit" className="jpc-prompt-btn jpc-prompt-submit">Creer</button>
              </div>
            </form>
          </div>
        )}

        {/* Modal : renommer */}
        {renamePrompt && (
          <div className="jpc-prompt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRenamePrompt() }}>
            <form className="jpc-prompt-modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submitRenamePrompt}>
              <h3 className="jpc-prompt-title">{renamePrompt.kind === 'folder' ? 'Renommer le dossier' : 'Renommer la toile'}</h3>
              <input type="text" className="jpc-prompt-input" value={renamePrompt.value} onChange={(e) => setRenamePrompt(p => p && { ...p, value: e.target.value, error: null })} onFocus={(e) => e.target.select()} autoFocus maxLength={120} />
              {renamePrompt.error && <div className="jpc-prompt-error">{renamePrompt.error}</div>}
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={closeRenamePrompt}>Annuler</button>
                <button type="submit" className="jpc-prompt-btn jpc-prompt-submit">Renommer</button>
              </div>
            </form>
          </div>
        )}

        {/* Modal : confirmation suppression */}
        {deleteConfirm && (
          <div className="jpc-prompt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDeleteConfirm() }}>
            <div className="jpc-prompt-modal" onMouseDown={(e) => e.stopPropagation()}>
              <h3 className="jpc-prompt-title">{deleteConfirm.kind === 'folder' ? 'Supprimer ce dossier ?' : 'Supprimer cette toile ?'}</h3>
              <p className="jpc-prompt-body">
                {deleteConfirm.kind === 'folder'
                  ? <>Le dossier <strong>« {deleteConfirm.target.name} »</strong> sera supprime. Les toiles a l'interieur retournent a la racine.</>
                  : <>La toile <strong>« {deleteConfirm.target.name} »</strong> sera supprimee definitivement. Cette action est irreversible.</>}
              </p>
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={closeDeleteConfirm}>Annuler</button>
                <button type="button" className="jpc-prompt-btn jpc-prompt-danger" onClick={confirmDelete}>Supprimer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}