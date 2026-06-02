import { supabase } from '@/shared/lib/infra/supabase'

export const JACCALENDRIER_SOURCE = 'jaccalendrier_cloud'

export class JacCalendrierCloudError extends Error {
  constructor(message, { details } = {}) {
    super(message)
    this.name = 'JacCalendrierCloudError'
    this.details = details
  }
}

function cleanText(t, fallback = '') {
  return (t || '').toString().trim() || fallback
}

function roleCanEdit(role) {
  return role === 'owner' || role === 'editor'
}

function normalizeCalendar(row, currentUserId, shareRole) {
  if (!row) return null
  const isOwner = !!currentUserId && row.user_id === currentUserId
  const role = isOwner ? 'owner' : (shareRole || 'viewer')
  return {
    id: row.id,
    cloudId: row.id,
    name: row.name,
    color: row.color,
    system: !!row.system,
    visible: row.visible !== false,
    position: row.position ?? 0,
    ownerId: row.user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: JACCALENDRIER_SOURCE,
    isShared: !isOwner,
    shareRole: role,
    canEdit: roleCanEdit(role),
  }
}

function normalizeEvent(row, currentUserId, shareRole) {
  if (!row) return null
  const isOwner = !!currentUserId && row.user_id === currentUserId
  const role = isOwner ? 'owner' : (shareRole || 'viewer')
  return {
    id: row.id,
    cloudId: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description ?? null,
    location: row.location ?? null,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: !!row.all_day,
    recurrence: row.recurrence,
    linkedTaskId: row.linked_task_id ?? null,
    reminders: row.reminders || [],
    revision: row.revision || 1,
    ownerId: row.user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.updated_at,
    source: JACCALENDRIER_SOURCE,
    isShared: !isOwner,
    shareRole: role,
    canEdit: roleCanEdit(role),
  }
}

function normalizeIcalSub(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    color: row.color,
    enabled: row.enabled !== false,
    refreshMinutes: row.refresh_minutes ?? 60,
    lastSyncedAt: row.last_synced_at,
    lastSyncStatus: row.last_sync_status || 'pending',
    lastSyncError: row.last_sync_error,
    position: row.position ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeIcalEvent(row) {
  if (!row) return null
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    icalUid: row.ical_uid,
    title: row.title,
    description: row.description ?? null,
    location: row.location ?? null,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: !!row.all_day,
    rrule: row.rrule,
    readOnly: true,
  }
}

async function getCurrentCalendarRole(calendarId, row, currentUserId) {
  if (!calendarId || !row || !currentUserId) return 'viewer'
  if (row.user_id === currentUserId) return 'owner'
  const { data, error } = await supabase.rpc('jaccalendrier_role_for_current_user', {
    p_calendar_id: calendarId,
  })
  if (error) return 'viewer'
  return data || 'viewer'
}

// ─── Calendriers ─────────────────────────────────────

export async function listCalendars({ scope = 'all' } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null

  let q = supabase
    .from('jaccalendrier_calendars')
    .select('id, user_id, name, color, system, visible, position, created_at, updated_at')
    .order('position', { ascending: true })

  if (scope === 'mine' && currentUserId) q = q.eq('user_id', currentUserId)
  else if (scope === 'shared' && currentUserId) q = q.neq('user_id', currentUserId)

  const { data, error } = await q
  if (error) throw new JacCalendrierCloudError('listCalendars failed', { details: error })

  const rows = data || []
  const sharedIds = rows.filter((r) => r.user_id !== currentUserId).map((r) => r.id)
  let roleByCalendarId = {}
  if (sharedIds.length > 0 && currentUserId) {
    const userEmail = (user?.email || '').trim().toLowerCase()
    const shareQuery = supabase
      .from('jaccalendrier_shares')
      .select('calendar_id, role, shared_with_user_id, shared_with_email')
      .in('calendar_id', sharedIds)
    const { data: shareRows } = userEmail
      ? await shareQuery.or(`shared_with_user_id.eq.${currentUserId},shared_with_email.eq.${userEmail}`)
      : await shareQuery.eq('shared_with_user_id', currentUserId)
    roleByCalendarId = (shareRows || []).reduce((acc, s) => {
      const next = s.role || 'viewer'
      if (!acc[s.calendar_id] || roleCanEdit(next)) acc[s.calendar_id] = next
      return acc
    }, {})
  }

  return rows.map((row) => normalizeCalendar(
    row,
    currentUserId,
    row.user_id === currentUserId ? 'owner' : roleByCalendarId[row.id] || 'viewer',
  ))
}

