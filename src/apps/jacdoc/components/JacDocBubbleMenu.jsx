// Phase 1 — placeholder.
//
// Tiptap v3 a retiré l'export `BubbleMenu` du package `@tiptap/react`.
// Selon la version exacte installée :
//   - v2.x  : `import { BubbleMenu } from '@tiptap/react'`
//   - v3.x  : `import { BubbleMenu } from '@tiptap/react/menus'`
//             ou via le package standalone `@tiptap/extension-bubble-menu`.
//
// Pour ne pas bloquer le smoke test, on rend null en Phase 1. Toutes les
// actions disponibles dans le bubble menu (gras, italique, souligné, barré,
// code en ligne, lien) sont déjà exposées par JacDocToolbar — zero perte
// fonctionnelle, juste un confort UX en moins.
//
// Phase 2 : vérifier la version exacte de @tiptap/react dans package.json,
// puis réactiver le composant avec le bon import.

export default function JacDocBubbleMenu() {
  return null
}