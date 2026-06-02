// imageImport.js
// Phase 7 — Helpers d'import d'image dans la toile (depuis disque).
//
// Trois primitives composables, utilisées par JacPaintInstance.handleImportImage :
//   1. pickImageFile()                       — file picker natif → File | null.
//   2. fileToImage(file)                     — File → { img, dataUrl }.
//   3. importImageToLayerCanvas(img, w, h)   — Image → canvas offscreen aux
//                                              dimensions de la toile, image
//                                              centrée + adaptée en proportion.
//
// Pourquoi pas de Bitmap natif (createImageBitmap) : on garde Image + dataURL
// pour pouvoir aussi exposer l'URL si on a besoin (drag-and-drop, preview), et
// FileReader fonctionne dans tous les navigateurs cibles de JacSuite.

export function pickImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/*'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    document.body.appendChild(input)
    let resolved = false
    const cleanup = () => { try { input.remove() } catch {} }
    input.onchange = () => {
      const file = input.files && input.files[0]
      resolved = true
      cleanup()
      resolve(file || null)
    }
    input.click()
    // Timer de garde — si l'utilisateur annule via Échap, aucun event
    // n'est tiré ; on retombe sur null après 2 min pour ne pas fuiter
    // le node DOM.
    setTimeout(() => {
      if (!resolved) { cleanup(); resolve(null) }
    }, 120000)
  })
}

export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Aucun fichier')); return }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const img = new Image()
      img.onload = () => resolve({ img, dataUrl })
      img.onerror = () => reject(new Error('Image illisible'))
      img.src = dataUrl
    }
    reader.onerror = () => reject(reader.error || new Error('Lecture échouée'))
    reader.readAsDataURL(file)
  })
}

export function imageToCanvas(img) {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(img, 0, 0)
  return c
}

// Compose l'image importée dans un canvas aux dimensions de la toile :
// l'image est centrée et redimensionnée en proportion pour rester dans
// les limites — jamais agrandie au-delà de sa résolution native, juste
// réduite si plus grande que la toile. Le canvas est entièrement
// transparent autour pour rester empilable comme couche standard.
export function importImageToLayerCanvas(img, targetW, targetH) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (iw <= 0 || ih <= 0) return null
  const scale = Math.min(1, targetW / iw, targetH / ih)
  const dw = Math.max(1, Math.round(iw * scale))
  const dh = Math.max(1, Math.round(ih * scale))
  const dx = Math.round((targetW - dw) / 2)
  const dy = Math.round((targetH - dh) / 2)
  const off = document.createElement('canvas')
  off.width = targetW
  off.height = targetH
  const ctx = off.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, dw, dh)
  return off
}