import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/shared/hooks/user/useAuth'
import { useClassrooms } from '@/shared/hooks/user/useClassrooms'
import Settings from '@/shared/components/ui/Settings'
import DriveFilePicker from '@/apps/jacpdf/components/cloud/DriveFilePicker'
import JacpdfCloudFilePicker from '@/apps/jacpdf/components/cloud/JacpdfCloudFilePicker'
import JacpdfCloudQuickLook from '@/apps/jacpdf/components/cloud/JacpdfCloudQuickLook'
import JacdocCloudFilePicker from '@/apps/jacdoc/components/cloud/JacdocCloudFilePicker'
import { useJacpdfCloud } from '@/apps/jacpdf/hooks/cloud/useJacpdfCloud'
import { useGoogleDrive } from '@/apps/jacpdf/hooks/cloud/useGoogleDrive'
import { getDoc as getJacdocCloudDoc, saveDoc as saveJacdocCloudDoc } from '@/apps/jacdoc/lib/cloud/jacdocCloud'
import { shareByUserId as shareJacdocByUserId } from '@/apps/jacdoc/lib/cloud/jacdocSharesRepo'
import { shareByUserId as shareJacpdfByUserId } from '@/apps/jacpdf/lib/cloud/documentSharesRepo'
import { supabase } from '@/shared/lib/infra/supabase'
import {
  setActiveClassroom,
  addClassroomFile,
  deleteClassroomFile,
  joinClassroomByCode,
  createClassroom,
  updateClassroom,
  deleteClassroom,
} from '@/shared/stores/user/classroomStore'

import AssignmentEditor from './components/AssignmentEditor'
import ClassroomAppBar from './components/ClassroomAppBar'
import ClassroomClasswork from './components/ClassroomClasswork'
import ClassroomHome from './components/ClassroomHome'
import ClassroomPanels from './components/ClassroomPanels'
import ClassroomPeople from './components/ClassroomPeople'
import ClassroomSidebar from './components/ClassroomSidebar'
import ClassroomStream from './components/ClassroomStream'
import ClassroomTabs from './components/ClassroomTabs'
import ClassroomWorkDetailPage from './components/ClassroomWorkDetailPage'
import ClassroomWorkRow from './components/ClassroomWorkRow'
import CreateCourseModal from './components/CreateCourseModal'
import JoinCourseModal from './components/JoinCourseModal'
import TopicModal from './components/TopicModal'

import { ASSIGNMENT_DEFAULTS, COURSE_DEFAULTS } from './lib/classroomConstants'
import { useAssignmentDrafts } from './hooks/useAssignmentDrafts'
import { useClassroomAnnouncements } from './hooks/useClassroomAnnouncements'
import { useClassroomDerivedData } from './hooks/useClassroomDerivedData'
import { useClassroomStudentCopies } from './hooks/useClassroomStudentCopies'
import { useClassroomSubmissions } from './hooks/useClassroomSubmissions'
import { useClassroomTopics } from './hooks/useClassroomTopics'
import { useClassroomWorkComments } from './hooks/useClassroomWorkComments'

import './ClassroomApp.css'

