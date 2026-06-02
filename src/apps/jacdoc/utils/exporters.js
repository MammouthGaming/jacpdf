// Exporteurs JacDoc. Chaque fonction prend (editor, title, options?) et
// déclenche un téléchargement côté navigateur. Pour les formats paginés
// (HTML/PDF/DOCX), on exporte le DOM rendu quand il est disponible afin de
// conserver les breaks visuels Word-like posés par le moteur de layout.
//
// Tous les exporteurs lisent les réglages utilisateur depuis localStorage
// (Paramètres → JacDoc → Export) au moment de l'appel — pas de cache,
// donc un changement dans la modale prend effet sans rechargement.

import {
  DEFAULT_RULER_SETTINGS,
  PAGE_H_PX,
  PAGE_W_PX,
} from '../pages/editor/pagination/constants'

// ── Réglages utilisateur (Paramètres → JacDoc → Export) ─────────
function readJacdocExportSettings() {
  const get = (key, fallback) => {
    try { return localStorage.getItem(key) || fallback }
    catch { return fallback }
  }
  return {
    format: get('jacdoc_settings_export_format', 'pdf'),
    quality: get('jacdoc_settings_export_quality', 'standard'),
    fileName: get('jacdoc_settings_export_file_name', 'jacdoc-title'),
    includeComments: get('jacdoc_settings_export_include_comments', 'false') === 'true',
    includeMetadata: get('jacdoc_settings_export_include_metadata', 'true') !== 'false',
    afterSave: get('jacdoc_settings_export_after_save', 'ask'),
  }
}

// Helper générique : déclenche le download d'un Blob via un <a> jetable.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // setTimeout : Safari avorte le download si on revoke l'URL trop tôt.
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// Sanitize : on ne veut pas qu'un titre style « Mon doc / final ?! »
// génère un nom de fichier invalide sur Windows/macOS. Remplace les
// caractères interdits par « _ » et tronque à 120 chars.
function sanitizeBase(title) {
  return (title || 'document-sans-titre')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 120) || 'document'
}

function safeFilename(title, ext) {
  return sanitizeBase(title) + '.' + ext
}