export async function createCalendar({ name, color = '#39FF14', system = false, visible = true, position = 0 } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacCalendrierCloudError('not authenticated')

  const { data, error } = await supabase
    .from('jaccalendrier_calendars')
    .insert({
      user_id: user.id,
      name: cleanText(name, 'Nouveau calendrier'),
      color,
      system,
      visible,
      position,
    })
    .select('*')
    .single()

  if (error) throw new JacCalendrierCloudError('createCalendar failed', { details: error })
  return normalizeCalendar(data, user.id, 'owner')
}

export async function updateCalendar(calendarId, patch = {}) {
  if (!calendarId) throw new JacCalendrierCloudError('calendarId is required')
  const updates = { updated_at: new Date().toISOString() }
  if ('name' in patch) updates.name = cleanText(patch.name, 'Sans titre')
  if ('color' in patch) updates.color = patch.color
  if ('visible' in patch) updates.visible = !!patch.visible
  if ('position' in patch) updates.position = patch.position

  const { data, error } = await supabase
    .from('jaccalendrier_calendars')
    .update(updates)
    .eq('id', calendarId)
    .select('*')
    .single()

  if (error) throw new JacCalendrierCloudError('updateCalendar failed', { details: error })

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  const role = await getCurrentCalendarRole(calendarId, data, currentUserId)
  return normalizeCalendar(data, currentUserId, role)
}

export async function renameCalendar(id, name) { return updateCalendar(id, { name }) }
export async function toggleCalendarVisibility(id, visible) { return updateCalendar(id, { visible }) }

export async function deleteCalendar(calendarId) {
  const { error } = await supabase
    .from('jaccalendrier_calendars')
    .delete()
    .eq('id', calendarId)
  if (error) throw new JacCalendrierCloudError('deleteCalendar failed', { details: error })
}

// ─── Événements ──────────────────────────────────────

/**
 * Liste les événements visibles dans une fenêtre temporelle.
 *
 * @param {object} args
 * @param {string} [args.from] ISO timestamp inclusif.
 * @param {string} [args.to]   ISO timestamp exclusif.
 * @param {Array<string>} [args.calendarIds] - filtre par calendriers.
 * @param {'all'|'mine'|'shared'} [args.scope]
 */
export async function listEvents({ from, to, calendarIds, scope = 'all', limit = 1000 } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null

  let q = supabase
    .from('jaccalendrier_events')
    .select('*')
    .limit(limit)
    .order('start_at', { ascending: true })

  if (scope === 'mine' && currentUserId) q = q.eq('user_id', currentUserId)
  else if (scope === 'shared' && currentUserId) q = q.neq('user_id', currentUserId)
  if (Array.isArray(calendarIds) && calendarIds.length > 0) q = q.in('calendar_id', calendarIds)
  if (from) q = q.gte('start_at', from)
  if (to) q = q.lt('start_at', to)

  const { data, error } = await q
  if (error) throw new JacCalendrierCloudError('listEvents failed', { details: error })
  return (data || []).map((row) => normalizeEvent(
    row,
    currentUserId,
    row.user_id === currentUserId ? 'owner' : 'viewer',
  ))
}

