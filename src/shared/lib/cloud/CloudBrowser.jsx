import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  listFolders,
  listFiles,
  createFolder,
  renameFolder,
  deleteFolder,
  getFolderPath,
  uploadNewFile,
  deleteFile,
  trashFile,
  renameFile,
  downloadFile,
  moveFile,
  moveFolder,
  getStorageUsage,
  setFileStar,
  sourceConfig,
  SOURCE_REGISTRY,
} from './jacCloud'
import { useStoredSetting } from '@/shared/components/modals/settings/shared/useStoredSetting'
import './CloudBrowser.css'

// Navigateur cloud PARTAGÉ — la brique unique de tout le cloud JacSuite.
// JacSuite Cloud le monte sans filtre (tous les fichiers) ; chaque app le
// monte avec `sourceType` pour n'afficher QUE ses fichiers, tout en partageant
// les MÊMES dossiers globaux (table `folders`). C'est le « miroir » façon
// Google Drive : un seul cloud, des vues filtrées.
//
// Props :
//   - sourceType : clé de SOURCE_REGISTRY (ex. 'jacpaint_cloud') ou null pour
//                  tout afficher (vue JacSuite Cloud complète).
//   - onOpenFile : (file) => void — ouverture d'un fichier dans l'app hôte. Si
//                  absent, les fichiers sont en lecture seule.
//   - emptyHint  : texte affiché quand le dossier courant est vide.
//   - compact    : rendu resserré (pour un panneau d'app étroit).

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic']
const HIDDEN_INPUT = { display: 'none' }
const QUOTA_BYTES = 1024 ** 3 // 1 Go — plafond de stockage cloud de la suite.

const SOURCE_LABEL = Object.fromEntries(
  Object.entries(SOURCE_REGISTRY).map(([k, v]) => [k, v.label]),
)

// ─── Tri & ordre manuel (persistés en localStorage) ───
// Le tri est global (l'user choisit un mode, appliqué partout). L'ordre
// « Manuel » est par périmètre (source + dossier) : c'est l'ordre du
// glisser-déposer fichier-sur-fichier. Local à l'appareil pour l'instant.
const SORT_KEY = 'jacsuite_cloudbrowser_sort_v1'
const ORDER_KEY = 'jacsuite_cloudbrowser_order_v1'
const VALID_SORT_MODES = ['manual', 'recent', 'oldest', 'name_asc', 'name_desc', 'size_desc', 'size_asc']
const SORT_LABELS = {
  manual: 'Manuel (glisser-déposer)',
  recent: 'Plus récent',
  oldest: 'Plus ancien',
  name_asc: 'Nom (A → Z)',
  name_desc: 'Nom (Z → A)',
  size_desc: 'Plus gros',
  size_asc: 'Plus petit',
}

function scopeKey(sourceType, folderId) {
  const f = folderId === null || folderId === undefined ? '__root__' : folderId
  return `${sourceType || 'all'}:${f}`
}

function readOrders() {
  try { const raw = localStorage.getItem(ORDER_KEY); return raw ? JSON.parse(raw) : {} }
  catch { return {} }
}
function writeOrders(orders) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(orders)) } catch {}
}
function readSortMode() {
  try {
    const v = localStorage.getItem(SORT_KEY)
    if (VALID_SORT_MODES.includes(v)) return v
    const def = localStorage.getItem('jaccloud_settings_default_sort')
    return VALID_SORT_MODES.includes(def) ? def : 'recent'
  } catch { return 'recent' }
}
function writeSortMode(mode) {
  try { localStorage.setItem(SORT_KEY, mode) } catch {}
}

function applyManualOrder(arr, key) {
  const order = readOrders()[key]
  if (!Array.isArray(order) || order.length === 0) return arr
  const idx = new Map(order.map((id, i) => [id, i]))
  return [...arr].sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id) : Infinity
    const bi = idx.has(b.id) ? idx.get(b.id) : Infinity
    if (ai !== bi) return ai - bi
    return String(b.last_opened_at || b.created_at || '').localeCompare(String(a.last_opened_at || a.created_at || ''))
  })
}

function applySort(arr, mode, key) {
  if (!arr || arr.length === 0) return arr || []
  if (mode === 'manual') return applyManualOrder(arr, key)
  const a = [...arr]
  switch (mode) {
    case 'recent': return a.sort((x, y) => String(y.last_opened_at || y.created_at || '').localeCompare(String(x.last_opened_at || x.created_at || '')))
    case 'oldest': return a.sort((x, y) => String(x.last_opened_at || x.created_at || '').localeCompare(String(y.last_opened_at || y.created_at || '')))
    case 'name_asc': return a.sort((x, y) => (x.name || '').localeCompare(y.name || '', 'fr'))
    case 'name_desc': return a.sort((x, y) => (y.name || '').localeCompare(x.name || '', 'fr'))
    case 'size_desc': return a.sort((x, y) => (y.size_bytes || 0) - (x.size_bytes || 0))
    case 'size_asc': return a.sort((x, y) => (x.size_bytes || 0) - (y.size_bytes || 0))
    default: return a
  }
}

