import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Breaks visuels Word-like NON destructifs.
//
// Un break visuel est une Decoration.widget à une position texte. Il prend
// une hauteur calculée par le moteur de pagination et pousse l'affichage
// suivant vers le corps de la page suivante, sans créer de node dans le
// document ProseMirror et sans faire de tr.split.
//
// Donc :
// - le paragraphe reste continu dans le modèle ;
// - undo/redo ne voit pas de paragraphes artificiels ;
// - la pagination peut être recalculée/replacée sans modifier le contenu.
export const visualPageBreakPluginKey = new PluginKey('jacdocVisualPageBreaks')

export function getVisualPageBreaks(state) {
  return visualPageBreakPluginKey.getState(state) || []
}

export function getMaxPageFromVisualBreaks(state) {
  const breaks = getVisualPageBreaks(state)
  let maxPage = 0

  for (const b of breaks) {
    if (Number.isFinite(b.targetPageIndex)) {
      maxPage = Math.max(maxPage, b.targetPageIndex)
    } else if (Number.isFinite(b.pageIndex)) {
      // Fallback pour les anciens breaks : un break posé sur pageIndex
      // pousse normalement la suite vers pageIndex + 1.
      maxPage = Math.max(maxPage, b.pageIndex + 1)
    }
  }

  return maxPage
}

export function setVisualPageBreaks(editor, breaks) {
  if (!editor || editor.isDestroyed) return false
  const sorted = Array.isArray(breaks)
    ? breaks
        .filter((b) => b && Number.isFinite(b.pos) && Number.isFinite(b.height))
        .sort((a, b) => a.pos - b.pos)
    : []

  const current = getVisualPageBreaks(editor.state)
  const sameLength = current.length === sorted.length
  const sameBreaks = sameLength && current.every((b, i) => {
    const next = sorted[i]
    return next &&
      b.pos === next.pos &&
      Math.abs((b.height || 0) - (next.height || 0)) < 1 &&
      b.pageIndex === next.pageIndex &&
      b.targetPageIndex === next.targetPageIndex &&
      b.rangeStart === next.rangeStart &&
      b.rangeEnd === next.rangeEnd &&
      !!b.listBoundary === !!next.listBoundary &&
      b.layoutKey === next.layoutKey
  })
  if (sameBreaks) return false

  const tr = editor.state.tr.setMeta(visualPageBreakPluginKey, { breaks: sorted })
  tr.setMeta('jacdocVisualPagination', true)
  editor.view.dispatch(tr)
  return true
}

export const VisualPageBreaks = Extension.create({
  name: 'visualPageBreaks',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: visualPageBreakPluginKey,
        state: {
          init: () => [],
          apply(tr, value) {
            const meta = tr.getMeta(visualPageBreakPluginKey)
            if (meta && Array.isArray(meta.breaks)) return meta.breaks
            if (!tr.docChanged) return value

            // Word recalcule sa pagination après chaque modification du
            // document. Même principe ici : les breaks visuels sont des
            // aides de layout, pas du contenu. Dès qu'une transaction
            // modifie le doc (texte tapé, suppression, paste, etc.), on
            // les vide pour forcer le moteur à recalculer depuis un flux
            // propre au prochain pass. Ça évite les grands espaces
            // fantômes quand du texte est supprimé ou remonte d'une page.
            return []
          },
        },
        props: {
          decorations(state) {
            const breaks = visualPageBreakPluginKey.getState(state) || []
            if (!breaks.length) return null

            const decorations = []
            breaks.forEach((b, index) => {
              if (b.listBoundary) {
                // Word-like pour listes : NE PAS insérer de faux <li>.
                // Même caché, un faux <li> peut compter dans une <ol>,
                // créer un item vide, ou décaler la numérotation. À la
                // place, on applique le spacer directement sur le VRAI
                // listItem qui doit partir à la page suivante. Résultat :
                // si l'utilisateur appuie Entrée sur le dernier picot en
                // bas de page, seul le nouveau picot ajouté reçoit le
                // margin-top et migre page 2. Les picots précédents restent
                // page 1, exactement comme Word.
                let to = Number.isFinite(b.rangeEnd) && b.rangeEnd > b.pos
                  ? b.rangeEnd
                  : null
                if (!Number.isFinite(to)) {
                  try {
                    const node = state.doc.resolve(b.pos).nodeAfter
                    if (node) to = b.pos + node.nodeSize
                  } catch (_) {
                    to = null
                  }
                }
                if (Number.isFinite(to) && to > b.pos) {
                  decorations.push(Decoration.node(b.pos, to, {
                    style: 'margin-top: ' + Math.max(0, Math.round(b.height || 0)) + 'px !important;',
                  }))
                }
                return
              }

              decorations.push(Decoration.widget(
                b.pos,
                () => {
                  // Break visuel normal : un <span display:block> pousse
                  // les lignes suivantes sans créer de node documentaire.
                  const el = document.createElement('span')
                  el.className = 'jacdoc-visual-page-break'
                  el.setAttribute('contenteditable', 'false')
                  el.setAttribute('aria-hidden', 'true')
                  el.style.display = 'block'
                  el.style.width = '100%'
                  el.style.height = Math.max(0, b.height || 0) + 'px'
                  el.style.margin = '0'
                  el.style.padding = '0'
                  el.style.border = '0'
                  el.style.pointerEvents = 'none'
                  el.style.userSelect = 'none'
                  return el
                },
                {
                  side: -1,
                  key: 'jacdoc-vpb-' + index + '-block-' + b.pos + '-' + Math.round(b.height || 0),
                },
              ))
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})