// Nom du fichier selon le réglage « Nom du fichier » :
//  - jacdoc-title  → « JacDoc - titre.ext » (défaut)
//  - title         → « titre.ext »
//  - title-date    → « titre_2026-05-20.ext »
//  - title-version → « titre_v1.ext » (compteur par doc dans localStorage)
//  - ask           → window.prompt() ; null si l'utilisateur Cancel.
function buildExportFilename(title, ext, strategy, docId) {
  const base = sanitizeBase(title)
  const s = strategy || 'jacdoc-title'
  if (s === 'jacdoc-title') return 'JacDoc - ' + base + '.' + ext
  if (s === 'title') return base + '.' + ext
  if (s === 'title-date') {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return base + '_' + yyyy + '-' + mm + '-' + dd + '.' + ext
  }
  if (s === 'title-version') {
    let v = 1
    try {
      const key = 'jacdoc:exportVersion:' + (docId || base)
      v = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1
      localStorage.setItem(key, String(v))
    } catch {}
    return base + '_v' + v + '.' + ext
  }
  if (s === 'ask') {
    const proposed = base + '.' + ext
    let answer = null
    try { answer = window.prompt('Nom du fichier ?', proposed) } catch {}
    if (answer === null) return null
    const trimmed = String(answer).trim()
    if (!trimmed) return null
    return trimmed.toLowerCase().endsWith('.' + ext) ? trimmed : trimmed + '.' + ext
  }
  return base + '.' + ext
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function normalizeExportOptions(options = {}) {
  const rulerSettings = {
    ...DEFAULT_RULER_SETTINGS,
    ...(options?.rulerSettings || {}),
  }

  return {
    pageWidth: finiteOr(options.pageWidth, PAGE_W_PX),
    pageHeight: finiteOr(options.pageHeight, PAGE_H_PX),
    rulerSettings,
  }
}

// Export paginé : le DOM rendu contient aussi les widgets
// `.jacdoc-visual-page-break` du moteur Word-like. `editor.getHTML()` ne
// contient que le modèle ProseMirror et perd ces decorations.
function getRenderedEditorHtml(editor) {
  return editor?.view?.dom?.innerHTML || editor.getHTML()
}

function buildPagedExportCss(options = {}, settings = null) {
  const {
    pageWidth,
    pageHeight,
    rulerSettings,
  } = normalizeExportOptions(options)

  const top = finiteOr(rulerSettings.marginTop, DEFAULT_RULER_SETTINGS.marginTop)
  const bottom = finiteOr(rulerSettings.marginBottom, DEFAULT_RULER_SETTINGS.marginBottom)
  const left = finiteOr(rulerSettings.marginLeft, DEFAULT_RULER_SETTINGS.marginLeft)
  const right = finiteOr(rulerSettings.marginRight, DEFAULT_RULER_SETTINGS.marginRight)
  const firstIndent = finiteOr(rulerSettings.firstIndent, 0)
  const hangingIndent = finiteOr(rulerSettings.hangingIndent, 0)
  const rightIndent = finiteOr(rulerSettings.rightIndent, 0)

  // Masque les commentaires si l'option « Inclure les commentaires » est OFF.
  // Couvre TipTap CommentMark, Yjs, et nos propres widgets éventuels.
  const hideComments = settings && settings.includeComments === false
    ? '.jacdoc-comment,[data-comment],[data-comment-id],.comment,.comment-mark,.comment-thread,.tiptap-comment{display:none!important;}'
    : ''

  return ''
    + '@page{size:' + pageWidth + 'px ' + pageHeight + 'px;margin:0;}'
    + '*{box-sizing:border-box;}'
    + 'html,body{margin:0;padding:0;background:#fff;color:#111827;}'
    + 'body{font-family:Inter,Arial,system-ui,sans-serif;font-size:12pt;line-height:1.65;}'
    + '.jacdoc-export-page{width:' + pageWidth + 'px;min-height:' + pageHeight + 'px;'
    + 'padding:' + top + 'px ' + right + 'px ' + bottom + 'px ' + left + 'px;'
    + 'background:#fff;color:#111827;'
    + '--jacdoc-first-indent:' + firstIndent + 'px;'
    + '--jacdoc-hanging-indent:' + hangingIndent + 'px;'
    + '--jacdoc-right-indent:' + rightIndent + 'px;}'
    + '.jacdoc-export-meta{margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #e5e7eb;font-size:11pt;color:#6b7280;}'
    + '.jacdoc-export-meta h1{font-size:24px;margin:0 0 6px;color:#111827;}'
    + '.jacdoc-export-meta-row{display:flex;gap:14px;flex-wrap:wrap;}'
    + '.ProseMirror{outline:none;color:#111827;font-size:16px;line-height:1.65;}'
    + '.ProseMirror>*+*{margin-top:.75em;}'
    + 'h1,h2,h3{page-break-after:avoid;break-after:avoid;margin:1.2em 0 .45em;line-height:1.25;color:#0f172a;}'
    + 'h1{font-size:28px;}h2{font-size:22px;}h3{font-size:18px;}'
    + 'p{margin:0;min-height:1.65em;padding-left:var(--jacdoc-hanging-indent,0px);'
    + 'padding-right:var(--jacdoc-right-indent,0px);'
    + 'text-indent:calc(var(--jacdoc-first-indent,0px) - var(--jacdoc-hanging-indent,0px));}'
    + 'ul,ol{margin:.75em 0;padding-left:calc(1.5em + var(--jacdoc-hanging-indent,0px));'
    + 'padding-right:var(--jacdoc-right-indent,0px);}'
    + 'li>p{padding-left:0;text-indent:0;}'
    + 'ul[data-type="taskList"]{list-style:none;padding-left:calc(.25em + var(--jacdoc-hanging-indent,0px));}'
    + 'ul[data-type="taskList"] li{display:flex;gap:8px;}'
    + 'blockquote{border-left:3px solid #39FF14;margin-left:0;padding:.5em 1em;color:#4b5563;background:#f8fafc;page-break-inside:avoid;break-inside:avoid;border-radius:0 6px 6px 0;}'
    + 'pre,img,table{page-break-inside:avoid;break-inside:avoid;}'
    + 'pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto;font-family:"Roboto Mono",ui-monospace,monospace;}'
    + 'code{font-family:"Roboto Mono",ui-monospace,monospace;}'
    + 'img{max-width:100%;height:auto;}'
    + 'table{border-collapse:collapse;width:100%;}td,th{border:1px solid #d1d5db;padding:6px 8px;}'
    + 'hr{border:0;border-top:1px solid #d1d5db;margin:32px 0;}'
    + 'a{color:#047857;}'
    + '.jacdoc-pagebreak-node{display:block;break-before:page;page-break-before:always;height:0!important;margin:0!important;overflow:hidden!important;color:transparent!important;}'
    + '.jacdoc-pagebreak-node::before,.jacdoc-pagebreak-node::after{display:none!important;content:""!important;}'
    + '.jacdoc-visual-page-break{display:block!important;break-before:page;page-break-before:always;height:0!important;min-height:0!important;margin:0!important;padding:0!important;line-height:0!important;font-size:0!important;overflow:hidden!important;}'
    + hideComments
    + '@media print{body{width:' + pageWidth + 'px;} .jacdoc-export-page{page-break-after:auto;}}'
}

// En-tête de métadonnées en haut de la page paginée (PDF/HTML/DOCX).
// Vide quand le réglage « Inclure les métadonnées » est OFF.
function buildMetadataHeader(editor, title, settings) {
  if (!settings || settings.includeMetadata === false) return ''
  const safeTitle = escapeHtml(title || 'Document sans titre')
  const d = new Date()
  let dateStr = ''
  try { dateStr = d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { dateStr = d.toISOString().slice(0, 10) }
  let wordCount = 0
  try { wordCount = (editor.getText() || '').trim().split(/\s+/).filter(Boolean).length }
  catch {}
  return '<div class="jacdoc-export-meta">'
    + '<h1>' + safeTitle + '</h1>'
    + '<div class="jacdoc-export-meta-row">'
    + '<span>📅 ' + escapeHtml(dateStr) + '</span>'
    + '<span>📝 ' + wordCount + ' mot' + (wordCount > 1 ? 's' : '') + '</span>'
    + '</div>'
    + '</div>'
}

function buildPagedHtml(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const safe = escapeHtml(title || 'Document')
  const body = getRenderedEditorHtml(editor)
  const css = buildPagedExportCss(options, settings)
  const meta = buildMetadataHeader(editor, title, settings)

  return '<!DOCTYPE html>\n'
    + '<html lang="fr">\n'
    + '<head>\n'
    + '<meta charset="utf-8">\n'
    + '<title>' + safe + '</title>\n'
    + (settings.includeMetadata !== false
      ? '<meta name="generator" content="JacDoc">\n'
        + '<meta name="date" content="' + new Date().toISOString() + '">\n'
      : '')
    + '<style>' + css + '</style>\n'
    + '</head>\n'
    + '<body>\n'
    + '<main class="jacdoc-export-page">\n'
    + meta
    + '<div class="ProseMirror">\n'
    + body + '\n'
    + '</div>\n'
    + '</main>\n'
    + '</body>\n'
    + '</html>\n'
}

// ── Après-export : « Ouvrir », « Partager », « Demander », « Rien » ─
async function handleAfterExport(blob, filename, settings) {
  const mode = settings.afterSave || 'ask'
  if (mode === 'nothing') return
  if (mode === 'open') {
    try {
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {}
    return
  }
  if (mode === 'share') {
    try {
      if (navigator.canShare && typeof File !== 'undefined') {
        const file = new File([blob], filename, { type: blob.type })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename })
          return
        }
      }
    } catch {}
    return
  }
  if (mode === 'ask') {
    try {
      const open = window.confirm('Export terminé : ' + filename + '\n\nOuvrir le fichier maintenant ?')
      if (open) {
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener')
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
    } catch {}
  }
}

// ── TXT ────────────────────────────────────────────────────────────
export async function exportTxt(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const filename = buildExportFilename(title, 'txt', settings.fileName, options.docId)
  if (!filename) return
  const blob = new Blob([editor.getText()], { type: 'text/plain;charset=utf-8' })
  triggerDownload(blob, filename)
  await handleAfterExport(blob, filename, settings)
}

// ── HTML ───────────────────────────────────────────────────────────
export async function exportHtml(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const filename = buildExportFilename(title, 'html', settings.fileName, options.docId)
  if (!filename) return
  const html = buildPagedHtml(editor, title, options)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  triggerDownload(blob, filename)
  await handleAfterExport(blob, filename, settings)
}

// ── Markdown ──────────────────────────────────────────────────────
export async function exportMarkdown(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const filename = buildExportFilename(title, 'md', settings.fileName, options.docId)
  if (!filename) return
  const { default: TurndownService } = await import('turndown')
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  td.addRule('jacdocPageBreak', {
    filter: (node) => node.getAttribute && node.getAttribute('data-jacdoc-pagebreak-node') === 'true',
    replacement: () => '\n\n---\n\n',
  })
  let md = td.turndown(editor.getHTML())
  if (settings.includeMetadata !== false) {
    const d = new Date()
    let dateStr = ''
    try { dateStr = d.toLocaleDateString('fr-CA') } catch { dateStr = d.toISOString().slice(0, 10) }
    md = '# ' + (title || 'Document') + '\n\n*' + dateStr + '*\n\n---\n\n' + md
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  triggerDownload(blob, filename)
  await handleAfterExport(blob, filename, settings)
}

// ── PDF — print natif (zéro dépendance) ───────────────────────────
export function exportPdfViaPrint() {
  window.print()
}

// ── PDF — html2pdf.js ─────────────────────────────────────────────
// Qualité PDF : pilote html2canvas.scale.
//  - light    : scale 1 (fichier léger, texte légèrement moins net)
//  - standard : scale 2 (équilibré)
//  - high     : scale 3 (rendu net, PDF plus lourd)
export async function exportPdf(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const filename = buildExportFilename(title, 'pdf', settings.fileName, options.docId)
  if (!filename) return
  const { default: html2pdf } = await import('html2pdf.js')
  const { pageWidth, pageHeight } = normalizeExportOptions(options)

  const scale = settings.quality === 'high' ? 3 : settings.quality === 'light' ? 1 : 2

  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildPagedHtml(editor, title, options)

  const worker = html2pdf()
    .set({
      filename,
      margin: 0,
      html2canvas: { scale, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: {
        unit: 'px',
        format: [pageWidth, pageHeight],
        orientation: 'portrait',
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        before: ['.jacdoc-pagebreak-node', '.jacdoc-visual-page-break'],
      },
    })
    .from(wrapper)

  // Génère le PDF en blob — on récupère le binaire AVANT de save() pour
  // pouvoir le partager / le rouvrir dans handleAfterExport.
  try {
    const blob = await worker.outputPdf('blob')
    triggerDownload(blob, filename)
    await handleAfterExport(blob, filename, settings)
  } catch (_) {
    // Fallback : si outputPdf échoue (ancienne version de la lib),
    // on retombe sur .save() qui télécharge directement.
    try { await worker.save() } catch {}
  }
}

// ── DOCX ──────────────────────────────────────────────────────────
export async function exportDocx(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const filename = buildExportFilename(title, 'docx', settings.fileName, options.docId)
  if (!filename) return
  const { asBlob } = await import('html-docx-js-typescript')
  const html = buildPagedHtml(editor, title, options)
  const blob = await asBlob(html)
  triggerDownload(blob, filename)
  await handleAfterExport(blob, filename, settings)
}

// ── Entrée unifiée respectant le « Format par défaut » ────────────
// À utiliser depuis la TopBar / Cmd-K / raccourci ⌘+⇧+E. Un menu
// d'export explicite (« Exporter en PDF ») peut forcer un format via
// options.formatOverride sans toucher au réglage utilisateur.
export async function exportDocument(editor, title, options = {}) {
  const settings = readJacdocExportSettings()
  const fmt = options.formatOverride || settings.format || 'pdf'
  if (fmt === 'pdf') return exportPdf(editor, title, options)
  if (fmt === 'docx') return exportDocx(editor, title, options)
  if (fmt === 'txt') return exportTxt(editor, title, options)
  if (fmt === 'html') return exportHtml(editor, title, options)
  if (fmt === 'markdown' || fmt === 'md') return exportMarkdown(editor, title, options)
  return exportPdf(editor, title, options)
}