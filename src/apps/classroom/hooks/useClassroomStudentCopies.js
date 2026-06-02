import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { normalizeStudentCopy } from '../lib/classroomUtils'

export function useClassroomStudentCopies({
  current,
  myUserId,
  myName,
  isTeacher,
  openJacpdfCloudFile,
  saveJacpdfCloudFile,
  openJacdocCloudDoc,
  saveJacdocCloudDoc,
}) {
  const [studentCopiesByAttachmentId, setStudentCopiesByAttachmentId] = useState({})

  useEffect(() => {
    if (!current?.id || !myUserId || isTeacher) return

    let cancelled = false

    const loadStudentCopies = async () => {
      const { data, error } = await supabase
        .from('classroom_student_copies')
        .select('*')
        .eq('classroom_id', current.id)
        .eq('student_id', myUserId)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (error) {
        if (import.meta.env.DEV) console.warn('[classroom/copies] load failed', error)
        return
      }

      const nextCopies = {}

      ;(data || []).map(normalizeStudentCopy).forEach((copy) => {
        if (!copy.fileId || !copy.sourceDocumentId || !copy.copyDocumentId) return
        const source = copy.source || 'jacpdf-cloud'
        nextCopies[`${copy.fileId}:${source}-${copy.sourceDocumentId}`] = copy
      })

      setStudentCopiesByAttachmentId(nextCopies)
    }

    loadStudentCopies()

    const channelTopic = `classroom-student-copies:${current.id}:${myUserId}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classroom_student_copies',
          filter: `classroom_id=eq.${current.id}`,
        },
        (payload) => {
          const row = normalizeStudentCopy(payload.new || payload.old || {})
          if (row.studentId && row.studentId !== myUserId) return

          if (!row.fileId || !row.sourceDocumentId) {
            loadStudentCopies()
            return
          }

          const source = row.source || 'jacpdf-cloud'
          const copyKey = `${row.fileId}:${source}-${row.sourceDocumentId}`

          if (payload.eventType === 'DELETE') {
            setStudentCopiesByAttachmentId((state) => {
              const next = { ...state }
              delete next[copyKey]
              return next
            })
            return
          }

          setStudentCopiesByAttachmentId((state) => ({
            ...state,
            [copyKey]: row,
          }))
        },
      )
      .subscribe()

    const intervalId = setInterval(loadStudentCopies, 15000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      try { channel.unsubscribe() } catch {}
      supabase.removeChannel(channel)
    }
  }, [current?.id, isTeacher, myUserId])

  const getAttachmentCopyKey = (work, attachment) => {
    const attachmentId =
      attachment?.id ||
      attachment?.documentId ||
      attachment?.document_id ||
      attachment?.driveFileId ||
      attachment?.drive_file_id

    return `${work?.id || 'work'}:${attachmentId || 'attachment'}`
  }

  const openStudentCopy = (copy) => {
    if (!copy?.documentId) return

    if (copy.source === 'jacdoc-cloud') {
      window.dispatchEvent(new CustomEvent('jacsuite:openJacDoc', {
        detail: {
          cloudId: copy.documentId,
          title: copy.name || 'Ma copie',
        },
      }))
      return
    }

    window.dispatchEvent(new CustomEvent('jacpdf:openSharedDoc', {
      detail: { documentId: copy.documentId, name: copy.name || 'Ma copie' },
    }))
  }

  const createStudentAttachmentCopy = async (work, attachment) => {
    if (!work || !attachment) return

    const copyKey = getAttachmentCopyKey(work, attachment)
    const existingCopy = studentCopiesByAttachmentId[copyKey]

    if (existingCopy?.documentId) {
      openStudentCopy(existingCopy)
      return { ...existingCopy, alreadyExisted: true }
    }

    const documentId = attachment.documentId || attachment.document_id
    const source = attachment.source || (documentId ? 'jacpdf-cloud' : null)

    if (!documentId) return

    if (source !== 'jacpdf-cloud' && source !== 'jacdoc-cloud') {
      alert("La copie par élève est disponible pour les fichiers JacPDF Cloud et JacDoc Cloud. Google Drive arrive bientôt.")
      return
    }

    try {
      const accountName = (myName || 'Élève').trim()

      let saved = null
      let copyName = ''

      if (source === 'jacdoc-cloud') {
        if (typeof openJacdocCloudDoc !== 'function' || typeof saveJacdocCloudDoc !== 'function') {
          alert('La copie JacDoc Cloud n’est pas encore disponible dans cette session.')
          return
        }

        const sourceDoc = await openJacdocCloudDoc(documentId)
        const baseName = (attachment.name || sourceDoc?.title || work.name || 'Devoir').replace(/\.jacdoc$/i, '')
        copyName = `${accountName} — ${baseName}`
        saved = await saveJacdocCloudDoc({
          title: copyName,
          doc: sourceDoc?.doc,
          folderId: sourceDoc?.folderId ?? null,
          classroomId: current?.id ?? null,
          assignmentId: work?.id ?? null,
        })
      } else {
        const bytes = await openJacpdfCloudFile(documentId)
        const baseName = (attachment.name || work.name || 'Devoir').replace(/\.pdf$/i, '')
        copyName = `${accountName} — ${baseName}.pdf`
        saved = await saveJacpdfCloudFile({ name: copyName, bytes })
      }

      const savedDocumentId = saved?.cloudId || saved?.id
      const nextCopy = {
        documentId: savedDocumentId,
        name: saved?.name || saved?.title || copyName,
        source,
        createdAt: new Date().toISOString(),
      }

      setStudentCopiesByAttachmentId((state) => ({
        ...state,
        [copyKey]: nextCopy,
      }))

      if (current?.id && myUserId && savedDocumentId) {
        const { error: copyError } = await supabase
          .from('classroom_student_copies')
          .upsert({
            classroom_id: current.id,
            classroom_file_id: work.id,
            student_id: myUserId,
            source_document_id: documentId,
            copy_document_id: savedDocumentId,
            copy_name: nextCopy.name,
            source,
          }, { onConflict: 'classroom_file_id,student_id,source,source_document_id' })

        if (copyError && import.meta.env.DEV) {
          console.warn('[classroom/copies] persist copy failed', copyError)
        }
      }

      openStudentCopy(nextCopy)
      return { ...nextCopy, alreadyExisted: false }
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[classroom/copies] create copy failed', error)
      alert(error?.message || "Impossible de créer ta copie pour l'instant.")
    }
  }

  return {
    studentCopiesByAttachmentId,
    setStudentCopiesByAttachmentId,
    getAttachmentCopyKey,
    openStudentCopy,
    createStudentAttachmentCopy,
  }
}