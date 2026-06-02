import { redeemShareToken } from '@/apps/jacpdf/lib/cloud/documentSharesRepo'
import { downloadFile, uploadNewFile } from '@/apps/jacpdf/lib/cloud/jacpdfCloud'

// ⚠️ Garde single-run : useAuth appelle processShareTokenFromUrl() à 2
// endroits (getSession resolve + onAuthStateChange SIGNED_IN), et React
// StrictMode en dev double-mount le hook → facilement 4-6 appels.
// `replaceState` enlève bien `?share` après le 1er redeem, mais comme dispatch
// est synchrone et que les listeners (App.jsx, Editor.jsx) peuvent eux-mêmes
// trigger des re-mounts/re-renders avant que replaceState ait tourné, on
// peut entrer dans une boucle de dispatchs. Conséquence côté EditorInstance :
// le documentId est touché plusieurs fois → le useEffect de `usePresence`
// cleanup/re-subscribe en chaîne → `[presence] subscribed` puis immédiatement
// `closed`, et le user n'est jamais stable assez longtemps pour apparaître
// dans la presenceState() du tab d'en face. La variable `processed` au scope
// module garantit qu'un seul redeem effectif tourne par chargement de page.
let processed = false

// Helper : dispatch d'ouverture après un redeem réussi. Branche selon
// share_mode (Phase 3.C) :
//   - 'copy'   → on duplique le PDF original dans le cloud du destinataire
//                via uploadNewFile, puis on dispatch jacpdf:openCloudFile
//                avec l'id de la copie. L'accès user_id-based à l'original
//                créé par le redeem reste actif pour v1 (éviter les
//                complications RLS de la révoque côté destinataire).
//   - 'shared' (défaut, ou fallback si la duplication échoue) →
//                comportement classique : dispatch jacpdf:openSharedDoc +
//                stash en localStorage pour l'auto-ouverture.
//
// Si la duplication échoue (network, quota dépassé, etc.), on fallback
// vers le mode shared pour ne pas bloquer l'utilisateur — il aura toujours
// accès à l'original via le partage.
async function dispatchOpenAfterRedeem(result) {
  if (!result?.document_id || typeof window === 'undefined') return

  if (result.share_mode === 'copy') {
    try {
      const bytes = await downloadFile(result.document_id)
      const dateStr = new Date().toLocaleDateString('fr-CA')
      const copyName = `Copie partagée — ${dateStr}.pdf`
      const copy = await uploadNewFile({ name: copyName, bytes })
      if (copy?.id) {
        window.dispatchEvent(new CustomEvent('jacpdf:openCloudFile', {
          detail: { documentId: copy.id, name: copy.name || copyName },
        }))
        if (import.meta.env.DEV) console.log('[share] copy created, new doc id:', copy.id)
        return
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[share] copy duplication failed, falling back to classic share —', err?.message)
      // Fall through au mode shared ci-dessous
    }
  }

  // Mode 'shared' (ou fallback après échec de duplication en mode copy)
  window.dispatchEvent(new CustomEvent('jacpdf:openSharedDoc', {
    detail: { documentId: result.document_id, role: result.role },
  }))
  try {
    localStorage.setItem('jacpdf_pendingSharedDoc', JSON.stringify({
      documentId: result.document_id,
      role: result.role,
      ts: Date.now(),
    }))
  } catch { /* localStorage indisponible : fallback degrade gracieusement */ }
  if (import.meta.env.DEV) console.log('[share] auto-open dispatched for doc', result.document_id, 'role:', result.role)
}

/**
 * Au démarrage de l'app, regarde si l'URL contient `?share=<token>`. Si oui :
 *   - Tente de redeem le token (crée une row user_id-based pour le user actuel
 *     dans document_shares avec le rôle du token, idempotent)
 *   - Retire le `share` query param de l'URL pour pas qu'un refresh re-redeem
 *   - Retourne la row token (`{ document_id, role, ... }`) pour redirection
 *
 * Pré-requis : user authentifié. Si non auth, retourne null sans erreur.
 *
 * @returns {Promise<{document_id: string, role: string}|null>}
 */
export async function processShareTokenFromUrl() {
  if (typeof window === 'undefined') return null
  // Single-run guard — cf. commentaire ci-dessus.
  if (processed) return null
  const params = new URLSearchParams(window.location.search)
  const token = params.get('share')
  if (!token) return null
  // Marque comme traité dès qu'on a un token à traiter, AVANT même le redeem
  // RPC. Si un 2e appel concurrent passe le if(processed) check (race entre
  // deux mounts StrictMode), le 1er a déjà mis le flag et le 2e retourne null.
  processed = true

  let result = null
  try {
    result = await redeemShareToken(token)
  } catch (err) {
    if (import.meta.env.DEV) console.error('[share] redeem failed —', err?.message, '\n  details:', err?.details)
  }

  // Auto-ouverture (Phase 4.5) : dispatch un CustomEvent + stash en
  // localStorage pour que l'app puisse ouvrir le doc partage sans naviguer
  // manuellement. Branche selon share_mode (Phase 3.C) — cf. helper.
  // Les listeners possibles :
  //   - App.jsx : addEventListener('jacpdf:openSharedDoc', ...)
  //   - SuiteShell : ouvre ensuite /jacsuite/jacpdf/document/:id
  //   - HomeContent : addEventListener('jacpdf:openCloudFile', ...) (pour les copies)
  //   - fallback localStorage : lit `jacpdf_pendingSharedDoc` au mount
  await dispatchOpenAfterRedeem(result)

  // Retire le query param de l'URL (replaceState : pas d'entry history)
  params.delete('share')
  const newSearch = params.toString()
  const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash
  window.history.replaceState({}, '', newUrl)

  return result
}

/**
 * Stash un token en localStorage pour le redeem APRÈS le login (si l'user
 * clique un lien sans être authentifié). À appeler depuis l'écran de login
 * AVANT de lancer le flow OAuth si tu détectes un `?share=<token>`.
 */
export function stashTokenForLater() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  const token = params.get('share')
  if (!token) return false
  try {
    localStorage.setItem('jacpdf_pendingShareToken', token)
    return true
  } catch {
    return false
  }
}

/**
 * Redeem un token précédemment stashed. À appeler après login réussi.
 */
export async function redeemStashedToken() {
  if (typeof window === 'undefined') return null
  let token
  try {
    token = localStorage.getItem('jacpdf_pendingShareToken')
  } catch {
    return null
  }
  if (!token) return null
  try {
    const result = await redeemShareToken(token)
    localStorage.removeItem('jacpdf_pendingShareToken')
    // Meme dispatch d'event que processShareTokenFromUrl pour homogeneite.
    // Branche selon share_mode (Phase 3.C) — cf. helper dispatchOpenAfterRedeem.
    await dispatchOpenAfterRedeem(result)
    return result
  } catch (err) {
    if (import.meta.env.DEV) console.error('[share] redeem stashed failed —', err?.message, '\n  details:', err?.details)
    return null
  }
}