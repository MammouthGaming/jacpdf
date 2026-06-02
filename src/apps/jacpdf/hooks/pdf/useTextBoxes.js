// src/hooks/pdf/useTextBoxes.js — Hook regroupant les states + handlers des
// textboxes (Wave 4 du refactor). Extrait de EditorInstance.jsx.
//
// Responsable de :
//   - states : textBoxes, selectedBox (sélection unique), selectedBoxes (multi-select)
//   - création (createTextBox) avec calcul du caret pile sous la souris
//     (selon textAlign + fontSize + lineHeight, via textBoxOps.computeCaretOffset)
//   - update (updateTextBox) et suppression (deleteTextBox)
//   - drop (dropTextBox) : réassignation à la page sous la souris + clamp
//   - drag de groupe (handleGroupDrag) : déplace toutes les boxes sélectionnées
//
// Dépendances injectées par EditorInstance via l'objet d'options :
//   canvasRef           — ref vers .editor-canvas (pour mesurer les pages)
//   zoom                — zoom courant (en %, ex. 100, 150)
//   visiblePages        — pages visibles (ordre custom + filtre des supprimées)
//   pageSizes           — { [pageNum]: { width, height } } en POINTS PDF
//   setSelectedCommentId — pour désélectionner un commentaire à la création

import { useState, useEffect } from 'react'
import { textFmtStore } from "@/shared/stores/ui/textFmtStore"
import { findTargetPageIndex } from "@/apps/jacpdf/lib/pdf/geometry"
import * as textBoxOps from "@/apps/jacpdf/lib/pdf/textBoxOps"