// ext → source de destination (téléversement en vue globale, sans sourceType).
function sourceForExt(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'jacpdf_cloud'
  if (IMAGE_EXTS.includes(ext)) return 'jacpaint_cloud'
  if (ext === 'json') return 'jacnote_cloud'
  return null
}

function canDownload(sourceType) {
  try { return sourceConfig(sourceType).backend === 'storage' }
  catch { return false }
}

function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} o`
  const units = ['Ko', 'Mo', 'Go', 'To']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

// Type lisible d'un fichier : déduit de l'extension, repli sur sa source.
const TYPE_BY_SOURCE = {
  jacpdf_cloud: 'PDF',
  jacpaint_cloud: 'Image',
  jacdoc_cloud: 'Document',
  jacnote_cloud: 'Note',
}
function fileTypeLabel(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'PDF'
  if (IMAGE_EXTS.includes(ext)) return 'Image'
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'pages'].includes(ext)) return 'Document'
  if (ext === 'json') return 'JSON'
  return TYPE_BY_SOURCE[file.source_type] || 'Fichier'
}

// Date courte FR (jj mois aaaa). null/invalide → '—'.
function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Date relative FR (ex. « il y a 3 jours »). Repli sur la date absolue.
function formatRelativeCB(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const day = 86400000
  if (diff < 60000) return "à l'instant"
  if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`
  if (diff < day) return `il y a ${Math.floor(diff / 3600000)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return formatDate(iso)
}

function Icon({ name, size = 18, filled = false }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
    strokeLinejoin: 'round', 'aria-hidden': 'true',
  }
  switch (name) {
    case 'folder':
      return (<svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>)
    case 'file':
      return (<svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>)
    case 'plus':
      return (<svg {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>)
    case 'folder-plus':
      return (<svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 11.5v4" /><path d="M10 13.5h4" /></svg>)
    case 'upload':
      return (<svg {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></svg>)
    case 'dots':
      return (<svg {...p} fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>)
    case 'pencil':
      return (<svg {...p}><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>)
    case 'download':
      return (<svg {...p}><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>)
    case 'trash':
      return (<svg {...p}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>)
    case 'chevron':
      return (<svg {...p}><path d="m9 6 6 6-6 6" /></svg>)
    case 'eye':
      return (<svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>)
    case 'sort':
      return (<svg {...p}><path d="M3 6h18" /><path d="M6 12h12" /><path d="M10 18h4" /></svg>)
    case 'search':
      return (<svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>)
    case 'star':
      return (<svg {...p}><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" /></svg>)
    default:
      return null
  }
}

// Petit menu d'actions (⋮) générique : `actions` = [{ label, icon, danger, onClick }].
function RowMenu({ actions }) {
  const [open, setOpen] = useState(false)
  const stop = (e) => e.stopPropagation()
  if (!actions.length) return null
  return (
    <span className="cloudbrowser__menu" onClick={stop}>
      <button
        type="button"
        className={`cloudbrowser__menu-btn${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
        onClick={(e) => { stop(e); setOpen((v) => !v) }}
      >
        <Icon name="dots" size={16} />
      </button>
      {open && (
        <>
          <div className="cloudbrowser__menu-backdrop" onClick={(e) => { stop(e); setOpen(false) }} />
          <div className="cloudbrowser__menu-list" role="menu">
            {actions.map((a, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`cloudbrowser__menu-item${a.danger ? ' cloudbrowser__menu-item--danger' : ''}`}
                onClick={() => { setOpen(false); a.onClick() }}
              >
                <span className="cloudbrowser__menu-icon" aria-hidden="true"><Icon name={a.icon} size={15} /></span>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

// Aperçu rapide générique (sans dépendance) : télécharge les octets d'un
// fichier 'storage' et l'affiche selon son type — PDF en <iframe>, image en
// <img>. Tout autre type (ou source 'table') affiche un repli + « Ouvrir ».
function QuickLook({ file, onClose, onOpen, onPrev, onNext, hasPrev, hasNext }) {
  const [view, setView] = useState({ status: 'loading', url: null, kind: null })

  useEffect(() => {
    let cancelled = false
    let objectUrl = null
    const run = async () => {
      setView({ status: 'loading', url: null, kind: null })
      if (!canDownload(file.source_type)) { setView({ status: 'unsupported', url: null, kind: null }); return }
      try {
        const bytes = await downloadFile(file)
        if (cancelled) return
        const { contentType } = sourceConfig(file.source_type)
        let kind = 'other'
        if (contentType === 'application/pdf') kind = 'pdf'
        else if ((contentType || '').startsWith('image/')) kind = 'image'
        else {
          const ext = (file.name.split('.').pop() || '').toLowerCase()
          if (IMAGE_EXTS.includes(ext)) kind = 'image'
        }
        if (kind === 'other') { setView({ status: 'unsupported', url: null, kind }); return }
        const blob = new Blob([bytes], { type: contentType })
        objectUrl = URL.createObjectURL(blob)
        setView({ status: 'ready', url: objectUrl, kind })
      } catch (e) {
        if (cancelled) return
        if (import.meta.env.DEV) console.warn('[cloudbrowser] aperçu échoué', e)
        setView({ status: 'error', url: null, kind: null })
      }
    }
    run()
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [file])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); onClose?.() }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpen?.() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (hasNext) onNext?.() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (hasPrev) onPrev?.() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose, onOpen, onPrev, onNext, hasPrev, hasNext])

  return (
    <div className="cloudbrowser__ql-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cloudbrowser__ql" onClick={(e) => e.stopPropagation()}>
        <div className="cloudbrowser__ql-head">
          <div className="cloudbrowser__ql-title" title={file.name}>{file.name}</div>
          <div className="cloudbrowser__ql-head-actions">
            {onOpen && <button type="button" className="cloudbrowser__ql-open" onClick={onOpen} title="Ouvrir (Entrée)">Ouvrir</button>}
            <button type="button" className="cloudbrowser__ql-close" onClick={onClose} aria-label="Fermer l'aperçu" title="Fermer (Espace ou Échap)">✕</button>
          </div>
        </div>
        <div className="cloudbrowser__ql-body">
          {view.status === 'loading' && <div className="cloudbrowser__ql-msg">Chargement de l'aperçu…</div>}
          {view.status === 'error' && <div className="cloudbrowser__ql-msg cloudbrowser__ql-msg--error">Aperçu indisponible.</div>}
          {view.status === 'unsupported' && (
            <div className="cloudbrowser__ql-msg">
              Aperçu non disponible pour ce type de fichier.
              {onOpen && <><br />Utilise « Ouvrir » pour le voir dans son app.</>}
            </div>
          )}
          {view.status === 'ready' && view.kind === 'pdf' && (
            <iframe className="cloudbrowser__ql-frame" src={view.url} title={file.name} />
          )}
          {view.status === 'ready' && view.kind === 'image' && (
            <img className="cloudbrowser__ql-img" src={view.url} alt={file.name} />
          )}
        </div>
        <div className="cloudbrowser__ql-foot">
          <span className="cloudbrowser__ql-hint"><kbd>Espace</kbd> fermer · <kbd>←</kbd> <kbd>→</kbd> fichier · <kbd>Entrée</kbd> ouvrir</span>
          <div className="cloudbrowser__ql-nav">
            <button type="button" className="cloudbrowser__ql-navbtn" onClick={onPrev} disabled={!hasPrev}>‹ Précédent</button>
            <button type="button" className="cloudbrowser__ql-navbtn" onClick={onNext} disabled={!hasNext}>Suivant ›</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CloudBrowser({ sourceType = null, onOpenFile = null, emptyHint, compact = false }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([]) // fil d'Ariane : [{ id, name }]
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [usage, setUsage] = useState(null)
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState(() => readSortMode())
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [quickLookFile, setQuickLookFile] = useState(null)
  // Glisser-déposer : item en cours + cibles survolées.
  const [dragging, setDragging] = useState(null) // { kind, id, name, source_type }
  const [dropFolderId, setDropFolderId] = useState(null)
  const [dropFileId, setDropFileId] = useState(null)
  const [dropRoot, setDropRoot] = useState(false)
  // Dialogues : { type: 'new-folder'|'rename-file'|'rename-folder', target, value }
  const [dialog, setDialog] = useState(null)
  const [dialogValue, setDialogValue] = useState('')
  const [dialogError, setDialogError] = useState(null)
  // Suppression : { kind: 'file'|'folder', item }
  const [removeTarget, setRemoveTarget] = useState(null)
  const fileInputRef = useRef(null)
  // Réglages d'affichage de JacSuite Cloud (live).
  const [layoutPref] = useStoredSetting('jaccloud_settings_layout', 'list')
  const [densityPref] = useStoredSetting('jaccloud_settings_density', 'comfortable')
  const [colApp] = useStoredSetting('jaccloud_settings_col_app', 'true')
  const [colType] = useStoredSetting('jaccloud_settings_col_type', 'true')
  const [colDate] = useStoredSetting('jaccloud_settings_col_date', 'true')
  const [colSize] = useStoredSetting('jaccloud_settings_col_size', 'true')
  const [dateFormatPref] = useStoredSetting('jaccloud_settings_date_format', 'absolute')
  const [confirmDeletePref] = useStoredSetting('jaccloud_settings_confirm_delete', 'true')
  const [clickActionPref] = useStoredSetting('jaccloud_settings_click_action', 'open')
  const [allowDownloadPref] = useStoredSetting('jaccloud_settings_allow_download', 'true')
  const [defaultUploadPref] = useStoredSetting('jaccloud_settings_default_upload', 'auto')
  const allowDownload = allowDownloadPref !== 'false'
  const fmtDate = (iso) => (dateFormatPref === 'relative' ? formatRelativeCB(iso) : formatDate(iso))

  const showToast = useCallback((msg) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const refreshUsage = useCallback(() => {
    getStorageUsage({ sourceType: sourceType || undefined }).then(setUsage).catch(() => {})
  }, [sourceType])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fol, fil, crumb] = await Promise.all([
        listFolders({ parentId: folderId }),
        listFiles({ sourceType: sourceType || undefined, folderId }),
        getFolderPath(folderId),
      ])
      setFolders(fol)
      setFiles(fil)
      setPath((crumb || []).map((c) => ({ id: c.id, name: c.name })))
    } catch (e) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] chargement échoué', e)
      setError('Impossible de charger le cloud.')
    } finally {
      setLoading(false)
    }
  }, [folderId, sourceType])

  useEffect(() => { load() }, [load])
  useEffect(() => { refreshUsage() }, [refreshUsage])

  // Re-fetch quand le cloud change ailleurs (upload, downgrade, autre app…).
  useEffect(() => {
    const onChange = () => { load(); refreshUsage() }
    window.addEventListener('jacsuite:cloudFilesChanged', onChange)
    return () => window.removeEventListener('jacsuite:cloudFilesChanged', onChange)
  }, [load, refreshUsage])

  const notify = () => window.dispatchEvent(new CustomEvent('jacsuite:cloudFilesChanged'))

  const openFolder = (f) => { setFolderId(f.id); setSearch('') }
  const goRoot = () => { setFolderId(null); setSearch('') }
  const goCrumb = (id) => { setFolderId(id); setSearch('') }

  // — Vues filtrées + triées —
  const visibleFolders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? folders.filter((f) => (f.name || '').toLowerCase().includes(q)) : folders
  }, [folders, search])

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    const arr = q ? files.filter((f) => (f.name || '').toLowerCase().includes(q)) : files
    return applySort(arr, sortMode, scopeKey(sourceType, folderId))
  }, [files, search, sortMode, sourceType, folderId])

  const qlIndex = quickLookFile ? visibleFiles.findIndex((f) => f.id === quickLookFile.id) : -1
  const qlHasPrev = qlIndex > 0
  const qlHasNext = qlIndex >= 0 && qlIndex < visibleFiles.length - 1

  // — Nouveau dossier —
  const openNewFolder = () => { setDialog({ type: 'new-folder' }); setDialogValue(''); setDialogError(null) }
  // — Renommer (fichier ou dossier) —
  const openRename = (kind, item) => {
    setDialog({ type: kind === 'file' ? 'rename-file' : 'rename-folder', target: item })
    setDialogValue(item.name)
    setDialogError(null)
  }

  const confirmDialog = async () => {
    const name = dialogValue.trim()
    if (!name || !dialog) return
    setBusy(true)
    setDialogError(null)
    try {
      if (dialog.type === 'new-folder') {
        await createFolder({ name, parentId: folderId })
        showToast(`Dossier « ${name} » créé.`)
      } else if (dialog.type === 'rename-folder') {
        await renameFolder(dialog.target.id, name)
        showToast('Dossier renommé.')
      } else if (dialog.type === 'rename-file') {
        await renameFile(dialog.target, name)
        showToast('Fichier renommé.')
      }
      setDialog(null)
      notify()
      await load()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] action échouée', e)
      setDialogError(e?.message || 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!removeTarget) return
    setBusy(true)
    try {
      if (removeTarget.kind === 'file') await trashFile(removeTarget.item)
      else await deleteFolder(removeTarget.item.id)
      setRemoveTarget(null)
      notify()
      refreshUsage()
      await load()
      showToast(removeTarget.kind === 'file' ? 'Fichier déplacé vers la corbeille.' : 'Dossier supprimé.')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] suppression échouée', e)
      showToast('La suppression a échoué.')
      setRemoveTarget(null)
    } finally {
      setBusy(false)
    }
  }

  // Suppression directe (sans dialogue) quand la confirmation est désactivée.
  const quickTrashFile = async (file) => {
    setBusy(true)
    try {
      await trashFile(file)
      notify()
      refreshUsage()
      await load()
      showToast('Fichier déplacé vers la corbeille.')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] suppression échouée', e)
      showToast('La suppression a échoué.')
    } finally {
      setBusy(false)
    }
  }

  const toggleStar = async (file) => {
    const next = !file.is_starred
    // MAJ optimiste : on bascule l'étoile tout de suite, on annule si erreur.
    setFiles((prev) => prev.map((f) => (f.id === file.id && f.source_type === file.source_type ? { ...f, is_starred: next } : f)))
    try {
      await setFileStar({ id: file.id, source_type: file.source_type }, next)
      notify()
      showToast(next ? 'Ajouté aux favoris.' : 'Retiré des favoris.')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] favori échoué', e)
      setFiles((prev) => prev.map((f) => (f.id === file.id && f.source_type === file.source_type ? { ...f, is_starred: !next } : f)))
      showToast('Action impossible.')
    }
  }

  const handleDownload = async (file) => {
    if (!canDownload(file.source_type)) { showToast('Ce fichier ne peut pas être téléchargé directement.'); return }
    try {
      const bytes = await downloadFile(file)
      const { contentType } = sourceConfig(file.source_type)
      const blob = new Blob([bytes], { type: contentType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] téléchargement échoué', e)
      showToast('Le téléchargement a échoué.')
    }
  }

  // Clic sur un fichier : ouvrir, aperçu ou télécharger selon le réglage.
  const handleFileClick = (file) => {
    if (clickActionPref === 'preview' && allowDownload && canDownload(file.source_type)) { setQuickLookFile(file); return }
    if (clickActionPref === 'download' && allowDownload && canDownload(file.source_type)) { handleDownload(file); return }
    if (onOpenFile) onOpenFile(file)
  }

  // — Téléversement —
  const onUploadChange = async (e) => {
    const list = e.target.files
    e.target.value = ''
    if (!list || list.length === 0) return
    setBusy(true)
    let uploaded = 0
    let skipped = 0
    let failed = 0
    for (const file of list) {
      const dest = sourceType || sourceForExt(file.name) || (defaultUploadPref !== 'auto' ? defaultUploadPref : null)
      if (!dest) { skipped++; continue }
      try {
        const buf = await file.arrayBuffer()
        await uploadNewFile({ sourceType: dest, name: file.name, bytes: new Uint8Array(buf), folderId })
        uploaded++
      } catch (err) {
        if (import.meta.env.DEV) console.error('[cloudbrowser] téléversement échoué', file.name, err)
        failed++
      }
    }
    setBusy(false)
    notify()
    refreshUsage()
    await load()
    const parts = []
    if (uploaded) parts.push(`${uploaded} téléversé${uploaded > 1 ? 's' : ''}`)
    if (skipped) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''} (type non pris en charge)`)
    if (failed) parts.push(`${failed} en échec`)
    showToast(parts.join(' · ') || 'Aucun fichier téléversé.')
  }

  // — Glisser-déposer —
  const onDragStart = (e, kind, item) => {
    setDragging({ kind, id: item.id, name: item.name, source_type: item.source_type })
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', `${kind}:${item.id}`) } catch {}
  }
  const onDragEnd = () => { setDragging(null); setDropFolderId(null); setDropFileId(null); setDropRoot(false) }

  const moveDraggedTo = async (folderTargetId, label) => {
    const item = dragging
    setDragging(null); setDropFolderId(null); setDropRoot(false)
    if (!item) return
    if (item.kind === 'folder' && item.id === folderTargetId) return
    setBusy(true)
    try {
      if (item.kind === 'file') await moveFile({ id: item.id, source_type: item.source_type }, folderTargetId)
      else await moveFolder(item.id, folderTargetId)
      notify()
      await load()
      showToast(`« ${item.name} » déplacé ${label}.`)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[cloudbrowser] déplacement échoué', err)
      showToast(err?.message || 'Déplacement impossible.')
    } finally {
      setBusy(false)
    }
  }

  const onFolderDragOver = (e, folder) => {
    if (!dragging) return
    if (dragging.kind === 'folder' && dragging.id === folder.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropFolderId !== folder.id) setDropFolderId(folder.id)
  }
  const onFolderDragLeave = (e, folder) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropFolderId((prev) => (prev === folder.id ? null : prev))
  }
  const onFolderDrop = (e, folder) => {
    e.preventDefault(); e.stopPropagation()
    moveDraggedTo(folder.id, `dans « ${folder.name} »`)
  }

  const onRootDragOver = (e) => {
    if (!dragging || folderId === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dropRoot) setDropRoot(true)
  }
  const onRootDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropRoot(false)
  }
  const onRootDrop = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (folderId === null) { setDropRoot(false); return }
    moveDraggedTo(null, 'à la racine')
  }

  // Réordre manuel : déposer un fichier sur un autre fichier.
  const onFileDragOver = (e, file) => {
    if (!dragging || dragging.kind !== 'file' || dragging.id === file.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropFileId !== file.id) setDropFileId(file.id)
  }
  const onFileDragLeave = (e, file) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropFileId((prev) => (prev === file.id ? null : prev))
  }
  const onFileDrop = (e, file) => {
    e.preventDefault(); e.stopPropagation()
    const item = dragging
    setDragging(null); setDropFileId(null)
    if (!item || item.kind !== 'file' || item.id === file.id) return
    setFiles((prev) => {
      const arr = [...prev]
      const from = arr.findIndex((f) => f.id === item.id)
      const to = arr.findIndex((f) => f.id === file.id)
      if (from < 0 || to < 0) return prev
      const [moved] = arr.splice(from, 1)
      const insertAt = from < to ? to - 1 : to
      arr.splice(insertAt, 0, moved)
      const orders = readOrders()
      orders[scopeKey(sourceType, folderId)] = arr.map((f) => f.id)
      writeOrders(orders)
      return arr
    })
    if (sortMode !== 'manual') { setSortMode('manual'); writeSortMode('manual') }
    showToast('Ordre mis à jour.')
  }

  const isEmpty = !loading && !error && visibleFolders.length === 0 && visibleFiles.length === 0
  const dialogTitle = dialog?.type === 'new-folder' ? 'Nouveau dossier'
    : dialog?.type === 'rename-folder' ? 'Renommer le dossier'
    : 'Renommer le fichier'
  const usedRatio = usage ? Math.min(1, (usage.totalBytes || 0) / QUOTA_BYTES) : 0
  const quotaFillStyle = { width: `${Math.round(usedRatio * 100)}%` }
  const quotaFillClass = usedRatio >= 0.8 ? ' is-warn' : usedRatio >= 0.5 ? ' is-mid' : ''

  return (
    <div className={`cloudbrowser${compact ? ' cloudbrowser--compact' : ''}${densityPref === 'compact' ? ' cloudbrowser--dense' : ''}${layoutPref === 'grid' ? ' cloudbrowser--grid' : ''}${colApp === 'false' ? ' cloudbrowser--hide-app' : ''}${colType === 'false' ? ' cloudbrowser--hide-type' : ''}${colDate === 'false' ? ' cloudbrowser--hide-date' : ''}${colSize === 'false' ? ' cloudbrowser--hide-size' : ''}`}>
      <div className="cloudbrowser__toolbar">
        <nav className="cloudbrowser__crumbs" aria-label="Fil d'Ariane">
          <button
            type="button"
            className={`cloudbrowser__crumb${dropRoot ? ' is-drop' : ''}`}
            onClick={goRoot}
            onDragOver={onRootDragOver}
            onDragLeave={onRootDragLeave}
            onDrop={onRootDrop}
            disabled={folderId === null && !dropRoot}
          >
            {sourceType ? (SOURCE_LABEL[sourceType] || 'Cloud') : 'JacSuite Cloud'}
          </button>
          {path.map((c) => (
            <span key={c.id} className="cloudbrowser__crumb-wrap">
              <span className="cloudbrowser__crumb-sep" aria-hidden="true"><Icon name="chevron" size={14} /></span>
              <button type="button" className="cloudbrowser__crumb" onClick={() => goCrumb(c.id)} disabled={c.id === folderId}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="cloudbrowser__actions">
          <label className="cloudbrowser__search">
            <span className="cloudbrowser__search-icon" aria-hidden="true"><Icon name="search" size={15} /></span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher dans ce dossier"
            />
          </label>
          <div className="cloudbrowser__sort">
            <button type="button" className="cloudbrowser__btn" onClick={() => setSortMenuOpen((v) => !v)} title={`Trier — ${SORT_LABELS[sortMode]}`}>
              <Icon name="sort" size={16} /> Trier
            </button>
            {sortMenuOpen && (
              <>
                <div className="cloudbrowser__menu-backdrop" onClick={() => setSortMenuOpen(false)} />
                <div className="cloudbrowser__sort-menu" role="menu">
                  {VALID_SORT_MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortMode === m}
                      className={`cloudbrowser__sort-option${sortMode === m ? ' is-active' : ''}`}
                      onClick={() => { setSortMode(m); writeSortMode(m); setSortMenuOpen(false) }}
                    >
                      <span className="cloudbrowser__sort-check" aria-hidden="true">{sortMode === m ? '✓' : ''}</span>
                      {SORT_LABELS[m]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <input ref={fileInputRef} type="file" multiple style={HIDDEN_INPUT} onChange={onUploadChange} />
          <button type="button" className="cloudbrowser__btn" onClick={openNewFolder} disabled={busy}>
            <Icon name="folder-plus" size={16} /> Dossier
          </button>
          <button type="button" className="cloudbrowser__btn cloudbrowser__btn--primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <Icon name="upload" size={16} /> Téléverser
          </button>
        </div>
      </div>

      {loading && <div className="cloudbrowser__state">Chargement…</div>}
      {error && <div className="cloudbrowser__state cloudbrowser__state--error">{error}</div>}
      {isEmpty && (
        <div className="cloudbrowser__state">
          {search.trim()
            ? 'Aucun résultat pour cette recherche.'
            : (emptyHint || 'Ce dossier est vide. Crée un dossier ou téléverse un fichier.')}
        </div>
      )}

      {!loading && !error && visibleFolders.length > 0 && (
        <section className="cloudbrowser__section">
          <div className="cloudbrowser__section-head">Dossiers</div>
          <div className="cloudbrowser__folders">
            {visibleFolders.map((f) => (
              <div
                key={f.id}
                className={`cloudbrowser__folder${dragging?.kind === 'folder' && dragging.id === f.id ? ' is-dragging' : ''}${dropFolderId === f.id ? ' is-drop' : ''}`}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => onDragStart(e, 'folder', f)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => onFolderDragOver(e, f)}
                onDragLeave={(e) => onFolderDragLeave(e, f)}
                onDrop={(e) => onFolderDrop(e, f)}
                onClick={() => openFolder(f)}
                onKeyDown={(e) => { if (e.key === 'Enter') openFolder(f) }}
                title={f.name}
              >
                <span className="cloudbrowser__folder-icon" aria-hidden="true"><Icon name="folder" size={20} /></span>
                <span className="cloudbrowser__folder-name">{f.name}</span>
                <RowMenu actions={[
                  { label: 'Renommer', icon: 'pencil', onClick: () => openRename('folder', f) },
                  { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => setRemoveTarget({ kind: 'folder', item: f }) },
                ]} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && visibleFiles.length > 0 && (
        <section className="cloudbrowser__section">
          <div className="cloudbrowser__section-head">Fichiers</div>
          <ul className="cloudbrowser__files">
            <li className="cloudbrowser__file cloudbrowser__file--head" aria-hidden="true">
              <span className="cloudbrowser__file-icon" />
              <span className="cloudbrowser__file-name">Nom du fichier</span>
              <span className="cloudbrowser__file-app">App</span>
              <span className="cloudbrowser__file-type">Type</span>
              <span className="cloudbrowser__file-date">Date de modification</span>
              <span className="cloudbrowser__file-size">Taille</span>
              <span className="cloudbrowser__file-headstar" />
              <span className="cloudbrowser__file-headmenu" />
            </li>
            {visibleFiles.map((f) => {
              const openable = !!onOpenFile
              const actions = []
              actions.push({ label: f.is_starred ? "Retirer l'étoile" : "Marquer d'une étoile", icon: 'star', onClick: () => toggleStar(f) })
              if (allowDownload && canDownload(f.source_type)) actions.push({ label: 'Aperçu rapide', icon: 'eye', onClick: () => setQuickLookFile(f) })
              actions.push({ label: 'Renommer', icon: 'pencil', onClick: () => openRename('file', f) })
              if (allowDownload && canDownload(f.source_type)) actions.push({ label: 'Télécharger', icon: 'download', onClick: () => handleDownload(f) })
              actions.push({ label: 'Supprimer', icon: 'trash', danger: true, onClick: () => (confirmDeletePref === 'false' ? quickTrashFile(f) : setRemoveTarget({ kind: 'file', item: f })) })
              return (
                <li
                  key={f.id}
                  className={`cloudbrowser__file${openable ? ' is-openable' : ''}${dragging?.kind === 'file' && dragging.id === f.id ? ' is-dragging' : ''}${dropFileId === f.id ? ' is-drop-reorder' : ''}`}
                  role={openable ? 'button' : undefined}
                  tabIndex={openable ? 0 : undefined}
                  draggable
                  onDragStart={(e) => onDragStart(e, 'file', f)}
                  onDragEnd={onDragEnd}
                  onDragOver={(e) => onFileDragOver(e, f)}
                  onDragLeave={(e) => onFileDragLeave(e, f)}
                  onDrop={(e) => onFileDrop(e, f)}
                  onClick={openable ? () => handleFileClick(f) : undefined}
                  onKeyDown={openable ? (e) => { if (e.key === 'Enter') handleFileClick(f) } : undefined}
                  title={f.name}
                >
                  <span className="cloudbrowser__file-icon" aria-hidden="true"><Icon name="file" size={16} /></span>
                  <span className="cloudbrowser__file-name">{f.name}</span>
                  {f.isShared && <span className="cloudbrowser__file-badge">Partagé</span>}
                  <span className="cloudbrowser__file-app">{SOURCE_LABEL[f.source_type] || '—'}</span>
                  <span className="cloudbrowser__file-type">{fileTypeLabel(f)}</span>
                  <span className="cloudbrowser__file-date">{fmtDate(f.modified_at)}</span>
                  <span
                    className={`cloudbrowser__file-size${f.size_estimated ? ' cloudbrowser__file-size--est' : ''}`}
                    title={f.size_estimated ? 'Taille estimée (contenu en base, sans fichier)' : undefined}
                  >
                    {f.size_estimated && f.size_bytes != null ? '~' : ''}{formatBytes(f.size_bytes)}
                  </span>
                  <button
                    type="button"
                    className={`cloudbrowser__file-star${f.is_starred ? ' is-starred' : ''}`}
                    title={f.is_starred ? 'Retirer des favoris' : "Marquer d'une étoile"}
                    aria-pressed={f.is_starred}
                    onClick={(e) => { e.stopPropagation(); toggleStar(f) }}
                  >
                    <Icon name="star" size={15} filled={f.is_starred} />
                  </button>
                  <RowMenu actions={actions} />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!loading && !error && (
        <div className="cloudbrowser__footer">
          <span className="cloudbrowser__footer-count">
            {visibleFiles.length} fichier{visibleFiles.length > 1 ? 's' : ''}
            {visibleFolders.length > 0 ? ` · ${visibleFolders.length} dossier${visibleFolders.length > 1 ? 's' : ''}` : ''}
          </span>
          <div className="cloudbrowser__quota" title="Stockage cloud utilisé">
            <div className="cloudbrowser__quota-bar">
              <div className={`cloudbrowser__quota-fill${quotaFillClass}`} style={quotaFillStyle} />
            </div>
            <span className="cloudbrowser__quota-text">{formatBytes(usage?.totalBytes || 0)} / {formatBytes(QUOTA_BYTES)}</span>
          </div>
        </div>
      )}

      {dialog && (
        <div className="cloudbrowser__dialog-backdrop" onClick={() => { if (!busy) setDialog(null) }}>
          <div className="cloudbrowser__dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="cloudbrowser__dialog-title">{dialogTitle}</h2>
            <input
              className="cloudbrowser__dialog-input"
              type="text"
              placeholder="Nom"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && dialogValue.trim()) confirmDialog() }}
              autoFocus
            />
            {dialogError && <div className="cloudbrowser__dialog-error">{dialogError}</div>}
            <div className="cloudbrowser__dialog-actions">
              <button type="button" className="cloudbrowser__dialog-btn" onClick={() => setDialog(null)} disabled={busy}>Annuler</button>
              <button type="button" className="cloudbrowser__dialog-btn cloudbrowser__dialog-btn--primary" onClick={confirmDialog} disabled={busy || !dialogValue.trim()}>
                {busy ? '…' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeTarget && (
        <div className="cloudbrowser__dialog-backdrop" onClick={() => { if (!busy) setRemoveTarget(null) }}>
          <div className="cloudbrowser__dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="cloudbrowser__dialog-title">{removeTarget.kind === 'file' ? 'Supprimer le fichier' : 'Supprimer le dossier'}</h2>
            <p className="cloudbrowser__dialog-text">
              {removeTarget.kind === 'file'
                ? `Déplacer « ${removeTarget.item.name} » vers la corbeille ? Tu pourras le restaurer depuis JacSuite Cloud.`
                : `Supprimer « ${removeTarget.item.name} » ? Cette action est définitive.`}
            </p>
            <div className="cloudbrowser__dialog-actions">
              <button type="button" className="cloudbrowser__dialog-btn" onClick={() => setRemoveTarget(null)} disabled={busy}>Annuler</button>
              <button type="button" className="cloudbrowser__dialog-btn cloudbrowser__dialog-btn--danger" onClick={confirmRemove} disabled={busy}>
                {busy ? '…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickLookFile && (
        <QuickLook
          file={quickLookFile}
          onClose={() => setQuickLookFile(null)}
          onOpen={onOpenFile ? () => { const f = quickLookFile; setQuickLookFile(null); onOpenFile(f) } : null}
          onPrev={() => setQuickLookFile(visibleFiles[qlIndex - 1])}
          onNext={() => setQuickLookFile(visibleFiles[qlIndex + 1])}
          hasPrev={qlHasPrev}
          hasNext={qlHasNext}
        />
      )}

      {toast && <div className="cloudbrowser__toast" role="status">{toast}</div>}
    </div>
  )
}