export async function getEvent(eventId) {
  if (!eventId) return null
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  const { data, error } = await supabase
    .from('jaccalendrier_events')
    .select('*')
    .eq('id', eventId)
    .single()
  if (error) throw new JacCalendrierCloudError('event not found', { details: error })
  return normalizeEvent(
    data,
    currentUserId,
    data.user_id === currentUserId ? 'owner' : 'viewer',
  )
}

export async function createEvent(payload = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacCalendrierCloudError('not authenticated')
  if (!payload.calendarId) throw new JacCalendrierCloudError('calendarId is required')
  if (!payload.startAt) throw new JacCalendrierCloudError('startAt is required')

  const insert = {
    user_id: user.id,
    calendar_id: payload.calendarId,
    title: cleanText(payload.title, 'Nouvel événement'),
    description: payload.description ?? null,
    location: payload.location ?? null,
    start_at: payload.startAt,
    end_at: payload.endAt ?? null,
    all_day: !!payload.allDay,
    recurrence: payload.recurrence ?? null,
    linked_task_id: payload.linkedTaskId ?? null,
    reminders: payload.reminders || [],
  }

  const { data, error } = await supabase
    .from('jaccalendrier_events')
    .insert(insert)
    .select('*')
    .single()

  if (error) throw new JacCalendrierCloudError('createEvent failed', { details: error })
  return normalizeEvent(data, user.id, 'owner')
}

export async function updateEvent(eventId, patch = {}) {
  if (!eventId) throw new JacCalendrierCloudError('eventId is required')
  const updates = { updated_at: new Date().toISOString() }
  if ('calendarId' in patch) updates.calendar_id = patch.calendarId
  if ('title' in patch) updates.title = cleanText(patch.title, 'Sans titre')
  if ('description' in patch) updates.description = patch.description
  if ('location' in patch) updates.location = patch.location
  if ('startAt' in patch) updates.start_at = patch.startAt
  if ('endAt' in patch) updates.end_at = patch.endAt
  if ('allDay' in patch) updates.all_day = !!patch.allDay
  if ('recurrence' in patch) updates.recurrence = patch.recurrence
  if ('linkedTaskId' in patch) updates.linked_task_id = patch.linkedTaskId
  if ('reminders' in patch) updates.reminders = patch.reminders || []

  const { data: existing, error: existingErr } = await supabase
    .from('jaccalendrier_events')
    .select('revision')
    .eq('id', eventId)
    .single()
  if (existingErr) throw new JacCalendrierCloudError('event not found', { details: existingErr })
  updates.revision = (existing?.revision || 1) + 1

  const { data, error } = await supabase
    .from('jaccalendrier_events')
    .update(updates)
    .eq('id', eventId)
    .select('*')
    .single()

  if (error) throw new JacCalendrierCloudError('updateEvent failed', { details: error })
  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id || null
  return normalizeEvent(
    data,
    currentUserId,
    data.user_id === currentUserId ? 'owner' : 'viewer',
  )
}

export async function deleteEvent(eventId) {
  const { error } = await supabase
    .from('jaccalendrier_events')
    .delete()
    .eq('id', eventId)
  if (error) throw new JacCalendrierCloudError('deleteEvent failed', { details: error })
}

export async function saveEvent(payload = {}) {
  const id = payload.cloudId || payload.eventId || payload.id
  if (id) {
    const { cloudId, eventId, id: _i, ...rest } = payload
    return updateEvent(id, rest)
  }
  return createEvent(payload)
}

// ─── Abonnements iCal ───────────────────────────────

export async function listIcalSubscriptions() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('jaccalendrier_ical_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('position', { ascending: true })
  if (error) throw new JacCalendrierCloudError('listIcalSubscriptions failed', { details: error })
  return (data || []).map(normalizeIcalSub)
}

