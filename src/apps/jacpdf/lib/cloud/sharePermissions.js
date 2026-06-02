// src/lib/cloud/sharePermissions.js — Phase 3.C du chantier Realtime
// Helper de calcul des permissions de fonctionnalités à partir d'une share row.
// Pas de React, pas d'effets de bord — pure logique testable.

/**
 * À partir d'un share row (ou null/undefined si l'user est owner du doc),
 * retourne le rôle effectif et le sous-ensemble de features autorisées.
 *
 * @param {object|null|undefined} myShare - La row document_shares de l'user
 *   courant, ou null si je suis owner (créateur du doc, pas de row de partage
 *   avec moi-même).
 * @returns  role: 'owner'|'viewer'|'commenter'|'editor', allowed: Set<string>|null 
 *   - `allowed === null` : pas de restriction (owner ou editor sans feature_permissions)
 *   - `allowed instanceof Set` : restriction granulaire (peut être vide pour viewer)
 */
export function computeSharePermissions(myShare) {
  if (!myShare) return { role: 'owner', allowed: null }
  const { role, feature_permissions } = myShare
  if (role === 'viewer') {
    // Lecture seule absolue — aucun outil d'édition.
    return { role: 'viewer', allowed: new Set() }
  }
  if (role === 'commenter') {
    // Seul le tool Commentaire est autorisé. Les autres (text, pencil, etc.)
    // sont masqués dans la Toolbar.
    return { role: 'commenter', allowed: new Set(['comments']) }
  }
  if (role === 'editor') {
    const list = feature_permissions?.allowed
    return {
      role: 'editor',
      // Array depuis Supabase (jsonb) → Set pour les lookups O(1) côté UI.
      // null/undefined → pas de restriction configurée → tout autorisé.
      allowed: Array.isArray(list) ? new Set(list) : null,
    }
  }
  // Rôle inconnu (mode 'copy' n'arrive pas ici puisqu'après redemption la copie
  // appartient à l'user) → fail open vers owner pour ne pas bloquer.
  return { role: 'owner', allowed: null }
}

/**
 * Vérifie si l'user a la permission d'utiliser une feature spécifique.
 *
 * @param  role: string, allowed: Set<string>|null  perms - Résultat de
 *   computeSharePermissions.
 * @param {string} featureKey - Clé de feature : 'pencil' | 'highlighter' |
 *   'shapes' | 'text' | 'images' | 'comments' | 'pages' | 'addPages' |
 *   'export' | 'editOthers' (manipulation d'annotations existantes —
 *   déplacer, redim, supprimer ; bloqué ouvre ReadOnlyBlockedModal côté
 *   EditorInstance). 'pages' couvre suppression / réordonnancement / reset ;
 *   'addPages' couvre uniquement l'ajout d'une page vierge ou la duplication
 *   (gaté dans handleAddBlankPage et handleDuplicatePage).
 * @returns {boolean}
 */
export function canUseFeature(perms, featureKey) {
  if (!perms) return true                  // pas de share = owner = tout autorisé
  if (perms.allowed === null) return true  // owner ou editor sans restrictions
  return perms.allowed.has(featureKey)
}