export function useTextBoxes({ canvasRef, zoom, visiblePages, pageSizes, setSelectedCommentId, currentUserId, readOnly = false }) {
  const [textBoxes, setTextBoxes] = useState([])
  const [selectedBox, setSelectedBox] = useState(null)
  const [selectedBoxes, setSelectedBoxes] = useState([]) // multi-select ids

  // Garde-fou défensif : normalise toute textbox dont les coords visuelles
  // sortent des bornes de sa page. Ça arrive typiquement avec des textboxes
  // « legacy » créées avant le fix de createTextBox / applyTextBoxDrop : elles
  // peuvent avoir pdfX > pagePdfWidth et s'afficher dans la marge noire à droite
  // du PDF (ou en dessous), enfants DOM du wrapper de page mais visuellement
  // hors-page. Au chargement (Supabase mirror, meta PDF, IDB) ces zones
  // fantômes se remettent toutes seules dans leur page.
  //
  // Même logique de clamp que applyTextBoxDrop (cf. textBoxOps.applyTextBoxDrop) :
  // on clamp le CONTOUR visible (x à x+w-20, y à y+h-20), pas le wrapper, pour
  // que la box vienne se coller pile au bord le plus proche.
  //
  // Pas de boucle infinie : après clamp, le 2e passage trouve cx=cy=0
  // → needsUpdate reste false → pas de setState.
  useEffect(() => {
    let needsUpdate = false
    const normalized = textBoxes.map(b => {
      const pw = b.pagePdfWidth
      const ph = b.pagePdfHeight
      if (!pw || !ph) return b
      const w = b.width || 200
      const h = b.height || 60
      let cx = 0, cy = 0
      if (b.x < 0) cx = -b.x
      else if (b.x + w - 20 > pw) cx = pw - (b.x + w - 20)
      if (b.y < 0) cy = -b.y
      else if (b.y + h - 20 > ph) cy = ph - (b.y + h - 20)
      if (cx === 0 && cy === 0) return b
      needsUpdate = true
      const fx = b.x + cx
      const fy = b.y + cy
      return { ...b, x: fx, y: fy, pdfX: fx, pdfY: ph - fy }
    })
    if (needsUpdate) setTextBoxes(normalized)
  }, [textBoxes])

  // Crée une textbox au clic. Calcule la position du caret pour qu'il
  // atterrisse pile sous la souris, peu importe l'alignement, la taille
  // de police, ou la hauteur de ligne configurés par l'utilisateur.
  const createTextBox = async (clientX, clientY) => {
    if (readOnly) return

    const scale = zoom / 100

    // Find which page was clicked using getBoundingClientRect (values are in scaled screen px)
    let pageIndex = 0
    let pageRelX = 0
    let pageRelY = 0
    // Hit-test : on ne crée une textbox que si le clic tombe sur une page
    // PDF. Si l'utilisateur clique hors de toute page (marge du canvas, gap
    // entre deux pages, etc.), on annule — pas de textbox créée.
    let hit = false
    const pageWrappers = canvasRef.current?.querySelectorAll('.editor-page-wrapper')
    if (pageWrappers) {
      for (let i = 0; i < pageWrappers.length; i++) {
        const rect = pageWrappers[i].getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom &&
            clientX >= rect.left && clientX <= rect.right) {
          pageIndex = i
          // Divide by scale to convert from scaled screen px → unscaled PDF points
          pageRelX = (clientX - rect.left) / scale
          pageRelY = (clientY - rect.top)  / scale
          hit = true
          break
        }
      }
    }
    if (!hit) return

    const pageNum = visiblePages[pageIndex] || 1
    const realSize = pageSizes[pageNum] || { width: 612, height: 792, canvasHeightPx: 792, canvasWidthPx: 612 }

    // ⚠️ Bug fix collision : on utilisait Date.now() comme id, mais 2 créations
    // dans la même milliseconde → même id → conflit PK dans Supabase → le 2e
    // upsert écrase le 1er silencieusement, et le tab d'en face voit un état
    // incohérent. Avec crypto.randomUUID() chaque textbox a un id garanti
    // unique, même en mode « clic frantique ». Fallback Date.now()+random
    // pour très vieux browsers (jamais utilisé en pratique sur les browsers
    // qu'on supporte, mais safety-net).
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    // Taille initiale style Kami : rectangle LARGE single-line (ratio ~5:1).
    // Constante en points PDF (PAS divisée par le zoom) — la box est ancrée
    // dans les coordonnées du PDF, donc grandit visuellement avec le zoom
    // comme le reste du contenu, exactement comme Kami.
    //
    // initialW = 100 PDF pt : largeur compacte single-line (ratio ~2:1 avec
    // la hauteur d'1 ligne). L'utilisateur tape, le texte WRAP dans cette
    // largeur fixe et la hauteur grandit ligne par ligne (cf. autoSize: false
    // plus bas).
    // initialH = 1 ligne : ceil(fontSize × lineHeight) + 32 PDF pt.
    //   - fontSize × lineHeight = hauteur texte d'1 ligne (21 PDF pt à 14pt×1.5)
    //   - +12 = padding vertical du contentEditable (6 top + 6 bottom)
    //   - +20 = border transparente du wrapper (10 top + 10 bottom, box-sizing
    //           border-box). C'est la "zone de grab invisible" autour de
    //           l'outline visible, cf. wrapperStyle dans TextBox.jsx.
    // À fontSize=14, lineHeight=1.5 → 21 + 32 = 53 PDF pt total. Visible outline
    // (après soustraction des 20 px de border) = 33 PDF pt, ce qui donne pile
    // 1 ligne de texte avec son padding visible — même proportions que Kami.
    //
    // Doit MATCHER `scrollHeight + 20` du else branch de useLayoutEffect dans
    // TextBox.jsx, parce que scrollHeight d'un contentEditable empty inclut
    // déjà le padding (12) + line-box (21) = 33, donc +20 = 53. Si initialH
    // diffère de 53 au mount, le hook fait pop la box à 53.
    const fmt = textFmtStore.get()
    const initialW = 100
    const initialH = Math.ceil((fmt.size || 14) * (fmt.lineHeight || 1.5)) + 32

    // Calcule la position EXACTE du caret pour qu'il atterrisse pile sous la
    // souris, peu importe l'alignement, la taille de police, ou la hauteur
    // de ligne configurés par l'utilisateur. Tout est en POINTS PDF (unité
    // non-scalée du wrapper de page) — pas besoin de /scale, le wrapper
    // applique transform: scale(zoom/100) globalement.
    //
    // Géométrie d'une textbox (cf. TextBox.jsx + TextBox.css) :
    //   - wrapper rendu à left: x - 10, width: initialW (box-sizing: border-box,
    //     border 10px transparente incluse dans width)
    //   - la box VISIBLE (outline vert) va de x à x + initialW - 20
    //   - textarea: position absolute + inset 0 → remplit le padding-box du
    //     wrapper, soit de (x, y) à (x + initialW - 20, y + initialH - 20)
    //   - textarea padding: 6px 8px → content-area de (x+8, y+6) à
    //     (x + initialW - 28, y + initialH - 14)
    //
    // Position du caret dans une box vide selon textAlign :
    //   X : left   → x + 8         (= padding-left)
    //       center → x + initialW/2 - 10  (milieu horizontal de la zone)
    //       right  → x + initialW - 28   (juste avant padding-right)
    //   Y milieu : y + 6 + (fontSize × lineHeight) / 2
    const { caretOffsetX, caretOffsetY } = textBoxOps.computeCaretOffset(fmt, initialW)
    const pdfX = pageRelX - caretOffsetX
    const pdfY = realSize.height - (pageRelY - caretOffsetY)

    // x/y = PDF points = px at scale 1
    const x = pdfX
    const y = realSize.height - pdfY

    setTextBoxes(prev => [...prev, {
      id,
      pdfX,
      pdfY,
      pageIndex,
      pagePdfWidth: realSize.width,
      pagePdfHeight: realSize.height,
      x,
      y,
      // Démarre petit — autoSize=true fait grandir la box au fur et à
      // mesure qu'on tape (pas de wrap, façon Kami). Dès qu'on redimensionne
      // manuellement, autoSize passe à false et la box devient fixe (avec wrap).
      width: initialW,
      height: initialH,
      text: '',
      // autoSize: true dès la création = comportement Kami : la box grandit
      // HORIZONTALEMENT au fil de la frappe (pas de wrap). Quand la largeur
      // naturelle atteint le bord droit du PDF, la box bascule auto en
      // autoSize: false (cf. useLayoutEffect dans TextBox.jsx) et le wrap
      // prend le relais sur les caractères suivants. À la création, minW=100
      // dans le useLayoutEffect garantit que la box vide reste à sa largeur
      // initiale (pas de pop à 40 px au mount). L'utilisateur peut toujours
      // resize manuellement (BR/TR handles) — ça fige autoSize à false.
      autoSize: true,
      fmt,
      // Tagging at-source pour le filtre « masquer par participant »
      // (cf. hiddenUserIds dans EditorInstance + CollaboratorsSidebar).
      // Sans ce tag, le filet de sécurité dans useAnnotationsCloudMirror
      // (auto-tag des orphelins) avait une race : le diff effect pouvait
      // upsert la textbox vers Supabase AVANT que le patch createdBy soit
      // appliqué localement, donc les autres clients recevaient une
      // textbox sans auteur → le filtre `hiddenUserIds` la laissait passer
      // (impossible de la rattacher à quelqu'un). Symptome reporté :
      // « les drawings sont masqués mais pas les textboxes ». Les
      // drawings, eux, sont tagués at-source dans onDrawingComplete.
      createdBy: currentUserId || null,
    }])
    setSelectedBox(id)
    setSelectedCommentId(null)
  }

  const updateTextBox = (id, updates) => {
    if (readOnly) return
    setTextBoxes(prev => textBoxOps.updateTextBox(prev, id, updates))
  }

  const deleteTextBox = (id) => {
    if (readOnly) return
    setTextBoxes(prev => prev.filter(b => b.id !== id))
    setSelectedBox(null)
  }

  // Au drop d'une textbox : même logique que dropDrawing (page cible + clamp).
  // Logique pure dans  lib/pdf/textBoxOps +  lib/pdf/geometry.
  const dropTextBox = (id, clientX, clientY) => {
    if (readOnly) return

    const pageWrappers = canvasRef.current?.querySelectorAll('.editor-page-wrapper')
    if (!pageWrappers || !pageWrappers.length) return
    const targetIdx = findTargetPageIndex(pageWrappers, clientX, clientY)
    if (targetIdx === -1) return
    const b = textBoxes.find(x => x.id === id)
    if (!b) return
    const oldIdx = b.pageIndex || 0
    const pageNum = visiblePages[targetIdx]
    const ps = pageSizes[pageNum] || { width: b.pagePdfWidth, height: b.pagePdfHeight }
    let tx = 0, ty = 0
    if (oldIdx !== targetIdx) {
      const scale = zoom / 100
      const oldRect = pageWrappers[oldIdx].getBoundingClientRect()
      const newRect = pageWrappers[targetIdx].getBoundingClientRect()
      tx = (oldRect.left - newRect.left) / scale
      ty = (oldRect.top  - newRect.top)  / scale
    }
    setTextBoxes(prev => textBoxOps.applyTextBoxDrop(prev, id, targetIdx, ps, tx, ty))
  }

  // Déplace toutes les textboxes sélectionnées de (dx, dy) en PDF points
  // (impl. dans  lib/pdf/textBoxOps).
  const handleGroupDrag = (dx, dy) => {
    if (readOnly) return
    setTextBoxes(prev => textBoxOps.groupDragTextBoxes(prev, selectedBoxes, dx, dy))
  }

  return {
    textBoxes, setTextBoxes,
    selectedBox, setSelectedBox,
    selectedBoxes, setSelectedBoxes,
    createTextBox,
    updateTextBox,
    deleteTextBox,
    dropTextBox,
    handleGroupDrag,
  }
}