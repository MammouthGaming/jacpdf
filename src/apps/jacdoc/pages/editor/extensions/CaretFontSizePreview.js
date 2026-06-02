import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Caret « prévisualisation taille » à la Word / Docs.
//
// Problème : `setFontSize` pose un `storedMark` quand la sélection est
// vide, mais la hauteur du caret natif est dictée par la line-box du
// bloc courant — pas par les storedMarks. Tant qu'on n'a pas tapé de
// caractère, le caret garde sa hauteur initiale même après un changement
// de taille dans la toolbar.
//
// Fix robuste : un plugin ProseMirror qui injecte une Decoration widget
// invisible (zero-width space) à la position du curseur, portant la
// fontSize active. La line-box du bloc se cale alors sur le widget, et
// le caret natif suit. Marche dans :
//   • paragraphe vide
//   • fin de ligne d'un paragraphe non vide
//   • milieu de texte
//   • picot / case à cocher (listItem / taskItem)
//
// Le widget est ZWSP + display:inline-block + width:0 → il ne déplace rien
// horizontalement, ne se sélectionne pas, et n'apparait pas à l'export.
export const CaretFontSizePreview = Extension.create({
  name: 'caretFontSizePreview',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('caretFontSizePreview'),
        props: {
          decorations(state) {
            const { selection } = state
            if (!selection.empty) return DecorationSet.empty
            // 1) storedMarks posés par setFontSize quand on clique +/-
            //    avec une sélection vide.
            // 2) sinon, marks au point du curseur (cas typique après
            //    avoir tapé un caractère : la storedMark est consommée
            //    mais le mark TextStyle existe sur le texte autour).
            const marks = state.storedMarks || selection.$head.marks()
            const tsMark = marks.find((m) => m.type.name === 'textStyle')
            let fs = tsMark?.attrs.fontSize
            // 3) fallback : fontSize portée par le listItem / taskItem
            //    englobant (cf. setFontSize qui la propage là aussi).
            if (!fs) {
              for (let d = selection.$head.depth; d > 0; d--) {
                const node = selection.$head.node(d)
                if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
                  if (node.attrs?.fontSize) {
                    fs = node.attrs.fontSize
                    break
                  }
                }
              }
            }
            if (!fs) return DecorationSet.empty
            const build = () => {
              const span = document.createElement('span')
              span.className = 'jacdoc-caret-fs-preview'
              span.setAttribute('aria-hidden', 'true')
              span.style.fontSize = fs
              span.style.display = 'inline-block'
              span.style.width = '0'
              span.style.overflow = 'hidden'
              span.style.verticalAlign = 'baseline'
              span.style.pointerEvents = 'none'
              span.style.userSelect = 'none'
              // ZWSP : aucun glyphe visible mais contribue à la line-box.
              span.textContent = '\u200B'
              return span
            }
            return DecorationSet.create(state.doc, [
              Decoration.widget(selection.from, build, {
                // side:-1 → inséré AVANT le curseur, donc le caret reste
                // visuellement à sa position logique sans être poussé.
                side: -1,
                ignoreSelection: true,
                key: 'caret-fs-' + fs,
              }),
            ])
          },
        },
      }),
    ]
  },
})