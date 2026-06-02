import { Extension } from '@tiptap/core'

// Extension qui ajoute un attribut `lineHeight` aux blocs textuels
// (paragraphes, titres, items de liste). Le rendu HTML applique
// `style="line-height: X"` sur le bloc. Une valeur null/absente laisse
// la cascade CSS s'appliquer (1.65 par défaut depuis JacDocEditor.css).
// Permet à la commande setLineHeight de la toolbar d'agir sur le bloc
// courant ou sur la sélection, comme Word > Espacement de paragraphe.
const LINE_HEIGHT_TYPES = ['paragraph', 'heading', 'listItem', 'taskItem']

export const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [
      {
        types: LINE_HEIGHT_TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) =>
              el.style && el.style.lineHeight ? el.style.lineHeight : null,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight) return {}
              return { style: 'line-height: ' + attrs.lineHeight }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    const updateLineHeightInSelection = (state, tr, lineHeight, unset = false) => {
      const updateNode = (node, pos) => {
        if (!LINE_HEIGHT_TYPES.includes(node.type.name)) return true
        const current = node.attrs.lineHeight ?? null
        const nextValue = unset ? null : lineHeight
        if (current === nextValue) return false

        const nextAttrs = { ...node.attrs, lineHeight: nextValue }
        if (unset) delete nextAttrs.lineHeight
        tr.setNodeMarkup(pos, undefined, nextAttrs)
        return false
      }

      const { selection } = state

      // Cas le plus fréquent : curseur simplement posé dans un paragraphe.
      // Avec from === to, `doc.nodesBetween(from, to, ...)` ne visite pas
      // forcément le bloc parent, donc l'ancien code retournait true mais
      // ne changeait aucun attribut → l'utilisateur cliquait et rien ne
      // se passait. On remonte explicitement au bloc textuel courant.
      if (selection.empty) {
        const $head = selection.$head
        for (let depth = $head.depth; depth >= 0; depth--) {
          const node = $head.node(depth)
          if (!LINE_HEIGHT_TYPES.includes(node.type.name)) continue
          const pos = depth === 0 ? 0 : $head.before(depth)
          updateNode(node, pos)
          return true
        }
        return true
      }

      state.doc.nodesBetween(selection.from, selection.to, updateNode)
      return true
    }

    return {
      // Pattern correct Tiptap : on modifie `tr` directement et on
      // retourne true. Tiptap se charge du dispatch à la fin de la
      // chaine. Le helper couvre maintenant aussi le cas `selection.empty`
      // pour que cliquer une valeur d'interligne agisse sur le paragraphe
      // courant, exactement comme Word / Google Docs.
      setLineHeight:
        (lineHeight) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true
          return updateLineHeightInSelection(state, tr, lineHeight, false)
        },
      unsetLineHeight:
        () =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true
          return updateLineHeightInSelection(state, tr, null, true)
        },
    }
  },
})