export async function createIcalSubscription({ name, url, color = '#8d99ae', refreshMinutes = 60, position = 0 } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new JacCalendrierCloudError('not authenticated')
  if (!url?.trim()) throw new JacCalendrierCloudError('url is required')

  const { data, error } = await supabase
    .from('jaccalendrier_ical_subscriptions')
    .insert({
      user_id: user.id,
      name: cleanText(name, 'Calendrier externe'),
      url: url.trim(),
      color,
      refresh_minutes: refreshMinutes,
      position,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new JacCalendrierCloudError('Cette URL iCal est déjà abonnée.', { details: { duplicateUrl: true, error } })
    }
    throw new JacCalendrierCloudError('createIcalSubscription failed', { details: error })
  }
  return normalizeIcalSub(data)
}

export async function updateIcalSubscription(id, patch = {}) {
  if (!id) throw new JacCalendrierCloudError('id is required')
  const updates = { updated_at: new Date().toISOString() }
  if ('name' in patch) updates.name = cleanText(patch.name, 'Sans titre')
  if ('url' in patch) updates.url = (patch.url || '').trim()
  if ('color' in patch) updates.color = patch.color
  if ('enabled' in patch) updates.enabled = !!patch.enabled
  if ('refreshMinutes' in patch) updates.refresh_minutes = patch.refreshMinutes
  if ('position' in patch) updates.position = patch.position

  const { data, error } = await supabase
    .from('jaccalendrier_ical_subscriptions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new JacCalendrierCloudError('updateIcalSubscription failed', { details: error })
  return normalizeIcalSub(data)
}

export async function deleteIcalSubscription(id) {
  const { error } = await supabase
    .from('jaccalendrier_ical_subscriptions')
    .delete()
    .eq('id', id)
  if (error) throw new JacCalendrierCloudError('deleteIcalSubscription failed', { details: error })
}

/**
 * Marque la sub comme synchronisée. Appelé par le fetcher iCal (Phase 3).
 */
export async function recordIcalSync(id, { status = 'success', error = null } = {}) {
  const { data, error: err } = await supabase
    .from('jaccalendrier_ical_subscriptions')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (err) throw new JacCalendrierCloudError('recordIcalSync failed', { details: err })
  return normalizeIcalSub(data)
}

// ─── Cache d'événements iCal ───────────────────────────────

export async function listIcalEvents({ subscriptionId, from, to, limit = 1000 } = {}) {
  if (!subscriptionId) return []
  let q = supabase
    .from('jaccalendrier_ical_events')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .order('start_at', { ascending: true })
    .limit(limit)
  if (from) q = q.gte('start_at', from)
  if (to) q = q.lt('start_at', to)
  const { data, error } = await q
  if (error) throw new JacCalendrierCloudError('listIcalEvents failed', { details: error })
  return (data || []).map(normalizeIcalEvent)
}

/**
 * Remplace l'ensemble des événements parsés d'une subscription par une
 * nouvelle batch. Appelé par le fetcher iCal (Phase 3).
 */
export async function replaceIcalEvents(subscriptionId, events) {
  if (!subscriptionId) throw new JacCalendrierCloudError('subscriptionId is required')
  if (!Array.isArray(events)) events = []

  const { error: delErr } = await supabase
    .from('jaccalendrier_ical_events')
    .delete()
    .eq('subscription_id', subscriptionId)
  if (delErr) throw new JacCalendrierCloudError('replaceIcalEvents delete failed', { details: delErr })

  if (events.length === 0) return []

  const rows = events.map((e) => ({
    subscription_id: subscriptionId,
    ical_uid: e.icalUid || e.uid || crypto.randomUUID(),
    title: cleanText(e.title, ''),
    description: e.description ?? null,
    location: e.location ?? null,
    start_at: e.startAt,
    end_at: e.endAt ?? null,
    all_day: !!e.allDay,
    rrule: e.rrule ?? null,
  }))

  const { data, error } = await supabase
    .from('jaccalendrier_ical_events')
    .insert(rows)
    .select('*')
  if (error) throw new JacCalendrierCloudError('replaceIcalEvents insert failed', { details: error })
  return (data || []).map(normalizeIcalEvent)
}