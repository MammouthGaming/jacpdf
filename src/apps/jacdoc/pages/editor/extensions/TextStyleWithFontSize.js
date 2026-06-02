import { TextStyle as BaseTextStyle } from '@tiptap/extension-text-style'

// TextStyle étendu pour ajouter directement l'attribut fontSize à la mark.
// On part de la version officielle puis on ajoute fontSize via addAttributes
// (merge avec this.parent?.() pour préserver fontFamily ajouté par FontFamily).
// Tiptap mérge correctement les `style` retournés par chaque attribut
// (via mergeAttributes interne), donc font-family ET font-size coexistent
// dans le même <span>. Cette approche est plus fiable que déclarer une
// Extension séparée avec addGlobalAttributes (qui peut faire écraser le
// style attr selon l'ordre d'enregistrement).
export const TextStyle = BaseTextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => (el.style && el.style.fontSize) ? el.style.fontSize.replace(/['"]+/g, '') : null,
        renderHTML: (attrs) => {
          if (!attrs.fontSize) return {}
          return { style: 'font-size: ' + attrs.fontSize }
        },
      },
      // Couleur du texte (attr inline color). Coexiste avec fontSize et
      // fontFamily dans la même mark TextStyle, donc un seul <span> est
      // produit en sortie. Implanté directement ici plutôt qu'au travers
      // de @tiptap/extension-color : ce package n'est pas forcément
      // installé dans la dépendance Tiptap du projet, et son import
      // silencieusement undefined laissait les commandes setColor /
      // unsetColor non enregistrées → « ça ne fait rien sur le texte ».
      color: {
        default: null,
        parseHTML: (el) => (el.style && el.style.color) ? el.style.color : null,
        renderHTML: (attrs) => {
          if (!attrs.color) return {}
          return { style: 'color: ' + attrs.color }
        },
      },
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      // setFontSize Word-friendly : si rien n'est sélectionné (curseur
      // simple dans un picot ou un paragraphe), on applique la mark à
      // TOUT le textblock courant + on pose un storedMark pour les
      // caractères tapés ensuite. Pourquoi : le `setMark` par défaut
      // de Tiptap ne fait que toucher le storedMark sur une sélection
      // vide → l'utilisateur clique "+" dans un picot et croit que ça
      // plante parce que le texte déjà tapé ne change pas. Cette
      // version étend automatiquement à la cellule courante, ce qui
      // colle au réflexe Google Docs / Word quand le curseur est dans
      // une ligne courte.
      setFontSize: (fontSize) => ({ tr, state, dispatch }) => {
        const type = state.schema.marks[this.name]
        if (!type) return false
        if (!dispatch) return true
        const { selection } = state
        let from = selection.from
        let to = selection.to
        if (selection.empty) {
          const $head = selection.$head
          from = $head.start($head.depth)
          to = $head.end($head.depth)
        }
        if (from < to) {
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isInline && !node.isText) return true
            const trimmedFrom = Math.max(pos, from)
            const trimmedTo = Math.min(pos + node.nodeSize, to)
            const existing = node.marks.find((m) => m.type === type)
            const nextAttrs = existing
              ? { ...existing.attrs, fontSize }
              : { fontSize }
            tr.removeMark(trimmedFrom, trimmedTo, type)
            tr.addMark(trimmedFrom, trimmedTo, type.create(nextAttrs))
            return false
          })
        }
        // Propage aussi la fontSize aux nodes listItem / taskItem qui
        // contiennent la sélection. Sans ça, le `::marker` CSS (le picot
        // • ou le numéro 1.) reste à sa taille par défaut parce qu'il
        // hérite du <li>, pas du <span> intérieur. Word fait pareil.
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
            return true
          }
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, fontSize })
          return false
        })
        const headMarks = state.selection.$head.marks()
        const existingStored = headMarks.find((m) => m.type === type)
        const storedAttrs = existingStored
          ? { ...existingStored.attrs, fontSize }
          : { fontSize }
        tr.setStoredMarks([type.create(storedAttrs)])
        return true
      },
      unsetFontSize: () => ({ tr, state, dispatch }) => {
        const type = state.schema.marks[this.name]
        if (!type) return false
        if (!dispatch) return true
        const { selection } = state
        let from = selection.from
        let to = selection.to
        if (selection.empty) {
          const $head = selection.$head
          from = $head.start($head.depth)
          to = $head.end($head.depth)
        }
        if (from < to) {
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isInline && !node.isText) return true
            const existing = node.marks.find((m) => m.type === type)
            if (!existing) return false
            const trimmedFrom = Math.max(pos, from)
            const trimmedTo = Math.min(pos + node.nodeSize, to)
            // On retire la mark complète puis on ré-applique sans
            // fontSize si d'autres attrs (fontFamily, color, etc.)
            // sont encore définis. Sinon on ne ré-applique rien.
            tr.removeMark(trimmedFrom, trimmedTo, type)
            const remaining = { ...existing.attrs }
            delete remaining.fontSize
            const hasOther = Object.keys(remaining).some(
              (k) => remaining[k] != null,
            )
            if (hasOther) {
              tr.addMark(trimmedFrom, trimmedTo, type.create(remaining))
            }
            return false
          })
        }
        // Symétrique de setFontSize : on retire aussi la fontSize sur
        // les listItem / taskItem englobants pour que le picot revienne
        // à sa taille naturelle.
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
            return true
          }
          const nextAttrs = { ...node.attrs }
          delete nextAttrs.fontSize
          tr.setNodeMarkup(pos, undefined, nextAttrs)
          return false
        })
        tr.setStoredMarks(null)
        return true
      },
      // Couleur du texte Word-friendly (même logique que setFontSize
      // plus haut). Pourquoi on ne délègue PAS à `chain().setMark()` :
      // Tiptap n'applique la mark qu'au range sélectionné ; sur une
      // sélection vide il pose juste un storedMark. Résultat « ça fait
      // rien sur le texte » si l'utilisateur clique dans un paragraphe
      // sans rien sélectionner (Word, lui, colorise toute la ligne).
      // → On étend la range au paragraphe entier du caret, on remplace
      // proprement la mark sur chaque node inline (preservation des
      // autres attrs fontSize / fontFamily), puis on pose le storedMark
      // pour les prochains caractères tapés.
      setColor: (color) => ({ tr, state, dispatch }) => {
        const type = state.schema.marks[this.name]
        if (!type) return false
        if (!dispatch) return true
        const { selection } = state
        let from = selection.from
        let to = selection.to
        if (selection.empty) {
          const $head = selection.$head
          from = $head.start($head.depth)
          to = $head.end($head.depth)
        }
        if (from < to) {
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isInline && !node.isText) return true
            const trimmedFrom = Math.max(pos, from)
            const trimmedTo = Math.min(pos + node.nodeSize, to)
            const existing = node.marks.find((m) => m.type === type)
            const nextAttrs = existing
              ? { ...existing.attrs, color }
              : { color }
            tr.removeMark(trimmedFrom, trimmedTo, type)
            tr.addMark(trimmedFrom, trimmedTo, type.create(nextAttrs))
            return false
          })
        }
        const headMarks = state.selection.$head.marks()
        const existingStored = headMarks.find((m) => m.type === type)
        const storedAttrs = existingStored
          ? { ...existingStored.attrs, color }
          : { color }
        tr.setStoredMarks([type.create(storedAttrs)])
        return true
      },
      unsetColor: () => ({ tr, state, dispatch }) => {
        const type = state.schema.marks[this.name]
        if (!type) return false
        if (!dispatch) return true
        const { selection } = state
        let from = selection.from
        let to = selection.to
        if (selection.empty) {
          const $head = selection.$head
          from = $head.start($head.depth)
          to = $head.end($head.depth)
        }
        if (from < to) {
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isInline && !node.isText) return true
            const existing = node.marks.find((m) => m.type === type)
            if (!existing) return false
            const trimmedFrom = Math.max(pos, from)
            const trimmedTo = Math.min(pos + node.nodeSize, to)
            // Retire la mark puis ré-applique sans color si d'autres
            // attrs (fontSize, fontFamily) sont encore définis. Sinon
            // on laisse le span disparaître.
            tr.removeMark(trimmedFrom, trimmedTo, type)
            const remaining = { ...existing.attrs }
            delete remaining.color
            const hasOther = Object.keys(remaining).some(
              (k) => remaining[k] != null,
            )
            if (hasOther) {
              tr.addMark(trimmedFrom, trimmedTo, type.create(remaining))
            }
            return false
          })
        }
        tr.setStoredMarks(null)
        return true
      },
    }
  },
})