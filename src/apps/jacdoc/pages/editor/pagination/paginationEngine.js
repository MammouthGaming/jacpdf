import { getVisualPageBreaks, setVisualPageBreaks } from './visualPageBreakPlugin'
import {
  getBodyBottom,
  getNextBodyTop,
  getPageIndexFromY,
  getPageTop,
} from './pageGeometry'
import {
  canLinePaginateElement,
  getCssLineHeight,
  getElementBoundaryBreakInfo,
  getActiveListItemBreakInfo,
  getListItemBreakInfoFromElement,
  getLineProbeX,
  getLineStartPos,
  getListAwareLineBreakInfo,
  getVisualHeight,
  isHeadingElement,
  isListElement,
} from './lineMeasurement'

// Première couche du vrai moteur Word-like.
//
// Invariant : la pagination normale ne doit jamais faire de tr.split.
// Le document reste continu ; le moteur ajoute des breaks visuels
// Decoration.widget pour fragmenter l'affichage.
//
// Retourne { inserted: true, targetPageIndex } si une transaction de
// break visuel a été dispatchée. Dans ce cas, l'appelant doit arrêter le
// pass courant : la transaction relancera un layout avec le DOM mis à jour.
export function runVisualPaginationPass({
  editor,
  children,
  pageRef,
  zoom,
  pageHeight,
  pageGap,
  pageTopMargin,
  pageBottomMargin,
  pageLeftMargin = 0,
  pageRightMargin = 0,
}) {
  if (!editor || editor.isDestroyed) return { inserted: false }

  const jacPageEl = pageRef.current?.parentElement
  const jacPageRect = jacPageEl?.getBoundingClientRect()
  if (!jacPageRect) return { inserted: false }

  const existingBreaks = getVisualPageBreaks(editor.state)
  const layoutKey = [
    pageHeight,
    pageGap,
    pageTopMargin,
    pageBottomMargin,
    pageLeftMargin,
    pageRightMargin,
    zoom,
  ].join(':')

  // Word recalcule la pagination quand la géométrie de page change
  // (marges, format papier, zoom d'affichage, etc.). Si les breaks
  // existants viennent d'une ancienne géométrie, on les vide d'abord,
  // puis le prochain pass les reposera avec les bonnes hauteurs.
  if (existingBreaks.some((b) => !b.layoutKey || b.layoutKey !== layoutKey)) {
    return {
      inserted: false,
      cleared: setVisualPageBreaks(editor, []),
    }
  }

  // Garde-fou anti-boucle infinie : si une mesure DOM est incohérente ou
  // si un paste énorme déclenche une cascade trop grande, on arrête
  // d'ajouter des breaks au lieu de bloquer l'éditeur. Word a aussi des
  // garde-fous de layout ; ici on limite la première version du moteur à
  // 250 fragments visuels, ce qui couvre déjà de très longs documents.
  const MAX_VISUAL_BREAKS = 250
  if (existingBreaks.length >= MAX_VISUAL_BREAKS) return { inserted: false }

  const addBreak = (nextBreak) => {
    if (!nextBreak) return { inserted: false }

    const sameBreak = existingBreaks.some((b) => (
      Math.abs(b.pos - nextBreak.pos) <= 1 &&
      Math.abs((b.height || 0) - nextBreak.height) < 1 &&
      b.pageIndex === nextBreak.pageIndex &&
      b.targetPageIndex === nextBreak.targetPageIndex &&
      b.rangeStart === nextBreak.rangeStart &&
      b.rangeEnd === nextBreak.rangeEnd &&
      !!b.listBoundary === !!nextBreak.listBoundary &&
      b.layoutKey === nextBreak.layoutKey
    ))

    if (sameBreak) return { inserted: false }

    // Word recalcule le layout, mais un même paragraphe peut être
    // fragmenté sur PLUSIEURS pages. On ne doit donc pas supprimer tous
    // les breaks du même paragraphe : seulement celui qui correspond à la
    // même page source (pageIndex) ou au même spot. Ça permet :
    //   page 1 → break A dans le paragraphe
    //   page 2 → break B dans le même paragraphe
    //   page 3 → break C dans le même paragraphe
    const breaks = [
      ...existingBreaks.filter((b) => {
        const sameRange =
          Number.isFinite(nextBreak.rangeStart) &&
          Number.isFinite(nextBreak.rangeEnd) &&
          b.pos >= nextBreak.rangeStart &&
          b.pos <= nextBreak.rangeEnd
        const samePage =
          Number.isFinite(nextBreak.pageIndex) &&
          Number.isFinite(b.pageIndex) &&
          b.pageIndex === nextBreak.pageIndex
        const sameSpot = Math.abs(b.pos - nextBreak.pos) <= 2
        return !(sameRange && samePage) && !sameSpot
      }),
      nextBreak,
    ].sort((a, b) => a.pos - b.pos)

    const inserted = setVisualPageBreaks(editor, breaks)
    return {
      inserted,
      targetPageIndex: Number.isFinite(nextBreak.targetPageIndex)
        ? nextBreak.targetPageIndex
        : undefined,
    }
  }

  // 1) Cas principal pendant la frappe : ligne active du curseur.
  try {
    const sel = editor.state.selection
    const activeSelectionPos = Number.isFinite(sel?.head)
      ? sel.head
      : sel?.anchor
    if (sel && Number.isFinite(activeSelectionPos)) {
      const caret = editor.view.coordsAtPos(activeSelectionPos)
      if (caret) {
        const caretTopPage = (caret.top - jacPageRect.top) / zoom
        const caretBottomPage = (caret.bottom - jacPageRect.top) / zoom
        const pageIndex = getPageIndexFromY(caretTopPage, pageHeight, pageGap)
        const bodyBottom = getBodyBottom(pageIndex, pageHeight, pageGap, pageBottomMargin)
        const nextBodyTop = getNextBodyTop(pageIndex, pageHeight, pageGap, pageTopMargin)

        // Priorité Word pour les listes : si le curseur est dans un <li>
        // actif à la frontière, on coupe sur CE listItem actif, pas sur le
        // précédent item détecté par posAtCoords dans le fallback layout.
        // Cas ciblé : dernier picot en bas + Entrée => seul le NOUVEAU
        // picot vide doit passer page suivante, les anciens restent page 1.
        const activeListItemBreak = getActiveListItemBreakInfo(
          editor,
          activeSelectionPos,
        )
        if (activeListItemBreak) {
          // Important : nodeDOM(pos) n'est pas assez fiable ici avec des
          // listes imbriquées / decorations. On part du DOM réel de la
          // sélection puis on remonte au <li> actif. Ça cible le picot
          // courant, pas le <ul>/<ol> ni un ancien item plus haut.
          const domAtSelection = editor.view.domAtPos(activeSelectionPos)
          let listItemDom = domAtSelection?.node
          if (listItemDom && listItemDom.nodeType === 3) {
            listItemDom = listItemDom.parentNode
          }
          while (
            listItemDom &&
            listItemDom !== editor.view.dom &&
            listItemDom.tagName !== 'LI'
          ) {
            listItemDom = listItemDom.parentNode
          }

          const listItemRect = listItemDom?.tagName === 'LI'
            ? listItemDom.getBoundingClientRect?.()
            : null
          if (listItemRect) {
            const itemTopPage = (listItemRect.top - jacPageRect.top) / zoom
            const itemBottomPage = (listItemRect.bottom - jacPageRect.top) / zoom
            const itemLineHeight = Math.max(
              2,
              (listItemRect.height || (caret.bottom - caret.top)) / zoom,
            )
            // Ne jamais pousser un picot qui est encore clairement dans le
            // corps de page. Avant, la condition basée seulement sur le
            // caret pouvait pousser un item beaucoup trop haut, ce qui
            // envoyait plusieurs picots page 2 malgré un grand espace vide
            // en page 1. Word ne fait pas ça : il pousse seulement l'item
            // qui atteint réellement la marge basse.
            const activeItemIsNearBottom =
              itemBottomPage > bodyBottom - 1 ||
              itemTopPage >= bodyBottom - itemLineHeight - 1
            const activeItemIsBeforeNextBody = itemTopPage < nextBodyTop - 2
            const activeItemIsSmallOrEmpty =
              activeListItemBreak.isEmptyListItem ||
              (itemBottomPage - itemTopPage) <= itemLineHeight * 1.6
            const shouldMoveActiveListItem =
              activeItemIsSmallOrEmpty &&
              activeItemIsNearBottom &&
              activeItemIsBeforeNextBody
            const spacerHeight = Math.max(0, nextBodyTop - itemTopPage)
            if (shouldMoveActiveListItem && spacerHeight >= 4) {
              return addBreak({
                pos: activeListItemBreak.pos,
                height: spacerHeight,
                rangeStart: activeListItemBreak.rangeStart,
                rangeEnd: activeListItemBreak.rangeEnd,
                listBoundary: true,
                pageIndex,
                targetPageIndex: pageIndex + 1,
                layoutKey,
              })
            }
          }
        }

        // Déclencher AVANT que la ligne se dessine dans la marge basse.
        // Word repagine quand la prochaine ligne ne rentre plus dans le
        // corps de page, pas une fois que le caret est déjà dans le footer.
        const caretLineHeight = Math.max(2, caretBottomPage - caretTopPage)
        const LINE_TOL = Math.max(2, caretLineHeight + 1)
        if (caretBottomPage >= bodyBottom - LINE_TOL && caretTopPage < nextBodyTop - 2) {
          const { lineStartPos, parentStart, parentEnd } =
            getLineStartPos(editor, activeSelectionPos, caret.top)

          const breakInfo = getListAwareLineBreakInfo(
            editor,
            lineStartPos,
            parentStart,
            parentEnd,
          )

          const usesListItemBoundary = breakInfo.pos !== lineStartPos
          const canBreakInsideText =
            usesListItemBoundary ||
            lineStartPos - parentStart >= 1

          const lineTopPage = (caret.top - jacPageRect.top) / zoom
          const spacerHeight = Math.max(0, nextBodyTop - lineTopPage)

          const hasTextAfterLineStart = parentEnd - lineStartPos >= 1
          const isNewListItemAtBoundary = !!breakInfo.listBoundary
          if (
            canBreakInsideText &&
            (hasTextAfterLineStart || isNewListItemAtBoundary) &&
            spacerHeight >= 4
          ) {
            return addBreak({
              pos: breakInfo.pos,
              height: spacerHeight,
              rangeStart: breakInfo.rangeStart,
              rangeEnd: breakInfo.rangeEnd,
              listBoundary: !!breakInfo.listBoundary,
              pageIndex,
              targetPageIndex: pageIndex + 1,
              layoutKey,
            })
          }

          // Cas Entrée à la limite de page : le moteur visuel ne peut PAS
          // poser de break utile (paragraphe encore vide, pas de ligne à
          // couper). On le laisse retourner inserted=false ; l'appelant
          // tombera dans le filet whole-block push (marginTop) qui déplace
          // le paragraphe entier vers le corps de la page suivante, exactement
          // comme Word. C'est plus fiable qu'un widget Decoration dont le
          // rendu dépend du flow CSS.
        }
      }
    }
  } catch (_) {
    // Défensif : fallback bloc ci-dessous.
  }

  const hasExistingListBreakForChild = (child, pageIndex) => {
    if (!isListElement(child)) return false
    return existingBreaks.some((b) => {
      if (!b?.listBoundary || b.pageIndex !== pageIndex) return false
      try {
        const dom = editor.view.nodeDOM(b.pos)
        const el = dom?.nodeType === 3 ? dom.parentNode : dom
        const list = el?.closest?.('ul,ol')
        return list === child
      } catch (_) {
        return false
      }
    })
  }

  // 2) Fallback layout : contenu existant / paste. On trouve la première
  // ligne qui tombe juste après la frontière de corps et on place le break
  // au début de cette ligne.
  for (const child of children) {
    if (!canLinePaginateElement(child)) continue

    const lineHeight = getCssLineHeight(child)
    const height = getVisualHeight(child, lineHeight)
    if (height <= lineHeight * 1.6) continue

    const topContent = child.offsetTop
    const topPage = topContent + pageTopMargin
    const startPage = getPageIndexFromY(topPage, pageHeight, pageGap)
    const pageTopPx = getPageTop(startPage, pageHeight, pageGap)
    const pageBodyBottom = pageTopPx + pageHeight - pageBottomMargin
    const blockBottomPage = topPage + height

    // Si on vient déjà de poser un break sur le VRAI listItem actif de
    // cette liste/page (ex. Entrée sur dernier picot en bas), ne pas
    // laisser le fallback général ajouter un deuxième break plus haut
    // dans le même <ul>/<ol>. C'était la cause des « plusieurs picots »
    // envoyés page 2 : pass 1 pousse le nouveau picot vide, pass 2
    // re-sonde la liste au bas de page et coupe un ancien picot aussi.
    if (hasExistingListBreakForChild(child, startPage)) continue

    // Pagination Word des listes : si le curseur est dans un NOUVEAU
    // picot vide, ce picot actif est prioritaire ABSOLU. On ne scanne pas
    // les anciens picots avant lui, même s'ils sont proches de la frontière,
    // sinon JacDoc coupe 2-3 items trop haut et les envoie page 2. Word,
    // lui, laisse les anciens picots page 1 et pousse seulement le picot
    // vide créé par Entrée.
    if (isListElement(child) && blockBottomPage > pageBodyBottom) {
      let activeEmptyItemDom = null
      let activeEmptyItemBreak = null
      try {
        const sel = editor.state.selection
        const activeSelectionPos = Number.isFinite(sel?.head)
          ? sel.head
          : sel?.anchor
        activeEmptyItemBreak = getActiveListItemBreakInfo(
          editor,
          activeSelectionPos,
        )
        if (activeEmptyItemBreak?.isEmptyListItem) {
          const domAtSelection = editor.view.domAtPos(activeSelectionPos)
          activeEmptyItemDom = domAtSelection?.node
          if (activeEmptyItemDom && activeEmptyItemDom.nodeType === 3) {
            activeEmptyItemDom = activeEmptyItemDom.parentNode
          }
          while (
            activeEmptyItemDom &&
            activeEmptyItemDom !== editor.view.dom &&
            activeEmptyItemDom.tagName !== 'LI'
          ) {
            activeEmptyItemDom = activeEmptyItemDom.parentNode
          }
          if (activeEmptyItemDom?.closest?.('ul,ol') !== child) {
            activeEmptyItemDom = null
          }
        }
      } catch (_) {
        activeEmptyItemDom = null
        activeEmptyItemBreak = null
      }

      if (activeEmptyItemDom && activeEmptyItemBreak) {
        const itemRect = activeEmptyItemDom.getBoundingClientRect?.()
        if (itemRect) {
          const itemTopPage = (itemRect.top - jacPageRect.top) / zoom
          const itemBottomPage = (itemRect.bottom - jacPageRect.top) / zoom
          const itemLineHeight = Math.max(
            2,
            getCssLineHeight(activeEmptyItemDom, lineHeight),
          )
          const nextBodyTop = getNextBodyTop(
            startPage,
            pageHeight,
            pageGap,
            pageTopMargin,
          )
          const emptyItemIsAtBoundary =
            itemBottomPage > pageBodyBottom - 1 ||
            itemTopPage >= pageBodyBottom - itemLineHeight - 1 ||
            itemTopPage >= pageBodyBottom
          const emptyItemIsBeforeNextBody = itemTopPage < nextBodyTop - 2
          const spacerHeight = Math.max(0, nextBodyTop - itemTopPage)

          if (emptyItemIsAtBoundary && emptyItemIsBeforeNextBody && spacerHeight >= 4) {
            return addBreak({
              pos: activeEmptyItemBreak.pos,
              height: spacerHeight,
              rangeStart: activeEmptyItemBreak.rangeStart,
              rangeEnd: activeEmptyItemBreak.rangeEnd,
              listBoundary: true,
              pageIndex: startPage,
              targetPageIndex: startPage + 1,
              layoutKey,
            })
          }

          // Important : même si les mesures DOM sont transitoires et que
          // le picot vide actif n'est pas encore jugé « à la frontière »,
          // on NE doit PAS couper un ancien picot plus haut dans la même
          // liste pendant cette pass. On attend la prochaine mesure plutôt
          // que d'envoyer 3 picots sur page 2.
          continue
        }
      }

      const directItems = Array.from(child.children || []).filter((el) =>
        el?.tagName === 'LI' &&
        !el.classList?.contains?.('jacdoc-visual-page-break-list')
      )

      // Règle Word stricte pour Entrée en fin de liste : si le dernier
      // item direct est vide, c'est le nouveau picot créé par Entrée. Il
      // doit avoir priorité absolue sur les anciens items qui débordent.
      // Sinon le moteur choisit le premier ancien item qui ne rentre plus,
      // et comme le margin-top s'applique à cet item, il pousse aussi les
      // 2-3 items suivants. Word ne fait pas ça : seul le nouveau picot
      // vide part sur la page suivante.
      const lastDirectItem = directItems[directItems.length - 1]
      const lastDirectItemIsEmpty =
        !!lastDirectItem &&
        (lastDirectItem.textContent || '').trim().length === 0
      if (lastDirectItemIsEmpty) {
        const itemRect = lastDirectItem.getBoundingClientRect?.()
        const breakInfo = getListItemBreakInfoFromElement(editor, lastDirectItem)
        if (itemRect && breakInfo) {
          const itemTopPage = (itemRect.top - jacPageRect.top) / zoom
          const itemBottomPage = (itemRect.bottom - jacPageRect.top) / zoom
          const itemLineHeight = Math.max(2, getCssLineHeight(lastDirectItem, lineHeight))
          const nextBodyTop = getNextBodyTop(
            startPage,
            pageHeight,
            pageGap,
            pageTopMargin,
          )
          const emptyItemTouchesBoundary =
            itemBottomPage > pageBodyBottom - 1 ||
            itemTopPage >= pageBodyBottom - itemLineHeight - 1 ||
            itemTopPage >= pageBodyBottom
          const spacerHeight = Math.max(0, nextBodyTop - itemTopPage)

          if (emptyItemTouchesBoundary && spacerHeight >= 4) {
            return addBreak({
              pos: breakInfo.pos,
              height: spacerHeight,
              rangeStart: breakInfo.rangeStart,
              rangeEnd: breakInfo.rangeEnd,
              listBoundary: true,
              pageIndex: startPage,
              targetPageIndex: startPage + 1,
              layoutKey,
            })
          }
        }

        // Tant que le dernier picot est vide, ne jamais couper un ancien
        // picot plus haut dans cette même liste. Si les mesures sont encore
        // instables, on attend la prochaine pass au lieu de déplacer 3
        // picots sur la page 2.
        continue
      }

      for (const item of directItems) {
        const itemRect = item.getBoundingClientRect?.()
        if (!itemRect) continue

        const itemTopPage = (itemRect.top - jacPageRect.top) / zoom
        const itemBottomPage = (itemRect.bottom - jacPageRect.top) / zoom
        const itemHeight = Math.max(1, itemBottomPage - itemTopPage)
        const itemLineHeight = Math.max(2, getCssLineHeight(item, lineHeight))

        // Ne coupe à la frontière d'item que si la PREMIÈRE ligne de
        // l'item ne rentre plus. Si l'item est long et commence plus haut,
        // on laisse le moteur ligne-par-ligne couper à l'intérieur.
        const firstLineDoesNotFit =
          itemTopPage >= pageBodyBottom - itemLineHeight - 1 &&
          itemTopPage < getNextBodyTop(startPage, pageHeight, pageGap, pageTopMargin) - 2

        const shortOrEmptyItem = itemHeight <= itemLineHeight * 1.6 ||
          (item.textContent || '').trim().length === 0

        if (!firstLineDoesNotFit || !shortOrEmptyItem) continue

        const breakInfo = getListItemBreakInfoFromElement(editor, item)
        if (!breakInfo) continue

        const nextBodyTop = getNextBodyTop(
          startPage,
          pageHeight,
          pageGap,
          pageTopMargin,
        )
        const spacerHeight = Math.max(0, nextBodyTop - itemTopPage)
        if (spacerHeight < 4) continue

        return addBreak({
          pos: breakInfo.pos,
          height: spacerHeight,
          rangeStart: breakInfo.rangeStart,
          rangeEnd: breakInfo.rangeEnd,
          listBoundary: true,
          pageIndex: startPage,
          targetPageIndex: startPage + 1,
          layoutKey,
        })
      }
    }

    if (blockBottomPage <= pageBodyBottom) continue

    const offsetInBlock = pageBodyBottom - topPage
    if (offsetInBlock < lineHeight * 0.8) continue

    // Keep-with-next façon Word : si le paragraphe déborde dès sa
    // première ligne et qu'il est précédé d'un titre sur la même page,
    // on pose le break AVANT le titre. Le titre et son premier contenu
    // restent ensemble sur la page suivante au lieu de laisser un titre
    // orphelin en bas de page.
    const prev = child.previousElementSibling
    if (isHeadingElement(prev) && offsetInBlock < lineHeight * 1.4) {
      const prevTopPage = prev.offsetTop + pageTopMargin
      const prevStartPage = getPageIndexFromY(prevTopPage, pageHeight, pageGap)
      const prevBreakInfo = getElementBoundaryBreakInfo(editor, prev)
      const nextBodyTop = getNextBodyTop(
        prevStartPage,
        pageHeight,
        pageGap,
        pageTopMargin,
      )
      const spacerHeight = Math.max(0, nextBodyTop - prevTopPage)

      if (prevStartPage === startPage && prevBreakInfo && spacerHeight >= 4) {
        return addBreak({
          pos: prevBreakInfo.pos,
          height: spacerHeight,
          rangeStart: prevBreakInfo.rangeStart,
          rangeEnd: prevBreakInfo.rangeEnd,
          pageIndex: prevStartPage,
          targetPageIndex: prevStartPage + 1,
          layoutKey,
        })
      }

      continue
    }

    const childRect = child.getBoundingClientRect()
    const probeY = childRect.top + (offsetInBlock + 2) * zoom
    const probeX = getLineProbeX(child, 8)
    const coords = editor.view.posAtCoords({ left: probeX, top: probeY })
    if (!coords) continue

    const lineCoords = editor.view.coordsAtPos(coords.pos)
    const { lineStartPos, parentStart, parentEnd } =
      getLineStartPos(editor, coords.pos, lineCoords.top)
    const breakInfo = getListAwareLineBreakInfo(
      editor,
      lineStartPos,
      parentStart,
      parentEnd,
    )

    if (breakInfo.pos === lineStartPos && lineStartPos - parentStart < 1) continue
    // Pour un nouveau picot vide créé par Entrée à la frontière de page,
    // parentEnd - lineStartPos peut être 0. C'est quand même un break
    // valide si breakInfo.listBoundary=true : on doit pousser seulement
    // CE listItem vide vers la page suivante, pas toute la liste.
    if (parentEnd - lineStartPos < 1 && !breakInfo.listBoundary) continue

    const lineTopPage = (lineCoords.top - jacPageRect.top) / zoom
    const nextBodyTop = getNextBodyTop(startPage, pageHeight, pageGap, pageTopMargin)
    const spacerHeight = Math.max(0, nextBodyTop - lineTopPage)

    if (spacerHeight < 4) continue

    return addBreak({
      pos: breakInfo.pos,
      height: spacerHeight,
      rangeStart: breakInfo.rangeStart,
      rangeEnd: breakInfo.rangeEnd,
      listBoundary: !!breakInfo.listBoundary,
      pageIndex: startPage,
      targetPageIndex: startPage + 1,
      layoutKey,
    })
  }

  return { inserted: false }
}