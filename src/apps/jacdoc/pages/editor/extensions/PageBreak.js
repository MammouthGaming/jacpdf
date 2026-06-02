import { Node } from '@tiptap/core'

// Node Tiptap personnalisé : saut de page DUR (Ctrl/Cmd+Entrée), comme
// Word et Google Docs. Atom & block — rend un marker visible (ligne
// pointillée « Saut de page ») à la position où l'utilisateur l'a inséré
// dans le flux. La logique de pagination du JacDocEditor reconnaît ce
// node via son data-attribute et force le bloc SUIVANT à démarrer au
// sommet de la page suivante (peu importe sa position naturelle).
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  parseHTML() {
    return [{ tag: 'div[data-jacdoc-pagebreak-node]' }]
  },
  renderHTML() {
    return [
      'div',
      {
        'data-jacdoc-pagebreak-node': 'true',
        class: 'jacdoc-pagebreak-node',
        contenteditable: 'false',
      },
    ]
  },
  addCommands() {
    return {
      insertPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }),
    }
  },
  addKeyboardShortcuts() {
    return {
      // Mod-Enter = Ctrl+Entrée (Win/Linux) ou Cmd+Entrée (Mac). Même
      // raccourci que Word et Google Docs (Insertion > Saut de page).
      'Mod-Enter': () => this.editor.commands.insertPageBreak(),
    }
  },
})