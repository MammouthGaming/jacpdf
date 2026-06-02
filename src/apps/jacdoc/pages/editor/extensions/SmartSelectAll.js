import { Extension } from '@tiptap/core'

// Sélection « Tout sélectionner » façon Word / Google Docs : Ctrl+A doit
// s'arrêter à la fin du dernier bloc signifiant du document, pas après le
// wrapper d'une liste. Pourquoi : quand le doc contient seulement un picot
// vide (ou un picot suivi d'un paragraphe vide qu'un toggle Tiptap a
// laissé derrière lui), le selectAll par défaut de ProseMirror place le
// caret de fin APRÈS le <ul>, ce qui fait visuellement déborder la
// sélection sous la ligne du picot. Word et Docs, eux, laissent le caret
// à l'intérieur du dernier <li> → la sélection reste « collée » sur la
// ligne du picot. On reproduit exactement ce comportement en posant une
// TextSelection qui se termine à l'intérieur du dernier textblock
// signifiant : a) il contient du texte, OU b) il est dans une liste,
// une citation ou un autre conteneur structuré (cas du picot vide).
// Sinon (doc 100 % vide), on s'arrête au premier textblock pour ne pas
// déborder sur les paragraphes vides suivants.
export const SmartSelectAll = Extension.create({
  name: 'smartSelectAll',
  addKeyboardShortcuts() {
    return {
      'Mod-a': () => {
        const editor = this.editor
        if (!editor) return false
        const { doc } = editor.state
        const STRUCTURED = new Set([
          'bulletList',
          'orderedList',
          'taskList',
          'blockquote',
        ])

        let firstTextblockEnd = -1
        let lastMeaningfulEnd = -1

        doc.descendants((node, pos) => {
          if (!node.isTextblock) return true
          const innerEnd = pos + node.nodeSize - 1
          if (firstTextblockEnd < 0) firstTextblockEnd = innerEnd

          const hasText = node.content.size > 0
          let inStructured = false
          try {
            const $pos = doc.resolve(pos)
            for (let d = $pos.depth; d > 0; d--) {
              if (STRUCTURED.has($pos.node(d).type.name)) {
                inStructured = true
                break
              }
            }
          } catch (_) { /* défensif : pos invalide → on ignore */ }

          if (hasText || inStructured) {
            lastMeaningfulEnd = innerEnd
          }
          return false
        })

        const to =
          lastMeaningfulEnd >= 0
            ? lastMeaningfulEnd
            : firstTextblockEnd >= 0
              ? firstTextblockEnd
              : doc.content.size

        try {
          editor.chain().focus().setTextSelection({ from: 0, to }).run()
          return true
        } catch (_) {
          return false
        }
      },
    }
  },
})