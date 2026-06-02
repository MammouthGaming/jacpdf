import { supabase } from '@/shared/lib/infra/supabase'
import { getDoc } from '@/apps/jacdoc/lib/cloud/jacdocCloud'

export class JacdocShareTokenRedemptionError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JacdocShareTokenRedemptionError'
    this.details = details
  }
}

/**
 * Redeem un lien public JacDoc.
 *
 * Flow attendu :
 *   1. URL contient `?jacdocShare=<token>`
 *   2. Supabase RPC `redeem_jacdoc_share_token` valide le token et crée
 *      une row `jacdoc_shares.shared_with_user_id = auth.uid()`
 *   3. On charge le document via RLS maintenant que l'accès existe
 *   4. SuiteShell l'upsert dans IndexedDB puis ouvre l'onglet JacDoc
 */
export async function redeemJacdocShareToken(token) {
  if (!token) return null

  const { data, error } = await supabase.rpc('redeem_jacdoc_share_token', {
    p_token: token,
  })

  if (error) {
    if (error.code === 'P0001' || error.message?.includes('invalid_token')) {
      return null
    }
    throw new JacdocShareTokenRedemptionError('redeem token failed', { details: error })
  }

  const first = Array.isArray(data) ? data[0] : data
  const documentId = first?.document_id || first?.documentId

  if (!documentId) {
    throw new JacdocShareTokenRedemptionError('redeem token returned no document id', {
      details: data,
    })
  }

  const doc = await getDoc(documentId)
  return {
    documentId,
    role: first?.role || 'viewer',
    doc,
  }
}

// Compat ancien import pendant le refactor JacSuite.
// Certains chunks/HMR peuvent encore demander `redeemShareTokenFromUrl`.
// On garde l'alias pour éviter un crash module au chargement.
export const redeemShareTokenFromUrl = redeemJacdocShareToken

/**
 * Extrait puis nettoie `?jacdocShare=...` de l'URL courante.
 * On enlève le token après capture pour éviter de le re-redeem à chaque
 * refresh / navigation interne.
 */
export function consumeJacdocShareTokenFromUrl() {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  const token = url.searchParams.get('jacdocShare')
  if (!token) return null

  url.searchParams.delete('jacdocShare')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)

  return token
}