import { Extension } from '@tiptap/core'

// Règle Word : Tab insère un vrai espacement visuel au lieu de déplacer le
// focus hors de l'éditeur. Les taquets posés sur la règle restent visibles
// et l'insertion conserve un comportement stable dans Tiptap.
export const RulerTabKey = Extension.create({
  name: 'rulerTabKey',
  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.insertContent('    '),
      'Shift-Tab': () => false,
    }
  },
})