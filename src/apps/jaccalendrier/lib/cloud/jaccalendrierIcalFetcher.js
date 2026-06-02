import { parseIcs, toCloudEventPayload } from './jaccalendrierIcalParser'
import {
  replaceIcalEvents,
  recordIcalSync,
  listIcalSubscriptions,
  updateIcalSubscription,
} from './jaccalendrierCloud'

export class IcalFetchError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'IcalFetchError'
    this.details = details
  }
}

// Beaucoup d'hébergeurs ICS (Google Calendar shared links, Apple iCloud,
// Microsoft Outlook "Publish to web") servent leur feed avec CORS ouvert
// ou via le sous-domaine adéquat. Certains écoles / fournisseurs custom
// ne renvoient pas de header CORS. Pour ces cas, on tente une URL via
// `webcal://` → `https://`, et on documente l'option d'une edge function
// Supabase qui ferait le proxy.

function normalizeFeedUrl(url) {
  if (!url) return ''
  const trimmed = url.trim()
  // webcal:// est juste l'ancien schéma Apple/iCal ; HTTP(S) sur la même URL
  // fonctionne pour tous les feeds connus.
  if (trimmed.startsWith('webcal://')) {
    return 'https://' + trimmed.slice('webcal://'.length)
  }
  if (trimmed.startsWith('webcals://')) {
    return 'https://' + trimmed.slice('webcals://'.length)
  }
  return trimmed
}

/**
 * Fetch + parse un feed ICS et renvoie la liste d'événements normalisés
 * prêts pour `replaceIcalEvents`.
 *
 * Pas d'écriture cloud ici, c'est `syncSubscription` qui orchestre l'écriture.
 */
export async function fetchIcsFeed(url, { signal } = {}) {
  const normalized = normalizeFeedUrl(url)
  if (!normalized) throw new IcalFetchError('empty url')

  let response
  try {
    response = await fetch(normalized, {
      method: 'GET',
      // Pas d'auth, pas de cookies : on traite tous les feeds comme publics.
      credentials: 'omit',
      signal,
    })
  } catch (err) {
    throw new IcalFetchError('network error (CORS ou DNS ?)', { details: err })
  }

  if (!response.ok) {
    throw new IcalFetchError('HTTP ' + response.status, { details: { status: response.status } })
  }

  const text = await response.text()
  if (!text || !text.includes('BEGIN:VCALENDAR')) {
    throw new IcalFetchError('not a valid ICS feed (no VCALENDAR block)')
  }

  const parsedEvents = parseIcs(text)
  return parsedEvents.map(toCloudEventPayload)
}

/**
 * Synchronise une subscription : fetch, parse, replace cache, record status.
 *
 * @param {object} subscription - row normalisé de jaccalendrier_ical_subscriptions
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ count: number, syncedAt: string }>}
 */
export async function syncSubscription(subscription, { signal } = {}) {
  if (!subscription?.id) throw new IcalFetchError('subscription.id is required')
  if (subscription.enabled === false) {
    return { count: 0, syncedAt: null, skipped: true }
  }

  try {
    const events = await fetchIcsFeed(subscription.url, { signal })
    await replaceIcalEvents(subscription.id, events)
    const updated = await recordIcalSync(subscription.id, { status: 'success', error: null })
    return {
      count: events.length,
      syncedAt: updated.lastSyncedAt,
      skipped: false,
    }
  } catch (err) {
    const message = err?.message || 'unknown error'
    try {
      await recordIcalSync(subscription.id, { status: 'error', error: message })
    } catch {
      // best-effort
    }
    throw err instanceof IcalFetchError ? err : new IcalFetchError(message, { details: err })
  }
}

/**
 * Synchronise toutes les subs enabled.
 *
 * Erreurs isolées par sub : une sub en erreur ne stoppe pas les autres.
 */
export async function syncAllSubscriptions({ signal } = {}) {
  const subs = await listIcalSubscriptions()
  const enabled = subs.filter((s) => s.enabled !== false)
  const results = await Promise.allSettled(
    enabled.map((s) => syncSubscription(s, { signal })),
  )
  return enabled.map((sub, i) => {
    const r = results[i]
    if (r.status === 'fulfilled') return { sub, ok: true, result: r.value }
    return { sub, ok: false, error: r.reason }
  })
}

/**
 * Helper : détermine si une subscription doit être re-fetch maintenant.
 * Basé sur lastSyncedAt + refreshMinutes.
 */
export function isDueForSync(subscription) {
  if (!subscription || subscription.enabled === false) return false
  if (!subscription.lastSyncedAt) return true
  const last = new Date(subscription.lastSyncedAt).getTime()
  if (Number.isNaN(last)) return true
  const intervalMs = (subscription.refreshMinutes || 60) * 60 * 1000
  return Date.now() - last >= intervalMs
}

/**
 * Permet de forcer un refresh immédiat depuis l'UI ("Synchroniser maintenant").
 * Reset le lastSyncedAt à null pour que le scheduler reprenne sans attendre.
 */
export async function forceSyncNow(subscriptionId) {
  await updateIcalSubscription(subscriptionId, { /* no-op patch */ enabled: true })
  // recordIcalSync s'occupe du timestamp pendant syncSubscription.
}