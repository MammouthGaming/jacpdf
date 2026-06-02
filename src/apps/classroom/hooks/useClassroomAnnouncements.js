import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  isRichTextEmpty,
  normalizeAnnouncement,
  sanitizeAnnouncementHtml,
} from '../lib/classroomUtils'

const LOCAL_ANNOUNCEMENTS_PREFIX = 'jacpdf-classroom-local-announcements:'

function readLocalAnnouncements(classroomId) {
  if (!classroomId) return []

  try {
    const raw = localStorage.getItem(`${LOCAL_ANNOUNCEMENTS_PREFIX}${classroomId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(normalizeAnnouncement) : []
  } catch {
    return []
  }
}

function saveLocalAnnouncement(classroomId, announcement) {
  if (!classroomId || !announcement) return

  const normalized = normalizeAnnouncement(announcement)
  const next = [
    normalized,
    ...readLocalAnnouncements(classroomId).filter((item) => item.id !== normalized.id),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  try {
    localStorage.setItem(`${LOCAL_ANNOUNCEMENTS_PREFIX}${classroomId}`, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('jacpdf:classroomAnnouncementsUpdated', {
      detail: { classroomId },
    }))
  } catch {
    // localStorage indisponible.
  }
}

function removeLocalAnnouncement(classroomId, announcementId) {
  if (!classroomId || !announcementId) return

  const matchingIds = new Set([
    announcementId,
    announcementId.replace(/^classroom-announcement-/, ''),
    `classroom-announcement-${announcementId}`,
  ])

  const next = readLocalAnnouncements(classroomId).filter((item) => !matchingIds.has(item.id))

  try {
    localStorage.setItem(`${LOCAL_ANNOUNCEMENTS_PREFIX}${classroomId}`, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('jacpdf:classroomAnnouncementsUpdated', {
      detail: { classroomId },
    }))
  } catch {
    // localStorage indisponible.
  }
}

function broadcastClassroomAnnouncement(classroomId, event, payload) {
  if (!classroomId || !event) return

  try {
    const channel = supabase.channel(`classroom-announcements-broadcast:${classroomId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`)
    const cleanup = () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        // Ignore cleanup errors.
      }
    }

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return

      channel
        .send({ type: 'broadcast', event, payload })
        .finally(() => setTimeout(cleanup, 250))
    })

    setTimeout(cleanup, 3000)
  } catch {
    // Broadcast indisponible.
  }
}

function displayAnnouncementDatabaseError(error, action) {
  if (!error) return

  if (import.meta.env.DEV) {
    console.warn(`[classroom/announcements] ${action} failed`, error)
  }

  alert(
    `${error.message || "Impossible d'utiliser classroom_announcements."}\n\n` +
    "Va dans Supabase > SQL Editor et exécute la migration classroom_announcements que Mammouth AI a ajoutée dans Notion."
  )
}

async function upsertAnnouncementRow({ announcement, classroom, text, myName, myUserId, authorRole }) {
  const rpcResult = await supabase
    .rpc('upsert_classroom_announcement', {
      p_id: announcement.id,
      p_classroom_id: classroom.id,
      p_author_name: myName,
      p_author_role: authorRole,
      p_text: text,
    })

  if (!rpcResult.error) {
    return {
      data: rpcResult.data,
      error: null,
    }
  }

  if (import.meta.env.DEV) {
    console.warn('[classroom/announcements] rpc upsert failed, trying direct insert/update', rpcResult.error)
  }

  return supabase
    .from('classroom_announcements')
    .upsert({
      id: announcement.id,
      classroom_id: classroom.id,
      author_id: myUserId,
      author_name: myName,
      author_role: authorRole,
      text,
    })
    .select('*')
    .single()
}

async function deleteAnnouncementRow(announcementId) {
  const cleanId = announcementId.replace(/^classroom-announcement-/, '')

  const rpcResult = await supabase
    .rpc('delete_classroom_announcement_everywhere', {
      p_announcement_id: cleanId,
    })

  if (!rpcResult.error) return { error: null }

  if (import.meta.env.DEV) {
    console.warn('[classroom/announcements] rpc delete failed, trying direct delete', rpcResult.error)
  }

  return supabase
    .from('classroom_announcements')
    .delete()
    .eq('id', cleanId)
}

export function useClassroomAnnouncements({
  current,
  myUserId,
  myName,
  isTeacher,
  composerEditorRef,
  draft,
  setDraft,
  setComposerOpen,
  setComposerMenuOpen,
  setScheduleModalOpen,
  setScheduleAt,
}) {
  const [draftsByClass, setDraftsByClass] = useState({})
  const [announcementsByClass, setAnnouncementsByClass] = useState({})
  const [announcementMenuId, setAnnouncementMenuId] = useState(null)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null)
  const [editAnnouncementDraft, setEditAnnouncementDraft] = useState('')

  const announcements = current ? announcementsByClass[current.id] || [] : []
  const announcementDrafts = current ? draftsByClass[current.id] || [] : []

  useEffect(() => {
    if (!current?.id) return

    let cancelled = false

    const mergeLocalAnnouncements = () => {
      const localItems = readLocalAnnouncements(current.id)
      if (localItems.length === 0) return

      setAnnouncementsByClass((state) => ({
        ...state,
        [current.id]: [
          ...localItems,
          ...(state[current.id] || []).filter((item) =>
            !localItems.some((localItem) => localItem.id === item.id)
          ),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
    }

    const applyLiveAnnouncement = (announcement) => {
      if (cancelled) return

      const next = normalizeAnnouncement(announcement || {})
      if (!next.id) return

      setAnnouncementsByClass((state) => ({
        ...state,
        [current.id]: [
          next,
          ...(state[current.id] || []).filter((item) => item.id !== next.id),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
    }

    const removeLiveAnnouncement = (announcementId) => {
      if (cancelled || !announcementId) return

      const matchingIds = new Set([
        announcementId,
        announcementId.replace(/^classroom-announcement-/, ''),
        `classroom-announcement-${announcementId}`,
      ])

      setAnnouncementsByClass((state) => ({
        ...state,
        [current.id]: (state[current.id] || []).filter((item) => !matchingIds.has(item.id)),
      }))
    }

    const loadAnnouncements = async () => {
      const { data, error } = await supabase
        .from('classroom_announcements')
        .select('*')
        .eq('classroom_id', current.id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (cancelled) return

      if (error) {
        if (import.meta.env.DEV) console.warn('[classroom/announcements] load failed', error)
        mergeLocalAnnouncements()
        return
      }

      const remoteItems = (data || []).map(normalizeAnnouncement)
      const localItems = readLocalAnnouncements(current.id)

      setAnnouncementsByClass((state) => ({
        ...state,
        [current.id]: [
          ...remoteItems,
          ...localItems.filter((item) =>
            !remoteItems.some((remoteItem) => remoteItem.id === item.id)
          ),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }))
    }

    mergeLocalAnnouncements()
    loadAnnouncements()

    window.addEventListener('storage', mergeLocalAnnouncements)
    window.addEventListener('jacpdf:classroomAnnouncementsUpdated', mergeLocalAnnouncements)

    const channelNonce = Math.random().toString(36).slice(2, 10)
    const channel = supabase
      .channel(`classroom-announcements-live:${current.id}:${channelNonce}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classroom_announcements',
          filter: `classroom_id=eq.${current.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            removeLiveAnnouncement(payload.old?.id)
            return
          }

          if (payload.new) applyLiveAnnouncement(payload.new)
        },
      )
      .on('broadcast', { event: 'announcement_posted' }, ({ payload }) => {
        applyLiveAnnouncement(payload)
      })
      .on('broadcast', { event: 'announcement_deleted' }, ({ payload }) => {
        removeLiveAnnouncement(payload?.id)
      })
      .subscribe()

    const intervalId = setInterval(loadAnnouncements, 10000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      window.removeEventListener('storage', mergeLocalAnnouncements)
      window.removeEventListener('jacpdf:classroomAnnouncementsUpdated', mergeLocalAnnouncements)
      supabase.removeChannel(channel)
    }
  }, [current?.id])

  useEffect(() => {
    if (!announcementMenuId) return

    const onPointerDown = (event) => {
      if (event.target?.closest?.('.cpp-post-actions-wrapper')) return
      setAnnouncementMenuId(null)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setAnnouncementMenuId(null)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [announcementMenuId])

  const resetComposer = () => {
    setDraft('')
    if (composerEditorRef.current) composerEditorRef.current.innerHTML = ''
    setComposerOpen(false)
    setComposerMenuOpen(false)
    setScheduleModalOpen(false)
    setScheduleAt('')
  }

  const publishAnnouncementText = async (text, target = current) => {
    if (!target || !text) return false

    const optimistic = {
      id: globalThis.crypto?.randomUUID?.() || `announcement-${Date.now()}`,
      authorName: myName,
      authorId: myUserId,
      authorRole: isTeacher ? 'enseignant' : 'eleve',
      text,
      createdAt: new Date().toISOString(),
    }

    setAnnouncementsByClass((state) => ({
      ...state,
      [target.id]: [optimistic, ...(state[target.id] || [])],
    }))

    const { data, error } = await upsertAnnouncementRow({
      announcement: optimistic,
      classroom: target,
      text,
      myName,
      myUserId,
      authorRole: optimistic.authorRole,
    })

    if (error) {
      setAnnouncementsByClass((state) => ({
        ...state,
        [target.id]: (state[target.id] || []).filter((item) => item.id !== optimistic.id),
      }))
      displayAnnouncementDatabaseError(error, 'insert')
      return false
    }

    const saved = normalizeAnnouncement(data || optimistic)
    saveLocalAnnouncement(target.id, saved)

    setAnnouncementsByClass((state) => ({
      ...state,
      [target.id]: [
        saved,
        ...(state[target.id] || []).filter((item) => item.id !== saved.id),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }))

    broadcastClassroomAnnouncement(target.id, 'announcement_posted', saved)

    return true
  }

  const postAnnouncement = async () => {
    const currentDraft = composerEditorRef.current?.innerHTML || draft
    if (!current || isRichTextEmpty(currentDraft)) return

    const text = sanitizeAnnouncementHtml(currentDraft)
    resetComposer()
    await publishAnnouncementText(text, current)
  }

  const saveAnnouncementDraft = () => {
    const currentDraft = composerEditorRef.current?.innerHTML || draft
    if (!current || isRichTextEmpty(currentDraft)) return

    const text = sanitizeAnnouncementHtml(currentDraft)
    const item = {
      id: `draft-${Date.now()}`,
      text,
      updatedAt: new Date().toISOString(),
      authorName: myName,
    }

    setDraftsByClass((state) => ({
      ...state,
      [current.id]: [item, ...(state[current.id] || [])],
    }))

    resetComposer()
  }

  const openDraftAnnouncement = (item) => {
    if (!current || !item) return

    setDraftsByClass((state) => ({
      ...state,
      [current.id]: (state[current.id] || []).filter((draftItem) => draftItem.id !== item.id),
    }))

    setDraft(item.text || '')
    setComposerOpen(true)
    setComposerMenuOpen(false)

    window.requestAnimationFrame?.(() => {
      if (composerEditorRef.current) composerEditorRef.current.innerHTML = item.text || ''
    })
  }

  const scheduleAnnouncement = () => {
    const currentDraft = composerEditorRef.current?.innerHTML || draft
    if (!current || isRichTextEmpty(currentDraft)) return

    const runAt = new Date(scheduleAt).getTime()
    if (!scheduleAt || Number.isNaN(runAt) || runAt <= Date.now()) {
      alert("Choisis une date et une heure dans le futur.")
      return
    }

    const target = current
    const text = sanitizeAnnouncementHtml(currentDraft)
    const scheduledId = `scheduled-${Date.now()}`

    setDraftsByClass((state) => ({
      ...state,
      [target.id]: [
        {
          id: scheduledId,
          text,
          updatedAt: new Date().toISOString(),
          scheduledAt: new Date(runAt).toISOString(),
          authorName: myName,
        },
        ...(state[target.id] || []),
      ],
    }))

    resetComposer()

    window.setTimeout(async () => {
      await publishAnnouncementText(text, target)
      setDraftsByClass((state) => ({
        ...state,
        [target.id]: (state[target.id] || []).filter((item) => item.id !== scheduledId),
      }))
    }, Math.min(runAt - Date.now(), 2147483647))
  }

  const startEditAnnouncement = (announcement) => {
    setEditingAnnouncementId(announcement.id)
    setEditAnnouncementDraft(announcement.text || '')
    setAnnouncementMenuId(null)
  }

  const cancelEditAnnouncement = () => {
    setEditingAnnouncementId(null)
    setEditAnnouncementDraft('')
  }

  const saveAnnouncementEdit = async () => {
    if (!current || !editingAnnouncementId) return

    const text = editAnnouncementDraft.trim()
    if (!text) return

    const previous = announcementsByClass[current.id] || []
    const existing = previous.find((item) => item.id === editingAnnouncementId)

    if (!existing) return

    const optimistic = {
      ...existing,
      text,
      authorName: existing.authorName || myName,
      authorId: existing.authorId || myUserId,
      authorRole: existing.authorRole || (isTeacher ? 'enseignant' : 'eleve'),
    }

    setAnnouncementsByClass((state) => ({
      ...state,
      [current.id]: previous.map((item) =>
        item.id === editingAnnouncementId ? optimistic : item
      ),
    }))

    setEditingAnnouncementId(null)
    setEditAnnouncementDraft('')

    const { data, error } = await upsertAnnouncementRow({
      announcement: optimistic,
      classroom: current,
      text,
      myName: optimistic.authorName,
      myUserId: optimistic.authorId || myUserId,
      authorRole: optimistic.authorRole,
    })

    if (error) {
      setAnnouncementsByClass((state) => ({ ...state, [current.id]: previous }))
      displayAnnouncementDatabaseError(error, 'update')
      return
    }

    const saved = normalizeAnnouncement(data || optimistic)
    saveLocalAnnouncement(current.id, saved)

    setAnnouncementsByClass((state) => ({
      ...state,
      [current.id]: (state[current.id] || []).map((item) =>
        item.id === saved.id ? saved : item
      ),
    }))

    broadcastClassroomAnnouncement(current.id, 'announcement_posted', saved)
  }

  const deleteAnnouncement = async (announcementId) => {
    if (!current || !announcementId) return

    const previous = announcementsByClass[current.id] || []
    setAnnouncementMenuId(null)

    const matchingIds = new Set([
      announcementId,
      announcementId.replace(/^classroom-announcement-/, ''),
      `classroom-announcement-${announcementId}`,
    ])

    setAnnouncementsByClass((state) => ({
      ...state,
      [current.id]: previous.filter((item) => !matchingIds.has(item.id)),
    }))

    removeLocalAnnouncement(current.id, announcementId)

    const { error } = await deleteAnnouncementRow(announcementId)

    if (error) {
      setAnnouncementsByClass((state) => ({ ...state, [current.id]: previous }))
      displayAnnouncementDatabaseError(error, 'delete')
      return
    }

    broadcastClassroomAnnouncement(current.id, 'announcement_deleted', { id: announcementId })
  }

  return {
    announcements,
    announcementDrafts,
    announcementMenuId,
    editingAnnouncementId,
    editAnnouncementDraft,
    setAnnouncementMenuId,
    setEditAnnouncementDraft,
    resetComposer,
    postAnnouncement,
    saveAnnouncementDraft,
    openDraftAnnouncement,
    scheduleAnnouncement,
    startEditAnnouncement,
    cancelEditAnnouncement,
    saveAnnouncementEdit,
    deleteAnnouncement,
  }
}