import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/infra/supabase'
import { normalizeStudentCopy, normalizeSubmission } from '../lib/classroomUtils'

export function useClassroomSubmissions({
  current,
  myUserId,
  myName,
  userEmail,
  isTeacher,
}) {
  const [studentWorkStatusById, setStudentWorkStatusById] = useState({})
  const [submissionsByWorkId, setSubmissionsByWorkId] = useState({})

  useEffect(() => {
    if (!current?.id) return

    let cancelled = false

    const buildStudentCopyAttachment = (copy) => {
      const documentId = copy.copyDocumentId || copy.documentId
      if (!documentId) return null

      return {
        id: `student-cloud-${documentId}`,
        documentId,
        name: copy.name || 'Copie de l’élève',
        source: 'jacpdf-cloud',
        sourceDocumentId: copy.sourceDocumentId || undefined,
        sourceAttachmentId: copy.sourceDocumentId ? `jacpdf-cloud-${copy.sourceDocumentId}` : undefined,
        replacesTeacherCopy: true,
        addedAt: copy.createdAt,
      }
    }

    const groupSubmissions = (items = [], studentCopyAttachmentsByKey = {}) => {
      const grouped = {}

      items.map(normalizeSubmission).forEach((submission) => {
        if (!submission.fileId) return

        const copyAttachments = studentCopyAttachmentsByKey[`${submission.fileId}:${submission.studentId}`] || []
        const submissionWithCopies =
          submission.attachments?.length || copyAttachments.length === 0
            ? submission
            : { ...submission, attachments: copyAttachments }

        grouped[submission.fileId] = [
          submissionWithCopies,
          ...(grouped[submission.fileId] || []).filter((item) => item.studentId !== submission.studentId),
        ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      })

      return grouped
    }

    const loadSubmissions = async () => {
      const { data, error } = await supabase
        .from('classroom_submissions')
        .select('*')
        .eq('classroom_id', current.id)
        .order('submitted_at', { ascending: false })

      if (cancelled) return

      if (error) {
        if (import.meta.env.DEV) console.warn('[classroom/submissions] load failed', error)
        return
      }

      const studentCopyAttachmentsByKey = {}

      const { data: copyRows, error: copyError } = await supabase
        .from('classroom_student_copies')
        .select('*')
        .eq('classroom_id', current.id)

      if (copyError) {
        if (import.meta.env.DEV) console.warn('[classroom/copies] load for submissions failed', copyError)
      } else {
        ;(copyRows || []).map(normalizeStudentCopy).forEach((copy) => {
          if (!copy.fileId || !copy.studentId) return

          const attachment = buildStudentCopyAttachment(copy)
          if (!attachment) return

          const key = `${copy.fileId}:${copy.studentId}`
          studentCopyAttachmentsByKey[key] = [
            attachment,
            ...(studentCopyAttachmentsByKey[key] || []).filter((item) => item.documentId !== attachment.documentId),
          ]
        })
      }

      setSubmissionsByWorkId((state) => {
        const grouped = groupSubmissions(data || [], studentCopyAttachmentsByKey)

        Object.keys(grouped).forEach((fileId) => {
          grouped[fileId] = grouped[fileId].map((submission) => {
            if (submission.attachments?.length) return submission

            const existing = (state[fileId] || []).find((item) => item.studentId === submission.studentId)
            return existing?.attachments?.length
              ? { ...submission, attachments: existing.attachments }
              : submission
          })
        })

        return grouped
      })
    }

    loadSubmissions()

    const channelTopic = `classroom-submissions:${current.id}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classroom_submissions',
          filter: `classroom_id=eq.${current.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = normalizeSubmission(payload.old || {})

            if (!oldRow.fileId || !oldRow.studentId) {
              loadSubmissions()
              return
            }

            setSubmissionsByWorkId((state) => ({
              ...state,
              [oldRow.fileId]: (state[oldRow.fileId] || []).filter((item) => item.studentId !== oldRow.studentId),
            }))
            return
          }

          if (!payload.new) return

          const next = normalizeSubmission(payload.new)
          setSubmissionsByWorkId((state) => {
            const existing = (state[next.fileId] || []).find((item) => item.studentId === next.studentId)
            const nextWithAttachments =
              next.attachments?.length || !existing?.attachments?.length
                ? next
                : { ...next, attachments: existing.attachments }

            return {
              ...state,
              [next.fileId]: [
                nextWithAttachments,
                ...(state[next.fileId] || []).filter((item) => item.studentId !== next.studentId),
              ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
            }
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'classroom_student_copies',
          filter: `classroom_id=eq.${current.id}`,
        },
        () => {
          loadSubmissions()
        },
      )
      .subscribe()

    const intervalId = setInterval(loadSubmissions, 10000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [current?.id])

  const submitStudentWork = async (work, attachments = []) => {
    if (!current || !work?.id || !myUserId) return

    const optimistic = normalizeSubmission({
      id: `local-submission-${work.id}-${myUserId}`,
      classroom_id: current.id,
      classroom_file_id: work.id,
      student_id: myUserId,
      student_name: myName,
      student_email: userEmail || '',
      status: 'submitted',
      attachments,
      submitted_at: new Date().toISOString(),
    })

    setStudentWorkStatusById((state) => ({
      ...state,
      [work.id]: 'submitted',
    }))

    setSubmissionsByWorkId((state) => ({
      ...state,
      [work.id]: [
        optimistic,
        ...(state[work.id] || []).filter((item) => item.studentId !== myUserId),
      ],
    }))

    let { data, error } = await supabase
      .from('classroom_submissions')
      .upsert({
        classroom_id: current.id,
        classroom_file_id: work.id,
        student_id: myUserId,
        student_name: myName,
        student_email: userEmail || '',
        status: 'submitted',
        attachments,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'classroom_file_id,student_id' })
      .select('*')
      .single()

    if (error?.message?.includes('attachments')) {
      const fallback = await supabase
        .from('classroom_submissions')
        .upsert({
          classroom_id: current.id,
          classroom_file_id: work.id,
          student_id: myUserId,
          student_name: myName,
          student_email: userEmail || '',
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        }, { onConflict: 'classroom_file_id,student_id' })
        .select('*')
        .single()

      data = fallback.data
      error = fallback.error
    }

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/submissions] submit failed', error)
      alert(error.message || 'Impossible de remettre le devoir.')
      return
    }

    const saved = normalizeSubmission(data)
    const savedWithAttachments =
      saved.attachments?.length || attachments.length === 0
        ? saved
        : { ...saved, attachments }

    setSubmissionsByWorkId((state) => ({
      ...state,
      [work.id]: [
        savedWithAttachments,
        ...(state[work.id] || []).filter((item) => item.studentId !== myUserId),
      ],
    }))
  }

  const unsubmitStudentWork = async (work) => {
    if (!current || !work?.id || !myUserId) return

    setStudentWorkStatusById((state) => ({
      ...state,
      [work.id]: 'assigned',
    }))

    setSubmissionsByWorkId((state) => ({
      ...state,
      [work.id]: (state[work.id] || []).filter((item) => item.studentId !== myUserId),
    }))

    const { error } = await supabase
      .from('classroom_submissions')
      .delete()
      .eq('classroom_id', current.id)
      .eq('classroom_file_id', work.id)
      .eq('student_id', myUserId)

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/submissions] unsubmit failed', error)
      alert(error.message || "Impossible d'annuler la remise.")
    }
  }

  const updateSubmissionDraft = (fileId, studentId, patch) => {
    if (!fileId || !studentId) return

    setSubmissionsByWorkId((state) => ({
      ...state,
      [fileId]: (state[fileId] || []).map((submission) =>
        submission.studentId === studentId ? { ...submission, ...patch } : submission
      ),
    }))
  }

  const returnSubmissionWithGrade = async (work, submission) => {
    if (!current || !work?.id || !submission?.studentId || !isTeacher) return

    const gradeValue =
      submission.grade === '' ||
      submission.grade === null ||
      submission.grade === undefined
        ? null
        : Number(submission.grade)
    const feedbackValue = submission.feedback || ''
    const previous = submissionsByWorkId[work.id] || []

    setSubmissionsByWorkId((state) => ({
      ...state,
      [work.id]: (state[work.id] || []).map((item) =>
        item.studentId === submission.studentId
          ? {
              ...item,
              grade: Number.isFinite(gradeValue) ? gradeValue : null,
              feedback: feedbackValue,
              status: 'returned',
              returnedAt: new Date().toISOString(),
            }
          : item
      ),
    }))

    const { data, error } = await supabase
      .from('classroom_submissions')
      .update({
        grade: Number.isFinite(gradeValue) ? gradeValue : null,
        feedback: feedbackValue,
        status: 'returned',
        returned_at: new Date().toISOString(),
      })
      .eq('classroom_id', current.id)
      .eq('classroom_file_id', work.id)
      .eq('student_id', submission.studentId)
      .select('*')
      .single()

    if (error) {
      if (import.meta.env.DEV) console.warn('[classroom/submissions] return failed', error)
      setSubmissionsByWorkId((state) => ({ ...state, [work.id]: previous }))
      alert(error.message || 'Impossible de rendre la note.')
      return
    }

    const saved = normalizeSubmission(data)
    setSubmissionsByWorkId((state) => ({
      ...state,
      [work.id]: (state[work.id] || []).map((item) =>
        item.studentId === saved.studentId ? saved : item
      ),
    }))
  }

  return {
    studentWorkStatusById,
    submissionsByWorkId,
    setStudentWorkStatusById,
    setSubmissionsByWorkId,
    submitStudentWork,
    unsubmitStudentWork,
    updateSubmissionDraft,
    returnSubmissionWithGrade,
  }
}