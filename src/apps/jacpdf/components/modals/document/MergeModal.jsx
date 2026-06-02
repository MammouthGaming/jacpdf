import { useRef, useState } from 'react'
import { PDFDocument } from 'pdf-lib'
import './MergeModal.css'

export default function MergeModal({ onMerge, onClose }) {
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [dragIndex, setDragIndex] = useState(null)
  const [merging, setMerging] = useState(false)
  const [outputName, setOutputName] = useState('JacPDF Fusion.pdf')

  const addFiles = (fileList) => {
    const pdfs = Array.from(fileList || []).filter(file =>
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    if (!pdfs.length) return

    setFiles(prev => {
      const next = [...prev, ...pdfs]
      if (prev.length === 0 && pdfs[0]?.name) {
        const base = pdfs[0].name.replace(/\.pdf$/i, '')
        setOutputName(`JacPDF Fusion - ${base}.pdf`)
      }
      return next
    })
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const moveFile = (from, to) => {
    if (from === null || from === to) return
    setFiles(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const handleMerge = async () => {
    if (merging || files.length === 0) return
    setMerging(true)

    try {
      const merged = await PDFDocument.create()

      for (const file of files) {
        const bytes = await file.arrayBuffer()
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await merged.copyPages(src, src.getPageIndices())
        pages.forEach(page => merged.addPage(page))
      }

      const mergedBytes = await merged.save()
      const safeName = (outputName || 'JacPDF Fusion.pdf').trim()
      onMerge?.(safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`, mergedBytes)
      onClose?.()
    } catch (err) {
      alert('Erreur lors de la fusion des PDF : ' + (err?.message || err))
      setMerging(false)
    }
  }

  return (
    <div className="mm-overlay" onClick={onClose}>
      <div className="mm-card" onClick={(e) => e.stopPropagation()}>

        <div className="mm-header">
          <h2 className="mm-title">Fusionner des PDF</h2>
          <button className="mm-close" onClick={onClose}>✕</button>
        </div>

        <div className="mm-body">
          <div className="mm-section-label">FICHIERS PDF</div>

          <input
            ref={inputRef}
            className="mm-file-input"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          {files.length === 0 ? (
            <button className="mm-dropzone" onClick={() => inputRef.current?.click()}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <span className="mm-dropzone-title">Choisir des PDF</span>
              <span className="mm-dropzone-sub">Sélectionne deux fichiers ou plus à fusionner</span>
            </button>
          ) : (
            <>
              <div className="mm-file-list">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className={`mm-file-row ${dragIndex === index ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      moveFile(dragIndex, index)
                      setDragIndex(null)
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <div className="mm-file-grip">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                      </svg>
                    </div>
                    <div className="mm-file-num">{index + 1}</div>
                    <div className="mm-file-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div className="mm-file-name" title={file.name}>{file.name}</div>
                    <button className="mm-file-remove" onClick={() => removeFile(index)} title="Retirer">
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button className="mm-add-more" onClick={() => inputRef.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Ajouter d’autres PDF
              </button>
            </>
          )}

          <div className="mm-field-row">
            <label className="mm-field-label">Nom du fichier fusionné</label>
            <input
              className="mm-input"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="JacPDF Fusion.pdf"
            />
          </div>
        </div>

        <button
          className="mm-merge-btn"
          onClick={handleMerge}
          disabled={merging || files.length === 0}
        >
          {merging ? (
            <>
              <svg className="mm-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Fusion en cours…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 7h8"/>
                <path d="M8 12h8"/>
                <path d="M8 17h8"/>
                <path d="M4 7h.01"/>
                <path d="M4 12h.01"/>
                <path d="M4 17h.01"/>
              </svg>
              Fusionner les PDF
            </>
          )}
        </button>
      </div>
    </div>
  )
}