// Overlay modal affiché pendant qu'une reconnaissance OCR tourne. Bloque
// l'interaction avec l'éditeur, montre le statut courant (page X / Y) et
// une barre de progression. Disparaît automatiquement quand ocrRunning
// repasse à false (cf. hooks/pdf/usePdfOcr.js).
//
// Extrait d'Editor.jsx (Vague 2) — purement présentationnel.

// Largeur de la barre de progression sous forme de pourcentage. Extrait en
// helper pour éviter le double-{ JSX dans le code (Notion intercepte ... comme
// placeholder de compression).
function ocrProgressFillStyle(ocrProgress) {
  return { width: `${Math.round((ocrProgress.page / ocrProgress.total) * 100)}%` }
}

export default function OcrOverlay({ ocrRunning, ocrProgress }) {
  if (!ocrRunning) return null

  return (
    <div className="editor-ocr-overlay">
      <div className="editor-ocr-modal">
        <div className="editor-ocr-spinner" />
        <div className="editor-ocr-title">Reconnaissance de texte</div>
        <div className="editor-ocr-status">{ocrProgress.status}</div>
        {ocrProgress.total > 0 && (
          <div className="editor-ocr-progress">
            <div
              className="editor-ocr-progress-fill"
              style={ocrProgressFillStyle(ocrProgress)}
            />
          </div>
        )}
        <div className="editor-ocr-hint">Reconnaissance complète de toutes les pages (rendu haute résolution + binarisation d'Otsu). À utiliser pour les polices stylisées vectorisées ou les champs de formulaire non détectés. ~10-40 s par page.</div>
      </div>
    </div>
  )
}