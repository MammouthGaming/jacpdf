import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useJacpdfCloud } from "@/apps/jacpdf/hooks/cloud/useJacpdfCloud"
import { getCloudSettings, subscribeCloudSettings } from "@/apps/jacpdf/lib/cloud/cloudSettings"
import JacpdfCloudQuickLook from '@/apps/jacpdf/components/cloud/JacpdfCloudQuickLook'
import NewPdfModal from '@/apps/jacpdf/components/modals/document/NewPdfModal'
import './DriveFilePicker.css'
import './JacpdfCloudFilePicker.css'

// Système d'unités pour l'affichage des tailles. Cf. Paramètres > Cloud >
// Unités d'affichage. 'fr' = octets (Ko/Mo/Go) ; 'en' = bytes (KB/MB/GB).
function formatBytes(b, sys = 'fr') {
  const isFr = sys !== 'en'
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

// ─── Ordre manuel des fichiers (drag-to-reorder) ───
// Persistance localStorage par dossier (clé "__root__" pour la racine).
// Pas en DB pour l'instant : ordre local à l'appareil. Si on veut une
// synchro cross-device, ajouter une colonne `sort_order INT` sur `documents`
// + migrer la persistance vers Supabase (la logique d'application reste
// identique : on tri par sort_order ASC en fallback last_opened_at DESC).
const ORDER_KEY = 'jacpdf_cloud_file_order_v1'
const folderKey = (id) => (id === null ? '__root__' : id)

function readFileOrders() {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function writeFileOrders(orders) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(orders)) } catch {}
}

function applyManualOrder(filesArr, currentFolderId) {
  const orders = readFileOrders()
  const order = orders[folderKey(currentFolderId)]
  if (!Array.isArray(order) || order.length === 0) return filesArr
  const idIndex = new Map(order.map((id, i) => [id, i]))
  return [...filesArr].sort((a, b) => {
    const ai = idIndex.has(a.id) ? idIndex.get(a.id) : Infinity
    const bi = idIndex.has(b.id) ? idIndex.get(b.id) : Infinity
    if (ai !== bi) return ai - bi
    return new Date(b.last_opened_at || 0).getTime() - new Date(a.last_opened_at || 0).getTime()
  })
}

// ─── Mode de tri (bouton « Trier » dans la toolbar) ───
// Persistance localStorage globale (pas par dossier — l'utilisateur choisit
// un mode et on l'applique partout). Mode 'manual' = ordre custom du
// drag-and-drop (lit jacpdf_cloud_file_order_v1).
const SORT_KEY = 'jacpdf_cloud_sort_mode_v1'
const VALID_SORT_MODES = ['manual', 'recent', 'oldest', 'name_asc', 'name_desc', 'size_desc', 'size_asc']
const SORT_LABELS = {
  manual:    'Manuel (glisser-déposer)',
  recent:    'Plus récent',
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

function applySort(filesArr, mode, currentFolderId) {
  if (!filesArr || filesArr.length === 0) return filesArr
  if (mode === 'manual') return applyManualOrder(filesArr, currentFolderId)
  const arr = [...filesArr]
  switch (mode) {
    case 'recent':
      return arr.sort((a, b) => new Date(b.last_opened_at || 0).getTime() - new Date(a.last_opened_at || 0).getTime())
    case 'oldest':
      return arr.sort((a, b) => new Date(a.last_opened_at || 0).getTime() - new Date(b.last_opened_at || 0).getTime())
    case 'name_asc':
      return arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'))
    case 'name_desc':
      return arr.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'fr'))
    case 'size_desc':
      return arr.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
    case 'size_asc':
      return arr.sort((a, b) => (a.size_bytes || 0) - (b.size_bytes || 0))
    default: return arr
  }
}

// Sections du picker (segmented sous le header) — comme JacDoc.
const VIEW_LABELS = {
  mine: 'Mes PDFs',
  shared: 'Partagés',
  recent: 'Récents',
}

