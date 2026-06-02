// Importeurs JacDoc. Chaque format produit du HTML que Tiptap pourra
// charger via `editor.commands.setContent(html)`. On ne convertit PAS
// nous-mêmes en ProseMirror JSON — Tiptap le fait quand le doc est ouvert.
//
// Convention de retour de chaque importer :
//   { title: string, html: string }
//
// Le `title` est dérivé du nom de fichier sans extension. Le HTML est
// suffisamment générique pour que Tiptap le digère via son parser DOM
// (StarterKit + extensions standard suffisent).
//
// Libs lourdes en LAZY IMPORT — la lib n'est téléchargée qu'au 1er import
// de ce format. Aucun impact sur le bundle initial.
//   - pdfjs-dist  : parser PDF (~600 ko)
//   - mammoth     : DOCX → HTML (~250 ko)
//   - marked      : MD   → HTML (~40 ko)

// ── Format detection ─────────────────────────────────────────────
// On combine le MIME du File ET l'extension pour être robuste : certains
// navigateurs donnent un MIME vide pour .md, et certains OS étiquettent
// les .docx comme `application/octet-stream`.
export function detectFormat(file) {
  if (!file) return 'unknown'
  const name = (file.name || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) {
    return 'image'
  }
  if (ext === 'docx' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx'
  }
  if (ext === 'md' || ext === 'markdown' || mime === 'text/markdown') return 'md'
  if (ext === 'html' || ext === 'htm' || mime === 'text/html') return 'html'
  if (ext === 'txt' || mime === 'text/plain' || mime.startsWith('text/')) return 'txt'
  return 'unknown'
}

// Helpers communs ─────────────────────────────────────────────────
function titleFromFilename(file) {
  const base = (file?.name || 'Document importé').replace(/\.[^.]+$/, '')
  return base.trim() || 'Document importé'
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Lit un File en ArrayBuffer (binaire) ou DataURL (base64).
function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(file)
  })
}
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsText(file, 'utf-8')
  })
}

// ── TXT ───────────────────────────────────────────────────────────
// Chaque ligne non-vide → <p>. Les lignes vides séparent les paragraphes.
async function importTxt(file) {
  const text = await readAsText(file)
  const html = text
    .split(/\r?\n\r?\n/)        // double newline = nouveau paragraphe
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => '<p>' + escapeHtml(para).replace(/\r?\n/g, '<br>') + '</p>')
    .join('\n') || '<p></p>'
  return { title: titleFromFilename(file), html }
}

// ── HTML ──────────────────────────────────────────────────────────
// On extrait <body> si le fichier est un document complet, sinon on prend
// le contenu tel quel. Tiptap sanitize tout ce qu'il ne reconnaît pas.
async function importHtml(file) {
  const raw = await readAsText(file)
  let html = raw
  // Tente d'extraire le <body>. Si pas trouvé, on garde le contenu intégral.
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) html = bodyMatch[1]
  return { title: titleFromFilename(file), html: html || '<p></p>' }
}

// ── Markdown ──────────────────────────────────────────────────────
// `marked` est rapide, léger (~40 ko) et supporte GFM (tables, task lists,
// strikethrough). On active gfm + breaks pour matcher l'attente courante.
async function importMd(file) {
  const text = await readAsText(file)
  const { marked } = await import('marked')
  marked.setOptions({ gfm: true, breaks: false, headerIds: false, mangle: false })
  const html = marked.parse(text)
  return { title: titleFromFilename(file), html }
}

// ── DOCX ──────────────────────────────────────────────────────────
// `mammoth.convertToHtml` est la référence côté navigateur pour Word.
// Très bon support : headings, listes, gras/italique/souligné, tables,
// liens, images embeddées (sous forme base64). On ignore les warnings.
async function importDocx(file) {
  const arrayBuffer = await readAsArrayBuffer(file)
  const mammoth = await import('mammoth/mammoth.browser')
  const result = await mammoth.convertToHtml({ arrayBuffer })
  return { title: titleFromFilename(file), html: result.value || '<p></p>' }
}

// ── Image ─────────────────────────────────────────────────────────
// Un seul <img> base64. Tiptap (extension Image avec inline:false) en
// fait un bloc autonome, l'utilisateur peut taper du texte autour.
async function importImage(file) {
  const dataUrl = await readAsDataURL(file)
  const alt = escapeHtml(titleFromFilename(file))
  const html = '<p><img src="' + dataUrl + '" alt="' + alt + '" /></p>'
  return { title: titleFromFilename(file), html }
}

// ── PDF ───────────────────────────────────────────────────────────
// Stratégie « comme JacPDF » : on rend chaque page en image (canvas →
// dataURL JPEG) et on insère 1 <img> par page séparé par un saut de page
// dur. L'utilisateur peut ajouter du texte entre les images ou les
// remplacer une par une.
//
// onProgress(current, total) est appelé après chaque page rendue, pour
// que la modale puisse afficher une barre de progression (les gros PDFs
// peuvent prendre 10-30s).
async function importPdf(file, onProgress) {
  const arrayBuffer = await readAsArrayBuffer(file)
  // pdfjs-dist v4 expose un build ES module. Le worker doit être chargé
  // séparément en URL — on utilise le worker bundlé Vite via ?url.
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pages = []
  // Scale 2 = 144 DPI environ, bon compromis qualité/taille pour du JPEG 0.85.
  const scale = 2
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    // JPEG 0.85 : ~3× plus léger que PNG, qualité indiscernable pour
    // une page de PDF rendue. Critique pour les gros PDFs (sinon le
    // doc Tiptap pèse 50+ Mo et IndexedDB rame).
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    pages.push(dataUrl)
    onProgress?.(i, pdf.numPages)
    // Libère le canvas immédiatement (mobile Safari = mémoire limitée).
    canvas.width = 0
    canvas.height = 0
  }

  // Construit le HTML : 1 page = 1 <img> + 1 saut de page dur (sauf
  // après la dernière page). Le data-jacdoc-pagebreak-node fait que les
  // exports PDF / impression respectent la pagination du fichier source.
  const html = pages
    .map((src, idx) => {
      const img = '<p><img src="' + src + '" alt="Page ' + (idx + 1) + '" /></p>'
      const sep = idx < pages.length - 1
        ? '<div data-jacdoc-pagebreak-node="true" class="jacdoc-pagebreak-node"></div>'
        : ''
      return img + sep
    })
    .join('\n') || '<p></p>'

  return { title: titleFromFilename(file), html }
}

// ── Point d'entrée unique ─────────────────────────────────────────
// Dispatch sur le format détecté. Lève une erreur si le format n'est
// pas reconnu — la modale catch et affiche un message à l'utilisateur.
export async function importFile(file, onProgress) {
  const format = detectFormat(file)
  switch (format) {
    case 'txt':   return await importTxt(file)
    case 'html':  return await importHtml(file)
    case 'md':    return await importMd(file)
    case 'docx':  return await importDocx(file)
    case 'image': return await importImage(file)
    case 'pdf':   return await importPdf(file, onProgress)
    default:
      throw new Error('Format non supporté : ' + (file.name || file.type || 'inconnu'))
  }
}

// Liste des extensions acceptées par le file picker.
// Utile pour le `accept="..."` de <input type="file">.
export const ACCEPTED_EXTENSIONS =
  '.pdf,.docx,.md,.markdown,.html,.htm,.txt,' +
  '.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.avif'