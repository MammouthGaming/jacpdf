// Parser ICS (RFC 5545) minimal pour JacCalendrier.
//
// Gère les cas courants des feeds publics :
//   - VEVENT block extraction
//   - line unfolding (CRLF + espace ou tab → continuation)
//   - SUMMARY, DESCRIPTION, LOCATION, UID
//   - DTSTART / DTEND (DATE et DATE-TIME, TZID, UTC suffix Z)
//   - RRULE (gardé brut, expansion côté client si besoin)
//
// Ce que le parser NE gère PAS (volontairement, simplicité phase 3) :
//   - VTIMEZONE custom : on accepte TZID en métadonnée mais on convertit
//     en ISO local sans appliquer la définition.
//   - Expansion RRULE / EXDATE / RECURRENCE-ID : on stocke la RRULE brute,
//     le rendu côté vue calendrier appliquera l'expansion.
//   - VTODO / VJOURNAL.
//
// Si un feed pose problème, swap vers `ical.js` (npm) sans changer l'API.

export class IcalParseError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'IcalParseError'
    this.details = details
  }
}

/**
 * Déplie les lignes selon RFC 5545 §3.1 :
 * une ligne commençant par un espace ou un tab est la continuation de la
 * précédente. Le saut de ligne + espace doit être supprimé.
 */
function unfoldLines(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const out = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

/**
 * Parse `KEY;PARAM=VAL:VALUE` → { key, params, value }.
 */
function parseContentLine(line) {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)

  const parts = head.split(';')
  const key = parts[0].toUpperCase()
  const params = {}
  for (let i = 1; i < parts.length; i += 1) {
    const [pKey, pVal] = parts[i].split('=')
    if (pKey) params[pKey.toUpperCase()] = (pVal || '').replace(/^"|"$/g, '')
  }
  return { key, params, value }
}

/**
 * Unescape les valeurs TEXT : \\n, \\,, \\;, \\\\.
 */
function unescapeText(v) {
  return (v || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/**
 * Convertit une valeur DTSTART/DTEND en ISO 8601 + flag allDay.
 *
 * Formats acceptés :
 *   - "20251231"           → DATE (allDay = true)
 *   - "20251231T235959"    → DATE-TIME local (sans Z)
 *   - "20251231T235959Z"   → DATE-TIME UTC
 *   - TZID=... → datetime traité comme local, TZID conservé en metadata
 */
function parseIcsDate(value, params = {}) {
  if (!value) return { iso: null, allDay: false }

  const isDateOnly = /^\d{8}$/.test(value) || params.VALUE === 'DATE'
  if (isDateOnly) {
    const y = value.slice(0, 4)
    const m = value.slice(4, 6)
    const d = value.slice(6, 8)
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, allDay: true, tzid: null }
  }

  // Format DATE-TIME : YYYYMMDDTHHMMSS[Z]
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) {
    // On essaie un Date(value) en dernier recours.
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString(), allDay: false, tzid: params.TZID || null }
    }
    return { iso: null, allDay: false }
  }
  const [, y, mo, d, hh, mm, ss, z] = m
  const isoLocal = `${y}-${mo}-${d}T${hh}:${mm}:${ss}`
  if (z === 'Z') {
    return { iso: `${isoLocal}.000Z`, allDay: false, tzid: 'UTC' }
  }
  // Local time sans TZID : on l'interprète comme local browser.
  // Local time avec TZID : on garde la TZID en metadata ; la conversion
  // proprement faite nécessite une lib (Intl.DateTimeFormat) au niveau
  // de la consommation.
  const localDate = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
  )
  return { iso: localDate.toISOString(), allDay: false, tzid: params.TZID || null }
}

/**
 * Parse un texte ICS et retourne la liste des événements normalisés.
 */
export function parseIcs(text) {
  if (!text || typeof text !== 'string') {
    throw new IcalParseError('empty ICS input')
  }

  const lines = unfoldLines(text)
  const events = []
  let current = null
  let inEvent = false

  for (const raw of lines) {
    if (!raw) continue
    const parsed = parseContentLine(raw)
    if (!parsed) continue
    const { key, params, value } = parsed

    if (key === 'BEGIN' && value === 'VEVENT') {
      inEvent = true
      current = {
        uid: null,
        summary: '',
        description: null,
        location: null,
        startAt: null,
        endAt: null,
        allDay: false,
        tzid: null,
        rrule: null,
      }
      continue
    }
    if (key === 'END' && value === 'VEVENT') {
      if (current && current.startAt) {
        // UID fallback (RFC l'exige mais certains feeds sont laxistes).
        if (!current.uid) {
          current.uid = `${current.summary}-${current.startAt}`
        }
        events.push(current)
      }
      inEvent = false
      current = null
      continue
    }

    if (!inEvent || !current) continue

    switch (key) {
      case 'UID':
        current.uid = value
        break
      case 'SUMMARY':
        current.summary = unescapeText(value)
        break
      case 'DESCRIPTION':
        current.description = unescapeText(value)
        break
      case 'LOCATION':
        current.location = unescapeText(value)
        break
      case 'DTSTART': {
        const parsed = parseIcsDate(value, params)
        current.startAt = parsed.iso
        current.allDay = parsed.allDay
        current.tzid = parsed.tzid || current.tzid
        break
      }
      case 'DTEND': {
        const parsed = parseIcsDate(value, params)
        current.endAt = parsed.iso
        if (parsed.allDay) current.allDay = true
        break
      }
      case 'RRULE':
        current.rrule = value
        break
      default:
        break
    }
  }

  return events
}

/**
 * Convertit un event parsé vers la forme attendue par
 * `replaceIcalEvents` du repo cloud.
 */
export function toCloudEventPayload(parsed) {
  return {
    icalUid: parsed.uid,
    title: parsed.summary || '',
    description: parsed.description,
    location: parsed.location,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    allDay: !!parsed.allDay,
    rrule: parsed.rrule,
  }
}