// Editor.jsx — alias rétro-compat (Phase 1 du refactor multi-apps JacSuite).
//
// La logique du shell (barre d'onglets, dispatcher par app, suspension
// d'onglets, auto-ouverture des docs partagés, groupes d'onglets style
// Chrome...) vit désormais dans `src/shell/SuiteShell.jsx`.
//
// Ce fichier ne reste que comme alias ré-export pour que les imports
// existants `@/apps/jacpdf/pages/editor/Editor` continuent de fonctionner
// sans casser pendant la migration. Toutes les routes dans App.jsx
// pointent maintenant directement vers SuiteShell.
//
// ✅ À supprimer en Phase 4+ quand toutes les références auront migré vers
//    `@/shell/SuiteShell`.
export { default } from '@/shell/SuiteShell'