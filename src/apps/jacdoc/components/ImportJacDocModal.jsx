import { useEffect, useRef, useState } from 'react'
import { importFile, detectFormat, ACCEPTED_EXTENSIONS } from '../utils/importers'
import './NewJacDocModal.css'

// Modale d'import JacDoc — remplace l'ancien « Nouveau document ».
// Permet d'importer n'importe quel fichier (PDF, DOCX, MD, HTML, TXT, image)
// pour en faire un nouveau document JacDoc. Le PDF est converti en images
// 1 page = 1 <img>, séparées par des sauts de page durs (comme JacPDF).
//
// Props :
//   onClose()                          → fermer (Esc, backdrop, Annuler).
//   onImport({ title, html })          → créer le doc côté parent. Le parent
//     est responsable de l'insertion en base + ouverture du doc.
//
// Le composant gère lui-même :
//   - File picker natif ET drag & drop sur la dropzone.
//   - Détection auto du format + parsing via utils/importers.
//   - Indicateur de progression pour les PDFs (peuvent prendre 10-30s).
//   - Gestion d'erreur affichée en bas du modal.
//   - Lock du scroll de fond + Esc pour fermer (sauf pendant le parsing).

const FORMAT_LABELS = {
  pdf:   '📕 PDF → 1 image par page',
  docx:  '📘 Word (.docx)',
  md:    '📝 Markdown',
  html:  '🌐 HTML',
  txt:   '📄 Texte brut',
  image: '🖼️ Image',
}

// Styles inline factorisés : on évite les litttéraux d'objets en JSX
// double-braced dans le fichier Notion (sinon le moteur de templating
// les confond avec des placeholders d'URL compressées).
const HIDDEN_INPUT_STYLE = { display: 'none' }
function buildProgressFillStyle(progress) {
  if (!progress) return { width: '0%' }
  return { width: ((progress.current / progress.total) * 100) + '%' }
}

export default function ImportJacDocModal({ onClose, onImport }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total } pour PDFs
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  // Esc + body scroll lock.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busy) onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [busy, onClose])

  const pickFile = () => {
    if (busy) return
    inputRef.current?.click()
  }

  const handleFileChosen = (chosen) => {
    if (!chosen) return
    setError(null)
    const format = detectFormat(chosen)
    if (format === 'unknown') {
      setError('Format non supporté : ' + (chosen.name || chosen.type))
      return
    }
    setFile(chosen)
  }

  // Drag & drop sur la dropzone.
  const onDragOver = (e) => {
    e.preventDefault()
    if (!busy) setDragging(true)
  }
  const onDragLeave = (e) => {
    e.preventDefault()
    setDragging(false)
  }
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const dropped = e.dataTransfer?.files?.[0]
    if (dropped) handleFileChosen(dropped)
  }

  // Mousedown sur backdrop : ferme si pas busy.
  const downOnBackdropRef = useRef(false)

  const submit = async (e) => {
    e?.preventDefault?.()
    if (busy || !file) return
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const result = await importFile(file, (current, total) => {
        setProgress({ current, total })
      })
      await onImport?.(result)
      // Le parent ferme le modal après succès.
    } catch (err) {
      setBusy(false)
      setProgress(null)
      setError(err?.message || 'Erreur pendant l\'import du fichier.')
      if (typeof console !== 'undefined') {
        console.error('[ImportJacDocModal] import failed', err)
      }
    }
  }

  const formatLabel = file ? (FORMAT_LABELS[detectFormat(file)] || '📄 Fichier') : null
  const fileSizeKb = file ? Math.round(file.size / 1024) : 0
  const fileSizeLabel = fileSizeKb > 1024
    ? (fileSizeKb / 1024).toFixed(1) + ' Mo'
    : fileSizeKb + ' ko'

  return (
    <div
      className="jacdoc-modal-backdrop"
      onMouseDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (downOnBackdropRef.current && e.target === e.currentTarget && !busy) {
          onClose?.()
        }
        downOnBackdropRef.current = false
      }}
    >
      <form
        className="jacdoc-modal jacdoc-modal-import"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jacdoc-import-modal-title"
      >
        <header className="jacdoc-modal-header">
          <div className="jacdoc-modal-icon" aria-hidden="true">📥</div>
          <div className="jacdoc-modal-titles">
            <h2 id="jacdoc-import-modal-title">Importer un document</h2>
            <p>PDF, Word, Markdown, HTML, texte ou image — tout devient éditable.</p>
          </div>
          <button
            type="button"
            className="jacdoc-modal-close"
            onClick={() => !busy && onClose?.()}
            title="Fermer"
            aria-label="Fermer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div className="jacdoc-modal-body">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            style={HIDDEN_INPUT_STYLE}
            onChange={(e) => handleFileChosen(e.target.files?.[0])}
          />

          {/* Dropzone : zone cliquable + drop target. */}
          <div
            className={
              'jacdoc-import-dropzone' +
              (dragging ? ' is-dragging' : '') +
              (file ? ' has-file' : '') +
              (busy ? ' is-busy' : '')
            }
            onClick={pickFile}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="button"
            tabIndex={busy ? -1 : 0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                e.preventDefault()
                pickFile()
              }
            }}
          >
            {file ? (
              <div className="jacdoc-import-file-card">
                <div className="jacdoc-import-file-icon">{formatLabel?.split(' ')[0]}</div>
                <div className="jacdoc-import-file-meta">
                  <span className="jacdoc-import-file-name">{file.name}</span>
                  <span className="jacdoc-import-file-sub">
                    {formatLabel?.slice(formatLabel.indexOf(' ') + 1)} · {fileSizeLabel}
                  </span>
                </div>
                {!busy && (
                  <button
                    type="button"
                    className="jacdoc-import-file-remove"
                    title="Choisir un autre fichier"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                      setError(null)
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="jacdoc-import-dropzone-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div className="jacdoc-import-dropzone-title">
                  Glisse un fichier ici ou clique pour parcourir
                </div>
                <div className="jacdoc-import-dropzone-sub">
                  PDF · Word · Markdown · HTML · Texte · Image
                </div>
              </>
            )}
          </div>

          {/* Barre de progression — affichée seulement pour les PDFs. */}
          {busy && progress && (
            <div className="jacdoc-import-progress">
              <div className="jacdoc-import-progress-label">
                Conversion du PDF… page {progress.current} / {progress.total}
              </div>
              <div className="jacdoc-import-progress-bar">
                <div
                  className="jacdoc-import-progress-bar-fill"
                  style={buildProgressFillStyle(progress)}
                />
              </div>
            </div>
          )}

          {/* Indicateur générique (pas de progression — ex. DOCX rapide). */}
          {busy && !progress && (
            <div className="jacdoc-import-progress">
              <div className="jacdoc-import-progress-label">Lecture du fichier…</div>
              <div className="jacdoc-import-progress-bar">
                <div className="jacdoc-import-progress-bar-fill jacdoc-import-progress-indeterminate" />
              </div>
            </div>
          )}

          {error && (
            <div className="jacdoc-import-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="jacdoc-modal-footer">
          <button
            type="button"
            className="jacdoc-modal-btn jacdoc-modal-btn-ghost"
            onClick={() => !busy && onClose?.()}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="submit"
            className="jacdoc-modal-btn jacdoc-modal-btn-primary"
            disabled={busy || !file}
          >
            {busy ? 'Import…' : 'Importer'}
          </button>
        </footer>
      </form>
    </div>
  )
}