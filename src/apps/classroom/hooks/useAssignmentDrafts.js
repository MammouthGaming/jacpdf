import { useState } from 'react'
import { ASSIGNMENT_DEFAULTS } from '../lib/classroomConstants'

export function useAssignmentDrafts({
  current,
  myName,
  assignmentForm,
  selectedStudents,
  setAssignmentForm,
  setSelectedStudents,
  setAudienceOpen,
  setEditorMode,
  addClassroomFile,
  buildAssignmentPayload,
}) {
  const [assignmentDraftsByClass, setAssignmentDraftsByClass] = useState({})

  const assignmentDrafts = current ? assignmentDraftsByClass[current.id] || [] : []

  const resetAssignmentEditor = () => {
    setAssignmentForm(ASSIGNMENT_DEFAULTS)
    setSelectedStudents(null)
    setAudienceOpen(false)
    setEditorMode(null)
  }

  const submitAssignment = (form = assignmentForm, target = current, targetStudents = selectedStudents) => {
    if (!target || !form.title.trim()) return false

    addClassroomFile(target.id, buildAssignmentPayload(form, target, targetStudents))
    resetAssignmentEditor()
    return true
  }

  const saveAssignmentDraft = () => {
    if (!current) return

    const hasContent =
      assignmentForm.title.trim() ||
      assignmentForm.instructions.trim() ||
      (assignmentForm.attachments || []).length > 0

    if (!hasContent) {
      resetAssignmentEditor()
      return
    }

    const draft = {
      id: `assignment-draft-${Date.now()}`,
      form: { ...assignmentForm, attachments: [...(assignmentForm.attachments || [])] },
      selectedStudents: selectedStudents ? [...selectedStudents] : null,
      updatedAt: new Date().toISOString(),
      authorName: myName,
    }

    setAssignmentDraftsByClass((state) => ({
      ...state,
      [current.id]: [draft, ...(state[current.id] || [])],
    }))

    resetAssignmentEditor()
  }

  const openAssignmentDraft = (draft) => {
    if (!current || !draft) return

    setAssignmentDraftsByClass((state) => ({
      ...state,
      [current.id]: (state[current.id] || []).filter((item) => item.id !== draft.id),
    }))

    setAssignmentForm({
      ...ASSIGNMENT_DEFAULTS,
      ...(draft.form || {}),
      attachments: [...(draft.form?.attachments || [])],
    })

    setSelectedStudents(draft.selectedStudents ? [...draft.selectedStudents] : null)
    setAudienceOpen(false)
    setEditorMode('devoir')
  }

  const scheduleAssignment = () => {
    if (!current || !assignmentForm.title.trim()) return

    const defaultDate = new Date(Date.now() + 60 * 60 * 1000)
    defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset())

    const raw = window.prompt(
      'Programmer pour quelle date/heure ? Format : AAAA-MM-JJTHH:mm',
      defaultDate.toISOString().slice(0, 16),
    )

    if (!raw) return

    const runAt = new Date(raw).getTime()

    if (Number.isNaN(runAt) || runAt <= Date.now()) {
      alert('Choisis une date et une heure dans le futur.')
      return
    }

    const target = current
    const formSnapshot = {
      ...assignmentForm,
      attachments: [...(assignmentForm.attachments || [])],
    }
    const targetStudents = selectedStudents ? [...selectedStudents] : null
    const scheduledId = `assignment-scheduled-${Date.now()}`

    setAssignmentDraftsByClass((state) => ({
      ...state,
      [target.id]: [
        {
          id: scheduledId,
          form: formSnapshot,
          selectedStudents: targetStudents,
          scheduledAt: new Date(runAt).toISOString(),
          updatedAt: new Date().toISOString(),
          authorName: myName,
        },
        ...(state[target.id] || []),
      ],
    }))

    resetAssignmentEditor()

    window.setTimeout(() => {
      addClassroomFile(target.id, buildAssignmentPayload(formSnapshot, target, targetStudents))

      setAssignmentDraftsByClass((state) => ({
        ...state,
        [target.id]: (state[target.id] || []).filter((item) => item.id !== scheduledId),
      }))
    }, Math.min(runAt - Date.now(), 2147483647))
  }

  return {
    assignmentDrafts,
    assignmentDraftsByClass,
    setAssignmentDraftsByClass,
    resetAssignmentEditor,
    submitAssignment,
    saveAssignmentDraft,
    openAssignmentDraft,
    scheduleAssignment,
  }
}