export default function JacpdfCloudFilePicker({ open, onClose, onSelect, brandName = 'JacSuite Cloud' }) {
  const {
    connected, loading,
    list, openFile, saveFile,
    listFolders, createFolder, renameFolder, removeFolder, moveFolder,
    rename: renameFile, removeFile, moveFile,
    usage, quotaUsedRatio,
  } = useJacpdfCloud()
  const [files, setFiles] = useState(null)
  const [folders, setFolders] = useState([])
  const [viewMode, setViewMode] = useState('mine') // 'mine' | 'shared' | 'recent'
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [breadcrumb, setBreadcrumb] = useState([]) // [{id, name}, ...] sans la racine
  const [search, setSearch] = useState('')
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [pickingId, setPickingId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  // Menu contextuel : { x, y, kind: 'folder'|'file', target }
  const [contextMenu, setContextMenu] = useState(null)
  // Modals : kind permet de brancher selon fichier/dossier
  const [renamePrompt, setRenamePrompt] = useState(null) // { kind, target, value, error } | null
  const [createPrompt, setCreatePrompt] = useState(null) // { value, error } | null
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { kind, target } | null
  // Drag-and-drop
  const [draggingItem, setDraggingItem] = useState(null) // { kind, id, name } | null
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null)
  const [dropTargetFileId, setDropTargetFileId] = useState(null)
  const [dropTargetRoot, setDropTargetRoot] = useState(false)
  // Mode de tri (bouton « Trier »)
  const [sortMode, setSortMode] = useState(() => readSortMode())
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  // Bouton « + Ajouter » dans la toolbar : popup à 2 choix qui UPLOADENT
  // tous les deux le PDF dans JacPDF Cloud (dossier courant). Pas
  // d'ouverture automatique — le picker reste ouvert, la liste se
  // recharge pour afficher le nouveau fichier, et l'user peut ensuite
  // cliquer dessus pour l'ouvrir s'il le souhaite. Pure action d'upload.
  // - « Importer depuis l'ordinateur » → file input caché → saveFile()
  // - « Créer un nouveau document » → NewPdfModal → saveFile() avec les bytes
  //   générés. saveFile sans documentId délègue à uploadNewFile (row
  //   documents + blob Storage).
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [showNewPdfModal, setShowNewPdfModal] = useState(false)
  const fileInputRef = useRef(null)
  // Système d'unités pour l'affichage des tailles ('fr' = Ko/Mo/Go, 'en' = KB/MB/GB).
  // Lu depuis Paramètres > Cloud > Unités d'affichage, mis à jour en live via
  // subscribeCloudSettings (qui écoute l'event 'jacpdf_settingsChange').
  const [unitSystem, setUnitSystem] = useState(() => getCloudSettings().byteUnitSystem || 'fr')
  useEffect(() => subscribeCloudSettings((s) => setUnitSystem(s.byteUnitSystem || 'fr')), [])
  // ─── Sélection clavier + Quick Look (Espace) ───
  // selectedKey : élément actuellement « surligné » par le clavier dans la liste
  // (folders puis files). Format : 'folder-<id>' ou 'file-<id>'.
  const [selectedKey, setSelectedKey] = useState(null)
  // quickLookFile : fichier dont l'aperçu rapide est ouvert (overlay style macOS).
  // null = pas d'aperçu.
  const [quickLookFile, setQuickLookFile] = useState(null)

  // Charge dossiers + fichiers du dossier courant à l'ouverture / changement de dossier
  useEffect(() => {
    if (!open || !connected) return
    let cancelled = false
    setLoadingFiles(true)
    setError(null)
    const loadFolders = viewMode === 'mine'
      ? listFolders({ parentId: currentFolderId })
      : Promise.resolve([])
    const loadFiles = viewMode === 'mine'
      ? list({ folderId: currentFolderId })
      : list({}) // shared/recent : tous les fichiers, toutes les arbos
    Promise.all([loadFolders, loadFiles]).then(
      ([fs, fls]) => {
        if (cancelled) return
        setFolders(fs)
        setFiles(fls)
      },
      (err) => { if (!cancelled) setError(err) },
    ).finally(() => { if (!cancelled) setLoadingFiles(false) })
    return () => { cancelled = true }
  }, [open, connected, currentFolderId, viewMode, list, listFolders])

  // Reset au close (on revient à la racine au prochain open)
  // ⚠️ Important : reset AUSSI showNewPdfModal et addMenuOpen. Le picker
  // n'est pas démonté quand open=false (juste rendu null par le early
  // return), donc tous les states persistent. Si l'user a ouvert NewPdfModal
  // depuis le picker puis fermé le picker via clic overlay (sans fermer
  // NewPdfModal), à la réouverture suivante NewPdfModal s'ouvrirait
  // immédiatement — d'où ce reset explicite.
  useEffect(() => {
    if (!open) {
      setSearch('')
      setViewMode('mine')
      setPickingId(null)
      setError(null)
      setNotice(null)
      setCurrentFolderId(null)
      setBreadcrumb([])
      setFolders([])
      setFiles(null)
      setDraggingItem(null)
      setDropTargetFolderId(null)
      setDropTargetFileId(null)
      setDropTargetRoot(false)
      setSortMenuOpen(false)
      setAddMenuOpen(false)
      setShowNewPdfModal(false)
      setSelectedKey(null)
    }
  }, [open])

  // Filtrage client — instantané puisqu'on a déjà folders + files
  const filteredFolders = useMemo(() => {
    if (!folders || viewMode !== 'mine') return []
    if (!search.trim()) return folders
    const q = search.toLowerCase()
    return folders.filter(f => f.name.toLowerCase().includes(q))
  }, [folders, search, viewMode])

  const filteredFiles = useMemo(() => {
    if (!files) return []
    let arr = files
    // Sections : Mes PDFs = non partagés du dossier courant ; Partagés =
    // fichiers partagés avec moi ; Récents = tout, trié par dernière ouverture.
    if (viewMode === 'mine') arr = arr.filter(f => !f.isShared)
    else if (viewMode === 'shared') arr = arr.filter(f => f.isShared)
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(f => f.name.toLowerCase().includes(q))
    }
    if (viewMode === 'recent') {
      return [...arr]
        .sort((a, b) => new Date(b.last_opened_at || 0).getTime() - new Date(a.last_opened_at || 0).getTime())
        .slice(0, 30)
    }
    return applySort(arr, sortMode, currentFolderId)
  }, [files, search, sortMode, currentFolderId, viewMode])

  // ─── Cleanup de la sélection si l'item courant disparaît ───
  // Pas d'auto-sélection : aucun fichier n'est sélectionné par défaut à
  // l'ouverture du picker. L'user clique sur un PDF pour le sélectionner,
  // clique dans la zone vide de la liste (à côté d'un fichier) pour
  // désélectionner — pattern Finder macOS. Ce useEffect ne fait que
  // nettoyer la sélection si l'item courant disparaît (filtre, changement
  // de dossier, delete) ; on retombe à null, pas sur le 1er item.
  useEffect(() => {
    const items = [
      ...filteredFolders.map(f => `folder-${f.id}`),
      ...filteredFiles.map(f => `file-${f.id}`),
    ]
    if (!items.length) { setSelectedKey(null); return }
    if (selectedKey && !items.includes(selectedKey)) setSelectedKey(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredFolders, filteredFiles])

  // Index Quick Look dans la liste de fichiers (skip les dossiers) — utilisé
  // pour la nav Maj+←/→ entre fichiers sans fermer l'aperçu.
  const quickLookIndex = quickLookFile ? filteredFiles.findIndex(f => f.id === quickLookFile.id) : -1
  const hasPrevQuickLook = quickLookIndex > 0
  const hasNextQuickLook = quickLookIndex >= 0 && quickLookIndex < filteredFiles.length - 1

  // Bouton « Nouveau dossier » : ouvre le modal custom (à la place de window.prompt).
  const handleCreateFolder = () => {
    setCreatePrompt({ value: '', error: null })
  }

  const closeCreatePrompt = () => setCreatePrompt(null)

  // Soumission du modal de création (Enter ou bouton « Créer »).
  const submitCreatePrompt = async (e) => {
    e.preventDefault()
    if (!createPrompt) return
    const trimmed = (createPrompt.value || '').trim()
    if (!trimmed) {
      setCreatePrompt(p => p && { ...p, error: 'Le nom ne peut pas être vide.' })
      return
    }
    try {
      const folder = await createFolder({ name: trimmed, parentId: currentFolderId })
      setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
      closeCreatePrompt()
      setNotice(`✅ Dossier « ${folder.name} » créé.`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      if (err?.details?.duplicateName) {
        setCreatePrompt(p => p && { ...p, error: `Un dossier nommé « ${trimmed} » existe déjà ici.` })
      } else {
        closeCreatePrompt()
        setError(err)
      }
    }
  }

  const switchViewMode = (nextMode) => {
    setViewMode(nextMode)
    setCurrentFolderId(null)
    setBreadcrumb([])
    setSearch('')
    setSelectedKey(null)
  }

  const enterFolder = (folder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumb(prev => [...prev, { id: folder.id, name: folder.name }])
    setSearch('')
  }

  const navigateBreadcrumb = (index) => {
    // index === -1 => racine, sinon index dans `breadcrumb`
    if (index === -1) {
      setCurrentFolderId(null)
      setBreadcrumb([])
    } else {
      setCurrentFolderId(breadcrumb[index].id)
      setBreadcrumb(prev => prev.slice(0, index + 1))
    }
    setSearch('')
  }

  // ─── Menu contextuel (click droit — fichier ou dossier) ───
  const openContextMenu = (e, target, kind) => {
    e.preventDefault()
    e.stopPropagation()
    const menuW = 200
    const menuH = 130
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
    setContextMenu({ x, y, kind, target })
  }

  const closeContextMenu = () => setContextMenu(null)

  // Fermeture sur click extérieur ou Escape
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

  // Sort menu : ferme sur click extérieur ou Escape
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

  // Add menu : ferme sur click extérieur ou Escape (même pattern que le tri)
  useEffect(() => {
    if (!addMenuOpen) return
    const onDown = () => setAddMenuOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') setAddMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [addMenuOpen])

  // Escape ferme tout modal ouvert (rename / create / delete)
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

  // ─── Navigation clavier dans la liste + Quick Look (Espace) ───
  // Désactivé si une sous-modal est ouverte (rename/create/delete/contextmenu)
  // ou si Quick Look est déjà ouvert (le composant gère ses propres touches).
  useEffect(() => {
    if (!open || !connected) return
    if (quickLookFile || contextMenu || renamePrompt || createPrompt || deleteConfirm) return
    const items = [
      ...filteredFolders.map(f => ({ key: `folder-${f.id}`, kind: 'folder', item: f })),
      ...filteredFiles.map(f => ({ key: `file-${f.id}`, kind: 'file', item: f })),
    ]
    const onKey = (e) => {
      const t = e.target
      const inInput = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return
        e.preventDefault()
        const cur = items.findIndex(it => it.key === selectedKey)
        let next
        if (cur === -1) next = e.key === 'ArrowDown' ? 0 : items.length - 1
        else if (e.key === 'ArrowDown') next = Math.min(items.length - 1, cur + 1)
        else next = Math.max(0, cur - 1)
        setSelectedKey(items[next].key)
        return
      }

      if (e.key === ' ' || e.code === 'Space') {
        // Dans la search bar : laisser la touche taper un espace normalement.
        if (inInput) return
        const sel = items.find(it => it.key === selectedKey)
        if (sel?.kind === 'file') {
          e.preventDefault()
          setQuickLookFile(sel.item)
        }
        return
      }

      if (e.key === 'Enter' && !inInput) {
        const sel = items.find(it => it.key === selectedKey)
        if (sel?.kind === 'folder') { e.preventDefault(); enterFolder(sel.item) }
        else if (sel?.kind === 'file') { e.preventDefault(); handlePick(sel.item) }
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connected, filteredFolders, filteredFiles, selectedKey, quickLookFile, contextMenu, renamePrompt, createPrompt, deleteConfirm])

  // Scroll automatique de l'item sélectionné dans le viewport de la liste
  // (pour que la nav Up/Down ne perde pas l'item courant hors écran).
  useEffect(() => {
    if (!selectedKey) return
    const el = document.querySelector(`[data-jpc-key="${selectedKey}"]`)
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }, [selectedKey])

  // Refetch dossiers + fichiers du dossier courant (utilisé après rename/delete).
  const reload = async () => {
    if (!connected) return
    setLoadingFiles(true)
    setError(null)
    try {
      const [fs, fls] = await Promise.all([
        viewMode === 'mine' ? listFolders({ parentId: currentFolderId }) : Promise.resolve([]),
        viewMode === 'mine' ? list({ folderId: currentFolderId }) : list({}),
      ])
      setFolders(fs)
      setFiles(fls)
    } catch (err) {
      setError(err)
    } finally {
      setLoadingFiles(false)
    }
  }

  // Click droit > « Renommer » (fichier ou dossier).
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
      setRenamePrompt(p => p && { ...p, error: 'Le nom ne peut pas être vide.' })
      return
    }
    if (trimmed === target.name) {
      closeRenamePrompt()
      return
    }
    try {
      if (kind === 'folder') {
        await renameFolder(target.id, trimmed)
        setBreadcrumb(prev => prev.map(b => b.id === target.id ? { ...b, name: trimmed } : b))
      } else {
        await renameFile(target.id, trimmed)
      }
      closeRenamePrompt()
      await reload()
      setNotice(`✅ Renommé en « ${trimmed} ».`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      if (err?.details?.duplicateName) {
        setRenamePrompt(p => p && {
          ...p,
          error: `Un ${kind === 'folder' ? 'dossier' : 'fichier'} nommé « ${trimmed} » existe déjà ici.`,
        })
      } else {
        closeRenamePrompt()
        setError(err)
      }
    }
  }

  // Click droit > « Supprimer » (fichier ou dossier).
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
        await removeFolder(target.id)
        const wasInsideOrAncestor =
          currentFolderId === target.id || breadcrumb.some(b => b.id === target.id)
        closeDeleteConfirm()
        if (wasInsideOrAncestor) {
          setCurrentFolderId(null)
          setBreadcrumb([])
        } else {
          await reload()
        }
        setNotice(`🗑 Dossier « ${target.name} » supprimé.`)
      } else {
        await removeFile(target.id)
        // Nettoie l'ordre manuel local pour ne pas garder un ID orphelin
        const orders = readFileOrders()
        const k = folderKey(currentFolderId)
        if (Array.isArray(orders[k])) {
          orders[k] = orders[k].filter(id => id !== target.id)
          writeFileOrders(orders)
        }
        closeDeleteConfirm()
        await reload()
        setNotice(`🗑 « ${target.name} » supprimé.`)
      }
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      closeDeleteConfirm()
      setError(err)
    }
  }

  // ─── Drag-and-drop ───
  const onItemDragStart = (e, kind, item) => {
    setDraggingItem({ kind, id: item.id, name: item.name })
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', `${kind}:${item.id}`) } catch {}
  }
  const onItemDragEnd = () => {
    setDraggingItem(null)
    setDropTargetFolderId(null)
    setDropTargetFileId(null)
    setDropTargetRoot(false)
  }

  // Drop sur un dossier (déplacement du fichier ou sous-dossier dedans)
  const onFolderDragOver = (e, folder) => {
    if (!draggingItem) return
    if (draggingItem.kind === 'folder' && draggingItem.id === folder.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTargetFolderId !== folder.id) setDropTargetFolderId(folder.id)
  }
  const onFolderDragLeave = (e, folder) => {
    // Évite le flicker quand on hover un enfant interne du <li>
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
      if (item.kind === 'file') {
        await moveFile(item.id, folder.id)
        // Retire le fichier de l'ordre manuel du dossier source
        const orders = readFileOrders()
        const k = folderKey(currentFolderId)
        if (Array.isArray(orders[k])) {
          orders[k] = orders[k].filter(id => id !== item.id)
          writeFileOrders(orders)
        }
      } else {
        await moveFolder(item.id, folder.id)
      }
      await reload()
      setNotice(`✅ « ${item.name} » déplacé dans « ${folder.name} ».`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err)
    }
  }

  // Drop sur le crumb « Racine » (sortie d'un sous-dossier vers la racine)
  const onRootDragOver = (e) => {
    if (!draggingItem) return
    if (currentFolderId === null) return // déjà à la racine
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
      if (item.kind === 'file') {
        await moveFile(item.id, null)
        const orders = readFileOrders()
        const k = folderKey(currentFolderId)
        if (Array.isArray(orders[k])) {
          orders[k] = orders[k].filter(id => id !== item.id)
          writeFileOrders(orders)
        }
      } else {
        await moveFolder(item.id, null)
      }
      await reload()
      setNotice(`✅ « ${item.name} » déplacé à la racine.`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err)
    }
  }

  // Drop sur un fichier (réordre manuel — sauvé en localStorage)
  const onFileDragOver = (e, file) => {
    if (!draggingItem || draggingItem.kind !== 'file') return
    if (draggingItem.id === file.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTargetFileId !== file.id) setDropTargetFileId(file.id)
  }
  const onFileDragLeave = (e, file) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDropTargetFileId(prev => prev === file.id ? null : prev)
  }
  const onFileDrop = (e, file) => {
    e.preventDefault()
    e.stopPropagation()
    const item = draggingItem
    setDraggingItem(null)
    setDropTargetFileId(null)
    if (!item || item.kind !== 'file' || item.id === file.id) return
    setFiles(prev => {
      if (!prev) return prev
      const arr = [...prev]
      const fromIdx = arr.findIndex(f => f.id === item.id)
      const toIdx = arr.findIndex(f => f.id === file.id)
      if (fromIdx < 0 || toIdx < 0) return prev
      const [moved] = arr.splice(fromIdx, 1)
      // Insert AVANT la cible. Si on dragged depuis au-dessus, l'index de la
      // cible a reculé d'un cran après splice() → toIdx - 1.
      const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx
      arr.splice(insertAt, 0, moved)
      const orders = readFileOrders()
      orders[folderKey(currentFolderId)] = arr.map(f => f.id)
      writeFileOrders(orders)
      return arr
    })
    // Le drag-reorder bascule automatiquement le tri en mode « Manuel »
    if (sortMode !== 'manual') {
      setSortMode('manual')
      writeSortMode('manual')
    }
    setNotice('↕ Ordre mis à jour.')
    setTimeout(() => setNotice(null), 1500)
  }

  const handlePick = async (file) => {
    if (pickingId) return // anti double-click
    setPickingId(file.id)
    try {
      const bytes = await openFile(file.id)
      onSelect?.({ documentId: file.id, name: file.name, bytes })
      onClose?.()
    } catch (err) {
      console.error('JacPDF Cloud pick error', err)
      setError(err)
      setPickingId(null)
    }
  }

  // ─── Bouton « + Ajouter » : 2 chemins ───
  // 1. « Ouvrir depuis l'ordinateur » → click programmé sur le file input
  //    caché. Le fichier choisi est lu en ArrayBuffer et passé tel quel à
  //    onSelect avec documentId: null (HomeContent.handleOpenFile bascule
  //    automatiquement sur source='local' quand documentId/driveFileId
  //    sont vides).
  // 2. « Créer un nouveau document » → mount NewPdfModal partagé (dossier
  //    modals/). Son onCreate (name, bytes) → onSelect avec documentId
  //    null aussi. Le PDF n'existe pas dans JacPDF Cloud avant qu'on
  //    l'exporte explicitement via le menu Exporter.
  const handleOpenFromComputer = () => {
    setAddMenuOpen(false)
    fileInputRef.current?.click()
  }

  const onLocalFileChosen = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setNotice(`⬆ Téléversement de « ${f.name} » vers ${brandName}…`)
      const buf = await f.arrayBuffer()
      const bytes = new Uint8Array(buf)
      // Upload dans le dossier courant (null = racine). saveFile sans
      // documentId → uploadNewFile : crée le row documents + le blob
      // Storage. Refresh auto de l'usage côté hook.
      await saveFile({ name: f.name, bytes, folderId: currentFolderId })
      // PAS d'ouverture automatique : on reste dans le picker. reload()
      // refetch la liste pour que le nouveau fichier apparaisse dans la
      // grille, l'user peut ensuite cliquer dessus pour l'ouvrir.
      await reload()
      setNotice(`✅ « ${f.name} » téléversé dans ${brandName}.`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setNotice(null)
      setError(err)
    }
  }

  const handleCreateNewPdf = () => {
    setAddMenuOpen(false)
    setShowNewPdfModal(true)
  }

  const onNewPdfCreated = async (name, bytes) => {
    setShowNewPdfModal(false)
    try {
      setNotice(`⬆ Téléversement de « ${name} » vers ${brandName}…`)
      // Upload dans le dossier courant (null = racine). Le PDF généré
      // par NewPdfModal est sauvegardé dans le cloud sans être ouvert :
      // on reste dans le picker pour que l'user voie le fichier
      // apparaître dans la liste.
      await saveFile({ name, bytes, folderId: currentFolderId })
      await reload()
      setNotice(`✅ « ${name} » téléversé dans ${brandName}.`)
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setNotice(null)
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
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="dfp-overlay" onClick={onClose}>
      <div
        className="dfp-modal jpc-modal"
        onClick={(e) => {
          e.stopPropagation()
          // Désélection auto : tout click dans le modal qui n'est PAS sur
          // un .jpc-item (row file ou folder) désélectionne. Les clicks
          // sur un item continuent de fonctionner normalement — leur
          // handler fire avant celui-ci dans le bubble phase, et
          // closest('.jpc-item') remonte à TRUE depuis le target.
          // Pattern Finder macOS « clic à côté → désélection ». Couvre
          // toute la zone : header, toolbar, breadcrumb, empty state,
          // zone vide de la liste, footer.
          if (!e.target.closest('.jpc-item')) setSelectedKey(null)
        }}
      >
        <div className="dfp-header">
          <h2 className="jpc-title">{brandName}</h2>
          <button className="dfp-close" onClick={onClose}>✕</button>
        </div>

        {/* Sections : Mes PDFs / Partagés / Récents (segmented sous le header) */}
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
            placeholder="Rechercher un PDF…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {viewMode === 'mine' && (
          <button
            type="button"
            className="jpc-new-folder-btn"
            onClick={handleCreateFolder}
            title="Créer un nouveau dossier"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            <span>Nouveau dossier</span>
          </button>
          )}
          <div className="jpc-sort-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`jpc-sort-btn${sortMenuOpen ? ' jpc-sort-btn-open' : ''}`}
              onClick={() => setSortMenuOpen(s => !s)}
              title={`Trier les fichiers — ${SORT_LABELS[sortMode]}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M6 12h12M10 18h4"/>
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
          <div className="jpc-add-wrap" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`jpc-add-btn${addMenuOpen ? ' jpc-add-btn-open' : ''}`}
              onClick={() => setAddMenuOpen(s => !s)}
              title="Ajouter un PDF — ouvrir depuis l'ordi ou créer un nouveau"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Ajouter</span>
            </button>
            {addMenuOpen && (
              <div className="jpc-add-menu">
                <button type="button" className="jpc-add-option" onClick={handleOpenFromComputer}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span>Importer depuis l'ordinateur</span>
                </button>
                <button type="button" className="jpc-add-option" onClick={handleCreateNewPdf}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <span>Créer un nouveau document</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Breadcrumb : Racine › Sous-dossier › Dossier courant ─────── */}
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

        {notice && (
          <div className="jpc-notice">
            {notice}
          </div>
        )}

        {error && (
          <div className="jpc-error">
            Erreur : {error.message}
          </div>
        )}

        {loadingFiles && (
          <div className="jpc-loading">Chargement de tes documents…</div>
        )}

        {!loadingFiles && filteredFolders.length === 0 && filteredFiles.length === 0 && (
          <div className="jpc-empty-state">
            {search.trim()
              ? 'Aucun résultat pour cette recherche.'
              : viewMode === 'shared'
                ? 'Aucun PDF partagé avec toi pour le moment.'
                : viewMode === 'recent'
                  ? 'Aucun PDF récent pour le moment.'
                  : (currentFolderId === null
                    ? <>Aucun PDF ni dossier dans ton cloud pour le moment.<br />Sauvegarde ton premier PDF via « Exporter » → « {brandName} », ou crée un dossier pour t'organiser.</>
                    : <>Ce dossier est vide.<br />Crée un sous-dossier ou sauvegarde un PDF ici.</>)}
          </div>
        )}

        {!loadingFiles && (filteredFolders.length > 0 || filteredFiles.length > 0) && (
          <ul className="jpc-list">
            {filteredFolders.map((folder) => (
              <li
                key={`folder-${folder.id}`}
                data-jpc-key={`folder-${folder.id}`}
                className={`jpc-item jpc-folder-item${draggingItem?.kind === 'folder' && draggingItem.id === folder.id ? ' jpc-item-dragging' : ''}${dropTargetFolderId === folder.id ? ' jpc-item-drop' : ''}${selectedKey === `folder-${folder.id}` ? ' jpc-item-selected' : ''}`}
                draggable
                onDragStart={(e) => onItemDragStart(e, 'folder', folder)}
                onDragEnd={onItemDragEnd}
                onDragOver={(e) => onFolderDragOver(e, folder)}
                onDragLeave={(e) => onFolderDragLeave(e, folder)}
                onDrop={(e) => onFolderDrop(e, folder)}
                onClick={() => {
                  // 1er click sélectionne, 2e click ouvre — comme dans le Finder macOS.
                  if (selectedKey === `folder-${folder.id}`) enterFolder(folder)
                  else setSelectedKey(`folder-${folder.id}`)
                }}
                onDoubleClick={() => enterFolder(folder)}
                onContextMenu={(e) => openContextMenu(e, folder, 'folder')}
                title="Click droit pour renommer ou supprimer · glisser pour déplacer"
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
                data-jpc-key={`file-${file.id}`}
                className={`jpc-item${pickingId === file.id ? ' jpc-item-loading' : ''}${draggingItem?.kind === 'file' && draggingItem.id === file.id ? ' jpc-item-dragging' : ''}${dropTargetFileId === file.id ? ' jpc-item-drop-reorder' : ''}${selectedKey === `file-${file.id}` ? ' jpc-item-selected' : ''}`}
                draggable
                onDragStart={(e) => onItemDragStart(e, 'file', file)}
                onDragEnd={onItemDragEnd}
                onDragOver={(e) => onFileDragOver(e, file)}
                onDragLeave={(e) => onFileDragLeave(e, file)}
                onDrop={(e) => onFileDrop(e, file)}
                onClick={() => {
                  // 1er click sélectionne, 2e click ouvre — comme dans le Finder macOS.
                  if (selectedKey === `file-${file.id}`) handlePick(file)
                  else setSelectedKey(`file-${file.id}`)
                }}
                onDoubleClick={() => handlePick(file)}
                onContextMenu={(e) => openContextMenu(e, file, 'file')}
                title={file.isShared
                  ? 'Fichier partagé avec toi · click droit pour ouvrir les options'
                  : 'Click droit pour renommer ou supprimer · glisser sur un dossier ou un autre fichier'}
              >
                <div className="jpc-item-icon" title={file.isShared ? 'Partagé avec toi' : undefined}>
                  {file.isShared ? '👥' : '📄'}
                </div>
                <div className="jpc-item-meta">
                  <div className="jpc-item-name">
                    {file.name}
                    {file.isShared && (
                      <span
                        style={ { marginLeft: 8, padding: '2px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', borderRadius: 4, background: 'rgba(57, 255, 20, 0.12)', color: '#39FF14', border: '1px solid rgba(57, 255, 20, 0.45)', verticalAlign: 'middle', textTransform: 'uppercase', flexShrink: 0 } }
                      >
                        Partagé
                      </span>
                    )}
                  </div>
                  <div className="jpc-item-info">
                    {formatBytes(file.size_bytes || 0, unitSystem)} · {formatDate(file.last_opened_at)}
                    {file.isShared && <span style={ { marginLeft: 6, opacity: 0.7 } }>· Partagé avec toi</span>}
                  </div>
                </div>
                {pickingId === file.id && (
                  <div className="jpc-item-spinner">…</div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ── Footer : quota plein-largeur ──────────────────────────── */}
        <div className="jpc-footer">
          <div className="jpc-footer-row">
            <span className="jpc-footer-label">Stockage utilisé</span>
            <span className="jpc-footer-usage">
              {formatBytes(usage.totalBytes, unitSystem)} / {formatBytes(1024 ** 3, unitSystem)}
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

        {/* ── Menu contextuel (click droit sur un dossier) ──────── */}
        {contextMenu && (
          <div
            className="jpc-context-menu"
            style={ { left: contextMenu.x, top: contextMenu.y } }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="jpc-context-header">{contextMenu.kind === 'folder' ? '📁 ' : '📄 '}{contextMenu.target.name}</div>
            <button type="button" className="jpc-context-item" onClick={handleRename}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
              </svg>
              <span>Renommer</span>
            </button>
            <button type="button" className="jpc-context-item jpc-context-item-danger" onClick={handleDelete}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
              </svg>
              <span>Supprimer</span>
            </button>
          </div>
        )}

        {/* ── Create folder modal (custom prompt à la place de window.prompt) ─ */}
        {createPrompt && (
          <div
            className="jpc-prompt-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeCreatePrompt() }}
          >
            <form
              className="jpc-prompt-modal"
              onMouseDown={(e) => e.stopPropagation()}
              onSubmit={submitCreatePrompt}
            >
              <h3 className="jpc-prompt-title">Nouveau dossier</h3>
              <input
                type="text"
                className="jpc-prompt-input"
                value={createPrompt.value}
                onChange={(e) => setCreatePrompt(p => p && { ...p, value: e.target.value, error: null })}
                autoFocus
                maxLength={120}
                placeholder="Nom du dossier"
              />
              {createPrompt.error && (
                <div className="jpc-prompt-error">{createPrompt.error}</div>
              )}
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={closeCreatePrompt}>
                  Annuler
                </button>
                <button type="submit" className="jpc-prompt-btn jpc-prompt-submit">
                  Créer
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Rename modal (custom prompt à la place de window.prompt) ─ */}
        {renamePrompt && (
          <div
            className="jpc-prompt-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeRenamePrompt() }}
          >
            <form
              className="jpc-prompt-modal"
              onMouseDown={(e) => e.stopPropagation()}
              onSubmit={submitRenamePrompt}
            >
              <h3 className="jpc-prompt-title">{renamePrompt.kind === 'folder' ? 'Renommer le dossier' : 'Renommer le fichier'}</h3>
              <input
                type="text"
                className="jpc-prompt-input"
                value={renamePrompt.value}
                onChange={(e) => setRenamePrompt(p => p && { ...p, value: e.target.value, error: null })}
                onFocus={(e) => e.target.select()}
                autoFocus
                maxLength={120}
              />
              {renamePrompt.error && (
                <div className="jpc-prompt-error">{renamePrompt.error}</div>
              )}
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={closeRenamePrompt}>
                  Annuler
                </button>
                <button type="submit" className="jpc-prompt-btn jpc-prompt-submit">
                  Renommer
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Delete folder confirm modal ──────────────── */}
        {deleteConfirm && (
          <div
            className="jpc-prompt-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeDeleteConfirm() }}
          >
            <div
              className="jpc-prompt-modal"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h3 className="jpc-prompt-title">{deleteConfirm.kind === 'folder' ? 'Supprimer ce dossier ?' : 'Supprimer ce fichier ?'}</h3>
              <p className="jpc-prompt-body">
                {deleteConfirm.kind === 'folder' ? (
                  <>Le dossier <strong>« {deleteConfirm.target.name} »</strong> sera supprimé. Les fichiers à l'intérieur retourneront à la racine. Les sous-dossiers seront aussi supprimés.</>
                ) : (
                  <>Le fichier <strong>« {deleteConfirm.target.name} »</strong> et toutes ses annotations seront supprimés définitivement. Cette action ne peut pas être annulée.</>
                )}
              </p>
              <div className="jpc-prompt-actions">
                <button type="button" className="jpc-prompt-btn jpc-prompt-cancel" onClick={closeDeleteConfirm}>
                  Annuler
                </button>
                <button type="button" className="jpc-prompt-btn jpc-prompt-danger" onClick={confirmDelete}>
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Quick Look (aperçu rapide style macOS) ────────────────── */}
        {quickLookFile && (
          <JacpdfCloudQuickLook
            file={quickLookFile}
            loadBytes={openFile}
            onClose={() => setQuickLookFile(null)}
            onOpen={() => {
              const f = quickLookFile
              setQuickLookFile(null)
              handlePick(f)
            }}
            onPrev={() => setQuickLookFile(filteredFiles[quickLookIndex - 1])}
            onNext={() => setQuickLookFile(filteredFiles[quickLookIndex + 1])}
            hasPrev={hasPrevQuickLook}
            hasNext={hasNextQuickLook}
          />
        )}

        {/* File input caché — cliqué programmatiquement par « Ouvrir depuis l'ordinateur ». */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={ { display: 'none' } }
          onChange={onLocalFileChosen}
        />
      </div>
    </div>

    {/* NewPdfModal porté sur document.body via createPortal — le picker
        JacPDF Cloud (.dfp-overlay) a un backdrop-filter qui crée un
        stacking context et un containing block qui peut emprisonner les
        position: fixed enfants. Le portal monte le DOM directement sur
        document.body, hors de toute contrainte d'ancestor, garantissant
        que le z-index 10001 du .npm-overlay le place au-dessus du picker.
        onCreate(name, bytes) repasse par onSelect avec documentId: null. */}
    {showNewPdfModal && createPortal(
      <NewPdfModal
        onCreate={onNewPdfCreated}
        onClose={() => setShowNewPdfModal(false)}
      />,
      document.body,
    )}
    </>
  )
}