export default function ClassroomApp({
  classrooms: classroomsProp,
  activeClassroom: activeClassroomProp,
  homeAvatarInitial,
}) {
  const { user } = useAuth()
  const { classrooms: hookClassrooms, activeClassroom: hookActiveClassroom } = useClassrooms()
  const { openFile: openJacpdfCloudFile, saveFile: saveJacpdfCloudFile } = useJacpdfCloud()
  const { openFile: openGoogleDriveFile } = useGoogleDrive()

  const classrooms = classroomsProp || hookClassrooms || []
  const activeClassroom = activeClassroomProp || hookActiveClassroom
  const schoolRole = user?.user_metadata?.school_role
  const isTeacher = schoolRole === 'enseignant'
  const myUserId = user?.id
  const myName =
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Moi'
  const myAvatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.user_metadata?.photo_url ||
    null

  const [tab, setTab] = useState('stream')
  const [tasksPanelOpen, setTasksPanelOpen] = useState(false)
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false)
  const [submissionsPanelOpen, setSubmissionsPanelOpen] = useState(false)

  const [draft, setDraft] = useState('')
  const composerEditorRef = useRef(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')

  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [view, setView] = useState('home')

  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [editorMode, setEditorMode] = useState(null)
  const [assignmentForm, setAssignmentForm] = useState(ASSIGNMENT_DEFAULTS)
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false)
  const [jacdocCloudPickerOpen, setJacdocCloudPickerOpen] = useState(false)
  const [drivePickerOpen, setDrivePickerOpen] = useState(false)
  const [attachmentShareMenuId, setAttachmentShareMenuId] = useState(null)

  const [workMenuId, setWorkMenuId] = useState(null)
  const [expandedWorkId, setExpandedWorkId] = useState(null)
  const [instructionsOpenWorkIds, setInstructionsOpenWorkIds] = useState({})
  const [selectedWorkId, setSelectedWorkId] = useState(null)
  const [quickLookFile, setQuickLookFile] = useState(null)
  const [studentDrivePickerOpen, setStudentDrivePickerOpen] = useState(false)
  const [studentCloudPickerOpen, setStudentCloudPickerOpen] = useState(false)
  const [studentJacdocCloudPickerOpen, setStudentJacdocCloudPickerOpen] = useState(false)
  const studentLocalFileInputRef = useRef(null)
  const [studentSubmissionAttachmentsByWorkId, setStudentSubmissionAttachmentsByWorkId] = useState({})
  const handleCreateStudentAttachmentCopyRef = useRef(null)

  const [selectedStudents, setSelectedStudents] = useState(null)

  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState(null)

  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [cardMenuClassroomId, setCardMenuClassroomId] = useState(null)
  const [classMenuOpen, setClassMenuOpen] = useState(false)
  const [createCourseModalOpen, setCreateCourseModalOpen] = useState(false)
  const [createCourseForm, setCreateCourseForm] = useState(COURSE_DEFAULTS)
  const [createCourseError, setCreateCourseError] = useState(null)
  const [editingCourseId, setEditingCourseId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const current = activeClassroom || classrooms[0] || null
  const allClassFiles = current ? current.files || [] : []

  const classFiles = allClassFiles.filter((file) => {
    const isAnnouncementFile =
      file.mode === 'announcement' ||
      (file.attachments || []).some((attachment) =>
        attachment?.source === 'classroom-announcement' ||
        attachment?.type === 'classroom-announcement'
      )

    if (isAnnouncementFile) return false
    if (isTeacher) return true

    const assignedTo = Array.isArray(file.assignedTo || file.assigned_to)
      ? file.assignedTo || file.assigned_to
      : []

    return assignedTo.length === 0 || assignedTo.includes(myUserId)
  })

  const selectedWork = selectedWorkId
    ? classFiles.find((file) => file.id === selectedWorkId) || null
    : null

  const handleTabChange = useCallback((nextTab) => {
    setSelectedWorkId(null)
    setExpandedWorkId(null)
    setWorkMenuId(null)
    setTab(nextTab)
  }, [])

  const openWorkDetail = useCallback((workId) => {
    if (!workId) return

    setSelectedWorkId(workId)
    setExpandedWorkId(null)
    setWorkMenuId(null)
  }, [])

  const buildAssignmentPayload = useCallback((form = assignmentForm, target = current, targetStudents = selectedStudents) => ({
    id: form.id || undefined,
    name: form.title.trim(),
    mode:
      editorMode === 'question'
        ? 'question'
        : editorMode === 'material'
          ? 'material'
          : target?.examMode
            ? 'exam'
            : 'normal',
    readOnly: false,
    allowAnnotations: true,
    instructions: form.instructions.trim() || undefined,
    points: form.points,
    dueDate: form.dueDate || undefined,
    topic: form.topic.trim() || undefined,
    attachments: form.attachments || [],
    distributedAt: form.distributedAt || undefined,
    assignedTo:
      targetStudents &&
      targetStudents.length > 0 &&
      targetStudents.length !== (target?.students || []).length
        ? targetStudents
        : undefined,
  }), [assignmentForm, current, editorMode, selectedStudents])

  const getAssignmentRecipients = useCallback((target, assignedTo) => {
    const students = target?.students || []
    const assignedIds =
      Array.isArray(assignedTo) && assignedTo.length > 0
        ? new Set(assignedTo)
        : null

    return students.filter((student) => (
      student?.userId &&
      student.userId !== myUserId &&
      (!assignedIds || assignedIds.has(student.userId))
    ))
  }, [myUserId])

  const shareAssignmentAttachments = useCallback((target, file) => {
    const attachments = Array.isArray(file?.attachments) ? file.attachments : []
    const recipients = getAssignmentRecipients(target, file?.assignedTo || file?.assigned_to)

    if (!attachments.length || !recipients.length) return

    attachments.forEach((attachment) => {
      const source = attachment?.source
      const documentId =
        attachment?.documentId ||
        attachment?.document_id ||
        (source === 'jacpdf-cloud' || source === 'jacdoc-cloud' ? attachment?.id : null)

      if (!documentId) return

      const role = (attachment?.shareMode || attachment?.share_mode) === 'edit'
        ? 'editor'
        : 'viewer'

      recipients.forEach((student) => {
        if (source === 'jacdoc-cloud') {
          shareJacdocByUserId({
            documentId,
            userId: student.userId,
            role,
          }).catch((error) => {
            if (import.meta.env.DEV) console.warn('[classroom/assignments] share JacDoc attachment failed', error)
          })
          return
        }

        if (source === 'jacpdf-cloud') {
          shareJacpdfByUserId({
            documentId,
            userId: student.userId,
            role,
            shareMode: 'shared',
          }).catch((error) => {
            if (import.meta.env.DEV) console.warn('[classroom/assignments] share PDF attachment failed', error)
          })
        }
      })
    })
  }, [getAssignmentRecipients])

  const publishClassroomFile = useCallback((classroomId, file) => {
    const target = classrooms.find((classroom) => classroom.id === classroomId) || current

    shareAssignmentAttachments(target, file)
    return addClassroomFile(classroomId, file)
  }, [classrooms, current, shareAssignmentAttachments])

  const {
    announcements,
    announcementDrafts,
    announcementMenuId,
    editingAnnouncementId,
    editAnnouncementDraft,
    setAnnouncementMenuId,
    setEditAnnouncementDraft,
    postAnnouncement,
    saveAnnouncementDraft,
    openDraftAnnouncement,
    scheduleAnnouncement,
    startEditAnnouncement,
    cancelEditAnnouncement,
    saveAnnouncementEdit,
    deleteAnnouncement,
  } = useClassroomAnnouncements({
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
  })

  const {
    classTopics,
    topicModalOpen,
    topicName,
    collapsedTopicIds,
    topicMenuId,
    setTopicModalOpen,
    setTopicName,
    setTopicMenuId,
    setCollapsedTopicIds,
    createTopic,
    toggleTopicCollapsed,
    renameTopic,
    deleteTopic,
  } = useClassroomTopics({ current })

  const {
    studentWorkStatusById,
    submissionsByWorkId,
    setStudentWorkStatusById,
    setSubmissionsByWorkId,
    submitStudentWork,
    unsubmitStudentWork,
    updateSubmissionDraft,
    returnSubmissionWithGrade,
  } = useClassroomSubmissions({
    current,
    myUserId,
    myName,
    userEmail: user?.email || '',
    isTeacher,
  })

  const {
    setStudentCopiesByAttachmentId,
    createStudentAttachmentCopy,
  } = useClassroomStudentCopies({
    current,
    myUserId,
    myName,
    isTeacher,
    openJacpdfCloudFile,
    saveJacpdfCloudFile,
    openJacdocCloudDoc: getJacdocCloudDoc,
    saveJacdocCloudDoc,
  })

  const {
    workCommentsById,
    classCommentDraft,
    privateCommentDraft,
    setWorkCommentsById,
    setClassCommentDraft,
    setPrivateCommentDraft,
    postWorkComment,
    renderComment,
  } = useClassroomWorkComments({
    current,
    selectedWork,
    myUserId,
    myName,
    isTeacher,
  })

  const {
    assignmentDrafts,
    resetAssignmentEditor,
    submitAssignment,
    saveAssignmentDraft,
    openAssignmentDraft,
    scheduleAssignment,
  } = useAssignmentDrafts({
    current,
    myName,
    assignmentForm,
    selectedStudents,
    setAssignmentForm,
    setSelectedStudents,
    setAudienceOpen,
    setEditorMode,
    addClassroomFile: publishClassroomFile,
    buildAssignmentPayload,
  })

  const {
    topicGroups,
    ungroupedFiles,
    dueWorkItems,
    notificationItems,
    submissionDashboardRows,
    getDueInfo,
    getAssignedStudentCount,
  } = useClassroomDerivedData({
    current,
    classFiles,
    classTopics,
    announcements,
    submissionsByWorkId,
    workCommentsById,
    isTeacher,
    myUserId,
    openWorkDetail,
    setNotificationsPanelOpen,
    setTab: handleTabChange,
  })

  useEffect(() => {
    if (!cardMenuClassroomId) return

    const onPointerDown = (event) => {
      if (event.target?.closest?.('.cpp-home-card-menu-wrapper')) return
      setCardMenuClassroomId(null)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCardMenuClassroomId(null)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [cardMenuClassroomId])

  useEffect(() => {
    if (!classMenuOpen) return

    const onPointerDown = (event) => {
      if (event.target?.closest?.('.cpp-class-actions-wrapper')) return
      setClassMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setClassMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [classMenuOpen])

  useEffect(() => {
    if (!workMenuId) return

    const onPointerDown = (event) => {
      if (event.target?.closest?.('.cpp-work-menu-wrapper')) return
      setWorkMenuId(null)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setWorkMenuId(null)
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [workMenuId])

  useEffect(() => {
    setDraft('')
    setComposerOpen(false)
    setComposerMenuOpen(false)
    setScheduleModalOpen(false)
    setScheduleAt('')
    setShowCode(false)
    setTasksPanelOpen(false)
    setNotificationsPanelOpen(false)
    setSubmissionsPanelOpen(false)
    setCreateMenuOpen(false)
    setEditorMode(null)
    setAssignmentForm(ASSIGNMENT_DEFAULTS)
    setAudienceOpen(false)
    setImportMenuOpen(false)
    setCloudPickerOpen(false)
    setJacdocCloudPickerOpen(false)
    setDrivePickerOpen(false)
    setAttachmentShareMenuId(null)
    setExpandedWorkId(null)
    setInstructionsOpenWorkIds({})
    setSelectedWorkId(null)
    setStudentWorkStatusById({})
    setSubmissionsByWorkId({})
    setStudentCopiesByAttachmentId({})
    setWorkCommentsById({})
    setClassCommentDraft('')
    setPrivateCommentDraft('')
    setQuickLookFile(null)
    setStudentDrivePickerOpen(false)
    setStudentCloudPickerOpen(false)
    setStudentJacdocCloudPickerOpen(false)
    setStudentSubmissionAttachmentsByWorkId({})
    setSelectedStudents(null)
    setTopicModalOpen(false)
    setTopicName('')
    setTopicMenuId(null)
    setCollapsedTopicIds({})
    setTab('stream')
  }, [
    activeClassroom?.id,
    setClassCommentDraft,
    setCollapsedTopicIds,
    setPrivateCommentDraft,
    setStudentCopiesByAttachmentId,
    setStudentWorkStatusById,
    setSubmissionsByWorkId,
    setTopicMenuId,
    setTopicModalOpen,
    setTopicName,
    setWorkCommentsById,
  ])

  const selectedWorkAttachments = Array.isArray(selectedWork?.attachments) ? selectedWork.attachments : []
  const selectedWorkSubmissions = selectedWork?.id ? submissionsByWorkId[selectedWork.id] || [] : []
  const selectedWorkSubmittedCount = selectedWorkSubmissions.filter((item) =>
    item.status === 'submitted' || item.status === 'returned'
  ).length
  const selectedWorkSubmission = selectedWorkSubmissions.find((item) => item.studentId === myUserId) || null
  const selectedStudentSubmissionAttachments = selectedWork?.id
    ? studentSubmissionAttachmentsByWorkId[selectedWork.id] || selectedWorkSubmission?.attachments || []
    : []
  const selectedWorkStatus = selectedWorkSubmission?.status || (selectedWork?.id ? studentWorkStatusById[selectedWork.id] || 'assigned' : 'assigned')
  const selectedWorkDone = selectedWorkStatus === 'submitted' || selectedWorkStatus === 'done'
  const selectedWorkComments = selectedWork?.id ? workCommentsById[selectedWork.id] || [] : []
  const selectedClassComments = selectedWorkComments.filter((comment) => comment.commentType === 'class')
  const selectedPrivateComments = selectedWorkComments.filter((comment) =>
    comment.commentType === 'private' && (isTeacher || comment.authorId === myUserId)
  )

  useEffect(() => {
    if (!current?.id) return

    const syncStudentAttachmentDrafts = () => {
      const prefix = `jacpdf-classroom-student-attachments:${current.id}:`
      const draftRowsByWorkId = {}

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (!key?.startsWith(prefix)) continue

        try {
          const draft = JSON.parse(localStorage.getItem(key) || '{}')
          if (!draft?.workId || !draft?.studentId || !Array.isArray(draft.attachments)) continue

          draftRowsByWorkId[draft.workId] = [
            {
              id: `draft-submission-${draft.workId}-${draft.studentId}`,
              fileId: draft.workId,
              studentId: draft.studentId,
              studentName: draft.studentName || 'Élève',
              studentEmail: draft.studentEmail || '',
              status: draft.status || 'assigned',
              attachments: draft.attachments,
              submittedAt: draft.updatedAt || new Date().toISOString(),
            },
            ...(draftRowsByWorkId[draft.workId] || []).filter((item) => item.studentId !== draft.studentId),
          ]
        } catch {
          // Brouillon local invalide.
        }
      }

      setSubmissionsByWorkId((state) => {
        const next = { ...state }

        Object.entries(draftRowsByWorkId).forEach(([workId, drafts]) => {
          next[workId] = [
            ...(drafts || []).map((draft) => {
              const existing = (state[workId] || []).find((item) => item.studentId === draft.studentId)
              return existing
                ? {
                    ...existing,
                    attachments: draft.attachments,
                    status: existing.status === 'submitted' || existing.status === 'returned'
                      ? existing.status
                      : draft.status,
                  }
                : draft
            }),
            ...(state[workId] || []).filter((item) =>
              !(drafts || []).some((draft) => draft.studentId === item.studentId)
            ),
          ]
        })

        return next
      })
    }

    syncStudentAttachmentDrafts()

    window.addEventListener('storage', syncStudentAttachmentDrafts)
    window.addEventListener('jacpdf:classroomStudentAttachmentsUpdated', syncStudentAttachmentDrafts)

    return () => {
      window.removeEventListener('storage', syncStudentAttachmentDrafts)
      window.removeEventListener('jacpdf:classroomStudentAttachmentsUpdated', syncStudentAttachmentDrafts)
    }
  }, [current?.id, setSubmissionsByWorkId])

  const applyComposerCommand = (command) => {
    composerEditorRef.current?.focus()
    document.execCommand(command, false, null)
    setDraft(composerEditorRef.current?.innerHTML || '')
  }

  const editWork = (work) => {
    if (!work) return

    setWorkMenuId(null)
    setSelectedWorkId(null)
    setExpandedWorkId(null)

    setAssignmentForm({
      ...ASSIGNMENT_DEFAULTS,
      id: work.id,
      title: work.name || '',
      instructions: work.instructions || '',
      points: work.points ?? ASSIGNMENT_DEFAULTS.points,
      dueDate: work.dueDate || '',
      topic: work.topic || '',
      attachments: Array.isArray(work.attachments) ? [...work.attachments] : [],
      distributedAt: work.distributedAt,
    })

    setSelectedStudents(Array.isArray(work.assignedTo) ? [...work.assignedTo] : null)

    setAudienceOpen(false)
    setImportMenuOpen(false)
    setAttachmentShareMenuId(null)

    setEditorMode(
      work.mode === 'question'
        ? 'question'
        : work.mode === 'material'
          ? 'material'
          : 'devoir',
    )
  }

  const deleteWork = async (fileId) => {
    if (!current || !fileId) return

    setWorkMenuId(null)
    await deleteClassroomFile(current.id, fileId)
  }

  const addAssignmentCloudFile = (file) => {
    if (!file?.documentId) return

    const attachment = {
      id: `jacpdf-cloud-${file.documentId}`,
      documentId: file.documentId,
      name: file.name || 'PDF JacPDF Cloud',
      source: 'jacpdf-cloud',
      shareMode: 'view',
    }

    setAssignmentForm((state) => ({
      ...state,
      attachments: [
        ...(state.attachments || []).filter((item) => item.id !== attachment.id),
        attachment,
      ],
    }))

    setCloudPickerOpen(false)
    setImportMenuOpen(false)
  }

  const addAssignmentDriveFile = (file) => {
    if (!file?.fileId) return

    const attachment = {
      id: `google-drive-${file.fileId}`,
      driveFileId: file.fileId,
      name: file.name || 'PDF Google Drive',
      source: 'google-drive',
      shareMode: 'view',
    }

    setAssignmentForm((state) => ({
      ...state,
      attachments: [
        ...(state.attachments || []).filter((item) => item.id !== attachment.id),
        attachment,
      ],
    }))

    setDrivePickerOpen(false)
    setImportMenuOpen(false)
  }

  const addAssignmentJacdocCloudFile = (file) => {
    const documentId = file?.cloudId || file?.id || file?.documentId
    if (!documentId) return

    const attachment = {
      id: `jacdoc-cloud-${documentId}`,
      documentId,
      name: file.title || file.name || 'Document JacDoc',
      source: 'jacdoc-cloud',
      shareMode: 'view',
    }

    setAssignmentForm((state) => ({
      ...state,
      attachments: [
        ...(state.attachments || []).filter((item) => item.id !== attachment.id),
        attachment,
      ],
    }))

    setJacdocCloudPickerOpen(false)
    setImportMenuOpen(false)
  }

  const removeAssignmentAttachment = (attachmentId) => {
    setAssignmentForm((state) => ({
      ...state,
      attachments: (state.attachments || []).filter((item) => item.id !== attachmentId),
    }))
    setAttachmentShareMenuId(null)
  }

  const updateAssignmentAttachmentShareMode = (attachmentId, shareMode) => {
    setAssignmentForm((state) => ({
      ...state,
      attachments: (state.attachments || []).map((item) =>
        item.id === attachmentId ? { ...item, shareMode } : item
      ),
    }))
    setAttachmentShareMenuId(null)
  }

  const toggleWorkExpanded = (fileId) => {
    setExpandedWorkId((id) => id === fileId ? null : fileId)
  }

  const toggleWorkMenu = (fileId) => {
    setWorkMenuId((id) => id === fileId ? null : fileId)
  }

  const toggleWorkInstructions = (fileId) => {
    setInstructionsOpenWorkIds((state) => ({
      ...state,
      [fileId]: !(state[fileId] ?? true),
    }))
  }

  const openAttachmentPreview = useCallback((attachment) => {
    const documentId = attachment?.documentId || attachment?.document_id
    const driveFileId = attachment?.driveFileId || attachment?.drive_file_id
    const source = attachment?.source || (documentId ? 'jacpdf-cloud' : driveFileId ? 'google-drive' : null)
    const id = source === 'google-drive' ? driveFileId : documentId

    if (!id) return

    if (source === 'jacdoc-cloud') {
      const shouldCreateStudentCopy =
        !isTeacher &&
        selectedWork &&
        (attachment?.shareMode || attachment?.share_mode) === 'copy'

      if (shouldCreateStudentCopy) {
        handleCreateStudentAttachmentCopyRef.current?.(selectedWork, attachment)
        return
      }

      window.dispatchEvent(new CustomEvent('jacsuite:openJacDoc', {
        detail: {
          cloudId: id,
          title: attachment?.name || 'Document JacDoc',
          readOnly: !isTeacher && selectedWorkDone,
        },
      }))
      return
    }

    setQuickLookFile({
      ...attachment,
      id,
      source,
      name: attachment?.name || 'PDF',
      size_bytes: attachment?.sizeBytes || attachment?.size_bytes || 0,
    })
  }, [isTeacher, selectedWork, selectedWorkDone])

  const addStudentSubmissionAttachment = useCallback(async (file, source) => {
    if (!selectedWork?.id || !file) return

    const documentId = file.documentId || file.document_id || file.cloudId || (source === 'jacpdf-cloud' || source === 'jacdoc-cloud' ? file.id : null)
    const driveFileId = file.fileId || file.driveFileId || file.drive_file_id || (source === 'google-drive' ? file.id : null)
    const attachmentId =
      source === 'google-drive'
        ? `student-drive-${driveFileId || Date.now()}`
        : source === 'jacpdf-cloud'
          ? `student-cloud-${documentId || Date.now()}`
          : source === 'jacdoc-cloud'
            ? `student-jacdoc-${documentId || Date.now()}`
            : `student-local-${Date.now()}`

    const attachment = {
      id: attachmentId,
      name: file.name || 'Fichier',
      source,
      documentId: source === 'jacpdf-cloud' || source === 'jacdoc-cloud' ? documentId : undefined,
      driveFileId: source === 'google-drive' ? driveFileId : undefined,
      sourceDocumentId: file.sourceDocumentId || file.source_document_id || undefined,
      sourceAttachmentId: file.sourceAttachmentId || file.source_attachment_id || undefined,
      replacesTeacherCopy: !!(file.sourceDocumentId || file.source_document_id || file.sourceAttachmentId || file.source_attachment_id),
      sizeBytes: file.sizeBytes || file.size_bytes || file.size || 0,
      addedAt: new Date().toISOString(),
    }
    const nextAttachments = [
      ...(selectedStudentSubmissionAttachments || []).filter((item) => item.id !== attachment.id),
      attachment,
    ]

    setStudentSubmissionAttachmentsByWorkId((state) => ({
      ...state,
      [selectedWork.id]: nextAttachments,
    }))

    if (current?.id && myUserId) {
      const draftPayload = {
        workId: selectedWork.id,
        studentId: myUserId,
        studentName: myName,
        studentEmail: user?.email || '',
        status: selectedWorkDone ? 'submitted' : 'assigned',
        attachments: nextAttachments,
        updatedAt: new Date().toISOString(),
      }

      localStorage.setItem(
        `jacpdf-classroom-student-attachments:${current.id}:${selectedWork.id}:${myUserId}`,
        JSON.stringify(draftPayload),
      )
      window.dispatchEvent(new CustomEvent('jacpdf:classroomStudentAttachmentsUpdated', { detail: draftPayload }))

      const classroomStudentAttachment = {
        ...attachment,
        id: `student-work-${myUserId}-${attachment.id}`,
        sourceAttachmentId: attachment.id,
        fileRole: 'student',
        studentId: myUserId,
        studentName: myName,
        studentEmail: user?.email || '',
      }

      addClassroomFile(current.id, {
        ...selectedWork,
        attachments: [
          ...((selectedWork.attachments || []).filter((item) =>
            !(
              (item.fileRole || item.file_role) === 'student' &&
              item.studentId === myUserId &&
              item.sourceAttachmentId === attachment.id
            )
          )),
          classroomStudentAttachment,
        ],
      })

      if (source === 'jacpdf-cloud' && documentId && current.teacherId && current.teacherId !== myUserId) {
        shareJacpdfByUserId({
          documentId,
          userId: current.teacherId,
          role: 'editor',
          shareMode: 'shared',
        }).catch((error) => {
          if (import.meta.env.DEV) console.warn('[classroom/submissions] share student PDF copy with teacher failed', error)
        })
      }

      if (source === 'jacdoc-cloud' && documentId && current.teacherId && current.teacherId !== myUserId) {
        shareJacdocByUserId({
          documentId,
          userId: current.teacherId,
          role: 'editor',
        }).catch((error) => {
          if (import.meta.env.DEV) console.warn('[classroom/submissions] share student JacDoc copy with teacher failed', error)
        })
      }
    }

    setSubmissionsByWorkId((state) => {
      const existing = (state[selectedWork.id] || []).find((item) => item.studentId === myUserId)
      const nextSubmission = {
        ...(existing || {}),
        id: existing?.id || `local-submission-${selectedWork.id}-${myUserId}`,
        fileId: selectedWork.id,
        studentId: myUserId,
        studentName: myName,
        studentEmail: user?.email || '',
        status: existing?.status || (selectedWorkDone ? 'submitted' : 'assigned'),
        attachments: nextAttachments,
        submittedAt: existing?.submittedAt || new Date().toISOString(),
      }

      return {
        ...state,
        [selectedWork.id]: [
          nextSubmission,
          ...(state[selectedWork.id] || []).filter((item) => item.studentId !== myUserId),
        ],
      }
    })

    if (current?.id && myUserId) {
      const { error } = await supabase
        .from('classroom_submissions')
        .upsert({
          classroom_id: current.id,
          classroom_file_id: selectedWork.id,
          student_id: myUserId,
          student_name: myName,
          student_email: user?.email || '',
          status: selectedWorkDone ? 'submitted' : 'assigned',
          attachments: nextAttachments,
          submitted_at: new Date().toISOString(),
        }, { onConflict: 'classroom_file_id,student_id' })

      if (error && import.meta.env.DEV) {
        console.warn('[classroom/submissions] save attachment draft failed', error)
      }
    }
  }, [
    current?.id,
    myName,
    myUserId,
    selectedStudentSubmissionAttachments,
    selectedWork,
    selectedWorkDone,
    setSubmissionsByWorkId,
    user?.email,
  ])

  const removeStudentSubmissionAttachment = useCallback((attachmentId) => {
    if (!selectedWork?.id || !attachmentId) return

    const nextAttachments = (selectedStudentSubmissionAttachments || []).filter((item) => item.id !== attachmentId)

    setStudentSubmissionAttachmentsByWorkId((state) => ({
      ...state,
      [selectedWork.id]: nextAttachments,
    }))

    if (current?.id && myUserId) {
      const storageKey = `jacpdf-classroom-student-attachments:${current.id}:${selectedWork.id}:${myUserId}`

      if (nextAttachments.length > 0) {
        const draftPayload = {
          workId: selectedWork.id,
          studentId: myUserId,
          studentName: myName,
          studentEmail: user?.email || '',
          status: selectedWorkDone ? 'submitted' : 'assigned',
          attachments: nextAttachments,
          updatedAt: new Date().toISOString(),
        }

        localStorage.setItem(storageKey, JSON.stringify(draftPayload))
        window.dispatchEvent(new CustomEvent('jacpdf:classroomStudentAttachmentsUpdated', { detail: draftPayload }))
      } else {
        localStorage.removeItem(storageKey)
        window.dispatchEvent(new CustomEvent('jacpdf:classroomStudentAttachmentsUpdated', {
          detail: { workId: selectedWork.id, studentId: myUserId, attachments: [] },
        }))
      }

      addClassroomFile(current.id, {
        ...selectedWork,
        attachments: (selectedWork.attachments || []).filter((item) =>
          !(
            (item.fileRole || item.file_role) === 'student' &&
            item.studentId === myUserId &&
            (
              item.sourceAttachmentId === attachmentId ||
              item.id === attachmentId ||
              item.id === `student-work-${myUserId}-${attachmentId}`
            )
          )
        ),
      })

      setSubmissionsByWorkId((state) => ({
        ...state,
        [selectedWork.id]: (state[selectedWork.id] || []).map((item) =>
          item.studentId === myUserId ? { ...item, attachments: nextAttachments } : item
        ),
      }))
    }
  }, [
    current?.id,
    myName,
    myUserId,
    selectedStudentSubmissionAttachments,
    selectedWork,
    selectedWorkDone,
    setSubmissionsByWorkId,
    user?.email,
  ])

  const handleCreateStudentAttachmentCopy = useCallback(async (work, attachment) => {
    const copy = await createStudentAttachmentCopy(work, attachment)

    if (copy?.documentId) {
      const source = copy.source || attachment?.source || 'jacpdf-cloud'
      const alreadyAttached = (selectedStudentSubmissionAttachments || []).some((item) =>
        item.documentId === copy.documentId ||
        item.document_id === copy.documentId ||
        item.id === `student-cloud-${copy.documentId}` ||
        item.id === `student-jacdoc-${copy.documentId}` ||
        item.id === copy.documentId
      )

      if (!alreadyAttached) {
        await addStudentSubmissionAttachment({
          id: copy.documentId,
          documentId: copy.documentId,
          name: copy.name || attachment?.name || 'Ma copie',
          sourceDocumentId: attachment?.documentId || attachment?.document_id,
          sourceAttachmentId: attachment?.id,
          sizeBytes: copy.sizeBytes || 0,
        }, source)
      }
    }

    return copy
  }, [
    addStudentSubmissionAttachment,
    createStudentAttachmentCopy,
    selectedStudentSubmissionAttachments,
  ])

  handleCreateStudentAttachmentCopyRef.current = handleCreateStudentAttachmentCopy

  const handleStudentLocalFileChange = useCallback((event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    addStudentSubmissionAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
    }, 'local-file')
  }, [addStudentSubmissionAttachment])

  const loadClassroomPreviewBytes = useCallback(async (id) => {
    if (quickLookFile?.source === 'google-drive') return openGoogleDriveFile(id)
    return openJacpdfCloudFile(id)
  }, [openGoogleDriveFile, openJacpdfCloudFile, quickLookFile?.source])

  const openQuickLookInEditor = useCallback(() => {
    if (!quickLookFile) return

    if (quickLookFile.source === 'jacpdf-cloud') {
      const shouldCreateStudentCopy =
        !isTeacher &&
        selectedWork &&
        (quickLookFile.shareMode || quickLookFile.share_mode) === 'copy'

      if (shouldCreateStudentCopy) {
        handleCreateStudentAttachmentCopy(selectedWork, quickLookFile)
        setQuickLookFile(null)
        return
      }

      window.dispatchEvent(new CustomEvent('jacpdf:openSharedDoc', {
        detail: {
          documentId: quickLookFile.id,
          name: quickLookFile.name,
          readOnly: !isTeacher && selectedWorkDone,
        },
      }))
      setQuickLookFile(null)
      return
    }

    alert("L'ouverture Google Drive depuis Classroom arrive bientôt. Pour l'instant, l'aperçu reste disponible ici.")
  }, [handleCreateStudentAttachmentCopy, isTeacher, quickLookFile, selectedWork, selectedWorkDone])

  const getAttachmentDocumentIdsBySource = useCallback((attachments = [], source) => (
    (attachments || [])
      .filter((attachment) => attachment?.source === source)
      .map((attachment) => attachment?.documentId || attachment?.document_id || attachment?.id)
      .filter(Boolean)
  ), [])

  const broadcastClassroomReadOnly = useCallback((app, documentId, readOnly) => {
    const detail = { documentId, readOnly }

    if (app === 'jacdoc') {
      window.dispatchEvent(new CustomEvent('jacsuite:setJacDocClassroomReadOnly', { detail }))

      try {
        localStorage.setItem(
          `jacdoc_classroom_readonly:${documentId}`,
          JSON.stringify({ ...detail, updatedAt: Date.now() }),
        )
      } catch {
        // localStorage indisponible.
      }

      try {
        const channel = new BroadcastChannel('jacdoc-classroom-readonly')
        channel.postMessage(detail)
        channel.close()
      } catch {
        // BroadcastChannel indisponible.
      }

      return
    }

    window.dispatchEvent(new CustomEvent('jacpdf:setClassroomReadOnly', { detail }))

    try {
      localStorage.setItem(
        `jacpdf_classroom_readonly:${documentId}`,
        JSON.stringify({ ...detail, updatedAt: Date.now() }),
      )
    } catch {
      // localStorage indisponible.
    }

    try {
      const channel = new BroadcastChannel('jacpdf-classroom-readonly')
      channel.postMessage(detail)
      channel.close()
    } catch {
      // BroadcastChannel indisponible.
    }
  }, [])

  const setClassroomDocumentReadOnly = useCallback((attachments = [], readOnly) => {
    getAttachmentDocumentIdsBySource(attachments, 'jacpdf-cloud').forEach((documentId) => {
      broadcastClassroomReadOnly('jacpdf', documentId, readOnly)
    })

    getAttachmentDocumentIdsBySource(attachments, 'jacdoc-cloud').forEach((documentId) => {
      broadcastClassroomReadOnly('jacdoc', documentId, readOnly)
    })
  }, [broadcastClassroomReadOnly, getAttachmentDocumentIdsBySource])

  useEffect(() => {
    if (isTeacher || !selectedWork?.id) return
    setClassroomDocumentReadOnly(selectedStudentSubmissionAttachments, selectedWorkDone)
  }, [isTeacher, selectedStudentSubmissionAttachments, selectedWork?.id, selectedWorkDone, setClassroomDocumentReadOnly])

  const handleSubmitStudentWork = useCallback(async (work, attachments = []) => {
    await submitStudentWork(work, attachments)
    setClassroomDocumentReadOnly(attachments, true)
  }, [setClassroomDocumentReadOnly, submitStudentWork])

  const handleUnsubmitStudentWork = useCallback(async (work) => {
    const attachments = selectedStudentSubmissionAttachments || []
    await unsubmitStudentWork(work)
    setClassroomDocumentReadOnly(attachments, false)
  }, [selectedStudentSubmissionAttachments, setClassroomDocumentReadOnly, unsubmitStudentWork])

  const handleJoinSubmit = async () => {
    const code = joinCode.trim()

    if (!code) {
      setJoinError('Saisis un code de classe.')
      return
    }

    const result = await joinClassroomByCode(code, {
      userId: myUserId || `anon-${Date.now()}`,
      name: myName,
      email: user?.email || '',
    })

    if (!result?.ok) {
      if (result?.reason === 'not_found') {
        setJoinError(result.message || "Aucune classe trouvée avec ce code. Vérifie auprès de ton enseignant.")
      } else if (result?.reason === 'missing_code') {
        setJoinError('Saisis un code de classe.')
      } else {
        setJoinError('Code invalide. Réessaye.')
      }
      return
    }

    setView('class')
    setJoinModalOpen(false)
    setJoinCode('')
    setJoinError(null)
  }

  const handleCreateCourse = () => {
    const name = createCourseForm.name.trim()

    if (!name) {
      setCreateCourseError('Donne un nom à la classe.')
      return
    }

    if (editingCourseId) {
      updateClassroom(editingCourseId, {
        name,
        subject: createCourseForm.subject.trim(),
        group: createCourseForm.group.trim(),
      })

      setCreateCourseForm(COURSE_DEFAULTS)
      setCreateCourseError(null)
      setEditingCourseId(null)
      setCreateCourseModalOpen(false)
      return
    }

    const next = createClassroom({
      name,
      subject: createCourseForm.subject.trim(),
      group: createCourseForm.group.trim(),
      teacherId: myUserId,
      teacherName: myName,
    })

    const created = next?.classrooms?.[next.classrooms.length - 1]

    if (created) {
      setActiveClassroom(created.id)
      setView('class')
    }

    setCreateCourseForm(COURSE_DEFAULTS)
    setCreateCourseError(null)
    setCreateCourseModalOpen(false)
  }

  const openEditCurrentCourse = () => {
    if (!current) return

    setCreateCourseForm({
      name: current.name || '',
      subject: current.subject || '',
      group: current.group || '',
    })

    setCreateCourseError(null)
    setEditingCourseId(current.id)
    setCreateCourseModalOpen(true)
    setClassMenuOpen(false)
  }

  const deleteCurrentCourse = () => {
    if (!current) return

    deleteClassroom(current.id)
    setClassMenuOpen(false)
    setView('home')
  }

  const onCopyCode = async () => {
    if (!current?.code) return

    try {
      await navigator.clipboard?.writeText(current.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard non disponible.
    }
  }

  const renderWorkRow = (work) => (
    <ClassroomWorkRow
      key={work.id}
      work={work}
      isTeacher={isTeacher}
      isExpanded={expandedWorkId === work.id}
      instructionsVisible={instructionsOpenWorkIds[work.id] ?? true}
      workMenuOpen={workMenuId === work.id}
      getDueInfo={getDueInfo}
      getAssignedStudentCount={getAssignedStudentCount}
      openWorkDetail={openWorkDetail}
      openAttachmentPreview={openAttachmentPreview}
      editWork={editWork}
      deleteWork={deleteWork}
      toggleWorkExpanded={toggleWorkExpanded}
      toggleWorkMenu={toggleWorkMenu}
      toggleWorkInstructions={toggleWorkInstructions}
    />
  )

  return (
    <div className="cpp-tab-root">
      <div className="cpp-shell" role="region" aria-label="JacSuite Classroom">
        <ClassroomAppBar
          current={current}
          view={view}
          isTeacher={isTeacher}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          setView={setView}
          classMenuOpen={classMenuOpen}
          setClassMenuOpen={setClassMenuOpen}
          tasksPanelOpen={tasksPanelOpen}
          setTasksPanelOpen={setTasksPanelOpen}
          submissionsPanelOpen={submissionsPanelOpen}
          setSubmissionsPanelOpen={setSubmissionsPanelOpen}
          notificationsPanelOpen={notificationsPanelOpen}
          setNotificationsPanelOpen={setNotificationsPanelOpen}
          notificationCount={notificationItems.length}
          myAvatarUrl={myAvatarUrl}
          myName={myName}
          homeAvatarInitial={homeAvatarInitial}
          setShowSettings={setShowSettings}
          openEditCurrentCourse={openEditCurrentCourse}
          deleteCurrentCourse={deleteCurrentCourse}
        />

        <div className={`cpp-body${drawerOpen ? ' is-sidebar-expanded' : ''}`}>
          <ClassroomSidebar
            classrooms={classrooms}
            current={current}
            view={view}
            setView={setView}
            setActiveClassroom={setActiveClassroom}
          />

          <main className="cpp-main">
            {view === 'home' ? (
              <ClassroomHome
                classrooms={classrooms}
                current={current}
                isTeacher={isTeacher}
                addMenuOpen={addMenuOpen}
                setAddMenuOpen={setAddMenuOpen}
                cardMenuClassroomId={cardMenuClassroomId}
                setCardMenuClassroomId={setCardMenuClassroomId}
                setActiveClassroom={setActiveClassroom}
                setView={setView}
                setJoinCode={setJoinCode}
                setJoinError={setJoinError}
                setJoinModalOpen={setJoinModalOpen}
                setCreateCourseForm={setCreateCourseForm}
                setCreateCourseError={setCreateCourseError}
                setEditingCourseId={setEditingCourseId}
                setCreateCourseModalOpen={setCreateCourseModalOpen}
                deleteClassroom={deleteClassroom}
              />
            ) : !current ? (
              <div className="cpp-empty">
                <div className="cpp-empty-emoji">🏫</div>
                <h3>Aucune classe sélectionnée</h3>
                <p>
                  {isTeacher
                    ? 'Crée une classe depuis Paramètres › École.'
                    : 'Rejoins une classe avec son code dans Paramètres › École.'}
                </p>
              </div>
            ) : (
              <>
                <ClassroomTabs tab={tab} setTab={handleTabChange} />

                {tab === 'stream' && (
                  <ClassroomStream
                    current={current}
                    showCode={showCode}
                    copied={copied}
                    dueWorkItems={dueWorkItems}
                    announcementDrafts={announcementDrafts}
                    announcements={announcements}
                    isTeacher={isTeacher}
                    myUserId={myUserId}
                    draft={draft}
                    composerOpen={composerOpen}
                    composerMenuOpen={composerMenuOpen}
                    scheduleModalOpen={scheduleModalOpen}
                    scheduleAt={scheduleAt}
                    composerEditorRef={composerEditorRef}
                    editingAnnouncementId={editingAnnouncementId}
                    editAnnouncementDraft={editAnnouncementDraft}
                    announcementMenuId={announcementMenuId}
                    setShowCode={setShowCode}
                    onCopyCode={onCopyCode}
                    setTab={handleTabChange}
                    openWorkDetail={openWorkDetail}
                    setDraft={setDraft}
                    setComposerOpen={setComposerOpen}
                    setComposerMenuOpen={setComposerMenuOpen}
                    setScheduleModalOpen={setScheduleModalOpen}
                    setScheduleAt={setScheduleAt}
                    setAnnouncementMenuId={setAnnouncementMenuId}
                    setEditAnnouncementDraft={setEditAnnouncementDraft}
                    openDraftAnnouncement={openDraftAnnouncement}
                    applyComposerCommand={applyComposerCommand}
                    postAnnouncement={postAnnouncement}
                    saveAnnouncementDraft={saveAnnouncementDraft}
                    scheduleAnnouncement={scheduleAnnouncement}
                    startEditAnnouncement={startEditAnnouncement}
                    cancelEditAnnouncement={cancelEditAnnouncement}
                    saveAnnouncementEdit={saveAnnouncementEdit}
                    deleteAnnouncement={deleteAnnouncement}
                  />
                )}

                {tab === 'classwork' && (
                  <ClassroomClasswork
                    isTeacher={isTeacher}
                    classFiles={classFiles}
                    assignmentDrafts={assignmentDrafts}
                    topicGroups={topicGroups}
                    ungroupedFiles={ungroupedFiles}
                    collapsedTopicIds={collapsedTopicIds}
                    topicMenuId={topicMenuId}
                    createMenuOpen={createMenuOpen}
                    setCreateMenuOpen={setCreateMenuOpen}
                    setEditorMode={setEditorMode}
                    setTopicModalOpen={setTopicModalOpen}
                    setTopicMenuId={setTopicMenuId}
                    toggleTopicCollapsed={toggleTopicCollapsed}
                    renameTopic={renameTopic}
                    deleteTopic={deleteTopic}
                    openAssignmentDraft={openAssignmentDraft}
                    renderWorkRow={renderWorkRow}
                  />
                )}

                {tab === 'people' && (
                  <ClassroomPeople current={current} />
                )}
              </>
            )}
          </main>
        </div>

        <AssignmentEditor
          editorMode={editorMode}
          current={current}
          assignmentForm={assignmentForm}
          selectedStudents={selectedStudents}
          audienceOpen={audienceOpen}
          importMenuOpen={importMenuOpen}
          attachmentShareMenuId={attachmentShareMenuId}
          classTopics={classTopics}
          setAssignmentForm={setAssignmentForm}
          setSelectedStudents={setSelectedStudents}
          setAudienceOpen={setAudienceOpen}
          setImportMenuOpen={setImportMenuOpen}
          setCloudPickerOpen={setCloudPickerOpen}
          setJacdocCloudPickerOpen={setJacdocCloudPickerOpen}
          setDrivePickerOpen={setDrivePickerOpen}
          setAttachmentShareMenuId={setAttachmentShareMenuId}
          submitAssignment={submitAssignment}
          saveAssignmentDraft={saveAssignmentDraft}
          scheduleAssignment={scheduleAssignment}
          resetAssignmentEditor={resetAssignmentEditor}
          removeAssignmentAttachment={removeAssignmentAttachment}
          updateAssignmentAttachmentShareMode={updateAssignmentAttachmentShareMode}
        />

        <ClassroomWorkDetailPage
          selectedWork={view === 'class' && tab === 'classwork' ? selectedWork : null}
          isTeacher={isTeacher}
          myUserId={myUserId}
          myName={myName}
          selectedWorkAttachments={selectedWorkAttachments}
          classroomStudents={current?.students || []}
          selectedWorkSubmission={selectedWorkSubmission}
          selectedWorkStatus={selectedWorkStatus}
          selectedWorkDone={selectedWorkDone}
          selectedWorkSubmittedCount={selectedWorkSubmittedCount}
          selectedWorkSubmissions={selectedWorkSubmissions}
          selectedClassComments={selectedClassComments}
          selectedPrivateComments={selectedPrivateComments}
          studentSubmissionAttachments={selectedStudentSubmissionAttachments}
          classCommentDraft={classCommentDraft}
          privateCommentDraft={privateCommentDraft}
          setSelectedWorkId={setSelectedWorkId}
          setClassCommentDraft={setClassCommentDraft}
          setPrivateCommentDraft={setPrivateCommentDraft}
          openAttachmentPreview={openAttachmentPreview}
          openStudentDrivePicker={() => setStudentDrivePickerOpen(true)}
          openStudentCloudPicker={() => setStudentCloudPickerOpen(true)}
          openStudentJacdocCloudPicker={() => setStudentJacdocCloudPickerOpen(true)}
          openStudentLocalFilePicker={() => studentLocalFileInputRef.current?.click()}
          removeStudentSubmissionAttachment={removeStudentSubmissionAttachment}
          createStudentAttachmentCopy={handleCreateStudentAttachmentCopy}
          submitStudentWork={handleSubmitStudentWork}
          unsubmitStudentWork={handleUnsubmitStudentWork}
          updateSubmissionDraft={updateSubmissionDraft}
          returnSubmissionWithGrade={returnSubmissionWithGrade}
          postWorkComment={postWorkComment}
          renderComment={renderComment}
        />

        <ClassroomPanels
          tasksPanelOpen={tasksPanelOpen}
          notificationsPanelOpen={notificationsPanelOpen}
          submissionsPanelOpen={submissionsPanelOpen}
          isTeacher={isTeacher}
          dueWorkItems={dueWorkItems}
          notificationItems={notificationItems}
          submissionDashboardRows={submissionDashboardRows}
          setTasksPanelOpen={setTasksPanelOpen}
          setNotificationsPanelOpen={setNotificationsPanelOpen}
          setSubmissionsPanelOpen={setSubmissionsPanelOpen}
        />

        <JoinCourseModal
          open={joinModalOpen}
          joinCode={joinCode}
          joinError={joinError}
          setJoinCode={setJoinCode}
          setJoinError={setJoinError}
          setJoinModalOpen={setJoinModalOpen}
          handleJoinSubmit={handleJoinSubmit}
        />

        <CreateCourseModal
          open={createCourseModalOpen}
          editingCourseId={editingCourseId}
          createCourseForm={createCourseForm}
          createCourseError={createCourseError}
          setCreateCourseForm={setCreateCourseForm}
          setCreateCourseError={setCreateCourseError}
          setEditingCourseId={setEditingCourseId}
          setCreateCourseModalOpen={setCreateCourseModalOpen}
          handleCreateCourse={handleCreateCourse}
        />

        <TopicModal
          open={topicModalOpen}
          topicName={topicName}
          setTopicName={setTopicName}
          setTopicModalOpen={setTopicModalOpen}
          createTopic={createTopic}
        />

        {cloudPickerOpen && (
          <JacpdfCloudFilePicker
            open={cloudPickerOpen}
            onClose={() => setCloudPickerOpen(false)}
            onSelect={addAssignmentCloudFile}
          />
        )}

        {jacdocCloudPickerOpen && (
          <JacdocCloudFilePicker
            open={jacdocCloudPickerOpen}
            onClose={() => setJacdocCloudPickerOpen(false)}
            onSelect={addAssignmentJacdocCloudFile}
          />
        )}

        {drivePickerOpen && (
          <DriveFilePicker
            open={drivePickerOpen}
            onClose={() => setDrivePickerOpen(false)}
            onSelect={addAssignmentDriveFile}
          />
        )}

        <input
          ref={studentLocalFileInputRef}
          type="file"
          onChange={handleStudentLocalFileChange}
          hidden
        />

        {studentCloudPickerOpen && (
          <JacpdfCloudFilePicker
            open={studentCloudPickerOpen}
            onClose={() => setStudentCloudPickerOpen(false)}
            onSelect={(file) => addStudentSubmissionAttachment(file, 'jacpdf-cloud')}
          />
        )}

        {studentJacdocCloudPickerOpen && (
          <JacdocCloudFilePicker
            open={studentJacdocCloudPickerOpen}
            onClose={() => setStudentJacdocCloudPickerOpen(false)}
            onSelect={(file) => addStudentSubmissionAttachment(file, 'jacdoc-cloud')}
          />
        )}

        {studentDrivePickerOpen && (
          <DriveFilePicker
            open={studentDrivePickerOpen}
            onClose={() => setStudentDrivePickerOpen(false)}
            onSelect={(file) => addStudentSubmissionAttachment(file, 'google-drive')}
          />
        )}

        {quickLookFile && (
          <JacpdfCloudQuickLook
            file={quickLookFile}
            onClose={() => setQuickLookFile(null)}
            onOpen={openQuickLookInEditor}
            loadBytes={loadClassroomPreviewBytes}
          />
        )}

        {showSettings && (
          <Settings
            open={showSettings}
            onClose={() => setShowSettings(false)}
            appName="Classe"
          />
        )}
      </div>
    </div>
  )
}