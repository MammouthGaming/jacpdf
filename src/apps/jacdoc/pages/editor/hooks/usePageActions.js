import { EMPTY_DOC } from '../../../stores/jacdocStore'
import { PAGE_GAP_PX, PAGE_H_PX } from '../pagination/constants'
import { getPageStep } from '../pagination/pageGeometry'
import { clamp } from '../editorHelpers'

// Actions "par page" pour JacDoc.
//
// JacDoc est un document en flux continu : il n'y a pas d'objets page
// fixes comme dans JacPDF. Pour offrir un équivalent du « Supprimer la
// page » de JacPDF, on calcule la cartographie page → nodes top-level
// via offsetTop du DOM (à la même passe de layout que la pagination JS),
// puis on supprime ce range du doc ProseMirror. Le contenu sous la page
// supprimée remonte naturellement, comme dans Word quand on sélectionne
// le contenu d'une page et qu'on appuie sur Supprimer.
//
// Extrait de JacDocEditor.jsx (Phase 8 du refactor).
export function usePageActions({ editor, pageRef, rulerSettings }) {
  // Calcule les ranges [from, to] dans le doc ProseMirror correspondant
  // au CONTENU actuellement affiché sur chaque page.
  const computePageRanges = () => {
    if (!editor || editor.isDestroyed) return []
    const root = pageRef.current?.querySelector('.ProseMirror')
    if (!root) return []
    const STEP = getPageStep(PAGE_H_PX, PAGE_GAP_PX)
    const pageTopMargin = clamp(rulerSettings.marginTop, 24, PAGE_H_PX - 220)
    // Les widget decorations (breaks visuels) ne sont pas de vrais nodes
    // du doc — on les filtre pour aligner l'index DOM sur l'index doc.
    const domChildren = Array.from(root.children).filter(
      (c) => !c?.classList?.contains?.('jacdoc-visual-page-break'),
    )
    const rangesByPage = new Map()
    let domIdx = 0
    editor.state.doc.forEach((node, offset) => {
      const el = domChildren[domIdx++]
      if (!el) return
      const topPage = el.offsetTop + pageTopMargin
      const pageNum = Math.max(1, Math.floor(topPage / STEP) + 1)
      const nodeFrom = offset
      const nodeTo = offset + node.nodeSize
      const existing = rangesByPage.get(pageNum)
      if (existing) {
        existing.from = Math.min(existing.from, nodeFrom)
        existing.to = Math.max(existing.to, nodeTo)
      } else {
        rangesByPage.set(pageNum, { pageNum, from: nodeFrom, to: nodeTo })
      }
    })
    return Array.from(rangesByPage.values()).sort((a, b) => a.pageNum - b.pageNum)
  }

  // Supprime le CONTENU d'une page : retire tous les nodes top-level qui
  // sont actuellement affichés sur cette page. Le reste du contenu remonte
  // naturellement après la suppression.
  const handleDeletePage = (pageNum) => {
    if (!editor || editor.isDestroyed) return
    const ranges = computePageRanges()
    const r = ranges.find((x) => x.pageNum === pageNum)
    if (!r) return
    const docSize = editor.state.doc.content.size
    // Sécurité : si on supprimerait TOUT le doc, on remet un doc vide
    // valide à la place pour éviter un état ProseMirror invalide.
    if (r.from <= 0 && r.to >= docSize) {
      editor.commands.setContent(EMPTY_DOC, { emitUpdate: true })
      return
    }
    editor.chain().focus().deleteRange({ from: r.from, to: r.to }).run()
  }

  return { handleDeletePage }
}